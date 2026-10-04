// Project creation + deletion hardening (Rune 2.0 Phase 1, Task 8, migration
// 021, 037): the REAL createProject / createProjectWithDraft / onboarding /
// Scene Trash / removeChapterKeepScenes code, and the offline sync engine,
// against the Rune 2.0 schema in real Postgres + RLS.
//
//   * create_project_checked: Project → Manuscript → Chapter 1 → Scene 1 in
//     one transaction, deduplicated by a client request id
//   * clients cannot INSERT projects or write projects.word_count
//   * permanent Scene deletion only from Trash (037: no client DELETE); the
//     only Scene of a Chapter may go (the Chapter stays, empty)
//   * delete_chapter ("remove chapter, keep its scenes"): the Chapter's
//     Scenes move to Unplaced (same rows), then the empty Chapter is deleted;
//     the Scene→Chapter FK no longer cascades
//   * no free-word limit (037): creation with words is never blocked
//
// Data: the synthetic legacy fixture moved into the Rune 2.0 schema
// (lib/legacy-to-rune2.mjs). alice (starter_2k, 3035 words: over her 2,000)
// owns hollow: ch1 [h1a 120], ch2 [h2a 300], ch3 [h3a 410], ch5 [],
// ch4 [h4a 200, h4b 0, h4c 150], ch6 [h6c 270]; Unplaced [h3b 380, h3c 95,
// h6a 250, h6b 260]; ordered total 1450. bram (legacy_15k, 2740) owns tide:
// ch1 [t1b 650], ch2 [t2a 0], ch3 [t3a 330, t3b 340]; Unplaced [t1a, t1c];
// ordered total 1320. cora (starter_2k) has no words.
import 'fake-indexeddb/auto'; // offline/db.ts and the sync engine
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createTestDb, readRepoFile, HARNESS_DIR, LEGACY_BASELINE, RUNE2_SCHEMA } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';
import { prototypeLegacyToRune2 } from '../lib/legacy-to-rune2.mjs';
import { USERS, chapterId, pageId, projectId, syntheticDoc, seedFixture } from '../fixtures/manuscript-fixture.mjs';

const ALICE = USERS.alice.id;
const BRAM = USERS.bram.id;
const CORA = USERS.cora.id;
const REQ = (n) => `00000000-0000-4000-8000-00000000${String(n).padStart(4, '0')}`;

const as = (db, userId) => createSupabaseAdapter(db, userId ? { userId } : {});
const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const all = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const manuscriptOf = async (db, pid) => (await one(db, `select id from public.manuscripts where project_id = $1`, [pid])).id;
const storedTotal = async (db, pid) => (await one(db, `select word_count from public.projects where id = $1`, [pid])).word_count;
const orderedTotal = async (db, pid) => (await one(db, `select coalesce(sum(s.word_count), 0)::int as n
  from public.scenes s join public.manuscripts m on m.id = s.manuscript_id
 where m.project_id = $1 and s.chapter_id is not null`, [pid])).n;
const accountTotal = async (db, userId) => (await as(db, userId).rpc('account_word_total')).data;
const projectCount = async (db, userId) => (await one(db, `select count(*)::int as n from public.projects where user_id = $1`, [userId])).n;
const unplacedIds = async (db, pid) => (await all(db, `select s.id from public.scenes s join public.manuscripts m on m.id = s.manuscript_id
  where m.project_id = $1 and s.chapter_id is null order by s.position, s.id`, [pid])).map((r) => r.id);

/** Every manuscript row and every writing-history row — to prove a refused or failed operation changed nothing. */
const snapshot = async (db) => ({
  projects: await all(db, `select * from public.projects order by id`),
  manuscripts: await all(db, `select * from public.manuscripts order by id`),
  chapters: await all(db, `select * from public.chapters order by id`),
  scenes: await all(db, `select * from public.scenes order by id`),
  sessions: await all(db, `select * from public.writing_sessions order by id`),
  letters: await all(db, `select * from public.future_letters order by id`),
});

/** The stored total equals the ordered total for every Project; no list has tied or negative positions. */
async function assertIntegrity(db) {
  const stale = await all(db, `select p.id, p.word_count, coalesce(sum(s.word_count) filter (where s.chapter_id is not null), 0)::int as ordered
    from public.projects p join public.manuscripts m on m.project_id = p.id left join public.scenes s on s.manuscript_id = m.id
   group by p.id, p.word_count having p.word_count <> coalesce(sum(s.word_count) filter (where s.chapter_id is not null), 0)`);
  // ash's fixture total is deliberately stale (999, true 100) until something recomputes it.
  assert.deepEqual(stale.filter((r) => r.id !== projectId('ash')), [], 'stored totals match the ordered totals');
  const ties = await all(db, `select coalesce(chapter_id::text, 'unplaced:' || manuscript_id) as list, position
    from public.scenes group by 1, 2 having count(*) > 1 or position < 0`);
  assert.deepEqual(ties, [], 'no tied or negative positions in any list');
  const orphans = await one(db, `select count(*)::int as n from public.projects p
    where not exists (select 1 from public.manuscripts m where m.project_id = p.id)`);
  assert.equal(orphans.n, 0, 'every Project has its Manuscript');
}

const BROWSER = path.join(HARNESS_DIR, 'mocks/supabaseBrowser.js');
let legacy;
let projects, chapters, scenes, trash, onboarding, engine, offline;
before(async () => {
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
  projects = await bundleForTest('src/lib/actions/projects.ts', { name: 'life_projects' });
  chapters = await bundleForTest('src/lib/actions/chapters.ts', { name: 'life_chapters' });
  scenes = await bundleForTest('src/lib/actions/scenes.ts', { name: 'life_scenes' });
  trash = await bundleForTest('src/lib/actions/workspaceTrash.ts', { name: 'life_trash' });
  onboarding = await bundleForTest('src/lib/actions/onboarding.ts', { name: 'life_onboarding' });
  engine = await bundleForTest('src/lib/offline/syncEngine.ts', { name: 'life_syncEngine', aliases: { '@/lib/supabase/client': BROWSER } });
  offline = await bundleForTest('src/lib/offline/db.ts', { name: 'life_offline_db' });
});

beforeEach(async () => {
  const idb = await offline.getOfflineDB();
  for (const store of ['pending_writes', 'page_cache', 'chapter_meta', 'pending_writing_credits']) await idb.clear(store);
});

async function seededDb() {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  await prototypeLegacyToRune2(legacy, db);
  // The prototype mapping leaves ties in the Unplaced lists; number each one
  // 0..n-1 in its current order so "no tied positions" is meaningful here.
  await db.exec(`
    update public.scenes s set position = o.rn - 1
      from (select id, row_number() over (partition by manuscript_id order by position, id) as rn
              from public.scenes where chapter_id is null) o
     where s.id = o.id;`);
  return db;
}

function signIn(db, userId) {
  const sb = as(db, userId);
  globalThis.__runeBrowserClient = sb;
  for (const mod of [projects, chapters, scenes, trash, onboarding, engine]) mod.setServerClient(sb);
  return sb;
}

/** Permanent Scene deletion, the only way there is (037): to Trash, then deleted from Trash. */
async function purgeScene(id) {
  const t = await trash.trashWorkspaceObject('scene', id);
  if (t.error !== null) return { error: t.error };
  const d = await trash.deleteTrashedWorkspaceObject('scene', id);
  return { error: d.error };
}

// Rune 2.0 onboarding (BC-E): its Project comes from createOnboardingProject,
// deduplicated by the journey's own request id (account_onboarding, 052).
const onboardProject = (title) => onboarding.createOnboardingProject(title);

/** The Project's full structure: Chapters in order, each with its Scenes in order. */
async function structureOf(db, pid) {
  const m = await manuscriptOf(db, pid);
  const chs = await all(db, `select id, title, position from public.chapters where manuscript_id = $1 order by position`, [m]);
  return Promise.all(chs.map(async (c) => ({
    title: c.title, position: c.position,
    scenes: await all(db, `select title, position, word_count, content from public.scenes where chapter_id = $1 order by position`, [c.id]),
  })));
}

// ── 1. atomic creation ────────────────────────────────────────────────────────


/** Permanent Project deletion, the only way there is (049): to Trash, then deleted from Trash. */
async function purgeProject(id) {
  const t = await projects.trashProject(id);
  if (t.error !== null) return { error: t.error };
  return projects.deleteTrashedProject(id);
}

test('createProject, createProjectWithDraft and onboarding: ONE database call creates Project → Manuscript → "Chapter 1" → empty "Scene 1"', async () => {
  const db = await seededDb();
  const sb = signIn(db, CORA);
  const expected = [{ title: 'Chapter 1', position: 1, scenes: [{ title: 'Scene 1', position: 0, word_count: 0, content: null }] }];

  sb.calls.length = 0;
  const p = await projects.createProject('  A quiet house ', '  About a house ', '#6b2737', REQ(1));
  assert.equal(p.error, null, p.error);
  assert.deepEqual(sb.calls.map((c) => `${c.kind}:${c.name}`), ['rpc:create_project_checked'], 'no direct Project, Chapter or Scene insert');
  assert.deepEqual([p.data.title, p.data.description, p.data.cover_color, p.data.user_id, p.data.word_count],
    ['A quiet house', 'About a house', '#6b2737', CORA, 0]);
  assert.deepEqual(await structureOf(db, p.data.id), expected, 'the New Project dialog now creates the initial structure too');

  sb.calls.length = 0;
  const d = await projects.createProjectWithDraft('A second story', undefined, REQ(2));
  assert.equal(d.error, null, d.error);
  assert.deepEqual(sb.calls.map((c) => `${c.kind}:${c.name}`), ['rpc:create_project_checked', 'from:scenes']);
  assert.deepEqual(await structureOf(db, d.data.projectId), expected);
  assert.equal(d.data.chapter.id, d.data.chapterId);
  assert.equal(d.data.scene.chapter_id, d.data.chapterId);
  assert.equal(d.data.project.id, d.data.projectId);

  sb.calls.length = 0;
  const o = await onboardProject('The first book');
  assert.equal(o.error, null, o.error);
  assert.equal(sb.calls.filter((c) => c.kind === 'rpc' && c.name === 'create_project_checked').length, 1, 'one creation call');
  assert.deepEqual([...new Set(sb.calls.filter((c) => c.kind === 'from').map((c) => c.name))], ['account_onboarding'],
    'no direct Project, Chapter or Scene write');
  assert.deepEqual(await structureOf(db, o.data.projectId), expected, 'onboarding: Project → Manuscript → Chapter 1 → an empty Scene, nothing more');
  assert.equal(await storedTotal(db, o.data.projectId), 0);
  assert.equal(await accountTotal(db, CORA), 0);
  await assertIntegrity(db);
});

test('a failure at ANY creation step leaves nothing: no Project, Manuscript, Chapter or Scene', async () => {
  const steps = [
    ['projects', 'Project'], ['manuscripts', 'Manuscript'], ['chapters', 'Chapter'], ['scenes', 'Scene'],
  ];
  for (const [table, label] of steps) {
    const db = await seededDb();
    await db.exec(`
      create function public.test_fail() returns trigger language plpgsql as $$
      begin raise exception 'simulated ${label} failure'; end $$;
      create trigger test_fail before insert on public.${table} for each row execute function public.test_fail();`);
    signIn(db, CORA);
    const before = await snapshot(db);

    const p = await projects.createProject('Failing', undefined, undefined, REQ(10));
    assert.match(p.error, new RegExp(`simulated ${label} failure`), `createProject at the ${label} step`);
    const d = await projects.createProjectWithDraft('Failing', undefined, REQ(11));
    assert.match(d.error, new RegExp(`simulated ${label} failure`));
    const o = await onboardProject('Failing');
    assert.equal(o.data, null);
    assert.deepEqual(await snapshot(db), before, `nothing left behind after a ${label} failure`);

    // The same request ids work once the failure is gone: nothing was recorded for them.
    await db.exec(`drop trigger test_fail on public.${table};`);
    const retry = await projects.createProject('Failing', undefined, undefined, REQ(10));
    assert.equal(retry.error, null);
    assert.equal(await projectCount(db, CORA), 2, 'coraEmpty + the retried one');
    await assertIntegrity(db);
  }
});

test('no free limit (037): onboarding and a first Scene with words are never blocked, even far past the old allowance', async () => {
  const db = await seededDb();
  signIn(db, ALICE); // 3035 words — over the old 2,000 allowance
  const o = await onboardProject('Over');
  assert.equal(o.error, null, o.error);
  const rpc = await as(db, ALICE).rpc('create_project_checked', { p_title: 'Over again', p_description: null, p_cover_color: null,
    p_first_scene_content: syntheticDoc('x', 3), p_first_scene_word_count: 3, p_request_id: null });
  assert.equal(rpc.data.status, 'ok');

  const p = await projects.createProject('Empty is fine', undefined, undefined, REQ(21));
  assert.equal(p.error, null, 'no words, never blocked');
  assert.equal(await accountTotal(db, ALICE), 3035 + 3, 'account_word_total is only a metric now');
  await assertIntegrity(db);
});

test('create_project_checked refuses an empty title, anon, and a caller who is not signed in — writing nothing', async () => {
  const db = await seededDb();
  const before = await snapshot(db);
  const call = (userId, title) => as(db, userId).rpc('create_project_checked', { p_title: title, p_description: null,
    p_cover_color: null, p_first_scene_content: null, p_first_scene_word_count: 0, p_request_id: null });
  assert.deepEqual((await call(CORA, '   ')).data, { status: 'error', error: 'Title is required' });
  assert.ok((await call(null, 'x')).error, 'anon has no EXECUTE');
  signIn(db, null);
  assert.deepEqual(await projects.createProject('x'), { data: null, error: 'Not authenticated' });
  assert.deepEqual(await snapshot(db), before);
});

// ── 2. retries ────────────────────────────────────────────────────────────────

test('retry: the same request id returns the Project already created — never a second one', async () => {
  const db = await seededDb();
  signIn(db, CORA);
  const first = await projects.createProject('Once', undefined, undefined, REQ(30));
  const afterFirst = await snapshot(db);
  const again = await projects.createProject('Once', undefined, undefined, REQ(30));
  assert.equal(again.data.id, first.data.id);
  assert.deepEqual(await snapshot(db), afterFirst, 'the retry wrote nothing');

  const d1 = await projects.createProjectWithDraft('Draft', undefined, REQ(31));
  const d2 = await projects.createProjectWithDraft('Draft', undefined, REQ(31));
  assert.deepEqual([d2.data.projectId, d2.data.chapterId, d2.data.scene.id], [d1.data.projectId, d1.data.chapterId, d1.data.scene.id],
    'the retry opens the same Chapter and Scene');

  // Simultaneous submissions of one attempt (a double click, a replayed request).
  const burst = await Promise.all([1, 2, 3].map(() => projects.createProject('Burst', undefined, undefined, REQ(32))));
  assert.equal(new Set(burst.map((r) => r.data.id)).size, 1);

  // Distinct attempts are distinct Projects; no request id means no deduplication.
  await projects.createProject('Twin', undefined, undefined, REQ(33));
  await projects.createProject('Twin', undefined, undefined, REQ(34));
  await projects.createProject('Twin');
  await projects.createProject('Twin');
  assert.equal(await projectCount(db, CORA), 1 + 1 + 1 + 1 + 4);

  // Another writer's request id never returns (or reveals) Cora's Project.
  signIn(db, BRAM);
  const bram = await projects.createProject('Mine', undefined, undefined, REQ(30));
  assert.notEqual(bram.data.id, first.data.id);
  assert.equal(bram.data.user_id, BRAM);
  await assertIntegrity(db);
});

test('onboarding retry after a lost response (or a second click): one Project, renamed if the title changed', async () => {
  const db = await seededDb();
  signIn(db, CORA);
  const [a, b] = await Promise.all([onboardProject('The first book'), onboardProject('The first book')]);
  assert.equal(a.error, null, a.error);
  assert.equal(b.error, null, b.error);
  assert.equal(b.data.projectId, a.data.projectId, 'simultaneous requests share the journey\'s request id');
  const c = await onboardProject('The First Book');
  assert.equal(c.data.projectId, a.data.projectId, 'a later retry returns the same Project');
  assert.equal(await projectCount(db, CORA), 2, 'coraEmpty + one');
  assert.equal((await one(db, `select title from public.projects where id = $1`, [a.data.projectId])).title, 'The First Book');
  const events = await all(db, `select event_name, count(*)::int as n from public.analytics_events where user_id = $1 group by 1 order by 1`, [CORA]);
  assert.deepEqual(events.filter((e) => e.n !== 1), [], 'no event recorded twice');
});

// ── 3. permissions ────────────────────────────────────────────────────────────

test('clients cannot insert Projects or write projects.word_count; every other Project edit still works', async () => {
  const db = await seededDb();
  const alice = as(db, ALICE);
  const insert = await alice.from('projects').insert({ user_id: ALICE, title: 'direct', word_count: 99999 });
  assert.equal(insert.error?.code, '42501');
  const write = await alice.from('projects').update({ word_count: 99999 }).eq('id', projectId('hollow')).select('id');
  assert.equal(write.error?.code, '42501');
  assert.match(write.error.message, /maintained by the database/);
  assert.equal(await storedTotal(db, projectId('hollow')), 1450);

  signIn(db, ALICE);
  const edit = await projects.updateProject(projectId('hollow'), { title: 'Hollow, renamed', chapter_goal: 12 });
  assert.equal(edit.error, null, edit.error);
  assert.deepEqual([edit.data.title, edit.data.chapter_goal, edit.data.word_count], ['Hollow, renamed', 12, 1450]);
  assert.deepEqual(await projects.toggleProjectPin(projectId('hollow'), true), { error: null });
  // Saves still update it through the database's own trigger.
  await scenes.moveSceneToUnplaced(pageId('h1a'));
  assert.equal(await storedTotal(db, projectId('hollow')), 1450 - 120);
});

// ── 4. Scene deletion ─────────────────────────────────────────────────────────

test('permanent Scene deletion (from Trash): removes exactly that Scene; its writing history stays (migration 022); totals follow; nothing else changes', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const before = await snapshot(db);
  const r = await purgeScene(pageId('h4c'));
  assert.deepEqual(r, { error: null });
  const after = await snapshot(db);
  assert.deepEqual(after.scenes, before.scenes.filter((s) => s.id !== pageId('h4c')));
  const daily = (rows) => rows.reduce((m, s) => ({ ...m, [`${s.user_id} ${s.session_date}`]: (m[`${s.user_id} ${s.session_date}`] ?? 0) + s.words_added }), {});
  assert.ok(before.sessions.some((s) => s.scene_id === pageId('h4c')), 'the fixture has history on h4c');
  assert.ok(!after.sessions.some((s) => s.scene_id === pageId('h4c')), 'nothing references the deleted Scene');
  assert.deepEqual(daily(after.sessions), daily(before.sessions), 'every writer keeps every day\'s words (scenes_detach_writing_sessions)');
  assert.deepEqual(after.sessions.filter((s) => s.scene_id !== null), before.sessions.filter((s) => s.scene_id !== null && s.scene_id !== pageId('h4c')),
    'other Scenes\' history untouched');
  assert.deepEqual(after.chapters, before.chapters);
  assert.equal(await storedTotal(db, projectId('hollow')), 1450 - 150);
  assert.equal(await accountTotal(db, ALICE), 3035 - 150);

  // An Unplaced Scene: the ordered total does not move, the account total does.
  assert.deepEqual(await purgeScene(pageId('h3b')), { error: null });
  assert.equal(await storedTotal(db, projectId('hollow')), 1450 - 150);
  assert.equal(await accountTotal(db, ALICE), 3035 - 150 - 380);
  await assertIntegrity(db);
});

test('deleting the only Scene of a Chapter leaves a valid, empty Chapter that takes new Scenes', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  assert.deepEqual(await purgeScene(pageId('h1a')), { error: null });
  assert.deepEqual((await chapters.getChapters(projectId('hollow'))).data.find((c) => c.id === chapterId('hollow.ch1')).scenes, [],
    'the Chapter stays, with no Scenes');
  assert.equal(await storedTotal(db, projectId('hollow')), 1450 - 120);
  const added = await scenes.createScene(chapterId('hollow.ch1'), 'Scene 1');
  assert.equal(added.error, null);
  assert.equal(added.data.position, 0);
  await assertIntegrity(db);
});

test('Scene deletion refuses another writer\'s Scene and a missing one, and clients cannot delete directly — changing nothing', async () => {
  const db = await seededDb();
  const before = await snapshot(db);
  signIn(db, BRAM);
  assert.deepEqual(await purgeScene(pageId('h1a')), { error: 'Item not found' });
  assert.deepEqual(await purgeScene('00000000-0000-4000-8000-000000000000'), { error: 'Item not found' });
  const direct = await as(db, ALICE).from('scenes').delete().eq('id', pageId('h1a')).select('id');
  assert.match(direct.error?.message ?? '', /permission denied/, 'no client DELETE (037): only from Trash');
  signIn(db, null);
  assert.deepEqual(await purgeScene(pageId('t1b')), { error: 'Not authenticated' });
  assert.deepEqual(await snapshot(db), before);
});

// ── 5. Removing a Chapter, keeping its Scenes (delete_chapter; not Trash) ───────────────────────────────────────────────────────

test('removeChapterKeepScenes: every Scene moves to the end of Unplaced, in order — same IDs, prose and writing history — then the Chapter goes', async () => {
  const db = await seededDb();
  const sb = signIn(db, ALICE);
  const before = await snapshot(db);
  const moving = [pageId('h4a'), pageId('h4b'), pageId('h4c')]; // ch4, in position order
  const unplacedBefore = await unplacedIds(db, projectId('hollow'));

  sb.calls.length = 0;
  const r = await chapters.removeChapterKeepScenes(chapterId('hollow.ch4'), projectId('hollow'));
  assert.deepEqual(r, { error: null, unplacedSceneIds: moving });
  assert.deepEqual(sb.calls.map((c) => `${c.kind}:${c.name}`), ['rpc:delete_chapter'], 'one atomic call');

  const after = await snapshot(db);
  assert.deepEqual(after.chapters, before.chapters.filter((c) => c.id !== chapterId('hollow.ch4')));
  assert.deepEqual(await unplacedIds(db, projectId('hollow')), [...unplacedBefore, ...moving], 'appended after the existing Unplaced Scenes');
  for (const id of moving) {
    const [was, now] = [before.scenes.find((s) => s.id === id), after.scenes.find((s) => s.id === id)];
    assert.equal(now.chapter_id, null);
    assert.equal(now.version, was.version + 1, 'a placement change bumps the version, like a move');
    const keep = ({ id: i, manuscript_id, title, content, word_count, created_at }) => ({ i, manuscript_id, title, content, word_count, created_at });
    assert.deepEqual(keep(now), keep(was), 'same row: Manuscript, title, prose, word count, created_at');
  }
  assert.equal(after.scenes.length, before.scenes.length, 'no Scene deleted, none copied');
  assert.deepEqual(after.sessions, before.sessions, 'writing history untouched');
  assert.equal(await storedTotal(db, projectId('hollow')), 1450 - 350, 'their words leave the ordered total');
  assert.equal(await accountTotal(db, ALICE), 3035, 'but not the account total');

  // Immediately reachable where the writer looks for them.
  const listed = (await scenes.getUnplacedScenes(projectId('hollow'))).data.map((s) => s.id);
  assert.deepEqual(listed.slice(-3), moving);
  await assertIntegrity(db);
});

test('removeChapterKeepScenes: an empty Chapter is simply removed; simultaneous deletions never tie Unplaced positions', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  assert.deepEqual(await chapters.removeChapterKeepScenes(chapterId('hollow.ch5'), projectId('hollow')), { error: null, unplacedSceneIds: [] });
  const results = await Promise.all(['hollow.ch1', 'hollow.ch2', 'hollow.ch3', 'hollow.ch6'].map((c) =>
    chapters.removeChapterKeepScenes(chapterId(c), projectId('hollow'))));
  for (const r of results) assert.equal(r.error, null, r.error);
  assert.equal(await storedTotal(db, projectId('hollow')), 350, 'only ch4 is left');
  assert.equal((await unplacedIds(db, projectId('hollow'))).length, 4 + 4);
  await assertIntegrity(db);
});

test('removeChapterKeepScenes refuses another writer\'s Chapter and a missing one, changing nothing', async () => {
  const db = await seededDb();
  const before = await snapshot(db);
  signIn(db, BRAM);
  assert.deepEqual(await chapters.removeChapterKeepScenes(chapterId('hollow.ch4'), projectId('hollow')), { error: 'Chapter not found' });
  assert.deepEqual(await chapters.removeChapterKeepScenes('00000000-0000-4000-8000-000000000000', projectId('tide')), { error: 'Chapter not found' });
  assert.ok((await as(db, null).rpc('delete_chapter', { p_chapter_id: chapterId('tide.ch3') })).error, 'anon has no EXECUTE');
  signIn(db, null);
  assert.deepEqual(await chapters.removeChapterKeepScenes(chapterId('tide.ch3'), projectId('tide')), { error: 'Not authenticated' });
  assert.deepEqual(await snapshot(db), before);
});

test('a Chapter removal that fails part-way rolls back completely: the Chapter and every Scene unchanged', async () => {
  for (const failure of [
    // after every Scene has moved, when the Chapter row is deleted
    `create trigger test_fail before delete on public.chapters for each row execute function public.test_fail();`,
    // after the first Scene has moved, on the second
    `create trigger test_fail before update of chapter_id on public.scenes for each row
       when (old.id = '${pageId('h4b')}') execute function public.test_fail();`,
  ]) {
    const db = await seededDb();
    await db.exec(`create function public.test_fail() returns trigger language plpgsql as $$
      begin raise exception 'simulated failure'; end $$; ${failure}`);
    signIn(db, ALICE);
    const before = await snapshot(db);
    const r = await chapters.removeChapterKeepScenes(chapterId('hollow.ch4'), projectId('hollow'));
    assert.match(r.error, /simulated failure/);
    assert.deepEqual(await snapshot(db), before, 'nothing moved, nothing deleted, totals unchanged');
  }
});

test('deleting a Project still removes its whole Manuscript (the non-cascading Scene→Chapter FK does not block it)', async () => {
  const db = await seededDb();
  signIn(db, BRAM);
  assert.deepEqual(await purgeProject(projectId('tide')), { error: null });
  const left = await one(db, `select
    (select count(*)::int from public.chapters where id = any($1::uuid[])) as chapters,
    (select count(*)::int from public.scenes where id = any($2::uuid[])) as scenes`,
    [[chapterId('tide.ch1'), chapterId('tide.ch2'), chapterId('tide.ch3')], [pageId('t1a'), pageId('t1b'), pageId('t3a')]]);
  assert.deepEqual(left, { chapters: 0, scenes: 0 });
});

// ── 6. offline ────────────────────────────────────────────────────────────────

test('REAL sync engine: prose queued offline for a Scene lands on that same Scene after its Chapter is removed', async () => {
  const db = await seededDb();
  signIn(db, BRAM);
  const t3a = (await one(db, `select * from public.scenes where id = $1`, [pageId('t3a')]));
  await offline.cacheScene(t3a, projectId('tide'));
  await engine.writeToPendingQueue(pageId('t3a'), BRAM, syntheticDoc('offline-t3a', 345), 345);

  const r = await chapters.removeChapterKeepScenes(chapterId('tide.ch3'), projectId('tide'));
  assert.deepEqual(r.unplacedSceneIds, [pageId('t3a'), pageId('t3b')]);
  await offline.forgetStalePlacements(projectId('tide'), chapterId('tide.ch3'), []); // as ChapterRow does
  assert.equal(await storedTotal(db, projectId('tide')), 1320 - 670);

  await engine.flushPendingQueue();
  assert.equal(await offline.getPendingWrite(pageId('t3a')), null, 'queue cleared');
  const now = await one(db, `select chapter_id, word_count, content from public.scenes where id = $1`, [pageId('t3a')]);
  assert.deepEqual([now.chapter_id, now.word_count], [null, 345], 'saved onto the same, now Unplaced, Scene');
  assert.deepEqual(now.content, syntheticDoc('offline-t3a', 345));
  assert.equal(await storedTotal(db, projectId('tide')), 1320 - 670, 'Unplaced words stay out of the ordered total');
  assert.equal((await one(db, `select count(*)::int as n from public.scenes where manuscript_id = $1`, [await manuscriptOf(db, projectId('tide'))])).n, 6,
    'no copies were made');
  await assertIntegrity(db);
});
