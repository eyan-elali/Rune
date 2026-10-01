// Timeline Views (Rune 2.0, Milestone 20, migration 042): the REAL View
// actions against the Rune 2.0 schema in real Postgres + RLS, and the pure
// Timeline rules the shell uses (lib/rune2/timelineViews.ts) over the real
// loaders and the real manuscript structure actions.
//
//   * a Timeline is a saved View like List, Table and Board: created, named,
//     retyped, reordered, deleted alongside them, for a Collection and for
//     the Manuscript; its axis lives in the View config and is checked and
//     pruned with the owner's fields; lanes are the Board's group_by
//   * manuscript position: Scenes at their actual place — Group → Chapter →
//     Scene — read afresh after Chapters, Groups and Scenes move or reorder;
//     Unplaced Scenes apart, never on the axis; Trash absent; a filter keeps
//     the manuscript's shape as collapsed gaps; the View's sort never moves a
//     Scene along the manuscript
//   * date and number axes: placement by value; missing values apart, never
//     invented; a changed value moves the item; filters respected
//   * Collection Timelines by a date and by a number property
//   * lanes by a select / status / Relationship: each item once, in its lane
//   * overlap: markers at one position stack into rows
//   * regression: List / Table / Board defaults and arrangement unchanged;
//     no Scene row is written by any Timeline operation
//
// Data: the synthetic legacy fixture moved into the Rune 2.0 schema. alice
// owns hollow; bram owns tide. hollow's reading order: ch1 (h1a), ch2 (h2a),
// ch3 (h3a), ch5 (none), ch4 (h4a, h4b, h4c), ch6 (h6c); Unplaced: h3b, h3c,
// h6a, h6b.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, readRepoFile, LEGACY_BASELINE, RUNE2_SCHEMA } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';
import { prototypeLegacyToRune2 } from '../lib/legacy-to-rune2.mjs';
import { USERS, chapterId, pageId, projectId, seedFixture } from '../fixtures/manuscript-fixture.mjs';

const ALICE = USERS.alice.id;
const BRAM = USERS.bram.id;
const HOLLOW = projectId('hollow');
const TIDE = projectId('tide');
const CH = (n) => chapterId(`hollow.ch${n}`);
const S = (k) => pageId(k);

const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const all = async (db, sql, params = []) => (await db.query(sql, params)).rows;

let legacy;
let sceneProps, sceneViewActions, colViews, colProps, collections, structure, scenes, trash, workspace, manuscriptLoader;
let viewModel, sceneModel, timeline, refModel, propModel, nav;
before(async () => {
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
  sceneProps = await bundleForTest('src/lib/actions/sceneProperties.ts', { name: 'tl_props' });
  sceneViewActions = await bundleForTest('src/lib/actions/sceneViews.ts', { name: 'tl_views' });
  colViews = await bundleForTest('src/lib/actions/workspaceViews.ts', { name: 'tl_col_views' });
  colProps = await bundleForTest('src/lib/actions/workspaceProperties.ts', { name: 'tl_col_props' });
  collections = await bundleForTest('src/lib/actions/workspaceCollections.ts', { name: 'tl_collections' });
  structure = await bundleForTest('src/lib/actions/structure.ts', { name: 'tl_structure' });
  scenes = await bundleForTest('src/lib/actions/scenes.ts', { name: 'tl_scenes' });
  trash = await bundleForTest('src/lib/actions/workspaceTrash.ts', { name: 'tl_trash' });
  workspace = await bundleForTest('src/lib/rune2/projectWorkspace.ts', { name: 'tl_loader' });
  manuscriptLoader = await bundleForTest('src/lib/rune2/projectManuscript.ts', { name: 'tl_manuscript' });
  viewModel = await bundleForTest('src/lib/rune2/collectionViews.ts', { name: 'tl_view_model' });
  sceneModel = await bundleForTest('src/lib/rune2/sceneViews.ts', { name: 'tl_scene_model' });
  timeline = await bundleForTest('src/lib/rune2/timelineViews.ts', { name: 'tl_model' });
  refModel = await bundleForTest('src/lib/rune2/references.ts', { name: 'tl_ref_model' });
  propModel = await bundleForTest('src/lib/rune2/collectionProperties.ts', { name: 'tl_prop_model' });
  nav = await bundleForTest('src/lib/rune2/navigatorModel.ts', { name: 'tl_nav' });
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
  for (const mod of [sceneProps, sceneViewActions, colViews, colProps, collections, structure, scenes, trash, workspace, manuscriptLoader]) {
    mod.setServerClient?.(sb);
  }
  return sb;
}

const ok = (r) => { assert.equal(r.error, null, r.error); return r.data; };
const okv = (r) => { assert.equal(r.error, null, r.error); return r; };
const refused = (r, message) => { assert.equal(r.data, null); assert.equal(r.error, message); };
const config = (c = {}) => ({ properties: [], sort: null, filters: [], group_by: null, ...c });

const sceneRows = (db) => all(db, `select s.* from public.scenes s join public.manuscripts m on m.id = s.manuscript_id
  where m.project_id = $1 order by s.id`, [HOLLOW]);
const manuscriptId = async (db) => (await one(db, `select id from public.manuscripts where project_id = $1`, [HOLLOW])).id;

async function shellIndex(projectId = HOLLOW) {
  const [m, w] = [await manuscriptLoader.loadProjectManuscript(projectId), await workspace.loadProjectWorkspace(projectId)];
  return new Map([...nav.indexManuscript(m), ...nav.indexWorkspace(w.tree, {}, w.entries)]);
}

/** The Manuscript's Scenes as the shell arranges them for a View: ids in manuscript order, fields, values. */
async function sceneItems(db) {
  const mid = await manuscriptId(db);
  const index = await shellIndex();
  const w = await workspace.loadProjectWorkspace(HOLLOW);
  const order = sceneModel.manuscriptSceneOrder(index);
  const ids = [...order.placed, ...order.unplaced];
  const properties = [...propModel.propertiesOf(w.sceneProperties, mid), ...sceneModel.sceneNativeProperties(mid, HOLLOW)];
  const values = new Map([...propModel.indexValues(w.values, w.sceneValues), ...refModel.relationshipValues(w.references), ...sceneModel.sceneNativeValues(index, ids)]);
  const input = { entryIds: ids, properties, values, titleOf: (id) => sceneModel.sceneViewLabel(index, id)?.title ?? '' };
  const arrange = (view) => viewModel.arrangeItems(view, input);
  return { mid, index, w, ids, properties, values, arrange, views: w.sceneViews };
}

/** Column shape of a manuscript layout: 'ch1' / 'ch1:h1a,h3b' for a Chapter, '4-4' / '4-6' for a gap of Chapter ordinals. */
const labelOf = (() => {
  const byId = new Map([...['h1a', 'h2a', 'h3a', 'h3b', 'h3c', 'h4a', 'h4b', 'h4c', 'h6a', 'h6b', 'h6c'].map((k) => [S(k), k]),
    ...[1, 2, 3, 4, 5, 6].map((n) => [CH(n), `ch${n}`])]);
  return (id) => byId.get(id) ?? id;
})();
const shape = (layout) => layout.columns.map((c) => (c.kind === 'gap' ? `${c.from}-${c.to}` : `${labelOf(c.id)}:${c.sceneIds.map(labelOf).join(',')}`));
const bands = (layout) => layout.groups.map((g) => [g.title, g.depth, g.from, g.to]);

// ── 1. The View model ──────────────────────────────────────────────────────────

test('Scene Timeline: a saved View along the manuscript by default; created, renamed, retyped, reordered and deleted like any other View', async () => {
  const db = await seededDb();
  const mid = await manuscriptId(db);
  const rows = await sceneRows(db);
  assert.deepEqual(viewModel.VIEW_TYPES, ['list', 'table', 'board', 'timeline']);
  assert.equal(viewModel.VIEW_TYPE_LABEL.timeline, 'Timeline');
  assert.equal(viewModel.newViewName('timeline', undefined), 'Timeline');

  const list = ok(await sceneViewActions.createSceneView(HOLLOW, null, 'list'));
  const tl = ok(await sceneViewActions.createSceneView(HOLLOW, null, 'timeline'));
  assert.deepEqual([tl.name, tl.type, tl.position, tl.manuscript_id], ['Timeline', 'timeline', 2, mid]);
  assert.deepEqual(tl.config, config({ axis: 'manuscript' }), 'a Scene Timeline runs along the manuscript, showing names only');

  // Loads through the one store, beside the List; the model reads its axis.
  const loaded = await workspace.loadProjectWorkspace(HOLLOW);
  assert.deepEqual(viewModel.viewsOf(loaded.sceneViews, mid).map((v) => [v.name, v.type]), [['List', 'list'], ['Timeline', 'timeline']]);
  assert.deepEqual(timeline.timelineAxis(tl, [], true), { kind: 'manuscript' });
  assert.equal(timeline.timelineAxis(tl, [], false), null, 'a Collection never offers manuscript position');
  assert.equal(timeline.axisName({ kind: 'manuscript' }), 'Manuscript position');

  // Rename, reorder, delete — configuration only.
  assert.equal(ok(await sceneViewActions.updateSceneView(tl.id, { name: 'Story so far' })).name, 'Story so far');
  ok(await sceneViewActions.moveSceneView(tl.id, 0));
  assert.deepEqual(viewModel.viewsOf((await workspace.loadProjectWorkspace(HOLLOW)).sceneViews, mid).map((v) => v.name), ['Story so far', 'List']);
  // Retype: a List becoming a Timeline takes the manuscript axis and keeps its properties; back again, the axis stays harmlessly.
  const retyped = ok(await sceneViewActions.updateSceneView(list.id, { type: 'timeline' }));
  assert.equal(retyped.config.axis, 'manuscript');
  assert.equal(retyped.config.properties.length, list.config.properties.length);
  assert.equal(ok(await sceneViewActions.updateSceneView(list.id, { type: 'list' })).type, 'list');
  assert.equal((await sceneViewActions.updateSceneView(list.id, { type: 'calendar' })).error, 'Unknown view type');
  ok(await sceneViewActions.deleteSceneView(tl.id));
  assert.deepEqual((await workspace.loadProjectWorkspace(HOLLOW)).sceneViews.map((v) => v.id), [list.id]);

  assert.deepEqual(await sceneRows(db), rows, 'no Scene row was written');
});

test('the axis is checked against the owner\'s fields: number or date (or the manuscript, for Scenes); pruned when its property goes; a new date property becomes the axis of a Timeline with none', async () => {
  const db = await seededDb();
  const synopsis = ok(await sceneProps.createSceneProperty(HOLLOW, 'Synopsis', 'text'));
  const day = ok(await sceneProps.createSceneProperty(HOLLOW, 'Story day', 'number'));
  const when = ok(await sceneProps.createSceneProperty(HOLLOW, 'When', 'date'));
  let status = ok(await sceneProps.createSceneProperty(HOLLOW, 'Status', 'status'));
  status = ok(await sceneProps.updateSceneProperty(status.id, { options: [{ name: 'Planned' }, { name: 'Done' }] })).property;
  const tl = ok(await sceneViewActions.createSceneView(HOLLOW, 'By day', 'timeline'));
  const withAxis = (axis, rest = {}) => sceneViewActions.updateSceneView(tl.id, { config: config({ axis, ...rest }) });

  assert.equal(ok(await withAxis(day.id)).config.axis, day.id);
  assert.equal(ok(await withAxis(when.id)).config.axis, when.id);
  assert.equal(ok(await withAxis('manuscript')).config.axis, 'manuscript');
  for (const bad of [synopsis.id, status.id, 'words', 'placement', 'nowhere', '']) {
    refused(await withAxis(bad), 'Invalid view configuration');
  }
  // The manuscript position is an axis only: never shown, sorted, filtered or grouped by.
  for (const bad of [{ properties: ['manuscript'] }, { sort: { by: 'manuscript', direction: 'asc' } }, { group_by: 'manuscript' },
    { filters: [{ property: 'manuscript', op: 'gt', value: 1 }] }]) {
    refused(await sceneViewActions.updateSceneView(tl.id, { config: config({ axis: 'manuscript', ...bad }) }), 'Invalid view configuration');
  }
  // Lanes are the Board's grouping, under the Board's rule.
  assert.equal(ok(await withAxis(day.id, { group_by: status.id })).config.group_by, status.id);
  refused(await withAxis(day.id, { group_by: day.id }), 'Invalid view configuration');
  // Saving a Timeline with no axis gives it the manuscript.
  assert.equal(ok(await withAxis(null)).config.axis, 'manuscript');
  const model = { ...tl, config: config({ axis: day.id }) };
  const w = await workspace.loadProjectWorkspace(HOLLOW);
  const props = propModel.propertiesOf(w.sceneProperties, tl.manuscript_id);
  assert.deepEqual(timeline.axisProperties([...props, ...sceneModel.sceneNativeProperties(tl.manuscript_id, HOLLOW)]).map((p) => p.name), ['Story day', 'When'],
    'only number and date properties — never Words');
  assert.equal(timeline.timelineAxis(model, props, true).property.id, day.id);
  assert.equal(timeline.timelineAxis({ ...tl, config: config({ axis: synopsis.id }) }, props, true), null);

  // Deleting the axis property prunes the axis; a new date property then becomes the axis.
  ok(await withAxis(day.id));
  assert.equal((await sceneProps.deleteSceneProperty(day.id, 0)).status, 'deleted');
  const pruned = (await one(db, `select config from public.scene_views where id = $1`, [tl.id])).config;
  assert.equal(pruned.axis, null);
  const born = ok(await sceneProps.createSceneProperty(HOLLOW, 'Born', 'date'));
  assert.equal((await one(db, `select config from public.scene_views where id = $1`, [tl.id])).config.axis, born.id);
  // …but never replaces one that is set.
  ok(await sceneProps.createSceneProperty(HOLLOW, 'Age', 'number'));
  assert.equal((await one(db, `select config from public.scene_views where id = $1`, [tl.id])).config.axis, born.id);

  // Another writer's property cannot be an axis; another writer cannot touch the View.
  signIn(db, BRAM);
  const tide = ok(await sceneProps.createSceneProperty(TIDE, 'Tide day', 'number'));
  assert.equal((await sceneViewActions.updateSceneView(tl.id, { config: config({ axis: tide.id }) })).error, 'View not found');
  signIn(db, ALICE);
  refused(await withAxis(tide.id), 'Invalid view configuration');
});

test('Collection Timeline: along the first date property, else the first number, else nothing yet — with a path to one', async () => {
  const db = await seededDb();
  const characters = ok(await collections.createWorkspaceCollection(HOLLOW, 'Characters')).collection;
  const cid = characters.id;
  // No eligible property: a Timeline without an axis, and the model says so.
  const empty = ok(await colViews.createCollectionView(cid, null, 'timeline'));
  assert.deepEqual([empty.name, empty.type, empty.config], ['Timeline', 'timeline', config({ axis: null })]);
  assert.equal(timeline.timelineAxis(empty, [], false), null);
  assert.deepEqual(timeline.axisProperties([]), []);
  refused(await colViews.updateCollectionView(empty.id, { config: config({ axis: 'manuscript' }) }), 'Invalid view configuration');
  // "Add a Date property": the new property becomes the axis.
  const born = ok(await colProps.createCollectionProperty(cid, 'Born', 'date'));
  assert.equal((await one(db, `select config from public.workspace_collection_views where id = $1`, [empty.id])).config.axis, born.id);

  const age = ok(await colProps.createCollectionProperty(cid, 'Age', 'number'));
  const role = ok(await colProps.createCollectionProperty(cid, 'Role', 'text'));
  const byDate = ok(await colViews.createCollectionView(cid, 'Lives', 'timeline'));
  assert.equal(byDate.config.axis, born.id, 'a date property first');
  assert.deepEqual(byDate.config.properties, []);
  assert.equal(ok(await colViews.updateCollectionView(byDate.id, { config: config({ axis: age.id }) })).config.axis, age.id);
  refused(await colViews.updateCollectionView(byDate.id, { config: config({ axis: role.id }) }), 'Invalid view configuration');
  assert.equal((await colProps.deleteCollectionProperty(born.id, 0)).status, 'deleted');
  const ages = ok(await colViews.createCollectionView(cid, null, 'timeline'));
  assert.equal(ages.config.axis, age.id, 'else the first number property');

  // The List, Table and Board of this Collection are exactly as before.
  const list = (await all(db, `select * from public.workspace_collection_views where collection_id = $1 order by position`, [cid]))[0];
  assert.deepEqual(list.config, config({ properties: [age.id, role.id] }));
  const table = ok(await colViews.createCollectionView(cid, null, 'table'));
  assert.deepEqual(table.config, config({ properties: [age.id, role.id] }));
  const board = ok(await colViews.createCollectionView(cid, null, 'board'));
  assert.deepEqual(board.config, config());
  assert.deepEqual((await all(db, `select name, type, position from public.workspace_collection_views where collection_id = $1 order by position`, [cid]))
    .map((v) => [v.name, v.type, v.position]),
    [['List', 'list', 1], ['Timeline', 'timeline', 2], ['Lives', 'timeline', 3], ['Timeline', 'timeline', 4], ['Table', 'table', 5], ['Board', 'board', 6]]);
  ok(await colViews.deleteCollectionView(byDate.id));
  assert.equal((await one(db, `select count(*)::int as n from public.workspace_collection_views where collection_id = $1`, [cid])).n, 5);
});

// ── 2. Manuscript position ─────────────────────────────────────────────────────

test('manuscript position: Chapters in reading order, Scenes in Chapter order, empty Chapters as gaps, Unplaced apart; nested Groups as bands', async () => {
  const db = await seededDb();
  let { index, ids } = await sceneItems(db);
  let layout = timeline.manuscriptLayout(index, ids);
  assert.deepEqual(shape(layout), ['ch1:h1a', 'ch2:h2a', 'ch3:h3a', '4-4', 'ch4:h4a,h4b,h4c', 'ch6:h6c'], 'ch5 (no Scenes) is a gap of one');
  assert.deepEqual(layout.placed.map(labelOf), ['h1a', 'h2a', 'h3a', 'h4a', 'h4b', 'h4c', 'h6c']);
  assert.deepEqual(new Set(layout.unplaced.map(labelOf)), new Set(['h3b', 'h3c', 'h6a', 'h6b']), 'never on the axis');
  assert.deepEqual([layout.groups, layout.depth], [[], 0]);
  assert.deepEqual(layout.columns.filter((c) => c.kind === 'chapter').map((c) => c.ordinal), [1, 2, 3, 5, 6]);

  // Book One [ Part I [ ch1, ch2 ], ch6 ], ch5, ch4, Part II [ ch3 ] — through the real structure actions.
  const book = okv(await structure.createGroup(HOLLOW, 'Book One')).data;
  const part1 = okv(await structure.createGroup(HOLLOW, 'Part I', book.id)).data;
  okv(await structure.moveChapter(CH(1), part1.id, null, HOLLOW));
  okv(await structure.moveChapter(CH(2), part1.id, null, HOLLOW));
  okv(await structure.moveChapter(CH(6), book.id, null, HOLLOW));
  okv(await structure.moveGroup(book.id, null, 0, HOLLOW));
  const part2 = okv(await structure.createGroup(HOLLOW, 'Part II')).data;
  okv(await structure.moveChapter(CH(3), part2.id, null, HOLLOW));

  ({ index, ids } = await sceneItems(db));
  layout = timeline.manuscriptLayout(index, ids);
  assert.deepEqual(shape(layout), ['ch1:h1a', 'ch2:h2a', 'ch6:h6c', '4-4', 'ch4:h4a,h4b,h4c', 'ch3:h3a'], 'Chapters renumbered in the new reading order');
  assert.deepEqual(layout.columns.filter((c) => c.kind === 'chapter').map((c) => c.ordinal), [1, 2, 3, 5, 6]);
  assert.deepEqual(bands(layout), [['Book One', 0, 0, 2], ['Part II', 0, 5, 5], ['Part I', 1, 0, 1]]);
  assert.equal(layout.depth, 2);
  assert.deepEqual(layout.placed.map(labelOf), ['h1a', 'h2a', 'h6c', 'h4a', 'h4b', 'h4c', 'h3a']);

  // A Group moved moves its band with it; a Chapter moved out of a Group leaves it.
  okv(await structure.moveGroup(part2.id, null, 0, HOLLOW));
  okv(await structure.moveChapter(CH(6), null, null, HOLLOW));
  ({ index, ids } = await sceneItems(db));
  layout = timeline.manuscriptLayout(index, ids);
  assert.deepEqual(shape(layout), ['ch3:h3a', 'ch1:h1a', 'ch2:h2a', '4-4', 'ch4:h4a,h4b,h4c', 'ch6:h6c']);
  assert.deepEqual(bands(layout), [['Part II', 0, 0, 0], ['Book One', 0, 1, 2], ['Part I', 1, 1, 2]]);
});

test('manuscript position follows Scene moves, reorders, Unplaced and Trash; a filter collapses the rest into gaps; the View\'s sort never moves a Scene', async () => {
  const db = await seededDb();
  const rows = await sceneRows(db);
  const before = await manuscriptLoader.loadProjectManuscript(HOLLOW);

  // Reorder inside a Chapter; move a Scene between Chapters; place an Unplaced one; unplace one.
  okv(await scenes.reorderScenes(CH(4), [S('h4c'), S('h4a'), S('h4b')]));
  ok(await scenes.moveSceneToChapter(S('h1a'), CH(2)));
  ok(await scenes.moveSceneToChapter(S('h3b'), CH(5)));
  ok(await scenes.moveSceneToUnplaced(S('h6c')));
  let { index, ids } = await sceneItems(db);
  let layout = timeline.manuscriptLayout(index, ids);
  assert.deepEqual(shape(layout), ['1-1', 'ch2:h2a,h1a', 'ch3:h3a', 'ch5:h3b', 'ch4:h4c,h4a,h4b', '6-6'], 'ch1 and ch6 now hold nothing');
  assert.deepEqual(layout.placed.map(labelOf), ['h2a', 'h1a', 'h3a', 'h3b', 'h4c', 'h4a', 'h4b']);
  assert.ok(layout.unplaced.includes(S('h6c')) && !layout.placed.includes(S('h6c')));

  // Trash: gone from the index, so gone from the axis and from Unplaced.
  ok(await trash.trashWorkspaceObject('scene', S('h4a')));
  ok(await trash.trashWorkspaceObject('scene', S('h6c')));
  ({ index, ids } = await sceneItems(db));
  layout = timeline.manuscriptLayout(index, ids);
  assert.deepEqual(shape(layout), ['1-1', 'ch2:h2a,h1a', 'ch3:h3a', 'ch5:h3b', 'ch4:h4c,h4b', '6-6']);
  assert.ok(!layout.unplaced.includes(S('h6c')));
  ok(await trash.restoreWorkspaceObject('scene', S('h4a')));
  ({ index, ids } = await sceneItems(db));
  assert.deepEqual(shape(timeline.manuscriptLayout(index, ids)), ['1-1', 'ch2:h2a,h1a', 'ch3:h3a', 'ch5:h3b', 'ch4:h4c,h4a,h4b', '6-6']);

  // A filtered View: only its Scenes are placed; the Chapters between collapse into one gap each run.
  const some = [S('h1a'), S('h4b'), S('h3c')];
  layout = timeline.manuscriptLayout(index, some);
  assert.deepEqual(shape(layout), ['1-1', 'ch2:h1a', '3-4', 'ch4:h4b', '6-6']);
  assert.deepEqual(layout.unplaced, [S('h3c')]);
  assert.deepEqual(layout.columns[2], { kind: 'gap', from: 3, to: 4, count: 2, groupIds: [] });

  // The View's sort (words, descending) changes the arranged order — never a manuscript position.
  const t = await sceneItems(db);
  const sorted = t.arrange({ ...sceneModel.sceneFallbackView(t.mid, HOLLOW, t.properties), config: config({ sort: { by: 'words', direction: 'desc' } }) });
  assert.notDeepEqual(sorted, t.ids);
  assert.deepEqual(shape(timeline.manuscriptLayout(t.index, sorted)), shape(timeline.manuscriptLayout(t.index, t.ids)));

  // Nothing here wrote prose or changed the manuscript beyond the moves asked for (a move bumps a Scene's version, as ever).
  const keep = ({ id, content, word_count }) => ({ id, content, word_count });
  assert.deepEqual((await sceneRows(db)).map(keep), rows.map(keep));
  assert.equal((await manuscriptLoader.loadProjectManuscript(HOLLOW)).manuscriptWords,
    before.manuscriptWords - 270 + 380, 'h6c left the ordered total, h3b joined it');
});

// ── 3. Date and number axes ────────────────────────────────────────────────────

test('dates as day numbers: any year, round trips, leap days, bad strings; ticks by day, month or year', () => {
  assert.equal(timeline.dayNumber('1970-01-01'), 0);
  assert.equal(timeline.dayNumber('2000-03-01'), 11017);
  assert.equal(timeline.dayNumber('1203-06-15') < timeline.dayNumber('1203-06-16'), true);
  for (const d of ['0001-01-01', '1203-02-28', '1204-02-29', '2024-02-29', '9999-12-31', '2026-09-29']) {
    const n = timeline.dayNumber(d);
    const c = timeline.civilOf(n);
    assert.equal(`${String(c.y).padStart(4, '0')}-${String(c.m).padStart(2, '0')}-${String(c.d).padStart(2, '0')}`, d);
  }
  assert.equal(timeline.dayNumber('1203-02-29') - timeline.dayNumber('1203-02-28'), 1, 'normalised like a calendar, never NaN');
  for (const bad of ['yesterday', '2024-13-01', '2024-00-10', '2024-1-1', '', '12']) assert.equal(timeline.dayNumber(bad), null, bad);

  const date = { type: 'date', name: 'When', options: [] };
  const number = { type: 'number', name: 'Day', options: [] };
  assert.equal(timeline.axisValue(date, '1203-06-15'), timeline.dayNumber('1203-06-15'));
  assert.equal(timeline.axisValue(date, 'soon'), null);
  assert.equal(timeline.axisValue(number, 12), 12);
  assert.equal(timeline.axisValue(number, '12'), null);
  assert.equal(timeline.axisValue({ type: 'text', options: [] }, 'x'), null);

  assert.deepEqual(timeline.numberTicks(0, 100, 5).map((t) => t.at), [0, 20, 40, 60, 80, 100]);
  assert.deepEqual(timeline.numberTicks(3, 47, 5).map((t) => t.at), [0, 10, 20, 30, 40, 50]);
  assert.deepEqual(timeline.numberTicks(3, 47, 3).map((t) => t.at), [0, 20, 40]);
  assert.deepEqual(timeline.numberTicks(7, 7, 4), [{ at: 7, label: '7', major: true }]);
  assert.equal(timeline.numberTicks(0, 1, 8).map((t) => t.at).join(','), '0,0.2,0.4,0.6,0.8,1');
  assert.equal(timeline.niceStep(1000, 5), 200);
  assert.equal(timeline.niceStep(0.3, 4), 0.1);

  const d = timeline.dayNumber;
  const days = timeline.dateTicks(d('1203-06-14'), d('1203-06-17'), 8);
  assert.deepEqual(days.map((t) => t.label), ['14 Jun 1203', '15 Jun', '16 Jun', '17 Jun'], 'days, the first with its year');
  const months = timeline.dateTicks(d('1203-11-10'), d('1204-03-02'), 8);
  assert.deepEqual(months.map((t) => t.label), ['Nov 1203', 'Dec', 'Jan 1204', 'Feb', 'Mar']);
  assert.deepEqual(months.map((t) => t.major), [true, false, true, false, false]);
  const years = timeline.dateTicks(d('1198-06-01'), d('1240-01-01'), 6);
  assert.deepEqual(years.map((t) => t.label), ['1190', '1200', '1210', '1220', '1230', '1240']);
  const eras = timeline.dateTicks(d('0100-01-01'), d('4000-01-01'), 5);
  assert.deepEqual(eras.map((t) => t.label), ['0', '1000', '2000', '3000', '4000']);
  assert.deepEqual(timeline.dateTicks(d('1203-06-14'), d('1203-06-14'), 8).map((t) => t.label), ['14 Jun 1203']);
  assert.deepEqual(timeline.axisTicks(date, [], 5), []);
  assert.deepEqual(timeline.axisTicks(number, [{ id: 'a', at: 2 }, { id: 'b', at: 9 }], 3).map((t) => t.at), [0, 5, 10]);
});

test('Scene Timeline along a number and a date property: placed by value, in the View\'s order; missing values apart; a change moves the Scene; filters respected', async () => {
  const db = await seededDb();
  const rows = await sceneRows(db);
  const day = ok(await sceneProps.createSceneProperty(HOLLOW, 'Story day', 'number'));
  const when = ok(await sceneProps.createSceneProperty(HOLLOW, 'When', 'date'));
  let status = ok(await sceneProps.createSceneProperty(HOLLOW, 'Status', 'status'));
  status = ok(await sceneProps.updateSceneProperty(status.id, { options: [{ name: 'Planned' }, { name: 'Done' }] })).property;
  const done = status.options[1].id;
  const set = (k, p, v) => sceneProps.setScenePropertyValue(S(k), p.id, v);
  ok(await set('h1a', day, 1));
  ok(await set('h2a', day, 3));
  ok(await set('h3a', day, 3));
  ok(await set('h4a', day, 2));
  ok(await set('h3b', day, 40));
  ok(await set('h1a', when, '1203-06-14'));
  ok(await set('h4c', when, '1203-06-12'));
  ok(await set('h1a', status, done));
  ok(await set('h4a', status, done));
  const tl = ok(await sceneViewActions.createSceneView(HOLLOW, 'Days', 'timeline', config({ axis: day.id })));

  let t = await sceneItems(db);
  const prop = (id) => t.properties.find((p) => p.id === id);
  const view = (c) => ({ ...tl, config: config(c) });
  let arranged = t.arrange(view({ axis: day.id }));
  assert.deepEqual(arranged, t.ids, 'a Timeline arranges as the View does: manuscript order, filtered');
  let { placed, missing } = timeline.propertyPlacements(prop(day.id), arranged, t.values);
  assert.deepEqual(placed.map((p) => [labelOf(p.id), p.at]), [['h1a', 1], ['h2a', 3], ['h3a', 3], ['h4a', 2], ['h3b', 40]], 'in the View\'s order; ties keep it');
  assert.deepEqual(new Set(missing.map(labelOf)), new Set(['h4b', 'h4c', 'h6c', 'h3c', 'h6a', 'h6b']), 'no value: apart, never at an invented day');
  ({ placed, missing } = timeline.propertyPlacements(prop(when.id), arranged, t.values));
  assert.deepEqual(placed.map((p) => [labelOf(p.id), p.at]), [['h1a', timeline.dayNumber('1203-06-14')], ['h4c', timeline.dayNumber('1203-06-12')]]);
  assert.equal(missing.length, 9);

  // A Scene's value changes: its place changes, nothing else.
  ok(await set('h4a', day, 30));
  ok(await set('h3a', day, null));
  t = await sceneItems(db);
  ({ placed, missing } = timeline.propertyPlacements(prop(day.id), t.arrange(view({ axis: day.id })), t.values));
  assert.deepEqual(placed.map((p) => [labelOf(p.id), p.at]), [['h1a', 1], ['h2a', 3], ['h4a', 30], ['h3b', 40]]);
  assert.ok(missing.includes(S('h3a')));

  // The View's filters hold: a Timeline of Done Scenes places only those.
  arranged = t.arrange(view({ axis: day.id, filters: [{ property: status.id, op: 'is', value: done }] }));
  assert.deepEqual(arranged.map(labelOf), ['h1a', 'h4a']);
  ({ placed, missing } = timeline.propertyPlacements(prop(day.id), arranged, t.values));
  assert.deepEqual(placed.map((p) => labelOf(p.id)), ['h1a', 'h4a']);
  assert.deepEqual(missing, []);
  // Placed Scenes only — an Unplaced Scene keeps its own value on a property axis (h3b has a day) but a placement filter can leave it out.
  arranged = t.arrange(view({ axis: day.id, filters: [{ property: 'placement', op: 'is', value: 'placed' }] }));
  assert.ok(!arranged.includes(S('h3b')));
  // And the manuscript axis under the same filters: the same Scenes, at their manuscript places.
  assert.deepEqual(shape(timeline.manuscriptLayout(t.index, t.arrange(view({ axis: 'manuscript', filters: [{ property: status.id, op: 'is', value: done }] })))),
    ['ch1:h1a', '2-4', 'ch4:h4a', '6-6']);

  // A Scene View's presenter opens the canonical Scene (a Chapter's only Scene as its Chapter).
  assert.equal(refModel.openableId(t.index, S('h1a')), CH(1));
  assert.equal(refModel.openableId(t.index, S('h4a')), S('h4a'));

  const keep = ({ id, chapter_id, position, content, word_count, version, updated_at }) => ({ id, chapter_id, position, content, word_count, version, updated_at });
  assert.deepEqual((await sceneRows(db)).map(keep), rows.map(keep), 'no Scene row changed: a Timeline is metadata beside the prose');
});

// ── 4. Collection Timeline ─────────────────────────────────────────────────────

test('Collection Timeline: Entries along a date and along a number; missing apart; filters; each Entry opens as itself', async () => {
  const db = await seededDb();
  const characters = ok(await collections.createWorkspaceCollection(HOLLOW, 'Characters')).collection;
  const cid = characters.id;
  const nerai = ok(await collections.createCollectionEntry(cid, 'Nerai'));
  const alaric = ok(await collections.createCollectionEntry(cid, 'Alaric'));
  const djal = ok(await collections.createCollectionEntry(cid, 'Djal'));
  const born = ok(await colProps.createCollectionProperty(cid, 'Born', 'date'));
  const age = ok(await colProps.createCollectionProperty(cid, 'Age', 'number'));
  let side = ok(await colProps.createCollectionProperty(cid, 'Side', 'select'));
  side = ok(await colProps.updateCollectionProperty(side.id, { options: [{ name: 'Drelareth' }, { name: 'Aelthyr' }] })).property;
  const [drel, ael] = side.options.map((o) => o.id);
  ok(await colProps.setEntryPropertyValue(nerai.id, born.id, '1184-03-02'));
  ok(await colProps.setEntryPropertyValue(alaric.id, born.id, '1179-11-20'));
  ok(await colProps.setEntryPropertyValue(nerai.id, age.id, 19));
  ok(await colProps.setEntryPropertyValue(djal.id, age.id, 44));
  ok(await colProps.setEntryPropertyValue(nerai.id, side.id, drel));
  ok(await colProps.setEntryPropertyValue(alaric.id, side.id, ael));
  const tl = ok(await colViews.createCollectionView(cid, 'Lives', 'timeline'));
  assert.equal(tl.config.axis, born.id);

  const load = async () => {
    const index = await shellIndex();
    const w = await workspace.loadProjectWorkspace(HOLLOW);
    const properties = propModel.propertiesOf(w.properties, cid);
    const values = new Map([...propModel.indexValues(w.values, w.sceneValues), ...refModel.relationshipValues(w.references)]);
    const entryIds = index.get(cid).entryIds;
    const arrange = (c) => viewModel.arrangeItems({ ...tl, config: config(c) }, { entryIds, properties, values, titleOf: (id) => index.get(id).title });
    return { index, properties, values, entryIds, arrange };
  };
  const name = (index) => (id) => index.get(id).title;
  let c = await load();
  assert.deepEqual(c.entryIds, [nerai.id, alaric.id, djal.id], 'creation order');
  const axis = timeline.timelineAxis(tl, c.properties, false);
  assert.deepEqual([axis.kind, axis.property.name], ['property', 'Born']);

  let { placed, missing } = timeline.propertyPlacements(axis.property, c.arrange({ axis: born.id }), c.values);
  assert.deepEqual(placed.map((p) => [name(c.index)(p.id), p.at]), [['Nerai', timeline.dayNumber('1184-03-02')], ['Alaric', timeline.dayNumber('1179-11-20')]]);
  assert.deepEqual(missing.map(name(c.index)), ['Djal']);
  assert.deepEqual(timeline.axisTicks(axis.property, placed, 6).map((t) => t.label), ['1179', '1180', '1181', '1182', '1183', '1184']);

  const ageProp = c.properties.find((p) => p.id === age.id);
  ({ placed, missing } = timeline.propertyPlacements(ageProp, c.arrange({ axis: age.id }), c.values));
  assert.deepEqual(placed.map((p) => [name(c.index)(p.id), p.at]), [['Nerai', 19], ['Djal', 44]]);
  assert.deepEqual(missing.map(name(c.index)), ['Alaric']);

  // Filtered: only Drelareth.
  ({ placed, missing } = timeline.propertyPlacements(axis.property, c.arrange({ axis: born.id, filters: [{ property: side.id, op: 'is', value: drel }] }), c.values));
  assert.deepEqual([placed.map((p) => name(c.index)(p.id)), missing], [['Nerai'], []]);

  // A value changes: the Entry moves.
  ok(await colProps.setEntryPropertyValue(djal.id, born.id, '1150-01-01'));
  c = await load();
  ({ placed } = timeline.propertyPlacements(axis.property, c.arrange({ axis: born.id }), c.values));
  assert.deepEqual(placed.map((p) => name(c.index)(p.id)), ['Nerai', 'Alaric', 'Djal']);

  // An Entry opens as itself — the canonical object, never a copy.
  for (const id of [nerai.id, alaric.id, djal.id]) assert.equal(refModel.openableId(c.index, id), id);
  assert.equal(c.index.get(nerai.id).kind, 'collectionEntry');
  // The Collection keeps exactly three Entries: a Timeline made none.
  assert.equal((await one(db, `select count(*)::int as n from public.workspace_collection_entries where collection_id = $1`, [cid])).n, 3);
});

// ── 5. Lanes and rows ──────────────────────────────────────────────────────────

test('lanes: a select, status or Relationship property through the Board\'s rule — each item once, in its lane; no lane without a grouping', async () => {
  const db = await seededDb();
  const characters = ok(await collections.createWorkspaceCollection(HOLLOW, 'Characters')).collection;
  const nerai = ok(await collections.createCollectionEntry(characters.id, 'Nerai'));
  const alaric = ok(await collections.createCollectionEntry(characters.id, 'Alaric'));
  const day = ok(await sceneProps.createSceneProperty(HOLLOW, 'Story day', 'number'));
  let status = ok(await sceneProps.createSceneProperty(HOLLOW, 'Status', 'status'));
  status = ok(await sceneProps.updateSceneProperty(status.id, { options: [{ name: 'Planned' }, { name: 'Done' }] })).property;
  const [planned, done] = status.options.map((o) => o.id);
  const pov = ok(await sceneProps.createSceneRelationshipProperty(HOLLOW, 'POV', 'entry', characters.id, false));
  ok(await sceneProps.setScenePropertyValue(S('h1a'), status.id, done));
  ok(await sceneProps.setScenePropertyValue(S('h2a'), status.id, planned));
  ok(await sceneProps.setSceneRelationship(S('h1a'), pov.id, [nerai.id]));
  ok(await sceneProps.setSceneRelationship(S('h4a'), pov.id, [alaric.id]));
  for (const [k, v] of [['h1a', 1], ['h2a', 1], ['h4a', 1], ['h3a', 5]]) ok(await sceneProps.setScenePropertyValue(S(k), day.id, v));
  const tl = ok(await sceneViewActions.createSceneView(HOLLOW, 'Threads', 'timeline', config({ axis: 'manuscript', group_by: status.id })));
  assert.equal(tl.config.group_by, status.id);

  const t = await sceneItems(db);
  const laneTargets = (p) => t.index.get(p.relation_collection_id).entryIds.map((id) => ({ id, name: t.index.get(id).title }));
  const arranged = t.arrange(tl);
  const lanes = (groupBy) => viewModel.boardLanes({ ...tl, config: config({ axis: 'manuscript', group_by: groupBy }) }, t.properties, t.values, arranged, laneTargets);
  const byStatus = lanes(status.id);
  assert.deepEqual(byStatus.lanes.map((l) => [l.name, l.entryIds.map(labelOf)]),
    [['No status', arranged.filter((id) => ![S('h1a'), S('h2a')].includes(id)).map(labelOf)], ['Planned', ['h2a']], ['Done', ['h1a']]],
    'in the View\'s (manuscript) order within each lane');
  assert.equal(byStatus.lanes.flatMap((l) => l.entryIds).length, arranged.length, 'each Scene in exactly one lane');
  const byPov = lanes(pov.id);
  assert.deepEqual(byPov.lanes.map((l) => [l.name, l.entryIds.map(labelOf)]).filter(([, ids]) => ids.length < 5),
    [['Nerai', ['h1a']], ['Alaric', ['h4a']]]);
  assert.equal(lanes(null), null, 'no grouping: one unnamed band');
  assert.equal(lanes(day.id), null, 'a number is an axis, never a lane');

  // Within a lane, the manuscript axis places each Scene in its Chapter; the number axis by value.
  const laneScenes = byStatus.lanes[0].entryIds;
  assert.deepEqual(shape(timeline.manuscriptLayout(t.index, laneScenes)), ['1-2', 'ch3:h3a', '4-4', 'ch4:h4a,h4b,h4c', 'ch6:h6c']);
  const { placed } = timeline.propertyPlacements(t.properties.find((p) => p.id === day.id), byStatus.lanes[0].entryIds, t.values);
  assert.deepEqual(placed.map((p) => [labelOf(p.id), p.at]), [['h3a', 5], ['h4a', 1]]);
});

test('rows: markers that would overlap stack; those apart share the first row; ties keep their order', () => {
  const rows = timeline.packRows([{ id: 'a', x: 0 }, { id: 'b', x: 0 }, { id: 'c', x: 50 }, { id: 'd', x: 300 }, { id: 'e', x: 170 }], 160, 6);
  assert.deepEqual([...rows.entries()], [['a', 0], ['b', 1], ['c', 2], ['e', 0], ['d', 1]]);
  assert.deepEqual([...timeline.packRows([{ id: 'x', x: 10 }, { id: 'y', x: 500 }], 160).values()], [0, 0]);
  assert.deepEqual([...timeline.packRows([], 160).entries()], []);
  // A hundred at one place: a hundred rows, not a pile; a hundred spread out: one row.
  const pile = timeline.packRows(Array.from({ length: 100 }, (_, i) => ({ id: String(i), x: 0 })), 160);
  assert.equal(Math.max(...pile.values()), 99);
  const spread = timeline.packRows(Array.from({ length: 100 }, (_, i) => ({ id: String(i), x: i * 200 })), 160);
  assert.equal(Math.max(...spread.values()), 0);
});

// ── 6. Regression ──────────────────────────────────────────────────────────────

test('List, Table and Board are exactly as before: defaults, arrangement, grouping; a Timeline beside them changes nothing', async () => {
  const db = await seededDb();
  const synopsis = ok(await sceneProps.createSceneProperty(HOLLOW, 'Synopsis', 'text'));
  let status = ok(await sceneProps.createSceneProperty(HOLLOW, 'Status', 'status'));
  status = ok(await sceneProps.updateSceneProperty(status.id, { options: [{ name: 'Planned' }, { name: 'Done' }] })).property;
  const list = ok(await sceneViewActions.createSceneView(HOLLOW, null, 'list'));
  const table = ok(await sceneViewActions.createSceneView(HOLLOW, null, 'table'));
  const board = ok(await sceneViewActions.createSceneView(HOLLOW, null, 'board'));
  assert.deepEqual(list.config, config({ properties: [synopsis.id, status.id] }));
  assert.deepEqual(table.config, config({ properties: ['words', synopsis.id, status.id] }));
  assert.deepEqual(board.config, config({ group_by: status.id }));
  assert.ok(!('axis' in list.config) && !('axis' in table.config) && !('axis' in board.config), 'no axis key unless a View has one');
  const tl = ok(await sceneViewActions.createSceneView(HOLLOW, null, 'timeline'));
  // A new property joins Lists, Tables and Timelines showing fewer than three, as before; the axis is untouched.
  const pov = ok(await sceneProps.createSceneProperty(HOLLOW, 'POV', 'select'));
  const views = Object.fromEntries((await all(db, `select id, config from public.scene_views`)).map((r) => [r.id, r.config]));
  assert.deepEqual(views[list.id].properties, [synopsis.id, status.id, pov.id]);
  assert.deepEqual(views[table.id].properties, ['words', synopsis.id, status.id, pov.id]);
  assert.deepEqual(views[board.id], config({ properties: [pov.id], group_by: status.id }));
  assert.deepEqual(views[tl.id], config({ properties: [pov.id], axis: 'manuscript' }));
  // A previous app that saves back a config without the axis key: still valid (the Timeline then takes the manuscript).
  assert.equal(ok(await sceneViewActions.updateSceneView(tl.id, { config: config({ properties: [] }) })).config.axis, 'manuscript');
  assert.equal(ok(await sceneViewActions.updateSceneView(list.id, { config: config({ properties: [] }) })).config.axis, undefined);

  const t = await sceneItems(db);
  const plain = t.arrange({ ...list, config: views[list.id] });
  assert.deepEqual(plain, t.ids);
  assert.equal(sceneModel.unplacedStart(t.index, plain, false), 7);
  assert.deepEqual(t.arrange({ ...list, config: config({ sort: { by: 'words', direction: 'desc' }, filters: [{ property: 'placement', op: 'is', value: 'placed' }] }) }).map(labelOf),
    ['h3a', 'h2a', 'h6c', 'h4a', 'h4c', 'h1a', 'h4b']);
  const lanes = viewModel.boardLanes({ ...board, config: views[board.id] }, t.properties, t.values, plain, () => []);
  assert.deepEqual(lanes.lanes.map((l) => [l.name, l.entryIds.length]), [['No status', 11], ['Planned', 0], ['Done', 0]]);
  assert.deepEqual(viewModel.groupableProperties(t.properties).map((p) => p.name), ['Status', 'POV']);
  assert.deepEqual(viewModel.sortableProperties(t.properties).map((p) => p.name), ['Synopsis', 'Status', 'POV', 'Words', 'Placement']);
});
