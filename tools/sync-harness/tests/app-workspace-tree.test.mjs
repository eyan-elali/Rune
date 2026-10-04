// The Workspace tree (Rune 2.0 Workspace, Milestone 7, migration 024): the REAL
// tree and Page actions and the Workspace loader against the Rune 2.0 schema in
// real Postgres + RLS, and the pure tree model the navigator uses.
//
//   * Folders: creation, rename, nesting; direct INSERT/DELETE refused
//   * placement: every Page and Folder has exactly one node, created with it —
//     including a Page inserted directly by a pre-024 client
//   * move / reorder: atomic, siblings always 1..n, cycles, non-Folder parents
//     and cross-Project moves refused, Page identity and content untouched
//   * ownership isolation; empty-Folder deletion only
//   * the manuscript is untouched by any of it
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
let pages, tree, workspace, model, treeModel;
before(async () => {
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
  pages = await bundleForTest('src/lib/actions/workspacePages.ts', { name: 'wt_pages' });
  tree = await bundleForTest('src/lib/actions/workspaceTree.ts', { name: 'wt_tree' });
  workspace = await bundleForTest('src/lib/rune2/projectWorkspace.ts', { name: 'wt_loader' });
  model = await bundleForTest('src/lib/rune2/navigatorModel.ts', { name: 'wt_model' });
  treeModel = await bundleForTest('src/lib/rune2/workspaceTree.ts', { name: 'wt_tree_model' });
});

async function seededDb() {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  await prototypeLegacyToRune2(legacy, db);
  return db;
}

function signIn(db, userId) {
  const sb = createSupabaseAdapter(db, { userId });
  for (const mod of [pages, tree, workspace]) mod.setServerClient(sb);
  return sb;
}

const ok = (r) => { assert.equal(r.error, null, r.error); return r.data; };

const nodeOf = async (db, id) =>
  one(db, `select * from public.workspace_nodes where document_id = $1 or folder_id = $1`, [id]);

/** A Project's tree as [title, [children…]] from the real loader. */
async function shape(projectId) {
  const { tree: t } = await workspace.loadProjectWorkspace(projectId);
  const visit = (nodes) => nodes.map((n) => (n.children.length ? [n.title, visit(n.children)] : n.title));
  return visit(t);
}

/** Every parent's children are numbered exactly 1..n. */
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

// ── 1. Folders and placement ───────────────────────────────────────────────────

test('folders: created at the end of their parent, titles trimmed / blank = untitled / 200 max; renamed under RLS', async () => {
  const db = await seededDb();
  signIn(db, ALICE);

  const research = ok(await tree.createWorkspaceFolder(HOLLOW, '  Research  '));
  assert.equal(research.folder.title, 'Research');
  assert.equal(research.folder.project_id, HOLLOW);
  assert.equal(ok(await tree.createWorkspaceFolder(HOLLOW, '   ')).folder.title, null);
  assert.equal(ok(await tree.createWorkspaceFolder(HOLLOW, 'x'.repeat(300))).folder.title.length, 200);

  const node = await nodeOf(db, research.folder.id);
  assert.equal(node.id, research.nodeId);
  assert.equal(node.target_type, 'folder');
  assert.equal(node.parent_node_id, null);
  assert.equal(node.position, 1);

  assert.deepEqual(ok(await tree.renameWorkspaceFolder(research.folder.id, ' Sources ')), { title: 'Sources' });
  assert.deepEqual(ok(await tree.renameWorkspaceFolder(research.folder.id, '')), { title: null });
  assert.equal((await tree.renameWorkspaceFolder(MISSING, 'x')).error, 'Folder not found');
  // A rename never moves it.
  assert.deepEqual(await nodeOf(db, research.folder.id), node);
});

test('placement: a Page created in a Folder lands at its end; a Page inserted directly (a pre-024 client) still gets a top-level node', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const research = ok(await tree.createWorkspaceFolder(HOLLOW, 'Research'));
  const history = ok(await tree.createWorkspaceFolder(HOLLOW, 'History', research.nodeId));
  const rome = ok(await pages.createWorkspacePage(HOLLOW, 'Notes on Rome', history.nodeId));
  const sources = ok(await pages.createWorkspacePage(HOLLOW, 'Sources', research.nodeId));
  const loose = ok(await pages.createWorkspacePage(HOLLOW, 'Loose Ideas'));

  // The M6 path: a plain INSERT under RLS.
  const stale = await asUser(db, ALICE, async (tx) => (await tx.query(
    `insert into public.workspace_documents (project_id, title) values ($1, 'From an old tab') returning id`, [HOLLOW])).rows[0]);
  const staleNode = await nodeOf(db, stale.id);
  assert.equal(staleNode.parent_node_id, null);

  assert.deepEqual(await shape(HOLLOW), [
    ['Research', [['History', ['Notes on Rome']], 'Sources']],
    'Loose Ideas',
    'From an old tab',
  ]);
  assert.equal((await nodeOf(db, rome.id)).parent_node_id, history.nodeId);
  assert.equal((await nodeOf(db, sources.id)).parent_node_id, research.nodeId);
  assert.equal(rome.project_id, HOLLOW, 'a Page belongs to the Project, wherever it sits');
  assert.equal((await nodeOf(db, loose.id)).position, 2);
  await assertContiguous(db);

  // Only a Folder can hold things; the destination must be in the same Project.
  assert.equal((await pages.createWorkspacePage(HOLLOW, 'x', (await nodeOf(db, loose.id)).id)).error, 'Folder not found');
  assert.equal((await tree.createWorkspaceFolder(ASH, 'x', research.nodeId)).error, 'Folder not found');
  assert.equal((await all(db, `select 1 from public.workspace_documents where title = 'x'`)).length, 0, 'refused creation writes nothing');
});

test('one canonical node per object; clients cannot write nodes, or insert/delete Folders, directly', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const page = ok(await pages.createWorkspacePage(HOLLOW, 'Only once'));
  const folder = ok(await tree.createWorkspaceFolder(HOLLOW, 'Box'));

  // Not even the table owner can give an object a second node.
  await assert.rejects(db.query(
    `insert into public.workspace_nodes (project_id, target_type, document_id, position) values ($1, 'page', $2, 99)`, [HOLLOW, page.id]),
    /workspace_nodes_document_id_key/);
  await assert.rejects(db.query(
    `insert into public.workspace_nodes (project_id, target_type, folder_id, document_id, position) values ($1, 'folder', $2, $3, 99)`,
    [HOLLOW, folder.folder.id, page.id]), /workspace_nodes_target_matches_type/);
  // A node never changes its object.
  await assert.rejects(db.query(`update public.workspace_nodes set document_id = null, folder_id = $2, target_type = 'folder' where id = $1`,
    [(await nodeOf(db, page.id)).id, folder.folder.id]), /keeps its object/);

  for (const sql of [
    [`insert into public.workspace_nodes (project_id, target_type, document_id, position) values ($1, 'page', $2, 5)`, [HOLLOW, page.id]],
    [`update public.workspace_nodes set position = 7 where document_id = $1`, [page.id]],
    [`delete from public.workspace_nodes where document_id = $1`, [page.id]],
    [`insert into public.workspace_folders (project_id, title) values ($1, 'Direct')`, [HOLLOW]],
    [`delete from public.workspace_folders where id = $1`, [folder.folder.id]],
  ]) {
    await assert.rejects(asUser(db, ALICE, (tx) => tx.query(...sql)), /permission denied/, sql[0]);
  }
  assert.equal((await all(db, `select * from public.workspace_nodes where document_id = $1`, [page.id])).length, 1);
});

// ── 2. move and reorder ────────────────────────────────────────────────────────

async function research(db) {
  signIn(db, ALICE);
  const f = async (title, parent = null) => ok(await tree.createWorkspaceFolder(HOLLOW, title, parent));
  const p = async (title, parent = null) => ok(await pages.createWorkspacePage(HOLLOW, title, parent));
  const researchF = await f('Research');
  const history = await f('History', researchF.nodeId);
  const rome = await p('Notes on Rome', history.nodeId);
  const sources = await p('Sources', researchF.nodeId);
  const loose = await p('Loose Ideas');
  const ending = await p('Ending');
  return { research: researchF, history, rome, sources, loose, ending };
}

test('reorder: a move within the same parent; siblings stay 1..n; a no-op reports moved: false', async () => {
  const db = await seededDb();
  const t = await research(db);
  const endingNode = (await nodeOf(db, t.ending.id)).id;

  assert.deepEqual(ok(await tree.moveWorkspaceNode(endingNode, null, 0)), { moved: true });
  assert.deepEqual(await shape(HOLLOW), ['Ending', ['Research', [['History', ['Notes on Rome']], 'Sources']], 'Loose Ideas']);
  await assertContiguous(db);

  assert.deepEqual(ok(await tree.moveWorkspaceNode(endingNode, null, 0)), { moved: false });
  // Out-of-range indexes are clamped to the end.
  ok(await tree.moveWorkspaceNode(endingNode, null, 99));
  assert.deepEqual(await shape(HOLLOW), [['Research', [['History', ['Notes on Rome']], 'Sources']], 'Loose Ideas', 'Ending']);
  assert.equal((await tree.moveWorkspaceNode(endingNode, null, -1)).error, 'Invalid position');
  await assertContiguous(db);
});

test('move: Pages and Folders into, out of and between Folders; the parent left behind is renumbered', async () => {
  const db = await seededDb();
  const t = await research(db);
  const node = async (x) => (await nodeOf(db, x.folder?.id ?? x.id)).id;

  // A Page out of a Folder, to the top level.
  ok(await tree.moveWorkspaceNode(await node(t.rome), null, 1));
  // A Page into a Folder, at the start.
  ok(await tree.moveWorkspaceNode(await node(t.loose), t.research.nodeId, 0));
  // A Folder out of another Folder, and back into a nested place.
  ok(await tree.moveWorkspaceNode(t.history.nodeId, null, null));
  assert.deepEqual(await shape(HOLLOW), [['Research', ['Loose Ideas', 'Sources']], 'Notes on Rome', 'Ending', 'History']);
  await assertContiguous(db);

  ok(await tree.moveWorkspaceNode(t.research.nodeId, t.history.nodeId, null));
  assert.deepEqual(await shape(HOLLOW), ['Notes on Rome', 'Ending', ['History', [['Research', ['Loose Ideas', 'Sources']]]]]);
  await assertContiguous(db);
});

test('move: cycles, non-Folder destinations, other Projects and other writers are refused, and nothing changes', async () => {
  const db = await seededDb();
  const t = await research(db);
  const ashFolder = ok(await tree.createWorkspaceFolder(ASH, 'Ash notes'));
  const before = await all(db, `select * from public.workspace_nodes order by id`);

  assert.equal((await tree.moveWorkspaceNode(t.research.nodeId, t.research.nodeId, null)).error, 'A Folder cannot move inside itself');
  assert.equal((await tree.moveWorkspaceNode(t.research.nodeId, t.history.nodeId, null)).error, 'A Folder cannot move inside itself');
  assert.equal((await tree.moveWorkspaceNode(t.history.nodeId, (await nodeOf(db, t.rome.id)).id, null)).error, 'Only a Folder can hold other items');
  assert.equal((await tree.moveWorkspaceNode((await nodeOf(db, t.loose.id)).id, ashFolder.nodeId, null)).error,
    'Items can only move within their own Project');
  assert.equal((await tree.moveWorkspaceNode(MISSING, null, null)).error, 'Item not found');
  assert.equal((await tree.moveWorkspaceNode(t.history.nodeId, MISSING, null)).error, 'Folder not found');

  signIn(db, BRAM);
  assert.equal((await tree.moveWorkspaceNode(t.history.nodeId, null, 0)).error, 'Item not found');
  const tide = ok(await tree.createWorkspaceFolder(TIDE, 'Tide'));
  assert.equal((await tree.moveWorkspaceNode(tide.nodeId, t.research.nodeId, null)).error, 'Folder not found');

  assert.deepEqual(await all(db, `select * from public.workspace_nodes where project_id <> $1 order by id`, [TIDE]), before);

  // The database refuses a cycle or a Page parent whatever writes the row (here: the table owner).
  await assert.rejects(db.query(`update public.workspace_nodes set parent_node_id = $2 where id = $1`,
    [t.research.nodeId, t.history.nodeId]), /inside itself/);
  await assert.rejects(db.query(`update public.workspace_nodes set parent_node_id = $2 where id = $1`,
    [t.history.nodeId, (await nodeOf(db, t.loose.id)).id]), /Only a Folder/);
  await assert.rejects(db.query(`update public.workspace_nodes set parent_node_id = $2 where id = $1`,
    [t.history.nodeId, tide.nodeId]), /workspace_nodes_parent_same_project_fkey/);
});

test('a Page keeps its id, title, content, version and timestamps through every move', async () => {
  const db = await seededDb();
  const t = await research(db);
  await pages.saveWorkspacePageContent(t.rome.id, doc('The forum at dusk.'), 1);
  const stored = async () => one(db, `select * from public.workspace_documents where id = $1`, [t.rome.id]);
  const before = await stored();
  const romeNode = (await nodeOf(db, t.rome.id)).id;

  ok(await tree.moveWorkspaceNode(romeNode, null, 0));
  ok(await tree.moveWorkspaceNode(romeNode, t.research.nodeId, 1));
  ok(await tree.moveWorkspaceNode(t.research.nodeId, null, null));
  assert.deepEqual(await stored(), before);
  assert.equal((await nodeOf(db, t.rome.id)).id, romeNode, 'the node itself is stable too');
  assert.deepEqual(ok(await pages.getWorkspacePage(t.rome.id)).content, doc('The forum at dusk.'));
  // A save after the moves still lands on the same version.
  assert.equal((await pages.saveWorkspacePageContent(t.rome.id, doc('The forum at night.'), 2)).status, 'ok');
});

// ── 3. isolation and deletion ──────────────────────────────────────────────────

test('isolation: another writer sees none of a writer\'s Folders or tree, and can\'t rename, create in or delete them', async () => {
  const db = await seededDb();
  const t = await research(db);

  signIn(db, BRAM);
  const seen = await workspace.loadProjectWorkspace(HOLLOW);
  assert.deepEqual({ pages: seen.pages, folders: seen.folders, tree: seen.tree }, { pages: [], folders: [], tree: [] });
  assert.equal((await tree.renameWorkspaceFolder(t.research.folder.id, 'Mine')).error, 'Folder not found');
  assert.equal((await tree.createWorkspaceFolder(HOLLOW, 'Intruder')).error, 'Project not found');
  assert.equal((await pages.createWorkspacePage(HOLLOW, 'Intruder')).error, 'Project not found');
  assert.equal((await tree.deleteWorkspaceFolder(t.research.folder.id)).error, 'Folder not found');
  const direct = await asUser(db, BRAM, async (tx) => (await tx.query(
    `select (select count(*)::int from public.workspace_nodes where project_id = $1) as nodes,
            (select count(*)::int from public.workspace_folders where project_id = $1) as folders`, [HOLLOW])).rows[0]);
  assert.deepEqual(direct, { nodes: 0, folders: 0 });

  assert.equal((await one(db, `select title from public.workspace_folders where id = $1`, [t.research.folder.id])).title, 'Research');

  const anon = createSupabaseAdapter(db, {});
  tree.setServerClient(anon);
  assert.equal((await tree.createWorkspaceFolder(HOLLOW, 'x')).error, 'Not authenticated');
});

test('deletion: only an empty Folder; nothing else moves, and the gap closes', async () => {
  const db = await seededDb();
  const t = await research(db);
  const pagesBefore = await all(db, `select * from public.workspace_documents order by id`);

  assert.equal((await tree.deleteWorkspaceFolder(t.research.folder.id)).error, 'Only an empty folder can be deleted');
  assert.equal((await tree.deleteWorkspaceFolder(t.history.folder.id)).error, 'Only an empty folder can be deleted');

  const empty = ok(await tree.createWorkspaceFolder(HOLLOW, 'Empty', t.research.nodeId));
  ok(await tree.moveWorkspaceNode(empty.nodeId, t.research.nodeId, 0));
  ok(await tree.deleteWorkspaceFolder(empty.folder.id));
  assert.equal(await nodeOf(db, empty.folder.id), undefined, 'its node went with it');
  assert.deepEqual(await shape(HOLLOW), [['Research', [['History', ['Notes on Rome']], 'Sources']], 'Loose Ideas', 'Ending']);
  await assertContiguous(db);
  assert.deepEqual(await all(db, `select * from public.workspace_documents order by id`), pagesBefore, 'no Page touched');
});

test('deleting a Project removes its Folders and tree with it', async () => {
  const db = await seededDb();
  await research(db);
  await db.query(`delete from public.projects where id = $1`, [HOLLOW]);
  for (const table of ['workspace_nodes', 'workspace_folders', 'workspace_documents']) {
    assert.equal((await one(db, `select count(*)::int as n from public.${table} where project_id = $1`, [HOLLOW])).n, 0, table);
  }
});

test('the manuscript is untouched by every tree operation', async () => {
  const db = await seededDb();
  const before = await manuscriptState(db);
  const t = await research(db);
  ok(await tree.moveWorkspaceNode(t.history.nodeId, null, 0));
  ok(await tree.renameWorkspaceFolder(t.research.folder.id, 'Renamed'));
  const empty = ok(await tree.createWorkspaceFolder(HOLLOW, 'Gone'));
  ok(await tree.deleteWorkspaceFolder(empty.folder.id));
  assert.deepEqual(await manuscriptState(db), before);
});

// ── 4. the navigator's model ───────────────────────────────────────────────────

test('model: the tree is built from nodes, never hides an object, and indexes Folder paths; Folders are not selectable', () => {
  const pagesList = [
    { id: 'p1', title: 'Notes on Rome', created_at: '', updated_at: '' },
    { id: 'p2', title: null, created_at: '', updated_at: '' },
    { id: 'p3', title: 'Unplaced by the tree', created_at: '', updated_at: '' },
  ];
  const folders = [{ id: 'f1', title: 'Research' }, { id: 'f2', title: null }];
  const nodes = [
    { id: 'n1', target_type: 'folder', folder_id: 'f1', document_id: null, parent_node_id: null, position: 2 },
    { id: 'n2', target_type: 'folder', folder_id: 'f2', document_id: null, parent_node_id: 'n1', position: 1 },
    { id: 'n3', target_type: 'page', document_id: 'p1', folder_id: null, parent_node_id: 'n2', position: 1 },
    { id: 'n4', target_type: 'page', document_id: 'p2', folder_id: null, parent_node_id: null, position: 1 },
    { id: 'n5', target_type: 'page', document_id: 'gone', folder_id: null, parent_node_id: 'n1', position: 2 },
  ];
  const built = treeModel.buildWorkspaceTree(nodes, pagesList, folders);
  const ids = (list) => list.map((n) => (n.children.length ? [n.id, ids(n.children)] : n.id));
  assert.deepEqual(ids(built), ['p2', ['f1', [['f2', ['p1']]]], 'p3']);
  assert.equal(built[2].nodeId, null, 'an object with no node is shown, not lost');

  const index = model.indexWorkspace(built, { f2: 'History' });
  assert.deepEqual(index.get('p1').path.map((p) => [p.kind, p.title]), [['workspaceFolder', 'Research'], ['workspaceFolder', 'History']]);
  assert.equal(index.get('f1').kind, 'workspaceFolder');
  assert.equal(index.get('f1').childCount, 1);
  assert.equal(index.get('p2').title, 'Untitled');
  assert.equal(model.isSelectable(index.get('f1')), false);
  assert.equal(model.isSelectable(index.get('p1')), true);

  // Move destinations exclude the Folder itself and everything inside it.
  const f1 = built[1];
  assert.deepEqual(treeModel.moveDestinations(built, f1).map((d) => d.parentNodeId), [null]);
  const p1 = f1.children[0].children[0];
  assert.deepEqual(treeModel.moveDestinations(built, p1).map((d) => [d.parentNodeId, d.depth]), [[null, 0], ['n1', 1], ['n2', 2]]);

  // indexBeside counts siblings without the moving node, as the server does.
  const sibs = [{ nodeId: 'a' }, { nodeId: 'b' }, { nodeId: 'c' }];
  assert.equal(treeModel.indexBeside(sibs, sibs[0], sibs[2], 'after'), 2);
  assert.equal(treeModel.indexBeside(sibs, sibs[0], sibs[2], 'before'), 1);
  assert.equal(treeModel.indexBeside(sibs, sibs[2], sibs[0], 'before'), 0);
});
