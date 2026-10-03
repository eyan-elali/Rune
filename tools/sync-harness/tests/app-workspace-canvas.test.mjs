// Workspace Canvas (Rune 2.0, Milestone 22A, migration 045): the REAL Canvas
// actions, loader, Trash actions and shell rules against the Rune 2.0 schema
// in real Postgres + RLS, and the Canvas session engine
// (lib/rune2/canvasSession.ts) with deterministic timers.
//
//   * a Canvas is a Workspace object: one canonical node, root or Folder,
//     rename, reorder, Trash — exactly as a Page; found by title in Search;
//     one tab; never a writing target
//   * placements of Scenes, Chapters, Pages, Entries and other Canvases, and
//     notes: created, moved, versioned, deleted — one atomic, idempotent batch
//     per Canvas; the same object on many Canvases and twice on one
//   * a placement is a live reference: rename and move elsewhere show at once
//     through the shell's index; nothing of the object is stored but a label
//   * removing a placement never touches its object; a trashed target keeps
//     its placement (unavailable) and resolves again on restore; permanent
//     deletion of a target removes its placements deterministically
//   * ownership, Project isolation, no client writes to the tables
//   * the manuscript boundary: no Scene, total, word or writing-history change
//   * the session: device copy first, debounced batches, stale writes never
//     overwrite, retries never duplicate, undo/redo of placements only
//
// Data: the synthetic legacy fixture moved into the Rune 2.0 schema. alice
// owns hollow and ash; bram owns tide. In hollow, ch1 holds one Scene (h1a),
// ch4 three (h4a, h4b, h4c); h3b and h3c are Unplaced.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, readRepoFile, asUser, LEGACY_BASELINE, RUNE2_SCHEMA } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';
import { prototypeLegacyToRune2 } from '../lib/legacy-to-rune2.mjs';
import { USERS, chapterId, pageId, projectId, seedFixture } from '../fixtures/manuscript-fixture.mjs';

const ALICE = USERS.alice.id;
const BRAM = USERS.bram.id;
const HOLLOW = projectId('hollow');
const TIDE = projectId('tide');
const MISSING = '00000000-0000-4000-8000-00000000dead';

const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const all = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const doc = (...paragraphs) => ({
  type: 'doc',
  content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
});
let idSeq = 0;
const uuid = () => `11111111-2222-4333-8444-${String(++idSeq).padStart(12, '0')}`;

let legacy;
let canvas, pages, tree, collections, trash, scenes, structure, workspace, manuscriptLoader;
let nav, engine, trashModel, canvasModel, sessionMod, workingSet, writingTarget;
before(async () => {
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
  canvas = await bundleForTest('src/lib/actions/workspaceCanvas.ts', { name: 'cv_canvas' });
  pages = await bundleForTest('src/lib/actions/workspacePages.ts', { name: 'cv_pages' });
  tree = await bundleForTest('src/lib/actions/workspaceTree.ts', { name: 'cv_tree' });
  collections = await bundleForTest('src/lib/actions/workspaceCollections.ts', { name: 'cv_collections' });
  trash = await bundleForTest('src/lib/actions/workspaceTrash.ts', { name: 'cv_trash' });
  scenes = await bundleForTest('src/lib/actions/scenes.ts', { name: 'cv_scenes' });
  structure = await bundleForTest('src/lib/actions/structure.ts', { name: 'cv_structure' });
  workspace = await bundleForTest('src/lib/rune2/projectWorkspace.ts', { name: 'cv_loader' });
  manuscriptLoader = await bundleForTest('src/lib/rune2/projectManuscript.ts', { name: 'cv_manuscript' });
  nav = await bundleForTest('src/lib/rune2/navigatorModel.ts', { name: 'cv_nav' });
  engine = await bundleForTest('src/lib/rune2/projectSearch.ts', { name: 'cv_engine' });
  trashModel = await bundleForTest('src/lib/rune2/trash.ts', { name: 'cv_trash_model' });
  canvasModel = await bundleForTest('src/lib/rune2/canvas.ts', { name: 'cv_model' });
  sessionMod = await bundleForTest('src/lib/rune2/canvasSession.ts', { name: 'cv_session' });
  workingSet = await bundleForTest('src/lib/rune2/workingSet.ts', { name: 'cv_working_set' });
  writingTarget = await bundleForTest('src/lib/rune2/writingTarget.ts', { name: 'cv_writing_target' });
});

async function seededDb() {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  await prototypeLegacyToRune2(legacy, db);
  return db;
}

function signIn(db, userId) {
  const sb = createSupabaseAdapter(db, { userId });
  for (const mod of [canvas, pages, tree, collections, trash, scenes, structure, workspace, manuscriptLoader]) mod.setServerClient(sb);
  return sb;
}

const ok = (r) => { assert.equal(r.error, null, r.error); return r.data; };
const refused = (r, message) => { assert.equal(r.data, null); if (message) assert.equal(r.error, message); else assert.ok(r.error); };

async function shellIndex(pid = HOLLOW) {
  const [m, w] = [await manuscriptLoader.loadProjectManuscript(pid), await workspace.loadProjectWorkspace(pid)];
  return new Map([...nav.indexManuscript(m), ...nav.indexWorkspace(w.tree, {}, w.entries)]);
}

async function manuscriptState(db) {
  return {
    projects: await all(db, `select id, word_count, updated_at from public.projects order by id`),
    manuscripts: await all(db, `select * from public.manuscripts order by id`),
    groups: await all(db, `select * from public.manuscript_groups order by id`),
    chapters: await all(db, `select * from public.chapters order by id`),
    scenes: await all(db, `select * from public.scenes order by id`),
    sessions: await all(db, `select * from public.writing_sessions order by id`),
    documents: await all(db, `select id, title, content, version, updated_at from public.workspace_documents order by id`),
    entries: await all(db, `select id, title, content, version, updated_at from public.workspace_collection_entries order by id`),
    accountTotal: await asUser(db, ALICE, async (tx) => (await tx.query(`select public.account_word_total() as n`)).rows[0].n),
  };
}

/** Alice's Hollow: a Page, a Folder, a Collection with one Entry, and two Canvases ("Plot" at the top, "World" in Research). */
async function hollow(db) {
  signIn(db, ALICE);
  const intro = ok(await pages.createWorkspacePage(HOLLOW, 'Intro'));
  const research = ok(await tree.createWorkspaceFolder(HOLLOW, 'Research'));
  const characters = ok(await collections.createWorkspaceCollection(HOLLOW, 'Characters')).collection;
  const nerai = ok(await collections.createCollectionEntry(characters.id, 'Nerai'));
  const plot = ok(await canvas.createWorkspaceCanvas(HOLLOW, 'Plot'));
  const world = ok(await canvas.createWorkspaceCanvas(HOLLOW, 'World', research.nodeId));
  return { intro, research, characters, nerai, plot: plot.canvas, plotNode: plot.nodeId, world: world.canvas, worldNode: world.nodeId };
}

const create = (type, targetId, extra = {}) => ({
  op: 'create', id: uuid(), item_type: type, target_id: targetId, label: extra.label ?? null, content: extra.content ?? null,
  x: extra.x ?? 10, y: extra.y ?? 20, width: extra.width ?? 240, height: extra.height ?? 120, z: extra.z ?? 0,
});
const results = (r) => { assert.equal(r.status, 'ok', JSON.stringify(r)); return r.results; };
const allOk = (r) => { const rs = results(r); for (const x of rs) assert.equal(x.status, 'ok', JSON.stringify(x)); return rs; };

// ── 1. The Canvas object ───────────────────────────────────────────────────────

test('canvas: created with one canonical node (root or Folder), titles trimmed / blank = untitled / 200 max; renamed under RLS; reorder and move like any item', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  assert.equal(t.plot.project_id, HOLLOW);
  assert.equal(ok(await canvas.createWorkspaceCanvas(HOLLOW, '   ')).canvas.title, null);
  assert.equal(ok(await canvas.createWorkspaceCanvas(HOLLOW, '  Nerai Arc  ')).canvas.title, 'Nerai Arc');
  assert.equal(ok(await canvas.createWorkspaceCanvas(HOLLOW, 'x'.repeat(300))).canvas.title.length, 200);

  const nodes = await all(db, `select * from public.workspace_nodes where canvas_id in ($1, $2) order by position`, [t.plot.id, t.world.id]);
  assert.equal(nodes.length, 2, 'exactly one node each');
  const plotNode = nodes.find((n) => n.canvas_id === t.plot.id);
  const worldNode = nodes.find((n) => n.canvas_id === t.world.id);
  assert.deepEqual([plotNode.target_type, plotNode.parent_node_id, plotNode.id], ['canvas', null, t.plotNode]);
  assert.deepEqual([worldNode.target_type, worldNode.parent_node_id, worldNode.position], ['canvas', t.research.nodeId, 1]);
  await assert.rejects(db.query(`insert into public.workspace_nodes (project_id, target_type, canvas_id, parent_node_id, position) values ($1, 'canvas', $2, null, 99)`, [HOLLOW, t.plot.id]),
    /workspace_nodes_canvas_id_key/, 'a second node is refused by the database');

  assert.deepEqual(ok(await canvas.renameWorkspaceCanvas(t.plot.id, ' Plot Threads ')), { title: 'Plot Threads' });
  assert.deepEqual(ok(await canvas.renameWorkspaceCanvas(t.plot.id, '')), { title: null });
  refused(await canvas.renameWorkspaceCanvas(MISSING, 'x'), 'Canvas not found');

  // The loader and the tree.
  const w = await workspace.loadProjectWorkspace(HOLLOW);
  assert.equal(w.canvasable, true);
  assert.deepEqual(w.canvases.map((c) => c.id).sort(), (await all(db, `select id from public.workspace_canvases where project_id = $1`, [HOLLOW])).map((r) => r.id).sort());
  const top = w.tree.map((n) => [n.kind, n.title]);
  assert.deepEqual(top.slice(0, 4), [['page', 'Intro'], ['folder', 'Research'], ['collection', 'Characters'], ['canvas', null]]);
  assert.deepEqual(w.tree[1].children.map((n) => [n.kind, n.title]), [['canvas', 'World']]);

  // Move into the Folder, then reorder.
  ok(await tree.moveWorkspaceNode(t.plotNode, t.research.nodeId, 0));
  const w2 = await workspace.loadProjectWorkspace(HOLLOW);
  assert.deepEqual(w2.tree.find((n) => n.kind === 'folder').children.map((n) => n.id), [t.plot.id, t.world.id]);
  ok(await tree.moveWorkspaceNode(t.plotNode, null, null));
  const w3 = await workspace.loadProjectWorkspace(HOLLOW);
  assert.equal(w3.tree[w3.tree.length - 1].id, t.plot.id, 'moved back to the end of the top level');
  const positions = await all(db, `select parent_node_id, array_agg(position order by position) ps from public.workspace_nodes where project_id = $1 group by parent_node_id`, [HOLLOW]);
  for (const g of positions) assert.deepEqual(g.ps, g.ps.map((_, i) => i + 1));
});

test('canvas: in the shell index as a selectable Workspace object (one tab), found by title in Search, never a writing target; trash type canvas', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const index = await shellIndex();
  const plot = index.get(t.plot.id);
  assert.equal(plot.kind, 'workspaceCanvas');
  assert.deepEqual([plot.title, plot.named, plot.path, plot.words, plot.childCount], ['Plot', true, [], 0, 0]);
  const world = index.get(t.world.id);
  assert.deepEqual(world.path.map((p) => p.title), ['Research']);
  assert.equal(nav.isSelectable(plot), true);
  assert.equal(nav.isWorkspaceKind('workspaceCanvas'), true);
  assert.equal(index.get(ok(await canvas.createWorkspaceCanvas(HOLLOW, null)).canvas.id)?.title ?? (await shellIndex()).get((await all(db, `select id from public.workspace_canvases where title is null`))[0].id).title, 'Untitled canvas');
  assert.equal(writingTarget.writingTargetFor(plot, index), null);
  assert.equal(trashModel.trashTypeOf(plot), 'canvas');

  // One tab, however it is opened.
  let tabs = { tabs: ['root:manuscript'], active: 'root:manuscript' };
  tabs = workingSet.openTab(tabs, t.plot.id);
  tabs = workingSet.openTab(tabs, t.plot.id);
  tabs = workingSet.navigateTab(tabs, t.plot.id);
  assert.deepEqual(tabs, { tabs: ['root:manuscript', t.plot.id], active: t.plot.id });

  // Search: by title, as a canvas, with where it lives.
  const objects = engine.searchObjects(index);
  const found = engine.searchProject(objects, 'world', { kinds: ['canvas'] });
  assert.deepEqual(found.map((r) => [r.kind, r.title, r.context, r.tier]), [['canvas', 'World', 'Workspace / Research', 0]]);
  assert.equal(engine.searchProject(objects, 'plo').some((r) => r.id === t.plot.id && r.kind === 'canvas'), true);
});

test('canvas: isolation and privileges — another writer sees, renames and creates nothing; clients never INSERT or DELETE the table', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  signIn(db, BRAM);
  refused(await canvas.createWorkspaceCanvas(HOLLOW, 'Theirs'), 'Project not found');
  refused(await canvas.renameWorkspaceCanvas(t.plot.id, 'Mine now'), 'Canvas not found');
  refused(await canvas.getWorkspaceCanvas(t.plot.id), 'Canvas not found');
  assert.deepEqual((await workspace.loadProjectWorkspace(TIDE)).canvases, []);
  for (const user of [ALICE, BRAM]) {
    await assert.rejects(asUser(db, user, (tx) => tx.query(`insert into public.workspace_canvases (project_id, title) values ($1, 'x')`, [HOLLOW])), /permission denied/);
    await assert.rejects(asUser(db, user, (tx) => tx.query(`delete from public.workspace_canvases where id = $1`, [t.plot.id])), /permission denied/);
  }
  assert.equal((await one(db, `select title from public.workspace_canvases where id = $1`, [t.plot.id])).title, 'Plot');
});

// ── 2. Placements ──────────────────────────────────────────────────────────────

test('placements: every type, several at once, the same object twice on one Canvas and on two Canvases; reload returns the same geometry', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const before = await manuscriptState(db);
  const changes = [
    create('scene', pageId('h4a'), { label: 'Scene 1', x: 0, y: 0 }),
    create('scene', pageId('h4a'), { label: 'Scene 1', x: 400, y: 0 }),
    create('scene', pageId('h3b'), { label: 'Loose end', x: 0, y: 200 }),
    create('chapter', chapterId('hollow.ch4'), { label: 'Chapter 4', x: 800, y: 0.5 }),
    create('page', t.intro.id, { label: 'Intro', x: -300.25, y: -120 }),
    create('entry', t.nerai.id, { label: 'Nerai', x: 1e6, y: -1e6, z: 3 }),
    create('canvas', t.world.id, { label: 'World', x: 50, y: 50 }),
    create('note', null, { content: doc('Nerai meets Alaric', 'on the bridge'), x: 20, y: 400, width: 220, height: 64 }),
  ];
  const rs = allOk(await canvas.writeCanvasItems(t.plot.id, changes));
  assert.deepEqual(rs.map((r) => r.version), changes.map(() => 1));
  allOk(await canvas.writeCanvasItems(t.world.id, [create('scene', pageId('h4a'), { label: 'Scene 1' })]));

  const loaded = ok(await canvas.getWorkspaceCanvas(t.plot.id));
  assert.equal(loaded.canvas.id, t.plot.id);
  assert.equal(loaded.items.length, 8);
  const byId = new Map(loaded.items.map((i) => [i.id, i]));
  for (const c of changes) {
    const i = byId.get(c.id);
    assert.deepEqual([i.item_type, i.x, i.y, i.width, i.height, i.z, i.label, i.version, i.canvas_id, i.project_id],
      [c.item_type, c.x, c.y, c.width, c.height, c.z, c.label, 1, t.plot.id, HOLLOW]);
    assert.equal(canvasModel.targetIdOf(i), c.target_id);
    if (c.item_type === 'note') assert.deepEqual(i.content, c.content);
    else assert.equal(i.content, null);
  }
  assert.equal(canvasModel.placementsOf(loaded.items, pageId('h4a')).length, 2, 'the same Scene twice on one Canvas');
  assert.equal(ok(await canvas.getWorkspaceCanvas(t.world.id)).items.length, 1, 'and on another Canvas');
  assert.deepEqual(await manuscriptState(db), before, 'placing changes nothing of the manuscript, Pages or Entries');
});

test('placements: the database refuses a target of another Project, a Canvas linking to itself, an unknown type and a trashed target — each change alone', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  ok(await trash.trashWorkspaceObject('page', t.intro.id));
  const good = create('scene', pageId('h4a'));
  const foreign = create('scene', pageId('t1a'));
  const self = create('canvas', t.plot.id);
  const unknown = { ...create('scene', pageId('h4a')), item_type: 'video' };
  const trashed = create('page', t.intro.id);
  const noTarget = create('scene', null);
  const rs = results(await canvas.writeCanvasItems(t.plot.id, [good, foreign, self, unknown, trashed, noTarget]));
  assert.deepEqual(rs.map((r) => r.status), ['ok', 'error', 'error', 'error', 'error', 'error']);
  assert.match(rs[1].error, /own Project/);
  assert.match(rs[2].error, /not_self_link/);
  assert.match(rs[3].error, /Unknown item type/);
  assert.match(rs[4].error, /in Trash/);
  assert.match(rs[5].error, /needs a target/);
  assert.deepEqual((await all(db, `select id from public.workspace_canvas_items where canvas_id = $1`, [t.plot.id])).map((r) => r.id), [good.id]);
});

test('placements: updates are conditional on the version — a stale window never overwrites a newer arrangement; missing rows; idempotent creates and deletes', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const a = create('scene', pageId('h4a'), { x: 0, y: 0 });
  allOk(await canvas.writeCanvasItems(t.plot.id, [a]));

  // Window 1 moves it (version 1 → 2).
  const [m1] = allOk(await canvas.writeCanvasItems(t.plot.id, [{ op: 'update', id: a.id, expected_version: 1, x: 100, y: 50 }]));
  assert.equal(m1.version, 2);
  // Window 2, still at version 1, tries to move it elsewhere: refused, told the truth.
  const [stale] = results(await canvas.writeCanvasItems(t.plot.id, [{ op: 'update', id: a.id, expected_version: 1, x: -999, y: -999 }]));
  assert.equal(stale.status, 'conflict');
  assert.equal(stale.version, 2);
  assert.deepEqual([stale.item.x, stale.item.y], [100, 50]);
  assert.deepEqual(await one(db, `select x, y, version from public.workspace_canvas_items where id = $1`, [a.id]), { x: 100, y: 50, version: 2 });

  // A no-op update doesn't bump the version; a geometry change does; content on a placement is refused.
  const [same] = allOk(await canvas.writeCanvasItems(t.plot.id, [{ op: 'update', id: a.id, expected_version: 2, x: 100 }]));
  assert.equal(same.version, 2);
  const [bad] = results(await canvas.writeCanvasItems(t.plot.id, [{ op: 'update', id: a.id, expected_version: 2, content: doc('x') }]));
  assert.equal(bad.status, 'error');
  assert.match(bad.error, /Only a note has content/);

  // Idempotent: the same create again is 'ok' and makes nothing; a delete twice is 'ok'.
  const [again] = allOk(await canvas.writeCanvasItems(t.plot.id, [a]));
  assert.equal(again.version, 2, 'the row as it is, untouched');
  assert.equal((await all(db, `select id from public.workspace_canvas_items where canvas_id = $1`, [t.plot.id])).length, 1);
  allOk(await canvas.writeCanvasItems(t.plot.id, [{ op: 'delete', id: a.id }]));
  allOk(await canvas.writeCanvasItems(t.plot.id, [{ op: 'delete', id: a.id }]));
  const [missing] = results(await canvas.writeCanvasItems(t.plot.id, [{ op: 'update', id: a.id, expected_version: 2, x: 1 }]));
  assert.equal(missing.status, 'missing');
  // An id of another Canvas's row is never touched from here.
  const b = create('scene', pageId('h4a'));
  allOk(await canvas.writeCanvasItems(t.world.id, [b]));
  const [other] = results(await canvas.writeCanvasItems(t.plot.id, [{ ...b }]));
  assert.match(other.error, /another canvas/);
  allOk(await canvas.writeCanvasItems(t.plot.id, [{ op: 'delete', id: b.id }]));
  assert.ok(await one(db, `select id from public.workspace_canvas_items where id = $1`, [b.id]), 'World\'s row stays');
  // Too many at once, malformed batches.
  assert.equal((await canvas.writeCanvasItems(t.plot.id, Array.from({ length: 501 }, () => create('scene', pageId('h4a'))))).status, 'error');
  assert.deepEqual(await canvas.writeCanvasItems(t.plot.id, []), { status: 'ok', results: [] });
});

test('placements: ownership and privileges — another writer reads and writes nothing; clients never write the table directly; a bad batch writes nothing', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const a = create('scene', pageId('h4a'));
  allOk(await canvas.writeCanvasItems(t.plot.id, [a]));
  signIn(db, BRAM);
  assert.deepEqual(await canvas.writeCanvasItems(t.plot.id, [create('scene', pageId('t1a'))]), { status: 'not_found' });
  assert.deepEqual(await canvas.writeCanvasItems(MISSING, [a]), { status: 'not_found' });
  const bram = createSupabaseAdapter(db, { userId: BRAM });
  assert.deepEqual((await bram.from('workspace_canvas_items').select('id').eq('canvas_id', t.plot.id)).data, []);
  for (const user of [ALICE, BRAM]) {
    await assert.rejects(asUser(db, user, (tx) => tx.query(`insert into public.workspace_canvas_items (canvas_id, project_id, item_type, content, width, height) values ($1, $2, 'note', '{"type":"doc"}', 10, 10)`, [t.plot.id, HOLLOW])), /permission denied/);
    await assert.rejects(asUser(db, user, (tx) => tx.query(`update public.workspace_canvas_items set x = 5 where id = $1`, [a.id])), /permission denied/);
    await assert.rejects(asUser(db, user, (tx) => tx.query(`delete from public.workspace_canvas_items where id = $1`, [a.id])), /permission denied/);
  }
  const anon = createSupabaseAdapter(db, {});
  assert.ok((await anon.rpc('write_canvas_items', { p_canvas_id: t.plot.id, p_changes: [] })).error, 'anon cannot execute');
  assert.deepEqual(await one(db, `select x, version from public.workspace_canvas_items where id = $1`, [a.id]), { x: 10, version: 1 });
  // A placement keeps its canvas, type and target for life.
  await assert.rejects(db.query(`update public.workspace_canvas_items set scene_id = $2 where id = $1`, [a.id, pageId('h3b')]), /keeps its canvas, type and target/);
  await assert.rejects(db.query(`update public.workspace_canvas_items set canvas_id = $2 where id = $1`, [a.id, t.world.id]), /keeps its canvas, type and target/);
  await assert.rejects(db.query(`update public.workspace_canvas_items set x = 'NaN' where id = $1`, [a.id]), /geometry_check/);
});

// ── 3. Live references and the target's lifecycle ──────────────────────────────

test('live cards: a rename and a move of the Scene show through the index at once; the placement row never changes', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const a = create('scene', pageId('h4a'), { label: 'Scene 1' });
  const p = create('page', t.intro.id, { label: 'Intro' });
  const e = create('entry', t.nerai.id, { label: 'Nerai' });
  allOk(await canvas.writeCanvasItems(t.plot.id, [a, p, e]));
  const rowBefore = await all(db, `select * from public.workspace_canvas_items where canvas_id = $1 order by id`, [t.plot.id]);

  let index = await shellIndex();
  assert.equal(index.get(pageId('h4a')).title, 'Page 1', 'the fixture\'s stored title');
  assert.equal(index.get(pageId('h4a')).path.at(-1).id, chapterId('hollow.ch4'));
  ok(await scenes.renameScene(pageId('h4a'), 'The Bridge'));
  ok(await scenes.moveSceneToChapter(pageId('h4a'), chapterId('hollow.ch1')));
  ok(await pages.renameWorkspacePage(t.intro.id, 'Opening'));
  ok(await collections.renameCollectionEntry(t.nerai.id, 'Nerai of Drelareth'));
  assert.equal((await pages.saveWorkspacePageContent(t.intro.id, doc('The city wakes slowly.'), 1)).status, 'ok');
  index = await shellIndex();
  assert.equal(index.get(pageId('h4a')).title, 'The Bridge');
  assert.equal(index.get(pageId('h4a')).path.at(-1).id, chapterId('hollow.ch1'), 'the card shows its new Chapter');
  assert.equal(index.get(t.intro.id).title, 'Opening');
  assert.equal(index.get(t.nerai.id).title, 'Nerai of Drelareth');
  assert.deepEqual(ok(await canvas.getCanvasPreview('page', t.intro.id)), { text: 'The city wakes slowly.' });
  assert.ok(ok(await canvas.getCanvasPreview('scene', pageId('h4a'))).text.startsWith('fixture-marker-h4a'));
  assert.deepEqual(ok(await canvas.getCanvasPreview('entry', t.nerai.id)), { text: '' });
  assert.deepEqual(await all(db, `select * from public.workspace_canvas_items where canvas_id = $1 order by id`, [t.plot.id]), rowBefore,
    'nothing of the target is copied into the placement; its label stays what it was when placed');
  signIn(db, BRAM);
  assert.deepEqual(ok(await canvas.getCanvasPreview('page', t.intro.id)), { text: '' }, 'another writer reads no preview');
});

test('removing a placement removes only the placement; the Scene, Page, Entry and Chapter are untouched', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const before = await manuscriptState(db);
  const items = [create('scene', pageId('h4a')), create('chapter', chapterId('hollow.ch4')), create('page', t.intro.id), create('entry', t.nerai.id), create('canvas', t.world.id)];
  allOk(await canvas.writeCanvasItems(t.plot.id, items));
  allOk(await canvas.writeCanvasItems(t.plot.id, items.map((i) => ({ op: 'delete', id: i.id }))));
  assert.deepEqual(await all(db, `select id from public.workspace_canvas_items where canvas_id = $1`, [t.plot.id]), []);
  assert.deepEqual(await manuscriptState(db), before);
  assert.ok(await one(db, `select id from public.workspace_canvases where id = $1 and trashed_at is null`, [t.world.id]), 'the linked Canvas stays');
  assert.deepEqual(ok(await trash.listWorkspaceTrash(HOLLOW)), []);
});

test('target in Trash: the placement stays (unavailable), resolves again on restore; permanent deletion of the target removes its placements — and never resurrects it', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const s = create('scene', pageId('h4c'), { label: 'Scene 3' });
  const p = create('page', t.intro.id, { label: 'Intro' });
  const e = create('entry', t.nerai.id, { label: 'Nerai' });
  const ch = create('chapter', chapterId('hollow.ch6'), { label: 'Chapter 6' });
  allOk(await canvas.writeCanvasItems(t.plot.id, [s, p, e, ch]));
  const rows = () => all(db, `select id, item_type, scene_id, document_id, entry_id, chapter_id, version from public.workspace_canvas_items where canvas_id = $1 order by id`, [t.plot.id]);
  const before = await rows();

  ok(await trash.trashWorkspaceObject('scene', pageId('h4c')));
  ok(await trash.trashWorkspaceObject('page', t.intro.id));
  ok(await trash.trashWorkspaceObject('entry', t.nerai.id));
  ok(await trash.trashWorkspaceObject('chapter', chapterId('hollow.ch6')));
  assert.deepEqual(await rows(), before, 'Trash deletes nothing: every placement stays as it was');
  const loaded = ok(await canvas.getWorkspaceCanvas(t.plot.id));
  assert.equal(loaded.items.length, 4, 'the Canvas still lists them');
  let index = await shellIndex();
  for (const id of [pageId('h4c'), t.intro.id, t.nerai.id, chapterId('hollow.ch6')]) {
    assert.equal(index.has(id), false, 'the target is not in the index: the card is unavailable, showing its label');
  }
  // Nothing new may point at a trashed target.
  assert.equal(results(await canvas.writeCanvasItems(t.plot.id, [create('scene', pageId('h4c'))]))[0].status, 'error');

  ok(await trash.restoreWorkspaceObject('scene', pageId('h4c')));
  ok(await trash.restoreWorkspaceObject('page', t.intro.id));
  ok(await trash.restoreWorkspaceObject('entry', t.nerai.id));
  ok(await trash.restoreWorkspaceObject('chapter', chapterId('hollow.ch6')));
  index = await shellIndex();
  for (const id of [pageId('h4c'), t.intro.id, t.nerai.id, chapterId('hollow.ch6')]) assert.equal(index.has(id), true, 'resolved again');
  assert.deepEqual(await rows(), before, 'and the placements never changed');

  // Permanent deletion: deterministic, the placements go with the object.
  ok(await trash.trashWorkspaceObject('scene', pageId('h4c')));
  ok(await trash.deleteTrashedWorkspaceObject('scene', pageId('h4c')));
  ok(await trash.trashWorkspaceObject('page', t.intro.id));
  ok(await trash.deleteTrashedWorkspaceObject('page', t.intro.id));
  ok(await trash.trashWorkspaceObject('entry', t.nerai.id));
  ok(await trash.deleteTrashedWorkspaceObject('entry', t.nerai.id));
  ok(await trash.trashWorkspaceObject('chapter', chapterId('hollow.ch6')));
  ok(await trash.deleteTrashedWorkspaceObject('chapter', chapterId('hollow.ch6')));
  assert.deepEqual(await rows(), []);
  assert.equal(await one(db, `select id from public.scenes where id = $1`, [pageId('h4c')]), undefined);
  // A retried create of the gone Scene fails for that change alone; nothing comes back.
  const [gone] = results(await canvas.writeCanvasItems(t.plot.id, [s]));
  assert.equal(gone.status, 'error');
  assert.equal(await one(db, `select id from public.scenes where id = $1`, [pageId('h4c')]), undefined, 'never resurrected');
  assert.deepEqual(await rows(), []);
});

test('the Canvas itself in Trash: listed with its item count; items hidden and unwritable meanwhile, back unchanged on restore; permanent deletion removes its items and every link to it', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const n = create('note', null, { content: doc('a thought') });
  allOk(await canvas.writeCanvasItems(t.world.id, [create('scene', pageId('h4a')), n]));
  const link = create('canvas', t.world.id, { label: 'World' });
  allOk(await canvas.writeCanvasItems(t.plot.id, [link, create('note', null, { content: doc('plot note') })]));
  const worldRows = await all(db, `select * from public.workspace_canvas_items where canvas_id = $1 order by id`, [t.world.id]);
  const before = await manuscriptState(db);

  assert.deepEqual(ok(await trash.trashWorkspaceObject('canvas', t.world.id)), { moved: 0 });
  const index = await shellIndex();
  assert.equal(index.has(t.world.id), false);
  refused(await canvas.getWorkspaceCanvas(t.world.id), 'Canvas not found');
  refused(await canvas.renameWorkspaceCanvas(t.world.id, 'x'), 'Canvas not found');
  assert.deepEqual((await createSupabaseAdapter(db, { userId: ALICE }).from('workspace_canvas_items').select('id').eq('canvas_id', t.world.id)).data, [], 'its items are hidden with it');
  assert.deepEqual(await canvas.writeCanvasItems(t.world.id, [{ op: 'update', id: n.id, expected_version: 1, x: 5 }]), { status: 'trashed' });
  assert.deepEqual(await all(db, `select * from public.workspace_canvas_items where canvas_id = $1 order by id`, [t.world.id]), worldRows, 'nothing written');
  assert.equal(await one(db, `select count(*)::int as n from public.workspace_nodes where canvas_id = $1`, [t.world.id]).then((r) => r.n), 0, 'no node while in Trash');
  const listed = ok(await trash.listWorkspaceTrash(HOLLOW));
  assert.deepEqual(listed.map((i) => [i.type, i.id, i.title, i.from_folder_title, i.from_folder_active, i.items]), [['canvas', t.world.id, 'World', 'Research', true, 2]]);
  assert.equal(trashModel.trashContext(listed[0]), 'from Research');
  assert.match(trashModel.deletionWarning(listed[0]), /Delete the canvas “World” and its 2 items permanently\? .*Nothing it shows is deleted\./);
  assert.equal(trashModel.trashItemTitle({ type: 'canvas', title: null }), 'Untitled canvas');
  // The link from Plot still exists (its target is in Trash: unavailable).
  assert.ok(await one(db, `select id from public.workspace_canvas_items where id = $1`, [link.id]));

  assert.deepEqual(ok(await trash.restoreWorkspaceObject('canvas', t.world.id)), { location: 'original' });
  assert.deepEqual((await workspace.loadProjectWorkspace(HOLLOW)).tree.find((x) => x.kind === 'folder').children.map((x) => x.id), [t.world.id]);
  assert.deepEqual(ok(await canvas.getWorkspaceCanvas(t.world.id)).items.map((i) => i.version), [1, 1], 'versions untouched: Trash is not an edit');
  assert.deepEqual(await all(db, `select * from public.workspace_canvas_items where canvas_id = $1 order by id`, [t.world.id]), worldRows);
  allOk(await canvas.writeCanvasItems(t.world.id, [{ op: 'update', id: n.id, expected_version: 1, x: 5 }]));

  ok(await trash.trashWorkspaceObject('canvas', t.world.id));
  refused(await trash.deleteTrashedWorkspaceObject('canvas', t.plot.id), 'Only an item in Trash can be deleted permanently');
  assert.deepEqual(ok(await trash.deleteTrashedWorkspaceObject('canvas', t.world.id)), { entries: 0, properties: 0 });
  assert.equal(await one(db, `select id from public.workspace_canvases where id = $1`, [t.world.id]), undefined);
  assert.deepEqual(await all(db, `select id from public.workspace_canvas_items where canvas_id = $1`, [t.world.id]), []);
  assert.equal(await one(db, `select id from public.workspace_canvas_items where id = $1`, [link.id]), undefined, 'the link on Plot is gone with it');
  assert.equal((await all(db, `select id from public.workspace_canvas_items where canvas_id = $1`, [t.plot.id])).length, 1, 'Plot\'s own note stays');
  refused(await trash.restoreWorkspaceObject('canvas', t.world.id), 'Item not found');
  assert.deepEqual(await manuscriptState(db), before, 'the Scene it showed is untouched');
  assert.deepEqual(await asUser(db, ALICE, async (tx) => (await tx.query(`select public.workspace_trash_state('canvas', $1) as s`, [t.world.id])).rows[0].s), { status: 'ok', state: 'missing' });
});

// ── 4. Notes ───────────────────────────────────────────────────────────────────

test('notes: multiline text round-trips as paragraphs; saved and re-read; conditional on the version; never a word, a session or a total', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const before = await manuscriptState(db);
  const text = 'Nerai meets Alaric\n\non the bridge at dusk';
  const d = canvasModel.noteDoc(text);
  assert.deepEqual(d, { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Nerai meets Alaric' }] },
    { type: 'paragraph' },
    { type: 'paragraph', content: [{ type: 'text', text: 'on the bridge at dusk' }] },
  ] });
  assert.equal(canvasModel.noteText(d), text);
  assert.equal(canvasModel.noteText({ type: 'doc', content: [] }), '');
  const n = create('note', null, { content: d });
  allOk(await canvas.writeCanvasItems(t.plot.id, [n]));
  const [moved] = allOk(await canvas.writeCanvasItems(t.plot.id, [{ op: 'update', id: n.id, expected_version: 1, x: 300, y: 300 }]));
  assert.equal(moved.version, 2);
  const [edited] = allOk(await canvas.writeCanvasItems(t.plot.id, [{ op: 'update', id: n.id, expected_version: 2, content: canvasModel.noteDoc('revised') }]));
  assert.equal(edited.version, 3);
  const [staleEdit] = results(await canvas.writeCanvasItems(t.plot.id, [{ op: 'update', id: n.id, expected_version: 2, content: canvasModel.noteDoc('other window') }]));
  assert.equal(staleEdit.status, 'conflict');
  assert.equal(canvasModel.noteText(staleEdit.item.content), 'revised');
  const re = ok(await canvas.getWorkspaceCanvas(t.plot.id)).items[0];
  assert.deepEqual([canvasModel.noteText(re.content), re.x, re.y, re.version], ['revised', 300, 300, 3]);
  // A note holds no target and never a label (a label sent with one is dropped; the database refuses it outright).
  const labelled = { ...create('note', null, { content: doc('x') }), label: 'x' };
  allOk(await canvas.writeCanvasItems(t.plot.id, [labelled]));
  assert.equal((await one(db, `select label from public.workspace_canvas_items where id = $1`, [labelled.id])).label, null);
  await assert.rejects(db.query(`update public.workspace_canvas_items set label = 'x' where id = $1`, [labelled.id]), /target_matches_type/);
  assert.deepEqual(await manuscriptState(db), before, 'no Scene, word, session or total changed');
  assert.equal((await all(db, `select id from public.workspace_documents where project_id = $1`, [HOLLOW])).length, 1, 'a note is not a Page');
});

// ── 5. The session engine ─────────────────────────────────────────────────────

/** Deterministic timers: advance() fires everything due, in order. */
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
    get size() { return pending.size; },
  };
}
const settle = () => new Promise((r) => setImmediate(r));

/** An in-memory write_canvas_items: the database's per-change semantics. */
/**
 * A fake write_canvas_items: items in `rows`, connections (046, kind
 * 'connection') in `connections`; the same idempotent creates, conditional
 * updates and tolerant deletes, and what the database does on an item's
 * delete (members' section_id → null, its connections go).
 */
function fakeServer(items = []) {
  const server = { rows: new Map(items.map((i) => [i.id, { ...i }])), connections: new Map(), calls: [], fail: 0, gate: null, trashed: false };
  server.write = async (changes) => {
    server.calls.push(structuredClone(changes));
    if (server.gate) await server.gate;
    if (server.fail > 0) { server.fail -= 1; throw new Error('Failed to fetch'); }
    if (server.trashed) return { status: 'trashed' };
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
          if (ends.some((e) => !e || e.item_type === 'section') || c.source_id === c.target_id) { results.push({ id: c.id, status: 'error', error: 'A connection joins two placements of the same Canvas' }); continue; }
          server.connections.set(c.id, { id: c.id, canvas_id: 'cv', project_id: 'p', source_item_id: c.source_id, target_item_id: c.target_id, directed: c.directed, label: c.label, version: 1, created_at: 't', updated_at: 't' });
          results.push({ id: c.id, status: 'ok', version: 1 });
          continue;
        }
        const { op, target_id, ...rest } = c;
        if (c.section_id && server.rows.get(c.section_id)?.item_type !== 'section') { results.push({ id: c.id, status: 'error', error: 'That Section is not on this Canvas' }); continue; }
        if (c.item_type === 'section' && c.section_id) { results.push({ id: c.id, status: 'error', error: 'A Section cannot be inside a Section' }); continue; }
        server.rows.set(c.id, { section_id: null, manual_size: false, ...rest, scene_id: c.item_type === 'scene' ? target_id : null, chapter_id: null, document_id: null, entry_id: null, target_canvas_id: null, version: 1, canvas_id: 'cv', project_id: 'p', created_at: 't', updated_at: 't' });
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
  /** Another window changes a row. */
  server.elsewhere = (id, fields) => { const row = server.rows.get(id) ?? server.connections.get(id); Object.assign(row, fields, { version: row.version + 1 }); };
  return server;
}

function makeSession(server, items = [...server.rows.values()], extra = {}) {
  const timers = fakeTimers();
  const drafts = [];
  const statuses = [];
  let n = 0;
  const session = new sessionMod.CanvasSession({
    canvasId: 'cv',
    projectId: 'p',
    items: structuredClone(items),
    write: server.write,
    persist: (d) => drafts.push(structuredClone(d)),
    onStatus: (s) => statuses.push(s),
    delay: 400,
    retryDelays: [2000, 5000],
    timers,
    now: () => '2026-10-02T00:00:00.000Z',
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    ...extra,
  });
  return { session, timers, drafts, statuses };
}
const SIZE = { width: 220, height: 64 };

test('session: a note reaches the device at once and the server once after a pause; a multi-move is one batch; undo and redo move placements only', async () => {
  const server = fakeServer();
  const { session, timers, drafts, statuses } = makeSession(server);
  const a = session.createNote({ x: 10, y: 10 }, SIZE, 'first');
  const b = session.addPlacement('scene', 'scene-1', 'Scene 1', { x: 300, y: 10 }, { width: 248, height: 132 });
  assert.equal(drafts.length, 2, 'the device copy, at once');
  assert.deepEqual(drafts[1].entries.map((e) => [e.id, e.op]), [[a, 'create'], [b, 'create']]);
  assert.equal(server.calls.length, 0);
  assert.equal(session.status, 'pending');
  await timers.advance(399);
  assert.equal(server.calls.length, 0);
  await timers.advance(1);
  assert.equal(server.calls.length, 1, 'one batch for both');
  assert.deepEqual(server.calls[0].map((c) => c.op), ['create', 'create']);
  assert.equal(session.status, 'saved');
  assert.deepEqual([session.get(a).version, session.get(b).version], [1, 1]);
  assert.deepEqual(drafts.at(-1).entries, [], 'nothing unsaved left on the device');

  // Drag both together.
  const from = new Map([[a, { x: 10, y: 10 }], [b, { x: 300, y: 10 }]]);
  session.moveLive([a, b], 5, 5);
  session.moveLive([a, b], 15, 25);
  assert.equal(server.calls.length, 1, 'nothing saved during the drag');
  session.commitMove(from);
  assert.deepEqual([session.get(a).x, session.get(a).y, session.get(b).x, session.get(b).y], [30, 40, 320, 40]);
  await timers.advance(400);
  assert.equal(server.calls.length, 2);
  assert.deepEqual(server.calls[1].map((c) => [c.op, c.x, c.y, c.expected_version]), [['update', 30, 40, 1], ['update', 320, 40, 1]]);
  assert.deepEqual([server.rows.get(a).x, server.rows.get(b).x], [30, 320]);

  session.undo();
  assert.deepEqual([session.get(a).x, session.get(b).x], [10, 300], 'both back where they were');
  await timers.advance(400);
  assert.deepEqual([server.rows.get(a).x, server.rows.get(b).x], [10, 300]);
  session.redo();
  await timers.advance(400);
  assert.deepEqual([server.rows.get(a).x, server.rows.get(b).x], [30, 320]);
  assert.equal(session.canRedo, false);
  assert.deepEqual(statuses.filter((s, i, arr) => arr[i - 1] !== s).slice(0, 3), ['pending', 'saving', 'saved']);
  assert.equal(server.rows.get(b).scene_id, 'scene-1', 'the Scene is only pointed at, never written');
});

test('session: delete removes placements only; undo recreates them with the same id (an idempotent create); a create undone before it was sent never leaves the window', async () => {
  const server = fakeServer();
  const { session, timers } = makeSession(server);
  const a = session.addPlacement('scene', 'scene-1', 'Scene 1', { x: 0, y: 0 }, SIZE);
  await timers.advance(400);
  session.remove([a]);
  assert.equal(session.has(a), false);
  await timers.advance(400);
  assert.equal(server.rows.has(a), false);
  session.undo();
  assert.equal(session.has(a), true);
  await timers.advance(400);
  assert.ok(server.rows.has(a), 'back on the server, the same id');
  assert.equal(server.calls.at(-1)[0].op, 'create');

  const b = session.createNote({ x: 1, y: 1 }, SIZE, 'fleeting');
  session.undo();
  assert.equal(session.has(b), false);
  await timers.advance(1000);
  assert.ok(!server.calls.flat().some((c) => c.id === b), 'never sent');
  assert.equal(session.status, 'saved');
});

test('session: a stale write never overwrites — geometry adopts the other window\'s row; a note\'s text becomes a conflict the writer resolves', async () => {
  const server = fakeServer();
  const { session, timers } = makeSession(server);
  const a = session.addPlacement('scene', 'scene-1', 'Scene 1', { x: 0, y: 0 }, SIZE);
  const n = session.createNote({ x: 0, y: 200 }, SIZE, 'mine');
  await timers.advance(400);
  // Another window moves the card and edits the note.
  server.elsewhere(a, { x: 500, y: 500 });
  server.elsewhere(n, { content: canvasModel.noteDoc('theirs') });

  session.commitMove(new Map([[a, { x: 0, y: 0 }]])); // no-op: nothing moved here
  session.moveLive([a], 10, 10);
  session.commitMove(new Map([[a, { x: 0, y: 0 }]]));
  session.setNoteText(n, 'mine, revised');
  session.endNoteEdit(n);
  await timers.advance(400);
  assert.deepEqual([server.rows.get(a).x, server.rows.get(a).y, server.rows.get(a).version], [500, 500, 2], 'the newer arrangement stands');
  assert.deepEqual([session.get(a).x, session.get(a).y, session.get(a).version], [500, 500, 2], 'and is shown here now');
  assert.equal(canvasModel.noteText(server.rows.get(n).content), 'theirs', 'the newer text stands');
  assert.equal(canvasModel.noteText(session.get(n).content), 'theirs', 'shown here');
  assert.deepEqual([...session.conflicts.keys()], [n]);
  assert.equal(session.conflicts.get(n).mine, 'mine, revised');
  assert.equal(session.status, 'saved');

  session.keepMine(n);
  assert.equal(session.conflicts.size, 0);
  await timers.advance(400);
  assert.equal(canvasModel.noteText(server.rows.get(n).content), 'mine, revised', 'an explicit choice, on the current version');
  assert.equal(server.rows.get(n).version, 3);
});

test('session: a failed batch keeps everything dirty on the device and retries with backoff; nothing is ever duplicated; changes during a save are saved next', async () => {
  const server = fakeServer();
  const { session, timers, drafts, statuses } = makeSession(server);
  const a = session.createNote({ x: 0, y: 0 }, SIZE, 'keep me');
  server.fail = 2;
  await timers.advance(400);
  assert.equal(session.status, 'retrying');
  assert.equal(drafts.at(-1).entries.length, 1, 'still on the device');
  await timers.advance(2000);
  assert.equal(session.status, 'retrying');
  await timers.advance(5000);
  assert.equal(session.status, 'saved');
  assert.equal(server.calls.length, 3);
  assert.equal(server.rows.size, 1, 'one row after three attempts');

  // A change while a batch is in flight.
  let release;
  server.gate = new Promise((r) => { release = r; });
  session.setNoteText(a, 'typed before the save');
  await timers.advance(400);
  assert.equal(session.status, 'saving');
  session.setNoteText(a, 'typed during the save');
  release();
  server.gate = null;
  await settle();
  await settle();
  assert.equal(session.status, 'pending', 'the later text is not marked clean by the older save');
  await timers.advance(400);
  assert.equal(canvasModel.noteText(server.rows.get(a).content), 'typed during the save');
  assert.equal(session.status, 'saved');
  assert.ok(statuses.includes('retrying'));

  // flush() saves now.
  session.moveLive([a], 7, 7);
  session.commitMove(new Map([[a, { x: 0, y: 0 }]]));
  await session.flush();
  assert.equal(server.rows.get(a).x, 7);
});

test('session: a Canvas in Trash stops saving and keeps its changes; resume saves them; a device draft is laid over the server on open', async () => {
  const server = fakeServer();
  const first = makeSession(server);
  const a = first.session.createNote({ x: 0, y: 0 }, SIZE, 'saved');
  await first.timers.advance(400);
  server.trashed = true;
  first.session.setNoteText(a, 'typed in Trash');
  first.session.endNoteEdit(a);
  await first.timers.advance(400);
  assert.equal(first.session.status, 'trashed');
  assert.equal(canvasModel.noteText(server.rows.get(a).content), 'saved');
  server.trashed = false;
  await first.session.resume();
  assert.equal(canvasModel.noteText(server.rows.get(a).content), 'typed in Trash');
  assert.equal(first.session.status, 'saved');

  // Another window closed with unsaved changes: its draft opens over the server's Canvas.
  const b = `00000000-0000-4000-8000-${'9'.repeat(12)}`;
  const draft = {
    canvasId: 'cv',
    entries: [
      { id: b, op: 'create', fields: [], item: { id: b, canvas_id: 'cv', project_id: 'p', item_type: 'note', scene_id: null, chapter_id: null, document_id: null, entry_id: null, target_canvas_id: null, label: null, content: canvasModel.noteDoc('from the other window'), x: 9, y: 9, width: 220, height: 64, z: 5, version: 0, created_at: 't', updated_at: 't' } },
      { id: a, op: 'update', fields: ['x', 'y'], item: { ...server.rows.get(a), x: 123, y: 456 } },
    ],
  };
  const second = makeSession(server);
  second.session.applyDraft(draft);
  assert.equal(second.session.has(b), true);
  assert.deepEqual([second.session.get(a).x, second.session.get(a).y], [123, 456], 'the update applied: the server still had its base version');
  await second.timers.advance(400);
  assert.ok(server.rows.has(b));
  assert.equal(server.rows.get(a).x, 123);
  assert.equal(second.session.status, 'saved');

  // A draft update whose base version the server has moved past: the server's row stands; a note's text is kept as a conflict.
  server.elsewhere(a, { content: canvasModel.noteDoc('newer elsewhere') });
  const third = makeSession(server);
  third.session.applyDraft({ canvasId: 'cv', entries: [{ id: a, op: 'update', fields: ['content'], item: { ...server.rows.get(a), version: server.rows.get(a).version - 1, content: canvasModel.noteDoc('old draft') } }] });
  assert.equal(canvasModel.noteText(third.session.get(a).content), 'newer elsewhere');
  assert.equal(third.session.conflicts.get(a)?.mine, 'old draft');
  assert.equal(third.session.dirtyCount, 0);
  // A draft for another Canvas is ignored.
  third.session.applyDraft({ canvasId: 'other', entries: [{ id: 'x', op: 'delete', fields: [], item: null }] });
  assert.equal(third.session.has(a), true);
});

// ── 6. Pure rules ─────────────────────────────────────────────────────────────

test('rules: zoom keeps the point under the pointer; pan; world ↔ screen; clamped scale; fit; marquee; selection; duplicates; stacking; previews; viewport memory', () => {
  const m = canvasModel;
  const vp = { tx: 100, ty: 50, scale: 1 };
  const at = { x: 300, y: 200 };
  const before = m.toWorld(vp, at);
  const zoomed = m.zoomAt(vp, 2, at);
  assert.deepEqual(m.toWorld(zoomed, at), before, 'the world point under the pointer stays');
  assert.equal(zoomed.scale, 2);
  assert.equal(m.zoomAt(vp, 100, at).scale, m.SCALE_MAX);
  assert.equal(m.zoomAt(vp, 0.0001, at).scale, m.SCALE_MIN);
  const maxed = { ...vp, scale: m.SCALE_MAX };
  assert.equal(m.zoomAt(maxed, 2, at), maxed, 'at the limit, the same view is returned');
  assert.deepEqual(m.panBy(vp, 10, -5), { tx: 110, ty: 45, scale: 1 });
  const w = { x: -1234.5, y: 999 };
  const s = m.toScreen(zoomed, w);
  assert.deepEqual(m.toWorld(zoomed, s), w);
  assert.equal(m.clampScale(NaN), 1);

  const rects = [{ x: 0, y: 0, width: 100, height: 50 }, { x: 900, y: 400, width: 100, height: 100 }];
  const fit = m.fitAll(rects, { width: 1000, height: 600 });
  assert.ok(fit.scale <= 1 && fit.scale >= m.SCALE_MIN);
  const centre = m.toWorld(fit, { x: 500, y: 300 });
  assert.deepEqual([Math.round(centre.x), Math.round(centre.y)], [500, 250], 'everything centred');
  assert.deepEqual(m.fitAll([], { width: 1000, height: 600 }), { scale: 1, tx: 64, ty: 64 });
  assert.deepEqual(m.boundsOf(rects), { x: 0, y: 0, width: 1000, height: 500 });

  const items = [{ id: 'a', rect: rects[0] }, { id: 'b', rect: rects[1] }, { id: 'c', rect: { x: 100, y: 0, width: 10, height: 10 } }];
  assert.deepEqual(m.marqueeSelection(items, m.rectFrom({ x: 50, y: 25 }, { x: -10, y: -10 })), ['a']);
  assert.deepEqual(m.marqueeSelection(items, { x: 0, y: 0, width: 1000, height: 1000 }), ['a', 'b', 'c']);
  assert.deepEqual(m.marqueeSelection(items, { x: 100, y: 0, width: 0, height: 0 }), [], 'touching edges don\'t count');

  assert.deepEqual([...m.selectOnClick(new Set(['a', 'b']), 'c', false)], ['c']);
  assert.deepEqual([...m.selectOnClick(new Set(['a', 'b']), 'a', true)], ['b']);
  assert.deepEqual([...m.selectOnClick(new Set(['a']), 'b', true)], ['a', 'b']);
  assert.deepEqual([...m.selectOnClick(new Set(['a']), 'a', false)], ['a']);

  assert.equal(m.duplicateNotice('scene'), 'This Scene is already on this Canvas.');
  assert.equal(m.duplicateNotice('entry'), 'This Entry is already on this Canvas.');
  assert.equal(m.duplicateNotice('canvas'), 'This Canvas is already on this Canvas.');
  const placed = [
    { id: '1', item_type: 'scene', scene_id: 'S', chapter_id: null, document_id: null, entry_id: null, target_canvas_id: null, z: 2, created_at: 'a' },
    { id: '2', item_type: 'scene', scene_id: 'S', chapter_id: null, document_id: null, entry_id: null, target_canvas_id: null, z: 1, created_at: 'b' },
    { id: '3', item_type: 'note', scene_id: null, chapter_id: null, document_id: null, entry_id: null, target_canvas_id: null, z: 0, created_at: 'c' },
  ];
  assert.deepEqual(m.placementsOf(placed, 'S').map((i) => i.id), ['2', '1']);
  assert.equal(m.nextZ(placed), 3);
  assert.equal(m.placementTypeOf({ kind: 'unplacedScene' }), 'scene');
  assert.equal(m.placementTypeOf({ kind: 'workspaceFolder' }), null);
  assert.equal(m.placementTypeOf({ kind: 'group' }), null);

  assert.equal(m.previewText(doc('One line.', 'Another, with *more* words that go on.')), 'One line. Another, with *more* words that go on.');
  assert.equal(m.previewText(doc('word '.repeat(100)), 40).endsWith('…'), true);
  assert.ok(m.previewText(doc('word '.repeat(100)), 40).length <= 41);
  assert.equal(m.previewText({ type: 'doc', content: [] }), '');
  assert.equal(m.previewText(null), '');

  assert.deepEqual(m.parseViewport(JSON.stringify({ tx: 1, ty: 2, scale: 0.5 })), { tx: 1, ty: 2, scale: 0.5 });
  assert.deepEqual(m.parseViewport(JSON.stringify({ tx: 1, ty: 2, scale: 99 })), { tx: 1, ty: 2, scale: m.SCALE_MAX });
  assert.equal(m.parseViewport('{"tx":"a"}'), null);
  assert.equal(m.parseViewport('not json'), null);
  assert.equal(m.parseViewport(null), null);
  assert.equal(m.viewportStorageKey('abc'), 'rune2:canvas-viewport:abc');
});
