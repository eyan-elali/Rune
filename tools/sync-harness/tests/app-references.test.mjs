// References, Relationship properties and Backlinks (Rune 2.0 Workspace,
// Milestone 11, migration 028), and the Collection View tabs refinement: the
// REAL actions and loaders against the Rune 2.0 schema in real Postgres + RLS,
// and the pure rules the shell shares (lib/rune2/references.ts,
// lib/rune2/collectionViews.ts).
//
//   * View tabs: saved order, the active View only, `+` appends, reorder and
//     delete never touch an Entry, value or reference
//   * Relationship properties: creation, valid targets, values set / reordered
//     / cleared, cardinality, rename-proof identity, invalid / cross-Collection
//     / cross-Project targets refused, deletion with confirmation
//   * generic references: add, remove, idempotent, never a Relationship value
//   * backlinks: derived from forward rows, appear and disappear with them
//   * opening a linked object: the same canonical id, one tab
//   * ownership isolation; clients only read
//   * the manuscript boundary: Scene rows, content, versions, words and the
//     save path are untouched by every reference operation
//   * permanent deletion of an end removes the reference, never the other end
//
// Data: the synthetic legacy fixture moved into the Rune 2.0 schema. alice
// owns hollow and ash; bram owns tide. In hollow, ch1 holds one Scene (h1a),
// ch4 three (h4a, h4b, h4c); h3b is Unplaced.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, readRepoFile, readMigration, asUser, LEGACY_BASELINE, RUNE2_SCHEMA } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';
import { prototypeLegacyToRune2 } from '../lib/legacy-to-rune2.mjs';
import { migrationsAfterBaseline } from '../build-schema.mjs';
import { USERS, chapterId, pageId, projectId, seedFixture } from '../fixtures/manuscript-fixture.mjs';

const ALICE = USERS.alice.id;
const BRAM = USERS.bram.id;
const HOLLOW = projectId('hollow');
const ASH = projectId('ash');
const TIDE = projectId('tide');

const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const all = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const doc = (...paragraphs) => ({
  type: 'doc',
  content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
});

let legacy;
let refs, props, views, collections, pages, scenes, workspace, manuscriptLoader, refModel, viewModel, propModel, nav, workingSet;
before(async () => {
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
  refs = await bundleForTest('src/lib/actions/workspaceReferences.ts', { name: 'rf_refs' });
  props = await bundleForTest('src/lib/actions/workspaceProperties.ts', { name: 'rf_props' });
  views = await bundleForTest('src/lib/actions/workspaceViews.ts', { name: 'rf_views' });
  collections = await bundleForTest('src/lib/actions/workspaceCollections.ts', { name: 'rf_collections' });
  pages = await bundleForTest('src/lib/actions/workspacePages.ts', { name: 'rf_pages' });
  scenes = await bundleForTest('src/lib/actions/scenes.ts', { name: 'rf_scenes' });
  workspace = await bundleForTest('src/lib/rune2/projectWorkspace.ts', { name: 'rf_loader' });
  manuscriptLoader = await bundleForTest('src/lib/rune2/projectManuscript.ts', { name: 'rf_manuscript' });
  refModel = await bundleForTest('src/lib/rune2/references.ts', { name: 'rf_model' });
  viewModel = await bundleForTest('src/lib/rune2/collectionViews.ts', { name: 'rf_view_model' });
  propModel = await bundleForTest('src/lib/rune2/collectionProperties.ts', { name: 'rf_prop_model' });
  nav = await bundleForTest('src/lib/rune2/navigatorModel.ts', { name: 'rf_nav' });
  workingSet = await bundleForTest('src/lib/rune2/workingSet.ts', { name: 'rf_working_set' });
});

async function seededDb() {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  await prototypeLegacyToRune2(legacy, db);
  return db;
}

function signIn(db, userId) {
  const sb = createSupabaseAdapter(db, { userId });
  for (const mod of [refs, props, views, collections, pages, scenes, workspace, manuscriptLoader]) mod.setServerClient(sb);
  return sb;
}

const ok = (r) => { assert.equal(r.error, null, r.error); return r.data; };
const refused = (r, message) => { assert.equal(r.data, null); if (message) assert.equal(r.error, message); else assert.ok(r.error); };

/**
 * Alice's Hollow: Characters (Nerai, Alaric, Djal), Factions (Drelareth,
 * Aelthyr), a Page "Worldbuilding Notes", and Characters' Relationship
 * properties Affiliation (→ Factions, one), Appears in (→ Scenes, several),
 * Notes (→ Pages, several), Allies (→ Characters, several).
 */
async function hollow(db) {
  signIn(db, ALICE);
  const characters = ok(await collections.createWorkspaceCollection(HOLLOW, 'Characters')).collection;
  const factions = ok(await collections.createWorkspaceCollection(HOLLOW, 'Factions')).collection;
  const nerai = ok(await collections.createCollectionEntry(characters.id, 'Nerai'));
  const alaric = ok(await collections.createCollectionEntry(characters.id, 'Alaric'));
  const djal = ok(await collections.createCollectionEntry(characters.id, 'Djal'));
  const drelareth = ok(await collections.createCollectionEntry(factions.id, 'Drelareth'));
  const aelthyr = ok(await collections.createCollectionEntry(factions.id, 'Aelthyr'));
  const notes = ok(await pages.createWorkspacePage(HOLLOW, 'Worldbuilding Notes'));
  const affiliation = ok(await refs.createRelationshipProperty(characters.id, 'Affiliation', 'entry', factions.id, false));
  const appears = ok(await refs.createRelationshipProperty(characters.id, 'Appears in', 'scene', null, true));
  const pageRel = ok(await refs.createRelationshipProperty(characters.id, 'Notes', 'page', null, true));
  const allies = ok(await refs.createRelationshipProperty(characters.id, 'Allies', 'entry', characters.id, true));
  return { characters, factions, nerai, alaric, djal, drelareth, aelthyr, notes, affiliation, appears, pageRel, allies };
}

async function referenceRows(db, where = 'true', params = []) {
  return all(db, `select * from public.object_references where ${where} order by property_id nulls first, position, id`, params);
}

async function loadedRefs(projectId = HOLLOW) {
  return (await workspace.loadProjectWorkspace(projectId)).references;
}

async function shellIndex(projectId = HOLLOW) {
  const [m, w] = [await manuscriptLoader.loadProjectManuscript(projectId), await workspace.loadProjectWorkspace(projectId)];
  return new Map([...nav.indexManuscript(m), ...nav.indexWorkspace(w.tree, {}, w.entries)]);
}

// ── 1. View tabs ───────────────────────────────────────────────────────────────

test('view tabs: saved order, the active View only, `+` appends, and reorder / delete never touch Entries, values or references', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  ok(await refs.setEntryRelationship(t.nerai.id, t.affiliation.id, [t.drelareth.id]));
  ok(await refs.addObjectReference('page', t.notes.id, 'entry', t.nerai.id));
  const cid = t.characters.id;
  const list = (await all(db, `select * from public.workspace_collection_views where collection_id = $1`, [cid]))[0];

  // `+` → a View at the end of the row.
  const table = ok(await views.createCollectionView(cid, 'Table', 'table'));
  const board = ok(await views.createCollectionView(cid, 'Cast board', 'board'));
  const order = async () => viewModel.viewsOf((await workspace.loadProjectWorkspace(HOLLOW)).views, cid).map((v) => v.name);
  assert.deepEqual(await order(), ['List', 'Table', 'Cast board']);

  // Switching tabs: only which View is active. The first View is active until one is chosen.
  const saved = viewModel.viewsOf((await workspace.loadProjectWorkspace(HOLLOW)).views, cid);
  assert.equal(viewModel.activeView(saved, undefined).id, list.id);
  assert.equal(viewModel.activeView(saved, board.id).id, board.id);
  assert.equal(viewModel.activeView(saved, 'deleted-view').id, list.id, 'a chosen View that is gone falls back to the first');

  const content = async () => ({
    entries: await all(db, `select * from public.workspace_collection_entries order by id`),
    values: await all(db, `select * from public.workspace_entry_values order by entry_id, property_id`),
    properties: await all(db, `select * from public.workspace_collection_properties order by id`),
    references: await referenceRows(db),
  });
  const before = await content();

  // Reordering tabs is the Views' saved order (drag / Alt+arrow → move).
  ok(await views.moveCollectionView(board.id, 0));
  assert.deepEqual(await order(), ['Cast board', 'List', 'Table']);
  ok(await views.moveCollectionView(list.id, 2));
  assert.deepEqual(await order(), ['Cast board', 'Table', 'List']);
  ok(await views.deleteCollectionView(table.id));
  assert.deepEqual(await order(), ['Cast board', 'List']);
  assert.deepEqual(await content(), before, 'no Entry, value, property or reference changed');
});

// ── 2. Relationship properties ─────────────────────────────────────────────────

test('relationship: created with a target and cardinality; the loader reads it; invalid targets are refused', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const row = await one(db, `select type, relation_target, relation_collection_id, relation_many, position from public.workspace_collection_properties where id = $1`, [t.affiliation.id]);
  assert.deepEqual(row, { type: 'relationship', relation_target: 'entry', relation_collection_id: t.factions.id, relation_many: false, position: 1 });
  assert.deepEqual([t.appears.relation_target, t.appears.relation_collection_id, t.appears.relation_many], ['scene', null, true]);
  assert.deepEqual([t.pageRel.relation_target, t.allies.relation_collection_id], ['page', t.characters.id]);

  const loaded = await workspace.loadProjectWorkspace(HOLLOW);
  assert.equal(loaded.referable, true);
  const affiliation = loaded.properties.find((p) => p.id === t.affiliation.id);
  assert.deepEqual(refModel.targetSpecOf(affiliation), { type: 'entry', collectionId: t.factions.id });
  assert.equal(refModel.targetPhrase(affiliation, () => 'Factions'), 'Entries in Factions');
  // Legacy properties read with no relation.
  const role = ok(await props.createCollectionProperty(t.characters.id, 'Role', 'text'));
  const roleLoaded = (await workspace.loadProjectWorkspace(HOLLOW)).properties.find((p) => p.id === role.id);
  assert.deepEqual([roleLoaded.relation_target, roleLoaded.relation_collection_id, roleLoaded.relation_many], [null, null, false]);

  const c = t.characters.id;
  refused(await refs.createRelationshipProperty(c, 'Bad', 'chapter', null, true), 'Unknown relationship target');
  refused(await refs.createRelationshipProperty(c, 'Bad', 'entry', null, true), 'Target collection not found');
  refused(await refs.createRelationshipProperty(c, 'Affiliation', 'page', null, true), 'A property with this name already exists');
  refused(await props.createCollectionProperty(c, 'Via generic', 'relationship'), 'Unknown property type');
  // Another Project's Collection — Alice's own Ash, and Bram's Tide — is never a target.
  const ashC = ok(await collections.createWorkspaceCollection(ASH, 'Ash things')).collection;
  refused(await refs.createRelationshipProperty(c, 'Cross', 'entry', ashC.id, true), 'Target collection not found');
  signIn(db, BRAM);
  const tides = ok(await collections.createWorkspaceCollection(TIDE, 'Tides')).collection;
  refused(await refs.createRelationshipProperty(tides.id, 'Spy', 'entry', t.factions.id, true), 'Target collection not found');
  refused(await refs.createRelationshipProperty(c, 'Spy', 'page', null, true), 'Collection not found');

  // The table itself refuses a relationship without a target, or a target on another type.
  await assert.rejects(db.query(`update public.workspace_collection_properties set relation_target = null where id = $1`, [t.affiliation.id]), /relation_check/);
  await assert.rejects(db.query(`update public.workspace_collection_properties set relation_target = 'page' where id = $1`, [role.id]), /relation_check/);
});

test('relationship values: set, reorder, change and clear by canonical id; the loader and the value map read them in order', async () => {
  const db = await seededDb();
  const t = await hollow(db);

  assert.deepEqual(ok(await refs.setEntryRelationship(t.nerai.id, t.affiliation.id, [t.drelareth.id])), { targets: [t.drelareth.id] });
  ok(await refs.setEntryRelationship(t.nerai.id, t.appears.id, [pageId('h4a'), pageId('h1a'), pageId('h4a')]));
  ok(await refs.setEntryRelationship(t.nerai.id, t.pageRel.id, [t.notes.id]));
  ok(await refs.setEntryRelationship(t.nerai.id, t.allies.id, [t.alaric.id, t.djal.id]));

  let values = refModel.relationshipValues(await loadedRefs());
  assert.deepEqual(values.get(propModel.valueKey(t.nerai.id, t.affiliation.id)), [t.drelareth.id]);
  assert.deepEqual(values.get(propModel.valueKey(t.nerai.id, t.appears.id)), [pageId('h4a'), pageId('h1a')], 'duplicates collapse, first kept');
  assert.deepEqual(values.get(propModel.valueKey(t.nerai.id, t.pageRel.id)), [t.notes.id]);

  // Reorder, change, and each row keeps its identity where its target stays.
  const djalRow = (await referenceRows(db, 'target_entry_id = $1', [t.djal.id]))[0];
  ok(await refs.setEntryRelationship(t.nerai.id, t.allies.id, [t.djal.id, t.alaric.id]));
  assert.deepEqual((await referenceRows(db, 'property_id = $1', [t.allies.id])).map((r) => [r.target_entry_id, r.position]),
    [[t.djal.id, 1], [t.alaric.id, 2]]);
  assert.equal((await referenceRows(db, 'target_entry_id = $1', [t.djal.id]))[0].id, djalRow.id, 'the same reference, moved');
  ok(await refs.setEntryRelationship(t.nerai.id, t.affiliation.id, [t.aelthyr.id]));
  values = refModel.relationshipValues(await loadedRefs());
  assert.deepEqual(values.get(propModel.valueKey(t.nerai.id, t.affiliation.id)), [t.aelthyr.id]);

  // Clear: the references go; the objects they pointed to stay.
  ok(await refs.setEntryRelationship(t.nerai.id, t.allies.id, []));
  assert.equal((await referenceRows(db, 'property_id = $1', [t.allies.id])).length, 0);
  assert.equal((await all(db, `select id from public.workspace_collection_entries where id in ($1, $2)`, [t.alaric.id, t.djal.id])).length, 2);
  values = refModel.relationshipValues(await loadedRefs());
  assert.equal(values.has(propModel.valueKey(t.nerai.id, t.allies.id)), false, 'no value is no entry in the map');

  // Relationship values never live in workspace_entry_values.
  assert.equal((await all(db, `select * from public.workspace_entry_values`)).length, 0);
  refused(await props.setEntryPropertyValue(t.nerai.id, t.affiliation.id, t.drelareth.id), 'Invalid value');
});

test('relationship values: invalid type, wrong Collection, self, cardinality, and other Projects\' or writers\' objects are refused — and nothing changes', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  ok(await refs.setEntryRelationship(t.nerai.id, t.affiliation.id, [t.drelareth.id]));
  const before = await referenceRows(db);

  refused(await refs.setEntryRelationship(t.nerai.id, t.affiliation.id, [t.drelareth.id, t.aelthyr.id]), 'This relationship holds one value');
  refused(await refs.setEntryRelationship(t.nerai.id, t.affiliation.id, [t.alaric.id]), 'Not a valid target');       // a Character, not a Faction
  refused(await refs.setEntryRelationship(t.nerai.id, t.affiliation.id, [t.notes.id]), 'Not a valid target');        // a Page
  refused(await refs.setEntryRelationship(t.nerai.id, t.appears.id, [t.drelareth.id]), 'Not a valid target');        // an Entry, not a Scene
  refused(await refs.setEntryRelationship(t.nerai.id, t.pageRel.id, [pageId('h1a')]), 'Not a valid target');         // a Scene, not a Page
  refused(await refs.setEntryRelationship(t.nerai.id, t.allies.id, [t.nerai.id]), 'An entry cannot point to itself');
  refused(await refs.setEntryRelationship(t.drelareth.id, t.affiliation.id, [t.aelthyr.id]), 'Property not found');  // another Collection's property
  refused(await refs.setEntryRelationship(t.nerai.id, t.affiliation.id, ['00000000-0000-4000-8000-00000000dead']), 'Not a valid target');
  // Cross-Project: Alice's Ash Scene, Bram's Tide Scene.
  refused(await refs.setEntryRelationship(t.nerai.id, t.appears.id, [pageId('a1a')]), 'Not a valid target');
  refused(await refs.setEntryRelationship(t.nerai.id, t.appears.id, [pageId('t1a')]), 'Not a valid target');
  assert.deepEqual(await referenceRows(db), before);

  // The table's own guard, beneath the functions.
  const insert = (extra) => db.query(`insert into public.object_references
      (project_id, source_type, source_entry_id, target_type, target_entry_id, target_scene_id, property_id, position)
      values ($1, 'entry', $2, $3, $4, $5, $6, 9)`, extra);
  await assert.rejects(insert([HOLLOW, t.nerai.id, 'entry', t.alaric.id, null, t.affiliation.id]), /cannot point to that/);
  await assert.rejects(insert([HOLLOW, t.nerai.id, 'entry', t.aelthyr.id, null, t.affiliation.id]), /holds one value/);
  await assert.rejects(insert([HOLLOW, t.nerai.id, 'scene', null, pageId('t1a'), t.appears.id]), /must be in its Project/);
  await assert.rejects(insert([HOLLOW, t.nerai.id, 'entry', t.nerai.id, null, null]), /object_references_not_self/);
  await assert.rejects(insert([HOLLOW, t.drelareth.id, 'entry', t.aelthyr.id, null, t.affiliation.id]), /Not a Relationship property/);
  await assert.rejects(db.query(`update public.object_references set target_entry_id = $1 where property_id = $2`, [t.aelthyr.id, t.affiliation.id]),
    /keeps its source, target and property for life/);
  assert.deepEqual(await referenceRows(db), before);
});

test('relationship: renaming a target (or the source) never breaks the link; its title is always the current one', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  ok(await refs.setEntryRelationship(t.nerai.id, t.affiliation.id, [t.drelareth.id]));
  ok(await refs.setEntryRelationship(t.nerai.id, t.pageRel.id, [t.notes.id]));
  ok(await refs.addObjectReference('entry', t.nerai.id, 'scene', pageId('h4b')));
  const before = await referenceRows(db);

  ok(await collections.renameCollectionEntry(t.drelareth.id, 'The Drelareth Compact'));
  ok(await pages.renameWorkspacePage(t.notes.id, 'World Notes'));
  ok(await collections.renameCollectionEntry(t.nerai.id, 'Nerai of Vharos'));
  await db.query(`update public.scenes set title = 'The Cave' where id = $1`, [pageId('h4b')]);
  assert.deepEqual(await referenceRows(db), before, 'references hold ids only: nothing to update');

  const index = await shellIndex();
  const values = refModel.relationshipValues(await loadedRefs());
  const titleOf = (id) => refModel.describeObject(index, id)?.title;
  const affiliation = (await workspace.loadProjectWorkspace(HOLLOW)).properties.find((p) => p.id === t.affiliation.id);
  assert.equal(propModel.formatValue(affiliation, values.get(propModel.valueKey(t.nerai.id, t.affiliation.id)), titleOf), 'The Drelareth Compact');
  assert.equal(titleOf(t.notes.id), 'World Notes');
  assert.equal(titleOf(pageId('h4b')), `${nav.chapterTitle(index.get(chapterId('hollow.ch4')).title)} · The Cave`);
  const backlinks = refModel.backlinksOf(await loadedRefs(), t.drelareth.id);
  assert.deepEqual(backlinks.map((b) => [b.source.id, b.via]), [[t.nerai.id, [t.affiliation.id]]]);
  assert.equal(titleOf(backlinks[0].source.id), 'Nerai of Vharos');
});

test('relationship: cardinality and target change only without losing a value; deleting the property confirms how many Entries lose it and keeps every target', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  ok(await refs.setEntryRelationship(t.nerai.id, t.allies.id, [t.alaric.id, t.djal.id]));
  ok(await refs.setEntryRelationship(t.alaric.id, t.allies.id, [t.djal.id]));

  refused(await refs.updateRelationshipProperty(t.allies.id, { many: false }), 'Some entries hold more than one');
  refused(await refs.updateRelationshipProperty(t.allies.id, { target: 'page' }), 'Clear its values before changing what it points to');
  refused(await refs.updateRelationshipProperty(t.allies.id, { color: 'red' }), 'Unknown change: color');
  ok(await refs.setEntryRelationship(t.nerai.id, t.allies.id, [t.alaric.id]));
  assert.equal(ok(await refs.updateRelationshipProperty(t.allies.id, { many: false })).relation_many, false);
  const emptyRel = ok(await refs.updateRelationshipProperty(t.pageRel.id, { target: 'entry', target_collection_id: t.factions.id }));
  assert.deepEqual([emptyRel.relation_target, emptyRel.relation_collection_id], ['entry', t.factions.id], 'no values: the target can change');
  // Renaming a Relationship uses the ordinary property rename.
  assert.equal(ok(await props.updateCollectionProperty(t.allies.id, { name: 'Ally' })).property.name, 'Ally');
  refused(await props.updateCollectionProperty(t.allies.id, { type: 'multi_select' }), 'This property’s type can’t be changed');
  refused(await props.updateCollectionProperty(t.affiliation.id, { options: [{ name: 'x' }] }), 'Only a choice property has options');

  // Delete: the confirmed number is the Entries holding a value (Nerai, Alaric).
  const r = await props.deleteCollectionProperty(t.allies.id, 0);
  assert.deepEqual(r, { status: 'confirm', values: 2 });
  assert.deepEqual(await props.deleteCollectionProperty(t.allies.id, 2), { status: 'deleted', deletedValues: 2 });
  assert.equal((await referenceRows(db, 'property_id = $1', [t.allies.id])).length, 0);
  assert.equal((await all(db, `select * from public.workspace_collection_entries where collection_id = $1`, [t.characters.id])).length, 3,
    'every Character stays');
});

test('relationship in Views: joins a Table, filters empty / not empty, never sorts or groups', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const table = ok(await views.createCollectionView(t.characters.id, 'Table', 'table'));
  assert.ok(table.config.properties.includes(t.affiliation.id), 'a Table shows every property');
  const later = ok(await refs.createRelationshipProperty(t.characters.id, 'Rivals', 'entry', t.characters.id, true));
  const reread = await one(db, `select config from public.workspace_collection_views where id = $1`, [table.id]);
  assert.ok(reread.config.properties.includes(later.id), 'a new Relationship joins every Table');

  const cfg = (c) => ({ properties: [], sort: null, filters: [], group_by: null, ...c });
  refused(await views.updateCollectionView(table.id, { config: cfg({ sort: { by: t.affiliation.id, direction: 'asc' } }) }), 'Invalid view configuration');
  refused(await views.updateCollectionView(table.id, { config: cfg({ group_by: t.affiliation.id }) }), 'Invalid view configuration');
  refused(await views.updateCollectionView(table.id, { config: cfg({ filters: [{ property: t.affiliation.id, op: 'is', value: t.drelareth.id }] }) }), 'Invalid view configuration');
  ok(await views.updateCollectionView(table.id, { config: cfg({ filters: [{ property: t.affiliation.id, op: 'is_not_empty' }] }) }));

  ok(await refs.setEntryRelationship(t.nerai.id, t.affiliation.id, [t.drelareth.id]));
  const loaded = await workspace.loadProjectWorkspace(HOLLOW);
  const values = refModel.relationshipValues(loaded.references);
  const properties = propModel.propertiesOf(loaded.properties, t.characters.id);
  const view = viewModel.viewsOf(loaded.views, t.characters.id).find((v) => v.id === table.id);
  const input = { entryIds: [t.nerai.id, t.alaric.id, t.djal.id], properties, values, titleOf: () => '' };
  assert.deepEqual(viewModel.arrangeEntries(view, input), [t.nerai.id]);
  assert.deepEqual(viewModel.arrangeEntries({ ...view, config: cfg({ filters: [{ property: t.affiliation.id, op: 'is_empty' }] }) }, input),
    [t.alaric.id, t.djal.id]);
  assert.ok(!viewModel.sortableProperties(properties).some((p) => p.type === 'relationship'));
  assert.deepEqual(viewModel.filterOpsFor(properties.find((p) => p.id === t.affiliation.id)), ['is_not_empty', 'is_empty']);
  const line = propModel.valueLine(properties.filter((p) => p.id === t.affiliation.id), values, t.nerai.id, () => 'Drelareth');
  assert.deepEqual(line, ['Drelareth']);
});

// ── 3. Generic references and backlinks ────────────────────────────────────────

test('references: add (idempotently), list in order, derive backlinks, remove — and neither object is ever touched', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const objects = async () => ({
    entries: await all(db, `select * from public.workspace_collection_entries order by id`),
    pages: await all(db, `select * from public.workspace_documents order by id`),
    scenes: await all(db, `select * from public.scenes order by id`),
  });
  const before = await objects();

  const a = ok(await refs.addObjectReference('page', t.notes.id, 'entry', t.nerai.id));
  const b = ok(await refs.addObjectReference('page', t.notes.id, 'scene', pageId('h3b')));
  const c = ok(await refs.addObjectReference('scene', pageId('h4a'), 'entry', t.nerai.id));
  const d = ok(await refs.addObjectReference('entry', t.alaric.id, 'page', t.notes.id));
  assert.equal(ok(await refs.addObjectReference('page', t.notes.id, 'entry', t.nerai.id)).id, a.id, 'already linked: the same reference');
  assert.deepEqual([a.position, b.position, c.position, d.position], [1, 2, 1, 1]);
  ok(await refs.setEntryRelationship(t.djal.id, t.allies.id, [t.nerai.id]));

  let loaded = await loadedRefs();
  assert.deepEqual(refModel.relatedOf(loaded, t.notes.id).map((r) => r.target.id), [t.nerai.id, pageId('h3b')]);
  const titles = { [t.notes.id]: 'Worldbuilding Notes', [pageId('h4a')]: 'Chapter 4 · Scene 1', [t.djal.id]: 'Djal' };
  // Nerai is referenced by the Page (a link), a Scene (a link) and Djal (Allies) — each once, saying how.
  assert.deepEqual(refModel.backlinksOf(loaded, t.nerai.id, (id) => titles[id]).map((l) => [l.source.id, l.via]), [
    [pageId('h4a'), [null]],
    [t.djal.id, [t.allies.id]],
    [t.notes.id, [null]],
  ]);
  assert.deepEqual(refModel.backlinksOf(loaded, t.notes.id).map((l) => l.source.id), [t.alaric.id]);
  assert.deepEqual(refModel.backlinksOf(loaded, pageId('h3b')).map((l) => l.source.id), [t.notes.id], 'an Unplaced Scene has backlinks too');
  // The same object referred to two ways shows once, with both.
  ok(await refs.addObjectReference('entry', t.djal.id, 'entry', t.nerai.id));
  loaded = await loadedRefs();
  assert.deepEqual(refModel.backlinksOf(loaded, t.nerai.id).find((l) => l.source.id === t.djal.id).via.sort(), [null, t.allies.id].sort());

  // Remove: the backlink disappears; only generic references can be removed this way.
  ok(await refs.removeObjectReference(a.id));
  loaded = await loadedRefs();
  assert.ok(!refModel.backlinksOf(loaded, t.nerai.id).some((l) => l.source.id === t.notes.id));
  assert.deepEqual(refModel.relatedOf(loaded, t.notes.id).map((r) => r.target.id), [pageId('h3b')]);
  const allyRow = (await referenceRows(db, 'property_id = $1', [t.allies.id]))[0];
  refused(await refs.removeObjectReference(allyRow.id), 'Reference not found');

  refused(await refs.addObjectReference('page', t.notes.id, 'page', t.notes.id), 'An object cannot reference itself');
  refused(await refs.addObjectReference('chapter', chapterId('hollow.ch1'), 'page', t.notes.id), 'Unknown object type');
  refused(await refs.addObjectReference('page', t.notes.id, 'entry', t.notes.id), 'Target not found');   // a Page id called an Entry
  refused(await refs.addObjectReference('page', t.notes.id, 'scene', pageId('a1a')), 'Target not found'); // Alice's other Project
  refused(await refs.addObjectReference('page', t.notes.id, 'scene', pageId('t1a')), 'Target not found'); // Bram's

  assert.deepEqual(await objects(), before, 'no Entry, Page or Scene row changed');
});

test('opening a linked object: the canonical id, a Chapter\'s only Scene as its Chapter, and never a second tab', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const index = await shellIndex();
  const ch1 = chapterId('hollow.ch1');
  const ch4 = chapterId('hollow.ch4');

  assert.equal(refModel.openableId(index, pageId('h1a')), ch1, 'the only Scene of Chapter 1 opens as Chapter 1');
  assert.equal(refModel.openableId(index, pageId('h4b')), pageId('h4b'), 'a Scene of a divided Chapter opens itself');
  assert.equal(refModel.openableId(index, pageId('h3b')), pageId('h3b'), 'an Unplaced Scene opens itself');
  assert.equal(refModel.openableId(index, t.nerai.id), t.nerai.id);
  assert.deepEqual(refModel.describeObject(index, pageId('h1a')), { title: index.get(ch1).title, hint: 'Manuscript', type: 'scene' });
  assert.deepEqual(refModel.describeObject(index, pageId('h3b')).hint, 'Unplaced');
  assert.deepEqual(refModel.describeObject(index, t.nerai.id), { title: 'Nerai', hint: 'Characters', type: 'entry' });
  assert.deepEqual(refModel.describeObject(index, t.notes.id), { title: 'Worldbuilding Notes', hint: 'Page', type: 'page' });

  // The Inspector's subject: a Chapter shown as one piece of writing stands for its Scene.
  assert.deepEqual(refModel.referenceSubject(index, index.get(ch1)), { type: 'scene', id: pageId('h1a') });
  assert.equal(refModel.referenceSubject(index, index.get(ch4)), null);
  assert.equal(refModel.referenceSubject(index, index.get(t.characters.id)), null);

  // Opening through the working set: an object already in a tab goes to that tab.
  let tabs = { tabs: [workingSet.MANUSCRIPT_TAB, t.nerai.id], active: workingSet.MANUSCRIPT_TAB };
  tabs = workingSet.openTab(tabs, refModel.openableId(index, t.nerai.id));
  assert.deepEqual(tabs, { tabs: [workingSet.MANUSCRIPT_TAB, t.nerai.id], active: t.nerai.id });
  tabs = workingSet.navigateTab(tabs, refModel.openableId(index, pageId('h1a')));
  tabs = workingSet.openTab(tabs, refModel.openableId(index, pageId('h1a')));
  assert.deepEqual(tabs.tabs, [workingSet.MANUSCRIPT_TAB, ch1], 'one tab for Chapter 1, however it was reached');

  // The picker: by target, matching title or place, the object itself excluded.
  const factions = refModel.candidates(index, { type: 'entry', collectionId: t.factions.id });
  assert.deepEqual(factions.map((c) => c.title), ['Drelareth', 'Aelthyr']);
  assert.deepEqual(refModel.candidates(index, { type: 'entry', collectionId: t.characters.id }, 'ala').map((c) => c.id), [t.alaric.id]);
  assert.deepEqual(refModel.candidates(index, { type: 'page' }).map((c) => c.id), [t.notes.id]);
  const sceneTargets = refModel.candidates(index, { type: 'scene' });
  assert.ok(sceneTargets.every((c) => c.type === 'scene'));
  assert.equal(sceneTargets.at(-1).hint, 'Unplaced', 'Unplaced Scenes come last');
  const any = refModel.candidates(index, { type: 'any' }, '', new Set([t.nerai.id]));
  assert.ok(!any.some((c) => c.id === t.nerai.id));
  assert.deepEqual(new Set(any.map((c) => c.type)), new Set(['scene', 'entry', 'page']));
});

// ── 4. Ownership ───────────────────────────────────────────────────────────────

test('isolation: another writer can\'t read, set, add or remove a writer\'s references; clients only read', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  ok(await refs.setEntryRelationship(t.nerai.id, t.affiliation.id, [t.drelareth.id]));
  const link = ok(await refs.addObjectReference('page', t.notes.id, 'entry', t.nerai.id));
  const before = await referenceRows(db);

  signIn(db, BRAM);
  assert.deepEqual((await workspace.loadProjectWorkspace(HOLLOW)).references, []);
  refused(await refs.setEntryRelationship(t.nerai.id, t.affiliation.id, []), 'Entry not found');
  refused(await refs.removeObjectReference(link.id), 'Reference not found');
  refused(await refs.addObjectReference('page', t.notes.id, 'entry', t.alaric.id), 'Source not found');
  refused(await refs.updateRelationshipProperty(t.affiliation.id, { many: true }), 'Property not found');
  refused(await refs.createRelationshipProperty(t.characters.id, 'Spy', 'page', null, true), 'Collection not found');
  // Bram's own Page can't point at Alice's objects either.
  const tidePage = ok(await pages.createWorkspacePage(TIDE, 'Tide notes'));
  refused(await refs.addObjectReference('page', tidePage.id, 'entry', t.nerai.id), 'Target not found');
  refused(await refs.addObjectReference('page', tidePage.id, 'scene', pageId('h1a')), 'Target not found');
  ok(await refs.addObjectReference('page', tidePage.id, 'scene', pageId('t1a')));

  for (const sql of [
    [`insert into public.object_references (project_id, source_type, source_document_id, target_type, target_entry_id, position) values ($1, 'page', $2, 'entry', $3, 5)`, [HOLLOW, t.notes.id, t.alaric.id]],
    [`update public.object_references set position = 7 where id = $1`, [link.id]],
    [`delete from public.object_references where id = $1`, [link.id]],
  ]) {
    for (const user of [BRAM, ALICE]) {
      await assert.rejects(asUser(db, user, (tx) => tx.query(...sql)), /permission denied/, `${user === ALICE ? 'owner' : 'other'}: ${sql[0]}`);
    }
  }
  assert.equal((await asUser(db, BRAM, async (tx) => (await tx.query(`select * from public.object_references`)).rows)).length, 1, 'Bram sees only his own');
  assert.equal((await asUser(db, ALICE, async (tx) => (await tx.query(`select * from public.object_references`)).rows)).length, 2);
  assert.deepEqual(await referenceRows(db, 'project_id = $1', [HOLLOW]), before);
});

// ── 5. The manuscript boundary ─────────────────────────────────────────────────

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

test('manuscript boundary: every reference operation leaves every Scene\'s content, version, words and placement — and every total — exactly as it was', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const before = await manuscriptState(db);

  ok(await refs.setEntryRelationship(t.nerai.id, t.appears.id, [pageId('h1a'), pageId('h4a'), pageId('h3b')]));
  const link = ok(await refs.addObjectReference('scene', pageId('h4a'), 'entry', t.nerai.id));
  ok(await refs.addObjectReference('scene', pageId('h3b'), 'page', t.notes.id));
  ok(await refs.addObjectReference('page', t.notes.id, 'scene', pageId('h4b')));
  ok(await refs.setEntryRelationship(t.nerai.id, t.appears.id, [pageId('h4a')]));
  ok(await refs.removeObjectReference(link.id));
  assert.equal((await props.deleteCollectionProperty(t.appears.id, 1)).status, 'deleted');

  assert.deepEqual(await manuscriptState(db), before, 'no manuscript row, version, word count or total changed');
});

test('manuscript boundary: a linked Scene saves through save_scene_checked exactly as before, and its links survive the save', async () => {
  const db = await seededDb();
  signIn(db, BRAM);
  const people = ok(await collections.createWorkspaceCollection(TIDE, 'People')).collection;
  const mara = ok(await collections.createCollectionEntry(people.id, 'Mara'));
  const scenesRel = ok(await refs.createRelationshipProperty(people.id, 'Scenes', 'scene', null, true));
  ok(await refs.setEntryRelationship(mara.id, scenesRel.id, [pageId('t3a')]));
  ok(await refs.addObjectReference('scene', pageId('t3a'), 'entry', mara.id));
  const links = await referenceRows(db);
  const scene = await one(db, `select version, word_count, content from public.scenes where id = $1`, [pageId('t3a')]);

  const r = await scenes.syncSceneWithLimitCheck(pageId('t3a'), doc('The tide came in.'), 4, scene.version);
  assert.equal(r.status, 'ok', JSON.stringify(r));
  assert.equal(r.version, scene.version + 1, 'the version bumps once, as for any save');
  const after = await one(db, `select version, word_count, content from public.scenes where id = $1`, [pageId('t3a')]);
  assert.deepEqual([after.version, after.word_count, after.content], [scene.version + 1, 4, doc('The tide came in.')]);
  assert.equal((await scenes.syncSceneWithLimitCheck(pageId('t3a'), doc('stale'), 1, scene.version)).status, 'version_mismatch',
    'the conflict guard is unchanged');
  assert.deepEqual(await referenceRows(db), links, 'a save never touches a reference');
});

test('permanent deletion of an end removes its references — never the object at the other end', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  ok(await refs.setEntryRelationship(t.nerai.id, t.appears.id, [pageId('h4b'), pageId('h4a')]));
  ok(await refs.addObjectReference('scene', pageId('h4b'), 'entry', t.alaric.id));
  ok(await refs.addObjectReference('page', t.notes.id, 'entry', t.djal.id));
  ok(await refs.addObjectReference('entry', t.djal.id, 'page', t.notes.id));

  // Nothing in the app deletes a Scene or a Page yet (Trash will keep them, and
  // their references dormant); a permanent delete is simulated directly.
  await db.query(`delete from public.scenes where id = $1`, [pageId('h4b')]);
  assert.deepEqual(refModel.relationshipValues(await loadedRefs()).get(propModel.valueKey(t.nerai.id, t.appears.id)), [pageId('h4a')],
    'the value keeps its other target');
  assert.equal((await referenceRows(db, 'source_scene_id = $1 or target_scene_id = $1', [pageId('h4b')])).length, 0);
  await db.query(`delete from public.workspace_nodes where document_id = $1`, [t.notes.id]);
  await db.query(`delete from public.workspace_documents where id = $1`, [t.notes.id]);
  assert.equal((await referenceRows(db, 'source_document_id = $1 or target_document_id = $1', [t.notes.id])).length, 0);
  assert.equal((await all(db, `select id from public.workspace_collection_entries where id in ($1, $2, $3)`, [t.nerai.id, t.alaric.id, t.djal.id])).length, 3,
    'every Entry at the other end stays');

  // Deleting a (necessarily empty) target Collection takes the Relationship that pointed to it — it could hold no value.
  const empty = ok(await collections.createWorkspaceCollection(HOLLOW, 'Places')).collection;
  const home = ok(await refs.createRelationshipProperty(t.characters.id, 'Home', 'entry', empty.id, false));
  ok(await collections.deleteWorkspaceCollection(empty.id));
  assert.equal(await one(db, `select id from public.workspace_collection_properties where id = $1`, [home.id]), undefined);
});

// ── 6. Before 028 ──────────────────────────────────────────────────────────────

test('before migration 028: the loader reports no references and properties load as before', async () => {
  const db = await createTestDb();
  await db.exec(readRepoFile(LEGACY_BASELINE));
  for (const f of migrationsAfterBaseline().filter((f) => f < '028')) await db.exec(readMigration(f));
  await prototypeLegacyToRune2(legacy, db);
  signIn(db, ALICE);
  const c = ok(await collections.createWorkspaceCollection(HOLLOW, 'Characters')).collection;
  const role = ok(await props.createCollectionProperty(c.id, 'Role', 'text'));
  const loaded = await workspace.loadProjectWorkspace(HOLLOW);
  assert.equal(loaded.propertied, true);
  assert.equal(loaded.viewable, true);
  assert.equal(loaded.referable, false);
  assert.deepEqual(loaded.references, []);
  const p = loaded.properties.find((x) => x.id === role.id);
  assert.deepEqual([p.relation_target, p.relation_collection_id, p.relation_many], [null, null, false]);
});
