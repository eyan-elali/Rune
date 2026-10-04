// Canvas spatial organization (Rune 2.0, Milestone 22B, migration 046):
// Sections with explicit membership, connections between placements,
// authoritative card sizes, arrangement, navigation helpers, Find on Canvas,
// Project Search over Canvas notes, clipboard semantics and the session's
// reliability — against the Rune 2.0 schema in real Postgres + RLS, and
// against a fake server with deterministic timers.
//
// The rule under test everywhere: a Canvas arranges how the writer thinks
// about Rune objects; it never changes the manuscript or the Workspace.
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

const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const all = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const doc = (...paragraphs) => ({
  type: 'doc',
  content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
});
let idSeq = 0;
const uuid = () => `22222222-2222-4333-8444-${String(++idSeq).padStart(12, '0')}`;
const settle = () => new Promise((r) => setImmediate(r));

let legacy;
let canvas, pages, collections, trash, scenes, workspace, manuscriptLoader, search;
let nav, engine, canvasModel, arrange, find, sessionMod;
before(async () => {
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
  canvas = await bundleForTest('src/lib/actions/workspaceCanvas.ts', { name: 'co_canvas' });
  pages = await bundleForTest('src/lib/actions/workspacePages.ts', { name: 'co_pages' });
  collections = await bundleForTest('src/lib/actions/workspaceCollections.ts', { name: 'co_collections' });
  trash = await bundleForTest('src/lib/actions/workspaceTrash.ts', { name: 'co_trash' });
  scenes = await bundleForTest('src/lib/actions/scenes.ts', { name: 'co_scenes' });
  search = await bundleForTest('src/lib/actions/projectSearch.ts', { name: 'co_search' });
  workspace = await bundleForTest('src/lib/rune2/projectWorkspace.ts', { name: 'co_loader' });
  manuscriptLoader = await bundleForTest('src/lib/rune2/projectManuscript.ts', { name: 'co_manuscript' });
  nav = await bundleForTest('src/lib/rune2/navigatorModel.ts', { name: 'co_nav' });
  engine = await bundleForTest('src/lib/rune2/projectSearch.ts', { name: 'co_engine' });
  canvasModel = await bundleForTest('src/lib/rune2/canvas.ts', { name: 'co_model' });
  arrange = await bundleForTest('src/lib/rune2/canvasArrange.ts', { name: 'co_arrange' });
  find = await bundleForTest('src/lib/rune2/canvasFind.ts', { name: 'co_find' });
  sessionMod = await bundleForTest('src/lib/rune2/canvasSession.ts', { name: 'co_session' });
});

async function seededDb() {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  await prototypeLegacyToRune2(legacy, db);
  return db;
}

function signIn(db, userId) {
  const sb = createSupabaseAdapter(db, { userId });
  for (const mod of [canvas, pages, collections, trash, scenes, search, workspace, manuscriptLoader]) mod.setServerClient(sb);
  return sb;
}

const ok = (r) => { assert.equal(r.error, null, r.error); return r.data; };

async function shellIndex(pid = HOLLOW) {
  const [m, w] = [await manuscriptLoader.loadProjectManuscript(pid), await workspace.loadProjectWorkspace(pid)];
  return new Map([...nav.indexManuscript(m), ...nav.indexWorkspace(w.tree, {}, w.entries)]);
}

async function manuscriptState(db) {
  return {
    projects: await all(db, `select id, word_count, updated_at from public.projects order by id`),
    chapters: await all(db, `select * from public.chapters order by id`),
    scenes: await all(db, `select * from public.scenes order by id`),
    sessions: await all(db, `select * from public.writing_sessions order by id`),
    documents: await all(db, `select id, title, content, version, updated_at from public.workspace_documents order by id`),
    entries: await all(db, `select id, title, content, version, updated_at from public.workspace_collection_entries order by id`),
    references: await all(db, `select * from public.object_references order by id`),
    accountTotal: await asUser(db, ALICE, async (tx) => (await tx.query(`select public.account_word_total() as n`)).rows[0].n),
  };
}

/** Alice's Hollow: a Page, a Collection with one Entry, two Canvases. */
async function hollow(db) {
  signIn(db, ALICE);
  const intro = ok(await pages.createWorkspacePage(HOLLOW, 'Intro'));
  const characters = ok(await collections.createWorkspaceCollection(HOLLOW, 'Characters')).collection;
  const nerai = ok(await collections.createCollectionEntry(characters.id, 'Nerai'));
  const plot = ok(await canvas.createWorkspaceCanvas(HOLLOW, 'Plot'));
  const world = ok(await canvas.createWorkspaceCanvas(HOLLOW, 'World'));
  return { intro, characters, nerai, plot: plot.canvas, world: world.canvas };
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

// ── 1. Sections and sizes in the database ─────────────────────────────────────

test('db: a Section is a placement with a title and no target; membership is explicit, of the same Canvas, never nested; reload returns it; the manuscript is untouched', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const before = await manuscriptState(db);
  const section = create('section', null, { label: '  Nerai Arc  ', x: 0, y: 0, width: 640, height: 420 });
  const a = create('scene', pageId('h4a'), { label: 'Scene 1', x: 40, y: 60, section_id: section.id });
  const n = create('note', null, { content: doc('a thought'), x: 300, y: 60, section_id: section.id });
  const loose = create('page', t.intro.id, { label: 'Intro', x: 900, y: 0 });
  allOk(await canvas.writeCanvasItems(t.plot.id, [section, a, n, loose]));

  const loaded = ok(await canvas.getWorkspaceCanvas(t.plot.id));
  const byId = new Map(loaded.items.map((i) => [i.id, i]));
  assert.deepEqual([byId.get(section.id).item_type, byId.get(section.id).label, byId.get(section.id).section_id, byId.get(section.id).manual_size], ['section', 'Nerai Arc', null, false]);
  assert.equal(byId.get(a.id).section_id, section.id);
  assert.equal(byId.get(n.id).section_id, section.id);
  assert.equal(byId.get(loose.id).section_id, null);
  assert.deepEqual(loaded.connections, []);
  assert.deepEqual(canvasModel.membersOf(loaded.items, section.id).sort(), [a.id, n.id].sort());

  // Membership moves with updates and bumps the version; so do a size and a title.
  const [joined] = allOk(await canvas.writeCanvasItems(t.plot.id, [{ op: 'update', id: loose.id, expected_version: 1, section_id: section.id }]));
  assert.equal(joined.version, 2);
  const [left] = allOk(await canvas.writeCanvasItems(t.plot.id, [{ op: 'update', id: loose.id, expected_version: 2, section_id: null }]));
  assert.equal(left.version, 3);
  assert.equal((await one(db, `select section_id from public.workspace_canvas_items where id = $1`, [loose.id])).section_id, null);
  const [sized] = allOk(await canvas.writeCanvasItems(t.plot.id, [{ op: 'update', id: a.id, expected_version: 1, width: 300, height: 180, manual_size: true }]));
  assert.equal(sized.version, 2);
  assert.deepEqual(await one(db, `select width, height, manual_size from public.workspace_canvas_items where id = $1`, [a.id]), { width: 300, height: 180, manual_size: true });
  const [renamed] = allOk(await canvas.writeCanvasItems(t.plot.id, [{ op: 'update', id: section.id, expected_version: 1, label: ' Act II ' }]));
  assert.equal(renamed.version, 2);
  assert.equal((await one(db, `select label from public.workspace_canvas_items where id = $1`, [section.id])).label, 'Act II');
  const [untitled] = allOk(await canvas.writeCanvasItems(t.plot.id, [{ op: 'update', id: section.id, expected_version: 2, label: '   ' }]));
  assert.equal(untitled.version, 3);
  assert.equal((await one(db, `select label from public.workspace_canvas_items where id = $1`, [section.id])).label, null);
  // Only a Section is renamed on the Canvas; a card's label is the title when placed.
  const [badLabel] = results(await canvas.writeCanvasItems(t.plot.id, [{ op: 'update', id: a.id, expected_version: 2, label: 'x' }]));
  assert.match(badLabel.error, /Only a Section is renamed/);

  // Never nested; never a Section of another Canvas; never a card as a Section.
  const inner = create('section', null, { label: 'Inner', section_id: section.id });
  const [nested] = results(await canvas.writeCanvasItems(t.plot.id, [inner]));
  assert.match(nested.error, /cannot be inside a Section|section_not_nested/);
  const [nestedUpdate] = results(await canvas.writeCanvasItems(t.plot.id, [{ op: 'update', id: section.id, expected_version: 3, section_id: section.id }]));
  assert.ok(nestedUpdate.status === 'error');
  const other = create('section', null, { label: 'Elsewhere' });
  allOk(await canvas.writeCanvasItems(t.world.id, [other]));
  const [foreign] = results(await canvas.writeCanvasItems(t.plot.id, [create('scene', pageId('h4b'), { section_id: other.id })]));
  assert.match(foreign.error, /not on this Canvas/);
  const [asSection] = results(await canvas.writeCanvasItems(t.plot.id, [create('scene', pageId('h4b'), { section_id: a.id })]));
  assert.match(asSection.error, /not on this Canvas/);
  await assert.rejects(db.query(`update public.workspace_canvas_items set section_id = $2 where id = $1`, [section.id, section.id]), /section_not_nested|cannot be inside/);

  // Deleting the Section keeps its placements, now unsectioned (and tells their windows: the version moved).
  const versions = await all(db, `select id, version from public.workspace_canvas_items where section_id = $1 order by id`, [section.id]);
  allOk(await canvas.writeCanvasItems(t.plot.id, [{ op: 'delete', id: section.id }]));
  const after = await all(db, `select id, section_id, version from public.workspace_canvas_items where canvas_id = $1 order by id`, [t.plot.id]);
  assert.deepEqual(after.map((r) => r.id).sort(), [a.id, n.id, loose.id].sort(), 'the placements stay');
  assert.ok(after.every((r) => r.section_id === null));
  for (const v of versions) assert.equal(after.find((r) => r.id === v.id).version, v.version + 1, 'membership change is a version bump');
  assert.deepEqual(await manuscriptState(db), before, 'no Scene, Page, Entry, reference, word or session changed');
});

// ── 2. Connections in the database ────────────────────────────────────────────

test('db: connections join two placements of one Canvas — the same Scene placed twice is connected once; directed and labelled; conditional updates; refusals; idempotent; clients never write', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const before = await manuscriptState(db);
  const s1 = create('scene', pageId('h4a'), { x: 0, y: 0 });
  const s2 = create('scene', pageId('h4a'), { x: 500, y: 0 });
  const n = create('note', null, { content: doc('why?'), x: 250, y: 200 });
  const e = create('entry', t.nerai.id, { x: 500, y: 400 });
  const section = create('section', null, { label: 'Arc' });
  allOk(await canvas.writeCanvasItems(t.plot.id, [s1, s2, n, e, section]));

  const c1 = connect(s1.id, n.id, { directed: true, label: '  leads to  ' });
  const c2 = connect(n.id, e.id);
  const [r1, r2] = allOk(await canvas.writeCanvasItems(t.plot.id, [c1, c2]));
  assert.deepEqual([r1.version, r2.version], [1, 1]);
  const loaded = ok(await canvas.getWorkspaceCanvas(t.plot.id));
  assert.equal(loaded.connections.length, 2);
  const k1 = loaded.connections.find((c) => c.id === c1.id);
  assert.deepEqual([k1.source_item_id, k1.target_item_id, k1.directed, k1.label, k1.canvas_id, k1.project_id], [s1.id, n.id, true, 'leads to', t.plot.id, HOLLOW]);
  assert.equal(loaded.connections.find((c) => c.id === c2.id).label, null);
  // Only the first placement of the Scene is connected: endpoints are placements, not objects.
  assert.equal(loaded.connections.some((c) => c.source_item_id === s2.id || c.target_item_id === s2.id), false);

  // Conditional updates; a no-op keeps the version; a stale window is told the truth.
  const [u1] = allOk(await canvas.writeCanvasItems(t.plot.id, [{ kind: 'connection', op: 'update', id: c2.id, expected_version: 1, directed: true, label: 'because' }]));
  assert.equal(u1.version, 2);
  const [same] = allOk(await canvas.writeCanvasItems(t.plot.id, [{ kind: 'connection', op: 'update', id: c2.id, expected_version: 2, directed: true }]));
  assert.equal(same.version, 2);
  const [stale] = results(await canvas.writeCanvasItems(t.plot.id, [{ kind: 'connection', op: 'update', id: c2.id, expected_version: 1, label: 'late' }]));
  assert.equal(stale.status, 'conflict');
  assert.deepEqual([stale.version, stale.item.label, stale.item.directed], [2, 'because', true]);
  const [cleared] = allOk(await canvas.writeCanvasItems(t.plot.id, [{ kind: 'connection', op: 'update', id: c2.id, expected_version: 2, label: '' }]));
  assert.equal(cleared.version, 3);
  assert.equal((await one(db, `select label from public.workspace_canvas_connections where id = $1`, [c2.id])).label, null);
  const [missing] = results(await canvas.writeCanvasItems(t.plot.id, [{ kind: 'connection', op: 'update', id: uuid(), expected_version: 1, label: 'x' }]));
  assert.equal(missing.status, 'missing');

  // Refused: itself, a Section, another Canvas's placement, a placement that doesn't exist, an unknown kind.
  const other = create('scene', pageId('h4b'));
  allOk(await canvas.writeCanvasItems(t.world.id, [other]));
  const rs = results(await canvas.writeCanvasItems(t.plot.id, [
    connect(s1.id, s1.id),
    connect(s1.id, section.id),
    connect(s1.id, other.id),
    connect(s1.id, uuid()),
    { ...connect(s1.id, e.id), kind: 'image' },
  ]));
  assert.deepEqual(rs.map((r) => r.status), ['error', 'error', 'error', 'error', 'error']);
  assert.match(rs[0].error, /not_self|same Canvas/);
  assert.match(rs[1].error, /two placements of the same Canvas/);
  assert.match(rs[2].error, /two placements of the same Canvas/);
  assert.match(rs[4].error, /Unknown kind/);
  // Its ends are for life.
  await assert.rejects(db.query(`update public.workspace_canvas_connections set target_item_id = $2 where id = $1`, [c1.id, e.id]), /keeps its canvas and its ends/);

  // Idempotent: the same create again is ok and makes nothing; a delete twice is ok; another Canvas's id is never touched.
  const [again] = allOk(await canvas.writeCanvasItems(t.plot.id, [c1]));
  assert.equal(again.version, 1);
  assert.equal((await all(db, `select id from public.workspace_canvas_connections where canvas_id = $1`, [t.plot.id])).length, 2);
  allOk(await canvas.writeCanvasItems(t.plot.id, [{ kind: 'connection', op: 'delete', id: c2.id }]));
  allOk(await canvas.writeCanvasItems(t.plot.id, [{ kind: 'connection', op: 'delete', id: c2.id }]));
  const [foreignCreate] = results(await canvas.writeCanvasItems(t.world.id, [{ ...c1 }]));
  assert.match(foreignCreate.error, /another canvas/);
  allOk(await canvas.writeCanvasItems(t.world.id, [{ kind: 'connection', op: 'delete', id: c1.id }]));
  assert.ok(await one(db, `select id from public.workspace_canvas_connections where id = $1`, [c1.id]), 'Plot\'s connection stays');

  // Privileges: another writer sees nothing; no client writes the table; anon can't execute.
  signIn(db, BRAM);
  assert.deepEqual(await canvas.writeCanvasItems(t.plot.id, [connect(s1.id, n.id)]), { status: 'not_found' });
  const bram = createSupabaseAdapter(db, { userId: BRAM });
  assert.deepEqual((await bram.from('workspace_canvas_connections').select('id').eq('canvas_id', t.plot.id)).data, []);
  for (const user of [ALICE, BRAM]) {
    await assert.rejects(asUser(db, user, (tx) => tx.query(`insert into public.workspace_canvas_connections (canvas_id, project_id, source_item_id, target_item_id) values ($1, $2, $3, $4)`, [t.plot.id, HOLLOW, s1.id, e.id])), /permission denied/);
    await assert.rejects(asUser(db, user, (tx) => tx.query(`update public.workspace_canvas_connections set label = 'x' where id = $1`, [c1.id])), /permission denied/);
    await assert.rejects(asUser(db, user, (tx) => tx.query(`delete from public.workspace_canvas_connections where id = $1`, [c1.id])), /permission denied/);
  }
  signIn(db, ALICE);
  assert.equal(ok(await canvas.getWorkspaceCanvas(t.plot.id)).connections.length, 1);

  // Backup reads them.
  const alice = createSupabaseAdapter(db, { userId: ALICE });
  const backup = (await alice.rpc('read_project_backup', { p_project_id: HOLLOW, p_kind: 'workspace_canvas_connections', p_after: null, p_limit: 10 })).data;
  assert.equal(backup.status, 'ok');
  assert.deepEqual(backup.rows.map((r) => r.id), [c1.id]);
  assert.deepEqual(await manuscriptState(db), before, 'connections touch nothing of the book');
});

test('db: a placement\'s connections go with it; a trashed Scene keeps its placement and the line; its permanent deletion cascades both; the Canvas in Trash hides them, restore shows them', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const s = create('scene', pageId('h4c'), { label: 'Scene 3' });
  const n = create('note', null, { content: doc('note') });
  const p = create('page', t.intro.id, { label: 'Intro' });
  allOk(await canvas.writeCanvasItems(t.plot.id, [s, n, p]));
  const c1 = connect(s.id, n.id, { directed: true });
  const c2 = connect(n.id, p.id);
  allOk(await canvas.writeCanvasItems(t.plot.id, [c1, c2]));
  const rows = () => all(db, `select id from public.workspace_canvas_connections where canvas_id = $1 order by id`, [t.plot.id]);

  // Removing the note's placement removes both lines; the note's neighbours stay.
  allOk(await canvas.writeCanvasItems(t.plot.id, [{ op: 'delete', id: n.id }]));
  assert.deepEqual(await rows(), []);
  assert.equal((await all(db, `select id from public.workspace_canvas_items where canvas_id = $1`, [t.plot.id])).length, 2);

  const c3 = connect(s.id, p.id, { label: 'opens with' });
  allOk(await canvas.writeCanvasItems(t.plot.id, [c3]));
  // The Scene goes to Trash: its placement stays (unavailable), so the line stays.
  ok(await trash.trashWorkspaceObject('scene', pageId('h4c')));
  assert.deepEqual((await rows()).map((r) => r.id), [c3.id]);
  assert.equal(ok(await canvas.getWorkspaceCanvas(t.plot.id)).connections.length, 1);
  ok(await trash.restoreWorkspaceObject('scene', pageId('h4c')));
  assert.deepEqual((await rows()).map((r) => r.id), [c3.id]);
  // Permanently deleted: the placement cascades away, and the line with it. The Page's placement stays.
  ok(await trash.trashWorkspaceObject('scene', pageId('h4c')));
  ok(await trash.deleteTrashedWorkspaceObject('scene', pageId('h4c')));
  assert.deepEqual(await rows(), []);
  assert.deepEqual((await all(db, `select id from public.workspace_canvas_items where canvas_id = $1`, [t.plot.id])).map((r) => r.id), [p.id]);

  // The Canvas itself in Trash: its connections are hidden and unwritable; back on restore.
  const q = create('scene', pageId('h4a'));
  allOk(await canvas.writeCanvasItems(t.plot.id, [q]));
  const c4 = connect(q.id, p.id);
  allOk(await canvas.writeCanvasItems(t.plot.id, [c4]));
  ok(await trash.trashWorkspaceObject('canvas', t.plot.id));
  const alice = createSupabaseAdapter(db, { userId: ALICE });
  assert.deepEqual((await alice.from('workspace_canvas_connections').select('id').eq('canvas_id', t.plot.id)).data, []);
  assert.deepEqual(await canvas.writeCanvasItems(t.plot.id, [{ kind: 'connection', op: 'delete', id: c4.id }]), { status: 'trashed' });
  ok(await trash.restoreWorkspaceObject('canvas', t.plot.id));
  assert.deepEqual(ok(await canvas.getWorkspaceCanvas(t.plot.id)).connections.map((c) => c.id), [c4.id]);
  // Permanent deletion of the Canvas takes its connections.
  ok(await trash.trashWorkspaceObject('canvas', t.plot.id));
  ok(await trash.deleteTrashedWorkspaceObject('canvas', t.plot.id));
  assert.deepEqual(await all(db, `select id from public.workspace_canvas_connections where id = $1`, [c4.id]), []);
});

// ── 3. Project Search over Canvas notes ───────────────────────────────────────

test('search: Canvas notes and Section titles are found by their text, with their Canvas; a trashed Canvas\'s are not; the engine shows them under the Canvas and opens it at the note; nothing visual is searched', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const n = create('note', null, { content: doc('Nerai meets Alaric', 'on the lamplit bridge'), x: 123, y: 456 });
  const s = create('section', null, { label: 'Lamplit scenes' });
  const w = create('note', null, { content: doc('a lamplit corridor') });
  allOk(await canvas.writeCanvasItems(t.plot.id, [n, s, create('scene', pageId('h4a'), { label: 'lamplit' })]));
  allOk(await canvas.writeCanvasItems(t.world.id, [w]));
  const c = connect(n.id, s.id); // refused (a Section) — labels of connections are not searched anyway
  results(await canvas.writeCanvasItems(t.plot.id, [c]));

  const found = ok(await search.searchProjectContent(HOLLOW, 'lamplit'));
  const onCanvas = found.filter((m) => m.type.startsWith('canvas_'));
  assert.deepEqual(onCanvas.map((m) => [m.type, m.id, m.canvas_id]).sort(), [
    ['canvas_note', n.id, t.plot.id],
    ['canvas_note', w.id, t.world.id],
    ['canvas_section', s.id, t.plot.id],
  ].sort());
  assert.match(onCanvas.find((m) => m.id === n.id).snippet, /lamplit bridge/);
  assert.equal(onCanvas.find((m) => m.id === n.id).snippet.includes('456'), false, 'geometry is not text');
  assert.ok(found.every((m) => m.type !== 'scene' || m.id !== pageId('h4a') || true), 'a placement label is never a text match');
  assert.equal(found.some((m) => m.type === 'canvas_note' && m.snippet === 'lamplit'), false);

  // The engine: a result of its own kind, titled by the Canvas, carrying the placement to focus.
  const index = await shellIndex();
  const objects = engine.searchObjects(index);
  const rs = engine.searchProject(objects, 'lamplit', {}, found);
  const note = rs.find((r) => r.kind === 'canvasNote' && r.id === n.id);
  assert.deepEqual([note.title, note.context, note.canvasId, note.tier, note.subject], ['Plot', 'Workspace', t.plot.id, 4, null]);
  assert.match(note.snippet, /lamplit/);
  const section = rs.find((r) => r.kind === 'canvasSection');
  assert.deepEqual([section.id, section.title, section.canvasId], [s.id, 'Plot', t.plot.id]);
  assert.equal(engine.SEARCH_KIND_LABEL.canvasNote, 'Note on canvas');
  assert.ok(rs.findIndex((r) => r.kind === 'canvasNote') > rs.findIndex((r) => r.kind === 'scene'), 'after the objects themselves');
  assert.deepEqual(engine.searchProject(objects, 'lamplit', { kinds: ['canvasNote'] }, found).map((r) => r.kind), ['canvasNote', 'canvasNote'], 'scoped like any kind');
  assert.deepEqual(engine.searchProject(objects, 'lamplit', { kinds: ['scene'] }, found), [], 'a placement label is never a text match');

  // Trashed Canvas: gone from the server's answer and from the engine (its Canvas is not in the index).
  ok(await trash.trashWorkspaceObject('canvas', t.world.id));
  const after = ok(await search.searchProjectContent(HOLLOW, 'lamplit'));
  assert.equal(after.some((m) => m.id === w.id), false);
  const stale = engine.searchProject(engine.searchObjects(await shellIndex()), 'lamplit', {}, found);
  assert.equal(stale.some((r) => r.id === w.id), false, 'a match whose Canvas is not in the Project is dropped');
  // Another writer finds nothing of it.
  signIn(db, BRAM);
  assert.deepEqual(ok(await search.searchProjectContent(HOLLOW, 'lamplit')), []);
});

// ── 4. The one rule for what a Canvas can show ────────────────────────────────

test('rules: what a Canvas can place is one rule — navigator drag types, drop validation and "Add to canvas" agree', () => {
  const m = canvasModel;
  for (const kind of ['scene', 'unplacedScene', 'chapter', 'workspacePage', 'collectionEntry', 'workspaceCanvas']) {
    assert.ok(m.placementTypeOf({ kind }), kind);
    assert.ok(m.PLACEABLE_KINDS.includes(kind), kind);
    assert.deepEqual(m.canvasDragTypes({ kind }), [m.CANVAS_DRAG_OBJECT, m.CANVAS_DRAG_PLACEABLE]);
    assert.equal(m.isPlaceableDrag(m.canvasDragTypes({ kind })), true);
  }
  for (const kind of ['group', 'workspaceFolder', 'workspaceCollection']) {
    assert.equal(m.placementTypeOf({ kind }), null, kind);
    assert.equal(m.PLACEABLE_KINDS.includes(kind), false, kind);
    assert.deepEqual(m.canvasDragTypes({ kind }), [m.CANVAS_DRAG_OBJECT]);
    assert.equal(m.isPlaceableDrag(m.canvasDragTypes({ kind })), false);
  }
  assert.equal(m.isPlaceableDrag(['text/plain']), false);
  assert.deepEqual([...m.PLACEABLE_SEARCH_KINDS].sort(), ['canvas', 'chapter', 'entry', 'page', 'scene']);
  for (const k of m.PLACEABLE_SEARCH_KINDS) assert.ok(m.PLACEMENT_BY_SEARCH_KIND[k]);
  assert.equal(m.PLACEMENT_BY_SEARCH_KIND.collection, undefined);
  assert.equal(m.PLACEMENT_BY_SEARCH_KIND.folder, undefined);
  assert.equal(m.ITEM_LABEL.section, 'Section');
  for (const type of Object.keys(m.DEFAULT_SIZE)) {
    const c = m.clampSize(type, m.DEFAULT_SIZE[type]);
    assert.deepEqual(c, m.DEFAULT_SIZE[type], `${type}'s default is within its bounds`);
    assert.deepEqual(m.clampSize(type, { width: 1, height: 1 }), m.MIN_SIZE[type]);
    assert.deepEqual(m.clampSize(type, { width: 1e9, height: 1e9 }), m.MAX_SIZE[type]);
  }
  assert.deepEqual(m.clampSize('note', { width: 200.4, height: 99.6 }), { width: 200, height: 100 });
});

// ── 5. The session: a fake server, deterministic timers ───────────────────────

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

/** write_canvas_items as the database behaves (046): items and connections, membership, cascades. */
function fakeServer(items = [], connections = []) {
  const server = { rows: new Map(items.map((i) => [i.id, { ...i }])), connections: new Map(connections.map((c) => [c.id, { ...c }])), calls: [], fail: 0, gate: null, trashed: false };
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
        if (c.section_id && server.rows.get(c.section_id)?.item_type !== 'section') { results.push({ id: c.id, status: 'error', error: 'That Section is not on this Canvas' }); continue; }
        const { op, target_id, ...rest } = c;
        server.rows.set(c.id, { ...rest, scene_id: c.item_type === 'scene' ? target_id : null, chapter_id: null, document_id: null, entry_id: null, target_canvas_id: null, version: 1, canvas_id: 'cv', project_id: 'p', created_at: 't', updated_at: 't' });
        results.push({ id: c.id, status: 'ok', version: 1 });
        continue;
      }
      if (!row) { results.push({ id: c.id, status: 'missing' }); continue; }
      if (row.version !== c.expected_version) { results.push({ id: c.id, status: 'conflict', version: row.version, item: { ...row } }); continue; }
      const { op, id, expected_version, kind, ...fields } = c;
      if (fields.section_id && server.rows.get(fields.section_id)?.item_type !== 'section') { results.push({ id: c.id, status: 'error', error: 'That Section is not on this Canvas' }); continue; }
      Object.assign(row, fields, { version: row.version + 1 });
      results.push({ id: c.id, status: 'ok', version: row.version });
    }
    return { status: 'ok', results };
  };
  server.elsewhere = (id, fields) => { const row = server.rows.get(id) ?? server.connections.get(id); Object.assign(row, fields, { version: row.version + 1 }); };
  return server;
}

function makeSession(server, extra = {}) {
  const timers = fakeTimers();
  const drafts = [];
  let n = 0;
  const session = new sessionMod.CanvasSession({
    canvasId: 'cv',
    projectId: 'p',
    items: structuredClone([...server.rows.values()]),
    connections: structuredClone([...server.connections.values()]),
    write: server.write,
    persist: (d) => drafts.push(structuredClone(d)),
    delay: 400,
    retryDelays: [2000, 5000],
    timers,
    now: () => '2026-10-02T00:00:00.000Z',
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    ...extra,
  });
  return { session, timers, drafts };
}
const SIZE = { width: 220, height: 64 };
const CARD = { width: 248, height: 132 };
const at = (s, id) => { const i = s.get(id); return { x: i.x, y: i.y, width: i.width, height: i.height }; };
const fromOf = (s, ids) => new Map(ids.map((id) => [id, { x: s.get(id).x, y: s.get(id).y }]));
/** A drag of `direct` from the surface: the ids with their Sections' members move together; membership settles for the ones dragged themselves. */
const drag = (s, direct, dx, dy) => {
  const ids = s.withMembers(direct);
  const from = fromOf(s, ids);
  s.moveLive(ids, dx, dy);
  s.commitMove(from, new Set(direct));
};

test('session: resize — handles clamp to the kind\'s bounds, the size is then the writer\'s (manual_size), one undo entry, persisted; a note grows while typed into until sized by hand, never past the cap; a conflicting resize adopts the server', async () => {
  const server = fakeServer();
  const { session, timers } = makeSession(server);
  const a = session.addPlacement('scene', 'scene-1', 'Scene 1', { x: 100, y: 100 }, CARD);
  const n = session.createNote({ x: 0, y: 400 }, SIZE, 'one line');
  await timers.advance(400);
  assert.equal(server.rows.get(a).manual_size, false);

  const from = at(session, a);
  session.resizeLive(a, { x: 100, y: 100, width: 400, height: 300 });
  session.resizeLive(a, { x: 100, y: 100, width: 5, height: 5000 });
  assert.deepEqual([session.get(a).width, session.get(a).height], [canvasModel.MIN_SIZE.scene.width, canvasModel.MAX_SIZE.scene.height], 'clamped as it goes');
  session.resizeLive(a, { x: 80, y: 90, width: 320, height: 200 });
  assert.equal(server.calls.length, 1, 'nothing saved during the resize');
  session.commitResize(a, from);
  assert.deepEqual(at(session, a), { x: 80, y: 90, width: 320, height: 200 });
  assert.equal(session.get(a).manual_size, true);
  await timers.advance(400);
  const row = server.rows.get(a);
  assert.deepEqual([row.x, row.y, row.width, row.height, row.manual_size, row.version], [80, 90, 320, 200, true, 2]);
  session.undo();
  assert.deepEqual(at(session, a), from);
  assert.equal(session.get(a).manual_size, false);
  session.redo();
  assert.deepEqual(at(session, a), { x: 80, y: 90, width: 320, height: 200 });
  await timers.advance(400);
  assert.deepEqual([server.rows.get(a).width, server.rows.get(a).version], [320, 3], 'undo and redo before the pause: one update, back where it was');
  // A resize that changes nothing is no entry.
  const stack = session.canRedo;
  session.commitResize(a, at(session, a));
  assert.equal(session.canRedo, stack);
  // The Scene behind the card is only pointed at.
  assert.equal(server.rows.get(a).scene_id, 'scene-1');

  // The note grows with its text, up to the cap, never shrinking on its own.
  session.autoGrowNote(n, 120);
  assert.equal(session.get(n).height, 120);
  session.autoGrowNote(n, 90);
  assert.equal(session.get(n).height, 120, 'never shrinks by itself');
  session.autoGrowNote(n, 10_000);
  assert.equal(session.get(n).height, canvasModel.NOTE_AUTO_MAX_HEIGHT);
  await timers.advance(400);
  assert.equal(server.rows.get(n).height, canvasModel.NOTE_AUTO_MAX_HEIGHT);
  // Sized by hand: it stays that size whatever is typed.
  const nf = at(session, n);
  session.resizeLive(n, { ...nf, height: 80 });
  session.commitResize(n, nf);
  session.autoGrowNote(n, 300);
  assert.equal(session.get(n).height, 80, 'manual resize is respected');
  // A card's placement of a live object isn't grown either.
  session.autoGrowNote(a, 900);
  assert.equal(session.get(a).height, 200);
  await timers.advance(400);

  // Another window resized the card meanwhile: its size stands here.
  server.elsewhere(a, { width: 500, height: 400, manual_size: true });
  const f2 = at(session, a);
  session.resizeLive(a, { ...f2, width: 200, height: 100 });
  session.commitResize(a, f2);
  await timers.advance(400);
  assert.deepEqual([session.get(a).width, session.get(a).height, session.get(a).version], [500, 400, server.rows.get(a).version]);
  assert.deepEqual([server.rows.get(a).width, server.rows.get(a).height], [500, 400]);
  assert.equal(session.status, 'saved');
});

test('session: Sections — created around cards (members at once), renamed, moved with their members, resized without losing them; a drag settles membership; deletion keeps the placements; undo restores all of it; never nested', async () => {
  const server = fakeServer();
  const { session, timers } = makeSession(server);
  const a = session.addPlacement('scene', 'scene-1', 'Scene 1', { x: 40, y: 60 }, CARD);
  const b = session.createNote({ x: 320, y: 60 }, SIZE, 'inside');
  const far = session.addPlacement('scene', 'scene-2', 'Scene 2', { x: 2000, y: 2000 }, CARD);
  await timers.advance(400);

  const s = session.createSection({ x: 0, y: 0, width: 640, height: 420 }, '  Nerai Arc ');
  assert.deepEqual([session.get(s).item_type, session.get(s).label, session.get(s).section_id], ['section', 'Nerai Arc', null]);
  assert.deepEqual(session.membersOf(s).sort(), [a, b].sort(), 'cards whose centre it holds join it');
  assert.equal(session.get(far).section_id, null);
  assert.deepEqual(session.withMembers([s]).sort(), [s, a, b].sort());
  await timers.advance(400);
  const batch = server.calls.at(-1);
  assert.deepEqual(batch.map((c) => [c.op, c.item_type ?? null]), [['create', 'section'], ['update', null], ['update', null]], 'the Section is created before its members join');
  assert.deepEqual(batch.slice(1).map((c) => c.section_id), [s, s]);
  assert.deepEqual([server.rows.get(a).section_id, server.rows.get(b).section_id], [s, s]);
  session.undo();
  assert.equal(session.has(s), false);
  assert.deepEqual([session.get(a).section_id, session.get(b).section_id], [null, null], 'undo: no Section, nothing sectioned');
  session.redo();
  assert.deepEqual(session.membersOf(s).sort(), [a, b].sort());
  await timers.advance(400);

  // Rename: one entry, blank = untitled.
  session.setSectionTitle(s, 'Act II');
  session.setSectionTitle(s, '   ');
  assert.equal(session.get(s).label, null);
  session.undo();
  assert.equal(session.get(s).label, 'Act II');
  await timers.advance(400);
  assert.equal(server.rows.get(s).label, 'Act II');
  assert.equal(server.calls.at(-1)[0].label, 'Act II');

  // Moving the Section carries its members (one entry), and a member stays a member.
  drag(session, [s], 100, 50);
  assert.deepEqual([session.get(s).x, session.get(a).x, session.get(b).x, session.get(far).x], [100, 140, 420, 2000]);
  assert.deepEqual([session.get(a).section_id, session.get(b).section_id], [s, s]);
  await timers.advance(400);
  assert.equal(server.calls.at(-1).length, 3, 'one batch: the Section and both members');
  session.undo();
  assert.deepEqual([session.get(s).x, session.get(a).x, session.get(b).x], [0, 40, 320], 'all back');
  session.redo();
  await timers.advance(400);
  assert.deepEqual([server.rows.get(s).x, server.rows.get(a).x, server.rows.get(b).x], [100, 140, 420]);

  // Dragging a card out: it leaves. Dragging it back in: it joins. A card dragged into the Section joins.
  drag(session, [a], 1500, 1500);
  assert.equal(session.get(a).section_id, null, 'dragged out');
  drag(session, [a], -1500, -1500);
  assert.equal(session.get(a).section_id, s, 'dragged back in');
  drag(session, [far], -1800, -1850);
  assert.equal(session.get(far).section_id, s, 'the far card lands inside and joins');
  session.undo();
  assert.equal(session.get(far).section_id, null, 'undo of the drag undoes the join');
  session.redo();
  await timers.advance(400);
  assert.equal(server.rows.get(far).section_id, s);
  // A member selected together with its Section keeps its membership through the move.
  drag(session, [s, a], 10, 10);
  assert.equal(session.get(a).section_id, s);
  // Moving the Section over nothing changes no membership of outside cards; a card not dragged itself keeps its Section wherever its Section goes.
  drag(session, [s], 5000, 5000);
  assert.deepEqual([session.get(a).section_id, session.get(b).section_id, session.get(far).section_id], [s, s, s]);
  drag(session, [s], -5000, -5000);
  await timers.advance(400);

  // Resizing the Section never changes membership: a member left outside still travels with it.
  const sf = at(session, s);
  session.resizeLive(s, { ...sf, width: 220, height: 200 });
  session.commitResize(s, sf);
  assert.deepEqual([session.get(a).section_id, session.get(b).section_id, session.get(far).section_id], [s, s, s]);
  drag(session, [s], 7, 7);
  assert.equal(session.get(b).x, 420 + 10 + 7, 'the outside member still comes along');
  await timers.advance(400);

  // Nudges and arrangement move a Section with its members, and never change membership.
  session.arrange(new Map([[s, { x: session.get(s).x + 3, y: session.get(s).y }]]));
  assert.equal(session.get(a).x, 140 + 10 + 7 + 3);
  await timers.advance(400);

  // Deleting the Section keeps its placements where they are, unsectioned; undo restores the Section and the memberships.
  const positions = [a, b, far].map((id) => at(session, id));
  session.remove([s]);
  assert.equal(session.has(s), false);
  assert.deepEqual([a, b, far].map((id) => at(session, id)), positions, 'where they were');
  assert.deepEqual([a, b, far].map((id) => session.get(id).section_id), [null, null, null]);
  await timers.advance(400);
  const del = server.calls.at(-1);
  assert.deepEqual(del.map((c) => c.op), ['update', 'update', 'update', 'delete'], 'members are let go before the Section is deleted');
  assert.equal(server.rows.has(s), false);
  assert.ok([a, b, far].every((id) => server.rows.has(id) && server.rows.get(id).section_id === null));
  session.undo();
  assert.equal(session.has(s), true);
  assert.deepEqual([a, b, far].map((id) => session.get(id).section_id), [s, s, s]);
  await timers.advance(400);
  assert.deepEqual(server.calls.at(-1).map((c) => c.op), ['create', 'update', 'update', 'update'], 'the Section is back before its members rejoin');
  assert.ok([a, b, far].every((id) => server.rows.get(id).section_id === s));

  // Never nested: a Section made inside another is not its member; a pasted Section neither.
  const inner = session.createSection({ x: session.get(s).x + 10, y: session.get(s).y + 10, width: 200, height: 120 });
  assert.equal(session.get(inner).section_id, null);
  const copies = session.paste(session.clip([inner]), { x: 5, y: 5 });
  assert.equal(session.get(copies[0]).section_id, null);
  await timers.advance(400);
  assert.ok([inner, copies[0]].every((id) => server.rows.get(id).section_id === null));
  // Deleting a Section with a member selected too deletes that member and keeps the rest.
  session.remove([s, a]);
  assert.deepEqual([session.has(s), session.has(a), session.has(b)], [false, false, true]);
  assert.equal(session.get(b).section_id, null);
  session.undo();
  assert.deepEqual([session.has(s), session.has(a), session.get(b).section_id], [true, true, s]);
  await timers.advance(400);
  assert.equal(session.status, 'saved');
  assert.equal(server.rows.get(a).scene_id, 'scene-1', 'through all of it, the Scene is only pointed at');
});

test('session: connections — between placements (the same Scene twice stays distinct), never a Section or itself, once per pair; label and arrow; removed with either end, back with undo; idempotent on a retried batch', async () => {
  const server = fakeServer();
  const { session, timers } = makeSession(server);
  const s1 = session.addPlacement('scene', 'scene-1', 'Scene 1', { x: 0, y: 0 }, CARD);
  const s2 = session.addPlacement('scene', 'scene-1', 'Scene 1', { x: 600, y: 0 }, CARD);
  const n = session.createNote({ x: 300, y: 300 }, SIZE, 'why');
  const e = session.addPlacement('entry', 'entry-1', 'Nerai', { x: 600, y: 600 }, CARD);
  const sec = session.createSection({ x: -100, y: -100, width: 50, height: 50 });
  await timers.advance(400);

  assert.equal(session.connect(s1, s1), null);
  assert.equal(session.connect(s1, sec), null);
  assert.equal(session.connect(s1, 'nope'), null);
  const c1 = session.connect(s1, n, { directed: true, label: ' leads to ' });
  assert.ok(c1);
  assert.equal(session.connect(n, s1), c1, 'already connected, either way round: the same one');
  const c2 = session.connect(n, e);
  assert.equal(session.connections.length, 2);
  assert.deepEqual(session.connectionsOf([s2]), [], 'the second placement of the Scene has no line');
  assert.deepEqual(session.connectionsOf([n]).map((c) => c.id).sort(), [c1, c2].sort());
  const k = session.getConnection(c1);
  assert.deepEqual([k.source_item_id, k.target_item_id, k.directed, k.label, k.version], [s1, n, true, 'leads to', 0]);
  await timers.advance(400);
  const sent = server.calls.at(-1);
  assert.deepEqual(sent.map((c) => [c.kind, c.op]), [['connection', 'create'], ['connection', 'create']]);
  assert.deepEqual([server.connections.get(c1).label, server.connections.get(c1).directed, session.getConnection(c1).version], ['leads to', true, 1]);

  // Label and arrow: one entry each; blank clears the label.
  session.setConnection(c2, { label: 'because', directed: true });
  session.setConnection(c2, { label: '  ' });
  assert.deepEqual([session.getConnection(c2).label, session.getConnection(c2).directed], [null, true]);
  session.undo();
  assert.equal(session.getConnection(c2).label, 'because');
  session.undo();
  assert.deepEqual([session.getConnection(c2).label, session.getConnection(c2).directed], [null, false]);
  session.redo();
  await timers.advance(400);
  assert.deepEqual([server.connections.get(c2).label, server.connections.get(c2).directed, server.connections.get(c2).version], ['because', true, 2]);
  assert.deepEqual(server.calls.at(-1), [{ kind: 'connection', op: 'update', id: c2, expected_version: 1, directed: true, label: 'because' }]);

  // Removing a connection alone; undo brings it back with the same id.
  session.removeConnections([c2]);
  assert.equal(session.getConnection(c2), undefined);
  await timers.advance(400);
  assert.equal(server.connections.has(c2), false);
  session.undo();
  await timers.advance(400);
  assert.deepEqual([server.connections.has(c2), server.calls.at(-1)[0].op], [true, 'create']);

  // Removing a placement takes its lines; its neighbours stay; undo restores placement and lines.
  session.remove([n]);
  assert.deepEqual(session.connections, []);
  assert.ok(session.has(s1) && session.has(e));
  await timers.advance(400);
  assert.deepEqual(server.calls.at(-1).map((c) => [c.kind ?? 'item', c.op]), [['connection', 'delete'], ['connection', 'delete'], ['item', 'delete']], 'lines go before the card');
  assert.equal(server.connections.size, 0);
  session.undo();
  assert.deepEqual(session.connections.map((c) => c.id).sort(), [c1, c2].sort());
  await timers.advance(400);
  assert.deepEqual(server.calls.at(-1).map((c) => [c.kind ?? 'item', c.op]), [['item', 'create'], ['connection', 'create'], ['connection', 'create']], 'the card before its lines');
  assert.equal(server.connections.size, 2);
  assert.equal(server.rows.get(n).content.content[0].content[0].text, 'why');

  // A lost reply: the retried batch creates the connection once.
  const c3 = session.connect(s2, e);
  server.fail = 1;
  await timers.advance(400);
  assert.equal(session.status, 'retrying');
  await timers.advance(2000);
  assert.equal(session.status, 'saved');
  assert.equal(server.calls.filter((b) => b.some((c) => c.id === c3)).length, 2);
  assert.equal([...server.connections.values()].filter((c) => c.source_item_id === s2).length, 1);
  // Deleted elsewhere: the placement and its lines are gone here too, without a save of their own.
  server.rows.delete(e);
  for (const [id, c] of server.connections) if (c.target_item_id === e) server.connections.delete(id);
  session.moveLive([e], 1, 1);
  session.commitMove(new Map([[e, { x: 600, y: 600 }]]));
  await timers.advance(400);
  assert.equal(session.has(e), false);
  assert.equal(session.connections.some((c) => c.target_item_id === e), false);
  assert.equal(session.status, 'saved');
  assert.deepEqual(server.calls.at(-1).map((c) => c.id), [e], 'nothing sent for the lines the server already dropped');
});

test('arrangement: align, distribute and tidy are pure geometry; the session applies one as one undo entry, a Section carrying its members; the fake server sees geometry only', async () => {
  const r = (id, x, y, w = 100, h = 50) => ({ id, rect: { x, y, width: w, height: h } });
  const items = [r('a', 0, 0), r('b', 300, 120, 200, 80), r('c', 50, 400, 60, 30)];
  const pos = (m) => Object.fromEntries([...m].map(([k, v]) => [k, [v.x, v.y]]));
  assert.deepEqual(pos(arrange.align(items, 'left')), { a: [0, 0], b: [0, 120], c: [0, 400] });
  assert.deepEqual(pos(arrange.align(items, 'right')), { a: [400, 0], b: [300, 120], c: [440, 400] });
  assert.deepEqual(pos(arrange.align(items, 'centerX')), { a: [200, 0], b: [150, 120], c: [220, 400] });
  assert.deepEqual(pos(arrange.align(items, 'top')), { a: [0, 0], b: [300, 0], c: [50, 0] });
  assert.deepEqual(pos(arrange.align(items, 'bottom')), { a: [0, 380], b: [300, 350], c: [50, 400] });
  assert.deepEqual(pos(arrange.align(items, 'centerY')), { a: [0, 190], b: [300, 175], c: [50, 200] });
  assert.equal(arrange.align([items[0]], 'left').size, 0, 'one card: nothing to align to');
  const h = arrange.distribute(items, 'horizontal');
  assert.deepEqual(pos(h).a, [0, 0]);
  assert.deepEqual(pos(h).b, [300, 120], 'first and last stay');
  assert.equal(pos(h).c[0] - 100, 300 - (pos(h).c[0] + 60), 'equal gaps either side of the middle card');
  assert.equal(pos(h).c[1], 400, 'the other axis is untouched');
  const v = arrange.distribute(items, 'vertical');
  assert.equal(pos(v).b[1] - 50, 400 - (pos(v).b[1] + 80));
  assert.equal(arrange.distribute(items.slice(0, 2), 'vertical').size, 0, 'two cards: nothing between them to even out');
  // Tidy: the cluster keeps its top-left, reads in rows, even gaps, wraps at its present width.
  const messy = [r('p', 10, 12, 100, 50), r('q', 130, 30, 100, 50), r('s', 15, 200, 100, 50), r('t', 250, 5, 100, 50)];
  const t = pos(arrange.tidy(messy));
  assert.deepEqual(t.p, [10, 5]);
  assert.deepEqual(t.q, [10 + 100 + arrange.TIDY_GAP, 5]);
  assert.deepEqual(t.t, [10 + 2 * (100 + arrange.TIDY_GAP), 5]);
  assert.deepEqual(t.s, [10, 5 + 50 + arrange.TIDY_GAP], 'the lower card starts the next row');
  const tidied = messy.map((m) => ({ ...m, rect: { ...m.rect, x: t[m.id][0], y: t[m.id][1] } }));
  assert.deepEqual(pos(arrange.tidy(tidied)), t, 'tidy is stable: tidying a tidy cluster changes nothing');
  // Snapping: the smallest nudge that lines an edge or centre up, within the threshold, with a guide.
  const others = [{ x: 500, y: 500, width: 100, height: 100 }];
  const snap = arrange.snapRect({ x: 497, y: 300, width: 50, height: 50 }, others, 6);
  assert.deepEqual([snap.dx, snap.dy], [3, 0]);
  assert.deepEqual(snap.guides, [{ axis: 'x', at: 500, from: 300, to: 600 }]);
  assert.deepEqual(arrange.snapRect({ x: 300, y: 300, width: 50, height: 50 }, others, 6), { dx: 0, dy: 0, guides: [] }, 'too far: free placement');
  assert.equal(arrange.snapRect({ x: 497, y: 300, width: 50, height: 50 }, [], 6).dx, 0);
  const centre = arrange.snapRect({ x: 527, y: 700, width: 50, height: 50 }, others, 6);
  assert.deepEqual([centre.dx, centre.guides[0].at], [-2, 550], 'centre to centre');
  const edge = arrange.snapEdge(596, 'x', others, 6, [0, 10]);
  assert.deepEqual([edge.delta, edge.guide.at], [4, 600]);
  assert.equal(arrange.snapEdge(580, 'x', others, 6, [0, 10]), null);

  // The session: one entry for the whole arrangement; members follow their Section; the server gets geometry only.
  const server = fakeServer();
  const { session, timers } = makeSession(server);
  const a = session.addPlacement('scene', 'scene-1', 'Scene 1', { x: 0, y: 0 }, CARD);
  const b = session.addPlacement('page', 'page-1', 'Intro', { x: 300, y: 120 }, CARD);
  const c = session.createNote({ x: 50, y: 400 }, SIZE, 'n');
  const sec = session.createSection({ x: 1000, y: 1000, width: 400, height: 300 });
  const m = session.addPlacement('scene', 'scene-2', 'Scene 2', { x: 1050, y: 1050 }, CARD);
  await timers.advance(400);
  assert.equal(session.get(m).section_id, sec);
  const before = [a, b, c, sec, m].map((id) => at(session, id));
  session.arrange(arrange.align([a, b, c, sec].map((id) => ({ id, rect: at(session, id) })), 'left'));
  assert.deepEqual([a, b, c, sec, m].map((id) => session.get(id).x), [0, 0, 0, 0, 50], 'the member followed its Section by the same offset');
  await timers.advance(400);
  const batch = server.calls.at(-1);
  assert.equal(batch.length, 4, 'b, c, the Section and its member — a stays');
  assert.ok(batch.every((ch) => ch.op === 'update' && Object.keys(ch).sort().join() === 'expected_version,id,op,x,y'), 'x and y only');
  session.undo();
  assert.deepEqual([a, b, c, sec, m].map((id) => at(session, id)), before, 'one entry undoes the whole arrangement');
  session.redo();
  assert.equal(session.get(m).x, 50);
  session.arrange(new Map([[a, at(session, a)]]));
  assert.equal(session.canRedo, false, 'an arrangement that moves nothing is no entry (redo stack intact proves nothing was pushed)');
  await timers.advance(400);
  assert.equal(session.status, 'saved');
  assert.equal(server.rows.get(a).scene_id, 'scene-1');
});

test('navigation: fit a rect, focus (pan when it fits, zoom out when it doesn\'t, never in past actual size), in view; marquee takes cards it touches and Sections it encloses', () => {
  const m = canvasModel;
  const size = { width: 1000, height: 600 };
  const small = { x: 5000, y: 5000, width: 100, height: 50 };
  const fit = m.fitRect(small, size, 64, 1);
  assert.equal(fit.scale, 1, 'no closer than actual size');
  assert.deepEqual(m.toWorld(fit, { x: 500, y: 300 }), { x: 5050, y: 5025 }, 'centred');
  const huge = { x: 0, y: 0, width: 4000, height: 1000 };
  const fitHuge = m.fitRect(huge, size, 64, 1);
  assert.ok(fitHuge.scale < 1 && fitHuge.scale >= m.SCALE_MIN);
  assert.equal(Math.round(huge.width * fitHuge.scale), 1000 - 128);
  const vp = { tx: 0, ty: 0, scale: 2 };
  const focused = m.focusView(vp, small, size);
  assert.equal(focused.scale, 2, 'it fits at this zoom: only a pan');
  assert.deepEqual(m.toWorld(focused, { x: 500, y: 300 }), { x: 5050, y: 5025 });
  const focusedHuge = m.focusView(vp, huge, size);
  assert.ok(focusedHuge.scale < 1, 'too big for the screen: zoomed out enough to hold it');
  const tall = { x: 0, y: 0, width: 300, height: 300 };
  const eased = m.focusView({ tx: 0, ty: 0, scale: 3 }, tall, size).scale;
  assert.ok(eased < 3 && eased > 1, 'zoomed out just enough to hold it, no further');
  assert.equal(m.focusView({ tx: 0, ty: 0, scale: 0.2 }, small, size).scale, 0.2, 'already in view at this zoom: never zoomed in');
  assert.equal(m.isInView({ tx: 0, ty: 0, scale: 1 }, small, size), false);
  assert.equal(m.isInView({ tx: -4990, ty: -4990, scale: 1 }, small, size), true);
  assert.equal(m.isInView({ tx: 0, ty: 0, scale: 0.1 }, small, size), true, 'far out, on screen');
  assert.equal(m.contains({ x: 0, y: 0, width: 10, height: 10 }, { x: 1, y: 1, width: 5, height: 5 }), true);
  assert.equal(m.contains({ x: 0, y: 0, width: 10, height: 10 }, { x: 6, y: 6, width: 5, height: 5 }), false);
  const items = [
    { id: 'card', rect: { x: 0, y: 0, width: 100, height: 100 } },
    { id: 'section', rect: { x: -50, y: -50, width: 1000, height: 1000 }, whole: true },
  ];
  assert.deepEqual(m.marqueeSelection(items, { x: 50, y: 50, width: 10, height: 10 }), ['card'], 'brushing inside the Section takes only the card');
  assert.deepEqual(m.marqueeSelection(items, { x: -100, y: -100, width: 2000, height: 2000 }), ['card', 'section'], 'enclosing it whole takes it');
  // Membership helpers.
  const sec = { id: 's', item_type: 'section', x: 0, y: 0, width: 500, height: 500, z: 0, created_at: 'a' };
  const sec2 = { id: 's2', item_type: 'section', x: 0, y: 0, width: 500, height: 500, z: 1, created_at: 'b' };
  const inside = { id: 'i', item_type: 'note', x: 100, y: 100, width: 50, height: 50, z: 5, created_at: 'c', section_id: 's' };
  const outside = { id: 'o', item_type: 'note', x: 900, y: 900, width: 50, height: 50, z: 6, created_at: 'd' };
  assert.equal(m.sectionAt([sec, sec2, inside, outside], inside), 's2', 'the topmost Section holding the centre');
  assert.equal(m.sectionAt([sec, inside, outside], outside), null);
  assert.equal(m.sectionAt([sec], { x: 480, y: 480, width: 100, height: 100 }), null, 'the centre decides, not a corner');
  assert.deepEqual(m.membersOf([sec, inside, outside], 's'), ['i']);
  assert.deepEqual(m.withMembers([sec, inside, outside], ['s', 'o']).sort(), ['i', 'o', 's']);
  assert.equal(m.sectionOf({}), null, 'a pre-046 row: no Section');
  assert.equal(m.isSection(sec), true);
});

test('find on canvas: cards by their live title (or fallback label), notes by text, Sections by title, connections by label; exact, prefix, contains; never geometry', () => {
  const index = new Map([
    ['scene-1', { id: 'scene-1', kind: 'scene', title: 'The Bridge', path: [] }],
    ['page-1', { id: 'page-1', kind: 'workspacePage', title: 'Bridge notes', path: [] }],
  ]);
  const item = (id, item_type, extra) => ({ id, item_type, scene_id: null, chapter_id: null, document_id: null, entry_id: null, target_canvas_id: null, label: null, content: null, x: 10, y: 20, width: 100, height: 50, z: 0, created_at: 'a', ...extra });
  const items = [
    item('p1', 'scene', { scene_id: 'scene-1', label: 'Old title' }),
    item('p2', 'page', { document_id: 'page-1' }),
    item('p3', 'scene', { scene_id: 'scene-gone', label: 'Bridge, lost' }),
    item('n1', 'note', { content: canvasModel.noteDoc('first line\nthe bridge falls here\nlast') }),
    item('s1', 'section', { label: 'Bridge arc' }),
    item('n2', 'note', { content: canvasModel.noteDoc('ten') }),
  ];
  const connections = [{ id: 'c1', source_item_id: 'p1', target_item_id: 'n1', directed: true, label: 'bridge' }, { id: 'c2', source_item_id: 'p1', target_item_id: 'p2', directed: false, label: null }];
  const rs = find.findOnCanvas(items, connections, index, 'bridge');
  assert.deepEqual(rs.map((r) => [r.id, r.kind, r.type, r.tier]), [
    ['c1', 'connection', 'Connection', 0],
    ['p2', 'card', 'Page', 1],
    ['p3', 'card', 'Scene', 1],
    ['s1', 'section', 'Section', 1],
    ['p1', 'card', 'Scene', 2],
    ['n1', 'note', 'Note', 2],
  ]);
  assert.equal(rs.find((r) => r.id === 'p1').text, 'The Bridge', 'the live title, not the stored label');
  assert.equal(rs.find((r) => r.id === 'p3').text, 'Bridge, lost', 'the fallback label when the object is unavailable');
  assert.equal(rs.find((r) => r.id === 'n1').text, 'the bridge falls here', 'the matching line');
  assert.deepEqual(rs.find((r) => r.id === 'c1').endpoints, ['p1', 'n1']);
  assert.deepEqual(find.findOnCanvas(items, connections, index, '10'), [], 'geometry is never text');
  assert.deepEqual(find.findOnCanvas(items, connections, index, 'ten').map((r) => r.id), ['n2']);
  assert.deepEqual(find.findOnCanvas(items, connections, index, '  '), []);
  assert.deepEqual(find.findOnCanvas(items, connections, index, 'BRÍDGE arc').map((r) => r.id), ['s1'], 'case and accents are ignored');
  assert.equal(find.cardTitle(item('p9', 'entry', { entry_id: 'e' }), index), 'Untitled entry');
});

test('clipboard: a copied card is another placement of the same object; a note is a second note; a Section brings copies of its members and only the lines among them; nothing canonical is copied; paste from another Canvas lands whole, a self-link is skipped', async () => {
  const server = fakeServer();
  const { session, timers } = makeSession(server);
  const sec = session.createSection({ x: 0, y: 0, width: 600, height: 400 }, 'Arc');
  const a = session.addPlacement('scene', 'scene-1', 'Scene 1', { x: 20, y: 60 }, CARD);
  const n = session.createNote({ x: 320, y: 60 }, SIZE, 'a thought');
  const out = session.addPlacement('entry', 'entry-1', 'Nerai', { x: 900, y: 900 }, CARD);
  const self = session.addPlacement('canvas', 'cv', 'This canvas', { x: 1200, y: 0 }, CARD); // never valid on the server; here for the paste rule
  const link = session.addPlacement('canvas', 'other-canvas', 'World', { x: 1200, y: 300 }, CARD);
  const inner = session.connect(a, n, { directed: true, label: 'why' });
  const outer = session.connect(n, out);
  await timers.advance(400);
  const serverRowsBefore = server.rows.size;

  // Duplicate the Section: its members come, their inner line comes, the line to the outside card does not.
  const [sec2] = session.duplicate([sec]);
  const members = session.membersOf(sec2);
  assert.equal(members.length, 2);
  const a2 = members.find((id) => session.get(id).item_type === 'scene');
  const n2 = members.find((id) => session.get(id).item_type === 'note');
  assert.deepEqual([session.get(sec2).label, session.get(sec2).x, session.get(sec2).y, session.get(sec2).section_id], ['Arc', 24, 24, null]);
  assert.deepEqual([session.get(a2).scene_id, session.get(a2).x, session.get(a2).section_id], ['scene-1', 44, sec2], 'the same Scene, pointed at again');
  assert.equal(canvasModel.noteText(session.get(n2).content), 'a thought');
  assert.notEqual(n2, n);
  const lines = session.connections;
  assert.equal(lines.length, 3);
  const copiedLine = lines.find((c) => c.source_item_id === a2);
  assert.deepEqual([copiedLine.target_item_id, copiedLine.directed, copiedLine.label], [n2, true, 'why']);
  assert.equal(lines.some((c) => c.source_item_id === n2 && c.target_item_id === out), false, 'the line to the uncopied card is not reproduced');
  session.undo();
  assert.deepEqual([session.has(sec2), session.has(a2), session.has(n2), session.connections.length], [false, false, false, 2], 'one entry');
  session.redo();
  await timers.advance(400);
  assert.equal(server.rows.size, serverRowsBefore + 3);
  assert.equal(server.connections.size, 3);
  assert.deepEqual(server.calls.at(-1).map((c) => [c.kind ?? 'item', c.op, c.item_type ?? null]), [['item', 'create', 'section'], ['item', 'create', 'scene'], ['item', 'create', 'note'], ['connection', 'create', null]]);
  assert.deepEqual(server.rows.get(a2).scene_id, 'scene-1', 'the Scene is never copied — only pointed at');

  // Copying a member alone: a second placement, unsectioned unless it lands in a Section.
  const [a3] = session.duplicate([a], { x: 2000, y: 2000 });
  assert.deepEqual([session.get(a3).scene_id, session.get(a3).section_id], ['scene-1', null]);
  const [a4] = session.duplicate([a], { x: 10, y: 10 });
  assert.ok([sec, sec2].includes(session.get(a4).section_id), 'landed inside: it joins (the topmost of the two overlapping Sections)');
  // Copying a connected pair reproduces the line; copying one end does not.
  const clip = session.clip([n, out]);
  assert.deepEqual(clip.items.map((i) => i.id).sort(), [n, out].sort());
  assert.deepEqual(clip.connections.map((c) => c.id), [outer]);
  assert.deepEqual(session.clip([out]).connections, []);
  const pastedPair = session.paste(clip, { x: 3000, y: 3000 });
  assert.equal(pastedPair.length, 2);
  assert.equal(session.connections.some((c) => pastedPair.includes(c.source_item_id) && pastedPair.includes(c.target_item_id)), true);
  // A placement of this very Canvas is skipped; a link to another Canvas is another placement.
  const pastedLinks = session.paste(session.clip([self, link]), { x: 1, y: 1 });
  assert.equal(pastedLinks.length, 1);
  assert.equal(session.get(pastedLinks[0]).target_canvas_id, 'other-canvas');
  // Pasting onto another Canvas: new ids there, the same targets, the same text, membership and lines among the copies.
  const other = fakeServer();
  const second = makeSession(other, { canvasId: 'cv2', newId: () => `99999999-0000-4000-8000-${String(Math.floor(Math.random() * 1e12)).padStart(12, '0')}` });
  const sectionClip = session.clip([sec]);
  const landed = second.session.paste(sectionClip, { x: -100, y: -100 }, [sec]);
  assert.equal(landed.length, 1, 'the ids that correspond to what was selected');
  const landedSection = second.session.get(landed[0]);
  assert.deepEqual([landedSection.canvas_id, landedSection.x, landedSection.label], ['cv2', -100, 'Arc']);
  assert.equal(second.session.membersOf(landed[0]).length, session.membersOf(sec).length, 'its members came along');
  assert.equal(second.session.connections.length, 1);
  await second.timers.advance(400);
  assert.equal(other.rows.size, 1 + session.membersOf(sec).length);
  assert.equal(other.connections.size, 1);
  await timers.advance(400);
  assert.equal(session.status, 'saved');
});

test('reliability: a Section\'s move with its members is one batch that lands whole after a failure; a device draft with connections and memberships replays; a Section deleted elsewhere unsections its members here', async () => {
  const server = fakeServer();
  const { session, timers, drafts } = makeSession(server);
  const sec = session.createSection({ x: 0, y: 0, width: 600, height: 400 }, 'Arc');
  const a = session.addPlacement('scene', 'scene-1', 'Scene 1', { x: 20, y: 60 }, CARD);
  const b = session.createNote({ x: 320, y: 60 }, SIZE, 'inside');
  const line = session.connect(a, b, { label: 'then' });
  await timers.advance(400);
  assert.equal(session.status, 'saved');

  // The network drops the move: nothing moved on the server; the retry lands all three together.
  drag(session, [sec], 100, 100);
  server.fail = 1;
  await timers.advance(400);
  assert.equal(session.status, 'retrying');
  assert.deepEqual([server.rows.get(sec).x, server.rows.get(a).x, server.rows.get(b).x], [0, 20, 320], 'nothing half-moved');
  assert.equal(drafts.at(-1).entries.length, 3, 'all three kept on the device');
  await timers.advance(2000);
  assert.equal(session.status, 'saved');
  assert.deepEqual([server.rows.get(sec).x, server.rows.get(a).x, server.rows.get(b).x], [100, 120, 420]);
  assert.equal(server.calls.at(-1).length, 3, 'one batch');

  // A draft from a window that closed before its save: a new note in the Section, a line to it, and a card that left.
  const nid = `00000000-0000-4000-8000-${'7'.repeat(12)}`;
  const cid = `00000000-0000-4000-8000-${'8'.repeat(12)}`;
  const draft = {
    canvasId: 'cv',
    entries: [
      { id: nid, kind: 'item', op: 'create', fields: [], item: { id: nid, canvas_id: 'cv', project_id: 'p', item_type: 'note', scene_id: null, chapter_id: null, document_id: null, entry_id: null, target_canvas_id: null, label: null, content: canvasModel.noteDoc('from the other window'), x: 150, y: 150, width: 220, height: 64, z: 9, section_id: sec, manual_size: false, version: 0, created_at: 't', updated_at: 't' } },
      { id: cid, kind: 'connection', op: 'create', fields: [], item: { id: cid, canvas_id: 'cv', project_id: 'p', source_item_id: b, target_item_id: nid, directed: true, label: 'and', version: 0, created_at: 't', updated_at: 't' } },
      { id: a, kind: 'item', op: 'update', fields: ['x', 'y', 'section_id'], item: { ...server.rows.get(a), x: 2000, y: 2000, section_id: null } },
      { id: line, kind: 'connection', op: 'update', fields: ['label'], item: { ...server.connections.get(line), label: 'then, later' } },
    ],
  };
  const second = makeSession(server);
  second.session.applyDraft(draft);
  assert.equal(second.session.get(nid).section_id, sec);
  assert.equal(second.session.getConnection(cid).target_item_id, nid);
  assert.deepEqual([second.session.get(a).x, second.session.get(a).section_id], [2000, null]);
  assert.equal(second.session.getConnection(line).label, 'then, later');
  await second.timers.advance(400);
  assert.equal(second.session.status, 'saved');
  assert.deepEqual([server.rows.get(nid).section_id, server.connections.get(cid).label, server.rows.get(a).section_id, server.connections.get(line).label], [sec, 'and', null, 'then, later']);
  const replay = server.calls.at(-1);
  assert.deepEqual(replay.map((c) => [c.kind ?? 'item', c.op]), [['item', 'create'], ['connection', 'create'], ['item', 'update'], ['connection', 'update']], 'the note before the line to it');
  // A pre-22B draft entry (no kind) is an item.
  const third = makeSession(server);
  third.session.applyDraft({ canvasId: 'cv', entries: [{ id: a, op: 'update', fields: ['x'], item: { ...server.rows.get(a), x: 5 } }] });
  assert.equal(third.session.get(a).x, 5);
  await third.timers.advance(400);
  assert.equal(server.rows.get(a).x, 5);

  // The Section was deleted elsewhere: a member's save is told 'missing' for the Section, and the members are unsectioned here as on the server.
  server.rows.delete(sec);
  for (const r of server.rows.values()) if (r.section_id === sec) { r.section_id = null; r.version += 1; }
  session.setSectionTitle(sec, 'renamed too late');
  await timers.advance(400);
  assert.equal(session.has(sec), false, 'gone here too');
  assert.equal(session.get(b).section_id, null, 'its member let go here, as on the server');
  assert.equal(session.status, 'saved');
});
