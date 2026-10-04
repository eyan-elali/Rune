// Table column widths (Rune 2.0, Milestone 15 — the Milestone 14 carry-over;
// migration 034): the ONE width rule every Table uses (lib/rune2/collectionViews.ts)
// and the widths saved with a View, for a Collection's Table and the
// Manuscript's Scene Table alike, through the REAL actions against the Rune
// 2.0 schema in real Postgres + RLS.
//
//   * defaults per field type (never "as wide as the page"), min / max clamping
//   * widths persist per saved View (two Tables of one owner keep their own)
//   * the database refuses widths out of range, fractional, non-numeric, or
//     for a field the owner doesn't have; deleting a property prunes its width
//   * a View without widths (every View before 034, and every default) stays
//     valid and unchanged: renaming it, re-saving its config, a property
//     change — and the previous app's shape of config — all still work
//   * Collection and Scene Tables share the one implementation
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, readRepoFile, LEGACY_BASELINE, RUNE2_SCHEMA } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';
import { prototypeLegacyToRune2 } from '../lib/legacy-to-rune2.mjs';
import { USERS, projectId, seedFixture } from '../fixtures/manuscript-fixture.mjs';

const ALICE = USERS.alice.id;
const BRAM = USERS.bram.id;
const HOLLOW = projectId('hollow');

let legacy, collections, colProps, colViews, sceneProps, sceneViews, workspace, model;
before(async () => {
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
  collections = await bundleForTest('src/lib/actions/workspaceCollections.ts', { name: 'cw_collections' });
  colProps = await bundleForTest('src/lib/actions/workspaceProperties.ts', { name: 'cw_col_props' });
  colViews = await bundleForTest('src/lib/actions/workspaceViews.ts', { name: 'cw_col_views' });
  sceneProps = await bundleForTest('src/lib/actions/sceneProperties.ts', { name: 'cw_scene_props' });
  sceneViews = await bundleForTest('src/lib/actions/sceneViews.ts', { name: 'cw_scene_views' });
  workspace = await bundleForTest('src/lib/rune2/projectWorkspace.ts', { name: 'cw_loader' });
  model = await bundleForTest('src/lib/rune2/collectionViews.ts', { name: 'cw_model' });
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
  for (const mod of [collections, colProps, colViews, sceneProps, sceneViews, workspace]) mod.setServerClient(sb);
  return sb;
}

const ok = (r) => { assert.equal(r.error, null, r.error); return r.data; };

// ── 1. The one width rule ────────────────────────────────────────────────────

test('defaults per type — never the whole page — and clamping to 80–640', () => {
  const p = (type, extra = {}) => ({ id: `p-${type}`, name: type, type, ...extra });
  assert.equal(model.defaultColumnWidth(model.TITLE_COLUMN), 260);
  assert.deepEqual(
    ['text', 'number', 'select', 'status', 'multi_select', 'date', 'checkbox', 'relationship'].map((t) => model.defaultColumnWidth(p(t))),
    [220, 104, 150, 150, 200, 136, 96, 200]);
  assert.equal(model.defaultColumnWidth(p('number', { native: true })), 96, "a Scene's words");
  assert.equal(model.defaultColumnWidth(p('select', { native: true })), 120, "a Scene's placement");
  assert.equal(model.clampColumnWidth(12), model.COLUMN_MIN_WIDTH);
  assert.equal(model.clampColumnWidth(5000), model.COLUMN_MAX_WIDTH);
  assert.equal(model.clampColumnWidth(201.6), 202);

  const view = (widths) => ({ id: 'v', collection_id: 'c', config: { properties: [], sort: null, filters: [], group_by: null, ...(widths && { widths }) } });
  assert.equal(model.columnWidth(view(), p('text')), 220, 'no widths saved (a View from before 034): the default');
  assert.equal(model.columnWidth(view({ 'p-text': 300 }), p('text')), 300);
  assert.equal(model.columnWidth(view({ 'p-text': 9999 }), p('text')), 640, 'a stored width is shown within bounds');
  assert.equal(model.columnWidth(view({ title: 180 }), model.TITLE_COLUMN), 180);

  const config = { properties: ['a'], sort: null, filters: [], group_by: null };
  const wider = model.withColumnWidth(config, 'a', 1000);
  assert.deepEqual(wider, { ...config, widths: { a: 640 } });
  assert.deepEqual(model.withColumnWidth(wider, 'a', null), { ...config, widths: {} }, 'back to the default');
  assert.deepEqual(config, { properties: ['a'], sort: null, filters: [], group_by: null }, 'never mutates');
});

// ── 2. Collection Tables ─────────────────────────────────────────────────────

async function characters(db) {
  const collection = ok(await collections.createWorkspaceCollection(HOLLOW, 'Characters')).collection;
  const role = ok(await colProps.createCollectionProperty(collection.id, 'Role', 'text'));
  const age = ok(await colProps.createCollectionProperty(collection.id, 'Age', 'number'));
  const table = ok(await colViews.createCollectionView(collection.id, 'Cast', 'table'));
  return { collection, role, age, table, db };
}

test('Collection Table: widths persist with the View, per View, and survive a re-read', async () => {
  const db = await seededDb();
  const { collection, role, age, table } = await characters(db);
  assert.equal(table.config.widths, undefined, 'a new View has no widths: every column its default');
  const saved = ok(await colViews.updateCollectionView(table.id, {
    config: model.withColumnWidth(model.withColumnWidth(table.config, role.id, 320), model.TITLE_COLUMN, 180),
  }));
  assert.deepEqual(saved.config.widths, { [role.id]: 320, title: 180 });
  const other = ok(await colViews.createCollectionView(collection.id, 'Ages', 'table'));
  ok(await colViews.updateCollectionView(other.id, { config: model.withColumnWidth(other.config, role.id, 100) }));

  const read = await workspace.loadProjectWorkspace(HOLLOW);
  const byId = new Map(read.views.map((v) => [v.id, v]));
  assert.deepEqual(byId.get(table.id).config.widths, { [role.id]: 320, title: 180 }, 'kept after a refresh');
  assert.deepEqual(byId.get(other.id).config.widths, { [role.id]: 100 }, 'each View its own');
  assert.equal(model.columnWidth(byId.get(table.id), age), 104, 'an unsized column keeps its default');
  // Only configuration changed: no Entry or value was written.
  assert.equal((await db.query(`select count(*)::int n from public.workspace_entry_values`)).rows[0].n, 0);
});

test('Collection Table: the database enforces the bounds and the owner’s fields; deleting a property prunes its width', async () => {
  const db = await seededDb();
  const { role, age, table } = await characters(db);
  for (const bad of [{ [role.id]: 79 }, { [role.id]: 641 }, { [role.id]: 200.5 }, { [role.id]: '200' }, { 'not-a-field': 200 }, []]) {
    const r = await colViews.updateCollectionView(table.id, { config: { ...table.config, widths: bad } });
    assert.equal(r.error, 'Invalid view configuration', JSON.stringify(bad));
  }
  for (const edge of [80, 640]) ok(await colViews.updateCollectionView(table.id, { config: { ...table.config, widths: { [role.id]: edge } } }));
  ok(await colViews.updateCollectionView(table.id, { config: { ...table.config, widths: { [role.id]: 300, [age.id]: 90 } } }));
  const del = await colProps.deleteCollectionProperty(age.id, 0);
  assert.equal(del.status, 'deleted');
  const after = (await db.query(`select config from public.workspace_collection_views where id = $1`, [table.id])).rows[0].config;
  assert.deepEqual(after.widths, { [role.id]: 300 }, "the deleted property's width is gone, the rest kept");
  // Another writer can't size alice's View.
  signIn(db, BRAM);
  const r = await colViews.updateCollectionView(table.id, { config: { ...table.config, widths: { [role.id]: 200 } } });
  assert.equal(r.error, 'View not found');
});

test('a View without widths stays valid and unchanged: rename, re-save, a property change, and the previous app’s config shape', async () => {
  const db = await seededDb();
  const { collection, table } = await characters(db);
  const stored = async () => (await db.query(`select config from public.workspace_collection_views where id = $1`, [table.id])).rows[0].config;
  const before = await stored();
  assert.ok(!('widths' in before));
  ok(await colViews.updateCollectionView(table.id, { name: 'Renamed' }));
  assert.deepEqual(await stored(), before, 'renaming leaves the config exactly as it was');
  ok(await colViews.updateCollectionView(table.id, { config: before }));
  assert.deepEqual(await stored(), before, 'the config the previous app sends is accepted as it is');
  const status = ok(await colProps.createCollectionProperty(collection.id, 'Status', 'select'));
  const withStatus = await stored();
  assert.ok(withStatus.properties.includes(status.id), 'the property trigger still adds the new column');
  assert.ok(!('widths' in withStatus), 'and adds no widths');
  // A config with widths, re-sent by an app that spreads what it read, keeps them.
  ok(await colViews.updateCollectionView(table.id, { config: { ...withStatus, widths: { [status.id]: 180 } } }));
  const read = await stored();
  ok(await colViews.updateCollectionView(table.id, { config: { ...read, sort: { by: 'title', direction: 'desc' } } }));
  assert.deepEqual((await stored()).widths, { [status.id]: 180 });
});

// ── 3. Scene Tables ──────────────────────────────────────────────────────────

test('Scene Table: widths for the name, a Scene property and the read-only words / placement persist per View', async () => {
  const db = await seededDb();
  const sceneRows = async () => (await db.query(`select * from public.scenes order by id`)).rows;
  const scenesBefore = await sceneRows();
  const synopsis = ok(await sceneProps.createSceneProperty(HOLLOW, 'Synopsis', 'text'));
  const table = ok(await sceneViews.createSceneView(HOLLOW, 'Outline', 'table'));
  assert.deepEqual(table.config.properties, ['words', synopsis.id]);
  const config = [['title', 300], [synopsis.id, 420], ['words', 80], ['placement', 110]]
    .reduce((c, [k, w]) => model.withColumnWidth(c, k, w), table.config);
  const saved = ok(await sceneViews.updateSceneView(table.id, { config }));
  assert.deepEqual(saved.config.widths, { title: 300, [synopsis.id]: 420, words: 80, placement: 110 });
  const second = ok(await sceneViews.createSceneView(HOLLOW, 'Second', 'table'));
  assert.equal(second.config.widths, undefined, 'another View of the same Scenes has its own (none yet)');

  const read = await workspace.loadProjectWorkspace(HOLLOW);
  const view = read.sceneViews.find((v) => v.id === table.id);
  assert.equal(model.columnWidth(view, synopsis), 420);
  assert.equal(model.columnWidth(read.sceneViews.find((v) => v.id === second.id), synopsis), 220);

  const bad = await sceneViews.updateSceneView(table.id, { config: { ...config, widths: { ...config.widths, words: 700 } } });
  assert.equal(bad.error, 'Invalid view configuration');
  const unknown = await sceneViews.updateSceneView(table.id, { config: { ...config, widths: { nope: 100 } } });
  assert.equal(unknown.error, 'Invalid view configuration');
  // Deleting the Scene property prunes its width; words, placement and the name keep theirs.
  const del = await sceneProps.deleteSceneProperty(synopsis.id, 0);
  assert.equal(del.status, 'deleted');
  const after = (await db.query(`select config from public.scene_views where id = $1`, [table.id])).rows[0].config;
  assert.deepEqual(after.widths, { title: 300, words: 80, placement: 110 });
  assert.deepEqual(await sceneRows(), scenesBefore, 'no Scene row (prose, words, version, placement) was written');
});

test('the one TableView serves both owners: Collection and Scene Tables use the same width rule and resizer', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../../src/components/rune2/CollectionViewBodies.tsx', import.meta.url), 'utf8');
  assert.equal((src.match(/function ColumnResizer\(/g) ?? []).length, 1);
  assert.match(src, /columnWidth\(view, field\)/);
  const views = fs.readFileSync(new URL('../../../src/components/rune2/CollectionView.tsx', import.meta.url), 'utf8');
  const scenes = fs.readFileSync(new URL('../../../src/components/rune2/ManuscriptScenes.tsx', import.meta.url), 'utf8');
  for (const [name, s] of [['CollectionView', views], ['ManuscriptScenes', scenes]]) {
    assert.match(s, /import \{[^}]*\bTableView\b[^}]*\} from "\.\/CollectionViewBodies"/, `${name} imports the shared TableView`);
    assert.match(s, /<TableView /, `${name} renders it`);
  }
});
