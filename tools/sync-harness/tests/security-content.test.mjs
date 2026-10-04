// Pre-beta security audit, sections L + M: content injection, imports,
// uploads and object storage — against the REAL readers, route handlers,
// server libraries and SQL (Rune 2.0 schema in PGlite + RLS, bytes in an
// in-memory store). Conceptual payloads only; nothing here is destructive.
//
//   * Manuscript Import: size limits, malformed and hostile archives
//     (traversal names, high-ratio entries, lying central directories),
//     HTML in .md/.docx/.txt stays literal text, the confirmed payload can
//     only ever become paragraph/blockquote/text/hardBreak nodes with the
//     four inline marks, and the route refuses oversize bodies.
//   * Attachments: declared type must match the bytes (HTML or SVG named as
//     PNG is refused, nothing stored), the display derivative is held to the
//     same rule, a client calling create_workspace_attachment directly (055)
//     cannot register foreign keys / non-image types / other buckets, the
//     serve path only ever answers with an accepted image type (never what a
//     mislabeled object claims) under nosniff + a sandboxing CSP, and
//     another writer or a signed-out request never gets the bytes.
//   * Rendering: ProseSnapshot escapes user text and renders no link; the
//     editor's Link mark refuses javascript:/data: hrefs on render.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import esbuild from 'esbuild';
import { pathToFileURL } from 'node:url';
import { createTestDb, readRepoFile, LEGACY_BASELINE, RUNE2_SCHEMA, HARNESS_DIR, REPO_DIR } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';
import { prototypeLegacyToRune2 } from '../lib/legacy-to-rune2.mjs';
import { USERS, projectId, seedFixture } from '../fixtures/manuscript-fixture.mjs';
import { buildDocx, documentXml, zip } from '../lib/docx-fixture.mjs';

const ALICE = USERS.alice.id;
const BRAM = USERS.bram.id;
const HOLLOW = projectId('hollow');
const TIDE = projectId('tide');

const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const enc = (s) => new TextEncoder().encode(s);
const uuid = () => crypto.randomUUID();
const as = (db, userId) => createSupabaseAdapter(db, { userId });

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 15, 4, 0, 9, 251, 3, 253, 167, 69, 143, 68, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
const JPG = new Uint8Array([255, 216, 255, 224, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 255, 217]);
const HTML = enc('<!doctype html><html><body><script>alert(document.cookie)</script></body></html>');
const SVG = enc('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>');

let legacy, reader, structure, content, confirm, importRoute, tiptap, attachmentsLib, rules, uploadRoute, readRoute, storageMock, prose, link;
before(async () => {
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
  const storageAlias = { '@/lib/attachments/storage': path.join(HARNESS_DIR, 'mocks/attachmentStorage.js') };
  reader = await bundleForTest('src/lib/import/readFile.ts', { name: 'sec_read' });
  structure = await bundleForTest('src/lib/import/structure.ts', { name: 'sec_structure' });
  content = await bundleForTest('src/lib/import/content.ts', { name: 'sec_content' });
  confirm = await bundleForTest('src/lib/manuscriptImport.ts', { name: 'sec_confirm' });
  importRoute = await bundleForTest('src/app/api/manuscript-import/route.ts', { name: 'sec_import_route' });
  tiptap = await bundleForTest('tools/sync-harness/lib/tiptap-schema.mjs', { name: 'sec_tiptap' });
  attachmentsLib = await bundleForTest('src/lib/attachments/server.ts', { name: 'sec_attachments' });
  rules = await bundleForTest('src/lib/rune2/attachments.ts', { name: 'sec_rules' });
  uploadRoute = await bundleForTest('src/app/api/attachments/route.ts', { name: 'sec_upload_route', aliases: storageAlias });
  readRoute = await bundleForTest('src/app/api/attachments/[id]/route.ts', { name: 'sec_read_route', aliases: storageAlias });
  storageMock = await import(path.join(HARNESS_DIR, 'mocks/attachmentStorage.js'));
  // The read-only renderer and the editor's Link mark, bundled from the app with React's server renderer.
  const outfile = path.join(HARNESS_DIR, 'dist/tests/sec_render.mjs');
  await esbuild.build({
    stdin: {
      contents: [
        `export { ProseSnapshot } from "./src/components/rune2/ProseSnapshot.tsx";`,
        `export { renderToStaticMarkup } from "react-dom/server";`,
        `export { createElement } from "react";`,
        `export { isAllowedUri, Link } from "@tiptap/extension-link";`,
      ].join('\n'),
      resolveDir: REPO_DIR,
      loader: 'js',
    },
    bundle: true, platform: 'node', format: 'esm', outfile, absWorkingDir: REPO_DIR, jsx: 'automatic', logLevel: 'warning',
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  });
  prose = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
  link = prose;
});

async function seededDb() {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  await prototypeLegacyToRune2(legacy, db);
  return db;
}

/** Read → detect → plan → payload, exactly as the preview does. */
async function preview(fileName, bytes) {
  const parsed = await reader.parseImportFile(fileName, bytes);
  const lines = structure.detectLines(parsed);
  const plan = structure.buildPlan(lines, {}, parsed.suggestedTitle ?? reader.titleFromFileName(fileName));
  return { parsed, payload: structure.planPayload(plan, plan.title) };
}

/** Every node type and mark type in a TipTap document. */
function shapeOf(doc, types = new Set(), marks = new Set()) {
  types.add(doc.type);
  for (const m of doc.marks ?? []) marks.add(m.type);
  for (const c of doc.content ?? []) shapeOf(c, types, marks);
  return { types: [...types].sort(), marks: [...marks].sort() };
}
const SCENE_TYPES = ['blockquote', 'doc', 'hardBreak', 'paragraph', 'text'];
const SCENE_MARKS = ['bold', 'italic', 'strike', 'underline'];

/** All text of a document, in order. */
function textOf(doc) {
  let out = '';
  const walk = (n) => { if (n.type === 'text') out += n.text; for (const c of n.content ?? []) walk(c); };
  walk(doc);
  return out;
}

// ── 1. Import: file readers (run on the writer's device; the server never parses a file) ──

test('import: a file over 40 MB is refused before any parsing; an empty file too', async () => {
  const big = new Uint8Array(40 * 1024 * 1024 + 1);
  big[0] = 0x50; big[1] = 0x4b;
  await assert.rejects(reader.parseImportFile('big.docx', big), (e) => e instanceof reader.ImportFileError && /40 MB/.test(e.message));
  await assert.rejects(reader.parseImportFile('big.txt', big), /40 MB/);
  await assert.rejects(reader.parseImportFile('empty.md', new Uint8Array(0)), /empty/);
  await assert.rejects(reader.parseImportFile('shell.sh', enc('echo hi')), /\.docx, \.md and \.txt/);
  await assert.rejects(reader.parseImportFile('x.docx.exe', enc('PK')), /\.docx, \.md and \.txt/, 'the LAST extension decides, never an inner one');
});

test('import: malformed, truncated and lying archives fail with a clear error, never a hang or a crash', async () => {
  // A PK signature over garbage.
  await assert.rejects(reader.parseImportFile('x.docx', enc('PK\u0003\u0004 not really a zip')), reader.ImportFileError);
  // A central directory claiming 65,535 entries over a 4-entry archive.
  // word/document.xml first, so the first central-directory entry is the one the reader opens.
  const real = zip({ 'word/document.xml': documentXml(['Chapter One', 'It rained.']), '[Content_Types].xml': '<Types/>' });
  const lying = Buffer.from(real);
  lying.writeUInt16LE(0xffff, lying.length - 22 + 10);
  await assert.rejects(reader.parseImportFile('x.docx', new Uint8Array(lying)), (e) => e instanceof reader.ImportFileError && /too large|damaged/.test(e.message));
  // An entry whose local header offset points past the file.
  const dangling = Buffer.from(real);
  const cdStart = dangling.readUInt32LE(dangling.length - 22 + 16);
  dangling.writeUInt32LE(0x7fffffff, cdStart + 42);
  await assert.rejects(reader.parseImportFile('x.docx', new Uint8Array(dangling)), (e) => e instanceof reader.ImportFileError && /damaged/.test(e.message));
  // Truncated mid-way.
  await assert.rejects(reader.parseImportFile('x.docx', new Uint8Array(real.subarray(0, Math.floor(real.length / 2)))), reader.ImportFileError);
  // Password-protected (flag bit 0 on the entry).
  const locked = Buffer.from(real);
  locked.writeUInt16LE(1, cdStart + 8);
  await assert.rejects(reader.parseImportFile('x.docx', new Uint8Array(locked)), /password-protected/);
  // An unsupported compression method.
  const bzip = Buffer.from(real);
  bzip.writeUInt16LE(12, cdStart + 10);
  await assert.rejects(reader.parseImportFile('x.docx', new Uint8Array(bzip)), /compression Rune can’t read/);
  // No zip64, no encryption, no fs: nothing an archive names is ever written anywhere.
});

test('import: traversal entry names and odd file names are inert — entries are looked up by name only; nothing is written', async () => {
  const files = {
    '../../../etc/passwd': 'root:x:0:0',
    '/absolute/evil.txt': 'nope',
    'word/../word/document.xml': 'not the document',
    '[Content_Types].xml': '<Types/>',
    'word/document.xml': documentXml(['A quiet morning.']),
  };
  const parsed = await reader.parseImportFile('..\\..\\weird name <script>.docx', new Uint8Array(zip(files)));
  assert.equal(parsed.blocks.filter((b) => b.kind === 'paragraph' && !b.blank).length, 1);
  assert.equal(parsed.blocks[0].runs.join(''), 'A quiet morning.');
  assert.equal(reader.titleFromFileName('..\\..\\weird name <script>.docx'), '..\\..\\weird name <script>', 'the title is text; the SQL caps it at 200 characters and React escapes it');
});

test('import: a high-ratio (zip-bomb-shaped) entry is read within bounds and rejected as prose, never swallowing memory unbounded', async () => {
  // 12 MB of spaces deflates to ~12 KB: a 1000:1 entry. It inflates (the per-entry
  // cap is 256 MB, well above any real manuscript) and yields no text.
  const padding = ' '.repeat(12 * 1024 * 1024);
  const files = {
    '[Content_Types].xml': '<Types/>',
    'word/document.xml': `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${padding}</w:t></w:r></w:p></w:body></w:document>`,
  };
  const bomb = new Uint8Array(zip(files));
  assert.ok(bomb.length < 64 * 1024, `the archive is small (${bomb.length} bytes)`);
  const t0 = Date.now();
  await assert.rejects(reader.parseImportFile('bomb.docx', bomb), /couldn’t find any text/);
  assert.ok(Date.now() - t0 < 20_000, 'bounded time');
  // Thousands of tiny entries: the central directory walk is linear and cheap.
  const many = { 'word/document.xml': documentXml(['One line.']) };
  for (let i = 0; i < 5000; i++) many[`junk/${i}.bin`] = 'x';
  const parsed = await reader.parseImportFile('many.docx', new Uint8Array(zip(many, { store: true })));
  assert.equal(parsed.blocks[0].runs.join(''), 'One line.');
});

test('import: HTML, script and event-handler text in .md, .docx and .txt stays literal text and becomes text nodes only', async () => {
  const hostile = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<svg onload=alert(1)>',
    '<a href="javascript:alert(1)">click</a>',
    '[link](javascript:alert(1))',
    '![img](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
    '&lt;b&gt;entity&lt;/b&gt;',
  ];
  const md = `# Chapter One\n\n${hostile.join('\n\n')}\n`;
  const txt = hostile.join('\n\n');
  const docx = buildDocx(hostile);
  for (const [name, bytes] of [['h.md', enc(md)], ['h.txt', enc(txt)], ['h.docx', docx]]) {
    const { payload } = await preview(name, bytes);
    const rows = confirm.importRows(payload);
    const docs = [];
    const walk = (items) => { for (const i of items) { if (i.kind === 'chapter') docs.push(...i.scenes.map((s) => s.content)); else walk(i.items); } };
    walk(rows.manuscript.items);
    docs.push(...rows.manuscript.unplaced.map((s) => s.content));
    assert.ok(docs.length >= 1, name);
    const all = docs.map(textOf).join('\n');
    for (const h of hostile.slice(0, 4)) assert.ok(all.includes(h), `${name}: ${h} kept as text`);
    for (const d of docs) {
      const shape = shapeOf(d);
      assert.ok(shape.types.every((t) => SCENE_TYPES.includes(t)), `${name}: only ${SCENE_TYPES} (got ${shape.types})`);
      assert.ok(shape.marks.every((m) => SCENE_MARKS.includes(m)), `${name}: no link/other marks (got ${shape.marks})`);
      tiptap.editorDocument(d); // the editor's own schema accepts it
    }
  }
  // Markdown: a link's URL is never carried over as a mark; only its text is.
  const { payload } = await preview('l.md', enc('# One\n\nSee [the site](javascript:alert(1)) now.'));
  const doc = confirm.importRows(payload).manuscript.items[0].scenes[0].content;
  assert.deepEqual(shapeOf(doc).marks, []);
});

// ── 2. Import: the confirmed payload on the server ─────────────────────────────

test('import: the server builds documents from runs only — unknown items, node-shaped objects, bad mark flags and oversize payloads are refused', async () => {
  const good = { title: 'T', items: [{ kind: 'chapter', title: 'One', scenes: [{ title: null, paragraphs: [['Hello ', ['world', 1]]] }] }], unplaced: [] };
  const built = confirm.importRows(good);
  assert.deepEqual(shapeOf(built.manuscript.items[0].scenes[0].content), { types: ['doc', 'paragraph', 'text'], marks: ['bold'] });
  const bad = [
    { ...good, items: [{ kind: 'html', html: '<script>' }] },
    { ...good, items: [{ kind: 'chapter', title: 'One', scenes: [{ title: null, paragraphs: [{ type: 'image', attrs: { src: 'x', onerror: 'alert(1)' } }] }] }] },
    { ...good, items: [{ kind: 'chapter', title: 'One', scenes: [{ title: null, paragraphs: [[['x', 16]]] }] }] },
    { ...good, items: [{ kind: 'chapter', title: 'One', scenes: [{ title: null, paragraphs: [[['x', -1]]] }] }] },
    { ...good, items: [{ kind: 'chapter', title: 'One', scenes: [{ title: null, paragraphs: [[{ text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:1' } }] }]] }] }] },
    { ...good, items: [{ kind: 'chapter', title: { toString: () => 'x' }, scenes: [] }] },
    { ...good, unplaced: [{ title: ['a'], paragraphs: [] }] },
    { ...good, items: 'nope' },
    null,
  ];
  for (const p of bad) assert.throws(() => confirm.importRows(p), `refused: ${JSON.stringify(p)?.slice(0, 80)}`);
  // The paragraph budget (400,000) is enforced before anything is built.
  const scenes = Array.from({ length: 5 }, () => ({ title: null, paragraphs: Array.from({ length: 80_001 }, () => ['a']) }));
  assert.throws(() => confirm.importRows({ ...good, items: [{ kind: 'chapter', title: 'Huge', scenes }] }));
  // The route: an oversize body is 413 before it is read; a non-JSON body is 400.
  const db = await seededDb();
  importRoute.setServerClient(as(db, ALICE));
  const big = await importRoute.POST(new Request('http://rune.test/x', { method: 'POST', headers: { 'content-length': String(4 * 1024 * 1024 + 1) }, body: '{}' }));
  assert.equal(big.status, 413);
  const deep = await importRoute.POST(new Request('http://rune.test/x', { method: 'POST', body: JSON.stringify({ payload: good, requestId: 'not-a-uuid' }) }));
  assert.equal(deep.status, 200, await deep.text());
  // Deeply nested groups never crash the process: either refused or created, never an unhandled throw.
  // (Built as a string: JSON.stringify itself cannot nest this deep; JSON.parse can.)
  const depth = 20_000;
  const deepBody = `{"payload":{"title":"Deep","items":[${'{"kind":"group","title":null,"items":['.repeat(depth)}{"kind":"chapter","title":"Leaf","scenes":[{"title":null,"paragraphs":[["x"]]}]}${']}'.repeat(depth)}],"unplaced":[]},"requestId":"${uuid()}"}`;
  const res = await importRoute.POST(new Request('http://rune.test/x', { method: 'POST', body: deepBody }));
  assert.ok([200, 422].includes(res.status), String(res.status));
  // SQL caps: a title over 200 characters is refused by import_manuscript_checked itself.
  const r = await as(db, ALICE).rpc('import_manuscript_checked', { p_title: 'x'.repeat(201), p_manuscript: { items: [], unplaced: [{ title: null, content: { type: 'doc', content: [{ type: 'paragraph' }] }, word_count: 0 }] }, p_request_id: null });
  assert.equal(r.data?.status, 'error', JSON.stringify(r));
});

// ── 3. Attachments: uploads, registration, serving ─────────────────────────────

test('attachments: the declared type must match the bytes — HTML or SVG named as an image is refused and nothing is stored', async () => {
  const db = await seededDb();
  const sb = as(db, ALICE);
  const store = new attachmentsLib.MemoryAttachmentStorage();
  for (const [mimeType, bytes] of [['image/png', HTML], ['image/jpeg', HTML], ['image/gif', SVG], ['image/webp', SVG], ['image/png', JPG], ['image/jpeg', PNG], ['image/svg+xml', SVG], ['text/html', HTML]]) {
    const r = await attachmentsLib.storeImageAttachment(sb, store, { projectId: HOLLOW, fileName: 'x.png', mimeType, bytes, width: 1, height: 1 });
    assert.equal(r.error !== null, true, `${mimeType}: refused`);
    assert.equal(r.status, 415, `${mimeType}: 415`);
  }
  // The display derivative: an HTML body typed text/html (or typed image/jpeg over HTML bytes) is refused with the original.
  for (const display of [{ bytes: HTML, mimeType: 'text/html' }, { bytes: HTML, mimeType: 'image/jpeg' }, { bytes: SVG, mimeType: 'image/svg+xml' }]) {
    const r = await attachmentsLib.storeImageAttachment(sb, store, { projectId: HOLLOW, fileName: 'x.png', mimeType: 'image/png', bytes: PNG, width: 2000, height: 2000, display: { ...display, width: 1600, height: 1600 } });
    assert.equal(r.status, 415, `display ${display.mimeType}: refused`);
  }
  assert.equal(store.objects.size, 0, 'nothing stored');
  assert.equal((await one(db, `select count(*)::int as n from public.workspace_attachments`)).n, 0);
  // Real images pass, with the signatures the browser gives them.
  for (const [mimeType, bytes] of [['image/png', PNG], ['image/jpeg', JPG], ['image/gif', enc('GIF89a\u0001\u0000\u0001\u0000')], ['image/webp', enc('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ')]]) {
    const r = await attachmentsLib.storeImageAttachment(sb, store, { projectId: HOLLOW, fileName: 'x', mimeType, bytes, width: 1, height: 1 });
    assert.equal(r.error, null, `${mimeType}: ${r.error}`);
  }
  // Through the route, as the browser sends it.
  uploadRoute.setServerClient(sb);
  storageMock.memory.objects.clear();
  const form = new FormData();
  form.set('projectId', HOLLOW);
  form.set('file', new File([HTML], 'evil.png', { type: 'image/png' }));
  form.set('width', '1'); form.set('height', '1');
  const res = await uploadRoute.POST(new Request('http://rune.test/api/attachments', { method: 'POST', body: form }));
  assert.equal(res.status, 415);
  assert.equal(storageMock.memory.objects.size, 0);
  const form2 = new FormData();
  form2.set('projectId', HOLLOW);
  form2.set('file', new File([PNG], 'ok.png', { type: 'image/png' }));
  form2.set('width', '3000'); form2.set('height', '3000');
  form2.set('display', new Blob([HTML], { type: 'text/html' }), 'display');
  form2.set('displayWidth', '1600'); form2.set('displayHeight', '1600');
  const res2 = await uploadRoute.POST(new Request('http://rune.test/api/attachments', { method: 'POST', body: form2 }));
  assert.equal(res2.status, 415, 'an HTML display derivative is refused with its original');
  assert.equal(storageMock.memory.objects.size, 0);
  // Declared oversize body: 413 before the form is read.
  const res3 = await uploadRoute.POST(new Request('http://rune.test/api/attachments', { method: 'POST', headers: { 'content-length': String(rules.MAX_IMAGE_BYTES * 3) }, body: form2 }));
  assert.equal(res3.status, 413);
});

test('attachments (055): a signed-in client calling create_workspace_attachment around the route cannot register foreign keys, other buckets, non-image types or impossible sizes', async () => {
  const db = await seededDb();
  const alice = as(db, ALICE);
  const bram = as(db, BRAM);
  const store = new attachmentsLib.MemoryAttachmentStorage();
  const theirs = (await attachmentsLib.storeImageAttachment(bram, store, { projectId: TIDE, fileName: 'theirs.png', mimeType: 'image/png', bytes: PNG, width: 1, height: 1, display: { bytes: JPG, mimeType: 'image/jpeg', width: 1, height: 1 } })).data;
  const id = uuid();
  const base = {
    p_id: id, p_project_id: HOLLOW, p_kind: 'image', p_file_name: 'x.png', p_mime_type: 'image/png', p_byte_size: PNG.length, p_width: 1, p_height: 1,
    p_storage_bucket: rules.ATTACHMENT_BUCKET, p_storage_key: `${HOLLOW}/${id}/original.png`, p_display_key: null, p_display_width: null, p_display_height: null,
  };
  const attempts = {
    'display key of another writer': { p_display_key: theirs.display_key, p_display_width: 1, p_display_height: 1 },
    'storage key of another writer': { p_storage_key: theirs.storage_key },
    'storage key under another project of mine': { p_storage_key: `${TIDE}/${id}/original.png` },
    'storage key under another id': { p_storage_key: `${HOLLOW}/${uuid()}/original.png` },
    'traversal in the key': { p_storage_key: `${HOLLOW}/${id}/../../${theirs.storage_key}` },
    'display key naming the original': { p_display_key: `${HOLLOW}/${id}/original.png`, p_display_width: 1, p_display_height: 1 },
    'display key without size': { p_display_key: `${HOLLOW}/${id}/display.jpg` },
    'another bucket': { p_storage_bucket: 'avatars' },
    'html type': { p_mime_type: 'text/html' },
    'svg type': { p_mime_type: 'image/svg+xml' },
    'another kind': { p_kind: 'document' },
    'zero bytes': { p_byte_size: 0 },
    'over the limit': { p_byte_size: rules.MAX_IMAGE_BYTES + 1 },
    'no dimensions': { p_width: 0 },
    "another writer's project": { p_project_id: TIDE },
  };
  for (const [name, patch] of Object.entries(attempts)) {
    const r = await alice.rpc('create_workspace_attachment', { ...base, ...patch });
    assert.equal(r.error, null, name);
    assert.equal(r.data?.status, 'error', `${name}: ${JSON.stringify(r.data)}`);
  }
  assert.equal((await one(db, `select count(*)::int as n from public.workspace_attachments where project_id = $1`, [HOLLOW])).n, 0, 'nothing registered');
  // The app's own shape still registers, and a retry of the same id is idempotent.
  const okRow = await alice.rpc('create_workspace_attachment', { ...base, p_display_key: `${HOLLOW}/${id}/display.jpg`, p_display_width: 1, p_display_height: 1 });
  assert.equal(okRow.data?.status, 'ok', JSON.stringify(okRow));
  const again = await alice.rpc('create_workspace_attachment', { ...base, p_mime_type: 'text/html' });
  assert.equal(again.data?.status, 'ok', 'a retry returns the row as it is — the stored type, not the retry’s');
  assert.equal(again.data.attachment.mime_type, 'image/png');
  // Anonymous: no execute.
  const anon = await createSupabaseAdapter(db, { userId: null }).rpc('create_workspace_attachment', base);
  assert.ok(anon.error, 'anon cannot call it');
});

test('attachments: the serve path answers only with an accepted image type under nosniff and a sandboxing CSP, and never to another writer or a signed-out request', async () => {
  const db = await seededDb();
  const alice = as(db, ALICE);
  storageMock.memory.objects.clear();
  uploadRoute.setServerClient(alice);
  readRoute.setServerClient(alice);
  const form = new FormData();
  form.set('projectId', HOLLOW);
  form.set('file', new File([PNG], '"><img src=x onerror=alert(1)>\r\nX-Injected: it\'s (a) *.png', { type: 'image/png' }));
  form.set('width', '1'); form.set('height', '1');
  const up = await uploadRoute.POST(new Request('http://rune.test/api/attachments', { method: 'POST', body: form }));
  const upText = await up.text();
  assert.equal(up.status, 200, upText);
  const { attachment } = JSON.parse(upText);
  const get = (id, q = '') => readRoute.GET(new Request(`http://rune.test/api/attachments/${id}${q}`), { params: Promise.resolve({ id }) });
  const res = await get(attachment.id);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('content-security-policy'), "default-src 'none'; sandbox");
  const disposition = res.headers.get('content-disposition');
  assert.match(disposition, /^inline; filename\*=UTF-8''[A-Za-z0-9%._-]+$/, `the file name is percent-encoded (RFC 5987 attr-char only), never raw: ${disposition}`);
  assert.ok(!/[\r\n"<>]/.test(disposition));
  // The store mislabels the object (say, a bucket edited by hand): the row's type wins, never text/html.
  const stored = storageMock.memory.objects.get(attachment.storage_key);
  storageMock.memory.objects.set(attachment.storage_key, { bytes: HTML, contentType: 'text/html' });
  const tampered = await get(attachment.id);
  assert.equal(tampered.headers.get('content-type'), 'image/png', 'served as the registered image type: with nosniff the browser renders no HTML');
  storageMock.memory.objects.set(attachment.storage_key, stored);
  // Direct library read with a row whose mime_type were somehow not an image: octet-stream, never active content.
  const svgRow = { ...attachment, mime_type: 'image/svg+xml' };
  const fakeSb = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: svgRow, error: null }) }) }) }) };
  const svgStore = { download: async () => ({ bytes: SVG, contentType: 'image/svg+xml' }) };
  const direct = await attachmentsLib.readAttachment(fakeSb, svgStore, attachment.id, 'original');
  assert.equal(direct.contentType, 'application/octet-stream');
  // Another writer: 404, never the bytes. Signed out: 401.
  readRoute.setServerClient(as(db, BRAM));
  assert.equal((await get(attachment.id)).status, 404);
  assert.equal((await get(attachment.id, '?variant=display')).status, 404);
  readRoute.setServerClient(createSupabaseAdapter(db, { userId: null }));
  assert.equal((await get(attachment.id)).status, 401);
  // The bytes are addressed by the server alone: no public URL, no signed URL, the bucket is private (storage.ts) —
  // the only URL a card ever uses is the owner-gated route.
  assert.equal(rules.attachmentUrl(attachment.id), `/api/attachments/${attachment.id}`);
});

// ── 4. Rendering ───────────────────────────────────────────────────────────────

test('rendering: ProseSnapshot escapes user text, renders no link, and ignores unknown node attributes', () => {
  const doc = {
    type: 'doc',
    content: [
      { type: 'paragraph', attrs: { onclick: 'alert(1)', class: 'x' }, content: [
        { type: 'text', text: '<img src=x onerror=alert(1)> & "quotes"', marks: [{ type: 'bold' }, { type: 'link', attrs: { href: 'javascript:alert(1)' } }] },
      ] },
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '</h1><script>alert(1)</script>' }] },
      { type: 'image', attrs: { src: 'javascript:alert(1)', onerror: 'alert(1)' } },
      { type: 'iframe', attrs: { srcdoc: '<script>alert(1)</script>' } },
      { type: 'mystery', content: [{ type: 'text', text: 'still shown' }] },
    ],
  };
  const html = prose.renderToStaticMarkup(prose.createElement(prose.ProseSnapshot, { content: doc, empty: null }));
  assert.ok(!/<(script|img|iframe|a)[\s>]|<[a-z0-9]+[^>]*\son(error|click)=|javascript:/i.test(html), html);
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;quotes&quot;'));
  assert.ok(html.includes('<strong>'), 'known marks render');
  assert.ok(html.includes('still shown'), 'an unknown block still shows its text');
  assert.ok(html.includes('&lt;/h1&gt;&lt;script&gt;'));
});

test('rendering: the editor’s Link mark (StarterKit) refuses javascript:, data: and vbscript: hrefs on parse and render', () => {
  for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'java\u0000script:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', 'vbscript:msgbox(1)', ' javascript:alert(1)']) {
    assert.ok(!link.isAllowedUri(bad), `refused: ${JSON.stringify(bad)}`);
  }
  for (const ok of ['https://example.org/x?y=1', 'mailto:a@b.c', '/relative', '#anchor', 'example.org']) assert.ok(link.isAllowedUri(ok), `allowed: ${ok}`);
  // A stored mark with a hostile href renders an empty href, never the payload.
  const ext = link.Link.configure({});
  const rendered = ext.config.renderHTML.call(
    { options: { ...ext.options, isAllowedUri: (url, ctx) => ctx.defaultValidate(url) }, parent: () => null },
    { HTMLAttributes: { href: 'javascript:alert(1)', target: '_blank' } }
  );
  assert.equal(rendered[0], 'a');
  assert.equal(rendered[1].href, '');
});
