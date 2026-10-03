// Project Trash and permanent Project deletion (Rune 2.0, Beta Completion A,
// migration 049): the REAL project actions (lib/actions/projects.ts), the
// permanent-deletion library (lib/projectLifecycle.ts) and the shell loader,
// against the Rune 2.0 schema in real Postgres + RLS, with attachment bytes in
// the in-memory store.
//
//   * Move to Trash / Restore: owner-checked, idempotent; the Project leaves
//     (and returns to) the Projects list with its identity and every row it
//     owns untouched; updated_at is not changed; the loader reports it
//     trashed (the layout then offers Restore instead of the shell)
//   * writes to a trashed Project still land (a save queued on another
//     device is never lost), and are there after Restore
//   * clients cannot move a Project in or out of Trash by UPDATE, nor DELETE
//     a Project at all; permanent deletion is only of a trashed Project
//   * permanent deletion removes EVERY Project-owned row — Manuscript,
//     Groups, Chapters, Scenes (placed, Unplaced, in Trash), Scene
//     properties/values/Views, Revision Notes, History and Milestones,
//     Workspace Pages/Folders/Collections/properties/Entries/values/Views,
//     references, Canvases/placements/connections, attachments, writing
//     history and goals — and the attachments' bytes; nothing of any other
//     Project (the same writer's or another's) changes
//   * bytes that cannot be removed stay recorded (project_storage_purges)
//     and a later sweep removes them; the record is the owner's alone
//
// Data: the synthetic legacy fixture moved into the Rune 2.0 schema. alice
// owns hollow and ash; bram owns tide.
import 'fake-indexeddb/auto';
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { createTestDb, readRepoFile, LEGACY_BASELINE, RUNE2_SCHEMA, HARNESS_DIR } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';
import { prototypeLegacyToRune2 } from '../lib/legacy-to-rune2.mjs';
import { USERS, chapterId, pageId, projectId, seedFixture } from '../fixtures/manuscript-fixture.mjs';

const ALICE = USERS.alice.id;
const BRAM = USERS.bram.id;
const HOLLOW = projectId('hollow');
const ASH = projectId('ash');
const TIDE = projectId('tide');
const CH = (n) => chapterId(`hollow.ch${n}`);
const S = (label) => pageId(label);

const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const all = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const ok = (r) => { assert.equal(r.error, null, r.error); return r.data; };
const text = (t) => ({ type: 'text', text: t });
const para = (...content) => ({ type: 'paragraph', content });
const doc = (...content) => ({ type: 'doc', content });
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
const JPG = new Uint8Array([255, 216, 255, 224, 1, 2, 3, 255, 217]);

let legacy;
let projects, lifecycle, attachmentsLib, storageMock, manuscriptLoader;
let scenes, structure, trash, notes, milestones, pages, tree, collections, props, views, refs, sceneProps, sceneViews, canvas;
before(async () => {
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
  const storageAlias = { '@/lib/attachments/storage': path.join(HARNESS_DIR, 'mocks/attachmentStorage.js') };
  projects = await bundleForTest('src/lib/actions/projects.ts', { name: 'pt_projects', aliases: storageAlias });
  lifecycle = await bundleForTest('src/lib/projectLifecycle.ts', { name: 'pt_lifecycle' });
  attachmentsLib = await bundleForTest('src/lib/attachments/server.ts', { name: 'pt_attachments' });
  storageMock = await import(path.join(HARNESS_DIR, 'mocks/attachmentStorage.js'));
  manuscriptLoader = await bundleForTest('src/lib/rune2/projectManuscript.ts', { name: 'pt_manuscript' });
  scenes = await bundleForTest('src/lib/actions/scenes.ts', { name: 'pt_scenes' });
  structure = await bundleForTest('src/lib/actions/structure.ts', { name: 'pt_structure' });
  trash = await bundleForTest('src/lib/actions/workspaceTrash.ts', { name: 'pt_trash' });
  notes = await bundleForTest('src/lib/actions/revisionNotes.ts', { name: 'pt_notes' });
  milestones = await bundleForTest('src/lib/actions/manuscriptMilestones.ts', { name: 'pt_milestones' });
  pages = await bundleForTest('src/lib/actions/workspacePages.ts', { name: 'pt_pages' });
  tree = await bundleForTest('src/lib/actions/workspaceTree.ts', { name: 'pt_tree' });
  collections = await bundleForTest('src/lib/actions/workspaceCollections.ts', { name: 'pt_collections' });
  props = await bundleForTest('src/lib/actions/workspaceProperties.ts', { name: 'pt_props' });
  views = await bundleForTest('src/lib/actions/workspaceViews.ts', { name: 'pt_views' });
  refs = await bundleForTest('src/lib/actions/workspaceReferences.ts', { name: 'pt_refs' });
  sceneProps = await bundleForTest('src/lib/actions/sceneProperties.ts', { name: 'pt_scene_props' });
  sceneViews = await bundleForTest('src/lib/actions/sceneViews.ts', { name: 'pt_scene_views' });
  canvas = await bundleForTest('src/lib/actions/workspaceCanvas.ts', { name: 'pt_canvas' });
});

async function seededDb() {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  await prototypeLegacyToRune2(legacy, db);
  storageMock.memory.objects.clear();
  return db;
}

function signIn(db, userId) {
  const sb = createSupabaseAdapter(db, { userId });
  for (const mod of [projects, manuscriptLoader, scenes, structure, trash, notes, milestones, pages, tree, collections, props, views, refs, sceneProps, sceneViews, canvas]) {
    mod.setServerClient(sb);
  }
  return sb;
}

const manuscriptOf = async (db, pid) => (await one(db, `select id from public.manuscripts where project_id = $1`, [pid])).id;
const listedIds = async () => ok(await projects.getProjects()).map((p) => p.id);
const trashedIds = async () => ok(await projects.getTrashedProjects()).map((p) => p.id);

/** Stores image bytes as an attachment of a Project in the shared in-memory store. */
async function storeImage(sb, pid, fileName = 'map.png') {
  const r = await attachmentsLib.storeImageAttachment(sb, storageMock.memory, {
    projectId: pid, fileName, mimeType: 'image/png', bytes: PNG, width: 2400, height: 1600,
    display: { bytes: JPG, mimeType: 'image/jpeg', width: 1600, height: 1067 },
  });
  assert.equal(r.error, null, r.error);
  return r.data;
}

const item = (type, targetId, extra = {}) => ({
  op: 'create', id: randomUUID(), item_type: type, target_id: targetId, label: extra.label ?? null, content: extra.content ?? null,
  x: 10, y: 20, width: 240, height: 120, z: 0, section_id: null, manual_size: false,
});

/** hollow with something in every Project-owned system, some of it in Trash. */
async function fullProject(db) {
  const sb = signIn(db, ALICE);
  const ms = await manuscriptOf(db, HOLLOW);
  const a = ok(await structure.createGroup(HOLLOW, 'Part A'));
  ok(await structure.moveChapter(CH(1), a.id, null, HOLLOW));
  ok(await structure.createGroup(HOLLOW, 'Part A.1', a.id));
  await notes.createRevisionNote(randomUUID(), 'manuscript', ms, 'manuscript note');
  await notes.createRevisionNote(randomUUID(), 'group', a.id, 'group note');
  await notes.createRevisionNote(randomUUID(), 'scene', S('h1a'), 'scene note');
  const pov = ok(await sceneProps.createSceneProperty(HOLLOW, 'POV', 'text'));
  ok(await sceneProps.setScenePropertyValue(S('h1a'), pov.id, 'Mara'));
  ok(await sceneViews.createSceneView(HOLLOW, 'By POV', 'table'));
  await db.query(`insert into public.scene_revisions (manuscript_id, scene_id, title, content, word_count, saved_at, reason)
    values ($1, $2, 'Earlier', $3, 2, '2026-09-01 10:00:00+00', 'checkpoint')`, [ms, S('h1a'), JSON.stringify(doc(para(text('Earlier text'))))]);
  ok(await milestones.createManuscriptMilestone(HOLLOW, 'Draft 1'));

  const folder = ok(await tree.createWorkspaceFolder(HOLLOW, 'Research'));
  const page = ok(await pages.createWorkspacePage(HOLLOW, 'Setting notes', folder.nodeId));
  assert.equal((await pages.saveWorkspacePageContent(page.id, doc(para(text('The harbour town.'))), page.version)).status, 'ok');
  const people = ok(await collections.createWorkspaceCollection(HOLLOW, 'Characters'));
  const role = ok(await props.createCollectionProperty(people.collection.id, 'Role', 'text'));
  ok(await views.createCollectionView(people.collection.id, 'All', 'table'));
  const mara = ok(await collections.createCollectionEntry(people.collection.id, 'Mara'));
  ok(await props.setEntryPropertyValue(mara.id, role.id, 'Protagonist'));
  ok(await refs.addObjectReference('page', page.id, 'scene', S('h1a')));

  const plot = ok(await canvas.createWorkspaceCanvas(HOLLOW, 'Plot')).canvas;
  const image = await storeImage(sb, HOLLOW);
  const note = item('note', null, { content: doc(para(text('A note'))) });
  const placed = item('page', page.id);
  const picture = item('image', image.id);
  const r = await canvas.writeCanvasItems(plot.id, [note, placed, picture,
    { kind: 'connection', op: 'create', id: randomUUID(), source_id: note.id, target_id: placed.id, directed: true, label: null }]);
  assert.equal(r.status, 'ok', JSON.stringify(r));
  for (const x of r.results) assert.equal(x.status, 'ok', JSON.stringify(x));
  // An attachment nothing places any more (still owned; its bytes too).
  const loose = await storeImage(sb, HOLLOW, 'loose.png');

  await db.query(`insert into public.writing_goals (user_id, project_id, type, target_words) values ($1, $2, 'daily_project', 500)`, [ALICE, HOLLOW]);
  const oldPage = ok(await pages.createWorkspacePage(HOLLOW, 'Discarded page'));
  ok(await trash.trashWorkspaceObject('scene', S('h4c')));
  ok(await trash.trashWorkspaceObject('page', oldPage.id));
  return { sb, ms, image, loose };
}

/** Every public table's rows, by table. */
async function dump(db) {
  const tables = (await all(db, `select tablename from pg_tables where schemaname = 'public' order by tablename`)).map((r) => r.tablename);
  const out = {};
  const key = (row) => JSON.stringify(row);
  for (const t of tables) out[t] = (await all(db, `select * from public."${t}"`)).sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  return out;
}

/** Ids of everything hollow owns, to tell its rows from everyone else's. */
async function ownedIds(db, pid) {
  const ms = await manuscriptOf(db, pid);
  const ids = new Set([pid, ms]);
  for (const r of await all(db, `select id from public.manuscript_milestones where manuscript_id = $1`, [ms])) ids.add(r.id);
  return ids;
}
const OWNER_COLUMNS = ['project_id', 'manuscript_id', 'milestone_id'];
const belongs = (table, row, ids) =>
  (table === 'projects' && ids.has(row.id)) || OWNER_COLUMNS.some((c) => row[c] != null && ids.has(row[c]));

// ── 1. Trash and Restore ──────────────────────────────────────────────────────

test('Move to Trash: the Project leaves the list, keeps every row and its identity, and comes back exactly as it was; both are idempotent', async () => {
  const db = await seededDb();
  await fullProject(db);
  signIn(db, ALICE);
  const before = await dump(db);
  const updatedAt = (await one(db, `select updated_at from public.projects where id = $1`, [HOLLOW])).updated_at;
  assert.ok((await listedIds()).includes(HOLLOW));

  const trashed = ok(await projects.trashProject(HOLLOW));
  assert.equal(trashed.id, HOLLOW);
  assert.ok(trashed.trashed_at, 'trashed_at is set');
  assert.ok(!(await listedIds()).includes(HOLLOW), 'gone from Projects');
  assert.deepEqual(await trashedIds(), [HOLLOW], 'and in Trash');
  assert.ok((await listedIds()).includes(ASH), 'the writer’s other Project is untouched');
  const again = ok(await projects.trashProject(HOLLOW));
  assert.equal(again.trashed_at, trashed.trashed_at, 'trashing again changes nothing');

  // Everything but the one column is exactly as it was.
  const during = await dump(db);
  for (const [table, rows] of Object.entries(before)) {
    if (table === 'projects') continue;
    assert.deepEqual(during[table], rows, `${table} unchanged by Move to Trash`);
  }
  const loaded = await manuscriptLoader.loadProjectManuscript(HOLLOW);
  assert.equal(new Date(loaded.trashedAt).getTime(), new Date(trashed.trashed_at).getTime(), 'the shell loader reports it trashed (the layout offers Restore)');

  const restored = ok(await projects.restoreProject(HOLLOW));
  assert.equal(restored.trashed_at, null);
  ok(await projects.restoreProject(HOLLOW)); // idempotent
  assert.deepEqual(await dump(db), before, 'restored: every row of every table exactly as before, the Project included');
  assert.equal((await one(db, `select updated_at from public.projects where id = $1`, [HOLLOW])).updated_at.getTime(), updatedAt.getTime());
  assert.ok((await listedIds()).includes(HOLLOW));
  assert.deepEqual(await trashedIds(), []);
  assert.equal((await manuscriptLoader.loadProjectManuscript(HOLLOW)).trashedAt, null);
});

test('a trashed Project still takes writes (a save queued elsewhere is never lost) and has them after Restore', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  ok(await projects.trashProject(HOLLOW));
  const { version } = await one(db, `select version from public.scenes where id = $1`, [S('h1a')]);
  const content = doc(para(text('written on the train while the project sat in Trash')));
  const r = await scenes.syncSceneWithLimitCheck(S('h1a'), content, 10, version, 'offline_sync');
  assert.equal(r.status, 'ok', JSON.stringify(r));
  ok(await projects.restoreProject(HOLLOW));
  const row = await one(db, `select content, word_count from public.scenes where id = $1`, [S('h1a')]);
  assert.deepEqual(row.content, content);
  assert.equal(row.word_count, 10);
});

test('isolation: only the owner moves, restores or deletes a Project; clients cannot UPDATE trashed_at or DELETE a Project', async () => {
  const db = await seededDb();
  signIn(db, BRAM);
  assert.match((await projects.trashProject(HOLLOW)).error, /not found/i);
  assert.match((await projects.restoreProject(HOLLOW)).error, /not found/i);
  assert.match((await projects.deleteTrashedProject(HOLLOW)).error, /not found/i);
  assert.equal((await one(db, `select trashed_at from public.projects where id = $1`, [HOLLOW])).trashed_at, null);

  const alice = signIn(db, ALICE);
  const direct = await alice.from('projects').update({ trashed_at: new Date().toISOString() }).eq('id', HOLLOW);
  assert.ok(direct.error, 'a client UPDATE of trashed_at is refused');
  assert.equal((await one(db, `select trashed_at from public.projects where id = $1`, [HOLLOW])).trashed_at, null);
  const del = await alice.from('projects').delete().eq('id', HOLLOW);
  assert.ok(del.error, 'a client DELETE is refused (no privilege)');
  assert.ok(await one(db, `select id from public.projects where id = $1`, [HOLLOW]));
  // Renaming is still the writer's own.
  assert.equal(ok(await projects.renameProject(HOLLOW, '  The Hollow  ')).title, 'The Hollow');
  assert.match((await projects.renameProject(HOLLOW, '   ')).error, /title/);
  assert.match((await projects.renameProject(HOLLOW, 'x'.repeat(201))).error, /200/);
});

// ── 2. Permanent deletion ─────────────────────────────────────────────────────

test('permanent deletion only from Trash: an active Project is refused and nothing changes', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const before = await dump(db);
  assert.match((await projects.deleteTrashedProject(HOLLOW)).error, /Only a Project in Trash/);
  assert.deepEqual(await dump(db), before);
});

test('permanent deletion removes every Project-owned row and its attachment bytes — and nothing of any other Project', async () => {
  const db = await seededDb();
  const { image, loose } = await fullProject(db);
  // The writer's other Project, and another writer's, each with an image of their own.
  const ashImage = await storeImage(signIn(db, ALICE), ASH, 'ash.png');
  const tideImage = await storeImage(signIn(db, BRAM), TIDE, 'tide.png');
  signIn(db, ALICE);

  const ids = await ownedIds(db, HOLLOW);
  const before = await dump(db);
  // The test only means something if every system really held hollow's rows.
  const mustHold = ['manuscripts', 'manuscript_groups', 'chapters', 'scenes', 'scene_property_definitions', 'scene_property_values',
    'scene_views', 'revision_notes', 'scene_revisions', 'manuscript_milestones', 'manuscript_milestone_scenes', 'workspace_nodes',
    'workspace_folders', 'workspace_documents', 'workspace_collections', 'workspace_collection_properties', 'workspace_collection_entries',
    'workspace_entry_values', 'workspace_collection_views', 'object_references', 'workspace_canvases', 'workspace_canvas_items',
    'workspace_canvas_connections', 'workspace_attachments', 'writing_sessions', 'writing_goals'];
  for (const t of mustHold) {
    assert.ok(before[t].some((row) => belongs(t, row, ids)), `fixture: hollow has ${t} rows`);
  }
  assert.ok(before.scenes.some((s) => s.trashed_at && belongs('scenes', s, ids)), 'fixture: hollow has a Scene in Trash');
  const hollowKeys = [image.storage_key, image.display_key, loose.storage_key, loose.display_key];
  for (const k of hollowKeys) assert.ok(storageMock.memory.objects.has(k), `fixture: bytes ${k} stored`);

  ok(await projects.trashProject(HOLLOW));
  assert.deepEqual(await projects.deleteTrashedProject(HOLLOW), { error: null });

  const after = await dump(db);
  for (const [table, rows] of Object.entries(before)) {
    const kept = rows.filter((row) => !belongs(table, row, ids));
    if (table === 'projects') {
      // Only hollow went; every other Project's row is as it was.
      assert.deepEqual(after.projects, kept, 'projects: only hollow removed');
      continue;
    }
    assert.deepEqual(after[table], kept, `${table}: hollow's rows gone, every other row unchanged`);
  }
  for (const k of hollowKeys) assert.ok(!storageMock.memory.objects.has(k), `bytes ${k} removed`);
  for (const a of [ashImage, tideImage]) {
    assert.ok(storageMock.memory.objects.has(a.storage_key) && storageMock.memory.objects.has(a.display_key), 'another Project’s bytes are kept');
  }
  assert.equal((await one(db, `select count(*)::int as n from public.project_storage_purges`)).n, 0, 'the purge was carried out and cleared');
  assert.equal(await manuscriptLoader.loadProjectManuscript(HOLLOW), null, 'the Project is gone (not found)');
  assert.deepEqual(await trashedIds(), []);
});

test('bytes that cannot be removed stay recorded and a later sweep removes them; the record is the owner’s alone', async () => {
  const db = await seededDb();
  const sb = signIn(db, ALICE);
  const image = await storeImage(sb, HOLLOW);
  ok(await projects.trashProject(HOLLOW));

  const remove = storageMock.memory.remove;
  storageMock.memory.remove = async () => { throw new Error('storage unavailable'); };
  try {
    assert.deepEqual(await projects.deleteTrashedProject(HOLLOW), { error: null }, 'the Project is deleted; the bytes are owed');
  } finally {
    storageMock.memory.remove = remove;
  }
  assert.equal(await one(db, `select id from public.projects where id = $1`, [HOLLOW]), undefined);
  assert.ok(storageMock.memory.objects.has(image.storage_key), 'bytes still there');
  const purge = await one(db, `select * from public.project_storage_purges`);
  assert.equal(purge.user_id, ALICE);
  assert.equal(purge.project_id, HOLLOW);
  assert.deepEqual([...purge.storage_keys].sort(), [image.storage_key, image.display_key].sort());

  // Another writer neither sees nor clears it; clients cannot write the table.
  const bram = signIn(db, BRAM);
  assert.deepEqual((await bram.from('project_storage_purges').select('*')).data, []);
  assert.deepEqual(await lifecycle.sweepProjectStoragePurges(bram, storageMock.memory), { completed: 0, remaining: 0 });
  const forged = await bram.from('project_storage_purges').insert({ user_id: BRAM, project_id: TIDE, storage_bucket: 'x', storage_keys: [`${TIDE}/x`] });
  assert.ok(forged.error, 'clients cannot record a purge');

  // The owner's next sweep finishes it.
  const alice = signIn(db, ALICE);
  assert.deepEqual(await lifecycle.sweepProjectStoragePurges(alice, storageMock.memory), { completed: 1, remaining: 0 });
  assert.ok(!storageMock.memory.objects.has(image.storage_key) && !storageMock.memory.objects.has(image.display_key));
  assert.equal((await one(db, `select count(*)::int as n from public.project_storage_purges`)).n, 0);
});

test('an image registered after the deletion began is refused and its bytes removed (the Project row is locked)', async () => {
  const db = await seededDb();
  const sb = signIn(db, ALICE);
  ok(await projects.trashProject(HOLLOW));
  ok(await projects.deleteTrashedProject(HOLLOW));
  const r = await attachmentsLib.storeImageAttachment(sb, storageMock.memory, {
    projectId: HOLLOW, fileName: 'late.png', mimeType: 'image/png', bytes: PNG, width: 1, height: 1, display: null,
  });
  assert.ok(r.error, 'registration refused');
  assert.equal([...storageMock.memory.objects.keys()].filter((k) => k.startsWith(HOLLOW)).length, 0, 'no stray bytes');
});
