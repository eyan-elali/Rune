// Collection Properties (Rune 2.0 Workspace, Milestone 9, migration 026): the
// REAL property and value actions and the Workspace loader against the Rune
// 2.0 schema in real Postgres + RLS, and the pure presentation rules the
// Collection list and the Entry share (lib/rune2/collectionProperties.ts).
//
//   * definitions: creation, names, types, order, list visibility, rename,
//     reorder, lossless-only type changes
//   * options: Collection-owned, ids stable across renames, removal clears
//     the values that used them
//   * values: set / update / clear for every type, checked by type and
//     options, never for another Collection's property
//   * removal: only with the confirmed value count; nothing else is touched
//   * ownership isolation, values surviving a fresh read
//   * Pages, Folders, Collections, Entries and the manuscript unchanged
//
// Data: the synthetic legacy fixture moved into the Rune 2.0 schema.
// alice owns hollow and ash; bram owns tide.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, readRepoFile, asUser, LEGACY_BASELINE, RUNE2_SCHEMA } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';
import { prototypeLegacyToRune2 } from '../lib/legacy-to-rune2.mjs';
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
let props, collections, pages, tree, workspace, model;
before(async () => {
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
  props = await bundleForTest('src/lib/actions/workspaceProperties.ts', { name: 'cp_props' });
  collections = await bundleForTest('src/lib/actions/workspaceCollections.ts', { name: 'cp_collections' });
  pages = await bundleForTest('src/lib/actions/workspacePages.ts', { name: 'cp_pages' });
  tree = await bundleForTest('src/lib/actions/workspaceTree.ts', { name: 'cp_tree' });
  workspace = await bundleForTest('src/lib/rune2/projectWorkspace.ts', { name: 'cp_loader' });
  model = await bundleForTest('src/lib/rune2/collectionProperties.ts', { name: 'cp_model' });
});

async function seededDb() {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  await prototypeLegacyToRune2(legacy, db);
  return db;
}

function signIn(db, userId) {
  const sb = createSupabaseAdapter(db, { userId });
  for (const mod of [props, collections, pages, tree, workspace]) mod.setServerClient(sb);
  return sb;
}

const ok = (r) => { assert.equal(r.error, null, r.error); return r.data; };
const saved = (r) => { assert.equal(r.status, 'ok', JSON.stringify(r)); return r; };

/** A Collection's properties as [name, type, position, shown] from the table. */
async function schemaOf(db, collectionId) {
  return (await all(db, `select name, type, position, shown_in_list from public.workspace_collection_properties
                          where collection_id = $1 order by position`, [collectionId]))
    .map((p) => [p.name, p.type, p.position, p.shown_in_list]);
}
const valueOf = async (db, entryId, propertyId) =>
  (await one(db, `select value from public.workspace_entry_values where entry_id = $1 and property_id = $2`, [entryId, propertyId]))?.value;
const valueCount = async (db) => (await one(db, `select count(*)::int as n from public.workspace_entry_values`)).n;

/**
 * Alice's Hollow: Characters (Nerai, Alaric, Djal) with Role (text), Status
 * (status: Alive, Dead), Affiliation (select: Drelareth, Aelthyr), Age
 * (number), POV (checkbox); and Places (Cave) with its own Kind (select).
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
  const pov = ok(await props.createCollectionProperty(cid, 'POV', 'checkbox'));
  const places = ok(await collections.createWorkspaceCollection(HOLLOW, 'Places'));
  const cave = ok(await collections.createCollectionEntry(places.collection.id, 'Cave'));
  let kind = ok(await props.createCollectionProperty(places.collection.id, 'Kind', 'select'));
  kind = ok(await props.updateCollectionProperty(kind.id, { options: [{ name: 'Natural' }] })).property;
  const opt = (p, name) => p.options.find((o) => o.name === name).id;
  return { characters, cid, nerai, alaric, djal, role, status, affiliation, age, pov, places, cave, kind, opt };
}

// ── 1. Definitions ─────────────────────────────────────────────────────────────

test('definitions: created in order; the first three shown in the list; names trimmed, unique ignoring case; types checked', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  assert.deepEqual(await schemaOf(db, t.cid), [
    ['Role', 'text', 1, true],
    ['Status', 'status', 2, true],
    ['Affiliation', 'select', 3, true],
    ['Age', 'number', 4, false],
    ['POV', 'checkbox', 5, false],
  ]);
  assert.equal(t.role.collection_id, t.cid);
  assert.equal(t.role.project_id, HOLLOW);
  assert.deepEqual(t.role.options, []);

  assert.equal(ok(await props.createCollectionProperty(t.cid, '  Born  ', 'date')).name, 'Born');
  assert.equal((await props.createCollectionProperty(t.cid, 'role', 'text')).error, 'A property with this name already exists');
  assert.equal((await props.createCollectionProperty(t.cid, '   ', 'text')).error, 'A property needs a name');
  assert.equal((await props.createCollectionProperty(t.cid, 'Link', 'relationship')).error, 'Unknown property type');
  assert.equal((await props.createCollectionProperty(MISSING, 'X', 'text')).error, 'Collection not found');
  assert.equal(ok(await props.createCollectionProperty(t.cid, 'x'.repeat(300), 'text')).name.length, 100);
  // The same name is fine in another Collection.
  ok(await props.createCollectionProperty(t.places.collection.id, 'Role', 'text'));

  // Every beta type can be created (a Relationship names its target, so it has its own function: app-references).
  for (const type of model.PROPERTY_TYPES.filter((x) => x !== 'relationship')) ok(await props.createCollectionProperty(t.cid, `T ${type}`, type));

  // Options exist only on choice types, even written directly.
  await assert.rejects(db.query(`update public.workspace_collection_properties set options = '[{"id":"a","name":"A"}]' where id = $1`, [t.role.id]),
    /options_check/);
  await assert.rejects(db.query(`update public.workspace_collection_properties set options = '[{"id":"a","name":"A"},{"id":"b","name":"a"}]' where id = $1`, [t.affiliation.id]),
    /Invalid property options/);
});

test('definitions: rename, list visibility and reorder; positions stay 1..n; nothing else changes', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  ok(await props.setEntryPropertyValue(t.nerai.id, t.role.id, 'Protagonist'));

  const renamed = ok(await props.updateCollectionProperty(t.role.id, { name: ' Part ' })).property;
  assert.equal(renamed.name, 'Part');
  assert.equal(renamed.id, t.role.id);
  assert.equal(await valueOf(db, t.nerai.id, t.role.id), 'Protagonist', 'a rename keeps every value');
  assert.equal((await props.updateCollectionProperty(t.role.id, { name: 'STATUS' })).error, 'A property with this name already exists');
  assert.equal((await props.updateCollectionProperty(t.role.id, { name: '' })).error, 'A property needs a name');
  assert.equal(ok(await props.updateCollectionProperty(t.role.id, { name: 'part' })).property.name, 'part', 'its own name in another case');
  assert.equal((await props.updateCollectionProperty(t.role.id, { colour: 'red' })).error, 'Unknown change: colour');

  ok(await props.updateCollectionProperty(t.pov.id, { shown_in_list: true }));
  ok(await props.updateCollectionProperty(t.status.id, { shown_in_list: false }));

  assert.equal(ok(await props.moveCollectionProperty(t.pov.id, 0)).position, 1);
  assert.deepEqual((await schemaOf(db, t.cid)).map(([n, , p, s]) => [n, p, s]), [
    ['POV', 1, true], ['part', 2, true], ['Status', 3, false], ['Affiliation', 4, true], ['Age', 5, false],
  ]);
  ok(await props.moveCollectionProperty(t.pov.id, 4));
  ok(await props.moveCollectionProperty(t.age.id, 1));
  ok(await props.moveCollectionProperty(t.status.id, 99)); // clamped to the end
  assert.deepEqual((await schemaOf(db, t.cid)).map(([n]) => n), ['part', 'Age', 'Affiliation', 'POV', 'Status']);
  assert.equal((await props.moveCollectionProperty(MISSING, 0)).error, 'Property not found');
  // The other Collection's order is its own.
  assert.deepEqual((await schemaOf(db, t.places.collection.id)).map(([n, , p]) => [n, p]), [['Kind', 1]]);
});

test('definitions: a type changes only where every value survives (select ↔ status, choice → multi-select)', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const alive = t.opt(t.status, 'Alive');
  ok(await props.setEntryPropertyValue(t.nerai.id, t.status.id, alive));
  ok(await props.setEntryPropertyValue(t.nerai.id, t.role.id, 'Protagonist'));
  ok(await props.setEntryPropertyValue(t.nerai.id, t.age.id, 19));

  // status → select: the value is unchanged.
  assert.equal(ok(await props.updateCollectionProperty(t.status.id, { type: 'select' })).property.type, 'select');
  assert.equal(await valueOf(db, t.nerai.id, t.status.id), alive);
  // select → multi_select: the one choice becomes a one-item list.
  ok(await props.updateCollectionProperty(t.status.id, { type: 'multi_select' }));
  assert.deepEqual(await valueOf(db, t.nerai.id, t.status.id), [alive]);
  // Nothing that would lose or reinterpret a value.
  for (const [p, type] of [[t.status, 'select'], [t.role, 'number'], [t.age, 'text'], [t.pov, 'select'], [t.role, 'select']]) {
    assert.equal((await props.updateCollectionProperty(p.id, { type })).error, 'This property’s type can’t be changed', `${p.name} → ${type}`);
  }
  assert.equal((await props.updateCollectionProperty(t.role.id, { type: 'relationship' })).error, 'This property’s type can’t be changed');
  assert.equal(await valueOf(db, t.nerai.id, t.role.id), 'Protagonist');
  assert.equal(await valueOf(db, t.nerai.id, t.age.id), 19);

  // The client helper offers exactly these.
  assert.deepEqual(model.convertibleTypes('select'), ['select', 'status', 'multi_select']);
  assert.deepEqual(model.convertibleTypes('status'), ['status', 'select', 'multi_select']);
  for (const type of ['text', 'number', 'multi_select', 'date', 'checkbox']) assert.deepEqual(model.convertibleTypes(type), [type]);
});

// ── 2. Options ─────────────────────────────────────────────────────────────────

test('options: owned by the property, given ids by the server, renamed without touching values, removed with their uses', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const [drel, aelt] = [t.opt(t.affiliation, 'Drelareth'), t.opt(t.affiliation, 'Aelthyr')];
  assert.equal(new Set([drel, aelt]).size, 2);
  ok(await props.setEntryPropertyValue(t.nerai.id, t.affiliation.id, drel));
  ok(await props.setEntryPropertyValue(t.alaric.id, t.affiliation.id, aelt));
  ok(await props.setEntryPropertyValue(t.djal.id, t.affiliation.id, drel));

  // Rename + reorder + add in one change: ids are kept, the new one gets one.
  const r1 = ok(await props.updateCollectionProperty(t.affiliation.id, {
    options: [{ id: aelt, name: 'Aelthyr' }, { id: drel, name: 'House Drelareth' }, { name: 'Unaligned' }],
  }));
  assert.equal(r1.cleared, 0);
  assert.deepEqual(r1.property.options.map((o) => o.name), ['Aelthyr', 'House Drelareth', 'Unaligned']);
  assert.deepEqual(r1.property.options.slice(0, 2).map((o) => o.id), [aelt, drel]);
  assert.equal(await valueOf(db, t.nerai.id, t.affiliation.id), drel, 'the value follows the renamed option');

  // Refused: duplicate names, blank names, invented ids, options on a text property.
  assert.equal((await props.updateCollectionProperty(t.affiliation.id, { options: [{ name: 'A' }, { name: 'a' }] })).error, 'Each option needs a different name');
  assert.equal((await props.updateCollectionProperty(t.affiliation.id, { options: [{ name: ' ' }] })).error, 'Each option needs a different name');
  assert.equal((await props.updateCollectionProperty(t.affiliation.id, { options: [{ id: 'made-up', name: 'X' }] })).error, 'Unknown option');
  assert.equal((await props.updateCollectionProperty(t.affiliation.id, { options: [{ id: t.opt(t.kind, 'Natural'), name: 'X' }] })).error, 'Unknown option',
    'another property\'s option is not this one\'s');
  assert.equal((await props.updateCollectionProperty(t.role.id, { options: [{ name: 'X' }] })).error, 'Only a choice property has options');
  assert.equal(await valueCount(db), 3, 'a refused change clears nothing');

  // Removing an option clears exactly the values that chose it.
  const r2 = ok(await props.updateCollectionProperty(t.affiliation.id, { options: r1.property.options.filter((o) => o.id !== drel) }));
  assert.equal(r2.cleared, 2);
  assert.equal(await valueOf(db, t.nerai.id, t.affiliation.id), undefined);
  assert.equal(await valueOf(db, t.djal.id, t.affiliation.id), undefined);
  assert.equal(await valueOf(db, t.alaric.id, t.affiliation.id), aelt);
});

test('options: removing a multi-select option narrows each list; a list left empty becomes no value', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  let traits = ok(await props.createCollectionProperty(t.cid, 'Traits', 'multi_select'));
  traits = ok(await props.updateCollectionProperty(traits.id, { options: [{ name: 'Brave' }, { name: 'Wry' }, { name: 'Loyal' }] })).property;
  const [brave, wry, loyal] = ['Brave', 'Wry', 'Loyal'].map((n) => t.opt(traits, n));
  ok(await props.setEntryPropertyValue(t.nerai.id, traits.id, [wry, brave, wry]));
  assert.deepEqual(await valueOf(db, t.nerai.id, traits.id), [wry, brave], 'duplicates collapse, order kept');
  ok(await props.setEntryPropertyValue(t.alaric.id, traits.id, [brave]));
  ok(await props.setEntryPropertyValue(t.djal.id, traits.id, [loyal]));

  const r = ok(await props.updateCollectionProperty(traits.id, { options: traits.options.filter((o) => o.id !== brave) }));
  assert.equal(r.cleared, 2);
  assert.deepEqual(await valueOf(db, t.nerai.id, traits.id), [wry]);
  assert.equal(await valueOf(db, t.alaric.id, traits.id), undefined);
  assert.deepEqual(await valueOf(db, t.djal.id, traits.id), [loyal]);
});

// ── 3. Values ──────────────────────────────────────────────────────────────────

test('values: set, update and clear for every type; each checked against its type and options', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const e = t.nerai.id;
  const set = (p, v) => props.setEntryPropertyValue(e, p.id, v);
  const refused = async (p, v) => assert.equal((await set(p, v)).error, 'Invalid value', `${p.type} ← ${JSON.stringify(v)}`);

  // Text: trimmed; blank clears.
  assert.deepEqual(ok(await set(t.role, '  Protagonist ')), { value: 'Protagonist' });
  assert.deepEqual(ok(await set(t.role, 'Heir')), { value: 'Heir' });
  assert.equal(await valueOf(db, e, t.role.id), 'Heir');
  assert.deepEqual(ok(await set(t.role, '   ')), { value: null });
  assert.equal(await valueOf(db, e, t.role.id), undefined);
  await refused(t.role, 42);
  await refused(t.role, 'x'.repeat(2001));

  // Number.
  assert.deepEqual(ok(await set(t.age, 19)), { value: 19 });
  assert.deepEqual(ok(await set(t.age, -2.5)), { value: -2.5 });
  await refused(t.age, '19');
  await refused(t.age, true);
  assert.deepEqual(ok(await set(t.age, null)), { value: null });

  // Checkbox: true is a value; false is none.
  assert.deepEqual(ok(await set(t.pov, true)), { value: true });
  assert.equal(await valueOf(db, e, t.pov.id), true);
  assert.deepEqual(ok(await set(t.pov, false)), { value: null });
  assert.equal(await valueOf(db, e, t.pov.id), undefined);
  await refused(t.pov, 'yes');

  // Date: a real calendar day as YYYY-MM-DD.
  const born = ok(await props.createCollectionProperty(t.cid, 'Born', 'date'));
  assert.deepEqual(ok(await set(born, '1402-03-12')), { value: '1402-03-12' });
  for (const bad of ['2024-02-30', '12/03/1402', '1402-3-12', '2024-02-29T10:00', 20240229]) await refused(born, bad);
  assert.deepEqual(ok(await set(born, '2024-02-29')), { value: '2024-02-29' });

  // Select / status: one of its own option ids.
  const dead = t.opt(t.status, 'Dead');
  assert.deepEqual(ok(await set(t.status, dead)), { value: dead });
  await refused(t.status, 'Dead');
  await refused(t.status, t.opt(t.affiliation, 'Drelareth'));
  await refused(t.status, [dead]);
  assert.deepEqual(ok(await set(t.status, '')), { value: null });

  // Multi-select: a list of its own option ids; [] clears.
  let traits = ok(await props.createCollectionProperty(t.cid, 'Traits', 'multi_select'));
  traits = ok(await props.updateCollectionProperty(traits.id, { options: [{ name: 'Brave' }, { name: 'Wry' }] })).property;
  assert.deepEqual(ok(await set(traits, [t.opt(traits, 'Wry')])), { value: [t.opt(traits, 'Wry')] });
  await refused(traits, t.opt(traits, 'Wry'));
  await refused(traits, [t.opt(traits, 'Wry'), 'nope']);
  assert.deepEqual(ok(await set(traits, [])), { value: null });

  // The database refuses an invalid value however it is written.
  await assert.rejects(db.query(
    `insert into public.workspace_entry_values (entry_id, property_id, collection_id, project_id, value) values ($1, $2, $3, $4, '"old"')`,
    [e, t.age.id, t.cid, HOLLOW]), /Invalid value for a number property/);
  await assert.rejects(db.query(
    `insert into public.workspace_entry_values (entry_id, property_id, collection_id, project_id, value) values ($1, $2, $3, $4, '""')`,
    [e, t.role.id, t.cid, HOLLOW]), /Invalid value for a text property/);

  // An Entry's body, version and timestamps are not touched by its values.
  const entry = await one(db, `select content, version, updated_at from public.workspace_collection_entries where id = $1`, [e]);
  assert.deepEqual(entry.content, { type: 'doc', content: [] });
  assert.equal(entry.version, 1);
});

test('values: never for another Collection\'s property — by the action or directly', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  // Nerai (Characters) and the Places property Kind.
  assert.equal((await props.setEntryPropertyValue(t.nerai.id, t.kind.id, t.opt(t.kind, 'Natural'))).error, 'Property not found');
  assert.equal((await props.setEntryPropertyValue(t.cave.id, t.role.id, 'x')).error, 'Property not found');
  assert.equal((await props.setEntryPropertyValue(MISSING, t.role.id, 'x')).error, 'Entry not found');
  assert.equal((await props.setEntryPropertyValue(t.nerai.id, MISSING, 'x')).error, 'Property not found');
  // Directly, claiming either Collection: one of the two foreign keys fails.
  for (const collectionId of [t.cid, t.places.collection.id]) {
    await assert.rejects(db.query(
      `insert into public.workspace_entry_values (entry_id, property_id, collection_id, project_id, value) values ($1, $2, $3, $4, '"x"')`,
      [t.nerai.id, t.kind.id, collectionId, HOLLOW]), /same_collection_fkey|Invalid value/);
  }
  // And a value never moves to another Entry or property.
  ok(await props.setEntryPropertyValue(t.nerai.id, t.role.id, 'Protagonist'));
  await assert.rejects(db.query(`update public.workspace_entry_values set entry_id = $1 where entry_id = $2`, [t.alaric.id, t.nerai.id]),
    /keeps its Entry and property for life/);
  await assert.rejects(db.query(`update public.workspace_collection_properties set collection_id = $1 where id = $2`, [t.places.collection.id, t.role.id]),
    /cannot move to another Collection|same_project_fkey|violates foreign key/);
  assert.equal(await valueCount(db), 1);
});

test('values: survive a fresh read — a new request, sign-in and loader see exactly what was saved', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  ok(await props.setEntryPropertyValue(t.nerai.id, t.role.id, 'Protagonist'));
  ok(await props.setEntryPropertyValue(t.nerai.id, t.status.id, t.opt(t.status, 'Alive')));
  ok(await props.setEntryPropertyValue(t.nerai.id, t.pov.id, true));
  ok(await props.setEntryPropertyValue(t.alaric.id, t.age.id, 27));

  signIn(db, ALICE); // a new client: nothing cached between requests
  const loaded = await workspace.loadProjectWorkspace(HOLLOW);
  assert.equal(loaded.propertied, true);
  assert.deepEqual(model.propertiesOf(loaded.properties, t.cid).map((p) => p.name), ['Role', 'Status', 'Affiliation', 'Age', 'POV']);
  assert.deepEqual(model.propertiesOf(loaded.properties, t.places.collection.id).map((p) => p.name), ['Kind']);
  const values = model.indexValues(loaded.values);
  assert.equal(values.size, 4);
  assert.equal(values.get(model.valueKey(t.nerai.id, t.role.id)), 'Protagonist');
  assert.equal(values.get(model.valueKey(t.nerai.id, t.pov.id)), true);
  assert.equal(values.get(model.valueKey(t.alaric.id, t.age.id)), 27);
  // The Entry itself reopens as before.
  assert.equal(ok(await collections.getCollectionEntry(t.nerai.id)).title, 'Nerai');
});

// ── 4. Removal ─────────────────────────────────────────────────────────────────

test('removal: only with the confirmed number of values; otherwise nothing changes and the real number comes back', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  ok(await props.setEntryPropertyValue(t.nerai.id, t.role.id, 'Protagonist'));
  ok(await props.setEntryPropertyValue(t.alaric.id, t.role.id, 'Rival'));
  ok(await props.setEntryPropertyValue(t.nerai.id, t.age.id, 19));
  saved(await collections.saveCollectionEntryContent(t.nerai.id, doc('Notes about Nerai.'), 1));
  const entriesBefore = await all(db, `select * from public.workspace_collection_entries order by id`);

  // Unconfirmed, or confirmed for a number that is no longer true: refused.
  assert.deepEqual(await props.deleteCollectionProperty(t.role.id, 0), { status: 'confirm', values: 2 });
  assert.deepEqual(await props.deleteCollectionProperty(t.role.id, 1), { status: 'confirm', values: 2 });
  assert.equal(await valueCount(db), 3);
  assert.equal((await schemaOf(db, t.cid)).length, 5);

  // Confirmed: the property and exactly its values go; the rest close up.
  assert.deepEqual(await props.deleteCollectionProperty(t.role.id, 2), { status: 'deleted', deletedValues: 2 });
  assert.deepEqual((await schemaOf(db, t.cid)).map(([n, , p]) => [n, p]), [['Status', 1], ['Affiliation', 2], ['Age', 3], ['POV', 4]]);
  assert.equal(await valueCount(db), 1);
  assert.equal(await valueOf(db, t.nerai.id, t.age.id), 19);
  // Entries — titles, bodies, versions — are untouched.
  assert.deepEqual(await all(db, `select * from public.workspace_collection_entries order by id`), entriesBefore);

  // A property with no values: confirmed as 0.
  assert.deepEqual(await props.deleteCollectionProperty(t.pov.id, 0), { status: 'deleted', deletedValues: 0 });
  assert.deepEqual(await props.deleteCollectionProperty(t.pov.id, 0), { status: 'error', error: 'Property not found' });
  // Its name is free again.
  ok(await props.createCollectionProperty(t.cid, 'Role', 'text'));
});

test('removal: an empty Collection still deletes (its properties go with it); Entries are still never deletable', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const empty = ok(await collections.createWorkspaceCollection(HOLLOW, 'Empty'));
  ok(await props.createCollectionProperty(empty.collection.id, 'Kind', 'select'));
  ok(await collections.deleteWorkspaceCollection(empty.collection.id));
  assert.equal((await one(db, `select count(*)::int as n from public.workspace_collection_properties`)).n, 0);

  const t = await hollow(db);
  ok(await props.setEntryPropertyValue(t.nerai.id, t.role.id, 'Protagonist'));
  assert.equal((await collections.deleteWorkspaceCollection(t.cid)).error, 'Only an empty collection can be deleted');
  assert.equal(await valueCount(db), 1);
  await assert.rejects(asUser(db, ALICE, (tx) => tx.query(`delete from public.workspace_collection_entries where id = $1`, [t.nerai.id])),
    /permission denied/);

  // Deleting the Project removes everything of it, values included.
  await db.query(`delete from public.projects where id = $1`, [HOLLOW]);
  assert.equal(await valueCount(db), 0);
  assert.equal((await one(db, `select count(*)::int as n from public.workspace_collection_properties`)).n, 0);
});

// ── 5. Isolation ───────────────────────────────────────────────────────────────

test('isolation: another writer can\'t read, define, change, remove or set anything of a writer\'s properties', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  ok(await props.setEntryPropertyValue(t.nerai.id, t.role.id, 'Protagonist'));
  const before = {
    props: await all(db, `select * from public.workspace_collection_properties order by id`),
    values: await all(db, `select * from public.workspace_entry_values order by entry_id, property_id`),
  };

  signIn(db, BRAM);
  const seen = await workspace.loadProjectWorkspace(HOLLOW);
  assert.deepEqual([seen.properties, seen.values], [[], []]);
  assert.equal((await props.createCollectionProperty(t.cid, 'Spy', 'text')).error, 'Collection not found');
  assert.equal((await props.updateCollectionProperty(t.role.id, { name: 'Mine' })).error, 'Property not found');
  assert.equal((await props.moveCollectionProperty(t.role.id, 3)).error, 'Property not found');
  assert.deepEqual(await props.deleteCollectionProperty(t.role.id, 1), { status: 'error', error: 'Property not found' });
  assert.equal((await props.setEntryPropertyValue(t.nerai.id, t.role.id, 'Villain')).error, 'Entry not found');

  // Not directly either: clients only read these tables.
  for (const sql of [
    [`insert into public.workspace_collection_properties (collection_id, project_id, name, type, position) values ($1, $2, 'X', 'text', 9)`, [t.cid, HOLLOW]],
    [`update public.workspace_collection_properties set name = 'X' where id = $1`, [t.role.id]],
    [`delete from public.workspace_collection_properties where id = $1`, [t.role.id]],
    [`insert into public.workspace_entry_values (entry_id, property_id, collection_id, project_id, value) values ($1, $2, $3, $4, '"x"')`, [t.alaric.id, t.role.id, t.cid, HOLLOW]],
    [`update public.workspace_entry_values set value = '"x"' where entry_id = $1`, [t.nerai.id]],
    [`delete from public.workspace_entry_values where entry_id = $1`, [t.nerai.id]],
  ]) {
    for (const user of [BRAM, ALICE]) {
      await assert.rejects(asUser(db, user, (tx) => tx.query(...sql)), /permission denied/, `${user === ALICE ? 'owner' : 'other'}: ${sql[0]}`);
    }
  }
  assert.deepEqual(await asUser(db, BRAM, async (tx) => (await tx.query(`select * from public.workspace_entry_values`)).rows), []);
  assert.deepEqual(await asUser(db, BRAM, async (tx) => (await tx.query(`select * from public.workspace_collection_properties`)).rows), []);
  // The owner reads her own.
  assert.equal((await asUser(db, ALICE, async (tx) => (await tx.query(`select * from public.workspace_entry_values`)).rows)).length, 1);

  // Bram's own Collections work as usual.
  const tides = ok(await collections.createWorkspaceCollection(TIDE, 'Tides'));
  const spring = ok(await collections.createCollectionEntry(tides.collection.id, 'Spring'));
  const height = ok(await props.createCollectionProperty(tides.collection.id, 'Height', 'number'));
  ok(await props.setEntryPropertyValue(spring.id, height.id, 4.2));
  // …and never reach Alice's.
  assert.equal((await props.setEntryPropertyValue(t.nerai.id, height.id, 1)).error, 'Entry not found');
  assert.equal((await props.setEntryPropertyValue(spring.id, t.role.id, 'x')).error, 'Property not found');

  assert.deepEqual(await all(db, `select * from public.workspace_collection_properties where project_id = $1 order by id`, [HOLLOW]), before.props);
  assert.deepEqual(await all(db, `select * from public.workspace_entry_values where project_id = $1 order by entry_id, property_id`, [HOLLOW]), before.values);

  const anon = createSupabaseAdapter(db, {});
  props.setServerClient(anon);
  assert.equal((await props.createCollectionProperty(t.cid, 'x', 'text')).error, 'Not authenticated');
  assert.equal((await props.setEntryPropertyValue(t.nerai.id, t.role.id, 'x')).error, 'Not authenticated');
});

// ── 6. The Collection list and the Entry read the same rules ───────────────────

test('list summary: shown properties in order, empty ones left out, checkboxes as their name, long text shortened', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  ok(await props.setEntryPropertyValue(t.nerai.id, t.role.id, 'Protagonist'));
  ok(await props.setEntryPropertyValue(t.nerai.id, t.status.id, t.opt(t.status, 'Alive')));
  ok(await props.setEntryPropertyValue(t.nerai.id, t.affiliation.id, t.opt(t.affiliation, 'Drelareth')));
  ok(await props.setEntryPropertyValue(t.nerai.id, t.age.id, 19)); // not shown in the list
  ok(await props.setEntryPropertyValue(t.alaric.id, t.status.id, t.opt(t.status, 'Alive')));
  ok(await props.setEntryPropertyValue(t.djal.id, t.role.id, `A ${'very '.repeat(20)}long role`));

  const summary = async () => {
    const loaded = await workspace.loadProjectWorkspace(HOLLOW);
    const list = model.propertiesOf(loaded.properties, t.cid);
    const values = model.indexValues(loaded.values);
    return Object.fromEntries([t.nerai, t.alaric, t.djal].map((e) => [e.title, model.listSummary(list, values, e.id)]));
  };
  let s = await summary();
  assert.deepEqual(s.Nerai, ['Protagonist', 'Alive', 'Drelareth']);
  assert.deepEqual(s.Alaric, ['Alive']);
  assert.equal(s.Djal.length, 1);
  assert.ok(s.Djal[0].length <= 60 && s.Djal[0].endsWith('…'));

  // The writer's choices: POV shown first, Status hidden.
  ok(await props.setEntryPropertyValue(t.nerai.id, t.pov.id, true));
  ok(await props.updateCollectionProperty(t.pov.id, { shown_in_list: true }));
  ok(await props.moveCollectionProperty(t.pov.id, 0));
  ok(await props.updateCollectionProperty(t.status.id, { shown_in_list: false }));
  s = await summary();
  assert.deepEqual(s.Nerai, ['POV', 'Protagonist', 'Drelareth']);
  assert.deepEqual(s.Alaric, []);

  // A Collection with no properties summarises nothing.
  const loaded = await workspace.loadProjectWorkspace(HOLLOW);
  assert.deepEqual(model.listSummary([], model.indexValues(loaded.values), t.nerai.id), []);
});

test('presentation helpers: values read as words; unknown option ids are skipped; numbers parse as typed', () => {
  const prop = (type, options = []) => ({ id: 'p', collection_id: 'c', name: 'POV', type, options, position: 1, shown_in_list: true });
  const opts = [{ id: 'a', name: 'Alive' }, { id: 'b', name: 'Dead' }];
  assert.equal(model.formatValue(prop('text'), '  x '), 'x');
  assert.equal(model.formatValue(prop('number'), 12000), (12000).toLocaleString());
  assert.equal(model.formatValue(prop('checkbox'), true), 'POV');
  assert.equal(model.formatValue(prop('checkbox'), undefined), null);
  assert.equal(model.formatValue(prop('select', opts), 'b'), 'Dead');
  assert.equal(model.formatValue(prop('select', opts), 'gone'), null, 'a removed option shows nothing');
  assert.equal(model.formatValue(prop('multi_select', opts), ['b', 'gone', 'a']), 'Alive, Dead', 'in option order');
  assert.match(model.formatValue(prop('date'), '1402-03-12'), /1402/);
  assert.equal(model.formatDateValue('2024-01-01').includes('2024'), true, 'never shifted a day by the time zone');

  const values = model.indexValues([
    { entry_id: 'e1', property_id: 'p', value: ['a', 'b'] },
    { entry_id: 'e2', property_id: 'p', value: ['b'] },
    { entry_id: 'e3', property_id: 'q', value: 'a' },
  ]);
  assert.equal(model.countValues(values, 'p'), 2);
  assert.equal(model.countOptionUses(values, 'p', 'a'), 1);
  assert.equal(model.countOptionUses(values, 'p', 'b'), 2);

  assert.equal(model.parseNumberInput(' 12,000 '), 12000);
  assert.equal(model.parseNumberInput('-3.5'), -3.5);
  assert.equal(model.parseNumberInput('.5'), 0.5);
  assert.equal(model.parseNumberInput('1e3'), 1000);
  for (const bad of ['', 'abc', '1.2.3', '--1', '12a']) assert.equal(model.parseNumberInput(bad), null, bad);
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

test('Pages, Folders, Collections, Entries, the tree and the manuscript are untouched by every property operation', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const ideas = ok(await pages.createWorkspacePage(HOLLOW, 'Ideas'));
  saved(await pages.saveWorkspacePageContent(ideas.id, doc('page body'), 1));
  ok(await tree.createWorkspaceFolder(HOLLOW, 'Research'));
  const c = ok(await collections.createWorkspaceCollection(HOLLOW, 'Characters'));
  const e = ok(await collections.createCollectionEntry(c.collection.id, 'Nerai'));
  saved(await collections.saveCollectionEntryContent(e.id, doc('A long entry about Nerai.'), 1));
  const snapshot = async () => ({
    manuscript: await manuscriptState(db),
    pages: await all(db, `select * from public.workspace_documents order by id`),
    folders: await all(db, `select * from public.workspace_folders order by id`),
    collections: await all(db, `select * from public.workspace_collections order by id`),
    entries: await all(db, `select * from public.workspace_collection_entries order by id`),
    nodes: await all(db, `select * from public.workspace_nodes order by id`),
  });
  const before = await snapshot();

  let role = ok(await props.createCollectionProperty(c.collection.id, 'Role', 'select'));
  role = ok(await props.updateCollectionProperty(role.id, { options: [{ name: 'Protagonist' }], name: 'Part' })).property;
  ok(await props.setEntryPropertyValue(e.id, role.id, role.options[0].id));
  const notes = ok(await props.createCollectionProperty(c.collection.id, 'Notes', 'text'));
  ok(await props.setEntryPropertyValue(e.id, notes.id, 'x'));
  ok(await props.moveCollectionProperty(notes.id, 0));
  ok(await props.updateCollectionProperty(role.id, { type: 'status' }));
  assert.equal((await props.deleteCollectionProperty(notes.id, 1)).status, 'deleted');
  ok(await props.setEntryPropertyValue(e.id, role.id, null));

  assert.deepEqual(await snapshot(), before, 'no manuscript, Page, Folder, Collection, Entry or node row changed');
});

test('before migration 026: the loader reports no properties, and Collections and Entries work exactly as before', async () => {
  const db = await seededDb();
  // Before 026 there are no Views or references either (027 and 028 require 026).
  await db.exec(`drop table public.object_references;
    drop trigger workspace_collections_default_view on public.workspace_collections; drop table public.workspace_collection_views;
    drop table public.workspace_entry_values; drop table public.workspace_collection_properties;`);
  signIn(db, ALICE);
  const c = ok(await collections.createWorkspaceCollection(HOLLOW, 'Characters'));
  ok(await collections.createCollectionEntry(c.collection.id, 'Nerai'));
  const loaded = await workspace.loadProjectWorkspace(HOLLOW);
  assert.equal(loaded.collectable, true);
  assert.equal(loaded.propertied, false);
  assert.deepEqual([loaded.properties, loaded.values], [[], []]);
  assert.deepEqual(loaded.entries.map((x) => x.title), ['Nerai']);
});
