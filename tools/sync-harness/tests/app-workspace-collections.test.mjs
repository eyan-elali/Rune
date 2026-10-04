// Workspace Collections + Entries (Rune 2.0 Workspace, Milestone 8, migration
// 025): the REAL Collection and Entry actions, tree actions and Workspace
// loader against the Rune 2.0 schema in real Postgres + RLS, the shared save
// engine driving an Entry, the device-copy store's upgrade, and the shell
// model that gives Collections and Entries one tab each.
//
//   * Collections: creation at the top level or in a Folder, one canonical
//     node, rename, move / reorder; never a tree parent; empty-only deletion
//   * Entries: creation, ownership through Collection → Project, title and
//     content persistence, reopen, conflict-safe saves, never deletable by a
//     client, never moving to another Collection
//   * ownership isolation between writers and Projects
//   * Pages, Folders and the manuscript are untouched by any of it
//
// Data: the synthetic legacy fixture moved into the Rune 2.0 schema.
// alice owns hollow and ash; bram owns tide.
import 'fake-indexeddb/auto';
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
const ASH = projectId('ash');
const TIDE = projectId('tide');
const MISSING = '00000000-0000-4000-8000-00000000dead';

const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const all = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const doc = (...paragraphs) => ({
  type: 'doc',
  content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
});

let legacy;
let collections, pages, tree, workspace, saverMod, model, target, ws, drafts, treeModel;
before(async () => {
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
  collections = await bundleForTest('src/lib/actions/workspaceCollections.ts', { name: 'wc_collections' });
  pages = await bundleForTest('src/lib/actions/workspacePages.ts', { name: 'wc_pages' });
  tree = await bundleForTest('src/lib/actions/workspaceTree.ts', { name: 'wc_tree' });
  workspace = await bundleForTest('src/lib/rune2/projectWorkspace.ts', { name: 'wc_loader' });
  saverMod = await bundleForTest('src/lib/rune2/workspacePageSaver.ts', { name: 'wc_saver' });
  model = await bundleForTest('src/lib/rune2/navigatorModel.ts', { name: 'wc_model' });
  target = await bundleForTest('src/lib/rune2/writingTarget.ts', { name: 'wc_target' });
  ws = await bundleForTest('src/lib/rune2/workingSet.ts', { name: 'wc_working_set' });
  drafts = await bundleForTest('src/lib/rune2/workspaceDrafts.ts', { name: 'wc_drafts' });
  treeModel = await bundleForTest('src/lib/rune2/workspaceTree.ts', { name: 'wc_tree_model' });
});

async function seededDb() {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  await prototypeLegacyToRune2(legacy, db);
  return db;
}

function signIn(db, userId) {
  const sb = createSupabaseAdapter(db, { userId });
  for (const mod of [collections, pages, tree, workspace]) mod.setServerClient(sb);
  return sb;
}

const ok = (r) => { assert.equal(r.error, null, r.error); return r.data; };
const saved = (r) => { assert.equal(r.status, 'ok', JSON.stringify(r)); return r; };

const nodeOf = async (db, id) =>
  one(db, `select * from public.workspace_nodes where document_id = $1 or folder_id = $1 or collection_id = $1`, [id]);

/** A Project's tree as [title, [children…]] from the real loader. */
async function shape(projectId) {
  const { tree: t } = await workspace.loadProjectWorkspace(projectId);
  const visit = (nodes) => nodes.map((n) => (n.children.length ? [n.title, visit(n.children)] : n.title));
  return visit(t);
}

async function assertContiguous(db) {
  const groups = await all(db, `
    select project_id, parent_node_id, array_agg(position order by position) as ps
      from public.workspace_nodes group by project_id, parent_node_id`);
  for (const g of groups) {
    assert.deepEqual(g.ps, g.ps.map((_, i) => i + 1), `siblings under ${g.parent_node_id ?? 'top'} are 1..n`);
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
 * Alice's Hollow Workspace:
 *   Ideas            [Page]
 *   Research         [Folder]
 *     Rome           [Page]
 *   Characters       [Collection]  — Nerai, Alaric, Djal
 */
async function hollow(db) {
  signIn(db, ALICE);
  const ideas = ok(await pages.createWorkspacePage(HOLLOW, 'Ideas'));
  const research = ok(await tree.createWorkspaceFolder(HOLLOW, 'Research'));
  const rome = ok(await pages.createWorkspacePage(HOLLOW, 'Rome', research.nodeId));
  const characters = ok(await collections.createWorkspaceCollection(HOLLOW, 'Characters'));
  const nerai = ok(await collections.createCollectionEntry(characters.collection.id, 'Nerai'));
  const alaric = ok(await collections.createCollectionEntry(characters.collection.id, 'Alaric'));
  const djal = ok(await collections.createCollectionEntry(characters.collection.id, 'Djal'));
  return { ideas, research, rome, characters, nerai, alaric, djal };
}

// ── 1. Collections ─────────────────────────────────────────────────────────────

test('collections: created at the top level with one canonical node; titles trimmed / blank = untitled / 200 max', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  ok(await pages.createWorkspacePage(HOLLOW, 'Ideas'));

  const characters = ok(await collections.createWorkspaceCollection(HOLLOW, '  Characters  '));
  assert.equal(characters.collection.title, 'Characters');
  assert.equal(characters.collection.project_id, HOLLOW);
  assert.equal(ok(await collections.createWorkspaceCollection(HOLLOW, '  ')).collection.title, null);
  assert.equal(ok(await collections.createWorkspaceCollection(HOLLOW, 'x'.repeat(300))).collection.title.length, 200);

  const node = await nodeOf(db, characters.collection.id);
  assert.equal(node.id, characters.nodeId);
  assert.equal(node.target_type, 'collection');
  assert.equal(node.document_id, null);
  assert.equal(node.folder_id, null);
  assert.equal(node.parent_node_id, null);
  assert.equal(node.position, 2, 'after the Page already there');
  assert.equal((await one(db, `select count(*)::int as n from public.workspace_nodes where collection_id = $1`, [characters.collection.id])).n, 1);
  await assertContiguous(db);

  // The loader shows it in the tree, beside the Page.
  const loaded = await workspace.loadProjectWorkspace(HOLLOW);
  assert.equal(loaded.collectable, true);
  assert.deepEqual(loaded.tree.map((n) => [n.kind, n.title]).slice(0, 2), [['page', 'Ideas'], ['collection', 'Characters']]);

  // A second node for the same Collection is impossible.
  await assert.rejects(db.query(
    `insert into public.workspace_nodes (project_id, target_type, collection_id, position) values ($1, 'collection', $2, 99)`,
    [HOLLOW, characters.collection.id]), /workspace_nodes_collection_id_key/);
  // Nor can a node claim to be a Collection with a Page's id, or two targets.
  await assert.rejects(db.query(
    `insert into public.workspace_nodes (project_id, target_type, collection_id, document_id, position) values ($1, 'collection', $2, $3, 99)`,
    [HOLLOW, characters.collection.id, (await nodeOf(db, loaded.pages[0].id)).document_id]), /target_matches_type/);
});

test('collections: created inside a Folder (at its end), renamed, and refused for another Project\'s Folder', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const lore = ok(await tree.createWorkspaceFolder(HOLLOW, 'Lore'));
  ok(await pages.createWorkspacePage(HOLLOW, 'History', lore.nodeId));
  const religions = ok(await collections.createWorkspaceCollection(HOLLOW, 'Religions', lore.nodeId));
  const node = await nodeOf(db, religions.collection.id);
  assert.equal(node.parent_node_id, lore.nodeId);
  assert.equal(node.position, 2);
  assert.deepEqual(await shape(HOLLOW), [['Lore', ['History', 'Religions']]]);

  assert.deepEqual(ok(await collections.renameWorkspaceCollection(religions.collection.id, ' Faiths ')), { title: 'Faiths' });
  assert.deepEqual(ok(await collections.renameWorkspaceCollection(religions.collection.id, '')), { title: null });
  assert.equal((await collections.renameWorkspaceCollection(MISSING, 'x')).error, 'Collection not found');
  assert.deepEqual(await nodeOf(db, religions.collection.id), node, 'a rename never moves it');

  // Another Project's Folder, or a Page, is not a parent.
  const ashFolder = ok(await tree.createWorkspaceFolder(ASH, 'Ash'));
  assert.equal((await collections.createWorkspaceCollection(HOLLOW, 'Nope', ashFolder.nodeId)).error, 'Folder not found');
  const page = ok(await pages.createWorkspacePage(HOLLOW, 'A page'));
  assert.equal((await collections.createWorkspaceCollection(HOLLOW, 'Nope', (await nodeOf(db, page.id)).id)).error, 'Folder not found');
  assert.equal((await one(db, `select count(*)::int as n from public.workspace_collections where title = 'Nope'`)).n, 0);
});

test('collections: move and reorder like any Workspace item; never a parent; cycles and other Projects refused', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  assert.deepEqual(await shape(HOLLOW), ['Ideas', ['Research', ['Rome']], 'Characters']);

  // Reorder at the top level.
  assert.deepEqual(ok(await tree.moveWorkspaceNode(t.characters.nodeId, null, 0)), { moved: true });
  assert.deepEqual(await shape(HOLLOW), ['Characters', 'Ideas', ['Research', ['Rome']]]);
  // Into a Folder, before its Page; the top level closes the gap.
  ok(await tree.moveWorkspaceNode(t.characters.nodeId, t.research.nodeId, 0));
  assert.deepEqual(await shape(HOLLOW), ['Ideas', ['Research', ['Characters', 'Rome']]]);
  await assertContiguous(db);
  // Reorder inside the Folder, then back out to the end.
  ok(await tree.moveWorkspaceNode(t.characters.nodeId, t.research.nodeId, 1));
  assert.deepEqual(await shape(HOLLOW), ['Ideas', ['Research', ['Rome', 'Characters']]]);
  ok(await tree.moveWorkspaceNode(t.characters.nodeId, null, null));
  assert.deepEqual(await shape(HOLLOW), ['Ideas', ['Research', ['Rome']], 'Characters']);
  await assertContiguous(db);

  // Nothing goes inside a Collection (its Entries are not tree items).
  const before = await all(db, `select * from public.workspace_nodes order by id`);
  assert.equal((await tree.moveWorkspaceNode((await nodeOf(db, t.ideas.id)).id, t.characters.nodeId, null)).error,
    'Only a Folder can hold other items');
  assert.equal((await tree.moveWorkspaceNode(t.research.nodeId, t.characters.nodeId, null)).error,
    'Only a Folder can hold other items');
  await assert.rejects(db.query(`update public.workspace_nodes set parent_node_id = $2 where id = $1`,
    [t.research.nodeId, t.characters.nodeId]), /Only a Folder/);
  // Nor to another Project, nor by another writer.
  const ashFolder = ok(await tree.createWorkspaceFolder(ASH, 'Ash'));
  assert.equal((await tree.moveWorkspaceNode(t.characters.nodeId, ashFolder.nodeId, null)).error,
    'Items can only move within their own Project');
  signIn(db, BRAM);
  assert.equal((await tree.moveWorkspaceNode(t.characters.nodeId, null, 0)).error, 'Item not found');
  assert.deepEqual(await all(db, `select * from public.workspace_nodes where project_id = $1 order by id`, [HOLLOW]),
    before.filter((n) => n.project_id === HOLLOW));

  // The node keeps its Collection for life.
  await assert.rejects(db.query(`update public.workspace_nodes set collection_id = null, target_type = 'page', document_id = $2 where id = $1`,
    [t.characters.nodeId, t.ideas.id]), /keeps its object for life/);
});

test('collection deletion: only an empty Collection; Entries are never lost; the gap closes', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const entriesBefore = await all(db, `select * from public.workspace_collection_entries order by id`);

  assert.equal((await collections.deleteWorkspaceCollection(t.characters.collection.id)).error, 'Only an empty collection can be deleted');
  assert.deepEqual(await all(db, `select * from public.workspace_collection_entries order by id`), entriesBefore);
  // Even the table owner cannot delete a Collection that holds an Entry.
  await assert.rejects(db.query(`delete from public.workspace_collections where id = $1`, [t.characters.collection.id]),
    /workspace_collection_entries_collection_same_project_fkey/);
  // Clients cannot delete Collections directly at all.
  await assert.rejects(asUser(db, ALICE, (tx) => tx.query(`delete from public.workspace_collections where id = $1`, [t.characters.collection.id])),
    /permission denied/);

  const empty = ok(await collections.createWorkspaceCollection(HOLLOW, 'Empty', t.research.nodeId));
  ok(await tree.moveWorkspaceNode(empty.nodeId, t.research.nodeId, 0));
  ok(await collections.deleteWorkspaceCollection(empty.collection.id));
  assert.equal(await nodeOf(db, empty.collection.id), undefined, 'its node went with it');
  assert.deepEqual(await shape(HOLLOW), ['Ideas', ['Research', ['Rome']], 'Characters']);
  await assertContiguous(db);

  assert.equal((await collections.deleteWorkspaceCollection(MISSING)).error, 'Collection not found');
  signIn(db, BRAM);
  const other = ok(await collections.createWorkspaceCollection(TIDE, 'Tide things'));
  signIn(db, ALICE);
  assert.equal((await collections.deleteWorkspaceCollection(other.collection.id)).error, 'Collection not found');
});

// ── 2. Entries ─────────────────────────────────────────────────────────────────

test('entries: created in a Collection, in creation order; the loader lists titles only, never content', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  assert.equal(t.nerai.collection_id, t.characters.collection.id);
  assert.equal(t.nerai.project_id, HOLLOW);
  assert.equal(t.nerai.version, 1);
  assert.deepEqual(t.nerai.content, { type: 'doc', content: [] });
  assert.equal(ok(await collections.createCollectionEntry(t.characters.collection.id, '   ')).title, null);

  saved(await collections.saveCollectionEntryContent(t.nerai.id, doc('Sworn to the Hollow crown.'), 1));
  const loaded = await workspace.loadProjectWorkspace(HOLLOW);
  assert.deepEqual(loaded.entries.map((e) => e.title), ['Nerai', 'Alaric', 'Djal', null]);
  assert.deepEqual(Object.keys(loaded.entries[0]).sort(), ['collection_id', 'created_at', 'id', 'title', 'updated_at'], 'never content');
  assert.deepEqual(loaded.collections.map((c) => c.title), ['Characters']);
  // Entries are not tree items.
  assert.equal((await one(db, `select count(*)::int as n from public.workspace_nodes where project_id = $1`, [HOLLOW])).n, 4);

  assert.equal((await collections.createCollectionEntry(MISSING, 'x')).error, 'Collection not found');
});

test('entries: title and content persist and reopen; saves are version-checked; a rename never bumps the version', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const id = t.nerai.id;

  const first = await collections.saveCollectionEntryContent(id, doc('Born in the salt marsh.'), 1);
  assert.equal(first.status, 'ok');
  assert.equal(first.version, 2);
  assert.deepEqual(ok(await collections.renameCollectionEntry(id, '  Nerai of Drelareth ')), { title: 'Nerai of Drelareth' });

  // Reopen (a refresh): exactly what was written.
  const reopened = ok(await collections.getCollectionEntry(id));
  assert.deepEqual(reopened.content, doc('Born in the salt marsh.'));
  assert.equal(reopened.title, 'Nerai of Drelareth');
  assert.equal(reopened.version, 2, 'the rename kept the version');
  assert.equal((await collections.saveCollectionEntryContent(id, doc('Born in the salt marsh.', 'Fled at twelve.'), 2)).status, 'ok',
    'a save pending across the rename still lands');

  // Another window still on version 2: nothing is written.
  assert.deepEqual(await collections.saveCollectionEntryContent(id, doc('elsewhere'), 2), { status: 'conflict', version: 3 });
  assert.deepEqual(ok(await collections.getCollectionEntry(id)).content, doc('Born in the salt marsh.', 'Fled at twelve.'));
  // Invalid content is refused before the database.
  assert.equal((await collections.saveCollectionEntryContent(id, { type: 'paragraph' }, 3)).status, 'error');
  assert.equal((await collections.saveCollectionEntryContent(id, doc('x'), 1.5)).status, 'error');
  assert.deepEqual(await collections.saveCollectionEntryContent(MISSING, doc('x'), 1), { status: 'not_found' });

  assert.deepEqual(ok(await collections.renameCollectionEntry(id, '')), { title: null });
  assert.equal((await collections.renameCollectionEntry(MISSING, 'x')).error, 'Entry not found');

  // Entry saves never touch the Page with the same shape of save.
  assert.equal(ok(await pages.getWorkspacePage(t.ideas.id)).version, 1);
});

test('entries: the database owns version and timestamps; an Entry never changes Collection or Project', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const other = ok(await collections.createWorkspaceCollection(HOLLOW, 'Locations'));

  const direct = await asUser(db, ALICE, async (tx) => (await tx.query(
    `insert into public.workspace_collection_entries (collection_id, project_id, version, created_at) values ($1, $2, 99, '2000-01-01') returning *`,
    [t.characters.collection.id, HOLLOW])).rows[0]);
  assert.equal(direct.version, 1);
  assert.notEqual(new Date(direct.created_at).getUTCFullYear(), 2000);

  await assert.rejects(asUser(db, ALICE, (tx) => tx.query(
    `update public.workspace_collection_entries set collection_id = $2 where id = $1`, [t.nerai.id, other.collection.id])),
    /cannot move to another Collection/);
  await assert.rejects(asUser(db, ALICE, (tx) => tx.query(
    `update public.workspace_collection_entries set project_id = $2 where id = $1`, [t.nerai.id, ASH])),
    /cannot move to another Project/);
  // project_id must be the Collection’s own (from 030 the insert policy refuses it before the foreign key does).
  await assert.rejects(asUser(db, ALICE, (tx) => tx.query(
    `insert into public.workspace_collection_entries (collection_id, project_id) values ($1, $2)`, [t.characters.collection.id, ASH])),
    /collection_same_project_fkey|row-level security/);
});

test('entries: no client DELETE (no Trash yet); deleting the Project removes Collections, Entries and nodes', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  await assert.rejects(asUser(db, ALICE, (tx) => tx.query(`delete from public.workspace_collection_entries where id = $1`, [t.nerai.id])),
    /permission denied/);
  assert.ok(await one(db, `select id from public.workspace_collection_entries where id = $1`, [t.nerai.id]));

  await db.query(`delete from public.projects where id = $1`, [HOLLOW]);
  for (const table of ['workspace_collection_entries', 'workspace_collections', 'workspace_nodes', 'workspace_documents', 'workspace_folders']) {
    assert.equal((await one(db, `select count(*)::int as n from public.${table} where project_id = $1`, [HOLLOW])).n, 0, table);
  }
});

// ── 3. ownership isolation ─────────────────────────────────────────────────────

test('isolation: another writer can\'t list, read, create in, save, rename or delete a writer\'s Collections and Entries', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  saved(await collections.saveCollectionEntryContent(t.nerai.id, doc('secret'), 1));

  signIn(db, BRAM);
  const seen = await workspace.loadProjectWorkspace(HOLLOW);
  assert.deepEqual([seen.collections, seen.entries], [[], []]);
  assert.equal((await collections.createWorkspaceCollection(HOLLOW, 'Intruder')).error, 'Project not found');
  assert.equal((await collections.renameWorkspaceCollection(t.characters.collection.id, 'Mine')).error, 'Collection not found');
  assert.equal((await collections.deleteWorkspaceCollection(t.characters.collection.id)).error, 'Collection not found');
  assert.equal((await collections.createCollectionEntry(t.characters.collection.id, 'Spy')).error, 'Collection not found');
  assert.equal((await collections.getCollectionEntry(t.nerai.id)).error, 'Entry not found');
  assert.deepEqual(await collections.saveCollectionEntryContent(t.nerai.id, doc('overwritten'), 2), { status: 'not_found' });
  assert.equal((await collections.renameCollectionEntry(t.nerai.id, 'Mine')).error, 'Entry not found');

  // Nor directly: an Entry in Alice's Collection under Bram's own Project id,
  // or under Alice's.
  await assert.rejects(asUser(db, BRAM, (tx) => tx.query(
    `insert into public.workspace_collection_entries (collection_id, project_id) values ($1, $2)`, [t.characters.collection.id, TIDE])),
    /collection_same_project_fkey|row-level security/);
  await assert.rejects(asUser(db, BRAM, (tx) => tx.query(
    `insert into public.workspace_collection_entries (collection_id, project_id) values ($1, $2)`, [t.characters.collection.id, HOLLOW])),
    /row-level security/);
  assert.deepEqual(await asUser(db, BRAM, async (tx) => (await tx.query(
    `update public.workspace_collection_entries set content = '{"type":"doc"}' where id = $1 returning id`, [t.nerai.id])).rows), []);

  // Bram's own Project works as usual.
  const mine = ok(await collections.createWorkspaceCollection(TIDE, 'Tides'));
  assert.equal(ok(await collections.createCollectionEntry(mine.collection.id, 'Spring')).project_id, TIDE);

  assert.deepEqual(await one(db, `select title, content, version from public.workspace_collection_entries where id = $1`, [t.nerai.id]),
    { title: 'Nerai', content: doc('secret'), version: 2 });

  const anon = createSupabaseAdapter(db, {});
  collections.setServerClient(anon);
  assert.equal((await collections.getCollectionEntry(t.nerai.id)).error, 'Not authenticated');
  assert.equal((await collections.createWorkspaceCollection(HOLLOW, 'x')).error, 'Not authenticated');
});

// ── 4. Pages, Folders and the manuscript are unchanged ─────────────────────────

test('Pages, Folders and the manuscript are untouched by every Collection and Entry operation', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const ideas = ok(await pages.createWorkspacePage(HOLLOW, 'Ideas'));
  saved(await pages.saveWorkspacePageContent(ideas.id, doc('page body'), 1));
  const research = ok(await tree.createWorkspaceFolder(HOLLOW, 'Research'));
  const manuscriptBefore = await manuscriptState(db);
  const pagesBefore = await all(db, `select * from public.workspace_documents order by id`);
  const foldersBefore = await all(db, `select * from public.workspace_folders order by id`);

  const c = ok(await collections.createWorkspaceCollection(HOLLOW, 'Characters', research.nodeId));
  const e = ok(await collections.createCollectionEntry(c.collection.id, 'Nerai'));
  saved(await collections.saveCollectionEntryContent(e.id, doc('A long entry about Nerai.'), 1));
  ok(await collections.renameCollectionEntry(e.id, 'Nerai Vess'));
  ok(await collections.renameWorkspaceCollection(c.collection.id, 'People'));
  ok(await tree.moveWorkspaceNode(c.nodeId, null, 0));
  const gone = ok(await collections.createWorkspaceCollection(HOLLOW, 'Gone'));
  ok(await collections.deleteWorkspaceCollection(gone.collection.id));

  assert.deepEqual(await manuscriptState(db), manuscriptBefore, 'no Scene, Chapter, total or writing history changed');
  assert.deepEqual(await all(db, `select * from public.workspace_documents order by id`), pagesBefore);
  assert.deepEqual(await all(db, `select * from public.workspace_folders order by id`), foldersBefore);
  // The Page and Folder keep their own places; only the gap the Collection left closed.
  assert.deepEqual(await shape(HOLLOW), ['People', 'Ideas', 'Research']);
  await assertContiguous(db);
});

// ── 5. the save engine drives an Entry ─────────────────────────────────────────

const settle = () => new Promise((r) => setImmediate(r));
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

test('an Entry saves through the shared engine against the real database: debounced, reopened, and conflict-safe', async () => {
  const db = await seededDb();
  const t = await hollow(db);
  const id = t.alaric.id;
  const timers = fakeTimers();
  const save = (content, v) => collections.saveCollectionEntryContent(id, content, v);

  const start = ok(await collections.getCollectionEntry(id));
  const saver = new saverMod.PageSaver({ content: start.content, version: start.version, save, timers });
  saver.change(doc('Alaric keeps the ledgers.'));
  assert.equal(saver.status, 'pending');
  await timers.advance(800);
  assert.equal(saver.status, 'saved');
  assert.equal(saver.version, 2);

  // Refresh: a new window reads the server and its (clean) device copy.
  const reopened = saverMod.openPage(
    { content: ok(await collections.getCollectionEntry(id)).content, version: 2 },
    { content: doc('Alaric keeps the ledgers.'), baseVersion: 2, dirty: false });
  assert.deepEqual(reopened, { content: doc('Alaric keeps the ledgers.'), version: 2, dirty: false, conflictVersion: null });

  // A second window saves first; this window's next save becomes a conflict — nothing is overwritten.
  saved(await collections.saveCollectionEntryContent(id, doc('Edited in another window.'), 2));
  saver.change(doc('Alaric keeps the ledgers.', 'And the keys.'));
  await timers.advance(800);
  assert.equal(saver.status, 'conflict');
  assert.deepEqual(ok(await collections.getCollectionEntry(id)).content, doc('Edited in another window.'));
  // Keeping this window's version writes it over the current one, deliberately.
  await saver.keepMine();
  assert.equal(saver.status, 'saved');
  const final = ok(await collections.getCollectionEntry(id));
  assert.deepEqual(final.content, doc('Alaric keeps the ledgers.', 'And the keys.'));
  assert.equal(final.version, 4);
});

test('device copies: Entries get their own store; upgrading the store keeps every Page draft', async () => {
  // A device with the version-1 database (Milestone 6/7) holding a Page draft.
  await new Promise((resolve, reject) => {
    const req = indexedDB.open('rune-workspace', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('page_drafts', { keyPath: 'id' });
    req.onsuccess = () => {
      const tx = req.result.transaction('page_drafts', 'readwrite');
      tx.objectStore('page_drafts').put({
        id: 'same-id', userId: ALICE, projectId: HOLLOW, content: doc('unsaved page'), baseVersion: 3, dirty: true, savedAt: 1,
      });
      tx.oncomplete = () => { req.result.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });

  const page = await drafts.getPageDraft('same-id', ALICE);
  assert.deepEqual(page.content, doc('unsaved page'), 'the Page draft survived the upgrade');
  assert.equal(page.dirty, true);
  assert.equal(await drafts.getPageDraft('same-id', ALICE, 'entry'), null, 'Entries never read Page drafts');

  await drafts.putPageDraft({ id: 'same-id', userId: ALICE, projectId: HOLLOW, content: doc('entry'), baseVersion: 1, dirty: true, savedAt: 2 }, 'entry');
  assert.deepEqual((await drafts.getPageDraft('same-id', ALICE, 'entry')).content, doc('entry'));
  assert.deepEqual((await drafts.getPageDraft('same-id', ALICE)).content, doc('unsaved page'), 'and the Page draft is untouched');
  assert.equal(await drafts.getPageDraft('same-id', BRAM, 'entry'), null, 'never another writer\'s copy');
});

// ── 6. the shell: one tab per Collection and per Entry ─────────────────────────

test('shell model: Collections and Entries are indexed by id, are not writing targets, and open in at most one tab each', () => {
  const folders = [{ id: 'f1', title: 'Lore' }];
  const cols = [{ id: 'c1', title: 'Characters' }, { id: 'c2', title: null }];
  const nodes = [
    { id: 'n1', target_type: 'folder', folder_id: 'f1', document_id: null, collection_id: null, parent_node_id: null, position: 1 },
    { id: 'n2', target_type: 'collection', collection_id: 'c1', document_id: null, folder_id: null, parent_node_id: 'n1', position: 1 },
    { id: 'n3', target_type: 'collection', collection_id: 'c2', document_id: null, folder_id: null, parent_node_id: null, position: 2 },
  ];
  const entries = [
    { id: 'e1', collection_id: 'c1', title: 'Nerai', created_at: '', updated_at: '' },
    { id: 'e2', collection_id: 'c1', title: null, created_at: '', updated_at: '' },
    { id: 'e3', collection_id: 'gone', title: 'Orphan', created_at: '', updated_at: '' },
  ];
  const built = treeModel.buildWorkspaceTree(nodes, [], folders, cols);
  const index = model.indexWorkspace(built, { e1: 'Nerai Vess' }, entries);

  const c1 = index.get('c1');
  assert.deepEqual([c1.kind, c1.title, c1.childCount, c1.entryIds], ['workspaceCollection', 'Characters', 2, ['e1', 'e2']]);
  assert.deepEqual(c1.path.map((p) => [p.kind, p.title]), [['workspaceFolder', 'Lore']]);
  assert.equal(index.get('c2').title, 'Untitled collection');
  assert.deepEqual([index.get('e1').kind, index.get('e1').title, index.get('e1').ordinal], ['collectionEntry', 'Nerai Vess', 1]);
  assert.deepEqual([index.get('e2').title, index.get('e2').named, index.get('e2').ordinal], ['Untitled', false, 2]);
  assert.deepEqual(index.get('e2').path.map((p) => [p.kind, p.id]), [['workspaceFolder', 'f1'], ['workspaceCollection', 'c1']]);
  assert.equal(index.has('e3'), false, 'an Entry is reached only through its Collection');
  assert.equal(model.isSelectable(c1), true);
  assert.equal(model.isSelectable(index.get('e1')), true);
  assert.equal(model.isWorkspaceKind('collectionEntry'), true);
  assert.equal(model.isWorkspaceKind('scene'), false);
  assert.equal(target.writingTargetFor(c1, index), null);
  assert.equal(target.writingTargetFor(index.get('e1'), index), null);

  const has = (k) => k === ws.MANUSCRIPT_TAB || (index.has(k) && model.isSelectable(index.get(k)));
  let s = { tabs: [ws.MANUSCRIPT_TAB], active: ws.MANUSCRIPT_TAB };
  s = ws.navigateTab(s, 'c1');
  s = ws.openTab(s, 'e1');
  s = ws.openTab(s, 'e1');
  s = ws.navigateTab(s, 'c1');
  s = ws.navigateTab(s, 'e1');
  assert.deepEqual(s, { tabs: ['c1', 'e1'], active: 'e1' }, 'the Collection and the Entry each have one tab');
  s = ws.openTab(s, 'c1');
  assert.deepEqual(s, { tabs: ['c1', 'e1'], active: 'c1' }, 'opening the Collection again goes to its tab');
  // An Entry whose Collection disappears loses its tab with it.
  assert.deepEqual(ws.resolveTabs({ tabs: ['c1', 'e1', 'gone'], active: 'gone' }, has).tabs, ['c1', 'e1']);
});
