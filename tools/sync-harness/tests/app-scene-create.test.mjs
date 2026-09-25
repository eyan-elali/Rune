// Atomic placed-Scene creation (Rune 2.0 Phase 1, Task 6B): the REAL
// createScene / appendSprintToProject actions and insert_scene_checked
// (migration 018) against the Rune 2.0 schema in real Postgres + RLS.
//
// Data: the synthetic legacy fixture moved into the Rune 2.0 schema
// (lib/legacy-to-rune2.mjs). bram/tide: ch1 [t1b 650], ch2 [t2a 0],
// ch3 [t3a 330, t3b 340], Unplaced [t1a 700, t1c 720]; ordered total 1320,
// account total 2740 of his legacy 15,000. alice (2,000 limit) is already over
// hers at 3035; alice/hollow and alice/ash are her two projects.
//
// PGlite is one connection, so it cannot show two backends blocking on a lock.
// What it can show: each creation is ONE database call (one transaction) that
// picks its own position, so simultaneous action calls cannot interleave
// between "read the last position" and "insert at it" — they did when the
// action read the position itself — and the function holds the per-account
// advisory lock that move_scene takes while it works.
import 'fake-indexeddb/auto'; // games.ts pulls in the offline modules
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, readRepoFile, asUser, LEGACY_BASELINE, RUNE2_SCHEMA } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';
import { prototypeLegacyToRune2 } from '../lib/legacy-to-rune2.mjs';
import { USERS, chapterId, pageId, projectId, syntheticDoc, seedFixture } from '../fixtures/manuscript-fixture.mjs';

const ALICE = USERS.alice.id;
const BRAM = USERS.bram.id;

const as = (db, userId) => createSupabaseAdapter(db, userId ? { userId } : {});
const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const all = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const storedTotal = async (db, pid) => (await one(db, `select word_count from public.projects where id = $1`, [pid])).word_count;
const accountTotal = async (db, userId) => (await as(db, userId).rpc('account_word_total')).data;
const inChapter = async (db, cid) =>
  all(db, `select id, position from public.scenes where chapter_id = $1 order by position, id`, [cid]);
const manuscriptOf = async (db, pid) => (await one(db, `select id from public.manuscripts where project_id = $1`, [pid])).id;
const insert = (sb, chapter, { words = 0, position = 0 } = {}) => sb.rpc('insert_scene_checked', {
  p_chapter_id: chapter, p_title: 'x', p_content: words ? syntheticDoc('x', words) : null, p_word_count: words, p_position: position,
});

/** Every Scene, Chapter and project total — to prove a refused/failed creation left nothing behind. */
const snapshot = async (db) => ({
  scenes: await all(db, `select id, manuscript_id, chapter_id, position, word_count, content, version, updated_at::text
    from public.scenes order by id`),
  chapters: await all(db, `select id, updated_at::text from public.chapters order by id`),
  projects: await all(db, `select id, word_count, updated_at::text from public.projects order by id`),
});

/** Every Chapter and every Unplaced list: positions are distinct non-negative integers. */
async function assertAllPositionsValid(db) {
  const bad = await all(db, `
    select coalesce(chapter_id::text, 'unplaced:' || manuscript_id) as list, position, count(*)::int as n
      from public.scenes group by 1, 2 having count(*) > 1 or position < 0`);
  assert.deepEqual(bad, [], 'no tied or negative positions in any list');
}

let legacy;
let scenes, games;
before(async () => {
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
  scenes = await bundleForTest('src/lib/actions/scenes.ts', { name: 'create_scenes' });
  games = await bundleForTest('src/lib/actions/games.ts', { name: 'create_games' });
});

async function seededDb() {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  await prototypeLegacyToRune2(legacy, db);
  // The prototype mapping keeps each alternate's old in-Chapter position, so an
  // Unplaced list can start with ties. Number each Unplaced list 0..n-1 so
  // "every list is valid" is a meaningful invariant here.
  await db.exec(`
    update public.scenes s set position = o.rn - 1
      from (select id, row_number() over (partition by manuscript_id order by position, id) as rn
              from public.scenes where chapter_id is null) o
     where s.id = o.id;`);
  return db;
}

function signIn(db, userId) {
  const sb = as(db, userId);
  for (const mod of [scenes, games]) mod.setServerClient(sb);
  return sb;
}

// ── normal creation ───────────────────────────────────────────────────────────

test('createScene appends an empty Scene to the Chapter in one checked call; the database picks the position', async () => {
  const db = await seededDb();
  const sb = signIn(db, BRAM);
  const ch3 = chapterId('tide.ch3');
  sb.calls.length = 0;
  const r = await scenes.createScene(ch3, '  Scene 3 ');
  assert.equal(r.error, null, r.error);
  assert.deepEqual(sb.calls.map((c) => `${c.kind}:${c.name}`), ['rpc:insert_scene_checked', 'from:scenes'],
    'one checked call, then the new row is read back — no position read from the app');
  assert.deepEqual(
    [r.data.chapter_id, r.data.manuscript_id, r.data.title, r.data.content, r.data.word_count, r.data.position, r.data.version],
    [ch3, await manuscriptOf(db, projectId('tide')), 'Scene 3', null, 0, 2, 1]);
  assert.deepEqual((await inChapter(db, ch3)).map((s) => s.id), [pageId('t3a'), pageId('t3b'), r.data.id]);

  // An empty Chapter starts at 0.
  const empty = await scenes.createScene(chapterId('hollow.ch5'), 'Scene 1');
  assert.equal(empty.error, 'Chapter not found', 'another writer\'s Chapter');
  signIn(db, ALICE);
  const first = await scenes.createScene(chapterId('hollow.ch5'), 'Scene 1');
  assert.equal(first.error, null, first.error);
  assert.equal(first.data.position, 0);

  assert.equal(await storedTotal(db, projectId('tide')), 1320, 'an empty Scene does not change the ordered total');
  await assertAllPositionsValid(db);
});

test('insert_scene_checked ignores the caller\'s p_position: a stale client\'s precomputed position still appends', async () => {
  const db = await seededDb();
  const bram = as(db, BRAM);
  const ch3 = chapterId('tide.ch3');
  const tie = await insert(bram, ch3, { position: 0 }); // would have tied with t3a
  const gap = await insert(bram, ch3, { position: 99 }); // would have left a gap
  const none = await insert(bram, ch3, { position: null });
  for (const r of [tie, gap, none]) assert.equal(r.data?.status, 'ok', JSON.stringify(r));
  assert.deepEqual(await inChapter(db, ch3), [
    { id: pageId('t3a'), position: 0 }, { id: pageId('t3b'), position: 1 },
    { id: tie.data.id, position: 2 }, { id: gap.data.id, position: 3 }, { id: none.data.id, position: 4 },
  ]);
  assert.deepEqual(Object.keys(tie.data).sort(), ['id', 'status'], 'result shape unchanged');
});

// ── concurrency ───────────────────────────────────────────────────────────────

test('simultaneous creations in one Chapter never tie: each gets its own position', async () => {
  const db = await seededDb();
  signIn(db, BRAM);
  const ch3 = chapterId('tide.ch3');
  const results = await Promise.all([
    scenes.createScene(ch3, 'a'),
    scenes.createScene(ch3, 'b'),
    games.appendSprintToProject(projectId('tide'), ch3, 3, '<p>ember loam sable</p>'),
    scenes.createScene(ch3, 'c'),
    scenes.createScene(ch3, 'd'),
  ]);
  for (const r of results) assert.equal(r.error, null, r.error);

  const rows = await inChapter(db, ch3);
  assert.deepEqual(rows.map((r) => r.position), [0, 1, 2, 3, 4, 5, 6], 'distinct, contiguous positions');
  assert.deepEqual(new Set(rows.slice(2).map((r) => r.id)), new Set(results.map((r) => r.data.id)));
  assert.equal(await storedTotal(db, projectId('tide')), 1320 + 3);
  await assertAllPositionsValid(db);
});

test('creation racing move_scene into the same Chapter never ties', async () => {
  const db = await seededDb();
  signIn(db, BRAM);
  const ch2 = chapterId('tide.ch2'); // [t2a]
  const results = await Promise.all([
    scenes.createScene(ch2, 'a'),
    scenes.moveSceneToChapter(pageId('t1a'), ch2), // Unplaced → Chapter
    scenes.createScene(ch2, 'b'),
    scenes.moveSceneToChapter(pageId('t3a'), ch2), // Chapter → Chapter
    games.appendSprintToProject(projectId('tide'), ch2, 2, '<p>moth ink</p>'),
    scenes.moveSceneToChapter(pageId('t1c'), ch2),
    scenes.createScene(ch2, 'c'),
  ]);
  for (const r of results) assert.equal(r.error, null, r.error);

  const rows = await inChapter(db, ch2);
  assert.deepEqual(rows.map((r) => r.position), [0, 1, 2, 3, 4, 5, 6, 7], 'distinct, contiguous positions');
  assert.deepEqual(new Set(rows.map((r) => r.id)),
    new Set([pageId('t2a'), ...results.map((r) => r.data.id)]));
  assert.deepEqual(await inChapter(db, chapterId('tide.ch3')), [{ id: pageId('t3b'), position: 1 }], 't3a left ch3');
  assert.equal(await storedTotal(db, projectId('tide')), 1320 + 700 + 720 + 2, 'the moved-in Unplaced Scenes and the sprint join the ordered total');
  await assertAllPositionsValid(db);
});

test('simultaneous creations carrying words cannot jointly exceed the free limit', async () => {
  const db = await seededDb();
  const ch3 = chapterId('tide.ch3');
  // bram: 2740 of 15,000. Each fits alone; together they do not.
  const [a, b] = await Promise.all([insert(as(db, BRAM), ch3, { words: 7000 }), insert(as(db, BRAM), ch3, { words: 7000 })]);
  assert.deepEqual([a.data.status, b.data.status].sort(), ['ok', 'word_limit_blocked']);
  assert.deepEqual([a, b].find((r) => r.data.status === 'word_limit_blocked').data, { status: 'word_limit_blocked', limit: 15000 });
  assert.equal(await accountTotal(db, BRAM), 2740 + 7000);
  assert.equal((await inChapter(db, ch3)).length, 3, 'exactly one new Scene');
  await assertAllPositionsValid(db);
});

test('insert_scene_checked holds the per-account advisory lock (the one move_scene takes) for its whole transaction', async () => {
  const db = await seededDb();
  const advisory = (tx) => tx.query(`select count(*)::int as n from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()`);
  await asUser(db, BRAM, async (tx) => {
    assert.equal((await advisory(tx)).rows[0].n, 0);
    await tx.query(`select public.insert_scene_checked($1, 'x', null, 0, 0)`, [chapterId('tide.ch3')]);
    assert.equal((await advisory(tx)).rows[0].n, 1, 'still held until commit');
    // Same key as move_scene: re-taking it is a no-op for this backend.
    await tx.query(`select public.move_scene($1, $2)`, [pageId('t1a'), chapterId('tide.ch3')]);
    assert.equal((await advisory(tx)).rows[0].n, 1);
  });
});

// ── refusals and failures ─────────────────────────────────────────────────────

test('free limit: an over-limit writer\'s creation with words is refused and inserts nothing; an empty Scene is never blocked', async () => {
  const db = await seededDb();
  signIn(db, ALICE); // 3035 of 2000
  const ch5 = chapterId('hollow.ch5');
  const before = await snapshot(db);
  assert.deepEqual((await insert(as(db, ALICE), ch5, { words: 5 })).data, { status: 'word_limit_blocked', limit: 2000 });
  assert.match((await games.appendSprintToProject(projectId('hollow'), ch5, 5, '<p>a b c d e</p>')).error, /2,000-word free limit/);
  assert.deepEqual(await snapshot(db), before, 'nothing inserted');

  const r = await scenes.createScene(ch5, 'Scene 1');
  assert.equal(r.error, null, r.error);
  assert.equal(await accountTotal(db, ALICE), 3035);
});

test('cross-writer and cross-Manuscript creation is refused, and nothing changes anywhere', async () => {
  const db = await seededDb();
  const sb = signIn(db, BRAM);
  const before = await snapshot(db);

  // Another writer's Chapter, and a Chapter that does not exist: invisible.
  assert.deepEqual(await scenes.createScene(chapterId('hollow.ch1'), 'x'), { data: null, error: 'Chapter not found' });
  assert.deepEqual((await insert(sb, chapterId('hollow.ch1'))).data, { status: 'error', error: 'Chapter not found' });
  assert.deepEqual((await insert(sb, '00000000-0000-4000-8000-000000000000')).data, { status: 'error', error: 'Chapter not found' });
  // Arena: a Chapter of the writer's OTHER project is refused for this project.
  signIn(db, ALICE);
  assert.deepEqual(await games.appendSprintToProject(projectId('hollow'), chapterId('ash.ch1'), 0, '<p></p>'),
    { data: null, error: 'Chapter not found in this project' });
  // Straight to the table: refused outright (019: no client INSERT on scenes).
  const mismatched = await as(db, ALICE).from('scenes').insert({
    manuscript_id: await manuscriptOf(db, projectId('hollow')), chapter_id: chapterId('ash.ch1'), title: 'x', position: 99,
  });
  assert.equal(mismatched.error?.code, '42501', 'no direct Scene insert');
  // Signed out: the action refuses, and anon cannot call the function.
  signIn(db, null);
  assert.deepEqual(await scenes.createScene(chapterId('tide.ch3'), 'x'), { data: null, error: 'Not authenticated' });
  assert.ok((await insert(as(db, null), chapterId('tide.ch3'))).error);

  assert.deepEqual(await snapshot(db), before);
});

test('a creation that fails after its insert rolls back completely: no Scene, no position taken', async () => {
  const db = await seededDb();
  signIn(db, BRAM);
  const ch3 = chapterId('tide.ch3');
  await db.exec(`
    create function public.test_fail_insert() returns trigger language plpgsql as $$
    begin raise exception 'simulated failure'; end $$;
    create trigger test_fail_insert after insert on public.scenes
      for each row execute function public.test_fail_insert();`);
  const before = await snapshot(db);

  const r = await scenes.createScene(ch3, 'x');
  assert.equal(r.data, null);
  assert.match(r.error, /simulated failure/);
  assert.match((await games.appendSprintToProject(projectId('tide'), ch3, 2, '<p>moth ink</p>')).error, /simulated failure/);
  assert.deepEqual(await snapshot(db), before);

  // Once the failure is gone, the next creation takes the position the failed ones never kept.
  await db.exec(`drop trigger test_fail_insert on public.scenes;`);
  assert.equal((await scenes.createScene(ch3, 'y')).data.position, 2);
});
