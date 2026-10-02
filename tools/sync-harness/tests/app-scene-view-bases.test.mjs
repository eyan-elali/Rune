// Scene Views owned per Base (Rune 2.0, Milestone 21F, migration 044): the
// REAL Scene View actions against the Rune 2.0 schema in real Postgres + RLS,
// with the real structure actions.
//
//   * the Manuscript's Base and each Group's Base keep their own saved Views:
//     created at the end of their own Base, ordered within it, deleted with
//     the gap closed within it; none shows in another Base's list
//   * the four-argument create (a stale client) still makes a Manuscript View
//   * a Group of another Manuscript, or another writer's, is "not found"
//   * a View never moves to another Base
//   * moving a Group keeps its Views; moving a Chapter changes only what a
//     scope holds, never a View's owner; deleting a Group takes exactly its
//     own Views and nothing else
//   * every Base's View is checked against the Manuscript's fields and pruned
//     with them (the property triggers reach every Base)
//   * the backup read returns group_id; no Scene row is written by any of it
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, readRepoFile, asUser, LEGACY_BASELINE, RUNE2_SCHEMA } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';
import { prototypeLegacyToRune2 } from '../lib/legacy-to-rune2.mjs';
import { USERS, chapterId, projectId, seedFixture } from '../fixtures/manuscript-fixture.mjs';

const ALICE = USERS.alice.id;
const BRAM = USERS.bram.id;
const HOLLOW = projectId('hollow');
const TIDE = projectId('tide');
const CH = (n) => chapterId(`hollow.ch${n}`);

const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const all = async (db, sql, params = []) => (await db.query(sql, params)).rows;

let legacy;
let sceneProps, views, structure, workspace, manuscriptLoader, backup, viewModel, sceneModel, nav;
before(async () => {
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
  sceneProps = await bundleForTest('src/lib/actions/sceneProperties.ts', { name: 'svb_props' });
  views = await bundleForTest('src/lib/actions/sceneViews.ts', { name: 'svb_views' });
  structure = await bundleForTest('src/lib/actions/structure.ts', { name: 'svb_structure' });
  workspace = await bundleForTest('src/lib/rune2/projectWorkspace.ts', { name: 'svb_loader' });
  manuscriptLoader = await bundleForTest('src/lib/rune2/projectManuscript.ts', { name: 'svb_manuscript' });
  backup = await bundleForTest('src/lib/backup/projectBackup.ts', { name: 'svb_backup' });
  viewModel = await bundleForTest('src/lib/rune2/collectionViews.ts', { name: 'svb_view_model' });
  sceneModel = await bundleForTest('src/lib/rune2/sceneViews.ts', { name: 'svb_scene_model' });
  nav = await bundleForTest('src/lib/rune2/navigatorModel.ts', { name: 'svb_nav' });
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
  for (const mod of [sceneProps, views, structure, workspace, manuscriptLoader]) mod.setServerClient?.(sb);
  return sb;
}

const ok = (r) => { assert.equal(r.error, null, r.error); return r.data; };
const refused = (r, message) => { assert.equal(r.data, null); assert.equal(r.error, message); };

const manuscriptId = async (db) => (await one(db, `select id from public.manuscripts where project_id = $1`, [HOLLOW])).id;
const sceneRows = (db) => all(db, `select s.* from public.scenes s join public.manuscripts m on m.id = s.manuscript_id where m.project_id = $1 order by s.id`, [HOLLOW]);
/** Every Scene View of hollow: [name, group_id, position] in Base then position order. */
const rows = (db) => all(db, `select v.name, v.group_id, v.position from public.scene_views v join public.manuscripts m on m.id = v.manuscript_id
  where m.project_id = $1 order by v.group_id nulls first, v.position`, [HOLLOW]);

async function shellIndex() {
  const [m, w] = [await manuscriptLoader.loadProjectManuscript(HOLLOW), await workspace.loadProjectWorkspace(HOLLOW)];
  return new Map([...nav.indexManuscript(m), ...nav.indexWorkspace(w.tree, {}, w.entries)]);
}

/** Part 1 [ ch1, ch2 ], Part 2 [ Act A [ ch3 ], ch4 ]; ch5, ch6 top level. */
async function parts(db) {
  const part1 = ok(await structure.createGroup(HOLLOW, 'Part 1'));
  const part2 = ok(await structure.createGroup(HOLLOW, 'Part 2'));
  const actA = ok(await structure.createGroup(HOLLOW, 'Act A', part2.id));
  ok({ error: (await structure.moveChapter(CH(1), part1.id, null, HOLLOW)).error });
  ok({ error: (await structure.moveChapter(CH(2), part1.id, null, HOLLOW)).error });
  ok({ error: (await structure.moveChapter(CH(3), actA.id, null, HOLLOW)).error });
  ok({ error: (await structure.moveChapter(CH(4), part2.id, null, HOLLOW)).error });
  void db;
  return { part1, part2, actA };
}

test('each Base owns its Views: created at the end of its own, listed apart, ordered and deleted within it; the Manuscript keeps its own', async () => {
  const db = await seededDb();
  const mid = await manuscriptId(db);
  const scenesBefore = await sceneRows(db);
  const { part1, part2, actA } = await parts(db);

  // The Manuscript's — the four-argument call of before, and the explicit null.
  const mList = ok(await views.createSceneView(HOLLOW, 'List', 'list'));
  const mArc = ok(await views.createSceneView(HOLLOW, 'By Arc', 'board', null, null));
  const mTl = ok(await views.createSceneView(HOLLOW, null, 'timeline'));
  assert.deepEqual([mList.group_id, mArc.group_id, mTl.group_id], [null, null, null]);
  assert.deepEqual([mList.position, mArc.position, mTl.position], [1, 2, 3]);
  // Part 1's, Part 2's and the nested Act A's: each from position 1.
  const p1List = ok(await views.createSceneView(HOLLOW, null, 'list', null, part1.id));
  const p1Pov = ok(await views.createSceneView(HOLLOW, 'By POV', 'board', null, part1.id));
  const p2List = ok(await views.createSceneView(HOLLOW, 'List', 'list', null, part2.id));
  const p2Rev = ok(await views.createSceneView(HOLLOW, 'Revision Status', 'table', null, part2.id));
  const p2Tl = ok(await views.createSceneView(HOLLOW, 'Timeline', 'timeline', null, part2.id));
  const aList = ok(await views.createSceneView(HOLLOW, null, 'list', null, actA.id));
  assert.deepEqual([p1List.group_id, p1List.position, p1List.name, p1List.manuscript_id], [part1.id, 1, 'List', mid]);
  assert.deepEqual([p1Pov.position, p2List.position, p2Rev.position, p2Tl.position, aList.position], [2, 1, 2, 3, 1]);
  assert.deepEqual(p2Tl.config.axis, 'manuscript', 'a Group Timeline runs along the manuscript too');

  // Loaded through the one store, each Base's tabs are its own.
  const loaded = await workspace.loadProjectWorkspace(HOLLOW);
  const tabs = (owner) => viewModel.viewsOf(loaded.sceneViews, owner).map((v) => v.name);
  assert.deepEqual(tabs(mid), ['List', 'By Arc', 'Timeline']);
  assert.deepEqual(tabs(part1.id), ['List', 'By POV']);
  assert.deepEqual(tabs(part2.id), ['List', 'Revision Status', 'Timeline']);
  assert.deepEqual(tabs(actA.id), ['List']);
  assert.equal(loaded.sceneViews.length, 9);
  for (const v of loaded.sceneViews) assert.deepEqual(sceneModel.viewScope(v), v.group_id ? { kind: 'group', groupId: v.group_id } : { kind: 'manuscript' });

  // Reordering stays within the Base: Part 2's Timeline first leaves the Manuscript's and Part 1's untouched.
  ok(await views.moveSceneView(p2Tl.id, 0));
  assert.deepEqual(await rows(db), [
    ['List', null, 1], ['By Arc', null, 2], ['Timeline', null, 3],
    ['List', part1.id, 1], ['By POV', part1.id, 2],
    ['Timeline', part2.id, 1], ['List', part2.id, 2], ['Revision Status', part2.id, 3],
    ['List', actA.id, 1],
  ].map(([name, group_id, position]) => ({ name, group_id, position })).sort(byBase));
  // An index past the end clamps within the Base.
  ok(await views.moveSceneView(p2Tl.id, 99));
  assert.deepEqual((await rows(db)).filter((r) => r.group_id === part2.id).map((r) => [r.name, r.position]), [['List', 1], ['Revision Status', 2], ['Timeline', 3]]);

  // Deleting closes the gap within the Base only.
  ok(await views.deleteSceneView(p2List.id));
  assert.deepEqual((await rows(db)).filter((r) => r.group_id === part2.id).map((r) => [r.name, r.position]), [['Revision Status', 1], ['Timeline', 2]]);
  assert.deepEqual((await rows(db)).filter((r) => r.group_id === null).map((r) => r.position), [1, 2, 3]);
  assert.deepEqual((await rows(db)).filter((r) => r.group_id === part1.id).map((r) => r.position), [1, 2]);

  // Renaming, retyping and reconfiguring a Group's View works as the Manuscript's; a View never changes Base.
  const renamed = ok(await views.updateSceneView(p1Pov.id, { name: 'POV', type: 'table' }));
  assert.deepEqual([renamed.name, renamed.type, renamed.group_id, renamed.position], ['POV', 'table', part1.id, 2]);
  await assert.rejects(db.query(`update public.scene_views set group_id = $1 where id = $2`, [part2.id, p1Pov.id]), /cannot move to another Base/);
  await assert.rejects(db.query(`update public.scene_views set group_id = null where id = $1`, [p1Pov.id]), /cannot move to another Base/);
  await assert.rejects(db.query(`update public.scene_views set group_id = $1 where id = $2`, [part1.id, mList.id]), /cannot move to another Base/);
  // Positions are unique per Base, not per Manuscript: two Bases both have a position 1.
  assert.equal((await one(db, `select count(*)::int as n from public.scene_views v where v.manuscript_id = $1 and v.position = 1`, [mid])).n, 4);

  assert.deepEqual(await sceneRows(db), scenesBefore, 'no Scene row written');
});

const byBase = (a, b) => (a.group_id ?? '').localeCompare(b.group_id ?? '') || a.position - b.position;

test('a Group of another Manuscript, a stranger’s Group, or a deleted one is "Group not found"; the limit is per Base', async () => {
  const db = await seededDb();
  const { part1 } = await parts(db);
  // A Group of bram's manuscript, named from alice's Project.
  signIn(db, BRAM);
  const tideGroup = ok(await structure.createGroup(TIDE, 'Tide Part'));
  signIn(db, ALICE);
  refused(await views.createSceneView(HOLLOW, 'Spy', 'list', null, tideGroup.id), 'Group not found');
  refused(await views.createSceneView(HOLLOW, 'Spy', 'list', null, '00000000-0000-4000-8000-000000000000'), 'Group not found');
  // bram cannot create in alice's Group either way.
  signIn(db, BRAM);
  refused(await views.createSceneView(HOLLOW, 'Spy', 'list', null, part1.id), 'Manuscript not found');
  refused(await views.createSceneView(TIDE, 'Spy', 'list', null, part1.id), 'Group not found');
  signIn(db, ALICE);
  // 50 per Base: the Manuscript's 50 don't count against Part 1's.
  for (let i = 0; i < 50; i += 1) ok(await views.createSceneView(HOLLOW, `V${i}`, 'list'));
  refused(await views.createSceneView(HOLLOW, 'One more', 'list'), 'A base can have at most 50 scene views');
  ok(await views.createSceneView(HOLLOW, 'Still room here', 'list', null, part1.id));
});

test('moving a Group keeps its Views; moving a Chapter changes only the scope; deleting a Group removes exactly its own Views', async () => {
  const db = await seededDb();
  const mid = await manuscriptId(db);
  const scenesBefore = await sceneRows(db);
  const { part1, part2, actA } = await parts(db);
  const mList = ok(await views.createSceneView(HOLLOW, 'List', 'list'));
  const p1Pov = ok(await views.createSceneView(HOLLOW, 'By POV', 'list', null, part1.id));
  const p2Rev = ok(await views.createSceneView(HOLLOW, 'Revision', 'list', null, part2.id));
  const aList = ok(await views.createSceneView(HOLLOW, 'Act list', 'list', null, actA.id));

  // Before: ch1 and ch2 are in Part 1's scope; ch3 in Act A's and Part 2's.
  let index = await shellIndex();
  const inScope = (groupId) => [...new Set(sceneModel.scopedSceneOrder(index, { kind: 'group', groupId }).placed.map((id) => index.get(id).path.at(-1).id))];
  assert.deepEqual(inScope(part1.id), [CH(1), CH(2)]);
  assert.deepEqual(inScope(part2.id), [CH(3), CH(4)]);

  // Act A moves under Part 1: its View is still Act A's; Part 1's scope now holds ch3 too, and Part 2's loses it.
  ok({ error: (await structure.moveGroup(actA.id, part1.id, null, HOLLOW)).error });
  index = await shellIndex();
  assert.deepEqual(inScope(part1.id), [CH(1), CH(2), CH(3)]);
  assert.deepEqual(inScope(part2.id), [CH(4)]);
  let loaded = await workspace.loadProjectWorkspace(HOLLOW);
  assert.deepEqual(viewModel.viewsOf(loaded.sceneViews, actA.id).map((v) => v.id), [aList.id]);
  assert.deepEqual(viewModel.viewsOf(loaded.sceneViews, part1.id).map((v) => v.id), [p1Pov.id]);

  // ch2 moves to Part 2: the scopes change; no View changes owner, position or config.
  const viewsBefore = await all(db, `select id, group_id, position, config, updated_at from public.scene_views order by id`);
  ok({ error: (await structure.moveChapter(CH(2), part2.id, null, HOLLOW)).error });
  index = await shellIndex();
  assert.deepEqual(inScope(part1.id), [CH(1), CH(3)]);
  assert.deepEqual(inScope(part2.id), [CH(4), CH(2)], 'moved to the end of Part 2');
  assert.deepEqual(await all(db, `select id, group_id, position, config, updated_at from public.scene_views order by id`), viewsBefore);

  // Deleting Act A (emptied first) takes its View alone; the others are exactly as they were.
  ok({ error: (await structure.moveChapter(CH(3), part1.id, null, HOLLOW)).error });
  ok({ error: (await structure.deleteGroup(actA.id, HOLLOW)).error });
  // Group ids are random, so the two Group Bases have no fixed order between them: compare by name.
  const byName = (a, b) => a[0].localeCompare(b[0]);
  assert.deepEqual((await rows(db)).map((r) => [r.name, r.group_id]).sort(byName), [['By POV', part1.id], ['List', null], ['Revision', part2.id]].sort(byName));
  loaded = await workspace.loadProjectWorkspace(HOLLOW);
  assert.deepEqual(viewModel.viewsOf(loaded.sceneViews, actA.id), []);
  assert.deepEqual(viewModel.viewsOf(loaded.sceneViews, mid).map((v) => v.id), [mList.id]);
  assert.deepEqual([p1Pov.id, p2Rev.id].map((id) => loaded.sceneViews.find((v) => v.id === id)?.group_id), [part1.id, part2.id]);

  assert.deepEqual(await sceneRows(db), scenesBefore, 'no Scene row written');
});

test('every Base’s View is checked against the Manuscript’s fields and pruned with them; the backup read carries group_id', async () => {
  const db = await seededDb();
  const mid = await manuscriptId(db);
  const { part1 } = await parts(db);
  const status = ok(await sceneProps.createSceneProperty(HOLLOW, 'Status', 'status'));
  const pov = ok(await sceneProps.createSceneProperty(HOLLOW, 'POV', 'select'));
  const board = ok(await views.createSceneView(HOLLOW, 'By Status', 'board', { properties: [status.id, 'words'], sort: null, filters: [], group_by: status.id }, part1.id));
  assert.equal(board.config.group_by, status.id);
  refused(await views.createSceneView(HOLLOW, 'Bad', 'list', { properties: ['nope'], sort: null, filters: [], group_by: null }, part1.id), 'Invalid view configuration');
  // A new select property joins a Group's Views as it joins the Manuscript's; a deleted one leaves every Base's config.
  const after = ok(await sceneProps.createSceneProperty(HOLLOW, 'Arc', 'select'));
  let row = await one(db, `select config from public.scene_views where id = $1`, [board.id]);
  assert.ok(row.config.properties.includes(after.id), 'the new property shows in the Group View');
  assert.equal((await sceneProps.deleteSceneProperty(status.id, 0)).status, 'deleted');
  row = await one(db, `select config from public.scene_views where id = $1`, [board.id]);
  assert.equal(row.config.group_by, null);
  assert.deepEqual(row.config.properties, ['words', after.id]);
  void pov;

  const data = await backup.loadProjectBackup(createSupabaseAdapter(db, { userId: ALICE }), HOLLOW);
  const backed = data.rows.scene_views.find((r) => r.id === board.id);
  assert.deepEqual([backed.group_id, backed.manuscript_id], [part1.id, mid]);

  // Clients still only read the table.
  await assert.rejects(asUser(db, ALICE, (tx) => tx.query(`delete from public.scene_views`)), /permission denied/);
  await assert.rejects(asUser(db, ALICE, (tx) => tx.query(`update public.scene_views set group_id = null`)), /permission denied/);
});
