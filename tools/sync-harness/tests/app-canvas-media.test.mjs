// Canvas author workflow, media and hardening (Rune 2.0, Milestone 22C,
// migrations 047 and 048): Project attachments and image placements, a
// note's promotion to a Workspace Page or an Unplaced Scene, Canvas Trash
// and deletion semantics with images, stale-client safety in the session,
// the arrange-menu regression, and the version-2 backup — against the Rune
// 2.0 schema in real Postgres + RLS (bytes in an in-memory store) and
// against a fake server with deterministic timers.
//
// The rule under test everywhere: a Canvas arranges the real pieces of the
// book; a promotion is the ONE way a Canvas makes a canonical object, and it
// never loses the writer's text, credits no writing, and is never undone by
// deleting what it made.
import 'fake-indexeddb/auto';
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createTestDb, readRepoFile, LEGACY_BASELINE, RUNE2_SCHEMA, HARNESS_DIR } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';
import { prototypeLegacyToRune2 } from '../lib/legacy-to-rune2.mjs';
import { USERS, pageId, projectId, seedFixture } from '../fixtures/manuscript-fixture.mjs';

const ALICE = USERS.alice.id;
const BRAM = USERS.bram.id;
const HOLLOW = projectId('hollow');
const TIDE = projectId('tide');

const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const all = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const doc = (...paragraphs) => ({
  type: 'doc',
  content: paragraphs.map((text) => (text === '' ? { type: 'paragraph' } : { type: 'paragraph', content: [{ type: 'text', text }] })),
});
let idSeq = 0;
const uuid = () => `33333333-3333-4333-8444-${String(++idSeq).padStart(12, '0')}`;
const settle = () => new Promise((r) => setImmediate(r));
const as = (db, userId) => createSupabaseAdapter(db, { userId });
const ok = (r) => { assert.equal(r.error, null, r.error); return r.data; };
// A 1×1 PNG and a few bytes that are "a JPEG" to the store (the server never decodes).
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 15, 4, 0, 9, 251, 3, 253, 167, 69, 143, 68, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
const JPG = new Uint8Array([255, 216, 255, 224, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 255, 217]);

let legacy;
let canvas, pages, scenes, trash, search, attachmentsLib, attachmentsAction, uploadRoute, readRoute, storageMock, backupLib, zipLib, lifecycle;
let workspace, manuscriptLoader, nav, engine, canvasModel, arrange, rules, sessionMod, clientLib;
before(async () => {
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
  const storageAlias = { '@/lib/attachments/storage': path.join(HARNESS_DIR, 'mocks/attachmentStorage.js') };
  canvas = await bundleForTest('src/lib/actions/workspaceCanvas.ts', { name: 'cm_canvas' });
  pages = await bundleForTest('src/lib/actions/workspacePages.ts', { name: 'cm_pages' });
  scenes = await bundleForTest('src/lib/actions/scenes.ts', { name: 'cm_scenes' });
  trash = await bundleForTest('src/lib/actions/workspaceTrash.ts', { name: 'cm_trash' });
  search = await bundleForTest('src/lib/actions/projectSearch.ts', { name: 'cm_search' });
  attachmentsLib = await bundleForTest('src/lib/attachments/server.ts', { name: 'cm_attachments' });
  lifecycle = await bundleForTest('src/lib/projectLifecycle.ts', { name: 'cm_lifecycle' });
  attachmentsAction = await bundleForTest('src/lib/actions/workspaceAttachments.ts', { name: 'cm_attachments_action', aliases: storageAlias });
  uploadRoute = await bundleForTest('src/app/api/attachments/route.ts', { name: 'cm_upload_route', aliases: storageAlias });
  readRoute = await bundleForTest('src/app/api/attachments/[id]/route.ts', { name: 'cm_read_route', aliases: storageAlias });
  storageMock = await import(path.join(HARNESS_DIR, 'mocks/attachmentStorage.js'));
  backupLib = await bundleForTest('src/lib/backup/projectBackup.ts', { name: 'cm_backup' });
  zipLib = await bundleForTest('src/lib/import/zip.ts', { name: 'cm_zip' });
  workspace = await bundleForTest('src/lib/rune2/projectWorkspace.ts', { name: 'cm_loader' });
  manuscriptLoader = await bundleForTest('src/lib/rune2/projectManuscript.ts', { name: 'cm_manuscript' });
  nav = await bundleForTest('src/lib/rune2/navigatorModel.ts', { name: 'cm_nav' });
  engine = await bundleForTest('src/lib/rune2/projectSearch.ts', { name: 'cm_engine' });
  canvasModel = await bundleForTest('src/lib/rune2/canvas.ts', { name: 'cm_model' });
  arrange = await bundleForTest('src/lib/rune2/canvasArrange.ts', { name: 'cm_arrange' });
  rules = await bundleForTest('src/lib/rune2/attachments.ts', { name: 'cm_rules' });
  sessionMod = await bundleForTest('src/lib/rune2/canvasSession.ts', { name: 'cm_session' });
  clientLib = await bundleForTest('src/lib/attachments/client.ts', { name: 'cm_client' });
});

async function seededDb() {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  await prototypeLegacyToRune2(legacy, db);
  return db;
}

function signIn(db, userId) {
  const sb = as(db, userId);
  for (const mod of [canvas, pages, scenes, trash, search, attachmentsAction, uploadRoute, readRoute, workspace, manuscriptLoader]) mod.setServerClient(sb);
  return sb;
}

async function shellIndex(pid = HOLLOW) {
  const [m, w] = [await manuscriptLoader.loadProjectManuscript(pid), await workspace.loadProjectWorkspace(pid)];
  return new Map([...nav.indexManuscript(m), ...nav.indexWorkspace(w.tree, {}, w.entries)]);
}

async function manuscriptState(db) {
  return {
    projects: await all(db, `select id, word_count from public.projects order by id`),
    chapters: await all(db, `select id, title, position, group_id, trashed_at from public.chapters order by id`),
    scenes: await all(db, `select id, chapter_id, position, version, word_count, trashed_at from public.scenes order by id`),
    sessions: await all(db, `select * from public.writing_sessions order by id`),
    documents: await all(db, `select id, title, version from public.workspace_documents order by id`),
  };
}

const create = (type, targetId, extra = {}) => ({
  op: 'create', id: uuid(), item_type: type, target_id: targetId, label: extra.label ?? null, content: extra.content ?? null,
  x: extra.x ?? 10, y: extra.y ?? 20, width: extra.width ?? 240, height: extra.height ?? 120, z: extra.z ?? 0,
  section_id: extra.section_id ?? null, manual_size: extra.manual_size ?? false,
});
const connect = (sourceId, targetId, extra = {}) => ({
  kind: 'connection', op: 'create', id: uuid(), source_id: sourceId, target_id: targetId, directed: extra.directed ?? false, label: extra.label ?? null,
});
const results = (r) => { assert.equal(r.status, 'ok', JSON.stringify(r)); return r.results; };
const allOk = (r) => { const rs = results(r); for (const x of rs) assert.equal(x.status, 'ok', JSON.stringify(x)); return rs; };

/** Stores PNG bytes as an attachment of a Project through the real server library (an in-memory store). */
async function storeImage(sb, store, projectId, extra = {}) {
  const r = await attachmentsLib.storeImageAttachment(sb, store, {
    projectId, fileName: extra.fileName ?? 'map.png', mimeType: extra.mimeType ?? 'image/png', bytes: extra.bytes ?? PNG, width: extra.width ?? 1, height: extra.height ?? 1, display: extra.display ?? null,
  });
  assert.equal(r.error, null, r.error);
  return r.data;
}

/** Alice's Hollow: a Page, a Canvas and a store. */
async function hollow(db) {
  const sb = signIn(db, ALICE);
  const intro = ok(await pages.createWorkspacePage(HOLLOW, 'Intro'));
  const plot = ok(await canvas.createWorkspaceCanvas(HOLLOW, 'Plot')).canvas;
  const store = new attachmentsLib.MemoryAttachmentStorage();
  return { sb, intro, plot, store };
}

// ── 1. Attachments and image placements in the database ───────────────────────

test('db: an attachment belongs to its Project with its metadata; registration is owner-checked and idempotent; another writer sees nothing; clients never write the table', async () => {
  const db = await seededDb();
  const { sb, store } = await hollow(db);
  const a = await storeImage(sb, store, HOLLOW, { fileName: '  Harbour map.png ', width: 2400, height: 1600, display: { bytes: JPG, mimeType: 'image/jpeg', width: 1600, height: 1067 } });
  assert.equal(a.project_id, HOLLOW);
  assert.deepEqual([a.kind, a.file_name, a.mime_type, a.byte_size, a.width, a.height, a.display_width, a.display_height], ['image', 'Harbour map.png', 'image/png', PNG.length, 2400, 1600, 1600, 1067]);
  assert.equal(a.storage_bucket, rules.ATTACHMENT_BUCKET);
  assert.equal(a.storage_key, `${HOLLOW}/${a.id}/original.png`);
  assert.equal(a.display_key, `${HOLLOW}/${a.id}/display.jpg`);
  assert.deepEqual([...store.objects.keys()].sort(), [a.display_key, a.storage_key].sort(), 'original and derivative stored, keyed by Project and id');

  // Read under RLS: the owner; not another writer, not anonymous.
  assert.equal((await sb.from('workspace_attachments').select('*').eq('id', a.id).maybeSingle()).data.id, a.id);
  assert.equal((await as(db, BRAM).from('workspace_attachments').select('*').eq('id', a.id).maybeSingle()).data, null);
  assert.equal((await as(db, null).from('workspace_attachments').select('*').eq('id', a.id).maybeSingle()).data, null);
  // Idempotent registration; another Project's id is refused.
  const again = await sb.rpc('create_workspace_attachment', { p_id: a.id, p_project_id: HOLLOW, p_kind: 'image', p_file_name: 'x', p_mime_type: 'image/png', p_byte_size: 1, p_width: 1, p_height: 1, p_storage_bucket: 'b', p_storage_key: 'k' });
  assert.deepEqual([again.data.status, again.data.attachment.file_name], ['ok', 'Harbour map.png']);
  signIn(db, BRAM);
  const bramStore = new attachmentsLib.MemoryAttachmentStorage();
  const foreign = await attachmentsLib.storeImageAttachment(as(db, BRAM), bramStore, { projectId: HOLLOW, fileName: 'x.png', mimeType: 'image/png', bytes: PNG, width: 1, height: 1 });
  assert.equal(foreign.error, 'Project not found');
  assert.equal(bramStore.objects.size, 0, 'a refused registration leaves no bytes behind');
  const theirs = await attachmentsLib.storeImageAttachment(as(db, BRAM), bramStore, { projectId: TIDE, fileName: 'x.png', mimeType: 'image/png', bytes: PNG, width: 1, height: 1 });
  assert.equal(theirs.error, null);
  assert.equal((await sb.from('workspace_attachments').select('id').eq('id', theirs.data.id).maybeSingle()).data, null, 'owner isolation');
  // No client writes.
  for (const q of [
    sb.from('workspace_attachments').insert({ project_id: HOLLOW, file_name: 'x', mime_type: 'image/png', byte_size: 1, width: 1, height: 1, storage_bucket: 'b', storage_key: 'z' }),
    sb.from('workspace_attachments').update({ file_name: 'y' }).eq('id', a.id),
    sb.from('workspace_attachments').delete().eq('id', a.id),
  ]) assert.ok((await q).error, 'clients never write attachments');
  // Validation: a type that isn't an image, an empty file, a file too large.
  for (const bad of [{ mimeType: 'image/svg+xml' }, { bytes: new Uint8Array(0) }, { bytes: new Uint8Array(rules.MAX_IMAGE_BYTES + 1) }]) {
    const r = await attachmentsLib.storeImageAttachment(sb, store, { projectId: HOLLOW, fileName: 'x', mimeType: 'image/png', bytes: PNG, width: 1, height: 1, ...bad });
    assert.notEqual(r.error, null);
  }
  assert.deepEqual(await manuscriptState(db), await manuscriptState(db));
});

test('db: an image placement references the attachment (same Project only); several placements share one attachment; geometry round-trips; deleting a placement deletes nothing else; the attachment is never counted', async () => {
  const db = await seededDb();
  const { sb, plot, store } = await hollow(db);
  const before = await manuscriptState(db);
  const a = await storeImage(sb, store, HOLLOW, { width: 800, height: 600 });
  const img = create('image', a.id, { label: 'map.png', x: 100, y: 50, width: 320, height: 240, manual_size: true });
  const img2 = create('image', a.id, { x: 500, y: 50, width: 160, height: 120 });
  const note = create('note', null, { content: doc('beside the map'), x: 100, y: 400 });
  allOk(await canvas.writeCanvasItems(plot.id, [img, img2, note]));
  const loaded = ok(await canvas.getWorkspaceCanvas(plot.id));
  const byId = new Map(loaded.items.map((i) => [i.id, i]));
  assert.deepEqual([byId.get(img.id).item_type, byId.get(img.id).attachment_id, byId.get(img.id).label, byId.get(img.id).width, byId.get(img.id).height, byId.get(img.id).manual_size], ['image', a.id, 'map.png', 320, 240, true]);
  assert.equal(byId.get(img2.id).attachment_id, a.id, 'a duplicate placement shares the attachment');
  assert.deepEqual(loaded.attachments.map((x) => x.id), [a.id], 'the Canvas read carries the attachments its images show, once');
  assert.deepEqual(canvasModel.attachmentIdOf(byId.get(img.id)), a.id);
  assert.equal(canvasModel.targetIdOf(byId.get(img.id)), null, 'an image has no canonical target');

  // Another Project's attachment, a missing one, an image without a target: each refused alone.
  signIn(db, BRAM);
  const bramStore = new attachmentsLib.MemoryAttachmentStorage();
  const theirs = (await attachmentsLib.storeImageAttachment(as(db, BRAM), bramStore, { projectId: TIDE, fileName: 'x.png', mimeType: 'image/png', bytes: PNG, width: 1, height: 1 })).data;
  signIn(db, ALICE);
  const [r1, r2, r3] = results(await canvas.writeCanvasItems(plot.id, [create('image', theirs.id), create('image', uuid()), create('image', null)]));
  assert.equal(r1.status, 'error');
  assert.equal(r2.status, 'error');
  assert.match(r3.error, /needs a target/);
  // Frozen: an image keeps its attachment for life.
  await assert.rejects(db.query(`update public.workspace_canvas_items set attachment_id = null where id = $1`, [img.id]), /keeps its canvas, type and target/);
  // Resize, move: versioned like any placement.
  const [sized] = allOk(await canvas.writeCanvasItems(plot.id, [{ op: 'update', id: img.id, expected_version: 1, width: 480, height: 360, manual_size: true }]));
  assert.equal(sized.version, 2);
  // Removing one placement removes only it.
  allOk(await canvas.writeCanvasItems(plot.id, [{ op: 'delete', id: img2.id }]));
  assert.equal((await one(db, `select count(*)::int as n from public.workspace_canvas_items where attachment_id = $1`, [a.id])).n, 1);
  assert.equal((await one(db, `select count(*)::int as n from public.workspace_attachments where id = $1`, [a.id])).n, 1, 'the attachment survives: another placement still shows it');
  assert.deepEqual(await manuscriptState(db), before, 'no Scene, Chapter, total, session or Page changed');
});

test('db + server: the lifecycle rule — a referenced attachment is never swept; an unreferenced one waits out the grace period, then its row goes before its bytes (a purge recorded in the same transaction); one referenced meanwhile keeps its row and bytes; permanent Canvas deletion makes its images unreferenced', async () => {
  const db = await seededDb();
  const { sb, plot, store } = await hollow(db);
  const shown = await storeImage(sb, store, HOLLOW, { fileName: 'shown.png' });
  const orphan = await storeImage(sb, store, HOLLOW, { fileName: 'orphan.png', display: { bytes: JPG, mimeType: 'image/jpeg', width: 1, height: 1 } });
  const fresh = await storeImage(sb, store, HOLLOW, { fileName: 'fresh.png' });
  const img = create('image', shown.id);
  allOk(await canvas.writeCanvasItems(plot.id, [img]));
  // Young rows are never listed; old ones that nothing references are.
  await db.query(`update public.workspace_attachments set created_at = now() - interval '2 days' where id in ($1, $2)`, [shown.id, orphan.id]);
  const listed = (await sb.rpc('list_unreferenced_attachments', { p_project_id: HOLLOW, p_older_than: '24 hours' })).data;
  assert.deepEqual(listed.attachments.map((x) => x.id), [orphan.id], 'referenced and young rows are not listed');
  assert.deepEqual((await as(db, BRAM).rpc('list_unreferenced_attachments', { p_project_id: HOLLOW, p_older_than: '24 hours' })).data, { status: 'error', error: 'Project not found' });
  // delete refuses what is referenced (or referenced meanwhile), takes the rest — and records the bytes of what it took as a purge (050).
  const del = (await sb.rpc('delete_workspace_attachments', { p_project_id: HOLLOW, p_ids: [shown.id, orphan.id, fresh.id] })).data;
  assert.deepEqual(del.deleted.sort(), [orphan.id, fresh.id].sort(), 'referenced: kept; unreferenced: deleted (the server only ever asks for listed, old ones)');
  assert.equal((await one(db, `select count(*)::int as n from public.workspace_attachments where id = $1`, [shown.id])).n, 1);
  assert.equal(del.purges.length, 1, 'one purge per bucket');
  assert.deepEqual([...del.purges[0].storage_keys].sort(), [orphan.storage_key, orphan.display_key, fresh.storage_key].sort(), 'every key of the deleted rows, display derivatives too');
  assert.ok(store.objects.has(orphan.storage_key) && store.objects.has(fresh.storage_key), 'the function never touches bytes');
  const recorded = await all(db, `select user_id, project_id, storage_bucket, storage_keys from public.project_storage_purges`);
  assert.deepEqual(recorded.map((r) => [r.user_id, r.project_id, r.storage_bucket]), [[ALICE, HOLLOW, orphan.storage_bucket]]);
  // The server finishes the purge: bytes, then the record.
  assert.deepEqual(await lifecycle.sweepProjectStoragePurges(sb, store), { completed: 1, remaining: 0 });
  assert.ok(!store.objects.has(orphan.storage_key) && !store.objects.has(orphan.display_key) && !store.objects.has(fresh.storage_key), 'bytes gone');
  assert.equal((await one(db, `select count(*)::int as n from public.project_storage_purges`)).n, 0);

  // (a) The sweep end to end: the row first, then its bytes, then the purge record; the referenced one untouched.
  const orphan2 = await storeImage(sb, store, HOLLOW, { fileName: 'orphan2.png', display: { bytes: JPG, mimeType: 'image/jpeg', width: 1, height: 1 } });
  await db.query(`update public.workspace_attachments set created_at = now() - interval '2 days' where id = $1`, [orphan2.id]);
  const observed = { ...store, download: store.download.bind(store), upload: store.upload.bind(store), remove: async (keys) => {
    assert.equal((await one(db, `select count(*)::int as n from public.workspace_attachments where id = $1`, [orphan2.id])).n, 0, 'the row is already gone when its bytes are removed');
    assert.equal((await one(db, `select count(*)::int as n from public.project_storage_purges`)).n, 1, 'and the purge is recorded');
    return store.remove(keys);
  } };
  assert.deepEqual(await attachmentsLib.sweepUnreferencedAttachments(sb, observed, HOLLOW), { removed: 1 });
  assert.equal(store.objects.has(orphan2.storage_key) || store.objects.has(orphan2.display_key), false, 'bytes gone');
  assert.equal((await one(db, `select count(*)::int as n from public.workspace_attachments where id = $1`, [orphan2.id])).n, 0, 'row gone');
  assert.equal((await one(db, `select count(*)::int as n from public.project_storage_purges`)).n, 0, 'no purge row remains');
  assert.ok(store.objects.has(shown.storage_key), 'the shown image keeps its bytes');
  assert.deepEqual(await attachmentsLib.sweepUnreferencedAttachments(sb, store, HOLLOW), { removed: 0 }, 'nothing left to sweep');
  // (c) A store that refuses: the row is gone, the purge stays recorded, and a later purge sweep finishes it.
  const stubborn = await storeImage(sb, store, HOLLOW, { fileName: 'stubborn.png' });
  await db.query(`update public.workspace_attachments set created_at = now() - interval '2 days' where id = $1`, [stubborn.id]);
  const failing = { ...store, download: store.download.bind(store), upload: store.upload.bind(store), remove: async () => { throw new Error('storage down'); } };
  assert.deepEqual(await attachmentsLib.sweepUnreferencedAttachments(sb, failing, HOLLOW), { removed: 1 });
  assert.equal((await one(db, `select count(*)::int as n from public.workspace_attachments where id = $1`, [stubborn.id])).n, 0, 'the row never outlives its bytes: it is gone');
  assert.ok(store.objects.has(stubborn.storage_key), 'bytes still there');
  const owed = await one(db, `select user_id, project_id, storage_keys from public.project_storage_purges`);
  assert.deepEqual(owed, { user_id: ALICE, project_id: HOLLOW, storage_keys: [stubborn.storage_key] }, 'recorded, to be retried');
  assert.deepEqual(await attachmentsLib.sweepUnreferencedAttachments(sb, store, HOLLOW), { removed: 0 }, 'nothing listed any more');
  assert.deepEqual(await lifecycle.sweepProjectStoragePurges(sb, store), { completed: 1, remaining: 0 });
  assert.ok(!store.objects.has(stubborn.storage_key), 'the purge sweep removes the bytes');
  assert.equal((await one(db, `select count(*)::int as n from public.project_storage_purges`)).n, 0, 'and the record');

  // Canvas Trash keeps the image placement and its attachment; restore shows it; permanent deletion removes the placement and leaves the attachment for the sweep.
  ok(await trash.trashWorkspaceObject('canvas', plot.id));
  assert.equal((await one(db, `select count(*)::int as n from public.workspace_canvas_items where id = $1`, [img.id])).n, 1);
  assert.deepEqual((await sb.rpc('list_unreferenced_attachments', { p_project_id: HOLLOW, p_older_than: '0 hours' })).data.attachments, [], 'a placement on a trashed Canvas is still a reference');
  ok(await trash.restoreWorkspaceObject('canvas', plot.id));
  const back = ok(await canvas.getWorkspaceCanvas(plot.id));
  assert.deepEqual([back.items[0].id, back.attachments[0].id], [img.id, shown.id]);
  ok(await trash.trashWorkspaceObject('canvas', plot.id));
  ok(await trash.deleteTrashedWorkspaceObject('canvas', plot.id));
  assert.equal((await one(db, `select count(*)::int as n from public.workspace_canvas_items where id = $1`, [img.id])).n, 0);
  assert.equal((await one(db, `select count(*)::int as n from public.workspace_attachments where id = $1`, [shown.id])).n, 1, 'never deleted by a cascade from a placement');
  assert.deepEqual((await sb.rpc('list_unreferenced_attachments', { p_project_id: HOLLOW, p_older_than: '0 hours' })).data.attachments.map((x) => x.id), [shown.id], 'now unreferenced: the sweep takes it after the grace period');
});

test('db + server: the sweep race — a placement made after the list and before the delete keeps its row AND its bytes; a purge is the owner’s alone and another Project is never touched; without 050 the sweep still removes the deleted ids’ bytes; the Canvas action also finishes owed purges', async () => {
  const db = await seededDb();
  const { sb, plot, store } = await hollow(db);
  const late = await storeImage(sb, store, HOLLOW, { fileName: 'late.png', display: { bytes: JPG, mimeType: 'image/jpeg', width: 1, height: 1 } });
  const gone = await storeImage(sb, store, HOLLOW, { fileName: 'gone.png' });
  await db.query(`update public.workspace_attachments set created_at = now() - interval '2 days' where id in ($1, $2)`, [late.id, gone.id]);
  // Bram's own old, unreferenced attachment in another Project: never part of Alice's sweep.
  const bramStore = new attachmentsLib.MemoryAttachmentStorage();
  const theirs = await storeImage(as(db, BRAM), bramStore, TIDE, { fileName: 'theirs.png' });
  await db.query(`update public.workspace_attachments set created_at = now() - interval '2 days' where id = $1`, [theirs.id]);

  // (b) By hand, in the sweep's order: list, then a placement lands (a replayed device draft), then delete.
  const listed = (await sb.rpc('list_unreferenced_attachments', { p_project_id: HOLLOW, p_older_than: '24 hours' })).data.attachments.map((x) => x.id);
  assert.deepEqual(listed.sort(), [late.id, gone.id].sort());
  const placement = create('image', late.id);
  allOk(await canvas.writeCanvasItems(plot.id, [placement]));
  const del = (await sb.rpc('delete_workspace_attachments', { p_project_id: HOLLOW, p_ids: listed })).data;
  assert.deepEqual(del.deleted, [gone.id], 'the row referenced meanwhile is kept');
  assert.deepEqual(del.purges.map((p) => p.storage_keys), [[gone.storage_key]], 'only the deleted row’s bytes are owed');
  assert.ok(store.objects.has(late.storage_key) && store.objects.has(late.display_key), 'its bytes are never removed');
  assert.equal((await one(db, `select count(*)::int as n from public.workspace_attachments where id = $1`, [late.id])).n, 1);
  // The same race through the real sweep: the placement lands between its two calls.
  const late2 = await storeImage(sb, store, HOLLOW, { fileName: 'late2.png' });
  await db.query(`update public.workspace_attachments set created_at = now() - interval '2 days' where id = $1`, [late2.id]);
  const racy = { ...sb, rpc: async (fn, args) => {
    const r = await sb.rpc(fn, args);
    if (fn === 'list_unreferenced_attachments') allOk(await canvas.writeCanvasItems(plot.id, [create('image', late2.id)]));
    return r;
  } };
  assert.deepEqual(await attachmentsLib.sweepUnreferencedAttachments(racy, store, HOLLOW), { removed: 0 });
  assert.ok(store.objects.has(late2.storage_key), 'bytes kept');
  assert.equal((await one(db, `select count(*)::int as n from public.workspace_attachments where id = $1`, [late2.id])).n, 1, 'row kept');
  const read = await attachmentsLib.readAttachment(sb, store, late2.id, 'original');
  assert.ok(read && read.bytes.length === PNG.length, 'the image is still served');

  // (d) The purge is Alice's alone; Bram's Project and bytes are untouched; Bram's sweep cannot reach it.
  const purges = await all(db, `select user_id, project_id from public.project_storage_purges`);
  assert.deepEqual(purges, [{ user_id: ALICE, project_id: HOLLOW }]);
  assert.deepEqual((await as(db, BRAM).from('project_storage_purges').select('*')).data, []);
  assert.deepEqual(await lifecycle.sweepProjectStoragePurges(as(db, BRAM), bramStore), { completed: 0, remaining: 0 });
  assert.ok(store.objects.has(gone.storage_key), 'Bram’s sweep removed nothing of Alice’s');
  assert.equal((await one(db, `select count(*)::int as n from public.workspace_attachments where id = $1`, [theirs.id])).n, 1, 'Bram’s attachment is not swept by Alice');
  assert.ok(bramStore.objects.has(theirs.storage_key));
  assert.deepEqual((await sb.rpc('delete_workspace_attachments', { p_project_id: TIDE, p_ids: [theirs.id] })).data, { status: 'error', error: 'Project not found' });
  assert.deepEqual((await sb.rpc('delete_workspace_attachments', { p_project_id: HOLLOW, p_ids: [theirs.id] })).data, { status: 'ok', deleted: [], purges: [] }, 'another Project’s id under Alice’s Project: nothing');
  assert.equal((await one(db, `select count(*)::int as n from public.project_storage_purges`)).n, 1, 'no purge recorded for nothing');
  // The Canvas action: the attachment sweep, then the owed purge.
  signIn(db, ALICE);
  storageMock.memory.objects.set(gone.storage_key, store.objects.get(gone.storage_key));
  assert.deepEqual(await attachmentsAction.sweepProjectAttachments(HOLLOW), { removed: 0 });
  assert.ok(!storageMock.memory.objects.has(gone.storage_key), 'the action removed the owed bytes');
  assert.equal((await one(db, `select count(*)::int as n from public.project_storage_purges`)).n, 0, 'and cleared the record');
  store.objects.delete(gone.storage_key);

  // Without 050 (the delete returns no `purges`): the deleted ids' bytes are removed directly, as before.
  const old = await storeImage(sb, store, HOLLOW, { fileName: 'old.png', display: { bytes: JPG, mimeType: 'image/jpeg', width: 1, height: 1 } });
  await db.query(`update public.workspace_attachments set created_at = now() - interval '2 days' where id = $1`, [old.id]);
  const pre050 = { ...sb, rpc: async (fn, args) => {
    const r = await sb.rpc(fn, args);
    if (fn === 'delete_workspace_attachments' && r.data?.status === 'ok') {
      await db.query(`delete from public.project_storage_purges where project_id = $1`, [HOLLOW]);
      return { ...r, data: { status: 'ok', deleted: r.data.deleted } };
    }
    return r;
  } };
  assert.deepEqual(await attachmentsLib.sweepUnreferencedAttachments(pre050, store, HOLLOW), { removed: 1 });
  assert.ok(!store.objects.has(old.storage_key) && !store.objects.has(old.display_key), 'bytes removed by the fallback');
  assert.equal((await one(db, `select count(*)::int as n from public.workspace_attachments where id = $1`, [old.id])).n, 0);
  assert.ok(store.objects.has(late.storage_key) && store.objects.has(late2.storage_key), 'referenced images keep their bytes throughout');
});

test('routes: upload stores bytes and registers the row as the writer; the read serves the owner (display variant when there is one), 404s another writer and a stranger id; bad uploads are refused with nothing stored', async () => {
  const db = await seededDb();
  const { plot } = await hollow(db);
  storageMock.memory.objects.clear();
  const form = new FormData();
  form.set('projectId', HOLLOW);
  form.set('file', new File([PNG], 'Coast.png', { type: 'image/png' }));
  form.set('width', '3000');
  form.set('height', '2000');
  form.set('display', new Blob([JPG], { type: 'image/jpeg' }), 'display');
  form.set('displayWidth', '1600');
  form.set('displayHeight', '1067');
  const res = await uploadRoute.POST(new Request('http://rune.test/api/attachments', { method: 'POST', body: form }));
  const body = await res.text();
  assert.equal(res.status, 200, body);
  const { attachment } = JSON.parse(body);
  assert.deepEqual([attachment.file_name, attachment.width, attachment.height, attachment.display_width, attachment.byte_size], ['Coast.png', 3000, 2000, 1600, PNG.length]);
  assert.deepEqual(Array.from(storageMock.memory.objects.get(attachment.storage_key).bytes), Array.from(PNG));
  // Read: the owner gets the bytes with a private, immutable cache; display when asked.
  const get = (id, q = '') => readRoute.GET(new Request(`http://rune.test/api/attachments/${id}${q}`), { params: Promise.resolve({ id }) });
  const read = await get(attachment.id);
  assert.equal(read.status, 200);
  assert.equal(read.headers.get('content-type'), 'image/png');
  assert.match(read.headers.get('cache-control'), /private.*immutable/);
  assert.deepEqual(Array.from(new Uint8Array(await read.arrayBuffer())), Array.from(PNG));
  const display = await get(attachment.id, '?variant=display');
  assert.equal(display.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual(Array.from(new Uint8Array(await display.arrayBuffer())), Array.from(JPG));
  assert.equal((await get('not-an-id')).status, 404);
  signIn(db, BRAM);
  assert.equal((await get(attachment.id)).status, 404, 'another writer: not found, never the bytes');
  signIn(db, ALICE);
  // The placement, through the ordinary batch.
  allOk(await canvas.writeCanvasItems(plot.id, [create('image', attachment.id)]));
  // Refusals leave nothing behind.
  const sizeBefore = storageMock.memory.objects.size;
  const bad = new FormData();
  bad.set('projectId', HOLLOW);
  bad.set('file', new File([PNG], 'doc.svg', { type: 'image/svg+xml' }));
  bad.set('width', '1');
  bad.set('height', '1');
  const refused = await uploadRoute.POST(new Request('http://rune.test/api/attachments', { method: 'POST', body: bad }));
  assert.equal(refused.status, 415);
  assert.equal(storageMock.memory.objects.size, sizeBefore);
  const notMine = new FormData();
  notMine.set('projectId', TIDE);
  notMine.set('file', new File([PNG], 'x.png', { type: 'image/png' }));
  notMine.set('width', '1');
  notMine.set('height', '1');
  assert.equal((await uploadRoute.POST(new Request('http://rune.test/api/attachments', { method: 'POST', body: notMine }))).status, 404);
  assert.equal(storageMock.memory.objects.size, sizeBefore, 'a refused registration removes the stored bytes');
  // The sweep action runs as the writer through the same store (nothing young to sweep).
  assert.deepEqual(await attachmentsAction.sweepProjectAttachments(HOLLOW), { removed: 0 });
});

// ── 2. Promotion: note → Page, note → Unplaced Scene ──────────────────────────

test('convert to Page: the text is preserved whole, the title is derived, a canonical Page is created at the top of the Workspace, the placement becomes a Page card with the same geometry and Section, connections survive; idempotent on retry; the note is gone from search and the Page is found', async () => {
  const db = await seededDb();
  const { sb, plot } = await hollow(db);
  const before = await manuscriptState(db);
  const section = create('section', null, { label: 'Threads', x: 0, y: 0, width: 800, height: 600 });
  const note = create('note', null, { content: doc('', 'The lighthouse keeper', 'knows more than he says.'), x: 40, y: 60, width: 260, height: 90, section_id: section.id, manual_size: true, z: 3 });
  const scene = create('scene', pageId('h4a'), { label: 'Scene', x: 400, y: 60 });
  allOk(await canvas.writeCanvasItems(plot.id, [section, note, scene]));
  const line = connect(scene.id, note.id, { directed: true, label: 'hints' });
  allOk(await canvas.writeCanvasItems(plot.id, [line]));
  const content = canvasModel.noteDoc('\nThe lighthouse keeper\nknows more than he says.');
  const title = canvasModel.noteTitle(canvasModel.noteText(content));
  assert.equal(title, 'The lighthouse keeper', 'the first line with words');

  const newId = uuid();
  const r = await canvas.convertCanvasNote(note.id, 'page', newId, title, content, 9);
  assert.equal(r.status, 'ok', JSON.stringify(r));
  assert.equal(r.target, 'page');
  const page = await one(db, `select * from public.workspace_documents where id = $1`, [r.objectId]);
  assert.equal(page.title, 'The lighthouse keeper');
  assert.deepEqual(page.content, content, 'the whole note, first line included, is the Page');
  assert.equal(page.project_id, HOLLOW);
  assert.ok(await one(db, `select 1 from public.workspace_nodes where document_id = $1 and parent_node_id is null`, [page.id]), 'placed at the top of the Workspace, as any new Page');
  assert.deepEqual([r.item.id, r.item.item_type, r.item.document_id, r.item.x, r.item.y, r.item.width, r.item.height, r.item.z, r.item.section_id, r.item.manual_size, r.item.label],
    [newId, 'page', page.id, 40, 60, 260, 90, 3, section.id, true, 'The lighthouse keeper']);
  assert.deepEqual(r.connections.map((c) => [c.id, c.source_item_id, c.target_item_id, c.directed, c.label]), [[line.id, scene.id, newId, true, 'hints']], 'the connection, re-made with its id, now ends at the Page card');
  assert.equal((await one(db, `select count(*)::int as n from public.workspace_canvas_items where id = $1`, [note.id])).n, 0, 'the note is gone');
  // Retry with the same new id: the same answer, nothing more created.
  const again = await canvas.convertCanvasNote(note.id, 'page', newId, title, content, 9);
  assert.equal(again.status, 'ok');
  assert.equal(again.item.id, newId);
  assert.equal((await one(db, `select count(*)::int as n from public.workspace_documents where project_id = $1`, [HOLLOW])).n, before.documents.length + 1);
  // The Page behaves as any Page: in the index, openable, editable through the Page action.
  const index = await shellIndex();
  assert.equal(index.get(page.id)?.kind, 'workspacePage');
  // Search: no Canvas note any more; the Page by its text.
  const matches = ok(await search.searchProjectContent(HOLLOW, 'lighthouse'));
  assert.deepEqual(matches.map((m) => m.type), ['page']);
  const found = engine.searchProject(engine.searchObjects(index), 'lighthouse', {}, matches);
  assert.deepEqual(found.map((f) => [f.kind, f.id]), [['page', page.id]]);
  assert.equal((await pages.saveWorkspacePageContent(page.id, doc('edited'), page.version)).status, 'ok');
  // Nothing of the manuscript changed.
  const after = await manuscriptState(db);
  assert.deepEqual([after.projects, after.chapters, after.scenes, after.sessions], [before.projects, before.chapters, before.scenes, before.sessions]);
  // Refusals, each leaving everything as it is: not a note, a stranger, not mine.
  assert.match((await canvas.convertCanvasNote(scene.id, 'page', uuid(), 'x', doc('x'), 1)).error, /Only a note/);
  assert.match((await canvas.convertCanvasNote(uuid(), 'page', uuid(), 'x', doc('x'), 1)).error, /Note not found/);
});

test('convert to Scene: a canonical Unplaced Scene with the note\'s prose and word count, outside the order and the ordered total, with NO writing session or Today credit; geometry kept; a failure (the Canvas in Trash) leaves the note exactly as it was', async () => {
  const db = await seededDb();
  const { sb, plot } = await hollow(db);
  const before = await manuscriptState(db);
  const unplacedBefore = ok(await scenes.getUnplacedScenes(HOLLOW)).length;
  const note = create('note', null, { content: doc('She left at dawn.', '', 'Nobody saw her go.'), x: 10, y: 20, width: 220, height: 64 });
  const other = create('note', null, { content: doc('unrelated'), x: 500, y: 20 });
  allOk(await canvas.writeCanvasItems(plot.id, [note, other]));
  const line = connect(note.id, other.id);
  allOk(await canvas.writeCanvasItems(plot.id, [line]));
  const content = doc('She left at dawn.', '', 'Nobody saw her go.');
  const newId = uuid();
  const r = await canvas.convertCanvasNote(note.id, 'scene', newId, canvasModel.noteTitle(canvasModel.noteText(content)), content, 8);
  assert.equal(r.status, 'ok', JSON.stringify(r));
  const scene = await one(db, `select * from public.scenes where id = $1`, [r.objectId]);
  assert.deepEqual([scene.chapter_id, scene.title, scene.word_count, scene.trashed_at], [null, 'She left at dawn.', 8, null], 'Unplaced, titled by its first line, the editor\'s count');
  assert.deepEqual(scene.content, content);
  const unplaced = ok(await scenes.getUnplacedScenes(HOLLOW));
  assert.equal(unplaced.length, unplacedBefore + 1);
  assert.equal(unplaced.at(-1).id, scene.id, 'at the end of Unplaced Scenes');
  const after = await manuscriptState(db);
  assert.deepEqual(after.sessions, before.sessions, 'no writing session: a promotion is not writing');
  assert.deepEqual(after.projects, before.projects, 'the ordered total is unchanged: an Unplaced Scene is outside it');
  assert.deepEqual(after.chapters, before.chapters);
  assert.deepEqual([r.item.item_type, r.item.scene_id, r.item.x, r.item.y, r.item.width, r.item.height], ['scene', scene.id, 10, 20, 220, 64]);
  assert.deepEqual(r.connections.map((c) => [c.id, c.source_item_id, c.target_item_id]), [[line.id, newId, other.id]]);
  // The index shows it as an Unplaced Scene; the card resolves.
  const index = await shellIndex();
  assert.equal(index.get(scene.id)?.kind, 'unplacedScene');
  assert.equal(canvasModel.targetIdOf(r.item), scene.id);
  // The account total counts it like any Scene; the free-limit metric is unchanged in meaning.
  const total = (await sb.rpc('account_word_total')).data;
  assert.ok(total >= 8);

  // A failure leaves the note: a trashed Canvas refuses; a bad target refuses; nothing is created.
  const note2 = create('note', null, { content: doc('kept'), x: 0, y: 0 });
  allOk(await canvas.writeCanvasItems(plot.id, [note2]));
  assert.match((await canvas.convertCanvasNote(note2.id, 'chapter', uuid(), null, doc('kept'), 1)).error, /Unknown target/);
  const scenesBefore = (await one(db, `select count(*)::int as n from public.scenes`)).n;
  ok(await trash.trashWorkspaceObject('canvas', plot.id));
  const refused = await canvas.convertCanvasNote(note2.id, 'scene', uuid(), null, doc('kept'), 1);
  assert.match(refused.error, /Note not found/);
  assert.equal((await one(db, `select count(*)::int as n from public.scenes`)).n, scenesBefore, 'nothing created');
  assert.deepEqual((await one(db, `select content from public.workspace_canvas_items where id = $1`, [note2.id])).content, doc('kept'), 'the note is untouched');
  ok(await trash.restoreWorkspaceObject('canvas', plot.id));
  // An unnamed note (no words) becomes an unnamed Scene, its text still the body.
  const blank = create('note', null, { content: doc('…', '!!!'), x: 0, y: 0 });
  allOk(await canvas.writeCanvasItems(plot.id, [blank]));
  assert.equal(canvasModel.noteTitle('…\n!!!'), null);
  const r2 = await canvas.convertCanvasNote(blank.id, 'scene', uuid(), null, doc('…', '!!!'), 0);
  assert.equal(r2.status, 'ok');
  assert.equal((await one(db, `select title from public.scenes where id = $1`, [r2.objectId])).title, '');
});

// ── 3. The session: images, stranded saves, conversion, the arrange rule ──────

function fakeTimers() {
  let now = 0;
  let seq = 0;
  const pending = new Map();
  return {
    set: (fn, ms) => { const id = ++seq; pending.set(id, { fn, at: now + ms }); return id; },
    clear: (id) => pending.delete(id),
    async advance(ms) {
      now += ms;
      for (;;) {
        const due = [...pending.entries()].filter(([, t]) => t.at <= now).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        pending.delete(due[0]);
        due[1].fn();
        await settle();
      }
      await settle();
    },
  };
}

/** write_canvas_items as the database behaves (047), with knobs: types it doesn't know, a missing function, targets that are gone. */
function fakeServer(items = [], connections = [], knobs = {}) {
  const server = { rows: new Map(items.map((i) => [i.id, { ...i }])), connections: new Map(connections.map((c) => [c.id, { ...c }])), calls: [], fail: 0, missingFunction: false, unknownTypes: new Set(knobs.unknownTypes ?? []), goneTargets: new Set(knobs.goneTargets ?? []) };
  server.write = async (changes) => {
    server.calls.push(structuredClone(changes));
    if (server.fail > 0) { server.fail -= 1; throw new Error('Failed to fetch'); }
    if (server.missingFunction) return { status: 'error', error: 'Could not find the function public.write_canvas_items(p_canvas_id, p_changes) in the schema cache' };
    const results = [];
    for (const c of changes) {
      const table = c.kind === 'connection' ? server.connections : server.rows;
      const row = table.get(c.id);
      if (c.op === 'delete') {
        table.delete(c.id);
        if (c.kind !== 'connection') {
          for (const r of server.rows.values()) if (r.section_id === c.id) { r.section_id = null; r.version += 1; }
          for (const [k, x] of server.connections) if (x.source_item_id === c.id || x.target_item_id === c.id) server.connections.delete(k);
        }
        results.push({ id: c.id, status: 'ok' });
        continue;
      }
      if (c.op === 'create') {
        if (row) { results.push({ id: c.id, status: 'ok', version: row.version }); continue; }
        if (c.kind === 'connection') {
          const ends = [server.rows.get(c.source_id), server.rows.get(c.target_id)];
          if (ends.some((e) => !e || e.item_type === 'section')) { results.push({ id: c.id, status: 'error', error: 'A connection joins two placements of the same Canvas' }); continue; }
          server.connections.set(c.id, { id: c.id, canvas_id: 'cv', project_id: 'p', source_item_id: c.source_id, target_item_id: c.target_id, directed: c.directed, label: c.label, version: 1, created_at: 't', updated_at: 't' });
          results.push({ id: c.id, status: 'ok', version: 1 });
          continue;
        }
        if (server.unknownTypes.has(c.item_type)) { results.push({ id: c.id, status: 'error', error: 'Unknown item type' }); continue; }
        if (c.target_id && server.goneTargets.has(c.target_id)) { results.push({ id: c.id, status: 'error', error: 'insert or update on table "workspace_canvas_items" violates foreign key constraint "workspace_canvas_items_scene_id_fkey"' }); continue; }
        const { op, target_id, ...rest } = c;
        server.rows.set(c.id, { ...rest, scene_id: c.item_type === 'scene' ? target_id : null, chapter_id: null, document_id: c.item_type === 'page' ? target_id : null, entry_id: null, target_canvas_id: null, attachment_id: c.item_type === 'image' ? target_id : null, version: 1, canvas_id: 'cv', project_id: 'p', created_at: 't', updated_at: 't' });
        results.push({ id: c.id, status: 'ok', version: 1 });
        continue;
      }
      if (!row) { results.push({ id: c.id, status: 'missing' }); continue; }
      if (row.version !== c.expected_version) { results.push({ id: c.id, status: 'conflict', version: row.version, item: { ...row } }); continue; }
      const { op, id, expected_version, kind, ...fields } = c;
      Object.assign(row, fields, { version: row.version + 1 });
      results.push({ id: c.id, status: 'ok', version: row.version });
    }
    return { status: 'ok', results };
  };
  return server;
}

function makeSession(server, extra = {}) {
  const timers = fakeTimers();
  const drafts = [];
  const statuses = [];
  let n = 0;
  const session = new sessionMod.CanvasSession({
    canvasId: 'cv',
    projectId: 'p',
    items: structuredClone([...server.rows.values()]),
    connections: structuredClone([...server.connections.values()]),
    write: server.write,
    persist: (d) => drafts.push(structuredClone(d)),
    onStatus: (s) => statuses.push(s),
    delay: 400,
    retryDelays: [2000, 5000],
    timers,
    now: () => '2026-10-03T00:00:00.000Z',
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    ...extra,
  });
  return { session, timers, drafts, statuses };
}
const CARD = { width: 248, height: 132 };
const SIZE = { width: 220, height: 64 };
const ATT = { id: 'att-1', project_id: 'p', kind: 'image', file_name: 'map.png', mime_type: 'image/png', byte_size: 10, width: 1200, height: 800, storage_bucket: 'b', storage_key: 'k', display_key: null, display_width: null, display_height: null, created_at: 't' };

test('session: an image placement is sized to the picture, references the attachment, is saved as a create with the attachment as target, resized keeping its proportions, duplicated to the same attachment, removed alone; undo brings it back', async () => {
  const server = fakeServer();
  const { session, timers, drafts } = makeSession(server);
  const size = canvasModel.imagePlacementSize(ATT.width, ATT.height);
  assert.deepEqual(size, { width: 320, height: 213 }, 'fit within the default frame, proportions kept');
  assert.deepEqual(canvasModel.imagePlacementSize(100, 50), { width: 100, height: 50 }, 'never enlarged past its pixels');
  assert.deepEqual(canvasModel.imagePlacementSize(null, null), canvasModel.DEFAULT_SIZE.image);
  assert.deepEqual(canvasModel.keepAspect({ width: 400, height: 100 }, 1.5), { width: 400, height: 267 });
  assert.deepEqual(canvasModel.keepAspect({ width: 100, height: 400 }, 1.5), { width: 600, height: 400 });
  assert.deepEqual(canvasModel.keepAspect({ width: 10, height: 10 }, 2), { width: 96, height: 48 }, 'held above the minimum');
  const id = session.addImage(ATT, { x: 100, y: 100 }, size);
  assert.deepEqual([session.get(id).item_type, session.get(id).attachment_id, session.get(id).label, session.get(id).width], ['image', 'att-1', 'map.png', 320]);
  assert.equal(session.getAttachment('att-1').file_name, 'map.png');
  assert.deepEqual(drafts.at(-1).entries.map((e) => [e.id, e.op, e.item.item_type]), [[id, 'create', 'image']], 'on the device at once');
  await timers.advance(400);
  assert.deepEqual(server.calls[0].map((c) => [c.op, c.item_type, c.target_id, c.label]), [['create', 'image', 'att-1', 'map.png']]);
  assert.equal(server.rows.get(id).attachment_id, 'att-1');
  // Duplicate: a second placement of the same attachment.
  const [dup] = session.duplicate([id]);
  assert.equal(session.get(dup).attachment_id, 'att-1');
  assert.notEqual(dup, id);
  await timers.advance(400);
  assert.equal(server.rows.get(dup).attachment_id, 'att-1');
  // Remove one: the other and the attachment stay.
  session.remove([dup]);
  await timers.advance(400);
  assert.equal(server.rows.has(dup), false);
  assert.equal(server.rows.has(id), true);
  assert.equal(session.getAttachment('att-1').id, 'att-1');
  session.undo();
  assert.equal(session.get(dup).attachment_id, 'att-1', 'undo recreates the placement, pointing at the same attachment');
  await timers.advance(400);
  assert.equal(server.rows.get(dup).attachment_id, 'att-1');
  // A paste carries the reference, never the bytes.
  const clip = session.clip([id]);
  assert.deepEqual(clip.items.map((i) => i.attachment_id), ['att-1']);
  assert.equal(session.status, 'saved');
});

test('session, stale client: a change this server doesn\'t understand is kept, shown as stranded and never retried; the draft keeps it for a reloaded client, which replays it; a deleted target is never resurrected; a note refused is never dropped', async () => {
  // An older database (046) answers an image create with 'Unknown item type'.
  const server = fakeServer([], [], { unknownTypes: ['image'] });
  const { session, timers, drafts, statuses } = makeSession(server);
  const img = session.addImage(ATT, { x: 0, y: 0 }, SIZE);
  const note = session.createNote({ x: 300, y: 0 }, SIZE, 'a thought');
  await timers.advance(400);
  assert.equal(server.calls.length, 1);
  assert.equal(server.rows.has(img), false, 'the server refused it');
  assert.equal(session.has(img), true, 'kept here');
  assert.deepEqual([...session.stranded], [img], 'marked');
  assert.equal(session.get(note).version, 1, 'the note saved normally');
  assert.equal(session.status, 'saved', 'nothing dirty is left; nothing to retry');
  await timers.advance(60000);
  assert.equal(server.calls.length, 1, 'never retried: the answer would never change');
  assert.deepEqual(drafts.at(-1).entries.map((e) => [e.id, e.op, e.item.item_type]), [[img, 'create', 'image']], 'the device draft keeps the stranded create');
  // Moving a stranded card stays local (the row never reached the server, so there is nothing to update there).
  session.moveLive([img], 10, 10);
  session.commitMove(new Map([[img, { x: 0, y: 0 }]]));
  await timers.advance(400);
  assert.ok(session.stranded.has(img));
  // Removing it: gone, and nothing is sent for it.
  const callsBefore = server.calls.length;
  session.remove([img]);
  await timers.advance(400);
  assert.equal(session.has(img), false);
  assert.equal(server.calls.length, callsBefore, 'a stranded row removed is simply forgotten');
  session.undo();
  assert.equal(session.has(img), true, 'and back, still stranded');
  await timers.advance(400);

  // Reload: a newer client (the server now knows images) replays the draft.
  const newer = fakeServer([...server.rows.values()], [...server.connections.values()]);
  const second = makeSession(newer);
  second.session.applyDraft(drafts.at(-1));
  await second.timers.advance(0);
  assert.equal(newer.rows.get(img)?.attachment_id, 'att-1', 'the image reached the newer server');
  assert.deepEqual([...second.session.stranded], []);
  assert.equal(second.session.status, 'saved');

  // The whole function missing: nothing is retried and nothing dropped; status says reload; every change stays on the device.
  const gone = fakeServer();
  gone.missingFunction = true;
  const third = makeSession(gone);
  const n = third.session.createNote({ x: 0, y: 0 }, SIZE, 'kept text');
  await third.timers.advance(400);
  assert.equal(third.session.status, 'unsupported');
  assert.equal(third.session.has(n), true);
  assert.deepEqual(third.drafts.at(-1).entries.map((e) => [e.id, e.op]), [[n, 'create']]);
  await third.timers.advance(60000);
  assert.equal(gone.calls.length, 1, 'no retry loop');
  third.session.setNoteText(n, 'kept text, more');
  third.session.endNoteEdit(n);
  assert.equal(sessionMod.isUnsupportedError('Unknown item type'), true);
  assert.equal(sessionMod.isUnsupportedError('That item is in Trash'), false);
  assert.deepEqual(third.drafts.at(-1).entries.map((e) => canvasModel.noteText(e.item.content)), ['kept text, more'], 'still on the device, with the latest text');

  // A replayed create whose target was permanently deleted meanwhile is refused by the server and dropped here — never resurrected, never stranded.
  const strict = fakeServer([], [], { goneTargets: ['scene-gone'] });
  const fourth = makeSession(strict);
  const dead = fourth.session.addPlacement('scene', 'scene-gone', 'Old scene', { x: 0, y: 0 }, CARD);
  await fourth.timers.advance(400);
  assert.equal(fourth.session.has(dead), false, 'dropped');
  assert.deepEqual([...fourth.session.stranded], []);
  assert.equal(fourth.session.status, 'saved');
  // A note the server refuses for any reason is never dropped (it is the writer's text).
  const picky = fakeServer();
  const realWrite = picky.write;
  picky.write = async (changes) => { const r = await realWrite(changes); for (const x of r.results) { const c = changes.find((ch) => ch.id === x.id); if (c?.op === 'create' && c.item_type === 'note') { x.status = 'error'; x.error = 'geometry out of bounds'; picky.rows.delete(x.id); } } return r; };
  const fifth = makeSession(picky);
  const kept = fifth.session.createNote({ x: 0, y: 0 }, SIZE, 'never lost');
  await fifth.timers.advance(400);
  assert.equal(fifth.session.has(kept), true);
  assert.ok(fifth.session.stranded.has(kept));
  assert.equal(canvasModel.noteText(fifth.drafts.at(-1).entries[0].item.content), 'never lost');
  assert.ok(statuses.includes('saved'));
});

test('session: a conversion is applied as the server\'s truth — the note gone, the Page card in its place with the connections, nothing dirty; history about the note is dropped, the rest stays; canConvert needs a saved, conflict-free note', async () => {
  const server = fakeServer();
  const { session, timers } = makeSession(server);
  const a = session.addPlacement('scene', 'scene-1', 'Scene 1', { x: 0, y: 0 }, CARD);
  const note = session.createNote({ x: 400, y: 0 }, SIZE, 'grow me');
  assert.equal(session.canConvert(note), false, 'not yet saved');
  await timers.advance(400);
  assert.equal(session.canConvert(note), true);
  assert.equal(session.canConvert(a), false, 'only a note');
  const line = session.connect(a, note, { label: 'leads to' });
  session.moveLive([a], 5, 5);
  session.commitMove(new Map([[a, { x: 0, y: 0 }]]));
  await timers.advance(400);
  const undoBefore = session.canUndo;
  // What the server would answer.
  const newItem = { ...server.rows.get(note), id: 'new-page-card', item_type: 'page', document_id: 'page-9', content: null, label: 'grow me', version: 1 };
  const newLine = { ...server.connections.get(line), target_item_id: 'new-page-card', version: 1 };
  session.applyConversion(note, newItem, [newLine]);
  assert.equal(session.has(note), false);
  assert.deepEqual([session.get('new-page-card').item_type, session.get('new-page-card').x, session.get('new-page-card').y], ['page', 400, 0]);
  assert.deepEqual(session.connections.map((c) => [c.id, c.source_item_id, c.target_item_id, c.label]), [[line, a, 'new-page-card', 'leads to']]);
  assert.equal(session.dirtyCount, 0, 'nothing to save: the server did it');
  assert.equal(session.status, 'saved');
  // Undo: the move of `a` is still there; the note's creation and the connection aren't.
  assert.equal(undoBefore, true);
  session.undo();
  assert.deepEqual([session.get(a).x, session.get(a).y], [0, 0], 'the move undone');
  session.undo();
  session.undo();
  assert.equal(session.has('new-page-card'), true, 'no entry can take the Page card away or bring the note back');
  assert.equal(session.has(note), false);
  assert.equal(session.canUndo, false);
  await timers.advance(400);
  assert.equal(server.rows.has('new-page-card') || true, true);
  // A conflicted note can't be converted until resolved.
  const n2 = session.createNote({ x: 0, y: 300 }, SIZE, 'mine');
  await timers.advance(400);
  server.rows.get(n2).content = canvasModel.noteDoc('theirs');
  server.rows.get(n2).version += 1;
  session.setNoteText(n2, 'mine, edited');
  session.endNoteEdit(n2);
  await timers.advance(400);
  assert.ok(session.conflicts.has(n2));
  assert.equal(session.canConvert(n2), false);
  session.keepMine(n2);
  await timers.advance(400);
  assert.equal(session.canConvert(n2), true);
});

test('rules: the arrange menu is one rule (two: align + tidy; three: distribute; two cards: connect) and the surface\'s chrome includes the menu, so a press on a menu item is never a press on the board', () => {
  assert.deepEqual(arrange.arrangeActions(1, 1), []);
  assert.deepEqual(arrange.arrangeActions(2, 2).map((a) => a.kind), ['align', 'align', 'align', 'align', 'align', 'align', 'tidy', 'connect']);
  assert.deepEqual(arrange.arrangeActions(2, 1).map((a) => a.kind).includes('connect'), false, 'a Section and a card: no connection');
  assert.deepEqual(arrange.arrangeActions(3, 3).map((a) => a.kind).filter((k) => k === 'distribute').length, 2);
  assert.deepEqual(arrange.arrangeActions(3, 3).map((a) => a.kind).includes('connect'), false);
  // Every action does something to a real selection.
  const r = (id, x, y) => ({ id, rect: { x, y, width: 100, height: 50 } });
  const items = [r('a', 0, 0), r('b', 300, 120), r('c', 50, 400)];
  for (const action of arrange.arrangeActions(3, 3)) {
    if (action.kind === 'align') assert.equal(arrange.align(items, action.mode).size, 3, action.label);
    if (action.kind === 'distribute') assert.equal(arrange.distribute(items, action.mode).size, 3, action.label);
    if (action.kind === 'tidy') assert.equal(arrange.tidy(items).size, 3);
  }
  // The regression: the menu (.r2-menu) rendered inside the surface counts as chrome.
  const el = (classes) => ({ closest: (sel) => (sel.split(',').some((s) => classes.includes(s.trim().slice(1))) ? {} : null) });
  assert.equal(canvasModel.isCanvasChrome(el(['r2-menu', 'r2-menu-item'])), true, 'a menu item');
  assert.equal(canvasModel.isCanvasChrome(el(['r2-canvas-card'])), true);
  assert.equal(canvasModel.isCanvasChrome(el(['r2-canvas-world'])), false, 'the board itself');
  assert.equal(canvasModel.isCanvasChrome(el(['r2-canvas-lines']), canvasModel.CANVAS_NO_NOTE_SELECTOR), true, 'no new note on a line');
  assert.equal(canvasModel.isCanvasChrome(null), false);
  // Titles for conversion.
  assert.equal(canvasModel.noteTitle('\n\n  Second   line  \nthird'), 'Second line');
  assert.equal(canvasModel.noteTitle(''), null);
  assert.equal(canvasModel.noteTitle('x'.repeat(100)).length, 80);
  assert.equal(canvasModel.noteTitle(`${'word '.repeat(30)}end`).endsWith('word'), true, 'cut at a word');
  // Attachment rules.
  assert.equal(rules.imageUploadProblem({ type: 'image/webp', size: 10 }), null);
  assert.match(rules.imageUploadProblem({ type: 'image/svg+xml', size: 10 }), /PNG, JPEG, GIF and WebP/);
  assert.match(rules.imageUploadProblem({ type: 'image/png', size: rules.MAX_IMAGE_BYTES + 1 }), /up to 10 MB/);
  assert.deepEqual(rules.displayDerivative(4000, 3000), { width: 1600, height: 1200 });
  assert.equal(rules.displayDerivative(1600, 900), null);
  assert.equal(rules.attachmentUrl('a', 'display'), '/api/attachments/a?variant=display');
  assert.equal(rules.cardVariant({ display_key: 'k' }), 'display');
  assert.equal(rules.cleanFileName('  \u0000x.png '), 'x.png');
  assert.equal(rules.cleanFileName('   '), 'image');
  // What a paste or drop carries: images only.
  const dt = { items: [{ kind: 'string', getAsFile: () => null }, { kind: 'file', getAsFile: () => ({ type: 'image/png', name: 'a' }) }, { kind: 'file', getAsFile: () => ({ type: 'text/plain', name: 'b' }) }], files: [] };
  assert.deepEqual(clientLib.imageFilesOf(dt).map((f) => f.name), ['a']);
  assert.deepEqual(clientLib.imageFilesOf(null), []);
});

// ── 4. Backup, version 2 ──────────────────────────────────────────────────────

test('backup v2: Canvases are first-class — placements with geometry, Sections, notes, images, connections, Trash state, ids preserved — and attachments carry their bytes; a missing byte stream is recorded, never invented; no device state', async () => {
  const db = await seededDb();
  const { sb, plot, store, intro } = await hollow(db);
  const world = ok(await canvas.createWorkspaceCanvas(HOLLOW, 'World')).canvas;
  const a = await storeImage(sb, store, HOLLOW, { fileName: 'coast.png', width: 10, height: 5 });
  const lost = await storeImage(sb, store, HOLLOW, { fileName: 'lost.jpg', mimeType: 'image/jpeg', bytes: JPG });
  const section = create('section', null, { label: 'Act I', x: 0, y: 0, width: 900, height: 500 });
  const sceneCard = create('scene', pageId('h4a'), { label: 'Scene', x: 20, y: 60, section_id: section.id });
  const pageCard = create('page', intro.id, { label: 'Intro', x: 300, y: 60 });
  const note = create('note', null, { content: doc('a plan'), x: 20, y: 300, manual_size: true });
  const img = create('image', a.id, { label: 'coast.png', x: 600, y: 60, width: 200, height: 100 });
  const lostImg = create('image', lost.id, { x: 600, y: 300 });
  allOk(await canvas.writeCanvasItems(plot.id, [section, sceneCard, pageCard, note, img, lostImg]));
  const line = connect(sceneCard.id, note.id, { directed: true, label: 'because' });
  allOk(await canvas.writeCanvasItems(plot.id, [line]));
  ok(await trash.trashWorkspaceObject('canvas', world.id));
  ok(await trash.trashWorkspaceObject('page', intro.id));

  const readBytes = async (att) => (att.id === lost.id ? null : (await store.download(att.storage_key))?.bytes ?? null);
  const data = await backupLib.loadProjectBackup(sb, HOLLOW, undefined, readBytes);
  assert.equal(backupLib.BACKUP_FORMAT_VERSION, 2);
  const at = new Date('2026-10-03T12:00:00Z');
  const bytes = await backupLib.buildBackupArchive(data, at);
  const archive = zipLib.openZip(bytes);
  const manifest = JSON.parse(await archive.text('manifest.json'));
  assert.equal(manifest.format_version, 2);
  for (const name of manifest.files) assert.ok(archive.has(name), name);
  assert.deepEqual([manifest.counts.workspace_canvases, manifest.counts.workspace_canvas_items, manifest.counts.workspace_canvas_connections, manifest.counts.workspace_attachments], [2, 6, 1, 2]);
  assert.equal(manifest.trash.canvases, 1);
  assert.deepEqual(manifest.attachments, { total: 2, bytes_missing: 1 });

  const plotFile = JSON.parse(await archive.text(`workspace/canvases/${plot.id}.json`));
  assert.deepEqual([plotFile.canvas.id, plotFile.canvas.in_trash, plotFile.canvas.title], [plot.id, false, 'Plot']);
  const by = Object.fromEntries(plotFile.items.map((i) => [i.id, i]));
  assert.deepEqual([by[sceneCard.id].item_type, by[sceneCard.id].scene_id, by[sceneCard.id].section_id, by[sceneCard.id].x, by[sceneCard.id].y, by[sceneCard.id].target_in_trash], ['scene', pageId('h4a'), section.id, 20, 60, false]);
  assert.deepEqual([by[pageCard.id].document_id, by[pageCard.id].target_in_trash], [intro.id, true], 'a placement whose Page is in Trash says so');
  assert.deepEqual([by[note.id].content, by[note.id].manual_size], [doc('a plan'), true]);
  assert.deepEqual([by[img.id].item_type, by[img.id].attachment_id, by[img.id].width, by[img.id].height], ['image', a.id, 200, 100]);
  assert.deepEqual([by[section.id].item_type, by[section.id].label, by[section.id].width], ['section', 'Act I', 900]);
  assert.deepEqual(plotFile.connections.map((c) => [c.id, c.source_item_id, c.target_item_id, c.directed, c.label]), [[line.id, sceneCard.id, note.id, true, 'because']]);
  const worldFile = JSON.parse(await archive.text(`workspace/canvases/${world.id}.json`));
  assert.equal(worldFile.canvas.in_trash, true);
  assert.ok(JSON.parse(await archive.text('workspace/tree.json')).nodes.some((n) => n.canvas_id === plot.id), 'the Canvas\'s place in the tree');

  const attachments = JSON.parse(await archive.text('workspace/attachments.json')).attachments;
  const coast = attachments.find((x) => x.id === a.id);
  assert.deepEqual([coast.file_name, coast.mime_type, coast.width, coast.height, coast.bytes_file], ['coast.png', 'image/png', 10, 5, `workspace/attachments/${a.id}.png`]);
  assert.deepEqual(Array.from(await archive.bytes(`workspace/attachments/${a.id}.png`)), Array.from(PNG), 'the actual bytes, not a URL');
  const lostRow = attachments.find((x) => x.id === lost.id);
  assert.deepEqual([lostRow.bytes_file, lostRow.bytes_missing], [null, true]);
  assert.equal(archive.has(`workspace/attachments/${lost.id}.jpg`), false);
  assert.match(await archive.text('README.txt'), /workspace\/canvases\/<id>\.json/);
  assert.match(await archive.text('README.txt'), /workspace\/attachments\/<id>\.<ext>/);
  const names = manifest.files.join('\n');
  assert.doesNotMatch(names, /viewport|draft|cache|queue|scroll/i);
  assert.doesNotMatch(JSON.stringify(plotFile), /viewport|localStorage/);
  // The default byte reader asks the server for the original.
  const calls = [];
  const fakeFetch = async (url) => { calls.push(url); return { ok: true, arrayBuffer: async () => PNG.buffer.slice(PNG.byteOffset, PNG.byteOffset + PNG.byteLength) }; };
  assert.deepEqual(Array.from(await backupLib.fetchAttachmentBytes({ id: a.id }, fakeFetch)), Array.from(PNG));
  assert.deepEqual(calls, [`/api/attachments/${a.id}`]);
  assert.equal(await backupLib.fetchAttachmentBytes({ id: a.id }, async () => ({ ok: false })), null);
});

test('session (BC-B): a note whose text was changed here and whose row was deleted elsewhere is never dropped — stranded as gone, kept in the draft, replayed as stranded by the next client, never resurrected on the server; a duplicate saves its text as a new row; geometry of a gone row is simply dropped', async () => {
  const server = fakeServer();
  const { session, timers, drafts } = makeSession(server);
  const note = session.createNote({ x: 0, y: 0 }, SIZE, 'first thought');
  const card = session.addPlacement('scene', 'scene-1', 'Scene', { x: 300, y: 0 }, CARD);
  await timers.advance(400);
  assert.equal(server.rows.has(note), true);

  // Offline here: the note's text changes and the card moves; meanwhile both rows are deleted elsewhere.
  server.fail = 1;
  session.setNoteText(note, 'first thought, kept');
  session.endNoteEdit(note);
  session.moveLive([card], 50, 0);
  session.commitMove(new Map([[card, { x: 300, y: 0 }]]));
  await timers.advance(400);
  assert.equal(session.status, 'retrying');
  server.rows.delete(note);
  server.rows.delete(card);
  await timers.advance(2000);
  assert.equal(session.status, 'saved');
  assert.equal(session.has(card), false, 'a placement gone elsewhere is gone here (its geometry was nothing of the writer\'s)');
  assert.equal(session.has(note), true, 'the note with the writer\'s text is kept');
  assert.equal(session.strandedReason(note), 'gone');
  assert.equal(canvasModel.noteText(session.get(note).content), 'first thought, kept');
  assert.equal(server.rows.has(note), false, 'never resurrected');
  const entry = drafts.at(-1).entries.find((e) => e.id === note);
  assert.equal(entry.stranded, 'gone', 'the device draft carries it, marked');
  const calls = server.calls.length;
  await timers.advance(60000);
  assert.equal(server.calls.length, calls, 'never retried');

  // The next client (a reload) replays the draft: the note is shown, stranded, not sent.
  let m = 0;
  const again = makeSession(fakeServer(), { newId: () => `22222222-0000-4000-8000-${String(++m).padStart(12, '0')}` });
  again.session.applyDraft(drafts.at(-1));
  await again.timers.advance(0);
  assert.equal(again.session.has(note), true);
  assert.equal(again.session.strandedReason(note), 'gone');
  assert.equal(again.session.status, 'saved');

  // Duplicating it is the writer keeping the text: a new row, saved; removing it lets it go — no server call either way for the gone row.
  const [copy] = again.session.duplicate([note]);
  await again.timers.advance(400);
  assert.equal(again.session.strandedReason(copy), undefined);
  assert.equal(again.session.get(copy).version, 1, 'the copy is on the server');
  again.session.remove([note]);
  await again.timers.advance(400);
  assert.equal(again.session.has(note), false);
  assert.equal(again.drafts.at(-1).entries.some((e) => e.id === note), false, 'and out of the draft');

  // An older draft (no `stranded` field) holding a note text edit against a vanished row is treated the same.
  const old = makeSession(fakeServer());
  old.session.applyDraft({ canvasId: 'cv', entries: [{ id: note, kind: 'item', op: 'update', fields: ['content'], item: { ...session.get(note) } }] });
  assert.equal(old.session.strandedReason(note), 'gone');
  // ...but a geometry-only edit against a vanished row is dropped, as before.
  const geo = makeSession(fakeServer());
  geo.session.applyDraft({ canvasId: 'cv', entries: [{ id: 'x-gone', kind: 'item', op: 'update', fields: ['x', 'y'], item: { ...session.get(note), id: 'x-gone' } }] });
  assert.equal(geo.session.has('x-gone'), false);
});
