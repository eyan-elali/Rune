// Scene Trash (Rune 2.0, Phase 1 cleanup, migration 031) and the working-set
// tab lifecycle: the REAL actions, loaders and pure rules against the Rune 2.0
// schema in real Postgres + RLS.
//
//   * placed and Unplaced Scenes: trash / restore / permanent delete, same id,
//     prose, words and VERSION throughout
//   * restore to the same Chapter and place, to the Chapter's end when that
//     place is taken, and to Unplaced Scenes when the Chapter is gone
//   * ordered manuscript total, Unplaced words, account allowance
//   * writing history kept through trash and permanent deletion
//   * references / backlinks dormant and back; search and pickers exclude
//   * the save path: a save into a trashed Scene writes nothing and succeeds
//     after the restore on the same version
//   * duplication copies only active Scenes
//   * ownership; clients cannot trash, restore or read trashed Scenes directly
//   * tabs: removed from the working set on trash, not recreated on restore
//
// Data: the synthetic legacy fixture moved into the Rune 2.0 schema. alice
// owns hollow; bram owns tide. In hollow, ch1 holds h1a (120 words); ch4 holds
// h4a (200, position 0), h4b (0, position 1), h4c (150, position 2); h3b (380)
// is Unplaced. h3b and h4c have writing sessions.
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
let trash, refs, collections, pages, search, scenes, chapters, projects, workspace, manuscriptLoader, refModel, nav, engine, trashModel, workingSet;
before(async () => {
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
  trash = await bundleForTest('src/lib/actions/workspaceTrash.ts', { name: 'st_trash' });
  refs = await bundleForTest('src/lib/actions/workspaceReferences.ts', { name: 'st_refs' });
  collections = await bundleForTest('src/lib/actions/workspaceCollections.ts', { name: 'st_collections' });
  pages = await bundleForTest('src/lib/actions/workspacePages.ts', { name: 'st_pages' });
  search = await bundleForTest('src/lib/actions/projectSearch.ts', { name: 'st_search' });
  scenes = await bundleForTest('src/lib/actions/scenes.ts', { name: 'st_scenes' });
  chapters = await bundleForTest('src/lib/actions/chapters.ts', { name: 'st_chapters' });
  projects = await bundleForTest('src/lib/actions/projects.ts', { name: 'st_projects' });
  workspace = await bundleForTest('src/lib/rune2/projectWorkspace.ts', { name: 'st_loader' });
  manuscriptLoader = await bundleForTest('src/lib/rune2/projectManuscript.ts', { name: 'st_manuscript' });
  refModel = await bundleForTest('src/lib/rune2/references.ts', { name: 'st_ref_model' });
  nav = await bundleForTest('src/lib/rune2/navigatorModel.ts', { name: 'st_nav' });
  engine = await bundleForTest('src/lib/rune2/projectSearch.ts', { name: 'st_engine' });
  trashModel = await bundleForTest('src/lib/rune2/trash.ts', { name: 'st_model' });
  workingSet = await bundleForTest('src/lib/rune2/workingSet.ts', { name: 'st_working_set' });
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
  for (const mod of [trash, refs, collections, pages, search, scenes, chapters, projects, workspace, manuscriptLoader]) mod.setServerClient(sb);
  return sb;
}

const ok = (r) => { assert.equal(r.error, null, r.error); return r.data; };
const refused = (r, message) => { assert.equal(r.data, null); if (message) assert.equal(r.error, message); else assert.ok(r.error); };

const sceneRow = (db, id) => one(db, `select id, manuscript_id, chapter_id, title, content, word_count, position, version, updated_at, trashed_at, trashed_from_chapter_id
  from public.scenes where id = $1`, [id]);
const keep = ({ id, title, content, word_count, version, updated_at }) => ({ id, title, content, word_count, version, updated_at });

/** The manuscript as the shell shows it: each Chapter's Scenes in order, Unplaced, and the totals. */
async function shown(projectId = HOLLOW) {
  const m = await manuscriptLoader.loadProjectManuscript(projectId);
  const chaptersOf = [];
  const visit = (nodes) => nodes.forEach((n) => (n.kind === 'group' ? visit(n.children) : chaptersOf.push([n.chapter.id, n.chapter.scenes.map((s) => s.id)])));
  visit(m.outline);
  return {
    chapters: Object.fromEntries(chaptersOf),
    unplaced: m.unplaced.map((s) => s.id),
    manuscriptWords: m.manuscriptWords,
    unplacedWords: m.unplacedWords,
  };
}
const projectWords = async (db) => (await one(db, `select word_count from public.projects where id = $1`, [HOLLOW])).word_count;
const accountTotal = (db) => asUser(db, ALICE, async (tx) => (await tx.query(`select public.account_word_total() as n`)).rows[0].n);

// ── 1. Placed Scenes ───────────────────────────────────────────────────────────

test('placed Scene: trash takes it out of its Chapter and the ordered total; restore puts the same Scene back in its place', async () => {
  const db = await seededDb();
  const before = await sceneRow(db, pageId('h4a'));
  const view = await shown();
  assert.deepEqual(view.chapters[chapterId('hollow.ch4')], [pageId('h4a'), pageId('h4b'), pageId('h4c')]);
  const words = await projectWords(db);
  const allowance = await accountTotal(db);

  assert.deepEqual(ok(await trash.trashWorkspaceObject('scene', pageId('h4a'))), { moved: 0 });
  const trashed = await sceneRow(db, pageId('h4a'));
  assert.deepEqual(keep(trashed), keep(before), 'same id, title, prose, words, version and updated_at');
  assert.deepEqual([trashed.chapter_id, trashed.trashed_from_chapter_id, trashed.position], [null, chapterId('hollow.ch4'), 0]);
  let now = await shown();
  assert.deepEqual(now.chapters[chapterId('hollow.ch4')], [pageId('h4b'), pageId('h4c')]);
  assert.deepEqual(now.unplaced, view.unplaced, 'not an Unplaced Scene either');
  assert.equal(await projectWords(db), words - 200, 'out of the ordered total');
  assert.equal(now.manuscriptWords, words - 200);
  assert.equal(await accountTotal(db), allowance, 'the legacy allowance still counts it, as before Trash');
  refused(await trash.trashWorkspaceObject('scene', pageId('h4a')), 'Already in Trash');

  const [item] = ok(await trash.listWorkspaceTrash(HOLLOW));
  assert.deepEqual([item.type, item.id, item.from_chapter_id, item.from_chapter_active], ['scene', pageId('h4a'), chapterId('hollow.ch4'), true]);
  assert.equal(trashModel.trashContext(item), `from ${item.from_chapter_title}`);

  assert.deepEqual(ok(await trash.restoreWorkspaceObject('scene', pageId('h4a'))), { location: 'original' });
  now = await shown();
  assert.deepEqual(now.chapters[chapterId('hollow.ch4')], [pageId('h4a'), pageId('h4b'), pageId('h4c')], 'first again');
  assert.equal(await projectWords(db), words);
  assert.deepEqual(keep(await sceneRow(db, pageId('h4a'))), keep(before), 'the same Scene, unchanged');
  assert.deepEqual(ok(await trash.listWorkspaceTrash(HOLLOW)), []);
});

test('placed Scene: its old place taken → the end of its Chapter; its Chapter gone → the end of Unplaced Scenes', async () => {
  const db = await seededDb();
  // Place taken: the Chapter was reordered while it was in Trash.
  ok(await trash.trashWorkspaceObject('scene', pageId('h4a')));
  assert.equal((await scenes.reorderScenes(chapterId('hollow.ch4'), [pageId('h4c'), pageId('h4b')])).error, null);
  assert.deepEqual(ok(await trash.restoreWorkspaceObject('scene', pageId('h4a'))), { location: 'original' });
  assert.deepEqual((await shown()).chapters[chapterId('hollow.ch4')], [pageId('h4c'), pageId('h4b'), pageId('h4a')]);

  // Chapter gone: deleting it moves its active Scenes to Unplaced; the trashed one waits.
  const words = await projectWords(db);
  ok(await trash.trashWorkspaceObject('scene', pageId('h4b')));
  assert.equal((await chapters.removeChapterKeepScenes(chapterId('hollow.ch4'), HOLLOW)).error, null);
  const item = ok(await trash.listWorkspaceTrash(HOLLOW)).find((i) => i.id === pageId('h4b'));
  assert.equal(item.from_chapter_active, false);
  assert.equal(trashModel.trashContext(item), 'from a chapter that is gone');
  assert.deepEqual(ok(await trash.restoreWorkspaceObject('scene', pageId('h4b'))), { location: 'unplaced' });
  const now = await shown();
  assert.equal(now.unplaced.at(-1), pageId('h4b'), 'at the end of Unplaced Scenes');
  assert.equal(now.chapters[chapterId('hollow.ch4')], undefined);
  assert.equal(await projectWords(db), words - 350, 'h4a and h4c left the total with their Chapter; h4b holds 0 words');
});

// ── 2. Unplaced Scenes ─────────────────────────────────────────────────────────

test('Unplaced Scene: trash and restore keep its place among Unplaced Scenes; a new Unplaced Scene can take its slot meanwhile', async () => {
  const db = await seededDb();
  const before = await sceneRow(db, pageId('h3b'));
  const view = await shown();
  ok(await trash.trashWorkspaceObject('scene', pageId('h3b')));
  let now = await shown();
  assert.equal(now.unplaced.includes(pageId('h3b')), false);
  assert.equal(now.unplacedWords, view.unplacedWords - 380);
  assert.equal(now.manuscriptWords, view.manuscriptWords, 'the ordered total never counted it');
  assert.equal(ok(await trash.listWorkspaceTrash(HOLLOW))[0].from_chapter_id, null);
  assert.equal(trashModel.trashContext(ok(await trash.listWorkspaceTrash(HOLLOW))[0]), 'from Unplaced Scenes');

  // A trashed Scene holds no Unplaced slot: new Scenes and moves never collide with it.
  const fresh = ok(await scenes.createUnplacedScene(HOLLOW, 'Fresh'));
  assert.equal((await scenes.moveSceneToUnplaced(pageId('h1a'))).error, null);
  ok(await trash.restoreWorkspaceObject('scene', pageId('h3b')));
  now = await shown();
  assert.ok(now.unplaced.includes(pageId('h3b')) && now.unplaced.includes(fresh.id));
  const positions = (await all(db, `select position from public.scenes where manuscript_id = $1 and chapter_id is null and trashed_at is null`,
    [before.manuscript_id])).map((r) => r.position);
  assert.equal(new Set(positions).size, positions.length, 'every active Unplaced Scene has its own place');
  assert.deepEqual(keep(await sceneRow(db, pageId('h3b'))), keep(before));
});

// ── 3. Permanent deletion and writing history ──────────────────────────────────

test('permanent deletion: only from Trash; the prose goes, the writing history stays, references go but never their other ends', async () => {
  const db = await seededDb();
  const people = ok(await collections.createWorkspaceCollection(HOLLOW, 'People')).collection;
  const nerai = ok(await collections.createCollectionEntry(people.id, 'Nerai'));
  const appears = ok(await refs.createRelationshipProperty(people.id, 'Appears in', 'scene', null, true));
  ok(await refs.setEntryRelationship(nerai.id, appears.id, [pageId('h3b'), pageId('h4c')]));
  ok(await refs.addObjectReference('scene', pageId('h3b'), 'entry', nerai.id));
  const history = async () => all(db, `select user_id, project_id, session_date, sum(words_added)::int as words
    from public.writing_sessions where project_id = $1 group by 1, 2, 3 order by 3`, [HOLLOW]);
  const before = await history();
  const h3bSessions = await all(db, `select id from public.writing_sessions where scene_id = $1`, [pageId('h3b')]);
  assert.ok(h3bSessions.length > 0);

  refused(await trash.deleteTrashedWorkspaceObject('scene', pageId('h3b')), 'Only an item in Trash can be deleted permanently');
  ok(await trash.trashWorkspaceObject('scene', pageId('h3b')));
  assert.deepEqual(await history(), before, 'trashing touches no writing history');
  assert.equal((await all(db, `select id from public.writing_sessions where scene_id = $1`, [pageId('h3b')])).length, h3bSessions.length);

  ok(await trash.deleteTrashedWorkspaceObject('scene', pageId('h3b')));
  assert.equal(await one(db, `select id from public.scenes where id = $1`, [pageId('h3b')]), undefined);
  assert.deepEqual(await history(), before, 'every day and word of history kept (moved to the Project)');
  assert.equal((await all(db, `select * from public.object_references where source_scene_id = $1 or target_scene_id = $1`, [pageId('h3b')])).length, 0);
  assert.deepEqual((await all(db, `select target_scene_id from public.object_references where property_id = $1`, [appears.id])).map((r) => r.target_scene_id),
    [pageId('h4c')], 'Nerai keeps her other Scene');
  assert.ok(await one(db, `select id from public.workspace_collection_entries where id = $1`, [nerai.id]));
  refused(await trash.restoreWorkspaceObject('scene', pageId('h3b')), 'Item not found');
});

// ── 4. References, search, pickers ─────────────────────────────────────────────

test('references: dormant while a Scene is in Trash — hidden, kept — and back on restore; search and pickers exclude it', async () => {
  const db = await seededDb();
  const people = ok(await collections.createWorkspaceCollection(HOLLOW, 'People')).collection;
  const nerai = ok(await collections.createCollectionEntry(people.id, 'Nerai'));
  const notes = ok(await pages.createWorkspacePage(HOLLOW, 'Notes'));
  const appears = ok(await refs.createRelationshipProperty(people.id, 'Appears in', 'scene', null, true));
  ok(await refs.setEntryRelationship(nerai.id, appears.id, [pageId('h4c'), pageId('h3b')]));
  ok(await refs.addObjectReference('scene', pageId('h4c'), 'page', notes.id));
  await scenes.syncSceneWithLimitCheck(pageId('h4c'), doc('The lighthouse-keeper counted gulls.'), 5,
    (await sceneRow(db, pageId('h4c'))).version);
  const rows = async () => all(db, `select * from public.object_references order by id`);
  const before = await rows();
  const text = async () => ok(await search.searchProjectContent(HOLLOW, 'lighthouse-keeper')).map((m) => m.id);
  assert.deepEqual(await text(), [pageId('h4c')]);

  ok(await trash.trashWorkspaceObject('scene', pageId('h4c')));
  let loaded = await workspace.loadProjectWorkspace(HOLLOW);
  assert.deepEqual(refModel.relationshipValues(loaded.references).get(`${nerai.id}:${appears.id}`), [pageId('h3b')]);
  assert.deepEqual(refModel.backlinksOf(loaded.references, notes.id), [], 'a trashed Scene is no backlink');
  assert.deepEqual(await rows(), before, 'every reference row kept');
  assert.deepEqual(await text(), [], 'its text is not searched');
  const index = new Map([...nav.indexManuscript(await manuscriptLoader.loadProjectManuscript(HOLLOW)), ...nav.indexWorkspace(loaded.tree, {}, loaded.entries)]);
  assert.equal(index.has(pageId('h4c')), false);
  assert.equal(engine.searchObjects(index).some((o) => o.subject?.id === pageId('h4c')), false, 'not found by title');
  assert.equal(refModel.candidates(index, { type: 'scene' }).some((c) => c.id === pageId('h4c')), false, 'never offered by a picker');
  refused(await refs.setEntryRelationship(nerai.id, appears.id, [pageId('h4c')]), 'Not a valid target');
  refused(await refs.addObjectReference('entry', nerai.id, 'scene', pageId('h4c')));
  // Editing the visible value keeps the dormant Scene.
  ok(await refs.setEntryRelationship(nerai.id, appears.id, []));
  assert.deepEqual((await all(db, `select target_scene_id from public.object_references where property_id = $1`, [appears.id])).map((r) => r.target_scene_id), [pageId('h4c')]);
  ok(await refs.setEntryRelationship(nerai.id, appears.id, [pageId('h3b')]));

  ok(await trash.restoreWorkspaceObject('scene', pageId('h4c')));
  loaded = await workspace.loadProjectWorkspace(HOLLOW);
  assert.deepEqual(refModel.backlinksOf(loaded.references, notes.id).map((b) => b.source.id), [pageId('h4c')]);
  assert.deepEqual(new Set(refModel.relationshipValues(loaded.references).get(`${nerai.id}:${appears.id}`)), new Set([pageId('h3b'), pageId('h4c')]));
  assert.deepEqual(await text(), [pageId('h4c')]);
});

// ── 5. The save path, duplication, ownership ──────────────────────────────────

test('save path: a save into a trashed Scene writes nothing ("Scene not found", kept by the offline queue); after restore it saves on the same version', async () => {
  const db = await seededDb();
  const s = await sceneRow(db, pageId('h4c'));
  ok(await trash.trashWorkspaceObject('scene', pageId('h4c')));
  const r = await scenes.syncSceneWithLimitCheck(pageId('h4c'), doc('written after it was trashed'), 4, s.version);
  assert.deepEqual(r, { status: 'error', error: 'Scene not found' }, 'the literal the offline queue keeps as `failed`');
  assert.deepEqual(keep(await sceneRow(db, pageId('h4c'))), keep(s), 'nothing written');
  ok(await trash.restoreWorkspaceObject('scene', pageId('h4c')));
  const saved = await scenes.syncSceneWithLimitCheck(pageId('h4c'), doc('written after it was trashed'), 4, s.version);
  assert.equal(saved.status, 'ok', JSON.stringify(saved));
  assert.equal(saved.version, s.version + 1, 'no conflict: Trash never changed the version');
});

test('duplication copies only active Scenes; ownership: another writer can do nothing; clients cannot trash, restore or read directly', async () => {
  const db = await seededDb();
  // Duplication (as bram — alice is over her legacy free limit, so hers is refused before copying).
  signIn(db, BRAM);
  const tideScenes = await all(db, `select s.id, s.chapter_id from public.scenes s join public.manuscripts m on m.id = s.manuscript_id
    where m.project_id = $1 order by s.chapter_id nulls first, s.position`, [TIDE]);
  const placed = tideScenes.find((r) => r.chapter_id);
  const unplaced = tideScenes.find((r) => !r.chapter_id);
  ok(await trash.trashWorkspaceObject('scene', placed.id));
  ok(await trash.trashWorkspaceObject('scene', unplaced.id));
  const copy = ok(await projects.duplicateProject(TIDE));
  const copied = await all(db, `select s.title, s.trashed_at from public.scenes s join public.manuscripts m on m.id = s.manuscript_id where m.project_id = $1`, [copy.id]);
  assert.equal(copied.length, tideScenes.length - 2, 'the manuscript is copied, not its Trash');
  assert.ok(copied.every((r) => r.trashed_at === null));

  signIn(db, ALICE);
  ok(await trash.trashWorkspaceObject('scene', pageId('h3b')));
  signIn(db, BRAM);
  refused(await trash.trashWorkspaceObject('scene', pageId('h4c')), 'Item not found');
  refused(await trash.restoreWorkspaceObject('scene', pageId('h3b')), 'Item not found');
  refused(await trash.deleteTrashedWorkspaceObject('scene', pageId('h3b')), 'Item not found');
  const state = await asUser(db, BRAM, async (tx) => (await tx.query(`select public.workspace_trash_state('scene', $1) as s`, [pageId('h3b')])).rows[0].s);
  assert.deepEqual(state, { status: 'ok', state: 'missing' });

  await asUser(db, ALICE, async (tx) => {
    assert.equal((await tx.query(`select id from public.scenes where id = $1`, [pageId('h3b')])).rows.length, 0, 'hidden from its own writer too');
    const state2 = (await tx.query(`select public.workspace_trash_state('scene', $1) as s`, [pageId('h3b')])).rows[0].s;
    assert.deepEqual(state2, { status: 'ok', state: 'trashed' });
  });
  await assert.rejects(asUser(db, ALICE, (tx) => tx.query(`delete from public.scenes where id = $1`, [pageId('h3b')])), /permission denied/,
    'no direct delete of a Scene, trashed or not (037): permanent deletion only from Trash');
  await assert.rejects(asUser(db, ALICE, (tx) => tx.query(`update public.scenes set trashed_at = now(), chapter_id = null where id = $1`, [pageId('h4c')])),
    /row-level security/);
  assert.ok(await one(db, `select id from public.scenes where id = $1 and trashed_at is not null`, [pageId('h3b')]));
  await assert.rejects(db.query(`update public.scenes set trashed_at = now() where id = $1`, [pageId('h4c')]), /scenes_trash_check/,
    'a trashed Scene is never placed');
});

// ── 6. The working set ─────────────────────────────────────────────────────────

test('tabs: trashing removes the tab from the working set, and a restore does not bring it back', () => {
  const has = (present) => (key) => key === workingSet.MANUSCRIPT_TAB || present.has(key);
  let state = { tabs: ['a', 'scene', 'b'], active: 'scene' };
  state = workingSet.forgetTabs(state, ['scene']);
  assert.deepEqual(state, { tabs: ['a', 'b'], active: 'b' }, 'the active tab hands its place to a neighbour');
  // Restored: the object is back in the index, and no tab reappears.
  assert.deepEqual(workingSet.resolveTabs(state, has(new Set(['a', 'b', 'scene']))), state);
  // Forgetting objects without tabs changes nothing; forgetting every tab leaves the Manuscript.
  assert.equal(workingSet.forgetTabs(state, ['nope']), state);
  assert.deepEqual(workingSet.forgetTabs(state, ['a', 'b']), { tabs: [workingSet.MANUSCRIPT_TAB], active: workingSet.MANUSCRIPT_TAB });
  // Before this: a tab only hidden by resolveTabs came back with its object.
  const hidden = { tabs: ['a', 'scene'], active: 'a' };
  assert.deepEqual(workingSet.resolveTabs(hidden, has(new Set(['a', 'scene']))).tabs, ['a', 'scene']);
});

test('wording: a Scene’s title and what its permanent deletion loses', () => {
  const base = { id: 'x', trashed_at: new Date().toISOString(), from_folder_id: null, from_folder_title: null, from_folder_active: null,
    collection_id: null, collection_title: null, collection_active: null, entries: null, properties: null };
  assert.equal(trashModel.trashTypeOf({ kind: 'scene' }), 'scene');
  assert.equal(trashModel.trashTypeOf({ kind: 'unplacedScene' }), 'scene');
  assert.equal(trashModel.trashTypeOf({ kind: 'chapter' }), 'chapter', 'a Chapter goes to Trash with its Scenes (037)');
  assert.equal(trashModel.trashItemTitle({ type: 'scene', title: 'Untitled scene' }), 'Untitled scene');
  assert.equal(trashModel.trashItemTitle({ type: 'scene', title: '' }), 'Untitled scene');
  assert.equal(trashModel.trashItemTitle({ type: 'scene', title: 'The Crossing' }), 'The Crossing');
  assert.equal(trashModel.deletionWarning({ ...base, type: 'scene', title: 'The Crossing' }),
    'Delete “The Crossing” permanently? Its prose and scene properties can’t be recovered. Your writing history is kept.');
});
