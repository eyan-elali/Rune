// Scene Properties and Scene Views (Rune 2.0, Milestone 14, migration 032): the
// REAL actions and loaders against the Rune 2.0 schema in real Postgres + RLS,
// and the pure rules the shell shares (lib/rune2/collectionViews.ts,
// lib/rune2/sceneViews.ts, lib/rune2/references.ts).
//
//   * Scene property definitions: create (every type), rename, reorder, lossless
//     type changes, options, delete with a confirmed count; invalid input refused
//   * values: set / clear for every type, invalid values refused; a Relationship
//     is references (one / several), never a stored value
//   * isolation: another writer, another Manuscript's property, clients only read
//   * Scene → Entry: one canonical Entry, backlinks derived, generic-link calls
//     never touch a Scene value, dormant in Trash, back on restore, gone only
//     with permanent deletion (never the other end)
//   * Scene Views: create / defaults / config validation and pruning, the
//     read-only fields, manuscript order, Unplaced, filters (incl. contains,
//     greater / less, Relationship includes), sort, Board grouping by Status
//     and by a Relationship; the same engine still serves Collections
//   * Board movement changes the property value, never the manuscript order
//   * the prose boundary: no metadata operation writes a Scene row (content,
//     words, version, updated_at, placement); the Scene save path saves on the
//     same version afterwards; Trash keeps and restores the metadata
//
// Data: the synthetic legacy fixture moved into the Rune 2.0 schema. alice owns
// hollow; bram owns tide. hollow's reading order: ch1 (h1a), ch2 (h2a), ch3
// (h3a), ch5 (none), ch4 (h4a, h4b, h4c), ch6 (h6c); Unplaced: h3b, h3c, h6a, h6b.
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

const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const all = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const doc = (...paragraphs) => ({
  type: 'doc',
  content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
});

let legacy;
let sceneProps, sceneViewActions, refs, collections, pages, trash, scenes, colViews, colProps, workspace, manuscriptLoader;
let viewModel, sceneModel, refModel, propModel, nav;
before(async () => {
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
  sceneProps = await bundleForTest('src/lib/actions/sceneProperties.ts', { name: 'sp_props' });
  sceneViewActions = await bundleForTest('src/lib/actions/sceneViews.ts', { name: 'sp_views' });
  refs = await bundleForTest('src/lib/actions/workspaceReferences.ts', { name: 'sp_refs' });
  collections = await bundleForTest('src/lib/actions/workspaceCollections.ts', { name: 'sp_collections' });
  pages = await bundleForTest('src/lib/actions/workspacePages.ts', { name: 'sp_pages' });
  trash = await bundleForTest('src/lib/actions/workspaceTrash.ts', { name: 'sp_trash' });
  scenes = await bundleForTest('src/lib/actions/scenes.ts', { name: 'sp_scenes' });
  colViews = await bundleForTest('src/lib/actions/workspaceViews.ts', { name: 'sp_col_views' });
  colProps = await bundleForTest('src/lib/actions/workspaceProperties.ts', { name: 'sp_col_props' });
  workspace = await bundleForTest('src/lib/rune2/projectWorkspace.ts', { name: 'sp_loader' });
  manuscriptLoader = await bundleForTest('src/lib/rune2/projectManuscript.ts', { name: 'sp_manuscript' });
  viewModel = await bundleForTest('src/lib/rune2/collectionViews.ts', { name: 'sp_view_model' });
  sceneModel = await bundleForTest('src/lib/rune2/sceneViews.ts', { name: 'sp_scene_model' });
  refModel = await bundleForTest('src/lib/rune2/references.ts', { name: 'sp_ref_model' });
  propModel = await bundleForTest('src/lib/rune2/collectionProperties.ts', { name: 'sp_prop_model' });
  nav = await bundleForTest('src/lib/rune2/navigatorModel.ts', { name: 'sp_nav' });
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
  for (const mod of [sceneProps, sceneViewActions, refs, collections, pages, trash, scenes, colViews, colProps, workspace, manuscriptLoader]) {
    mod.setServerClient(sb);
  }
  return sb;
}

const ok = (r) => { assert.equal(r.error, null, r.error); return r.data; };
const refused = (r, message) => { assert.equal(r.data, null); if (message) assert.equal(r.error, message); else assert.ok(r.error); };

/** Every Scene row of the Project, exactly: the prose boundary compares these. */
const sceneRows = (db) => all(db, `select s.* from public.scenes s join public.manuscripts m on m.id = s.manuscript_id
  where m.project_id = $1 order by s.id`, [HOLLOW]);
const manuscriptId = async (db, projectId = HOLLOW) => (await one(db, `select id from public.manuscripts where project_id = $1`, [projectId])).id;

/** The manuscript as the shell shows it: each Chapter's Scenes in order, Unplaced, and the totals. */
async function shown(projectId = HOLLOW) {
  const m = await manuscriptLoader.loadProjectManuscript(projectId);
  const chaptersOf = [];
  const visit = (nodes) => nodes.forEach((n) => (n.kind === 'group' ? visit(n.children) : chaptersOf.push([n.chapter.id, n.chapter.scenes.map((s) => s.id)])));
  visit(m.outline);
  return { chapters: chaptersOf, unplaced: m.unplaced.map((s) => s.id), manuscriptWords: m.manuscriptWords, unplacedWords: m.unplacedWords };
}

async function shellIndex(projectId = HOLLOW) {
  const [m, w] = [await manuscriptLoader.loadProjectManuscript(projectId), await workspace.loadProjectWorkspace(projectId)];
  return new Map([...nav.indexManuscript(m), ...nav.indexWorkspace(w.tree, {}, w.entries)]);
}

/**
 * Alice's Hollow, as in the acceptance flows: Characters (Nerai, Alaric),
 * Locations (Cave, Var-Zal), and Scene properties Synopsis (text), Status
 * (status: Planned, Drafting, Needs Revision, Done), Characters (→
 * Characters, several) and Location (→ Locations, one).
 */
async function hollow(db) {
  signIn(db, ALICE);
  const characters = ok(await collections.createWorkspaceCollection(HOLLOW, 'Characters')).collection;
  const locations = ok(await collections.createWorkspaceCollection(HOLLOW, 'Locations')).collection;
  const nerai = ok(await collections.createCollectionEntry(characters.id, 'Nerai'));
  const alaric = ok(await collections.createCollectionEntry(characters.id, 'Alaric'));
  const cave = ok(await collections.createCollectionEntry(locations.id, 'Cave'));
  const varZal = ok(await collections.createCollectionEntry(locations.id, 'Var-Zal'));
  const synopsis = ok(await sceneProps.createSceneProperty(HOLLOW, 'Synopsis', 'text'));
  let status = ok(await sceneProps.createSceneProperty(HOLLOW, 'Status', 'status'));
  status = ok(await sceneProps.updateSceneProperty(status.id, {
    options: [{ name: 'Planned' }, { name: 'Drafting' }, { name: 'Needs Revision' }, { name: 'Done' }],
  })).property;
  const opt = Object.fromEntries(status.options.map((o) => [o.name, o.id]));
  const cast = ok(await sceneProps.createSceneRelationshipProperty(HOLLOW, 'Characters', 'entry', characters.id, true));
  const location = ok(await sceneProps.createSceneRelationshipProperty(HOLLOW, 'Location', 'entry', locations.id, false));
  return { characters, locations, nerai, alaric, cave, varZal, synopsis, status, opt, cast, location };
}

// ── 1. Definitions ─────────────────────────────────────────────────────────────

test('definitions: every beta type, owned by the Manuscript, ordered, renamed, reordered; invalid input refused', async () => {
  const db = await seededDb();
  const mid = await manuscriptId(db);
  const types = ['text', 'number', 'select', 'multi_select', 'status', 'date', 'checkbox'];
  const made = [];
  for (const t of types) made.push(ok(await sceneProps.createSceneProperty(HOLLOW, `P ${t}`, t)));
  const characters = ok(await collections.createWorkspaceCollection(HOLLOW, 'Characters')).collection;
  made.push(ok(await sceneProps.createSceneRelationshipProperty(HOLLOW, 'Cast', 'entry', characters.id, true)));

  assert.deepEqual(made.map((p) => [p.type, p.position, p.manuscript_id, p.project_id]),
    [...types, 'relationship'].map((t, i) => [t, i + 1, mid, HOLLOW]));
  assert.deepEqual([made[7].relation_target, made[7].relation_collection_id, made[7].relation_many], ['entry', characters.id, true]);

  // The loader reads them (and the Collection properties stay separate).
  const w = await workspace.loadProjectWorkspace(HOLLOW);
  assert.equal(w.scenePropertied, true);
  assert.equal(w.manuscriptId, mid);
  assert.deepEqual(propModel.propertiesOf(w.sceneProperties, mid).map((p) => p.name), made.map((p) => p.name));
  assert.equal(propModel.propertiesOf(w.properties, mid).length, 0);
  assert.ok(propModel.isSceneProperty(w.sceneProperties[0]));

  // Rename, reorder, lossless type change.
  ok(await sceneProps.updateSceneProperty(made[0].id, { name: 'Synopsis' }));
  ok(await sceneProps.moveSceneProperty(made[0].id, 7));
  const order = (await all(db, `select name from public.scene_property_definitions where manuscript_id = $1 order by position`, [mid])).map((r) => r.name);
  assert.equal(order.at(-1), 'Synopsis');
  assert.equal(ok(await sceneProps.updateSceneProperty(made[2].id, { type: 'status' })).property.type, 'status');

  refused(await sceneProps.createSceneProperty(HOLLOW, '  ', 'text'), 'A property needs a name');
  refused(await sceneProps.createSceneProperty(HOLLOW, 'synopsis', 'text'), 'A property with this name already exists');
  refused(await sceneProps.createSceneProperty(HOLLOW, 'Formula', 'formula'), 'Unknown property type');
  refused(await sceneProps.createSceneProperty(HOLLOW, 'Rel', 'relationship'), 'Unknown property type');
  refused(await sceneProps.createSceneRelationshipProperty(HOLLOW, 'Bad', 'entry', null, true), 'Target collection not found');
  refused(await sceneProps.createSceneRelationshipProperty(HOLLOW, 'Bad', 'chapter', null, true), 'Unknown relationship target');
  refused(await sceneProps.updateSceneProperty(made[0].id, { type: 'number' }), 'This property’s type can’t be changed');
  refused(await sceneProps.updateSceneProperty(made[0].id, { many: true }), 'Only a relationship points somewhere');
  refused(await sceneProps.updateSceneProperty(made[0].id, { shown_in_list: true }), 'Unknown change: shown_in_list');
});

// ── 2. Values ──────────────────────────────────────────────────────────────────

test('values: set and clear every type on a Scene; invalid values refused; no Scene row is ever written', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const number = ok(await sceneProps.createSceneProperty(HOLLOW, 'Story day', 'number'));
  const date = ok(await sceneProps.createSceneProperty(HOLLOW, 'Written on', 'date'));
  const check = ok(await sceneProps.createSceneProperty(HOLLOW, 'Has a twist', 'checkbox'));
  let threads = ok(await sceneProps.createSceneProperty(HOLLOW, 'Threads', 'multi_select'));
  threads = ok(await sceneProps.updateSceneProperty(threads.id, { options: [{ name: 'Hollows' }, { name: 'Oath' }] })).property;
  const before = await sceneRows(db);
  const S = pageId('h4a');

  assert.equal(ok(await sceneProps.setScenePropertyValue(S, t.synopsis.id, '  Nerai confronts Alaric in the cave  ')).value, 'Nerai confronts Alaric in the cave');
  assert.equal(ok(await sceneProps.setScenePropertyValue(S, t.status.id, t.opt.Drafting)).value, t.opt.Drafting);
  assert.equal(ok(await sceneProps.setScenePropertyValue(S, number.id, 12)).value, 12);
  assert.equal(ok(await sceneProps.setScenePropertyValue(S, date.id, '2026-03-04')).value, '2026-03-04');
  assert.equal(ok(await sceneProps.setScenePropertyValue(S, check.id, true)).value, true);
  const [hollows, oath] = threads.options.map((o) => o.id);
  assert.deepEqual(ok(await sceneProps.setScenePropertyValue(S, threads.id, [oath, hollows, oath])).value, [oath, hollows]);

  refused(await sceneProps.setScenePropertyValue(S, t.status.id, 'not-an-option'), 'Invalid value');
  refused(await sceneProps.setScenePropertyValue(S, number.id, 'twelve'), 'Invalid value');
  refused(await sceneProps.setScenePropertyValue(S, date.id, '2026-02-30'), 'Invalid value');
  refused(await sceneProps.setScenePropertyValue(S, t.cast.id, [t.nerai.id]), 'Property not found');

  const w = await workspace.loadProjectWorkspace(HOLLOW);
  const values = propModel.indexValues(w.values, w.sceneValues);
  assert.equal(values.get(propModel.valueKey(S, t.synopsis.id)), 'Nerai confronts Alaric in the cave');
  assert.equal(values.get(propModel.valueKey(S, number.id)), 12);

  // Clearing deletes the row (null, "", false, []).
  for (const [p, empty] of [[t.synopsis, ''], [number, null], [check, false], [threads, []]]) {
    assert.equal(ok(await sceneProps.setScenePropertyValue(S, p.id, empty)).value, null);
  }
  assert.deepEqual((await all(db, `select property_id from public.scene_property_values where scene_id = $1`, [S])).map((r) => r.property_id).sort(),
    [t.status.id, date.id].sort());

  // Removing an option clears it where it was used; select → multi-select wraps.
  const cleared = ok(await sceneProps.updateSceneProperty(t.status.id, {
    options: t.status.options.filter((o) => o.name !== 'Drafting'),
  })).cleared;
  assert.equal(cleared, 1);
  assert.deepEqual(await sceneRows(db), before, 'no Scene row changed: prose, words, version and updated_at are as they were');
});

test('relationship values: one or several Entries, in order, by canonical id; cardinality holds; invalid targets refused', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const before = await sceneRows(db);
  const S = pageId('h4a');

  assert.deepEqual(ok(await sceneProps.setSceneRelationship(S, t.cast.id, [t.alaric.id, t.nerai.id, t.alaric.id])).targets, [t.alaric.id, t.nerai.id]);
  assert.deepEqual(ok(await sceneProps.setSceneRelationship(S, t.location.id, [t.cave.id])).targets, [t.cave.id]);
  refused(await sceneProps.setSceneRelationship(S, t.location.id, [t.cave.id, t.varZal.id]), 'This relationship holds one value');
  refused(await sceneProps.setSceneRelationship(S, t.location.id, [t.nerai.id]), 'Not a valid target');
  refused(await sceneProps.setSceneRelationship(S, t.synopsis.id, [t.nerai.id]), 'Property not found');

  // The values are ordinary references — Scene → Entry — with the Scene property.
  const rows = await all(db, `select source_type, source_scene_id, target_type, target_entry_id, property_id, scene_property_id, position
    from public.object_references where source_scene_id = $1 order by scene_property_id, position`, [S]);
  assert.ok(rows.every((r) => r.source_type === 'scene' && r.target_type === 'entry' && r.property_id === null && r.scene_property_id));
  assert.equal(rows.length, 3);
  assert.equal(await one(db, `select count(*)::int as n from public.workspace_collection_entries where title = 'Nerai'`).then((r) => r.n), 1, 'never a copy');

  const loaded = await workspace.loadProjectWorkspace(HOLLOW);
  const values = refModel.relationshipValues(loaded.references);
  assert.deepEqual(values.get(propModel.valueKey(S, t.cast.id)), [t.alaric.id, t.nerai.id]);
  assert.deepEqual(values.get(propModel.valueKey(S, t.location.id)), [t.cave.id]);

  // "One" only while no Scene holds several; the target only while none holds one.
  refused(await sceneProps.updateSceneProperty(t.cast.id, { many: false }), 'Some scenes hold more than one');
  refused(await sceneProps.updateSceneProperty(t.location.id, { target_collection_id: t.characters.id }), 'Clear its values before changing what it points to');
  ok(await sceneProps.setSceneRelationship(S, t.cast.id, [t.nerai.id]));
  assert.equal(ok(await sceneProps.updateSceneProperty(t.cast.id, { many: false })).property.relation_many, false);
  assert.deepEqual(ok(await sceneProps.setSceneRelationship(S, t.cast.id, [])).targets, []);
  assert.deepEqual(await sceneRows(db), before, 'no Scene row changed');
});

// ── 3. Backlinks and generic links ─────────────────────────────────────────────

test('backlinks: the Entry knows every Scene that points to it; generic-link calls never touch a Scene value', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  ok(await sceneProps.setSceneRelationship(pageId('h4c'), t.cast.id, [t.nerai.id]));
  ok(await sceneProps.setSceneRelationship(pageId('h1a'), t.cast.id, [t.nerai.id, t.alaric.id]));
  const note = ok(await pages.createWorkspacePage(HOLLOW, 'Magic System'));
  ok(await refs.addObjectReference('page', note.id, 'entry', t.nerai.id));

  const loaded = await workspace.loadProjectWorkspace(HOLLOW);
  const back = refModel.backlinksOf(loaded.references, t.nerai.id);
  assert.deepEqual(back.map((b) => b.source.id).sort(), [pageId('h1a'), pageId('h4c'), note.id].sort());
  assert.deepEqual(back.find((b) => b.source.id === pageId('h4c')).via, [t.cast.id], 'via the Scene property');
  assert.deepEqual(back.find((b) => b.source.id === note.id).via, [null], 'a generic link');
  // A Scene Relationship value is not a generic link.
  assert.deepEqual(refModel.relatedOf(loaded.references, pageId('h4c')), []);

  // A generic link from the same Scene to the same Entry is a separate row; removing it keeps the value.
  const link = ok(await refs.addObjectReference('scene', pageId('h4c'), 'entry', t.nerai.id));
  assert.equal(link.scene_property_id, null);
  const valueRow = await one(db, `select id from public.object_references where scene_property_id = $1 and source_scene_id = $2`, [t.cast.id, pageId('h4c')]);
  refused(await refs.removeObjectReference(valueRow.id), 'Reference not found');
  ok(await refs.removeObjectReference(link.id));
  assert.ok(await one(db, `select 1 as x from public.object_references where id = $1`, [valueRow.id]), 'the value stays');

  // The Inspector orders a Scene's backlinks by manuscript order.
  const index = await shellIndex();
  const order = sceneModel.manuscriptSceneOrder(index);
  assert.ok(order.placed.indexOf(pageId('h1a')) < order.placed.indexOf(pageId('h4c')));
});

// ── 4. Isolation ───────────────────────────────────────────────────────────────

test('isolation: another writer can neither read nor write; a Scene holds only its own Manuscript\'s properties; clients only read', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  ok(await sceneProps.setScenePropertyValue(pageId('h4a'), t.synopsis.id, 'Alice only'));
  const aliceRows = async () => ({
    defs: await all(db, `select * from public.scene_property_definitions order by id`),
    values: await all(db, `select * from public.scene_property_values order by scene_id, property_id`),
  });
  const before = await aliceRows();

  signIn(db, BRAM);
  refused(await sceneProps.createSceneProperty(HOLLOW, 'Spy', 'text'), 'Manuscript not found');
  refused(await sceneProps.setScenePropertyValue(pageId('h4a'), t.synopsis.id, 'x'), 'Scene not found');
  refused(await sceneProps.updateSceneProperty(t.synopsis.id, { name: 'x' }), 'Property not found');
  refused(await sceneProps.deleteSceneProperty(t.synopsis.id, 1) .then((r) => (r.status === 'error' ? { data: null, error: r.error } : { data: r, error: null })), 'Property not found');
  refused(await sceneViewActions.createSceneView(HOLLOW, 'Spy', 'table'), 'Manuscript not found');
  const w = await workspace.loadProjectWorkspace(HOLLOW);
  assert.deepEqual([w.sceneProperties.length, w.sceneValues.length, w.sceneViews.length], [0, 0, 0], 'RLS: nothing of Alice\'s is visible');

  // Bram's own property can't be set on Alice's Scene, and Alice's on Bram's.
  const bramProp = ok(await sceneProps.createSceneProperty(TIDE, 'Tide note', 'text'));
  refused(await sceneProps.setScenePropertyValue(pageId('h4a'), bramProp.id, 'x'), 'Scene not found');
  signIn(db, ALICE);
  refused(await sceneProps.setScenePropertyValue(pageId('h4a'), bramProp.id, 'x'), 'Property not found');
  // And Alice's own property from another Project of hers is not the Scene's.
  const ash = projectId('ash');
  const ashProp = ok(await sceneProps.createSceneProperty(ash, 'Ash note', 'text'));
  refused(await sceneProps.setScenePropertyValue(pageId('h4a'), ashProp.id, 'x'), 'Property not found');

  // Clients only read: direct writes are refused by privileges.
  await assert.rejects(asUser(db, ALICE, (tx) => tx.query(`insert into public.scene_property_values (scene_id, property_id, manuscript_id, project_id, value)
    values ($1, $2, $3, $4, '"x"')`, [pageId('h4b'), t.synopsis.id, t.synopsis.manuscript_id, HOLLOW])), /permission denied/);
  await assert.rejects(asUser(db, ALICE, (tx) => tx.query(`update public.scene_property_definitions set name = 'x'`)), /permission denied/);
  await assert.rejects(asUser(db, ALICE, (tx) => tx.query(`delete from public.scene_views`)), /permission denied/);
  // The tables themselves refuse a value for another Manuscript's property.
  await assert.rejects(db.query(`insert into public.scene_property_values (scene_id, property_id, manuscript_id, project_id, value)
    values ($1, $2, $3, $4, '"x"')`, [pageId('h4b'), bramProp.id, bramProp.manuscript_id, TIDE]), /own Manuscript/);
  const after = await aliceRows();
  assert.deepEqual(after.values.filter((v) => v.project_id === HOLLOW), before.values);
});

// ── 5. Deletion ────────────────────────────────────────────────────────────────

test('deleting a property: confirmed count, its values and links go, never a Scene or an Entry', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  ok(await sceneProps.setScenePropertyValue(pageId('h4a'), t.status.id, t.opt.Done));
  ok(await sceneProps.setScenePropertyValue(pageId('h4b'), t.status.id, t.opt.Planned));
  ok(await sceneProps.setSceneRelationship(pageId('h4a'), t.cast.id, [t.nerai.id, t.alaric.id]));
  const before = await sceneRows(db);

  assert.deepEqual(await sceneProps.deleteSceneProperty(t.status.id, 1), { status: 'confirm', values: 2 });
  assert.deepEqual(await sceneProps.deleteSceneProperty(t.status.id, 2), { status: 'deleted', deletedValues: 2 });
  assert.deepEqual(await sceneProps.deleteSceneProperty(t.cast.id, 0), { status: 'confirm', values: 1 });
  assert.deepEqual(await sceneProps.deleteSceneProperty(t.cast.id, 1), { status: 'deleted', deletedValues: 1 });
  assert.equal((await one(db, `select count(*)::int as n from public.object_references where source_scene_id is not null`)).n, 0);
  assert.equal((await one(db, `select count(*)::int as n from public.workspace_collection_entries where id = any($1)`, [[t.nerai.id, t.alaric.id]])).n, 2);
  assert.deepEqual(await sceneRows(db), before);
  const positions = (await all(db, `select position from public.scene_property_definitions order by position`)).map((r) => r.position);
  assert.deepEqual(positions, [1, 2], 'renumbered 1..n');
});

// ── 6. Trash ───────────────────────────────────────────────────────────────────

test('Trash: a trashed target goes dormant and returns; a trashed Scene keeps its metadata; permanent deletion breaks only the link', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const S = pageId('h4a');
  ok(await sceneProps.setScenePropertyValue(S, t.status.id, t.opt['Needs Revision']));
  ok(await sceneProps.setSceneRelationship(S, t.cast.id, [t.nerai.id, t.alaric.id]));
  ok(await sceneProps.setSceneRelationship(S, t.location.id, [t.cave.id]));
  const castOf = async () => refModel.relationshipValues((await workspace.loadProjectWorkspace(HOLLOW)).references).get(propModel.valueKey(S, t.cast.id)) ?? [];

  // Nerai to Trash: dormant — hidden, kept; the Scene is untouched.
  ok(await trash.trashWorkspaceObject('entry', t.nerai.id));
  assert.deepEqual(await castOf(), [t.alaric.id]);
  // Editing the visible value keeps the dormant one.
  ok(await sceneProps.setSceneRelationship(S, t.cast.id, [t.alaric.id]));
  refused(await sceneProps.setSceneRelationship(S, t.cast.id, [t.alaric.id, t.nerai.id]), 'Not a valid target');
  ok(await trash.restoreWorkspaceObject('entry', t.nerai.id));
  assert.deepEqual(await castOf(), [t.alaric.id, t.nerai.id], 'restoring Nerai restores the relationship');

  // The Scene itself to Trash: its values and links stay, hidden with it; a
  // value can't be set on it; restore brings everything back as it was.
  const before = await all(db, `select * from public.scene_property_values where scene_id = $1`, [S]);
  ok(await trash.trashWorkspaceObject('scene', S));
  refused(await sceneProps.setScenePropertyValue(S, t.status.id, t.opt.Done), 'Scene not found');
  assert.deepEqual(refModel.backlinksOf((await workspace.loadProjectWorkspace(HOLLOW)).references, t.cave.id), [], 'dormant while the Scene is in Trash');
  ok(await trash.restoreWorkspaceObject('scene', S));
  assert.deepEqual(await all(db, `select * from public.scene_property_values where scene_id = $1`, [S]), before);
  assert.deepEqual(await castOf(), [t.alaric.id, t.nerai.id]);

  // Permanent deletion of an Entry breaks only its link.
  ok(await trash.trashWorkspaceObject('entry', t.alaric.id));
  ok(await trash.deleteTrashedWorkspaceObject('entry', t.alaric.id));
  assert.deepEqual(await castOf(), [t.nerai.id]);
  assert.ok(await one(db, `select 1 as x from public.scenes where id = $1`, [S]), 'the Scene stays');

  // Permanent deletion of the Scene takes its values and links, never Nerai or Cave.
  ok(await trash.trashWorkspaceObject('scene', S));
  ok(await trash.deleteTrashedWorkspaceObject('scene', S));
  assert.equal((await one(db, `select count(*)::int as n from public.scene_property_values where scene_id = $1`, [S])).n, 0);
  assert.equal((await one(db, `select count(*)::int as n from public.object_references where source_scene_id = $1`, [S])).n, 0);
  assert.equal((await one(db, `select count(*)::int as n from public.workspace_collection_entries where id = any($1)`, [[t.nerai.id, t.cave.id]])).n, 2);

  // A Collection a Scene property points to: counted in Trash, and permanent
  // deletion takes the property (it can hold nothing) — never a Scene.
  ok(await sceneProps.setSceneRelationship(pageId('h4b'), t.location.id, [t.cave.id]));
  ok(await trash.trashWorkspaceObject('collection', t.locations.id));
  refused(await sceneProps.createSceneRelationshipProperty(HOLLOW, 'Where', 'entry', t.locations.id, false), 'Target collection not found');
  const item = ok(await trash.listWorkspaceTrash(HOLLOW)).find((i) => i.id === t.locations.id);
  assert.equal(item.properties, 1);
  const rowsBefore = (await sceneRows(db)).filter((s) => s.id !== S);
  assert.equal(ok(await trash.deleteTrashedWorkspaceObject('collection', t.locations.id)).properties, 1);
  assert.equal(await one(db, `select id from public.scene_property_definitions where id = $1`, [t.location.id]), undefined);
  assert.deepEqual(await sceneRows(db), rowsBefore);
});

// ── 7. Scene Views ─────────────────────────────────────────────────────────────

test('Scene Views: create List / Table / Board with defaults; configs are checked against the Manuscript; property changes prune them', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const mid = await manuscriptId(db);
  const list = ok(await sceneViewActions.createSceneView(HOLLOW, null, 'list'));
  const table = ok(await sceneViewActions.createSceneView(HOLLOW, null, 'table'));
  const board = ok(await sceneViewActions.createSceneView(HOLLOW, 'By Status', 'board'));
  assert.deepEqual([list.name, table.name, board.name], ['List', 'Table', 'By Status']);
  assert.deepEqual(list.config, { properties: [t.synopsis.id, t.status.id, t.cast.id], sort: null, filters: [], group_by: null });
  assert.deepEqual(table.config.properties, ['words', t.synopsis.id, t.status.id, t.cast.id, t.location.id]);
  assert.equal(board.config.group_by, t.status.id, 'a Board groups by the first Status');
  assert.equal(board.manuscript_id, mid);

  const loaded = await workspace.loadProjectWorkspace(HOLLOW);
  assert.deepEqual(viewModel.viewsOf(loaded.sceneViews, mid).map((v) => v.name), ['List', 'Table', 'By Status']);
  assert.ok(viewModel.isSceneView(loaded.sceneViews[0]));

  // Valid: the read-only fields, the new filters, Relationship grouping.
  const good = {
    properties: ['words', 'placement', t.location.id],
    sort: { by: 'words', direction: 'desc' },
    filters: [
      { property: t.status.id, op: 'is', value: t.opt.Drafting },
      { property: t.cast.id, op: 'is', value: t.nerai.id },
      { property: 'words', op: 'gt', value: 1000 },
      { property: t.location.id, op: 'is_empty' },
      { property: t.synopsis.id, op: 'contains', value: 'cave' },
      { property: 'placement', op: 'is', value: 'unplaced' },
    ],
    group_by: t.location.id,
  };
  assert.deepEqual(ok(await sceneViewActions.updateSceneView(board.id, { config: good })).config, good);

  // Invalid: another Manuscript's property, a read-only field grouped by or
  // "empty", a Relationship sorted by, a bad operand.
  const bramCol = (signIn(db, BRAM), ok(await sceneProps.createSceneProperty(TIDE, 'Tide', 'text')));
  signIn(db, ALICE);
  for (const bad of [
    { properties: [bramCol.id] },
    { group_by: 'placement' },
    { group_by: t.synopsis.id },
    { sort: { by: t.cast.id, direction: 'asc' } },
    { filters: [{ property: 'words', op: 'is_empty' }] },
    { filters: [{ property: 'words', op: 'gt', value: 'many' }] },
    { filters: [{ property: t.cast.id, op: 'is', value: 'nerai' }] },
    { filters: [{ property: t.synopsis.id, op: 'contains', value: '   ' }] },
    { filters: [{ property: t.status.id, op: 'gt', value: 1 }] },
  ]) {
    refused(await sceneViewActions.updateSceneView(list.id, { config: { properties: [], sort: null, filters: [], group_by: null, ...bad } }), 'Invalid view configuration');
  }

  // A new property joins the Table; removing one prunes every View that named it.
  const pov = ok(await sceneProps.createSceneProperty(HOLLOW, 'POV', 'select'));
  const views = async () => Object.fromEntries((await all(db, `select name, config from public.scene_views where manuscript_id = $1`, [mid])).map((r) => [r.name, r.config]));
  assert.ok((await views()).Table.properties.includes(pov.id));
  assert.equal((await sceneProps.deleteSceneProperty(t.location.id, 0)).status, 'deleted');
  const pruned = (await views())['By Status'];
  assert.equal(pruned.group_by, null);
  assert.deepEqual(pruned.properties, ['words', 'placement']);
  assert.ok(!pruned.filters.some((f) => f.property === t.location.id));
  // Removing an option prunes a filter on it.
  ok(await sceneProps.updateSceneProperty(t.status.id, { options: t.status.options.filter((o) => o.name !== 'Drafting') }));
  assert.ok(!(await views())['By Status'].filters.some((f) => f.property === t.status.id));

  // Move and delete are configuration only; a Manuscript may keep none.
  const scenesBefore = await sceneRows(db);
  ok(await sceneViewActions.moveSceneView(board.id, 0));
  assert.deepEqual(viewModel.viewsOf((await workspace.loadProjectWorkspace(HOLLOW)).sceneViews, mid).map((v) => v.name), ['By Status', 'List', 'Table']);
  for (const v of [list, table, board]) ok(await sceneViewActions.deleteSceneView(v.id));
  assert.equal((await workspace.loadProjectWorkspace(HOLLOW)).sceneViews.length, 0);
  assert.deepEqual(await sceneRows(db), scenesBefore);
});

test('Scene Views arrange Scenes in manuscript order — placed in reading order, then Unplaced apart — and filter, sort and show fields', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const mid = await manuscriptId(db);
  ok(await sceneProps.setScenePropertyValue(pageId('h4a'), t.status.id, t.opt.Drafting));
  ok(await sceneProps.setScenePropertyValue(pageId('h1a'), t.status.id, t.opt.Planned));
  ok(await sceneProps.setScenePropertyValue(pageId('h6c'), t.synopsis.id, 'The cave collapses'));
  ok(await sceneProps.setSceneRelationship(pageId('h4c'), t.cast.id, [t.nerai.id]));
  ok(await sceneProps.setSceneRelationship(pageId('h3b'), t.cast.id, [t.nerai.id, t.alaric.id]));

  const index = await shellIndex();
  const w = await workspace.loadProjectWorkspace(HOLLOW);
  const { placed, unplaced } = sceneModel.manuscriptSceneOrder(index);
  assert.deepEqual(placed, ['h1a', 'h2a', 'h3a', 'h4a', 'h4b', 'h4c', 'h6c'].map(pageId), 'Group → Chapter → Scene reading order');
  assert.deepEqual(new Set(unplaced), new Set(['h3b', 'h3c', 'h6a', 'h6b'].map(pageId)));
  // Derived numbers: a divided Chapter's Scenes are "5.2"; a Chapter's only Scene is the Chapter; Unplaced has none.
  assert.deepEqual(['h1a', 'h4a', 'h4b', 'h6c', 'h3b'].map((k) => sceneModel.sceneNumber(index, pageId(k))), ['1', '5.1', '5.2', '6', null]);
  assert.equal(sceneModel.sceneViewLabel(index, pageId('h1a')).title, index.get(chapterId('hollow.ch1')).title);
  assert.equal(sceneModel.sceneViewLabel(index, pageId('h3b')).context, 'Unplaced');

  const ids = [...placed, ...unplaced];
  const properties = [...propModel.propertiesOf(w.sceneProperties, mid), ...sceneModel.sceneNativeProperties(mid, HOLLOW)];
  const values = new Map([...propModel.indexValues(w.values, w.sceneValues), ...refModel.relationshipValues(w.references), ...sceneModel.sceneNativeValues(index, ids)]);
  const input = { entryIds: ids, properties, values, titleOf: (id) => sceneModel.sceneViewLabel(index, id)?.title ?? '' };
  const view = (config) => ({ ...sceneModel.sceneFallbackView(mid, HOLLOW, properties), config: { ...viewModel.EMPTY_VIEW_CONFIG, ...config } });

  // No sort: manuscript order, Unplaced after, under their own heading.
  const plain = viewModel.arrangeItems(view({}), input);
  assert.deepEqual(plain, ids);
  assert.equal(sceneModel.unplacedStart(index, plain, false), placed.length);
  assert.equal(sceneModel.unplacedStart(index, plain, true), -1, 'a sort mixes them; each says "Unplaced" itself');
  assert.equal(sceneModel.sceneFallbackView(mid, HOLLOW, properties).config.properties.length, 3);

  const arrange = (config) => viewModel.arrangeItems(view(config), input).map((id) => Object.entries({ ...Object.fromEntries(['h1a','h2a','h3a','h3b','h3c','h4a','h4b','h4c','h6a','h6b','h6c'].map((k) => [k, pageId(k)])) }).find(([, v]) => v === id)[0]);
  assert.deepEqual(arrange({ filters: [{ property: t.status.id, op: 'is', value: t.opt.Drafting }] }), ['h4a']);
  assert.deepEqual(arrange({ filters: [{ property: t.cast.id, op: 'is', value: t.nerai.id }] }), ['h4c', 'h3b'], 'Characters includes Nerai');
  assert.deepEqual(arrange({ filters: [{ property: t.cast.id, op: 'is', value: t.alaric.id }, { property: 'placement', op: 'is', value: 'placed' }] }), []);
  assert.deepEqual(arrange({ filters: [{ property: 'words', op: 'gt', value: 260 }] }), ['h2a', 'h3a', 'h6c', 'h3b'], 'Words > 260');
  assert.deepEqual(arrange({ filters: [{ property: 'words', op: 'lt', value: 1 }] }), ['h4b']);
  assert.deepEqual(arrange({ filters: [{ property: t.synopsis.id, op: 'contains', value: 'CAVE' }] }), ['h6c']);
  assert.deepEqual(arrange({ filters: [{ property: t.location.id, op: 'is_not_empty' }] }), []);
  assert.deepEqual(arrange({ filters: [{ property: 'placement', op: 'is', value: 'unplaced' }] }).sort(), ['h3b', 'h3c', 'h6a', 'h6b']);
  const byWords = arrange({ sort: { by: 'words', direction: 'desc' }, filters: [{ property: 'placement', op: 'is', value: 'placed' }] });
  assert.deepEqual(byWords, ['h3a', 'h2a', 'h6c', 'h4a', 'h4c', 'h1a', 'h4b']);
  assert.deepEqual(arrange({ sort: { by: t.status.id, direction: 'asc' } }).slice(0, 2), ['h1a', 'h4a'], 'by option order; empties last');

  // Shown properties: the View decides; read-only fields read, never edit.
  const shownCfg = view({ properties: ['words', t.status.id] });
  assert.deepEqual(viewModel.shownProperties(shownCfg, properties).map((p) => p.name), ['Words', 'Status']);
  assert.ok(viewModel.isNative(properties.find((p) => p.id === 'words')));
  assert.deepEqual(propModel.valueLine(viewModel.shownProperties(shownCfg, properties), values, pageId('h4a')), ['200', 'Drafting']);
  assert.ok(!viewModel.groupableProperties(properties).some((p) => p.id === 'placement'));
  assert.deepEqual(viewModel.filterOpsFor(properties.find((p) => p.id === 'words')), ['gt', 'lt']);
});

// ── 8. Board ───────────────────────────────────────────────────────────────────

test('Board: moving a Scene between columns changes its Status or Relationship — never its place in the manuscript', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const mid = await manuscriptId(db);
  ok(await sceneProps.setScenePropertyValue(pageId('h4a'), t.status.id, t.opt.Drafting));
  ok(await sceneProps.setSceneRelationship(pageId('h4b'), t.cast.id, [t.nerai.id, t.alaric.id]));
  const board = ok(await sceneViewActions.createSceneView(HOLLOW, 'Revision', 'board'));
  const order = await shown();
  const rows = await sceneRows(db);

  const load = async () => {
    const index = await shellIndex();
    const w = await workspace.loadProjectWorkspace(HOLLOW);
    const ids = (({ placed, unplaced }) => [...placed, ...unplaced])(sceneModel.manuscriptSceneOrder(index));
    const properties = [...propModel.propertiesOf(w.sceneProperties, mid), ...sceneModel.sceneNativeProperties(mid, HOLLOW)];
    const values = new Map([...propModel.indexValues(w.values, w.sceneValues), ...refModel.relationshipValues(w.references), ...sceneModel.sceneNativeValues(index, ids)]);
    const laneTargets = (p) => index.get(p.relation_collection_id).entryIds.map((id) => ({ id, name: index.get(id).title }));
    const lanes = (config) => viewModel.boardLanes({ ...board, config: { ...board.config, ...config } }, properties, values, ids, laneTargets)
      .lanes.map((l) => [l.name, l.entryIds.filter((id) => [pageId('h4a'), pageId('h4b')].includes(id)).length]);
    return { properties, values, lanes };
  };

  let s = await load();
  assert.deepEqual(s.lanes({}).filter(([, n]) => n), [['No status', 1], ['Drafting', 1]]);
  // Drafting → Needs Revision (the value the lane stands for), as the Board does it.
  const status = s.properties.find((p) => p.id === t.status.id);
  const next = viewModel.boardMoveValue(status, s.values.get(propModel.valueKey(pageId('h4a'), t.status.id)), t.opt.Drafting, t.opt['Needs Revision']);
  assert.equal(next, t.opt['Needs Revision']);
  ok(await sceneProps.setScenePropertyValue(pageId('h4a'), t.status.id, next));
  s = await load();
  assert.deepEqual(s.lanes({}).filter(([, n]) => n), [['No status', 1], ['Needs Revision', 1]]);

  // Grouped by a several-value Relationship: the Scene is in each of its lanes;
  // moving it from Alaric to the empty lane removes only Alaric.
  assert.deepEqual(s.lanes({ group_by: t.cast.id }), [['No Characters', 1], ['Nerai', 1], ['Alaric', 1]]);
  const cast = s.properties.find((p) => p.id === t.cast.id);
  const castValue = s.values.get(propModel.valueKey(pageId('h4b'), t.cast.id));
  assert.deepEqual(viewModel.boardMoveValue(cast, castValue, t.alaric.id, null), [t.nerai.id]);
  assert.deepEqual(viewModel.boardMoveValue(cast, castValue, t.nerai.id, t.alaric.id), [t.alaric.id]);
  assert.equal(viewModel.boardMoveValue(cast, castValue, t.nerai.id, t.nerai.id), undefined);
  ok(await sceneProps.setSceneRelationship(pageId('h4b'), t.cast.id, viewModel.boardMoveValue(cast, castValue, t.alaric.id, null)));
  // One-value Relationship: the new lane replaces.
  const location = s.properties.find((p) => p.id === t.location.id);
  assert.deepEqual(viewModel.boardMoveValue(location, [t.cave.id], t.cave.id, t.varZal.id), [t.varZal.id]);
  assert.equal(viewModel.boardMoveValue(location, [t.cave.id], t.cave.id, null), null);

  assert.deepEqual(await shown(), order, 'the manuscript\'s order is exactly as it was');
  const keep = ({ id, chapter_id, position, content, word_count, version, updated_at }) => ({ id, chapter_id, position, content, word_count, version, updated_at });
  assert.deepEqual((await sceneRows(db)).map(keep), rows.map(keep), 'no Scene row changed');
});

// ── 9. Collections share the stronger engine ───────────────────────────────────

test('Collection Views gain the same filters and Relationship grouping; existing configs stay valid', async () => {
  const db = await seededDb();
  const characters = ok(await collections.createWorkspaceCollection(HOLLOW, 'Characters')).collection;
  const factions = ok(await collections.createWorkspaceCollection(HOLLOW, 'Factions')).collection;
  const drelareth = ok(await collections.createCollectionEntry(factions.id, 'Drelareth'));
  const nerai = ok(await collections.createCollectionEntry(characters.id, 'Nerai'));
  const age = ok(await colProps.createCollectionProperty(characters.id, 'Age', 'number'));
  const notes = ok(await colProps.createCollectionProperty(characters.id, 'Notes', 'text'));
  const affiliation = ok(await refs.createRelationshipProperty(characters.id, 'Affiliation', 'entry', factions.id, false));
  ok(await colProps.setEntryPropertyValue(nerai.id, age.id, 19));
  ok(await refs.setEntryRelationship(nerai.id, affiliation.id, [drelareth.id]));

  const board = ok(await colViews.createCollectionView(characters.id, 'By Affiliation', 'board', {
    properties: [age.id],
    sort: null,
    filters: [
      { property: age.id, op: 'gt', value: 18 },
      { property: notes.id, op: 'contains', value: 'oath' },
      { property: affiliation.id, op: 'is', value: drelareth.id },
    ],
    group_by: affiliation.id,
  }));
  assert.equal(board.config.group_by, affiliation.id);
  // Relationship target changes prune a grouping that no longer points to Entries.
  ok(await refs.setEntryRelationship(nerai.id, affiliation.id, []));
  ok(await refs.updateRelationshipProperty(affiliation.id, { target: 'page' }));
  const after = (await one(db, `select config from public.workspace_collection_views where id = $1`, [board.id])).config;
  assert.equal(after.group_by, null);
  // The Collection's native field names are not Scene fields.
  refused(await colViews.updateCollectionView(board.id, { config: { properties: ['words'], sort: null, filters: [], group_by: null } }), 'Invalid view configuration');
});

// ── 10. The prose boundary ─────────────────────────────────────────────────────

test('the prose boundary: after every metadata change the Scene saves on the same version; reload keeps metadata and prose', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const S = pageId('h4c');
  const before = await one(db, `select content, word_count, version, updated_at from public.scenes where id = $1`, [S]);

  ok(await sceneProps.setScenePropertyValue(S, t.status.id, t.opt.Drafting));
  ok(await sceneProps.setScenePropertyValue(S, t.synopsis.id, 'The lighthouse-keeper counts gulls'));
  ok(await sceneProps.setSceneRelationship(S, t.cast.id, [t.nerai.id]));
  ok(await sceneViewActions.createSceneView(HOLLOW, null, 'table'));
  ok(await sceneProps.updateSceneProperty(t.status.id, { name: 'Stage' }));
  assert.deepEqual(await one(db, `select content, word_count, version, updated_at from public.scenes where id = $1`, [S]), before,
    'content, words, version and updated_at untouched');

  // The editor's save — built on the version it last saw — is not a conflict.
  const saved = await scenes.syncSceneWithLimitCheck(S, doc('The keeper counted gulls.'), 4, before.version);
  assert.equal(saved.status, 'ok');
  assert.equal(saved.version, before.version + 1);
  const row = await one(db, `select content, word_count from public.scenes where id = $1`, [S]);
  assert.deepEqual([row.content, row.word_count], [doc('The keeper counted gulls.'), 4]);

  // A fresh read (a refresh) holds both.
  const w = await workspace.loadProjectWorkspace(HOLLOW);
  const values = new Map([...propModel.indexValues(w.values, w.sceneValues), ...refModel.relationshipValues(w.references)]);
  assert.equal(values.get(propModel.valueKey(S, t.synopsis.id)), 'The lighthouse-keeper counts gulls');
  assert.deepEqual(values.get(propModel.valueKey(S, t.cast.id)), [t.nerai.id]);
  assert.equal(w.sceneProperties.find((p) => p.id === t.status.id).name, 'Stage');
  // A stale save (the version before) is still a conflict, exactly as before.
  assert.equal((await scenes.syncSceneWithLimitCheck(S, doc('stale'), 1, before.version)).status, 'version_mismatch');
});

test('before migration 032 the loader reports no Scene properties and the rest of the Workspace loads as before', async () => {
  const db = await seededDb();
  await db.exec(`drop table public.scene_views; drop table public.scene_property_values;
    alter table public.object_references drop column scene_property_id; drop table public.scene_property_definitions cascade;`);
  const w = await workspace.loadProjectWorkspace(HOLLOW);
  assert.deepEqual([w.scenePropertied, w.sceneProperties.length, w.sceneViews.length], [false, 0, 0]);
  assert.equal(w.referable, true);
  assert.equal(w.propertied, true);
});
