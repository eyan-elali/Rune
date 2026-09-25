// Creation-path hardening (Rune 2.0 Phase 1, Task 6C, migration 019): the REAL
// createChapter / createProjectWithDraft / onboarding / Arena / Scene-creation
// code against the Rune 2.0 schema in real Postgres + RLS.
//
//   * create_chapter_checked: a Chapter and its first Scene in one transaction
//   * no client can INSERT into scenes; only the checked creation RPCs can
//   * UNIQUE (chapter_id, position) DEFERRABLE: placed positions never tie
//
// Data: the synthetic legacy fixture moved into the Rune 2.0 schema
// (lib/legacy-to-rune2.mjs). alice (starter_2k, 3035 words: over her 2,000)
// owns hollow (Chapters at positions 1,2,3,4,5,7) and ash; bram (legacy_15k,
// 2740 words) owns tide; cora (starter_2k) has no words.
//
// PGlite is one connection, so simultaneous action calls cannot show two
// backends blocking on a lock. What they do show: each creation is ONE
// database call that picks its own position, so calls cannot interleave
// between "read the last position" and "insert at it".
import 'fake-indexeddb/auto'; // games.ts pulls in the offline modules
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, readRepoFile, LEGACY_BASELINE, RUNE2_SCHEMA } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';
import { prototypeLegacyToRune2 } from '../lib/legacy-to-rune2.mjs';
import { USERS, chapterId, pageId, projectId, syntheticDoc, seedFixture } from '../fixtures/manuscript-fixture.mjs';

const ALICE = USERS.alice.id;
const BRAM = USERS.bram.id;
const CORA = USERS.cora.id;

const as = (db, userId) => createSupabaseAdapter(db, userId ? { userId } : {});
const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const all = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const manuscriptOf = async (db, pid) => (await one(db, `select id from public.manuscripts where project_id = $1`, [pid])).id;
const accountTotal = async (db, userId) => (await as(db, userId).rpc('account_word_total')).data;
const chaptersOf = async (db, m) =>
  all(db, `select c.id, c.title, c.position, (select count(*)::int from public.scenes s where s.chapter_id = c.id) as scenes
             from public.chapters c where c.manuscript_id = $1 order by c.position, c.id`, [m]);
const createChapterRpc = (sb, manuscriptId, { title = 'Chapter X', words = 0 } = {}) => sb.rpc('create_chapter_checked', {
  p_manuscript_id: manuscriptId, p_title: title, p_scene_title: 'Scene 1',
  p_scene_content: words ? syntheticDoc('x', words) : null, p_scene_word_count: words,
});

/** Every Project, Manuscript, Chapter and Scene — to prove a refused/failed creation left nothing behind. */
const snapshot = async (db) => ({
  projects: await all(db, `select id, word_count, updated_at::text from public.projects order by id`),
  manuscripts: await all(db, `select id from public.manuscripts order by id`),
  chapters: await all(db, `select id, position, updated_at::text from public.chapters order by id`),
  scenes: await all(db, `select id, chapter_id, position, word_count, version from public.scenes order by id`),
});

/** Placed positions are distinct per Chapter; every Chapter has at least one Scene unless it was seeded empty. */
async function assertPlacedPositionsValid(db) {
  const bad = await all(db, `select chapter_id, position from public.scenes where chapter_id is not null
    group by 1, 2 having count(*) > 1 or position < 0`);
  assert.deepEqual(bad, [], 'no tied or negative placed positions');
}

let legacy;
let chapters, projects, scenes, games, onboarding;
before(async () => {
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
  chapters = await bundleForTest('src/lib/actions/chapters.ts', { name: 'hard_chapters' });
  projects = await bundleForTest('src/lib/actions/projects.ts', { name: 'hard_projects' });
  scenes = await bundleForTest('src/lib/actions/scenes.ts', { name: 'hard_scenes' });
  games = await bundleForTest('src/lib/actions/games.ts', { name: 'hard_games' });
  onboarding = await bundleForTest('src/app/api/onboarding/route.ts', { name: 'hard_onboarding' });
});

async function seededDb() {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  await prototypeLegacyToRune2(legacy, db);
  return db;
}

function signIn(db, userId) {
  const sb = as(db, userId);
  for (const mod of [chapters, projects, scenes, games, onboarding]) mod.setServerClient(sb);
  return sb;
}

const postOnboarding = (body) => onboarding.POST(new Request('http://localhost/api/onboarding', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}));

/** Makes every Scene insert fail AFTER the Chapter insert has happened in the same transaction. */
const failSceneInserts = (db) => db.exec(`
  create function public.test_fail_scene_insert() returns trigger language plpgsql as $$
  begin raise exception 'simulated Scene failure'; end $$;
  create trigger test_fail_scene_insert before insert on public.scenes
    for each row execute function public.test_fail_scene_insert();`);

// ── 1. atomic Chapter + first Scene ───────────────────────────────────────────

test('createChapter: one checked call creates the Chapter at the end of the Manuscript and its empty "Scene 1" at position 0', async () => {
  const db = await seededDb();
  const sb = signIn(db, ALICE);
  const m = await manuscriptOf(db, projectId('hollow'));
  sb.calls.length = 0;
  const r = await chapters.createChapter(projectId('hollow'), '  Chapter 7 ');
  assert.equal(r.error, null, r.error);
  assert.deepEqual(sb.calls.map((c) => `${c.kind}:${c.name}`), ['from:manuscripts', 'rpc:create_chapter_checked'],
    'no direct Chapter or Scene insert from the app');
  assert.deepEqual([r.data.manuscript_id, r.data.title, r.data.position], [m, 'Chapter 7', 8], 'after hollow.ch6 at 7');
  assert.deepEqual(await all(db, `select manuscript_id, title, content, word_count, position, version from public.scenes where chapter_id = $1`, [r.data.id]),
    [{ manuscript_id: m, title: 'Scene 1', content: null, word_count: 0, position: 0, version: 1 }]);
  assert.equal(r.data.is_completed, false, 'the full Chapter row is returned');
});

test('create_chapter_checked result shape; the first Chapter of an empty Manuscript is at position 1', async () => {
  const db = await seededDb();
  // A Chapter-less Project (every app path now creates Chapter 1 with it), inserted directly.
  const p = { data: await one(db, `insert into public.projects (user_id, title) values ($1, 'Empty book') returning id`, [CORA]) };
  const m = await manuscriptOf(db, p.data.id);
  const r = await createChapterRpc(as(db, CORA), m, { title: 'Chapter 1' });
  assert.equal(r.data.status, 'ok');
  assert.deepEqual(Object.keys(r.data).sort(), ['chapter', 'scene_id', 'status']);
  assert.equal(r.data.chapter.position, 1);
  assert.deepEqual(await chaptersOf(db, m), [{ id: r.data.chapter.id, title: 'Chapter 1', position: 1, scenes: 1 }]);
  assert.equal((await one(db, `select chapter_id from public.scenes where id = $1`, [r.data.scene_id])).chapter_id, r.data.chapter.id);
});

test('a failure while creating the first Scene leaves no Chapter behind — createChapter, createProjectWithDraft and onboarding', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  await failSceneInserts(db);
  const before = await snapshot(db);

  const r = await chapters.createChapter(projectId('hollow'), 'Chapter 7');
  assert.equal(r.data, null);
  assert.match(r.error, /simulated Scene failure/);
  assert.deepEqual(await snapshot(db), before, 'createChapter: no Chapter, no Scene');

  // Onboarding rolls back its Project too (as before), so a retry starts clean.
  signIn(db, CORA);
  const beforeCora = await snapshot(db);
  const res = await postOnboarding({ title: 'Failing book', firstSentence: 'One two three.' });
  assert.equal(res.status, 500);
  assert.deepEqual(await snapshot(db), beforeCora, 'onboarding: no Project, Manuscript, Chapter or Scene');

  // createProjectWithDraft (migration 021): nothing at all, not even the Project.
  const beforeDraft = await snapshot(db);
  const d = await projects.createProjectWithDraft('Failing draft');
  assert.match(d.error, /simulated Scene failure/);
  assert.deepEqual(await snapshot(db), beforeDraft, 'createProjectWithDraft: no Project, Manuscript, Chapter or Scene');

  // Once the failure is gone, the next Chapter takes the position the failed one never kept.
  await db.exec(`drop trigger test_fail_scene_insert on public.scenes;`);
  signIn(db, ALICE);
  assert.equal((await chapters.createChapter(projectId('hollow'), 'Chapter 7')).data.position, 8);
});

test('simultaneous Chapter creations get distinct, contiguous positions, each with exactly one Scene', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const m = await manuscriptOf(db, projectId('hollow'));
  const results = await Promise.all([1, 2, 3, 4, 5].map((n) => chapters.createChapter(projectId('hollow'), `New ${n}`)));
  for (const r of results) assert.equal(r.error, null, r.error);
  assert.deepEqual(results.map((r) => r.data.position).sort((a, b) => a - b), [8, 9, 10, 11, 12]);
  const rows = (await chaptersOf(db, m)).filter((c) => c.title.startsWith('New '));
  assert.deepEqual(rows.map((c) => c.scenes), [1, 1, 1, 1, 1]);
  const dup = await one(db, `select count(*)::int as n from (select position from public.chapters where manuscript_id = $1
    group by position having count(*) > 1) t`, [m]);
  assert.equal(dup.n, 0, 'no two Chapters share a position');
  await assertPlacedPositionsValid(db);
});

test('create_chapter_checked refuses another writer\'s Manuscript, a missing one, and anon — writing nothing', async () => {
  const db = await seededDb();
  const before = await snapshot(db);
  signIn(db, BRAM);
  assert.deepEqual(await chapters.createChapter(projectId('hollow'), 'x'), { data: null, error: 'Project not found' });
  const hollow = await manuscriptOf(db, projectId('hollow'));
  assert.deepEqual((await createChapterRpc(as(db, BRAM), hollow)).data, { status: 'error', error: 'Manuscript not found' });
  assert.deepEqual((await createChapterRpc(as(db, BRAM), '00000000-0000-4000-8000-000000000000')).data,
    { status: 'error', error: 'Manuscript not found' });
  assert.ok((await createChapterRpc(as(db, null), hollow)).error, 'anon cannot call it');
  signIn(db, null);
  assert.deepEqual(await chapters.createChapter(projectId('tide'), 'x'), { data: null, error: 'Not authenticated' });
  assert.deepEqual(await snapshot(db), before);
});

// ── 2. free-limit enforcement ─────────────────────────────────────────────────

test('free limit: a Chapter whose first Scene carries words is refused over the limit, and nothing is created', async () => {
  const db = await seededDb();
  const before = await snapshot(db);
  const hollow = await manuscriptOf(db, projectId('hollow'));
  assert.deepEqual((await createChapterRpc(as(db, ALICE), hollow, { words: 5 })).data, { status: 'word_limit_blocked', limit: 2000 });
  assert.deepEqual(await snapshot(db), before, 'no Chapter without its Scene');
  // An empty first Scene is never blocked, even over the limit.
  signIn(db, ALICE);
  assert.equal((await chapters.createChapter(projectId('hollow'), 'Chapter 7')).error, null);
  assert.equal(await accountTotal(db, ALICE), 3035);
});

test('free limit: simultaneous Chapter creations carrying words cannot jointly exceed it', async () => {
  const db = await seededDb();
  const tide = await manuscriptOf(db, projectId('tide'));
  // bram: 2740 of 15,000. Each fits alone; together they do not.
  const [a, b] = await Promise.all([createChapterRpc(as(db, BRAM), tide, { words: 7000 }), createChapterRpc(as(db, BRAM), tide, { words: 7000 })]);
  assert.deepEqual([a.data.status, b.data.status].sort(), ['ok', 'word_limit_blocked']);
  assert.equal(await accountTotal(db, BRAM), 2740 + 7000);
  assert.equal((await chaptersOf(db, tide)).length, 4, 'exactly one new Chapter');
});

test('free limit: the direct-insert bypass is gone — an over-limit writer cannot add words by writing to the table', async () => {
  const db = await seededDb();
  const alice = as(db, ALICE);
  const before = await snapshot(db);
  const hollow = await manuscriptOf(db, projectId('hollow'));
  const r = await alice.from('scenes').insert({ manuscript_id: hollow, chapter_id: null, title: 'x', content: syntheticDoc('x', 500), word_count: 500, position: 99 });
  assert.equal(r.error?.code, '42501');
  assert.deepEqual(await snapshot(db), before);
  assert.equal(await accountTotal(db, ALICE), 3035);
});

// ── 3. direct Scene insertion is closed ───────────────────────────────────────

test('direct Scene inserts are refused for every client, into every list, including the writer\'s own', async () => {
  const db = await seededDb();
  const before = await snapshot(db);
  const hollow = await manuscriptOf(db, projectId('hollow'));
  const rows = {
    'placed, own Chapter': { manuscript_id: hollow, chapter_id: chapterId('hollow.ch5'), title: 'x', position: 0 },
    'placed, Manuscript derived': { chapter_id: chapterId('hollow.ch5'), title: 'x', position: 1 },
    'Unplaced, own Manuscript': { manuscript_id: hollow, chapter_id: null, title: 'x', position: 99 },
    'placed, empty': { manuscript_id: hollow, chapter_id: chapterId('hollow.ch1'), title: 'x', word_count: 0, position: 5 },
  };
  for (const [name, row] of Object.entries(rows)) {
    assert.equal((await as(db, ALICE).from('scenes').insert(row)).error?.code, '42501', `authenticated: ${name}`);
    assert.equal((await as(db, null).from('scenes').insert(row)).error?.code, '42501', `anon: ${name}`);
  }
  assert.deepEqual(await snapshot(db), before);
});

test('reads, updates and deletes of Scenes are unchanged: the owner can, another writer cannot', async () => {
  const db = await seededDb();
  const alice = as(db, ALICE);
  const bram = as(db, BRAM);
  assert.equal((await alice.from('scenes').select('id').eq('id', pageId('h1a'))).data.length, 1);
  assert.deepEqual((await bram.from('scenes').select('id').eq('id', pageId('h1a'))).data, []);
  assert.equal((await alice.from('scenes').update({ title: 'Renamed' }).eq('id', pageId('h1a')).select('id')).data.length, 1);
  assert.deepEqual((await bram.from('scenes').update({ title: 'hijack' }).eq('id', pageId('h1a')).select('id')).data, []);
  assert.deepEqual((await bram.from('scenes').delete().eq('id', pageId('h1a')).select('id')).data, []);
  assert.equal((await alice.from('scenes').delete().eq('id', pageId('h3b')).select('id')).data.length, 1);
});

test('every approved creation path still works: placed, Unplaced, Chapter + Scene, duplicate, onboarding, Arena', async () => {
  const db = await seededDb();
  signIn(db, BRAM);
  const tide = await manuscriptOf(db, projectId('tide'));

  const placed = await scenes.createScene(chapterId('tide.ch3'), 'Placed');
  assert.equal(placed.error, null, placed.error);
  assert.equal(placed.data.position, 2);
  const unplaced = await scenes.createUnplacedScene(projectId('tide'), 'Loose');
  assert.equal(unplaced.error, null, unplaced.error);
  assert.equal(unplaced.data.chapter_id, null);
  const chapter = await chapters.createChapter(projectId('tide'), 'Chapter 4');
  assert.equal(chapter.error, null, chapter.error);
  assert.equal(chapter.data.position, 4);
  const sprint = await games.appendSprintToProject(projectId('tide'), chapter.data.id, 3, '<p>ember loam sable</p>');
  assert.equal(sprint.error, null, sprint.error);
  assert.deepEqual(await all(db, `select id, position, word_count from public.scenes where chapter_id = $1 order by position`, [chapter.data.id]),
    [{ id: (await one(db, `select id from public.scenes where chapter_id = $1 and position = 0`, [chapter.data.id])).id, position: 0, word_count: 0 },
      { id: sprint.data.id, position: 1, word_count: 3 }]);

  const dup = await projects.duplicateProject(projectId('tide'));
  assert.equal(dup.error, null, dup.error);
  const copy = await manuscriptOf(db, dup.data.id);
  const count = async (m) => one(db, `select count(*)::int as n, coalesce(sum(word_count), 0)::int as words from public.scenes where manuscript_id = $1`, [m]);
  assert.deepEqual(await count(copy), await count(tide), 'every Scene, placed and Unplaced, copied');
  assert.equal(dup.data.user_id, BRAM);

  signIn(db, CORA);
  const res = await postOnboarding({ title: 'New book', firstSentence: 'It began at the shore.' });
  assert.equal(res.status, 200);
  const { data } = await res.json();
  assert.deepEqual(await one(db, `select c.title, c.position, s.title as scene, s.position as scene_position, s.word_count
    from public.chapters c join public.scenes s on s.chapter_id = c.id where c.id = $1`, [data.chapterId]),
    { title: 'Chapter 1', position: 1, scene: 'Scene 1', scene_position: 0, word_count: 5 });
  await assertPlacedPositionsValid(db);
});

test('SECURITY DEFINER creation RPCs still refuse other writers explicitly, and anon', async () => {
  const db = await seededDb();
  const before = await snapshot(db);
  const bram = as(db, BRAM);
  const hollow = await manuscriptOf(db, projectId('hollow'));
  assert.deepEqual((await bram.rpc('insert_scene_checked', { p_chapter_id: chapterId('hollow.ch5'), p_title: 'x', p_content: null, p_word_count: 0, p_position: null })).data,
    { status: 'error', error: 'Chapter not found' });
  assert.deepEqual((await bram.rpc('insert_unplaced_scene_checked', { p_manuscript_id: hollow, p_title: 'x', p_content: null, p_word_count: 0 })).data,
    { status: 'error', error: 'Manuscript not found' });
  assert.deepEqual((await bram.rpc('duplicate_project_checked', { p_project_id: projectId('hollow') })).data,
    { status: 'error', error: 'Project not found' });
  for (const [fn, args] of [
    ['insert_scene_checked', { p_chapter_id: chapterId('tide.ch3'), p_title: 'x', p_content: null, p_word_count: 0, p_position: null }],
    ['insert_unplaced_scene_checked', { p_manuscript_id: hollow, p_title: 'x', p_content: null, p_word_count: 0 }],
    ['duplicate_project_checked', { p_project_id: projectId('tide') }],
    ['create_chapter_checked', { p_manuscript_id: hollow, p_title: 'x', p_scene_title: 'x', p_scene_content: null, p_scene_word_count: 0 }],
  ]) assert.ok((await as(db, null).rpc(fn, args)).error, `anon: ${fn}`);
  assert.deepEqual(await snapshot(db), before);

  const fns = await all(db, `select p.proname, p.prosecdef, array_to_string(p.proconfig, ',') as config,
      has_function_privilege('anon', p.oid, 'EXECUTE') as anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth
    from pg_proc p where p.pronamespace = 'public'::regnamespace
     and p.proname in ('insert_scene_checked', 'insert_unplaced_scene_checked', 'duplicate_project_checked', 'create_chapter_checked')
    order by p.proname`);
  for (const f of fns) {
    assert.deepEqual([f.prosecdef, f.config, f.anon, f.auth], [true, 'search_path=""', false, true], f.proname);
  }
  assert.equal(fns.length, 4);
});

// ── 4. placed-position uniqueness ─────────────────────────────────────────────

test('placed positions are unique per Chapter (deferrable); Unplaced positions are unique per Manuscript (migration 022)', async () => {
  const db = await seededDb();
  const con = await one(db, `select pg_get_constraintdef(oid) as def, condeferrable, condeferred from pg_constraint
    where conname = 'scenes_chapter_id_position_key'`);
  assert.deepEqual(con, { def: 'UNIQUE (chapter_id, "position") DEFERRABLE', condeferrable: true, condeferred: false });

  const alice = as(db, ALICE);
  // A direct position update that would tie is refused (23505) and changes nothing.
  const tie = await alice.from('scenes').update({ position: 0 }).eq('id', pageId('h4b')).select('id');
  assert.equal(tie.error?.code, '23505');
  // Placing an Unplaced Scene at a taken position is refused; at a free one it works.
  const h3a = (await one(db, `select position from public.scenes where id = $1`, [pageId('h3a')])).position;
  assert.equal((await alice.from('scenes').update({ chapter_id: chapterId('hollow.ch3'), position: h3a }).eq('id', pageId('h3b')).select('id')).error?.code, '23505');
  // Unplaced positions may not tie either (scenes_unplaced_position_excl, migration 022).
  const taken = (await one(db, `select position from public.scenes where id = $1`, [pageId('h3b')])).position;
  const unplacedTie = await alice.from('scenes').update({ position: taken }).eq('id', pageId('h3c')).select('id');
  assert.equal(unplacedTie.error?.code, '23P01', 'exclusion_violation');
  await assertPlacedPositionsValid(db);
});

test('the constraint works with reorder (a full reversal in one statement), move_scene and creation', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const ch4 = chapterId('hollow.ch4');
  const ids = async () => (await all(db, `select id from public.scenes where chapter_id = $1 order by position`, [ch4])).map((r) => r.id);
  const original = await ids();
  assert.ok(original.length >= 2, 'a Chapter with several Scenes');
  // Reversal: every row swaps into a position another row still holds mid-statement.
  assert.deepEqual(await scenes.reorderScenes(ch4, [...original].reverse()), { error: null });
  assert.deepEqual(await ids(), [...original].reverse());
  assert.deepEqual(await scenes.reorderScenes(ch4, original), { error: null });

  // Moves in and out, and creations, in between.
  assert.equal((await scenes.moveSceneToChapter(pageId('h3b'), ch4)).error, null);
  assert.equal((await scenes.createScene(ch4, 'After')).error, null);
  assert.equal((await scenes.moveSceneToUnplaced(original[0])).error, null);
  const after = await ids();
  assert.deepEqual(await scenes.reorderScenes(ch4, [...after].reverse()), { error: null });
  assert.deepEqual(await ids(), [...after].reverse());
  assert.deepEqual((await all(db, `select position from public.scenes where chapter_id = $1 order by position`, [ch4])).map((r) => r.position),
    after.map((_, i) => i), 'renumbered 0..n-1');
  await assertPlacedPositionsValid(db);
});
