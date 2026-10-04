// Collection Views (Rune 2.0 Workspace, Milestone 10, migration 027): the
// REAL View actions and the Workspace loader against the Rune 2.0 schema in
// real Postgres + RLS, and the pure arrangement rules List, Table and Board
// share (lib/rune2/collectionViews.ts).
//
//   * a default List for every Collection: new ones, and the backfill from
//     shown_in_list
//   * create, rename, retype, reorder, delete — never the last View
//   * config: shown properties, sort, filters, grouping — only ever this
//     Collection's properties and options; pruned when properties change
//   * deleting a View never touches an Entry, property, value or body
//   * one Entry, many Views: List, Table and Board read the same values, and
//     moving a Board card is a value write
//   * ownership isolation; Pages, Folders, the tree and the manuscript unchanged
//
// Data: the synthetic legacy fixture moved into the Rune 2.0 schema.
// alice owns hollow and ash; bram owns tide.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, readRepoFile, readMigration, asUser, LEGACY_BASELINE, RUNE2_SCHEMA } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';
import { prototypeLegacyToRune2 } from '../lib/legacy-to-rune2.mjs';
import { migrationsAfterBaseline } from '../build-schema.mjs';
import { USERS, projectId, seedFixture } from '../fixtures/manuscript-fixture.mjs';

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

let legacy;
let views, props, collections, pages, tree, workspace, model, propModel;
before(async () => {
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
  views = await bundleForTest('src/lib/actions/workspaceViews.ts', { name: 'cv_views' });
  props = await bundleForTest('src/lib/actions/workspaceProperties.ts', { name: 'cv_props' });
  collections = await bundleForTest('src/lib/actions/workspaceCollections.ts', { name: 'cv_collections' });
  pages = await bundleForTest('src/lib/actions/workspacePages.ts', { name: 'cv_pages' });
  tree = await bundleForTest('src/lib/actions/workspaceTree.ts', { name: 'cv_tree' });
  workspace = await bundleForTest('src/lib/rune2/projectWorkspace.ts', { name: 'cv_loader' });
  model = await bundleForTest('src/lib/rune2/collectionViews.ts', { name: 'cv_model' });
  propModel = await bundleForTest('src/lib/rune2/collectionProperties.ts', { name: 'cv_prop_model' });
});

async function seededDb() {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  await prototypeLegacyToRune2(legacy, db);
  return db;
}

function signIn(db, userId) {
  const sb = createSupabaseAdapter(db, { userId });
  for (const mod of [views, props, collections, pages, tree, workspace]) mod.setServerClient(sb);
  return sb;
}

const ok = (r) => { assert.equal(r.error, null, r.error); return r.data; };
const saved = (r) => { assert.equal(r.status, 'ok', JSON.stringify(r)); return r; };

/** A Collection's Views as [name, type, position] from the table. */
async function viewList(db, collectionId) {
  return (await all(db, `select name, type, position from public.workspace_collection_views
                          where collection_id = $1 order by position`, [collectionId]))
    .map((v) => [v.name, v.type, v.position]);
}
const viewRow = async (db, id) => one(db, `select * from public.workspace_collection_views where id = $1`, [id]);
const viewsOfDb = async (db, collectionId) =>
  all(db, `select * from public.workspace_collection_views where collection_id = $1 order by position`, [collectionId]);

/**
 * Alice's Hollow: Characters (Nerai, Alaric, Djal) with Role (text), Status
 * (status: Alive, Dead), Affiliation (select: Drelareth, Aelthyr), Age
 * (number), Tags (multi-select: Mage, Exile); and Places (Cave) with its own
 * Kind (select: Natural).
 */
async function hollow(db) {
  signIn(db, ALICE);
  const characters = ok(await collections.createWorkspaceCollection(HOLLOW, 'Characters'));
  const cid = characters.collection.id;
  const nerai = ok(await collections.createCollectionEntry(cid, 'Nerai'));
  const alaric = ok(await collections.createCollectionEntry(cid, 'Alaric'));
  const djal = ok(await collections.createCollectionEntry(cid, 'Djal'));
  const role = ok(await props.createCollectionProperty(cid, 'Role', 'text'));
  let status = ok(await props.createCollectionProperty(cid, 'Status', 'status'));
  status = ok(await props.updateCollectionProperty(status.id, { options: [{ name: 'Alive' }, { name: 'Dead' }] })).property;
  let affiliation = ok(await props.createCollectionProperty(cid, 'Affiliation', 'select'));
  affiliation = ok(await props.updateCollectionProperty(affiliation.id, { options: [{ name: 'Drelareth' }, { name: 'Aelthyr' }] })).property;
  const age = ok(await props.createCollectionProperty(cid, 'Age', 'number'));
  let tags = ok(await props.createCollectionProperty(cid, 'Tags', 'multi_select'));
  tags = ok(await props.updateCollectionProperty(tags.id, { options: [{ name: 'Mage' }, { name: 'Exile' }] })).property;
  const places = ok(await collections.createWorkspaceCollection(HOLLOW, 'Places'));
  const cave = ok(await collections.createCollectionEntry(places.collection.id, 'Cave'));
  let kind = ok(await props.createCollectionProperty(places.collection.id, 'Kind', 'select'));
  kind = ok(await props.updateCollectionProperty(kind.id, { options: [{ name: 'Natural' }] })).property;
  const opt = (p, name) => p.options.find((o) => o.name === name).id;
  const list = (await viewsOfDb(db, cid))[0];
  return { characters, cid, nerai, alaric, djal, role, status, affiliation, age, tags, places, cave, kind, opt, list };
}

const config = (c = {}) => ({ properties: [], sort: null, filters: [], group_by: null, ...c });

// ── 1. The default List ────────────────────────────────────────────────────────

test('default: every new Collection opens in one List View; new properties join it up to three', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  assert.deepEqual(await viewList(db, t.cid), [['List', 'list', 1]]);
  assert.deepEqual(await viewList(db, t.places.collection.id), [['List', 'list', 1]]);
  assert.equal(t.list.project_id, HOLLOW);
  // Role, Status, Affiliation joined the List as they were created; Age and Tags did not.
  assert.deepEqual(t.list.config, config({ properties: [t.role.id, t.status.id, t.affiliation.id] }));

  const loaded = await workspace.loadProjectWorkspace(HOLLOW);
  assert.equal(loaded.viewable, true);
  assert.deepEqual(model.viewsOf(loaded.views, t.cid).map((v) => [v.name, v.type, v.id]), [['List', 'list', t.list.id]]);
});

test('backfill: 027 gives every existing Collection a List showing exactly its shown_in_list properties, in order', async () => {
  // A database at 026 with Collections and properties, then 027.
  const db = await createTestDb();
  await db.exec(readRepoFile(LEGACY_BASELINE));
  for (const f of migrationsAfterBaseline().filter((f) => f < '027')) await db.exec(readMigration(f));
  await prototypeLegacyToRune2(legacy, db);
  signIn(db, ALICE);
  const c = ok(await collections.createWorkspaceCollection(HOLLOW, 'Characters'));
  const empty = ok(await collections.createWorkspaceCollection(HOLLOW, 'Places'));
  const nerai = ok(await collections.createCollectionEntry(c.collection.id, 'Nerai'));
  const role = ok(await props.createCollectionProperty(c.collection.id, 'Role', 'text'));
  const age = ok(await props.createCollectionProperty(c.collection.id, 'Age', 'number'));
  const born = ok(await props.createCollectionProperty(c.collection.id, 'Born', 'date'));
  const pov = ok(await props.createCollectionProperty(c.collection.id, 'POV', 'checkbox'));
  ok(await props.updateCollectionProperty(age.id, { shown_in_list: false }));
  ok(await props.updateCollectionProperty(pov.id, { shown_in_list: true }));
  ok(await props.moveCollectionProperty(pov.id, 0));
  ok(await props.setEntryPropertyValue(nerai.id, role.id, 'Protagonist'));
  const snapshot = async () => ({
    collections: await all(db, `select * from public.workspace_collections order by id`),
    entries: await all(db, `select * from public.workspace_collection_entries order by id`),
    properties: await all(db, `select * from public.workspace_collection_properties order by id`),
    values: await all(db, `select * from public.workspace_entry_values order by entry_id, property_id`),
  });
  const beforeRows = await snapshot();

  await db.exec(readMigration('027_collection_views.sql'));

  assert.deepEqual(await snapshot(), beforeRows, 'no Collection, Entry, property or value changed');
  const [list] = await viewsOfDb(db, c.collection.id);
  assert.deepEqual([list.name, list.type, list.position], ['List', 'list', 1]);
  assert.deepEqual(list.config, config({ properties: [pov.id, role.id, born.id] }), 'shown_in_list, in property order');
  assert.deepEqual((await viewsOfDb(db, empty.collection.id)).map((v) => [v.name, v.config]), [['List', config()]]);
  assert.equal((await one(db, `select count(*)::int as n from public.workspace_collection_views`)).n, 2);
});

// ── 2. Saved Views ─────────────────────────────────────────────────────────────

test('views: create each type with sensible defaults; rename; retype; reorder; positions stay 1..n', async () => {
  const db = await seededDb();
  const t = await hollow(db);

  const table = ok(await views.createCollectionView(t.cid, 'All characters', 'table'));
  assert.deepEqual([table.name, table.type, table.position], ['All characters', 'table', 2]);
  assert.deepEqual(table.config.properties, [t.role.id, t.status.id, t.affiliation.id, t.age.id, t.tags.id], 'a Table shows every property');

  const board = ok(await views.createCollectionView(t.cid, null, 'board'));
  assert.equal(board.name, 'Board', 'a blank name takes the type');
  assert.equal(board.config.group_by, t.status.id, 'a Board groups by the first status property');
  assert.deepEqual(board.config.properties, []);

  const list = ok(await views.createCollectionView(t.cid, '  Main cast  ', 'list'));
  assert.equal(list.name, 'Main cast');
  assert.deepEqual(list.config.properties, [t.role.id, t.status.id, t.affiliation.id]);

  assert.equal((await views.createCollectionView(t.cid, 'X', 'calendar')).error, 'Unknown view type');
  assert.equal((await views.createCollectionView(MISSING, 'X', 'list')).error, 'Collection not found');

  // Rename.
  assert.equal(ok(await views.updateCollectionView(board.id, { name: 'By Status' })).name, 'By Status');
  assert.equal((await views.updateCollectionView(board.id, { name: '  ' })).error, 'A view needs a name');
  assert.equal((await views.updateCollectionView(board.id, { position: 1 })).error, 'Unknown change: position');
  assert.equal(ok(await views.updateCollectionView(board.id, { name: 'y'.repeat(300) })).name.length, 100);
  ok(await views.updateCollectionView(board.id, { name: 'By Status' }));

  // Retype: a List becoming a Board takes a grouping; the config is otherwise kept.
  const retyped = ok(await views.updateCollectionView(list.id, { type: 'board' }));
  assert.equal(retyped.config.group_by, t.status.id);
  assert.deepEqual(retyped.config.properties, [t.role.id, t.status.id, t.affiliation.id]);
  ok(await views.updateCollectionView(list.id, { type: 'list' }));

  // Reorder.
  assert.deepEqual(await viewList(db, t.cid), [['List', 'list', 1], ['All characters', 'table', 2], ['By Status', 'board', 3], ['Main cast', 'list', 4]]);
  ok(await views.moveCollectionView(list.id, 0));
  ok(await views.moveCollectionView(t.list.id, 99));
  assert.deepEqual(await viewList(db, t.cid), [['Main cast', 'list', 1], ['All characters', 'table', 2], ['By Status', 'board', 3], ['List', 'list', 4]]);
  // The other Collection's Views are untouched.
  assert.deepEqual(await viewList(db, t.places.collection.id), [['List', 'list', 1]]);

  // The loader sees exactly this, in order.
  const loaded = await workspace.loadProjectWorkspace(HOLLOW);
  assert.deepEqual(model.viewsOf(loaded.views, t.cid).map((v) => v.name), ['Main cast', 'All characters', 'By Status', 'List']);
});

test('views: the last View can\'t be deleted; deleting another closes the order', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  assert.equal((await views.deleteCollectionView(t.list.id)).error, 'A collection keeps at least one view');
  assert.deepEqual(await viewList(db, t.cid), [['List', 'list', 1]]);

  const table = ok(await views.createCollectionView(t.cid, 'Table', 'table'));
  const board = ok(await views.createCollectionView(t.cid, 'Board', 'board'));
  ok(await views.deleteCollectionView(table.id));
  assert.deepEqual(await viewList(db, t.cid), [['List', 'list', 1], ['Board', 'board', 2]]);
  // The first one can go while another remains.
  ok(await views.deleteCollectionView(t.list.id));
  assert.deepEqual(await viewList(db, t.cid), [['Board', 'board', 1]]);
  assert.equal((await views.deleteCollectionView(board.id)).error, 'A collection keeps at least one view');
  assert.equal((await views.deleteCollectionView(MISSING)).error, 'View not found');
});

test('safety: deleting Views never touches an Entry, its body, a property or a value', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  saved(await collections.saveCollectionEntryContent(t.nerai.id, doc('Nerai was born under the ash.'), 1));
  ok(await props.setEntryPropertyValue(t.nerai.id, t.role.id, 'Protagonist'));
  ok(await props.setEntryPropertyValue(t.nerai.id, t.status.id, t.opt(t.status, 'Alive')));
  ok(await props.setEntryPropertyValue(t.alaric.id, t.affiliation.id, t.opt(t.affiliation, 'Aelthyr')));
  ok(await props.setEntryPropertyValue(t.djal.id, t.tags.id, [t.opt(t.tags, 'Mage')]));
  const table = ok(await views.createCollectionView(t.cid, 'Table', 'table'));
  const board = ok(await views.createCollectionView(t.cid, 'Board', 'board'));
  const snapshot = async () => ({
    collections: await all(db, `select * from public.workspace_collections order by id`),
    entries: await all(db, `select * from public.workspace_collection_entries order by id`),
    properties: await all(db, `select * from public.workspace_collection_properties order by id`),
    values: await all(db, `select * from public.workspace_entry_values order by entry_id, property_id`),
    nodes: await all(db, `select * from public.workspace_nodes order by id`),
  });
  const beforeRows = await snapshot();

  ok(await views.deleteCollectionView(table.id));
  ok(await views.deleteCollectionView(t.list.id));
  assert.equal((await views.deleteCollectionView(board.id)).error, 'A collection keeps at least one view');

  assert.deepEqual(await snapshot(), beforeRows, 'every Collection, Entry, body, property, value and node is exactly as it was');
  assert.equal((await one(db, `select content from public.workspace_collection_entries where id = $1`, [t.nerai.id])).content.content[0].content[0].text,
    'Nerai was born under the ash.');
});

// ── 3. Config ──────────────────────────────────────────────────────────────────

test('config: visible properties, sort, filters and grouping are saved as given, and read back by the loader', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const c = config({
    properties: [t.age.id, t.role.id],
    sort: { by: t.age.id, direction: 'desc' },
    filters: [
      { property: t.status.id, op: 'is', value: t.opt(t.status, 'Alive') },
      { property: t.tags.id, op: 'is_not', value: t.opt(t.tags, 'Exile') },
      { property: t.role.id, op: 'is_not_empty' },
    ],
    group_by: t.affiliation.id,
  });
  const v = ok(await views.updateCollectionView(t.list.id, { config: c }));
  assert.deepEqual(v.config, c);
  // Missing keys are filled in; title is always sortable.
  const sorted = ok(await views.updateCollectionView(t.list.id, { config: { sort: { by: 'title', direction: 'asc' } } }));
  assert.deepEqual(sorted.config, config({ sort: { by: 'title', direction: 'asc' } }));
  ok(await views.updateCollectionView(t.list.id, { config: c }));

  signIn(db, ALICE);
  const loaded = await workspace.loadProjectWorkspace(HOLLOW);
  assert.deepEqual(loaded.views.find((x) => x.id === t.list.id).config, c);
});

test('config: another Collection\'s property or option, unknown ids and malformed shapes are refused — by the action and directly', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const beforeRow = await viewRow(db, t.list.id);
  const refused = async (c, why) => {
    assert.equal((await views.updateCollectionView(t.list.id, { config: c })).error, 'Invalid view configuration', why);
    assert.equal((await views.createCollectionView(t.cid, 'X', 'table', c)).error, 'Invalid view configuration', why);
  };
  const natural = t.opt(t.kind, 'Natural');
  await refused(config({ properties: [t.kind.id] }), 'another Collection\'s property shown');
  await refused(config({ properties: [MISSING] }), 'an unknown property');
  await refused(config({ sort: { by: t.kind.id, direction: 'asc' } }), 'sort by another Collection\'s property');
  await refused(config({ sort: { by: t.tags.id, direction: 'asc' } }), 'sort by a multi-select');
  await refused(config({ sort: { by: 'title', direction: 'sideways' } }), 'bad direction');
  await refused(config({ group_by: t.kind.id }), 'group by another Collection\'s property');
  await refused(config({ group_by: t.tags.id }), 'group by a multi-select');
  await refused(config({ group_by: t.role.id }), 'group by text');
  await refused(config({ filters: [{ property: t.kind.id, op: 'is_empty' }] }), 'filter on another Collection\'s property');
  await refused(config({ filters: [{ property: t.status.id, op: 'is', value: natural }] }), 'another property\'s option');
  await refused(config({ filters: [{ property: t.status.id, op: 'is', value: 'Alive' }] }), 'an option name, not an id');
  await refused(config({ filters: [{ property: t.role.id, op: 'is', value: 'x' }] }), '"is" on text');
  await refused(config({ filters: [{ property: t.status.id, op: 'contains', value: 'x' }] }), 'unknown op');
  await refused(config({ filters: [{ property: t.status.id, op: 'is_empty', value: 'x' }] }), 'a value on is_empty');
  await refused(config({ properties: [t.role.id, t.role.id] }), 'duplicates');
  await refused({ ...config(), colour: 'red' }, 'unknown key');
  await refused(config({ properties: 'all' }), 'not a list');
  assert.deepEqual(await viewRow(db, t.list.id), beforeRow, 'nothing changed');

  // Not directly either: the check holds for any write, and clients can't write at all.
  await assert.rejects(db.query(`update public.workspace_collection_views set config = jsonb_set(config, '{properties}', $2) where id = $1`,
    [t.list.id, JSON.stringify([t.kind.id])]), /Invalid view configuration/);
  await assert.rejects(db.query(`update public.workspace_collection_views set collection_id = $2 where id = $1`,
    [t.list.id, t.places.collection.id]), /cannot move to another Collection|violates foreign key/);
});

test('config: removing a property, removing an option or changing a type prunes every View that named it', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const alive = t.opt(t.status, 'Alive');
  const dead = t.opt(t.status, 'Dead');
  const c = config({
    properties: [t.role.id, t.age.id, t.affiliation.id],
    sort: { by: t.affiliation.id, direction: 'asc' },
    filters: [
      { property: t.status.id, op: 'is', value: dead },
      { property: t.status.id, op: 'is_not', value: alive },
      { property: t.age.id, op: 'is_empty' },
    ],
    group_by: t.affiliation.id,
  });
  const table = ok(await views.createCollectionView(t.cid, 'Table', 'table', c));
  const board = ok(await views.createCollectionView(t.cid, 'Board', 'board'));
  assert.equal(board.config.group_by, t.status.id);

  // An option removed: the filters on it go.
  ok(await props.updateCollectionProperty(t.status.id, { options: [{ id: alive, name: 'Alive' }] }));
  assert.deepEqual((await viewRow(db, table.id)).config.filters, [
    { property: t.status.id, op: 'is_not', value: alive },
    { property: t.age.id, op: 'is_empty' },
  ]);

  // Select → multi-select: no longer groupable or sortable.
  ok(await props.updateCollectionProperty(t.affiliation.id, { type: 'multi_select' }));
  let now = (await viewRow(db, table.id)).config;
  assert.equal(now.group_by, null);
  assert.equal(now.sort, null);
  assert.deepEqual(now.properties, [t.role.id, t.age.id, t.affiliation.id], 'still shown');

  // A property removed: every reference goes, from every View.
  assert.equal((await props.deleteCollectionProperty(t.age.id, 0)).status, 'deleted');
  now = (await viewRow(db, table.id)).config;
  assert.deepEqual(now.properties, [t.role.id, t.affiliation.id]);
  assert.deepEqual(now.filters, [{ property: t.status.id, op: 'is_not', value: alive }]);
  assert.equal((await props.deleteCollectionProperty(t.status.id, 0)).status, 'deleted');
  assert.equal((await viewRow(db, board.id)).config.group_by, null, 'the Board lost its grouping');
  assert.deepEqual((await viewRow(db, table.id)).config.filters, []);

  // A new status property becomes the grouping of a Board without one, and joins Tables.
  const stage = ok(await props.createCollectionProperty(t.cid, 'Stage', 'status'));
  assert.equal((await viewRow(db, board.id)).config.group_by, stage.id);
  assert.ok((await viewRow(db, table.id)).config.properties.includes(stage.id));
  // The List showed two (Status went), so Stage joins it; a List showing three would not grow.
  assert.deepEqual((await viewRow(db, t.list.id)).config.properties, [t.role.id, t.affiliation.id, stage.id]);
  ok(await props.createCollectionProperty(t.cid, 'Motto', 'text'));
  assert.deepEqual((await viewRow(db, t.list.id)).config.properties, [t.role.id, t.affiliation.id, stage.id]);

  // Every View is still valid: an unrelated edit to each succeeds.
  for (const v of await viewsOfDb(db, t.cid)) ok(await views.updateCollectionView(v.id, { name: v.name }));
  // The Places Collection's View was never touched.
  assert.deepEqual((await viewsOfDb(db, t.places.collection.id))[0].config, config({ properties: [t.kind.id] }));
});

test('collection lifecycle: an empty Collection still deletes, its Views with it; deleting a Project removes its Views', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const empty = ok(await collections.createWorkspaceCollection(HOLLOW, 'Empty'));
  const p = ok(await props.createCollectionProperty(empty.collection.id, 'Stage', 'status'));
  ok(await views.createCollectionView(empty.collection.id, 'Board', 'board'));
  assert.ok(p);
  ok(await collections.deleteWorkspaceCollection(empty.collection.id));
  assert.equal((await one(db, `select count(*)::int as n from public.workspace_collection_views where collection_id = $1`, [empty.collection.id])).n, 0);

  const t = await hollow(db);
  ok(await views.createCollectionView(t.cid, 'Table', 'table'));
  await db.query(`delete from public.projects where id = $1`, [HOLLOW]);
  assert.equal((await one(db, `select count(*)::int as n from public.workspace_collection_views where project_id = $1`, [HOLLOW])).n, 0);
});

// ── 4. One Entry, many Views ───────────────────────────────────────────────────

test('one Entry, many Views: a value set once shows in List, Table and Board; a Board move is a value write', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const alive = t.opt(t.status, 'Alive');
  const dead = t.opt(t.status, 'Dead');
  const table = ok(await views.createCollectionView(t.cid, 'Table', 'table'));
  const board = ok(await views.createCollectionView(t.cid, null, 'board'));
  const byAffiliation = ok(await views.createCollectionView(t.cid, 'By Affiliation', 'board',
    config({ group_by: t.affiliation.id })));

  // Edited "in the Table": one value row, one Entry.
  ok(await props.setEntryPropertyValue(t.nerai.id, t.role.id, 'Protagonist'));
  ok(await props.setEntryPropertyValue(t.nerai.id, t.status.id, alive));
  ok(await props.setEntryPropertyValue(t.alaric.id, t.affiliation.id, t.opt(t.affiliation, 'Aelthyr')));

  const present = async () => {
    signIn(db, ALICE);
    const w = await workspace.loadProjectWorkspace(HOLLOW);
    const values = propModel.indexValues(w.values);
    const properties = propModel.propertiesOf(w.properties, t.cid);
    const titles = new Map(w.entries.map((e) => [e.id, e.title]));
    const input = { entryIds: w.entries.filter((e) => e.collection_id === t.cid).map((e) => e.id), properties, values, titleOf: (id) => titles.get(id) };
    const v = (id) => w.views.find((x) => x.id === id);
    const lanes = (id) => model.boardLanes(v(id), properties, values, model.arrangeEntries(v(id), input))
      .lanes.map((l) => [l.name, l.entryIds.map((e) => titles.get(e))]);
    return {
      list: model.arrangeEntries(v(t.list.id), input).map((id) => [titles.get(id), propModel.valueLine(model.shownProperties(v(t.list.id), properties), values, id)]),
      table: model.arrangeEntries(v(table.id), input).map((id) => [titles.get(id), ...model.shownProperties(v(table.id), properties).map((p) => propModel.formatValue(p, values.get(propModel.valueKey(id, p.id))))]),
      board: lanes(board.id),
      affiliation: lanes(byAffiliation.id),
    };
  };

  let seen = await present();
  assert.deepEqual(seen.list, [['Nerai', ['Protagonist', 'Alive']], ['Alaric', ['Aelthyr']], ['Djal', []]]);
  assert.deepEqual(seen.table, [
    ['Nerai', 'Protagonist', 'Alive', null, null, null],
    ['Alaric', null, null, 'Aelthyr', null, null],
    ['Djal', null, null, null, null, null],
  ]);
  assert.deepEqual(seen.board, [['No status', ['Alaric', 'Djal']], ['Alive', ['Nerai']], ['Dead', []]]);
  assert.deepEqual(seen.affiliation, [['No Affiliation', ['Nerai', 'Djal']], ['Drelareth', []], ['Aelthyr', ['Alaric']]]);

  // Moving Djal to "Dead" on the Board is exactly one value write; moving
  // Nerai to "No status" clears hers.
  const valuesBefore = await all(db, `select entry_id, property_id, value from public.workspace_entry_values order by entry_id, property_id`);
  ok(await props.setEntryPropertyValue(t.djal.id, t.status.id, dead));
  ok(await props.setEntryPropertyValue(t.nerai.id, t.status.id, null));
  const valuesAfter = await all(db, `select entry_id, property_id, value from public.workspace_entry_values order by entry_id, property_id`);
  assert.equal(valuesAfter.length, valuesBefore.length, 'one added, one cleared');
  assert.deepEqual((await one(db, `select value from public.workspace_entry_values where entry_id = $1 and property_id = $2`, [t.djal.id, t.status.id])).value, dead);

  seen = await present();
  assert.deepEqual(seen.board, [['No status', ['Nerai', 'Alaric']], ['Alive', []], ['Dead', ['Djal']]]);
  assert.deepEqual(seen.list.find(([n]) => n === 'Djal'), ['Djal', ['Dead']], 'the List shows the move');
  assert.deepEqual(seen.table.find(([n]) => n === 'Djal')[2], 'Dead', 'the Table shows the move');
  // There is still one Entry each, and no View holds a copy of anything.
  assert.equal((await one(db, `select count(*)::int as n from public.workspace_collection_entries where collection_id = $1`, [t.cid])).n, 3);
  const cols = (await all(db, `select column_name from information_schema.columns where table_name = 'workspace_collection_views' order by ordinal_position`)).map((r) => r.column_name);
  assert.deepEqual(cols, ['id', 'collection_id', 'project_id', 'name', 'type', 'position', 'config', 'created_at', 'updated_at']);
});

// ── 5. Isolation ───────────────────────────────────────────────────────────────

test('isolation: another writer can\'t read, create, change, move or delete a writer\'s Views; clients only read', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const table = ok(await views.createCollectionView(t.cid, 'Table', 'table'));
  const beforeRows = await all(db, `select * from public.workspace_collection_views order by id`);

  signIn(db, BRAM);
  const seen = await workspace.loadProjectWorkspace(HOLLOW);
  assert.deepEqual(seen.views, []);
  assert.equal((await views.createCollectionView(t.cid, 'Spy', 'list')).error, 'Collection not found');
  assert.equal((await views.updateCollectionView(table.id, { name: 'Mine' })).error, 'View not found');
  assert.equal((await views.moveCollectionView(table.id, 0)).error, 'View not found');
  assert.equal((await views.deleteCollectionView(table.id)).error, 'View not found');

  for (const sql of [
    [`insert into public.workspace_collection_views (collection_id, project_id, name, type, position) values ($1, $2, 'X', 'list', 9)`, [t.cid, HOLLOW]],
    [`update public.workspace_collection_views set name = 'X' where id = $1`, [table.id]],
    [`delete from public.workspace_collection_views where id = $1`, [table.id]],
  ]) {
    for (const user of [BRAM, ALICE]) {
      await assert.rejects(asUser(db, user, (tx) => tx.query(...sql)), /permission denied/, `${user === ALICE ? 'owner' : 'other'}: ${sql[0]}`);
    }
  }
  assert.deepEqual(await asUser(db, BRAM, async (tx) => (await tx.query(`select * from public.workspace_collection_views`)).rows), []);
  assert.equal((await asUser(db, ALICE, async (tx) => (await tx.query(`select * from public.workspace_collection_views`)).rows)).length, 3);

  // Bram's own Collection works, and his config can't name Alice's property.
  const tides = ok(await collections.createWorkspaceCollection(TIDE, 'Tides'));
  const bramTable = ok(await views.createCollectionView(tides.collection.id, 'Table', 'table'));
  assert.equal((await views.updateCollectionView(bramTable.id, { config: config({ properties: [t.role.id] }) })).error, 'Invalid view configuration');

  assert.deepEqual(await all(db, `select * from public.workspace_collection_views where project_id = $1 order by id`, [HOLLOW]), beforeRows);
});

// ── 6. Arrangement rules (pure) ────────────────────────────────────────────────

test('arrangement: filters AND together; sort by title, number, date, select order, checkbox; empties last; ties keep creation order', () => {
  const P = (id, type, options = []) => ({ id, collection_id: 'c', project_id: 'p', name: id, type, options, position: 1, shown_in_list: false });
  const status = P('status', 'status', [{ id: 'a', name: 'Planned' }, { id: 'b', name: 'Drafting' }, { id: 'c', name: 'Done' }]);
  const tags = P('tags', 'multi_select', [{ id: 'm', name: 'Mage' }, { id: 'x', name: 'Exile' }]);
  const age = P('age', 'number');
  const born = P('born', 'date');
  const pov = P('pov', 'checkbox');
  const role = P('role', 'text');
  const properties = [status, tags, age, born, pov, role];
  const titles = { e1: 'Nerai', e2: 'alaric', e3: 'Djal', e4: 'Untitled', e5: 'Bram 10', e6: 'Bram 9' };
  const raw = {
    e1: { status: 'b', tags: ['m'], age: 30, born: '1402-03-12', pov: true, role: 'Hero' },
    e2: { status: 'a', tags: ['m', 'x'], age: 45, born: '1380-01-01' },
    e3: { status: 'c', age: 30 },
    e4: { status: 'gone' },
    e5: { tags: ['x'], age: -2, born: '1402-03-12' },
    e6: {},
  };
  const values = new Map();
  for (const [e, vs] of Object.entries(raw)) for (const [p, v] of Object.entries(vs)) values.set(propModel.valueKey(e, p), v);
  const input = { entryIds: Object.keys(titles), properties, values, titleOf: (id) => titles[id] };
  const view = (c) => ({ id: 'v', collection_id: 'c', project_id: 'p', name: 'V', type: 'table', position: 1, config: config(c), created_at: '', updated_at: '' });
  const arrange = (c) => model.arrangeEntries(view(c), input);

  assert.deepEqual(arrange({}), ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'], 'no sort: creation order');
  assert.deepEqual(arrange({ sort: { by: 'title', direction: 'asc' } }), ['e2', 'e6', 'e5', 'e3', 'e1', 'e4'], 'title: case-insensitive, numeric');
  assert.deepEqual(arrange({ sort: { by: 'title', direction: 'desc' } }), ['e4', 'e1', 'e3', 'e5', 'e6', 'e2']);
  assert.deepEqual(arrange({ sort: { by: 'age', direction: 'asc' } }), ['e5', 'e1', 'e3', 'e2', 'e4', 'e6'], 'numbers; ties keep order; empties last');
  assert.deepEqual(arrange({ sort: { by: 'age', direction: 'desc' } }), ['e2', 'e1', 'e3', 'e5', 'e4', 'e6'], 'empties last in descending too');
  assert.deepEqual(arrange({ sort: { by: 'born', direction: 'asc' } }), ['e2', 'e1', 'e5', 'e3', 'e4', 'e6']);
  assert.deepEqual(arrange({ sort: { by: 'status', direction: 'asc' } }), ['e2', 'e1', 'e3', 'e4', 'e5', 'e6'], 'option order; an unknown option is empty');
  assert.deepEqual(arrange({ sort: { by: 'pov', direction: 'asc' } }), ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'], 'checked first');
  assert.deepEqual(arrange({ sort: { by: 'tags', direction: 'asc' } }), ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'], 'a multi-select never sorts');

  assert.deepEqual(arrange({ filters: [{ property: 'status', op: 'is', value: 'b' }] }), ['e1']);
  assert.deepEqual(arrange({ filters: [{ property: 'status', op: 'is_not', value: 'b' }] }), ['e2', 'e3', 'e4', 'e5', 'e6']);
  assert.deepEqual(arrange({ filters: [{ property: 'status', op: 'is_empty' }] }), ['e4', 'e5', 'e6'], 'an unknown option is empty');
  assert.deepEqual(arrange({ filters: [{ property: 'tags', op: 'is', value: 'x' }] }), ['e2', 'e5'], 'multi-select "is" = includes');
  assert.deepEqual(arrange({ filters: [{ property: 'pov', op: 'is_not_empty' }] }), ['e1'], 'checked');
  assert.deepEqual(arrange({ filters: [{ property: 'pov', op: 'is_empty' }] }), ['e2', 'e3', 'e4', 'e5', 'e6'], 'unchecked');
  assert.deepEqual(arrange({ filters: [{ property: 'role', op: 'is_not_empty' }] }), ['e1']);
  assert.deepEqual(arrange({
    filters: [{ property: 'tags', op: 'is', value: 'm' }, { property: 'age', op: 'is_not_empty' }],
    sort: { by: 'age', direction: 'desc' },
  }), ['e2', 'e1'], 'AND, then sort');
  assert.deepEqual(arrange({ filters: [{ property: 'missing', op: 'is_empty' }], sort: { by: 'missing', direction: 'asc' } }),
    ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'], 'unknown references are skipped');

  // Board: the empty lane first, then options in order; a non-groupable property gives no board.
  const lanes = model.boardLanes(view({ group_by: 'status' }), properties, values, arrange({ sort: { by: 'title', direction: 'asc' } }));
  assert.deepEqual(lanes.lanes.map((l) => [l.optionId, l.name, l.entryIds]),
    [[null, 'No status', ['e6', 'e5', 'e4']], ['a', 'Planned', ['e2']], ['b', 'Drafting', ['e1']], ['c', 'Done', ['e3']]]);
  assert.equal(model.boardLanes(view({ group_by: 'tags' }), properties, values, []), null);
  assert.equal(model.boardLanes(view({ group_by: null }), properties, values, []), null);
  assert.deepEqual(model.groupableProperties(properties).map((p) => p.id), ['status']);
  assert.deepEqual(model.sortableProperties(properties).map((p) => p.id), ['status', 'age', 'born', 'pov', 'role']);
});

test('view helpers: shown/hidden properties, config edits, names, the pre-027 List', () => {
  const P = (id, position, shown = false) => ({ id, collection_id: 'c', project_id: 'p', name: id.toUpperCase(), type: 'text', options: [], position, shown_in_list: shown });
  const properties = [P('a', 1, true), P('b', 2), P('c', 3, true)];
  const v = { id: 'v', collection_id: 'c', project_id: 'p', name: 'T', type: 'table', position: 1, config: config({ properties: ['c', 'gone', 'a'] }), created_at: '', updated_at: '' };
  assert.deepEqual(model.shownProperties(v, properties).map((p) => p.id), ['c', 'a']);
  assert.deepEqual(model.hiddenProperties(v, properties).map((p) => p.id), ['b']);
  assert.deepEqual(model.withPropertyShown(config({ properties: ['a'] }), 'b', true).properties, ['a', 'b']);
  assert.deepEqual(model.withPropertyShown(config({ properties: ['a', 'b'] }), 'a', false).properties, ['b']);
  assert.deepEqual(model.withPropertyMoved(config({ properties: ['a', 'b', 'c'] }), 'c', -1).properties, ['a', 'c', 'b']);
  assert.deepEqual(model.withPropertyMoved(config({ properties: ['a', 'b', 'c'] }), 'a', -1).properties, ['a', 'b', 'c']);
  assert.equal(model.newViewName('board', { name: 'Status' }), 'By Status');
  assert.equal(model.newViewName('table', undefined), 'Table');
  const fallback = model.fallbackListView('c', properties);
  assert.deepEqual([fallback.id, fallback.type, fallback.config.properties], ['list:c', 'list', ['a', 'c']]);
  assert.deepEqual(propModel.valueLine([], new Map(), 'e'), []);
});

// ── 7. Everything else is unchanged ────────────────────────────────────────────

async function manuscriptState(db) {
  return {
    projects: await all(db, `select id, word_count, updated_at from public.projects order by id`),
    manuscripts: await all(db, `select * from public.manuscripts order by id`),
    groups: await all(db, `select * from public.manuscript_groups order by id`),
    chapters: await all(db, `select * from public.chapters order by id`),
    scenes: await all(db, `select * from public.scenes order by id`),
    sessions: await all(db, `select * from public.writing_sessions order by id`),
    accountTotal: await asUser(db, ALICE, async (tx) => (await tx.query(`select public.account_word_total() as n`)).rows[0].n),
  };
}

test('Pages, Folders, Collections, Entries, properties, values, the tree and the manuscript are untouched by every View operation', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const ideas = ok(await pages.createWorkspacePage(HOLLOW, 'Ideas'));
  saved(await pages.saveWorkspacePageContent(ideas.id, doc('page body'), 1));
  ok(await tree.createWorkspaceFolder(HOLLOW, 'Research'));
  const t = await hollow(db);
  saved(await collections.saveCollectionEntryContent(t.nerai.id, doc('A long entry about Nerai.'), 1));
  ok(await props.setEntryPropertyValue(t.nerai.id, t.status.id, t.opt(t.status, 'Alive')));
  const snapshot = async () => ({
    manuscript: await manuscriptState(db),
    pages: await all(db, `select * from public.workspace_documents order by id`),
    folders: await all(db, `select * from public.workspace_folders order by id`),
    collections: await all(db, `select * from public.workspace_collections order by id`),
    entries: await all(db, `select * from public.workspace_collection_entries order by id`),
    properties: await all(db, `select * from public.workspace_collection_properties order by id`),
    values: await all(db, `select * from public.workspace_entry_values order by entry_id, property_id`),
    nodes: await all(db, `select * from public.workspace_nodes order by id`),
  });
  const beforeRows = await snapshot();

  const table = ok(await views.createCollectionView(t.cid, 'Table', 'table'));
  const board = ok(await views.createCollectionView(t.cid, 'Board', 'board'));
  ok(await views.updateCollectionView(table.id, { name: 'All', config: config({ properties: [t.age.id], sort: { by: 'title', direction: 'desc' } }) }));
  ok(await views.updateCollectionView(board.id, { type: 'list' }));
  ok(await views.moveCollectionView(board.id, 0));
  ok(await views.deleteCollectionView(table.id));
  ok(await views.deleteCollectionView(t.list.id));

  assert.deepEqual(await snapshot(), beforeRows, 'no manuscript, Page, Folder, Collection, Entry, property, value or node row changed');
});

test('before migration 027: the loader reports no Views, and Collections, properties and Entries work as in Milestone 9', async () => {
  const db = await seededDb();
  await db.exec(`drop trigger workspace_collections_default_view on public.workspace_collections;
                 drop trigger workspace_collection_properties_views_added on public.workspace_collection_properties;
                 drop trigger workspace_collection_properties_views_changed on public.workspace_collection_properties;
                 drop trigger workspace_collection_properties_views_removed on public.workspace_collection_properties;
                 drop table public.workspace_collection_views;`);
  signIn(db, ALICE);
  const c = ok(await collections.createWorkspaceCollection(HOLLOW, 'Characters'));
  const nerai = ok(await collections.createCollectionEntry(c.collection.id, 'Nerai'));
  const role = ok(await props.createCollectionProperty(c.collection.id, 'Role', 'text'));
  ok(await props.setEntryPropertyValue(nerai.id, role.id, 'Protagonist'));
  const loaded = await workspace.loadProjectWorkspace(HOLLOW);
  assert.equal(loaded.propertied, true);
  assert.equal(loaded.viewable, false);
  assert.deepEqual(loaded.views, []);
  const list = model.fallbackListView(c.collection.id, propModel.propertiesOf(loaded.properties, c.collection.id));
  assert.deepEqual(list.config.properties, [role.id]);
});
