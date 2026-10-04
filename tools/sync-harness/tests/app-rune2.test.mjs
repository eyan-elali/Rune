// The REAL Rune application paths that create or change manuscript structure,
// run against the Rune 2.0 schema (Project → Manuscript → Chapter → Scene)
// through real Postgres + RLS: project/chapter/Scene creation, reordering,
// deletion and its total recalculation, the authoritative onboarding route,
// and Arena's two save paths. Framework and network boundaries are mocked
// (lib/bundle.mjs); everything under src/ is the real code.
//
// Data: the synthetic legacy fixture moved into the Rune 2.0 schema with the
// approved mapping (lib/legacy-to-rune2.mjs), so Unplaced Scenes are present.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, readRepoFile, LEGACY_BASELINE, RUNE2_SCHEMA } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';
import { prototypeLegacyToRune2 } from '../lib/legacy-to-rune2.mjs';
import { USERS, chapterId, pageId, projectId, seedFixture } from '../fixtures/manuscript-fixture.mjs';

const ALICE = USERS.alice.id; // starter_2k, every-Scene total 3035 (over the 2000 limit)
const BRAM = USERS.bram.id; // legacy_15k
const CORA = USERS.cora.id; // starter_2k, no words yet

const as = (db, userId) => createSupabaseAdapter(db, userId ? { userId } : {});
const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const all = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const manuscriptOf = async (db, pid) => (await one(db, `select id from public.manuscripts where project_id = $1`, [pid]))?.id;
const storedTotal = async (db, pid) => (await one(db, `select word_count from public.projects where id = $1`, [pid])).word_count;

let legacy;
let projects, chapters, scenes, trash, games, onboarding;
before(async () => {
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
  // One bundle per module; each carries its own server-client mock instance.
  projects = await bundleForTest('src/lib/actions/projects.ts', { name: 'app_projects' });
  chapters = await bundleForTest('src/lib/actions/chapters.ts', { name: 'app_chapters' });
  scenes = await bundleForTest('src/lib/actions/scenes.ts', { name: 'app_scenes' });
  trash = await bundleForTest('src/lib/actions/workspaceTrash.ts', { name: 'app_trash' });
  games = await bundleForTest('src/lib/actions/games.ts', { name: 'app_games' });
  onboarding = await bundleForTest('src/lib/actions/onboarding.ts', { name: 'app_onboarding' });
});

async function seededDb() {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  await prototypeLegacyToRune2(legacy, db);
  return db;
}

function signIn(db, userId) {
  const sb = as(db, userId);
  for (const mod of [projects, chapters, scenes, trash, games, onboarding]) mod.setServerClient(sb);
  return sb;
}

// ── creation ──────────────────────────────────────────────────────────────────

test('createProjectWithDraft: Project → its Manuscript → "Chapter 1" → one empty placed Scene "Scene 1"', async () => {
  const db = await seededDb();
  signIn(db, CORA);
  const r = await projects.createProjectWithDraft('A new story');
  assert.equal(r.error, null, r.error);
  const m = await manuscriptOf(db, r.data.projectId);
  assert.ok(m, 'the Manuscript was created with the Project');
  assert.deepEqual(await one(db, `select manuscript_id, title, position from public.chapters where id = $1`, [r.data.chapterId]),
    { manuscript_id: m, title: 'Chapter 1', position: 1 });
  assert.deepEqual(await all(db, `select id, manuscript_id, chapter_id, title, position, word_count, content, version
    from public.scenes where manuscript_id = $1`, [m]), [{
    id: r.data.scene.id, manuscript_id: m, chapter_id: r.data.chapterId, title: 'Scene 1', position: 0, word_count: 0, content: null, version: 1,
  }]);
});

test('createChapter: a Chapter in the Project\'s Manuscript with one empty Scene; getChapters lists placed Scenes only; another writer is refused', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const r = await chapters.createChapter(projectId('hollow'), '  Chapter 8 ');
  assert.equal(r.error, null, r.error);
  assert.equal(r.data.manuscript_id, await manuscriptOf(db, projectId('hollow')));
  assert.equal(r.data.title, 'Chapter 8');
  assert.equal(r.data.position, 8, 'the database appends it after hollow.ch6 (position 7)');
  assert.deepEqual(await all(db, `select title, position, word_count from public.scenes where chapter_id = $1`, [r.data.id]),
    [{ title: 'Scene 1', position: 0, word_count: 0 }]);

  const listed = await chapters.getChapters(projectId('hollow'));
  assert.deepEqual(listed.data.map((c) => c.id),
    [chapterId('hollow.ch1'), chapterId('hollow.ch2'), chapterId('hollow.ch3'), chapterId('hollow.ch5'), chapterId('hollow.ch4'), chapterId('hollow.ch6'), r.data.id],
    'by position');
  const ch3 = listed.data.find((c) => c.id === chapterId('hollow.ch3'));
  assert.deepEqual(ch3.scenes.map(({ version, ...s }) => s), [{ id: pageId('h3a'), title: 'Page 1', word_count: 410 }], 'h3b and h3c are Unplaced and not listed');
  assert.ok(Number.isInteger(ch3.scenes[0].version) && ch3.scenes[0].version >= 1, 'a Scene summary carries its version (reading anchors)');

  signIn(db, BRAM);
  assert.deepEqual(await chapters.createChapter(projectId('hollow'), 'x'), { data: null, error: 'Project not found' });
  assert.deepEqual((await chapters.getChapters(projectId('hollow'))).data, []);
});

test('createScene / reorderScenes / renameScene: positions, the Chapter\'s Manuscript, and chapter-scoped reordering', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const a = await scenes.createScene(chapterId('hollow.ch5'), 'Scene 1');
  const b = await scenes.createScene(chapterId('hollow.ch5'), '   ');
  assert.equal(a.error, null, a.error);
  assert.deepEqual([a.data.position, b.data.position, b.data.title], [0, 1, 'Untitled']);
  assert.equal(a.data.manuscript_id, await manuscriptOf(db, projectId('hollow')));

  assert.deepEqual(await scenes.reorderScenes(chapterId('hollow.ch5'), [b.data.id, a.data.id]), { error: null });
  assert.deepEqual((await scenes.getScenes(chapterId('hollow.ch5'))).data.map((s) => s.id), [b.data.id, a.data.id]);
  await scenes.reorderScenes(chapterId('hollow.ch5'), [pageId('h3b')]); // an Unplaced Scene is not in this Chapter
  assert.equal((await one(db, `select chapter_id, position from public.scenes where id = $1`, [pageId('h3b')])).chapter_id, null, 'reordering never places a Scene');

  const renamed = await scenes.renameScene(a.data.id, ' Arrival ');
  assert.equal(renamed.data.title, 'Arrival');
  signIn(db, BRAM);
  assert.ok((await scenes.renameScene(a.data.id, 'hijack')).error, 'another writer cannot rename it');
});

test('permanent Scene deletion (through Trash) recalculates the ordered total: a placed Scene lowers it, an Unplaced Scene does not', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const purge = async (id) => {
    assert.equal((await trash.trashWorkspaceObject('scene', id)).error, null);
    return { error: (await trash.deleteTrashedWorkspaceObject('scene', id)).error };
  };
  assert.equal(await storedTotal(db, projectId('hollow')), 1450);
  assert.deepEqual(await purge(pageId('h4a')), { error: null });
  assert.equal(await storedTotal(db, projectId('hollow')), 1450 - 200);
  assert.deepEqual(await purge(pageId('h3b')), { error: null });
  assert.equal(await storedTotal(db, projectId('hollow')), 1250, 'Unplaced words were never in the ordered total');
  assert.equal((await one(db, `select count(*)::int as n from public.scenes where id = any($1::uuid[])`, [[pageId('h4a'), pageId('h3b')]])).n, 0);
});

// ── onboarding ────────────────────────────────────────────────────────────────

// Rune 2.0 onboarding (BC-E): a title only — no first sentence, no letter.

test('onboarding: one call creates the Project, its Manuscript, Chapter 1 and one empty first Scene — nothing more', async () => {
  const db = await seededDb();
  signIn(db, CORA);
  const res = await onboarding.createOnboardingProject('Tide Book');
  assert.equal(res.error, null, res.error);
  const m = await manuscriptOf(db, res.data.projectId);
  const rows = await all(db, `select c.title as chapter, c.position, s.title, s.position as scene_position, s.word_count, s.content
    from public.chapters c join public.scenes s on s.chapter_id = c.id where c.manuscript_id = $1`, [m]);
  assert.deepEqual(rows, [{ chapter: 'Chapter 1', position: 1, title: 'Scene 1', scene_position: 0, word_count: 0, content: null }]);
  assert.equal((await one(db, `select count(*)::int as n from public.scenes where manuscript_id = $1`, [m])).n, 1, 'no Unplaced Scene');
  assert.equal((await one(db, `select count(*)::int as n from public.manuscript_groups where manuscript_id = $1`, [m])).n, 0, 'no Group');
  assert.equal(await storedTotal(db, res.data.projectId), 0);
  assert.equal((await one(db, `select count(*)::int as n from public.projects where user_id = $1`, [CORA])).n, 2, 'exactly one new project');
});

test('onboarding: never blocked by a word limit (037) — one Project, Manuscript, Chapter and Scene', async () => {
  const db = await seededDb();
  signIn(db, ALICE); // already far over the old 2,000-word allowance
  const count = () => one(db, `select (select count(*) from public.projects)::int as p, (select count(*) from public.manuscripts)::int as m,
    (select count(*) from public.chapters)::int as c, (select count(*) from public.scenes)::int as s`);
  const beforeCounts = await count();
  const res = await onboarding.createOnboardingProject('Not blocked');
  assert.equal(res.error, null, res.error);
  assert.deepEqual(await count(), { p: beforeCounts.p + 1, m: beforeCounts.m + 1, c: beforeCounts.c + 1, s: beforeCounts.s + 1 });
});

// ── Arena ─────────────────────────────────────────────────────────────────────

test('Arena: a sprint becomes a new placed Scene at the end of the Chapter (insert_scene_checked); the Chapter must belong to the Project', async () => {
  const db = await seededDb();
  signIn(db, BRAM);
  const r = await games.appendSprintToProject(projectId('tide'), chapterId('tide.ch3'), 4, '<p>ember loam sable flint</p>');
  assert.equal(r.error, null, r.error);
  const row = await one(db, `select chapter_id, position, word_count, title like 'Sprint: %' as sprint from public.scenes where id = $1`, [r.data.id]);
  assert.deepEqual(row, { chapter_id: chapterId('tide.ch3'), position: 2, word_count: 4, sprint: true });
  assert.equal(await storedTotal(db, projectId('tide')), 1320 + 4);
  assert.deepEqual(await games.appendSprintToProject(projectId('tide'), chapterId('ash.ch1'), 1, '<p>x</p>'),
    { data: null, error: 'Chapter not found in this project' });
});

test('Arena: appending to an existing Scene uses save_scene_checked, keeps an Unplaced Scene Unplaced, and is never word-limited (037)', async () => {
  const db = await seededDb();
  signIn(db, BRAM);
  const r = await games.appendToExistingScene(pageId('t1c'), '<p>moth ink</p>', 2);
  assert.deepEqual(r, { data: { id: pageId('t1c') }, error: null });
  assert.deepEqual(await one(db, `select chapter_id, word_count from public.scenes where id = $1`, [pageId('t1c')]), { chapter_id: null, word_count: 722 });
  assert.equal(await storedTotal(db, projectId('tide')), 1320, 'Unplaced words stay out of the ordered total');

  signIn(db, ALICE); // far over the old 2,000-word allowance
  assert.deepEqual(await games.appendToExistingScene(pageId('h1a'), '<p>more</p>', 1), { data: { id: pageId('h1a') }, error: null });
  assert.equal((await one(db, `select word_count from public.scenes where id = $1`, [pageId('h1a')])).word_count, 121);
  assert.deepEqual(await games.appendToExistingScene(pageId('t1c'), '<p>x</p>', 1), { data: null, error: 'Scene not found' },
    'another writer\'s Scene');
});
