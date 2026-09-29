// Workspace Trash (Rune 2.0 Workspace, Milestone 13, migration 030): the REAL
// actions, loader and pure rules against the Rune 2.0 schema in real Postgres
// + RLS.
//
//   * Page / Entry / Collection / Folder: trash, restore, permanent delete
//   * canonical ids, content, versions, values, Views and references survive
//     trash → restore unchanged; nothing is copied
//   * a Folder's items move up into its place and stay active
//   * restore to the original place, or to the top when that Folder is gone
//   * no duplicate nodes; sibling order 1..n everywhere, always
//   * trashed objects leave Search (titles, text), pickers, Views and the tree
//   * references go dormant (hidden, kept) and come back; editing a value
//     never drops its dormant targets
//   * permanent deletion removes references, never the other end
//   * saves into a trashed Page / Entry report "trashed" and write nothing;
//     the saver keeps the writing and resumes after a restore
//   * ownership and Project isolation; clients cannot trash, restore or read
//     trashed rows directly
//   * the manuscript boundary: no Scene, total or history changes
//
// Data: the synthetic legacy fixture moved into the Rune 2.0 schema. alice
// owns hollow and ash; bram owns tide.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, readRepoFile, asUser, LEGACY_BASELINE, RUNE2_SCHEMA } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';
import { prototypeLegacyToRune2 } from '../lib/legacy-to-rune2.mjs';
import { USERS, pageId, projectId, seedFixture } from '../fixtures/manuscript-fixture.mjs';

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
let trash, refs, props, views, collections, pages, tree, search, scenes, workspace, manuscriptLoader;
let refModel, viewModel, propModel, nav, engine, trashModel, saverMod;
before(async () => {
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
  trash = await bundleForTest('src/lib/actions/workspaceTrash.ts', { name: 'tr_trash' });
  refs = await bundleForTest('src/lib/actions/workspaceReferences.ts', { name: 'tr_refs' });
  props = await bundleForTest('src/lib/actions/workspaceProperties.ts', { name: 'tr_props' });
  views = await bundleForTest('src/lib/actions/workspaceViews.ts', { name: 'tr_views' });
  collections = await bundleForTest('src/lib/actions/workspaceCollections.ts', { name: 'tr_collections' });
  pages = await bundleForTest('src/lib/actions/workspacePages.ts', { name: 'tr_pages' });
  tree = await bundleForTest('src/lib/actions/workspaceTree.ts', { name: 'tr_tree' });
  search = await bundleForTest('src/lib/actions/projectSearch.ts', { name: 'tr_search' });
  scenes = await bundleForTest('src/lib/actions/scenes.ts', { name: 'tr_scenes' });
  workspace = await bundleForTest('src/lib/rune2/projectWorkspace.ts', { name: 'tr_loader' });
  manuscriptLoader = await bundleForTest('src/lib/rune2/projectManuscript.ts', { name: 'tr_manuscript' });
  refModel = await bundleForTest('src/lib/rune2/references.ts', { name: 'tr_ref_model' });
  viewModel = await bundleForTest('src/lib/rune2/collectionViews.ts', { name: 'tr_view_model' });
  propModel = await bundleForTest('src/lib/rune2/collectionProperties.ts', { name: 'tr_prop_model' });
  nav = await bundleForTest('src/lib/rune2/navigatorModel.ts', { name: 'tr_nav' });
  engine = await bundleForTest('src/lib/rune2/projectSearch.ts', { name: 'tr_engine' });
  trashModel = await bundleForTest('src/lib/rune2/trash.ts', { name: 'tr_model' });
  saverMod = await bundleForTest('src/lib/rune2/workspacePageSaver.ts', { name: 'tr_saver' });
});

async function seededDb() {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  await prototypeLegacyToRune2(legacy, db);
  return db;
}

function signIn(db, userId) {
  const sb = createSupabaseAdapter(db, { userId });
  for (const mod of [trash, refs, props, views, collections, pages, tree, search, scenes, workspace, manuscriptLoader]) mod.setServerClient(sb);
  return sb;
}

const ok = (r) => { assert.equal(r.error, null, r.error); return r.data; };
const refused = (r, message) => { assert.equal(r.data, null); if (message) assert.equal(r.error, message); else assert.ok(r.error); };

async function shellIndex(projectId = HOLLOW) {
  const [m, w] = [await manuscriptLoader.loadProjectManuscript(projectId), await workspace.loadProjectWorkspace(projectId)];
  return new Map([...nav.indexManuscript(m), ...nav.indexWorkspace(w.tree, {}, w.entries)]);
}

/** The top level (or a Folder's items) as the shell shows it: titles, in order. */
async function shown(folderTitle = null) {
  const w = await workspace.loadProjectWorkspace(HOLLOW);
  let list = w.tree;
  if (folderTitle) list = findFolder(w.tree, folderTitle).children;
  return list.map((n) => n.title);
}
function findFolder(nodes, title) {
  for (const n of nodes) {
    if (n.kind === 'folder' && n.title === title) return n;
    const inner = findFolder(n.children, title);
    if (inner) return inner;
  }
  return null;
}

/**
 * The tree's invariants for a Project: every active Page, Folder and
 * Collection has exactly one node, no trashed one has any, and every
 * parent's children are numbered 1..n.
 */
async function assertTreeSound(db, pid = HOLLOW) {
  const nodes = await all(db, `select * from public.workspace_nodes where project_id = $1`, [pid]);
  for (const [table, column] of [['workspace_documents', 'document_id'], ['workspace_folders', 'folder_id'], ['workspace_collections', 'collection_id']]) {
    const rows = await all(db, `select id, trashed_at from public.${table} where project_id = $1`, [pid]);
    for (const r of rows) {
      const count = nodes.filter((n) => n[column] === r.id).length;
      assert.equal(count, r.trashed_at ? 0 : 1, `${table} ${r.id}: ${count} nodes (trashed: ${Boolean(r.trashed_at)})`);
    }
  }
  const byParent = new Map();
  for (const n of nodes) byParent.set(n.parent_node_id, [...(byParent.get(n.parent_node_id) ?? []), n.position]);
  for (const [parent, positions] of byParent) {
    assert.deepEqual(positions.sort((a, b) => a - b), positions.map((_, i) => i + 1), `children of ${parent} numbered 1..n`);
  }
}

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

/**
 * Alice's Hollow Workspace: top level [Intro, Research, Characters, Ending];
 * Research holds [Magic Notes, Maps (Folder: [Old Map]), Factions]. Characters
 * has Nerai, Alaric, Djal; Factions has Drelareth. Characters has Role (text),
 * Status (status), Affiliation (→ Factions, one), Notes (→ Pages, many) and a
 * Table and a Board View.
 */
async function hollow(db) {
  signIn(db, ALICE);
  const intro = ok(await pages.createWorkspacePage(HOLLOW, 'Intro'));
  const research = ok(await tree.createWorkspaceFolder(HOLLOW, 'Research'));
  const characters = ok(await collections.createWorkspaceCollection(HOLLOW, 'Characters')).collection;
  const ending = ok(await pages.createWorkspacePage(HOLLOW, 'Ending'));
  const magic = ok(await pages.createWorkspacePage(HOLLOW, 'Magic Notes', research.nodeId));
  const maps = ok(await tree.createWorkspaceFolder(HOLLOW, 'Maps', research.nodeId));
  const oldMap = ok(await pages.createWorkspacePage(HOLLOW, 'Old Map', maps.nodeId));
  const factions = ok(await collections.createWorkspaceCollection(HOLLOW, 'Factions', research.nodeId)).collection;
  const nerai = ok(await collections.createCollectionEntry(characters.id, 'Nerai'));
  const alaric = ok(await collections.createCollectionEntry(characters.id, 'Alaric'));
  const djal = ok(await collections.createCollectionEntry(characters.id, 'Djal'));
  const drelareth = ok(await collections.createCollectionEntry(factions.id, 'Drelareth'));
  const role = ok(await props.createCollectionProperty(characters.id, 'Role', 'text'));
  let status = ok(await props.createCollectionProperty(characters.id, 'Status', 'status'));
  status = ok(await props.updateCollectionProperty(status.id, { options: [{ name: 'Alive' }, { name: 'Dead' }] })).property;
  const affiliation = ok(await refs.createRelationshipProperty(characters.id, 'Affiliation', 'entry', factions.id, false));
  const notes = ok(await refs.createRelationshipProperty(characters.id, 'Notes', 'page', null, true));
  const table = ok(await views.createCollectionView(characters.id, 'Table', 'table'));
  const board = ok(await views.createCollectionView(characters.id, 'Board', 'board', {
    properties: [], sort: null, filters: [], group_by: status.id,
  }));
  const opt = (name) => status.options.find((o) => o.name === name).id;
  return {
    intro, research, characters, ending, magic, maps, oldMap, factions,
    nerai, alaric, djal, drelareth, role, status, affiliation, notes, table, board, opt,
  };
}

// ── 1. Pages ───────────────────────────────────────────────────────────────────

test('page: trash hides it everywhere and keeps it whole; restore brings the same Page back to the same place', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const saved = await pages.saveWorkspacePageContent(t.magic.id, doc('Moon-tides bind the', 'weather of the sea.'), 1);
  assert.equal(saved.status, 'ok');
  const beforeRow = await one(db, `select id, title, content, version, created_at, updated_at from public.workspace_documents where id = $1`, [t.magic.id]);
  assert.deepEqual(await shown('Research'), ['Magic Notes', 'Maps', 'Factions']);

  assert.deepEqual(ok(await trash.trashWorkspaceObject('page', t.magic.id)), { moved: 0 });
  assert.deepEqual(await shown('Research'), ['Maps', 'Factions']);
  const index = await shellIndex();
  assert.equal(index.has(t.magic.id), false, 'not in the shell index: no tab, no search, no picker');
  const row = await one(db, `select id, title, content, version, created_at, updated_at, trashed_at, trashed_from_folder_id, trashed_from_position
    from public.workspace_documents where id = $1`, [t.magic.id]);
  assert.deepEqual({ ...row, trashed_at: undefined, trashed_from_folder_id: undefined, trashed_from_position: undefined },
    { ...beforeRow, trashed_at: undefined, trashed_from_folder_id: undefined, trashed_from_position: undefined },
    'id, title, content, version and timestamps unchanged');
  assert.ok(row.trashed_at);
  assert.deepEqual([row.trashed_from_folder_id, row.trashed_from_position], [t.research.folder.id, 1]);
  await assertTreeSound(db);

  // A window still showing it: its save and rename reach nothing, and it is told why.
  assert.deepEqual(await pages.saveWorkspacePageContent(t.magic.id, doc('late words'), saved.version), { status: 'trashed' });
  refused(await pages.renameWorkspacePage(t.magic.id, 'Renamed'));
  refused(await pages.getWorkspacePage(t.magic.id));
  assert.deepEqual((await one(db, `select content, version, title from public.workspace_documents where id = $1`, [t.magic.id])),
    { content: beforeRow.content, version: beforeRow.version, title: 'Magic Notes' }, 'nothing written while in Trash');
  refused(await trash.trashWorkspaceObject('page', t.magic.id), 'Already in Trash');

  const listed = ok(await trash.listWorkspaceTrash(HOLLOW));
  assert.deepEqual(listed.map((i) => [i.type, i.id, i.title, i.from_folder_title, i.from_folder_active]),
    [['page', t.magic.id, 'Magic Notes', 'Research', true]]);

  assert.deepEqual(ok(await trash.restoreWorkspaceObject('page', t.magic.id)), { location: 'original' });
  assert.deepEqual(await shown('Research'), ['Magic Notes', 'Maps', 'Factions'], 'first in Research again');
  const back = ok(await pages.getWorkspacePage(t.magic.id));
  assert.deepEqual([back.id, back.title, back.content, back.version], [beforeRow.id, 'Magic Notes', beforeRow.content, beforeRow.version]);
  assert.equal((await pages.saveWorkspacePageContent(t.magic.id, doc('late words'), back.version)).status, 'ok',
    'saving continues on the same version: Trash never made a conflict');
  refused(await trash.restoreWorkspaceObject('page', t.magic.id), 'Not in Trash');
  assert.deepEqual(ok(await trash.listWorkspaceTrash(HOLLOW)), []);
  await assertTreeSound(db);
});

test('page: permanent deletion only from Trash, irreversible; references go, the other ends stay', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  ok(await refs.setEntryRelationship(t.nerai.id, t.notes.id, [t.intro.id, t.ending.id]));
  ok(await refs.addObjectReference('page', t.intro.id, 'entry', t.alaric.id));
  ok(await refs.addObjectReference('scene', pageId('h4a'), 'page', t.intro.id));

  refused(await trash.deleteTrashedWorkspaceObject('page', t.intro.id), 'Only an item in Trash can be deleted permanently');
  ok(await trash.trashWorkspaceObject('page', t.intro.id));
  assert.deepEqual(ok(await trash.deleteTrashedWorkspaceObject('page', t.intro.id)), { entries: 0, properties: 0 });

  assert.equal(await one(db, `select id from public.workspace_documents where id = $1`, [t.intro.id]), undefined);
  assert.equal((await all(db, `select * from public.object_references where source_document_id = $1 or target_document_id = $1`, [t.intro.id])).length, 0);
  assert.deepEqual((await all(db, `select target_document_id from public.object_references where property_id = $1`, [t.notes.id])).map((r) => r.target_document_id),
    [t.ending.id], 'Nerai keeps her other note');
  assert.equal((await all(db, `select id from public.workspace_collection_entries where id in ($1, $2)`, [t.nerai.id, t.alaric.id])).length, 2);
  assert.ok(await one(db, `select id from public.scenes where id = $1`, [pageId('h4a')]), 'the linking Scene stays');
  refused(await trash.restoreWorkspaceObject('page', t.intro.id), 'Item not found');
  await assertTreeSound(db);
});

// ── 2. Entries ─────────────────────────────────────────────────────────────────

test('entry: trash leaves every View; its body, values and relationships survive; restore returns it to its Collection', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  ok(await props.setEntryPropertyValue(t.nerai.id, t.role.id, 'Protagonist'));
  ok(await props.setEntryPropertyValue(t.nerai.id, t.status.id, t.opt('Alive')));
  ok(await props.setEntryPropertyValue(t.alaric.id, t.status.id, t.opt('Dead')));
  ok(await refs.setEntryRelationship(t.nerai.id, t.affiliation.id, [t.drelareth.id]));
  ok(await refs.setEntryRelationship(t.nerai.id, t.notes.id, [t.magic.id]));
  ok(await refs.addObjectReference('page', t.intro.id, 'entry', t.nerai.id));
  const s = await collections.saveCollectionEntryContent(t.nerai.id, doc('Born under the second moon.'), 1);
  assert.equal(s.status, 'ok');
  const snapshot = async () => ({
    entry: await one(db, `select id, collection_id, title, content, version, created_at, updated_at from public.workspace_collection_entries where id = $1`, [t.nerai.id]),
    values: await all(db, `select * from public.workspace_entry_values where entry_id = $1 order by property_id`, [t.nerai.id]),
    references: await all(db, `select * from public.object_references where source_entry_id = $1 or target_entry_id = $1 order by id`, [t.nerai.id]),
    views: await all(db, `select * from public.workspace_collection_views order by id`),
  });
  const before = await snapshot();

  const present = async () => {
    const w = await workspace.loadProjectWorkspace(HOLLOW);
    const values = propModel.indexValues(w.values);
    const properties = propModel.propertiesOf(w.properties, t.characters.id);
    const titles = new Map(w.entries.map((e) => [e.id, e.title]));
    const input = { entryIds: w.entries.filter((e) => e.collection_id === t.characters.id).map((e) => e.id), properties, values, titleOf: (id) => titles.get(id) };
    const v = (type) => w.views.find((x) => x.collection_id === t.characters.id && x.type === type);
    return {
      list: viewModel.arrangeEntries(v('list'), input).map((id) => titles.get(id)),
      table: viewModel.arrangeEntries(v('table'), input).map((id) => titles.get(id)),
      board: viewModel.boardLanes(v('board'), properties, values, viewModel.arrangeEntries(v('board'), input))
        .lanes.map((l) => [l.name, l.entryIds.map((id) => titles.get(id))]),
      backlinksOfDrelareth: refModel.backlinksOf(w.references, t.drelareth.id).map((b) => b.source.id),
    };
  };
  const shownBefore = await present();
  assert.deepEqual(shownBefore.list, ['Nerai', 'Alaric', 'Djal']);
  assert.deepEqual(shownBefore.backlinksOfDrelareth, [t.nerai.id]);

  ok(await trash.trashWorkspaceObject('entry', t.nerai.id));
  const hidden = await present();
  assert.deepEqual(hidden.list, ['Alaric', 'Djal']);
  assert.deepEqual(hidden.table, ['Alaric', 'Djal']);
  assert.ok(!hidden.board.some(([, ids]) => ids.includes('Nerai')), 'in no Board lane');
  assert.deepEqual(hidden.backlinksOfDrelareth, [], 'a trashed source is no active backlink');
  assert.equal((await shellIndex()).get(t.characters.id).childCount, 2);

  // A window still showing it can change nothing about it.
  assert.deepEqual(await collections.saveCollectionEntryContent(t.nerai.id, doc('late'), s.version), { status: 'trashed' });
  refused(await props.setEntryPropertyValue(t.nerai.id, t.role.id, 'Villain'), 'Entry not found');
  refused(await props.setEntryPropertyValue(t.nerai.id, t.role.id, null), 'Entry not found');
  refused(await refs.setEntryRelationship(t.nerai.id, t.notes.id, []), 'Entry not found');
  refused(await collections.renameCollectionEntry(t.nerai.id, 'X'));
  assert.deepEqual(await snapshot(), before, 'body, values, references and Views all kept, unchanged');

  assert.deepEqual(ok(await trash.restoreWorkspaceObject('entry', t.nerai.id)), { location: 'original' });
  assert.deepEqual(await present(), shownBefore, 'back in every View, lane and backlink, where it was');
  assert.deepEqual(await snapshot(), before, 'the same Entry, values and reference rows — nothing duplicated');
});

test('entry: permanent deletion removes its values and references, never the objects it pointed to', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  ok(await props.setEntryPropertyValue(t.djal.id, t.role.id, 'Scout'));
  ok(await refs.setEntryRelationship(t.djal.id, t.affiliation.id, [t.drelareth.id]));
  ok(await refs.addObjectReference('entry', t.alaric.id, 'entry', t.djal.id));
  ok(await refs.addObjectReference('entry', t.djal.id, 'scene', pageId('h1a')));
  ok(await trash.trashWorkspaceObject('entry', t.djal.id));
  ok(await trash.deleteTrashedWorkspaceObject('entry', t.djal.id));

  assert.equal(await one(db, `select id from public.workspace_collection_entries where id = $1`, [t.djal.id]), undefined);
  assert.equal((await all(db, `select * from public.workspace_entry_values where entry_id = $1`, [t.djal.id])).length, 0);
  assert.equal((await all(db, `select * from public.object_references where source_entry_id = $1 or target_entry_id = $1`, [t.djal.id])).length, 0);
  assert.equal((await all(db, `select id from public.workspace_collection_entries where id in ($1, $2)`, [t.alaric.id, t.drelareth.id])).length, 2);
  assert.ok(await one(db, `select id from public.scenes where id = $1`, [pageId('h1a')]));
});

// ── 3. Collections ─────────────────────────────────────────────────────────────

test('collection: trashed as a unit — Entries, properties, values and Views kept, hidden, and restored coherently', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  ok(await props.setEntryPropertyValue(t.nerai.id, t.status.id, t.opt('Alive')));
  ok(await refs.setEntryRelationship(t.nerai.id, t.affiliation.id, [t.drelareth.id]));
  ok(await refs.addObjectReference('page', t.intro.id, 'entry', t.alaric.id));
  // Djal was trashed on his own before the Collection.
  ok(await trash.trashWorkspaceObject('entry', t.djal.id));
  const content = async () => ({
    collection: await one(db, `select id, title, created_at, updated_at from public.workspace_collections where id = $1`, [t.characters.id]),
    entries: await all(db, `select id, title, content, version, trashed_at from public.workspace_collection_entries where collection_id = $1 order by id`, [t.characters.id]),
    properties: await all(db, `select * from public.workspace_collection_properties where collection_id = $1 order by id`, [t.characters.id]),
    values: await all(db, `select * from public.workspace_entry_values where collection_id = $1 order by entry_id, property_id`, [t.characters.id]),
    views: await all(db, `select * from public.workspace_collection_views where collection_id = $1 order by id`, [t.characters.id]),
    references: await all(db, `select * from public.object_references order by id`),
  });
  const before = await content();

  ok(await trash.trashWorkspaceObject('collection', t.characters.id));
  assert.deepEqual(await shown(), ['Intro', 'Research', 'Ending']);
  const w = await workspace.loadProjectWorkspace(HOLLOW);
  assert.equal(w.collections.some((c) => c.id === t.characters.id), false);
  assert.equal(w.entries.some((e) => e.collection_id === t.characters.id), false, 'its Entries leave with it');
  assert.equal(w.references.some((r) => [r.source.id, r.target.id].includes(t.alaric.id) || r.source.id === t.nerai.id), false,
    'their references are dormant');
  assert.deepEqual(await content(), before, 'nothing written but the Collection’s own trash mark');

  // Nothing can be added to it while it is in Trash.
  refused(await collections.createCollectionEntry(t.characters.id, 'Ghost'), 'Collection not found');
  refused(await props.createCollectionProperty(t.characters.id, 'Age', 'number'));
  refused(await views.createCollectionView(t.characters.id, 'Another', 'table'));
  // An Entry trashed on its own can't come back without its Collection.
  refused(await trash.restoreWorkspaceObject('entry', t.djal.id), 'Restore its collection first');
  const listed = ok(await trash.listWorkspaceTrash(HOLLOW));
  assert.deepEqual(listed.map((i) => [i.type, i.title]).sort(), [['collection', 'Characters'], ['entry', 'Djal']]);
  const item = listed.find((i) => i.type === 'collection');
  assert.equal(item.entries, 3);
  assert.equal(listed.find((i) => i.type === 'entry').collection_active, false);

  assert.deepEqual(ok(await trash.restoreWorkspaceObject('collection', t.characters.id)), { location: 'original' });
  assert.deepEqual(await shown(), ['Intro', 'Research', 'Characters', 'Ending'], 'back in its place');
  const after = await workspace.loadProjectWorkspace(HOLLOW);
  assert.deepEqual(after.entries.filter((e) => e.collection_id === t.characters.id).map((e) => e.title), ['Nerai', 'Alaric'],
    'the Entries that were active; Djal stays in Trash');
  assert.deepEqual(await content(), before, 'the same Collection, Entries, properties, values, Views and references');
  ok(await trash.restoreWorkspaceObject('entry', t.djal.id));
  await assertTreeSound(db);
});

test('collection: permanent deletion takes its Entries, properties, values and Views — and only a Relationship that pointed at it', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  ok(await refs.setEntryRelationship(t.nerai.id, t.affiliation.id, [t.drelareth.id]));
  ok(await refs.addObjectReference('page', t.intro.id, 'entry', t.drelareth.id));
  ok(await trash.trashWorkspaceObject('collection', t.factions.id));
  const listed = ok(await trash.listWorkspaceTrash(HOLLOW)).find((i) => i.id === t.factions.id);
  assert.deepEqual([listed.entries, listed.properties], [1, 1]);
  assert.match(trashModel.deletionWarning(listed), /and its 1 entry permanently\? .* A relationship elsewhere that points here will be removed too\./);

  assert.deepEqual(ok(await trash.deleteTrashedWorkspaceObject('collection', t.factions.id)), { entries: 1, properties: 1 });
  for (const table of ['workspace_collection_entries', 'workspace_collection_properties', 'workspace_entry_values', 'workspace_collection_views']) {
    assert.equal((await all(db, `select 1 from public.${table} where collection_id = $1`, [t.factions.id])).length, 0, table);
  }
  assert.equal(await one(db, `select id from public.workspace_collection_properties where id = $1`, [t.affiliation.id]), undefined,
    'Characters’ Affiliation pointed only at Factions: it goes');
  assert.equal((await all(db, `select id from public.workspace_collection_properties where collection_id = $1`, [t.characters.id])).length, 3,
    'Characters keeps Role, Status and Notes');
  assert.equal((await all(db, `select id from public.workspace_collection_entries where collection_id = $1`, [t.characters.id])).length, 3);
  assert.ok(await one(db, `select id from public.workspace_documents where id = $1`, [t.intro.id]), 'the linking Page stays');
  await assertTreeSound(db);
});

// ── 4. Folders ─────────────────────────────────────────────────────────────────

test('folder: only the Folder goes to Trash; its items move up into its place and stay active; restore brings back an empty Folder', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  assert.deepEqual(ok(await trash.trashWorkspaceObject('folder', t.research.folder.id)), { moved: 3 });
  assert.deepEqual(await shown(), ['Intro', 'Magic Notes', 'Maps', 'Factions', 'Characters', 'Ending'],
    'Research’s items stand where it stood, in their order');
  assert.deepEqual(await shown('Maps'), ['Old Map'], 'a nested Folder keeps its own items');
  const w = await workspace.loadProjectWorkspace(HOLLOW);
  assert.ok(w.pages.some((p) => p.id === t.magic.id) && w.collections.some((c) => c.id === t.factions.id));
  assert.equal(w.entries.filter((e) => e.collection_id === t.factions.id).length, 1);
  assert.equal((await one(db, `select trashed_at from public.workspace_documents where id = $1`, [t.magic.id])).trashed_at, null);
  await assertTreeSound(db);

  assert.deepEqual(ok(await trash.restoreWorkspaceObject('folder', t.research.folder.id)), { location: 'original' });
  assert.deepEqual(await shown(), ['Intro', 'Research', 'Magic Notes', 'Maps', 'Factions', 'Characters', 'Ending']);
  assert.deepEqual(await shown('Research'), [], 'restored empty: its items stayed where they moved');
  await assertTreeSound(db);

  // An empty Folder can be deleted permanently from Trash; nothing else changes.
  ok(await trash.trashWorkspaceObject('folder', t.research.folder.id));
  ok(await trash.deleteTrashedWorkspaceObject('folder', t.research.folder.id));
  assert.deepEqual(await shown(), ['Intro', 'Magic Notes', 'Maps', 'Factions', 'Characters', 'Ending']);
  await assertTreeSound(db);
});

// ── 5. Restore locations ───────────────────────────────────────────────────────

test('restore: to the original place — or, when its Folder is in Trash or gone, to the end of the top level', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  // Top level, in the middle.
  ok(await trash.trashWorkspaceObject('collection', t.characters.id));
  ok(await pages.createWorkspacePage(HOLLOW, 'Later'));
  assert.deepEqual(ok(await trash.restoreWorkspaceObject('collection', t.characters.id)), { location: 'original' });
  assert.deepEqual(await shown(), ['Intro', 'Research', 'Characters', 'Ending', 'Later']);

  // Its Folder is in Trash: the top.
  ok(await trash.trashWorkspaceObject('page', t.oldMap.id));
  ok(await trash.trashWorkspaceObject('folder', t.maps.folder.id));
  let item = ok(await trash.listWorkspaceTrash(HOLLOW)).find((i) => i.id === t.oldMap.id);
  assert.deepEqual([item.from_folder_title, item.from_folder_active], ['Maps', false]);
  assert.equal(trashModel.trashContext(item), 'from a folder that is gone');
  assert.deepEqual(ok(await trash.restoreWorkspaceObject('page', t.oldMap.id)), { location: 'top' });
  assert.equal((await shown()).at(-1), 'Old Map');

  // Its Folder was deleted permanently: the top too.
  ok(await trash.trashWorkspaceObject('page', t.magic.id));
  ok(await trash.trashWorkspaceObject('folder', t.research.folder.id));
  ok(await trash.deleteTrashedWorkspaceObject('folder', t.research.folder.id));
  item = ok(await trash.listWorkspaceTrash(HOLLOW)).find((i) => i.id === t.magic.id);
  assert.equal(item.from_folder_active, false);
  assert.deepEqual(ok(await trash.restoreWorkspaceObject('page', t.magic.id)), { location: 'top' });
  assert.equal((await shown()).at(-1), 'Magic Notes');

  // A restored Folder can be the place for what comes back next.
  ok(await trash.restoreWorkspaceObject('folder', t.maps.folder.id));
  ok(await trash.trashWorkspaceObject('page', t.ending.id));
  ok(await tree.moveWorkspaceNode(findFolder((await workspace.loadProjectWorkspace(HOLLOW)).tree, 'Maps').nodeId, null, 0));
  ok(await trash.restoreWorkspaceObject('page', t.ending.id));
  assert.ok((await shown()).includes('Ending'));
  await assertTreeSound(db);
});

test('no duplicate nodes: repeated trash / restore keeps one node per object, and a node can never be added twice', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  for (let i = 0; i < 3; i += 1) {
    ok(await trash.trashWorkspaceObject('page', t.magic.id));
    ok(await trash.restoreWorkspaceObject('page', t.magic.id));
  }
  assert.equal((await all(db, `select id from public.workspace_nodes where document_id = $1`, [t.magic.id])).length, 1);
  await assert.rejects(db.query(`insert into public.workspace_nodes (project_id, target_type, document_id, position) values ($1, 'page', $2, 99)`,
    [HOLLOW, t.magic.id]), /workspace_nodes_document_id_key/);
  await assertTreeSound(db);
});

// ── 6. Search and pickers ──────────────────────────────────────────────────────

test('search: trashed Pages, Entries and a trashed Collection’s Entries are found by neither title nor text; restored, they are again', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  await pages.saveWorkspacePageContent(t.magic.id, doc('The lantern-glass is green.'), 1);
  await collections.saveCollectionEntryContent(t.nerai.id, doc('Her lantern-glass cracked.'), 1);
  await collections.saveCollectionEntryContent(t.drelareth.id, doc('A lantern-glass guild.'), 1);
  const text = async () => ok(await search.searchProjectContent(HOLLOW, 'lantern-glass')).map((m) => m.id).sort();
  const titles = async (q) => engine.searchProject(engine.searchObjects(await shellIndex()), q).map((r) => r.id);
  assert.deepEqual(await text(), [t.magic.id, t.nerai.id, t.drelareth.id].sort());

  ok(await trash.trashWorkspaceObject('page', t.magic.id));
  ok(await trash.trashWorkspaceObject('entry', t.nerai.id));
  ok(await trash.trashWorkspaceObject('collection', t.factions.id));
  assert.deepEqual(await text(), []);
  assert.deepEqual(await titles('Magic Notes'), []);
  assert.deepEqual(await titles('Nerai'), []);
  assert.deepEqual(await titles('Drelareth'), []);
  assert.deepEqual(await titles('Factions'), []);
  // Straight to the function, too (not only through RLS).
  const direct = await asUser(db, ALICE, async (tx) => (await tx.query(`select public.search_project_content($1, 'lantern-glass') as r`, [HOLLOW])).rows[0].r);
  assert.deepEqual(direct, []);

  ok(await trash.restoreWorkspaceObject('page', t.magic.id));
  ok(await trash.restoreWorkspaceObject('entry', t.nerai.id));
  ok(await trash.restoreWorkspaceObject('collection', t.factions.id));
  assert.deepEqual(await text(), [t.magic.id, t.nerai.id, t.drelareth.id].sort());
  assert.deepEqual(await titles('Nerai'), [t.nerai.id]);
});

test('pickers: a trashed object is never offered, and the database refuses it as a new target', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  ok(await trash.trashWorkspaceObject('page', t.magic.id));
  ok(await trash.trashWorkspaceObject('entry', t.alaric.id));
  const index = await shellIndex();
  assert.equal(refModel.candidates(index, { type: 'page' }).some((c) => c.id === t.magic.id), false);
  assert.deepEqual(refModel.candidates(index, { type: 'entry', collectionId: t.characters.id }).map((c) => c.title), ['Nerai', 'Djal']);
  assert.equal(refModel.candidates(index, { type: 'any' }, 'Alaric').length, 0);

  refused(await refs.setEntryRelationship(t.nerai.id, t.notes.id, [t.magic.id]), 'Not a valid target');
  refused(await refs.addObjectReference('entry', t.nerai.id, 'page', t.magic.id));
  refused(await refs.addObjectReference('page', t.magic.id, 'entry', t.nerai.id));
  refused(await refs.addObjectReference('scene', pageId('h1a'), 'entry', t.alaric.id));
  ok(await trash.trashWorkspaceObject('collection', t.factions.id));
  refused(await refs.createRelationshipProperty(t.characters.id, 'Guild', 'entry', t.factions.id, true));
  assert.equal((await all(db, `select * from public.object_references`)).length, 0, 'nothing was linked');
});

// ── 7. References and backlinks ────────────────────────────────────────────────

test('references: dormant while an end is in Trash — hidden, kept, never dropped by an edit — and back on restore', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  ok(await refs.setEntryRelationship(t.nerai.id, t.notes.id, [t.intro.id, t.magic.id, t.ending.id]));
  ok(await refs.setEntryRelationship(t.alaric.id, t.affiliation.id, [t.drelareth.id]));
  ok(await refs.addObjectReference('page', t.magic.id, 'entry', t.djal.id));
  ok(await refs.addObjectReference('scene', pageId('h4a'), 'page', t.magic.id));
  const rows = async () => all(db, `select * from public.object_references order by id`);
  const before = await rows();

  ok(await trash.trashWorkspaceObject('page', t.magic.id));
  let loaded = await workspace.loadProjectWorkspace(HOLLOW);
  const values = refModel.relationshipValues(loaded.references);
  assert.deepEqual(values.get(propModel.valueKey(t.nerai.id, t.notes.id)), [t.intro.id, t.ending.id], 'shown without it');
  assert.deepEqual(refModel.backlinksOf(loaded.references, t.djal.id), [], 'a trashed Page is no backlink');
  assert.equal(refModel.relatedOf(loaded.references, pageId('h4a')).length, 0);
  assert.deepEqual(await rows(), before, 'every row kept');

  // The writer edits the visible value: the dormant target stays, after it.
  ok(await refs.setEntryRelationship(t.nerai.id, t.notes.id, [t.ending.id, t.intro.id]));
  assert.deepEqual((await all(db, `select target_document_id, position from public.object_references where property_id = $1 order by position`, [t.notes.id]))
    .map((r) => [r.target_document_id, r.position]), [[t.ending.id, 1], [t.intro.id, 2], [t.magic.id, 3]]);
  ok(await refs.setEntryRelationship(t.nerai.id, t.notes.id, []));
  assert.deepEqual((await all(db, `select target_document_id from public.object_references where property_id = $1`, [t.notes.id])).map((r) => r.target_document_id),
    [t.magic.id], 'clearing the visible value keeps the dormant one');

  // A one-value Relationship: a dormant target is replaced when a new one is chosen.
  ok(await trash.trashWorkspaceObject('entry', t.drelareth.id));
  const guild = ok(await collections.createCollectionEntry(t.factions.id, 'Guild'));
  ok(await refs.setEntryRelationship(t.alaric.id, t.affiliation.id, []));
  assert.equal((await all(db, `select 1 from public.object_references where property_id = $1`, [t.affiliation.id])).length, 1, 'clearing keeps it');
  ok(await refs.setEntryRelationship(t.alaric.id, t.affiliation.id, [guild.id]));
  assert.deepEqual((await all(db, `select target_entry_id from public.object_references where property_id = $1`, [t.affiliation.id])).map((r) => r.target_entry_id), [guild.id]);

  ok(await trash.restoreWorkspaceObject('page', t.magic.id));
  loaded = await workspace.loadProjectWorkspace(HOLLOW);
  assert.deepEqual(refModel.relationshipValues(loaded.references).get(propModel.valueKey(t.nerai.id, t.notes.id)), [t.magic.id]);
  assert.deepEqual(refModel.backlinksOf(loaded.references, t.djal.id).map((b) => b.source.id), [t.magic.id]);
  assert.deepEqual(refModel.relatedOf(loaded.references, pageId('h4a')).map((r) => r.target.id), [t.magic.id]);
  const generic = (await rows()).filter((r) => r.property_id === null);
  assert.deepEqual(generic, before.filter((r) => r.property_id === null), 'the same generic reference rows, same ids');
});

// ── 8. Ownership, isolation, clients ───────────────────────────────────────────

test('ownership and Project isolation: another writer can do nothing to Trash; each Project has its own', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const ashPage = ok(await pages.createWorkspacePage(ASH, 'Ash note'));
  ok(await trash.trashWorkspaceObject('page', ashPage.id));
  ok(await trash.trashWorkspaceObject('page', t.magic.id));
  assert.deepEqual(ok(await trash.listWorkspaceTrash(HOLLOW)).map((i) => i.id), [t.magic.id]);
  assert.deepEqual(ok(await trash.listWorkspaceTrash(ASH)).map((i) => i.id), [ashPage.id]);

  signIn(db, BRAM);
  refused(await trash.listWorkspaceTrash(HOLLOW), 'Project not found');
  refused(await trash.trashWorkspaceObject('page', t.intro.id), 'Item not found');
  refused(await trash.trashWorkspaceObject('entry', t.nerai.id), 'Item not found');
  refused(await trash.restoreWorkspaceObject('page', t.magic.id), 'Item not found');
  refused(await trash.deleteTrashedWorkspaceObject('page', t.magic.id), 'Item not found');
  refused(await trash.trashWorkspaceObject('scene', pageId('h1a')), 'Item not found');
  refused(await trash.trashWorkspaceObject('chapter', pageId('h1a')), 'Unknown item type');
  assert.deepEqual(ok(await trash.listWorkspaceTrash(TIDE)), []);
  const state = await asUser(db, BRAM, async (tx) => (await tx.query(`select public.workspace_trash_state('page', $1) as s`, [t.magic.id])).rows[0].s);
  assert.deepEqual(state, { status: 'ok', state: 'missing' }, 'another writer learns nothing');
  assert.ok(await one(db, `select id from public.workspace_documents where id = $1 and trashed_at is not null`, [t.magic.id]));
  assert.ok(await one(db, `select id from public.workspace_documents where id = $1 and trashed_at is null`, [t.intro.id]));
});

test('clients: cannot read, trash, restore or write trashed rows directly — only through the Trash functions', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  ok(await trash.trashWorkspaceObject('page', t.magic.id));
  ok(await trash.trashWorkspaceObject('collection', t.factions.id));
  await asUser(db, ALICE, async (tx) => {
    assert.equal((await tx.query(`select id from public.workspace_documents where id = $1`, [t.magic.id])).rows.length, 0);
    assert.equal((await tx.query(`select id from public.workspace_collection_entries where id = $1`, [t.drelareth.id])).rows.length, 0);
    const restored = await tx.query(`update public.workspace_documents set trashed_at = null where id = $1`, [t.magic.id]);
    assert.equal(restored.affectedRows ?? restored.rowCount ?? 0, 0, 'a trashed row cannot be restored by an update');
  });
  await assert.rejects(asUser(db, ALICE, (tx) => tx.query(`update public.workspace_documents set trashed_at = now() where id = $1`, [t.intro.id])),
    /row-level security/, 'nor trashed by one');
  await assert.rejects(asUser(db, ALICE, (tx) => tx.query(
    `insert into public.workspace_collection_entries (collection_id, project_id, title) values ($1, $2, 'Ghost')`, [t.factions.id, HOLLOW])),
  /row-level security/, 'the previous app’s direct insert into a trashed Collection');
  await assert.rejects(asUser(db, ALICE, (tx) => tx.query(`delete from public.workspace_documents where id = $1`, [t.magic.id])), /permission denied/);
  for (const fn of ['trash_workspace_object', 'restore_workspace_object', 'delete_trashed_workspace_object', 'list_workspace_trash', 'workspace_trash_state']) {
    const anon = await one(db, `select has_function_privilege('anon', p.oid, 'execute') as a from pg_proc p where proname = $1`, [fn]);
    assert.equal(anon.a, false, `${fn}: not for anon`);
  }
  // Deleting the Project still removes everything, Trash included.
  await db.query(`delete from public.projects where id = $1`, [HOLLOW]);
  for (const table of ['workspace_documents', 'workspace_folders', 'workspace_collections', 'workspace_collection_entries', 'object_references']) {
    assert.equal((await all(db, `select 1 from public.${table} where project_id = $1`, [HOLLOW])).length, 0, table);
  }
});

// ── 9. The manuscript boundary ─────────────────────────────────────────────────

test('manuscript boundary: every Trash operation leaves every Scene, total, session and history exactly as it was', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  ok(await refs.addObjectReference('scene', pageId('h4a'), 'entry', t.nerai.id));
  ok(await refs.setEntryRelationship(t.nerai.id, t.notes.id, [t.intro.id]));
  const before = await manuscriptState(db);
  for (const [type, id] of [['entry', t.nerai.id], ['page', t.intro.id], ['collection', t.characters.id], ['folder', t.research.folder.id]]) {
    ok(await trash.trashWorkspaceObject(type, id));
  }
  ok(await trash.restoreWorkspaceObject('collection', t.characters.id));
  ok(await trash.restoreWorkspaceObject('entry', t.nerai.id));
  ok(await trash.deleteTrashedWorkspaceObject('page', t.intro.id));
  ok(await trash.deleteTrashedWorkspaceObject('folder', t.research.folder.id));
  assert.deepEqual(await manuscriptState(db), before, 'no manuscript row, version, word count, session or total changed');
  const m = await manuscriptLoader.loadProjectManuscript(HOLLOW);
  assert.equal(m.manuscriptWords, before.projects.find((p) => p.id === HOLLOW).word_count);
});

// ── 10. The save engine and the wording ────────────────────────────────────────

function fakeTimers() {
  let seq = 0;
  const pending = new Map();
  return {
    set: (fn) => { const id = ++seq; pending.set(id, fn); return id; },
    clear: (id) => pending.delete(id),
    async runAll() {
      while (pending.size) {
        const [id, fn] = pending.entries().next().value;
        pending.delete(id);
        fn();
        await new Promise((r) => setImmediate(r));
      }
    },
  };
}

test('saver: a trashed document stops saving, keeps the writing on the device, and resumes on the same version after a restore', async () => {
  const server = { version: 4, trashed: false, calls: [] };
  const drafts = [];
  const timers = fakeTimers();
  const saver = new saverMod.PageSaver({
    content: doc('start'),
    version: 4,
    save: async (content, expected) => {
      server.calls.push(expected);
      if (server.trashed) return { status: 'trashed' };
      server.version += 1;
      return { status: 'ok', version: server.version, updated_at: '' };
    },
    persist: (d) => drafts.push(d),
    timers,
  });
  server.trashed = true;
  saver.change(doc('written after it was trashed elsewhere'));
  await timers.runAll();
  assert.equal(saver.status, 'trashed');
  assert.equal(saver.dirty, true);
  assert.deepEqual(drafts.at(-1), { content: doc('written after it was trashed elsewhere'), baseVersion: 4, dirty: true });
  saver.change(doc('and more'));
  await timers.runAll();
  await saver.flush();
  assert.deepEqual(server.calls, [4], 'no retries into Trash');

  server.trashed = false;
  await saver.resume();
  assert.equal(saver.status, 'saved');
  assert.deepEqual(server.calls, [4, 4], 'saved on the version it was based on');
  assert.equal(saver.version, 5);
});

test('wording: what an item is, where it came from, and exactly what a permanent deletion loses', () => {
  const base = { id: 'x', trashed_at: new Date().toISOString(), from_folder_id: null, from_folder_title: null, from_folder_active: null,
    collection_id: null, collection_title: null, collection_active: null, entries: null, properties: null };
  assert.equal(trashModel.trashTypeOf({ kind: 'workspacePage' }), 'page');
  assert.equal(trashModel.trashTypeOf({ kind: 'collectionEntry' }), 'entry');
  assert.equal(trashModel.trashTypeOf({ kind: 'scene' }), 'scene', 'Scenes have Trash (031)');
  assert.equal(trashModel.trashTypeOf({ kind: 'chapter' }), null, 'Chapters have no Trash yet');
  assert.equal(trashModel.trashItemTitle({ type: 'page', title: null }), 'Untitled');
  assert.equal(trashModel.trashContext({ ...base, type: 'page' }), 'from the Workspace');
  assert.equal(trashModel.trashContext({ ...base, type: 'page', from_folder_id: 'f', from_folder_title: 'Research', from_folder_active: true }), 'from Research');
  assert.equal(trashModel.trashContext({ ...base, type: 'entry', collection_title: 'Characters', collection_active: false }), 'in Characters, which is in Trash');
  assert.equal(trashModel.trashContext({ ...base, type: 'collection', entries: 1 }), '1 entry');
  assert.equal(trashModel.deletionWarning({ ...base, type: 'page', title: 'Notes' }), 'Delete “Notes” permanently? Its writing can’t be recovered.');
  assert.equal(trashModel.deletionWarning({ ...base, type: 'collection', title: 'Places', entries: 0, properties: 0 }),
    'Delete “Places” permanently? Its properties and views can’t be recovered.');
  assert.equal(trashModel.trashedWhen(base.trashed_at), 'just now');
  assert.equal(trashModel.trashedWhen(new Date(Date.now() - 3 * 3600_000).toISOString()), '3 hours ago');
});
