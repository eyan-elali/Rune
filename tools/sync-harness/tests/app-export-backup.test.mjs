// Professional Export + Whole-Project Backup (Rune 2.0, Milestone 19): the
// REAL export pipeline (lib/export: loader, plan, DOCX / PDF / Markdown / TXT
// renderers) and the REAL backup (lib/backup + migration 041's
// read_project_backup) against the Rune 2.0 schema in real Postgres + RLS.
//
//   * scopes: Manuscript (order, titled Groups, Chapters, Scene breaks only
//     between Scenes, Unplaced excluded by default and clearly apart when
//     asked for, Trash and Revision Notes never), Chapter (only it, its
//     Scenes in order, a one-Scene Chapter reads as a Chapter), Scene (only
//     its prose, no title)
//   * formats: DOCX and Markdown and TXT are read back by Rune's own import
//     (the same marks, blank paragraphs, line breaks, headings, structure);
//     PDF is made by the real jsPDF and its drawn text inspected; Unicode is
//     kept (DOCX/MD/TXT) or predictably replaced and reported (PDF)
//   * backup: canonical ids, hierarchy and order, Unplaced, Trash (included
//     and marked), Scene properties, Revision Notes, History, Milestones,
//     Workspace Pages, Folders, Collections, Entries, properties, values,
//     Views, references, writing history; versioned manifest; no device
//     state; owner-checked (another writer gets nothing)
//   * scale: a ~100k-word manuscript of 40 Chapters and 600 Scenes (paged
//     reads past the row cap) exports in every format and backs up
//   * regression: exporting and backing up change no row anywhere — no Scene
//     version, writing session, History checkpoint, Milestone or Trash state
//
// Data: the synthetic legacy fixture moved into the Rune 2.0 schema. alice
// owns hollow: ch1 [h1a], ch2 [h2a], ch3 [h3a], ch5 [], ch4 [h4a, h4b (empty),
// h4c], ch6 [h6c]; Unplaced h3b, h3c, h6a, h6b. bram owns tide.
import 'fake-indexeddb/auto';
import { test, before, mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import zlib from 'node:zlib';
import { createTestDb, readRepoFile, LEGACY_BASELINE, RUNE2_SCHEMA, HARNESS_DIR } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';
import { prototypeLegacyToRune2 } from '../lib/legacy-to-rune2.mjs';
import { USERS, chapterId, pageId, projectId, seedFixture, markerFor, chapterTitleFor } from '../fixtures/manuscript-fixture.mjs';

const ALICE = USERS.alice.id;
const BRAM = USERS.bram.id;
const HOLLOW = projectId('hollow');
const CH = (n) => chapterId(`hollow.ch${n}`);
const S = (label) => pageId(label);
const TITLE = (n) => chapterTitleFor(`hollow.ch${n}`);

const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const all = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const ok = (r) => { assert.equal(r.error, null, JSON.stringify(r.error)); return r.data; };
const text = (t, ...marks) => (marks.length ? { type: 'text', text: t, marks: marks.map((type) => ({ type })) } : { type: 'text', text: t });
const para = (...content) => (content.length ? { type: 'paragraph', content } : { type: 'paragraph' });
const doc = (...content) => ({ type: 'doc', content });

let legacy;
let download, plan, formats, pdf, docx, md, txt, backup, importer, structureLib, zip, legacyExport;
let notes, scenes, structure, trash, milestones, pages, tree, collections, props, views, refs, sceneProps, sceneViews;
before(async () => {
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
  download = await bundleForTest('src/lib/export/download.ts', { name: 'xb_download' });
  plan = await bundleForTest('src/lib/export/plan.ts', { name: 'xb_plan' });
  formats = await bundleForTest('src/lib/export/formats.ts', { name: 'xb_formats' });
  pdf = await bundleForTest('src/lib/export/pdf.ts', { name: 'xb_pdf' });
  docx = await bundleForTest('src/lib/export/docx.ts', { name: 'xb_docx' });
  md = await bundleForTest('src/lib/export/markdown.ts', { name: 'xb_md' });
  txt = await bundleForTest('src/lib/export/text.ts', { name: 'xb_txt' });
  backup = await bundleForTest('src/lib/backup/projectBackup.ts', { name: 'xb_backup' });
  importer = await bundleForTest('src/lib/import/readFile.ts', { name: 'xb_import' });
  structureLib = await bundleForTest('src/lib/import/structure.ts', { name: 'xb_import_structure' });
  zip = await bundleForTest('src/lib/import/zip.ts', { name: 'xb_zip' });
  legacyExport = await bundleForTest('src/lib/export/projectExport.ts', {
    name: 'xb_projectExport', aliases: { jspdf: path.join(HARNESS_DIR, 'mocks/jspdf.js') },
  });
  notes = await bundleForTest('src/lib/actions/revisionNotes.ts', { name: 'xb_notes' });
  scenes = await bundleForTest('src/lib/actions/scenes.ts', { name: 'xb_scenes' });
  structure = await bundleForTest('src/lib/actions/structure.ts', { name: 'xb_structure' });
  trash = await bundleForTest('src/lib/actions/workspaceTrash.ts', { name: 'xb_trash' });
  milestones = await bundleForTest('src/lib/actions/manuscriptMilestones.ts', { name: 'xb_milestones' });
  pages = await bundleForTest('src/lib/actions/workspacePages.ts', { name: 'xb_pages' });
  tree = await bundleForTest('src/lib/actions/workspaceTree.ts', { name: 'xb_tree' });
  collections = await bundleForTest('src/lib/actions/workspaceCollections.ts', { name: 'xb_collections' });
  props = await bundleForTest('src/lib/actions/workspaceProperties.ts', { name: 'xb_props' });
  views = await bundleForTest('src/lib/actions/workspaceViews.ts', { name: 'xb_views' });
  refs = await bundleForTest('src/lib/actions/workspaceReferences.ts', { name: 'xb_refs' });
  sceneProps = await bundleForTest('src/lib/actions/sceneProperties.ts', { name: 'xb_scene_props' });
  sceneViews = await bundleForTest('src/lib/actions/sceneViews.ts', { name: 'xb_scene_views' });
});

async function seededDb() {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  await prototypeLegacyToRune2(legacy, db);
  signIn(db, ALICE);
  return db;
}

function signIn(db, userId) {
  const sb = createSupabaseAdapter(db, { userId });
  for (const mod of [notes, scenes, structure, trash, milestones, pages, tree, collections, props, views, refs, sceneProps, sceneViews]) {
    mod.setServerClient(sb);
  }
  return sb;
}
const as = (db, userId) => createSupabaseAdapter(db, { userId });

/** Every row of every public table — what "nothing changed" is checked against. */
async function everything(db) {
  const tables = (await all(db, `select tablename from pg_tables where schemaname = 'public' order by tablename`)).map((r) => r.tablename);
  const out = {};
  for (const t of tables) out[t] = await all(db, `select * from public."${t}" order by 1`);
  return JSON.stringify(out);
}

const setContent = (db, sceneId, content) =>
  db.query(`update public.scenes set content = $2 where id = $1`, [sceneId, JSON.stringify(content)]);

/** The plan's structure, as a readable sequence. */
function outline(document) {
  return document.blocks.map((b) => {
    if (b.kind === 'title') return `title:${b.text}`;
    if (b.kind === 'heading') return `${b.role}${b.level}${b.newPage ? '^' : ''}:${b.text}`;
    if (b.kind === 'sceneBreak') return '***';
    const words = JSON.stringify(b.blocks);
    const marker = words.match(/fixture-marker-([a-z0-9]+)/);
    return marker ? marker[1] : 'prose';
  });
}

async function exportOf(db, scope, userId = ALICE, projectIdArg = HOLLOW) {
  const source = await plan.loadExportSource(as(db, userId), projectIdArg, scope);
  return plan.planExport(source, scope);
}

/** Part A, Part A.1 [ch1], ch2 in Part A; Part B [ch4]; an untitled Group [ch6]; ch3, ch5 at the top level. */
async function withGroups(db) {
  const a = ok(await structure.createGroup(HOLLOW, 'Part A'));
  const a1 = ok(await structure.createGroup(HOLLOW, 'Part A.1', a.id));
  const b = ok(await structure.createGroup(HOLLOW, 'Part B'));
  const untitled = ok(await structure.createGroup(HOLLOW, null));
  ok(await structure.moveChapter(CH(1), a1.id, null, HOLLOW));
  ok(await structure.moveChapter(CH(2), a.id, null, HOLLOW));
  ok(await structure.moveChapter(CH(4), b.id, null, HOLLOW));
  ok(await structure.moveChapter(CH(6), untitled.id, null, HOLLOW));
  return { a, a1, b, untitled };
}

// ── 1. Manuscript export ─────────────────────────────────────────────────────

test('Manuscript export: title, then every Chapter with placed Scenes in reading order; breaks only between Scenes; Unplaced, Trash and Revision Notes never', async () => {
  const db = await seededDb();
  await notes.createRevisionNote(randomUUID(), 'scene', S('h1a'), 'REVISION NOTE TEXT');
  await notes.createRevisionNote(randomUUID(), 'chapter', CH(4), 'CHAPTER NOTE TEXT');
  const document = await exportOf(db, { kind: 'manuscript' });
  assert.deepEqual(outline(document), [
    `title:${document.projectTitle}`,
    `chapter1^:${TITLE(1)}`, 'h1a', // the title is a page of its own
    `chapter1^:${TITLE(2)}`, 'h2a',
    `chapter1^:${TITLE(3)}`, 'h3a', // h3b, h3c are Unplaced
    // ch5 has no Scene: no heading.
    `chapter1^:${TITLE(4)}`, 'h4a', '***', 'h4c', // h4b is empty: no text, no break
    `chapter1^:${TITLE(6)}`, 'h6c', // h6a, h6b are Unplaced
  ]);
  const flat = JSON.stringify(document);
  for (const label of ['h3b', 'h3c', 'h6a', 'h6b']) assert.ok(!flat.includes(markerFor(label)), `${label} (Unplaced) is not exported`);
  assert.doesNotMatch(flat, /REVISION NOTE TEXT|CHAPTER NOTE TEXT/, 'Revision Notes are never exported');
  assert.deepEqual(document.stats, { chapters: 6, scenes: 7, words: document.stats.words, unplacedScenes: 0 });

  // Trash: a trashed Scene and a trashed Chapter (with its Scene) are gone from the export.
  ok(await trash.trashWorkspaceObject('scene', S('h4c')));
  ok(await trash.trashWorkspaceObject('chapter', CH(2)));
  const after = outline(await exportOf(db, { kind: 'manuscript' }));
  assert.ok(!after.includes('h4c') && !after.includes('h2a') && !after.some((x) => x.endsWith(TITLE(2))));
  assert.ok(!after.includes('***'), 'ch4 now has one Scene with text: no break');
});

test('Manuscript export: titled Groups head their Chapters by outline depth (nested Groups deeper), an untitled Group prints no heading', async () => {
  const db = await seededDb();
  await withGroups(db);
  const document = await exportOf(db, { kind: 'manuscript' });
  assert.deepEqual(outline(document).filter((x) => x.includes(':')), [
    `title:${document.projectTitle}`,
    `chapter3^:${TITLE(3)}`, // ch3 (position 3) precedes the Groups, created after it; ch5 has no Scene
    'group1^:Part A', 'group2:Part A.1', `chapter3:${TITLE(1)}`, `chapter3^:${TITLE(2)}`,
    'group1^:Part B', `chapter3:${TITLE(4)}`,
    `chapter3^:${TITLE(6)}`, // in the untitled Group: no Group heading
  ], 'every Chapter one level below the deepest printed Group');
  // Prose headings sit below their Chapter's level.
  assert.ok(document.blocks.filter((b) => b.kind === 'prose').every((b) => b.headingBase === 3));
  // A Group with nothing exported inside prints nothing.
  ok(await structure.createGroup(HOLLOW, 'Empty Part'));
  assert.ok(!outline(await exportOf(db, { kind: 'manuscript' })).some((x) => x.includes('Empty Part')));
});

test('Manuscript export: "Include Unplaced Scenes at the end" adds them after the book, under their own heading on a new page, each named', async () => {
  const db = await seededDb();
  await scenes.renameScene(S('h6a'), 'The lighthouse');
  const document = await exportOf(db, { kind: 'manuscript', includeUnplaced: true });
  const seq = outline(document);
  const at = seq.indexOf('unplaced1^:Unplaced Scenes');
  assert.ok(at > seq.indexOf('h6c'), 'after the whole manuscript');
  assert.deepEqual(seq.slice(at + 1).filter((x) => x.includes(':')).length, 4);
  assert.ok(seq.slice(at).includes('unplacedScene2:The lighthouse'));
  assert.deepEqual(seq.slice(at).filter((x) => /^h\d/.test(x)).sort(), ['h3b', 'h3c', 'h6a', 'h6b']);
  assert.equal(document.stats.unplacedScenes, 4);
  // Off by default.
  assert.ok(!outline(await exportOf(db, { kind: 'manuscript' })).some((x) => x.startsWith('unplaced')));
});

// ── 2. Chapter and Scene export ──────────────────────────────────────────────

test('Chapter export: only that Chapter, its heading and its Scenes in order with breaks between; a one-Scene Chapter is just the Chapter', async () => {
  const db = await seededDb();
  assert.deepEqual(outline(await exportOf(db, { kind: 'chapter', chapterId: CH(4) })), [`chapter1:${TITLE(4)}`, 'h4a', '***', 'h4c']);
  assert.deepEqual(outline(await exportOf(db, { kind: 'chapter', chapterId: CH(1) })), [`chapter1:${TITLE(1)}`, 'h1a']);
  const empty = await exportOf(db, { kind: 'chapter', chapterId: CH(5) });
  assert.deepEqual(outline(empty), [`chapter1:${TITLE(5)}`], 'an empty Chapter exports its heading and nothing else');
  // Scene order follows the structure.
  ok(await scenes.placeScene(S('h4c'), CH(4), 0));
  assert.deepEqual(outline(await exportOf(db, { kind: 'chapter', chapterId: CH(4) })), [`chapter1:${TITLE(4)}`, 'h4c', '***', 'h4a']);
  // A trashed Chapter, another writer's Chapter: not available.
  ok(await trash.trashWorkspaceObject('chapter', CH(1)));
  await assert.rejects(exportOf(db, { kind: 'chapter', chapterId: CH(1) }), /isn’t available/);
  await assert.rejects(exportOf(db, { kind: 'chapter', chapterId: CH(4) }, BRAM), /isn’t available/);
});

test('Scene export: only that Scene\'s prose — no title, Chapter, properties or notes; Unplaced Scenes export too', async () => {
  const db = await seededDb();
  await scenes.renameScene(S('h4a'), 'SCENE TITLE');
  await notes.createRevisionNote(randomUUID(), 'scene', S('h4a'), 'REVISION NOTE TEXT');
  const document = await exportOf(db, { kind: 'scene', sceneId: S('h4a') });
  assert.deepEqual(outline(document), ['h4a']);
  assert.equal(document.subject, 'SCENE TITLE', 'the title names the file only');
  assert.doesNotMatch(JSON.stringify(document.blocks), /SCENE TITLE|REVISION NOTE|fixture-chapter/);
  assert.doesNotMatch(md.renderMarkdown(document) + txt.renderText(document), /SCENE TITLE|fixture-chapter/);
  assert.deepEqual(outline(await exportOf(db, { kind: 'scene', sceneId: S('h3b') })), ['h3b']);
  // An unnamed placed Scene is named by its place among its Chapter's Scenes, as the navigator names it.
  await db.query(`update public.scenes set title = '' where id = $1`, [S('h4c')]);
  const second = await exportOf(db, { kind: 'scene', sceneId: S('h4c') });
  assert.equal(second.subject, 'Scene 3', 'h4c is the third Scene of ch4 (after h4a, h4b)');
  assert.deepEqual(outline(second), ['h4c'], 'its siblings\' prose is never part of it');
  assert.doesNotMatch(JSON.stringify(second.blocks), /fixture-marker-h4a/);
  await assert.rejects(exportOf(db, { kind: 'scene', sceneId: S('h4a') }, BRAM), /isn’t available/);
  ok(await trash.trashWorkspaceObject('scene', S('h4a')));
  await assert.rejects(exportOf(db, { kind: 'scene', sceneId: S('h4a') }), /isn’t available/);
});

// ── 3. Formats and fidelity ──────────────────────────────────────────────────

const RICH = doc(
  para(text('Plain opening line.')),
  para(text('Bold', 'bold'), text(' '), text('italic', 'italic'), text(' '), text('under', 'underline'), text(' '), text('struck', 'strike'), text(' and '), text('both', 'bold', 'italic'), text('.')),
  para(),
  para(),
  para(text('Line one'), { type: 'hardBreak' }, text('Line two')),
  { type: 'heading', attrs: { level: 2 }, content: [text('A heading in prose')] },
  para(text('Café — “quoted” ‘single’ … naïve Ωmega 東京 😀')),
  { type: 'blockquote', content: [para(text('A quoted line.'))] },
  para(text('Stars *not* emphasis_ [bracket] <tag> & &amp; `tick` ~tilde~')),
  para(text('- not a list')),
  para(text('1. not a list either')),
  para(text('Closing line.')),
);

/** The importer's view of prose paragraphs: [text, marks] per run, blanks as "¶". */
function importedProse(parsed) {
  return parsed.blocks.map((b) => {
    if (b.kind === 'heading') return `H${b.level}:${b.runs.map((r) => (typeof r === 'string' ? r : r[0])).join('')}`;
    if (b.blank) return '¶';
    return b.runs.map((r) => (typeof r === 'string' ? [r, 0] : r));
  });
}

const MARK = { bold: 1, italic: 2, underline: 4, strike: 8 };

test('DOCX: a real Word package Rune\'s own import reads back — marks, blank paragraphs, line breaks, headings, Unicode, special characters', async () => {
  const db = await seededDb();
  await setContent(db, S('h4a'), RICH);
  const document = await exportOf(db, { kind: 'scene', sceneId: S('h4a') });
  const file = await formats.renderExport(document, 'docx');
  assert.equal(file.extension, 'docx');
  assert.deepEqual([...file.bytes.slice(0, 2)], [0x50, 0x4b], 'a ZIP');
  const archive = zip.openZip(file.bytes);
  for (const part of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/numbering.xml', 'word/footer1.xml', 'word/_rels/document.xml.rels', 'docProps/core.xml']) {
    assert.ok(archive.has(part), part);
  }
  const xml = await archive.text('word/document.xml');
  assert.match(xml, /Café — “quoted” ‘single’ … naïve Ωmega 東京 😀/, 'every character, as UTF-8');

  const parsed = await importer.parseImportFile('scene.docx', file.bytes);
  const prose = importedProse(parsed);
  assert.deepEqual(prose[0], [['Plain opening line.', 0]]);
  assert.deepEqual(prose[1], [
    ['Bold', MARK.bold], [' ', 0], ['italic', MARK.italic], [' ', 0], ['under', MARK.underline], [' ', 0],
    ['struck', MARK.strike], [' and ', 0], ['both', MARK.bold | MARK.italic], ['.', 0],
  ]);
  assert.deepEqual(prose.slice(2, 4), ['¶', '¶'], 'two intentional blank paragraphs, kept');
  assert.deepEqual(prose[4], [['Line one\nLine two', 0]], 'a line break inside the paragraph');
  assert.equal(prose[5], 'H2:A heading in prose');
  assert.deepEqual(prose[6], [['Café — “quoted” ‘single’ … naïve Ωmega 東京 😀', 0]]);
  assert.deepEqual(prose[7], [['A quoted line.', 0]]);
  assert.deepEqual(prose[8], [['Stars *not* emphasis_ [bracket] <tag> & &amp; `tick` ~tilde~', 0]]);
  assert.deepEqual(prose.slice(9), [[['- not a list', 0]], [['1. not a list either', 0]], [['Closing line.', 0]]]);
  assert.equal(xml.includes('fixture-chapter'), false, 'a Scene export has no Chapter heading');
});

test('Markdown: clean CommonMark that Rune\'s import reads back — **bold**, *italic*, ~~strike~~, &nbsp; blanks, backslash breaks, escapes; underline degrades to plain text', async () => {
  const db = await seededDb();
  await setContent(db, S('h4a'), RICH);
  const document = await exportOf(db, { kind: 'scene', sceneId: S('h4a') });
  const out = md.renderMarkdown(document);
  assert.match(out, /^Plain opening line\.\n\n\*\*Bold\*\* \*italic\* under ~~struck~~ and \*\*\*both\*\*\*\.\n\n&nbsp;\n\n&nbsp;\n\nLine one\\\nLine two\n\n## A heading in prose\n\n/);
  assert.match(out, /\n> A quoted line\.\n/);
  assert.match(out, /Stars \\\*not\\\* emphasis\\_ \\\[bracket\\\] \\<tag> & \\&amp; \\`tick\\` \\~tilde\\~/);
  assert.match(out, /\n\\- not a list\n\n1\\\. not a list either\n/);
  const prose = importedProse(await importer.parseImportFile('scene.md', new TextEncoder().encode(out)));
  assert.deepEqual(prose[1], [
    ['Bold', MARK.bold], [' ', 0], ['italic', MARK.italic], [' under ', 0],
    ['struck', MARK.strike], [' and ', 0], ['both', MARK.bold | MARK.italic], ['.', 0],
  ]);
  assert.deepEqual(prose.slice(2, 4), ['¶', '¶']);
  assert.deepEqual(prose[4], [['Line one\nLine two', 0]]);
  assert.deepEqual(prose[6], [['Café — “quoted” ‘single’ … naïve Ωmega 東京 😀', 0]]);
  assert.deepEqual(prose.at(-1), [['Closing line.', 0]]);
});

test('TXT: paragraphs a blank line apart, an intentional blank paragraph one more; Rune\'s import reads the same paragraphs and blanks back', async () => {
  const db = await seededDb();
  await setContent(db, S('h4a'), RICH);
  const out = txt.renderText(await exportOf(db, { kind: 'scene', sceneId: S('h4a') }));
  assert.match(out, /^Plain opening line\.\n\nBold italic under struck and both\.\n\n\n\nLine one\nLine two\n\nA heading in prose\n\nCafé/);
  assert.match(out, /\n    A quoted line\.\n/);
  const prose = importedProse(await importer.parseImportFile('scene.txt', new TextEncoder().encode(out)));
  assert.deepEqual(prose.slice(0, 5), [[['Plain opening line.', 0]], [['Bold italic under struck and both.', 0]], '¶', '¶', [['Line one', 0]]]);
});

test('PDF: the real jsPDF draws every word, Scene breaks and headings, with typographic punctuation intact; characters its font lacks become "?" and are reported', async () => {
  const db = await seededDb();
  await setContent(db, S('h4a'), RICH);
  const document = await exportOf(db, { kind: 'chapter', chapterId: CH(4) });
  const bytes = await pdf.renderPdf(document);
  const file = Buffer.from(bytes).toString('latin1');
  assert.ok(file.startsWith('%PDF-'));
  // Page streams are compressed (FlateDecode): read them inflated.
  const raw = [...file.matchAll(/stream\r?\n([\s\S]*?)endstream/g)]
    .map((m) => { try { return zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); } catch { return m[1]; } })
    .join('\n') + file;
  assert.ok(file.includes('/FlateDecode'), 'compressed');
  const drawn = [...raw.matchAll(/\(((?:[^()\\]|\\.)*)\) Tj/g)].map((m) => m[1].replace(/\\([()\\])/g, '$1'));
  const words = drawn.join(' ');
  for (const w of ['Bold', 'italic', 'under', 'struck', 'both', 'Line', 'two', 'A quoted line.'.split(' ')[1], 'Closing', '* * *', TITLE(4).toUpperCase(), markerFor('h4c')]) {
    assert.ok(words.includes(w), `drawn: ${w}`);
  }
  // Windows-1252 characters are drawn as themselves (one byte each); others as "?".
  assert.ok(drawn.includes('Caf\xe9'), 'é');
  assert.ok(drawn.includes('\x97'), 'the em dash');
  assert.ok(drawn.includes('\x93quoted\x94'), 'curly double quotes');
  assert.ok(drawn.includes('\x91single\x92'), 'curly single quotes');
  assert.ok(drawn.includes('?mega') && drawn.includes('??') && !words.includes('Ω'));
  assert.deepEqual(pdf.unsupportedPdfCharacters(document), ['Ω', '東', '京', '😀']);
  assert.equal(pdf.pdfText('non‑breaking ⸺ two-em'), 'non-breaking —— two-em');
  assert.equal(pdf.pdfText('ā ō'), 'a o', 'an accent the font lacks is dropped, the letter kept');
  // Every page is a real page, numbered; the header carries the Project title.
  assert.ok((raw.match(/\/Type \/Page\b/g) ?? []).length >= 1);
  assert.ok(drawn.includes('1'));
});

test('Manuscript DOCX and Markdown re-import to the same structure: title, Groups, Chapters in order, Scene breaks', async () => {
  const db = await seededDb();
  await withGroups(db);
  const document = await exportOf(db, { kind: 'manuscript' });
  for (const [name, bytes] of [
    ['book.docx', (await formats.renderExport(document, 'docx')).bytes],
    ['book.md', (await formats.renderExport(document, 'md')).bytes],
  ]) {
    const parsed = await importer.parseImportFile(name, bytes);
    const importPlan = structureLib.buildPlan(structureLib.detectLines(parsed), {}, 'x');
    assert.equal(importPlan.title, document.projectTitle, `${name}: the title`);
    const shape = (items) => items.map((it) => (it.kind === 'group' ? { group: it.title, items: shape(it.items) } : { chapter: it.title, scenes: it.scenes.length }));
    assert.deepEqual(shape(importPlan.items), [
      { chapter: TITLE(3), scenes: 1 },
      // Headings can't say "back out of Part A.1": ch2 (in Part A, after Part A.1)
      // reads back inside Part A.1, and ch6's untitled Group has no heading at all.
      { group: 'Part A', items: [{ group: 'Part A.1', items: [{ chapter: TITLE(1), scenes: 1 }, { chapter: TITLE(2), scenes: 1 }] }] },
      { group: 'Part B', items: [{ chapter: TITLE(4), scenes: 2 }, { chapter: TITLE(6), scenes: 1 }] },
    ], `${name}: the same book, as far as headings can say it`);
    assert.deepEqual(importPlan.unplaced, [], `${name}: nothing outside a Chapter`);
  }
});

test('file names: the Project (and Chapter or Scene), safe on every system; the extension follows the format', async () => {
  const db = await seededDb();
  await db.query(`update public.projects set title = $2 where id = $1`, [HOLLOW, 'The Hollow: A/B "draft"?']);
  const m = await exportOf(db, { kind: 'manuscript' });
  assert.equal(formats.defaultExportName(m), 'The Hollow A B draft');
  assert.equal(formats.exportFileName(formats.defaultExportName(m), 'docx'), 'The Hollow A B draft.docx');
  assert.equal(formats.exportFileName('Book.pdf', 'md'), 'Book.md');
  const c = await exportOf(db, { kind: 'chapter', chapterId: CH(1) });
  assert.equal(formats.defaultExportName(c), `The Hollow A B draft – ${TITLE(1)}`);
  assert.equal(formats.safeFileName('   ...  '), 'Manuscript');
});

test('the Projects page PDF (exportProjectAsPdf) runs on the same pipeline: same Chapters, breaks and Group headings', async () => {
  const db = await seededDb();
  await withGroups(db);
  const recording = (globalThis.__runeTestPdf ??= { texts: [], saved: [] });
  recording.texts.length = 0;
  recording.saved.length = 0;
  const loaded = await legacyExport.loadManuscriptForExport(as(db, ALICE), HOLLOW);
  await legacyExport.exportProjectAsPdf({ title: 'fixture-project' }, loaded.chapters, loaded.scenesPerChapter, loaded.groups);
  // Headings (upper case) and breaks, in the order the dialog's plan has them.
  const expected = outline(await exportOf(db, { kind: 'manuscript' }))
    .filter((x) => x === '***' || /^(group|chapter)/.test(x))
    .map((x) => (x === '***' ? '* * *' : x.split(':').slice(1).join(':').toUpperCase()));
  assert.deepEqual(recording.texts.filter((t) => expected.includes(t)), expected);
  assert.equal(recording.saved.length, 1);
});

// ── 4. Whole-Project Backup ──────────────────────────────────────────────────

/** hollow with everything a Project holds: Groups, notes at every level, properties, Views, History, a Milestone, Workspace, references, Trash. */
async function fullProject(db) {
  const g = await withGroups(db);
  const ms = (await one(db, `select id from public.manuscripts where project_id = $1`, [HOLLOW])).id;
  const note = async (type, id, body) => (await notes.createRevisionNote(randomUUID(), type, id, body)).note;
  const n = {
    manuscript: await note('manuscript', ms, 'manuscript note'),
    group: await note('group', g.a.id, 'group note'),
    chapter: await note('chapter', CH(6), 'note on a Chapter going to Trash'),
    scene: await note('scene', S('h4c'), 'note on a Scene going to Trash'),
    unplaced: await note('scene', S('h3b'), 'note on an Unplaced Scene'),
  };
  const pov = ok(await sceneProps.createSceneProperty(HOLLOW, 'POV', 'text'));
  ok(await sceneProps.setScenePropertyValue(S('h1a'), pov.id, 'Mara'));
  ok(await sceneProps.setScenePropertyValue(S('h4c'), pov.id, 'Iven'));
  const sceneView = ok(await sceneViews.createSceneView(HOLLOW, 'By POV', 'table'));
  await db.query(`insert into public.scene_revisions (manuscript_id, scene_id, title, content, word_count, saved_at, reason)
    values ($1, $2, 'Earlier', $3, 2, '2026-09-01 10:00:00+00', 'checkpoint')`, [ms, S('h1a'), JSON.stringify(doc(para(text('Earlier text'))))]);
  const milestone = ok(await milestones.createManuscriptMilestone(HOLLOW, 'Draft 1'));

  const folder = ok(await tree.createWorkspaceFolder(HOLLOW, 'Research'));
  const page = ok(await pages.createWorkspacePage(HOLLOW, 'Setting notes', folder.nodeId));
  assert.equal((await pages.saveWorkspacePageContent(page.id, doc(para(text('The harbour town.'))), page.version)).status, 'ok');
  const oldPage = ok(await pages.createWorkspacePage(HOLLOW, 'Discarded page'));
  const oldFolder = ok(await tree.createWorkspaceFolder(HOLLOW, 'Old folder'));
  const people = ok(await collections.createWorkspaceCollection(HOLLOW, 'Characters'));
  const role = ok(await props.createCollectionProperty(people.collection.id, 'Role', 'text'));
  const view = ok(await views.createCollectionView(people.collection.id, 'All', 'table'));
  const mara = ok(await collections.createCollectionEntry(people.collection.id, 'Mara'));
  assert.equal((await collections.saveCollectionEntryContent(mara.id, doc(para(text('A cartographer.'))), mara.version)).status, 'ok');
  ok(await props.setEntryPropertyValue(mara.id, role.id, 'Protagonist'));
  const cut = ok(await collections.createCollectionEntry(people.collection.id, 'Cut character'));
  const places = ok(await collections.createWorkspaceCollection(HOLLOW, 'Places'));
  const inn = ok(await collections.createCollectionEntry(places.collection.id, 'The inn'));
  const ref = ok(await refs.addObjectReference('page', page.id, 'scene', S('h1a')));
  const refToTrash = ok(await refs.addObjectReference('entry', mara.id, 'scene', S('h4c')));

  await db.query(`insert into public.writing_goals (user_id, project_id, type, target_words) values ($1, $2, 'daily_project', 500)`, [ALICE, HOLLOW]);

  // To Trash: a Scene, a Chapter (with its Scene), a Page, a Folder, an Entry, a Collection (with its Entry).
  ok(await trash.trashWorkspaceObject('scene', S('h4c')));
  ok(await trash.trashWorkspaceObject('chapter', CH(6)));
  ok(await trash.trashWorkspaceObject('page', oldPage.id));
  ok(await trash.trashWorkspaceObject('folder', oldFolder.folder.id));
  ok(await trash.trashWorkspaceObject('entry', cut.id));
  ok(await trash.trashWorkspaceObject('collection', places.collection.id));
  return { ms, g, n, pov, sceneView, milestone, folder, page, oldPage, oldFolder, people, role, view, mara, cut, places, inn, ref, refToTrash };
}

async function unzipAll(bytes) {
  const archive = zip.openZip(bytes);
  const manifest = JSON.parse(await archive.text('manifest.json'));
  const files = {};
  for (const name of manifest.files) {
    assert.ok(archive.has(name), `listed and present: ${name}`);
    const body = await archive.text(name);
    files[name] = name.endsWith('.json') ? JSON.parse(body) : body;
  }
  return { manifest, files };
}

test('backup: a versioned, inspectable ZIP holding the whole Project — manuscript, Unplaced, Trash (marked), notes, History, Milestones, Workspace, references, writing history', async () => {
  const db = await seededDb();
  const f = await fullProject(db);
  const data = await backup.loadProjectBackup(as(db, ALICE), HOLLOW);
  const at = new Date('2026-09-29T12:00:00Z');
  const bytes = await backup.buildBackupArchive(data, at);
  const { manifest, files } = await unzipAll(bytes);

  assert.equal(manifest.format, 'rune-project-backup');
  assert.equal(manifest.format_version, 1);
  assert.equal(manifest.created_at, at.toISOString());
  assert.deepEqual(manifest.project, { id: HOLLOW, title: data.project.title });
  assert.ok(files['README.txt'].includes('Rune can\'t yet read this archive back in'));
  assert.equal(files['project.json'].project.id, HOLLOW);
  assert.equal(files['project.json'].manuscript.id, f.ms);

  // Manuscript: every Scene (placed, Unplaced, in Trash) with its canonical id and text.
  const sceneRows = await all(db, `select * from public.scenes where manuscript_id = $1`, [f.ms]);
  assert.equal(sceneRows.length, 11);
  for (const s of sceneRows) {
    const saved = files[`manuscript/scenes/${s.id}.json`];
    assert.ok(saved, `Scene ${s.id}`);
    assert.deepEqual(saved.content, s.content);
    assert.deepEqual([saved.id, saved.chapter_id, saved.position, saved.version, saved.word_count, saved.in_trash],
      [s.id, s.chapter_id, s.position, s.version, s.word_count, s.trashed_at !== null]);
  }
  const structureFile = files['manuscript/structure.json'];
  assert.deepEqual(structureFile.reading_order.map((x) => `${x.type}:${x.depth}`), [
    'chapter:0', 'chapter:0', 'group:0', 'group:1', 'chapter:2', 'chapter:1', 'group:0', 'chapter:1', 'group:0',
  ], 'ch3, ch5, Part A [Part A.1 [ch1], ch2], Part B [ch4], the untitled Group (its ch6 is in Trash)');
  assert.deepEqual(structureFile.reading_order.filter((x) => x.type === 'chapter').map((x) => x.id), [CH(3), CH(5), CH(1), CH(2), CH(4)]);
  assert.deepEqual(structureFile.chapter_scenes[CH(4)], [S('h4a'), S('h4b')]);
  assert.deepEqual(structureFile.unplaced_scenes.sort(), [S('h3b'), S('h3c'), S('h6a'), S('h6b')].sort());
  assert.deepEqual(structureFile.trash.chapters, [{ id: CH(6), scenes: [S('h6c')] }]);
  assert.deepEqual(structureFile.trash.scenes.sort(), [S('h4c'), S('h6c')].sort());
  assert.equal(structureFile.chapters.find((c) => c.id === CH(6)).in_trash, true);
  assert.equal(structureFile.groups.length, 4);
  assert.match(files['manuscript/manuscript.md'], /# Unplaced Scenes|## Unplaced Scenes/);
  assert.ok(!files['manuscript/manuscript.md'].includes(markerFor('h4c')), 'the readable manuscript is the active one');

  // Revision Notes, every level, those in Trash marked.
  const noteFile = files['revision-notes.json'].notes;
  assert.equal(noteFile.length, 5);
  const byBody = Object.fromEntries(noteFile.map((n) => [n.body, n]));
  assert.equal(byBody['note on a Scene going to Trash'].in_trash, true);
  assert.equal(byBody['note on a Chapter going to Trash'].in_trash, true);
  assert.equal(byBody['manuscript note'].target_type, 'manuscript');
  assert.equal(byBody['group note'].target_id, f.g.a.id);
  assert.equal(byBody['note on an Unplaced Scene'].in_trash, false);

  // Scene properties, values (a trashed Scene's too) and Views.
  assert.deepEqual(files['manuscript/scene-properties.json'].definitions.map((d) => d.name), ['POV']);
  assert.deepEqual(files['manuscript/scene-properties.json'].values.map((v) => [v.scene_id, v.value]).sort(), [[S('h1a'), 'Mara'], [S('h4c'), 'Iven']].sort());
  assert.deepEqual(files['manuscript/scene-views.json'].views.map((v) => v.id), [f.sceneView.id]);

  // History and Milestones.
  const history = files[`history/${S('h1a')}.json`];
  assert.ok(history.revisions.some((r) => r.title === 'Earlier' && r.content.content[0].content[0].text === 'Earlier text'));
  const revisionCount = (await one(db, `select count(*)::int as n from public.scene_revisions where manuscript_id = $1`, [f.ms])).n;
  assert.equal(Object.keys(files).filter((k) => k.startsWith('history/')).reduce((n, k) => n + files[k].revisions.length, 0), revisionCount);
  const milestone = files[`milestones/${f.milestone.id}.json`];
  assert.equal(milestone.milestone.name, 'Draft 1');
  assert.ok(milestone.scenes.length >= 7);
  for (const ms of milestone.scenes) {
    assert.ok(Object.keys(files).some((k) => k.startsWith('history/') && files[k].revisions.some((r) => r.id === ms.revision_id)), 'each Milestone Scene\'s text is in History');
  }

  // Workspace: tree, Folders (Trash marked), Pages (+ readable copy), Collections with properties, Views, Entries, values.
  const treeFile = files['workspace/tree.json'];
  assert.ok(treeFile.nodes.some((node) => node.document_id === f.page.id && node.parent_node_id === f.folder.nodeId));
  assert.equal(treeFile.folders.find((x) => x.id === f.oldFolder.folder.id).in_trash, true);
  assert.equal(treeFile.folders.find((x) => x.id === f.folder.folder.id).in_trash, false);
  assert.equal(files[`workspace/pages/${f.page.id}.json`].content.content[0].content[0].text, 'The harbour town.');
  assert.match(files[`workspace/pages/${f.page.id}.md`], /^# Setting notes\n\nThe harbour town\.\n$/);
  assert.equal(files[`workspace/pages/${f.oldPage.id}.json`].in_trash, true);
  const people = files[`workspace/collections/${f.people.collection.id}.json`];
  assert.equal(people.collection.in_trash, false);
  assert.deepEqual(people.properties.map((p) => p.id), [f.role.id]);
  assert.deepEqual(people.views.map((v) => v.id).includes(f.view.id), true);
  assert.deepEqual(people.entries.map((e) => [e.title, e.in_trash]).sort(), [['Cut character', true], ['Mara', false]]);
  assert.equal(people.entries.find((e) => e.id === f.mara.id).content.content[0].content[0].text, 'A cartographer.');
  assert.deepEqual(people.values.map((v) => [v.entry_id, v.property_id, v.value]), [[f.mara.id, f.role.id, 'Protagonist']]);
  const places = files[`workspace/collections/${f.places.collection.id}.json`];
  assert.equal(places.collection.in_trash, true);
  assert.deepEqual(places.entries.map((e) => [e.id, e.in_trash]), [[f.inn.id, true]], 'an Entry of a trashed Collection is in Trash with it');

  // References, the one touching Trash marked; writing history and goals.
  const refFile = files['references.json'].references;
  assert.deepEqual(refFile.map((r) => [r.id, r.in_trash]).sort(), [[f.ref.id, false], [f.refToTrash.id, true]].sort());
  const sessions = await all(db, `select id from public.writing_sessions where project_id = $1 and user_id = $2`, [HOLLOW, ALICE]);
  assert.ok(sessions.length > 0);
  assert.deepEqual(files['writing/sessions.json'].sessions.map((s) => s.id).sort(), sessions.map((s) => s.id).sort());
  assert.deepEqual(files['writing/goals.json'].goals.map((g) => g.target_words), [500]);

  // Counts and Trash in the manifest; nothing from the device, the account or another Project.
  assert.deepEqual(manifest.trash, { chapters: 1, scenes: 2, pages: 1, folders: 1, collections: 1, entries: 2 });
  assert.equal(manifest.counts.scenes, 11);
  const names = Object.keys(files).join('\n');
  assert.doesNotMatch(names, /tab|draft|cache|queue|scroll|profile|billing|xp/i);
  assert.doesNotMatch(JSON.stringify(files), /"stripe|subscription_|"xp"/);
  const tide = projectId('tide');
  assert.ok(!JSON.stringify(files).includes(tide));
});

test('backup read is the owner\'s alone: another writer (or no one) gets nothing; unknown kinds are refused; paging never skips or repeats a row', async () => {
  const db = await seededDb();
  await fullProject(db);
  const bram = as(db, BRAM);
  const r = await bram.rpc('read_project_backup', { p_project_id: HOLLOW, p_kind: 'scenes', p_after: null, p_limit: 500 });
  assert.deepEqual(r.data, { status: 'error', error: 'Project not found' });
  await assert.rejects(backup.loadProjectBackup(bram, HOLLOW), /isn’t available to back up/);
  const anon = createSupabaseAdapter(db, { userId: null });
  const denied = await anon.rpc('read_project_backup', { p_project_id: HOLLOW, p_kind: 'scenes', p_after: null, p_limit: 5 });
  assert.ok(denied.error, 'anonymous callers cannot run it');
  const alice = as(db, ALICE);
  assert.deepEqual((await alice.rpc('read_project_backup', { p_project_id: HOLLOW, p_kind: 'profiles', p_after: null, p_limit: 5 })).data,
    { status: 'error', error: 'Unknown kind' });
  // Pages of 2: every Scene exactly once, in id order; composite keys page too.
  const pageThrough = async (kind, limit, key) => {
    const seen = [];
    let after = null;
    for (;;) {
      const { data } = await alice.rpc('read_project_backup', { p_project_id: HOLLOW, p_kind: kind, p_after: after, p_limit: limit });
      seen.push(...data.rows.map(key));
      if (!data.next) return seen;
      after = data.next;
    }
  };
  const ids = await pageThrough('scenes', 2, (row) => row.id);
  assert.deepEqual(ids, [...ids].sort());
  assert.equal(new Set(ids).size, 11);
  const values = await pageThrough('scene_property_values', 1, (row) => `${row.scene_id}:${row.property_id}`);
  assert.equal(values.length, 2);
  assert.equal(new Set(values).size, 2);
});

test('the Whole-Project Backup format needs migration 041\'s function: without it, a clear refusal and no file', async () => {
  const db = await seededDb();
  await db.query(`drop function public.read_project_backup(uuid, text, text, integer)`);
  await assert.rejects(backup.loadProjectBackup(as(db, ALICE), HOLLOW), (e) => e instanceof backup.BackupUnavailableError);
});

// ── 5. Read-only ─────────────────────────────────────────────────────────────

test('regression: every export (all scopes and formats) and a backup change no row anywhere — versions, sessions, Today, History, Milestones, order, properties, Trash', async () => {
  const db = await seededDb();
  await fullProject(db);
  await setContent(db, S('h1a'), RICH);
  const before = await everything(db);
  for (const scope of [
    { kind: 'manuscript' },
    { kind: 'manuscript', includeUnplaced: true },
    { kind: 'chapter', chapterId: CH(4) },
    { kind: 'scene', sceneId: S('h1a') },
    { kind: 'scene', sceneId: S('h3b') },
  ]) {
    const document = await exportOf(db, scope);
    for (const format of ['docx', 'pdf', 'md', 'txt']) await formats.renderExport(document, format);
  }
  await backup.buildBackupArchive(await backup.loadProjectBackup(as(db, ALICE), HOLLOW));
  // A failed export reads and writes nothing either.
  await assert.rejects(exportOf(db, { kind: 'scene', sceneId: randomUUID() }), /isn’t available/);
  assert.equal(await everything(db), before, 'no row changed in any table');
});

// ── 6. Scale ─────────────────────────────────────────────────────────────────

const VOCAB = 'the harbour lamp wind over grey water she said nothing and waited while gulls turned above salt stone bells rang slowly'.split(' ');

test('scale: a ~100k-word manuscript (40 Chapters, 600 Scenes) loads past the row cap and exports in every format; the backup holds it all', async () => {
  const db = await seededDb();
  const ms = (await one(db, `select id from public.manuscripts where project_id = $1`, [HOLLOW])).id;
  const chapters = [];
  const sceneRows = [];
  let w = 0;
  for (let c = 0; c < 40; c++) {
    const id = randomUUID();
    chapters.push({ id, manuscript_id: ms, title: `Long Chapter ${c + 1}`, position: 100 + c });
    for (let s = 0; s < 15; s++) {
      const paragraphs = [];
      for (let p = 0; p < 6; p++) {
        const words = [];
        for (let k = 0; k < 28; k++) words.push(VOCAB[(w++ * 7 + k) % VOCAB.length]);
        paragraphs.push(para(text(`${words.join(' ')}.`)));
      }
      sceneRows.push({ id: randomUUID(), manuscript_id: ms, chapter_id: id, title: '', position: s + 1, content: doc(...paragraphs), word_count: 6 * 28 });
    }
  }
  await db.query(`insert into public.chapters (id, manuscript_id, title, position)
    select id, manuscript_id, title, position from jsonb_to_recordset($1::jsonb) as x(id uuid, manuscript_id uuid, title text, position int)`, [JSON.stringify(chapters)]);
  await db.query(`insert into public.scenes (id, manuscript_id, chapter_id, title, position, content, word_count)
    select id, manuscript_id, chapter_id, title, position, content, word_count
      from jsonb_to_recordset($1::jsonb) as x(id uuid, manuscript_id uuid, chapter_id uuid, title text, position int, content jsonb, word_count int)`, [JSON.stringify(sceneRows)]);
  const before = await everything(db);

  let t = Date.now();
  const document = await exportOf(db, { kind: 'manuscript' });
  const loadMs = Date.now() - t;
  assert.equal(document.stats.scenes, 607, 'every placed Scene, past the 500-row page');
  assert.ok(document.stats.words >= 100_000, `${document.stats.words} words`);
  assert.equal(document.blocks.filter((b) => b.kind === 'sceneBreak').length, 40 * 14 + 1, 'a break between each two Scenes of a Chapter');
  const timings = { load: loadMs };
  for (const format of ['docx', 'md', 'txt', 'pdf']) {
    t = Date.now();
    const file = await formats.renderExport(document, format);
    timings[format] = Date.now() - t;
    const body = format === 'docx' ? await zip.openZip(file.bytes).text('word/document.xml') : Buffer.from(file.bytes).toString('latin1');
    assert.ok(body.length > 500_000, `${format}: ${body.length} characters`);
    if (format !== 'pdf') assert.ok(body.includes('Long Chapter 40'), `${format}: through the last Chapter`);
  }
  const plain = txt.renderText(document);
  assert.ok(plain.indexOf('Long Chapter 1\n') < plain.indexOf('Long Chapter 2\n') && plain.indexOf('Long Chapter 39\n') < plain.indexOf('Long Chapter 40\n'));
  const exportedWords = plain.split(/\s+/).filter((x) => /^[a-z]+\.?$/.test(x)).length;
  assert.ok(exportedWords >= 40 * 15 * 6 * 28, 'no prose lost');

  t = Date.now();
  const data = await backup.loadProjectBackup(as(db, ALICE), HOLLOW);
  const archive = await backup.buildBackupArchive(data);
  timings.backup = Date.now() - t;
  assert.equal(data.rows.scenes.length, 611, 'every Scene, a page of 100 at a time');
  const { files } = await unzipAll(archive);
  assert.equal(Object.keys(files).filter((k) => k.startsWith('manuscript/scenes/')).length, 611);
  assert.ok(archive.length < JSON.stringify(data).length, 'compressed');
  console.log(`# scale timings (ms): ${JSON.stringify(timings)}; docx/backup sizes: ${(await formats.renderExport(document, 'docx')).bytes.length}/${archive.length}`);
  assert.equal(await everything(db), before);
});

// ── 7. The download handoff ──────────────────────────────────────────────────

/** A stand-in browser: object URLs and <a download> clicks, recorded. */
function fakeBrowser({ clickThrows = false } = {}) {
  const events = [];
  let n = 0;
  const live = new Set();
  const body = { children: [], appendChild(el) { this.children.push(el); el.parent = this; } };
  globalThis.document = {
    body,
    createElement(tag) {
      assert.equal(tag, 'a');
      return {
        style: {},
        click() {
          if (clickThrows) throw new Error('blocked');
          assert.ok(this.parent === body, 'clicked while in the document');
          assert.ok(live.has(this.href), 'clicked with a live object URL');
          events.push(['click', this.href, this.download]);
        },
        remove() { body.children.splice(body.children.indexOf(this), 1); events.push(['removed']); },
      };
    },
  };
  mock.method(URL, 'createObjectURL', (blob) => { const url = `blob:test/${++n}`; live.add(url); events.push(['create', url, blob.size, blob.type]); return url; });
  mock.method(URL, 'revokeObjectURL', (url) => { live.delete(url); events.push(['revoke', url]); });
  return { events, live, body, restore: () => { delete globalThis.document; mock.restoreAll(); } };
}

test('backup completion: one call reads, writes and names a non-empty ZIP; its failure is an error, never a quiet return', async () => {
  const db = await seededDb();
  await fullProject(db);
  const progress = [];
  const at = new Date('2026-09-29T12:00:00Z');
  const result = await backup.makeProjectBackup(as(db, ALICE), HOLLOW, (kind, i, total) => progress.push(`${i + 1}/${total}`), at);
  assert.ok(result.bytes.length > 1000, `${result.bytes.length} bytes`);
  assert.deepEqual([...result.bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04], 'a ZIP');
  assert.match(result.fileName, /^.+ – Rune backup 2026-09-29\.zip$/);
  assert.equal(progress.at(-1), `${progress.length}/${progress.length}`, 'every kind reported, to the last');
  assert.ok(zip.openZip(result.bytes).has('manifest.json'));
  await assert.rejects(backup.makeProjectBackup(as(db, BRAM), HOLLOW), /isn’t available to back up/);
  await db.query(`drop function public.read_project_backup(uuid, text, text, integer)`);
  await assert.rejects(backup.makeProjectBackup(as(db, ALICE), HOLLOW), (e) => e instanceof backup.BackupUnavailableError);
});

test('download handoff: one object URL, an <a download> click with the file name while it is live, kept for the fallback link until released, released once', () => {
  const b = fakeBrowser();
  try {
    const bytes = new Uint8Array([0x50, 0x4b, 1, 2, 3]);
    const d = download.prepareDownload(bytes, 'The Hollow – Rune backup 2026-09-29.zip', 'application/zip');
    assert.deepEqual(b.events, [['create', 'blob:test/1', 5, 'application/zip']]);
    assert.equal(d.url, 'blob:test/1');
    assert.equal(d.size, 5);
    d.start();
    assert.deepEqual(b.events.slice(1), [['click', 'blob:test/1', 'The Hollow – Rune backup 2026-09-29.zip'], ['removed']]);
    assert.equal(b.body.children.length, 0, 'the anchor is cleaned up');
    assert.ok(b.live.has(d.url), 'not revoked on start: the fallback link still works');
    d.start();
    assert.equal(b.events.filter((e) => e[0] === 'click').length, 2, 'starting again (the fallback) uses the same file');
    d.release();
    d.release();
    assert.deepEqual(b.events.filter((e) => e[0] === 'revoke'), [['revoke', 'blob:test/1']], 'released exactly once');
    assert.throws(() => d.start(), /already released/);
    assert.throws(() => download.prepareDownload(new Uint8Array(0), 'x.zip', 'application/zip'), /empty file/);
    assert.equal(b.events.filter((e) => e[0] === 'create').length, 1, 'an empty file never becomes a URL');
  } finally {
    b.restore();
  }
});

test('download handoff: a refused click is an error (and frees the file); saveFile keeps the URL long enough, then revokes it', () => {
  const blocked = fakeBrowser({ clickThrows: true });
  try {
    const d = download.prepareDownload(new Uint8Array([1]), 'a.zip', 'application/zip');
    assert.throws(() => d.start(), /blocked/, 'the dialog sees the failure and shows its error and the link');
    assert.equal(blocked.body.children.length, 0, 'the anchor is removed even so');
    assert.throws(() => download.saveFile(new Uint8Array([1]), 'b.pdf', 'application/pdf'), /blocked/);
    assert.ok(!blocked.live.has('blob:test/2'), 'saveFile frees a file whose download never started');
  } finally {
    blocked.restore();
  }
  const b = fakeBrowser();
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    download.saveFile(new Uint8Array([1, 2]), 'book.docx', 'application/octet-stream');
    assert.deepEqual(b.events.map((e) => e[0]), ['create', 'click', 'removed']);
    mock.timers.tick(59_000);
    assert.ok(b.live.has('blob:test/1'), 'not revoked while the browser may still be starting the download');
    mock.timers.tick(1_000);
    assert.deepEqual(b.events.at(-1), ['revoke', 'blob:test/1']);
  } finally {
    mock.timers.reset();
    b.restore();
  }
});
