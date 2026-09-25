// Atomic Scene movement (Rune 2.0 Phase 1, Task 6): the REAL moveSceneTo*
// server actions and the move_scene RPC (migration 017) against the Rune 2.0
// schema in real Postgres + RLS.
//
// Data: the synthetic legacy fixture moved into the Rune 2.0 schema
// (lib/legacy-to-rune2.mjs). alice/hollow: ch1 [h1a 120], ch3 [h3a 410],
// ch4 [h4a 200, h4b 0, h4c 150], ch5 [], Unplaced [h3b 380, h3c 95, h6a 250,
// h6b 260]; ordered total 1450. alice/ash is her other project.
// bram/tide: ch1 [t1b 650], ch2 [t2a 0], ch3 [t3a 330, t3b 340],
// Unplaced [t1a 700, t1c 720]; ordered total 1320.
//
// PGlite is one connection, so it cannot show two backends blocking on a lock.
// What it can show: each move is ONE database call (one transaction), so
// simultaneous action calls cannot interleave between "read the last
// position" and "write it" — they did when the action made several calls —
// and the function holds the per-account advisory lock while it works.
import 'fake-indexeddb/auto'; // offline/db.ts and the sync engine
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createTestDb, readRepoFile, asUser, HARNESS_DIR, LEGACY_BASELINE, RUNE2_SCHEMA } from '../lib/pg.mjs';
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
const ids = async (db, where, params) =>
  (await all(db, `select id from public.scenes where ${where} order by position, id`, params)).map((r) => r.id);
const manuscriptOf = async (db, pid) => (await one(db, `select id from public.manuscripts where project_id = $1`, [pid])).id;

/** Every Scene, Chapter timestamp and project total — to prove a refused/failed move changed nothing. */
const snapshot = async (db) => ({
  scenes: await all(db, `select id, manuscript_id, chapter_id, position, word_count, content, version, updated_at::text
    from public.scenes order by id`),
  chapters: await all(db, `select id, updated_at::text from public.chapters order by id`),
  projects: await all(db, `select id, word_count, updated_at::text from public.projects order by id`),
  sessions: await all(db, `select * from public.writing_sessions order by id`),
});

/** Every Chapter and every Unplaced list: positions are distinct non-negative integers. */
async function assertAllPositionsValid(db) {
  const bad = await all(db, `
    select coalesce(chapter_id::text, 'unplaced:' || manuscript_id) as list, position, count(*)::int as n
      from public.scenes group by 1, 2 having count(*) > 1 or position < 0`);
  assert.deepEqual(bad, [], 'no tied or negative positions in any list');
}

const BROWSER = path.join(HARNESS_DIR, 'mocks/supabaseBrowser.js');
let legacy;
let scenes, engine, offline;
before(async () => {
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
  scenes = await bundleForTest('src/lib/actions/scenes.ts', { name: 'move_scenes' });
  engine = await bundleForTest('src/lib/offline/syncEngine.ts', { name: 'move_syncEngine', aliases: { '@/lib/supabase/client': BROWSER } });
  offline = await bundleForTest('src/lib/offline/db.ts', { name: 'move_offline_db' });
});

beforeEach(async () => {
  const idb = await offline.getOfflineDB();
  for (const store of ['pending_writes', 'page_cache', 'chapter_meta', 'pending_writing_credits']) await idb.clear(store);
});

async function seededDb() {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  await prototypeLegacyToRune2(legacy, db);
  // The prototype mapping keeps each alternate's old in-Chapter position, so an
  // Unplaced list can start with ties (hollow: h3b and h6b both at 1). Number
  // each Unplaced list 0..n-1 (in its current order) so "every list is valid"
  // is a meaningful invariant here.
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
  for (const mod of [scenes, engine]) mod.setServerClient(sb);
  return sb;
}

/** Runs a move and checks the invariants every move must keep. */
async function move(db, sb, sceneId, target) {
  const before = await one(db, `select * from public.scenes where id = $1`, [sceneId]);
  const history = await all(db, `select * from public.writing_sessions where scene_id = $1 order by id`, [sceneId]);
  sb.calls.length = 0;
  const r = target === null ? await scenes.moveSceneToUnplaced(sceneId) : await scenes.moveSceneToChapter(sceneId, target);
  assert.equal(r.error, null, r.error);
  assert.equal(r.data.id, sceneId, 'same Scene ID');
  assert.deepEqual(sb.calls.filter((c) => c.kind === 'rpc').map((c) => c.name), ['move_scene'], 'one atomic call');

  const after = await one(db, `select * from public.scenes where id = $1`, [sceneId]);
  assert.deepEqual(
    { ...after, chapter_id: null, position: null, version: null, updated_at: null },
    { ...before, chapter_id: null, position: null, version: null, updated_at: null },
    'same row: Manuscript, title, prose, word count and created_at unchanged');
  assert.equal(after.chapter_id, target);
  assert.equal(after.version, before.version + 1, 'the move bumps the version, as before');
  assert.deepEqual(await all(db, `select * from public.writing_sessions where scene_id = $1 order by id`, [sceneId]), history,
    'writing history untouched');
  await assertAllPositionsValid(db);
  return after;
}

// ── the three directions ──────────────────────────────────────────────────────

test('Chapter → Chapter: appended to the destination, gone from the source; ordered total unchanged', async () => {
  const db = await seededDb();
  const sb = signIn(db, ALICE);
  const after = await move(db, sb, pageId('h4a'), chapterId('hollow.ch1'));
  assert.equal(after.position, 1, 'after h1a (position 0)');
  assert.deepEqual(await ids(db, 'chapter_id = $1', [chapterId('hollow.ch1')]), [pageId('h1a'), pageId('h4a')]);
  assert.deepEqual(await ids(db, 'chapter_id = $1', [chapterId('hollow.ch4')]), [pageId('h4b'), pageId('h4c')]);
  assert.equal(await storedTotal(db, projectId('hollow')), 1450);
});

test('Chapter → Unplaced: end of the Unplaced list; its words leave the ordered total', async () => {
  const db = await seededDb();
  const sb = signIn(db, ALICE);
  const ms = await manuscriptOf(db, projectId('hollow'));
  const unplacedBefore = await ids(db, 'manuscript_id = $1 and chapter_id is null', [ms]);
  await move(db, sb, pageId('h4a'), null);
  assert.deepEqual(await ids(db, 'manuscript_id = $1 and chapter_id is null', [ms]), [...unplacedBefore, pageId('h4a')]);
  assert.deepEqual(await ids(db, 'chapter_id = $1', [chapterId('hollow.ch4')]), [pageId('h4b'), pageId('h4c')]);
  assert.equal(await storedTotal(db, projectId('hollow')), 1450 - 200);
});

test('Unplaced → Chapter: into an empty Chapter at 0, then appended; its words join the ordered total', async () => {
  const db = await seededDb();
  const sb = signIn(db, ALICE);
  const ch5 = chapterId('hollow.ch5');
  assert.equal((await move(db, sb, pageId('h3b'), ch5)).position, 0);
  assert.equal((await move(db, sb, pageId('h6a'), ch5)).position, 1);
  assert.deepEqual(await ids(db, 'chapter_id = $1', [ch5]), [pageId('h3b'), pageId('h6a')]);
  assert.equal(await storedTotal(db, projectId('hollow')), 1450 + 380 + 250);
});

test('moving a Scene to where it already is writes nothing', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const before = await snapshot(db);
  assert.equal((await scenes.moveSceneToChapter(pageId('h4a'), chapterId('hollow.ch4'))).error, null);
  assert.equal((await scenes.moveSceneToUnplaced(pageId('h3b'))).error, null);
  assert.deepEqual(await snapshot(db), before);
});

// ── refusals and failures ─────────────────────────────────────────────────────

test('cross-Manuscript and foreign moves are refused, and nothing changes anywhere', async () => {
  const db = await seededDb();
  const sb = signIn(db, ALICE);
  const before = await snapshot(db);

  // Her own other project's Chapter.
  assert.deepEqual(await scenes.moveSceneToChapter(pageId('h4a'), chapterId('ash.ch2')),
    { data: null, error: 'A Scene can only move within its own manuscript' });
  assert.deepEqual(await scenes.moveSceneToChapter(pageId('h3b'), chapterId('ash.ch1')),
    { data: null, error: 'A Scene can only move within its own manuscript' }, 'from Unplaced too');
  // Another writer's Chapter, another writer's Scene, a Scene that does not exist.
  assert.deepEqual(await scenes.moveSceneToChapter(pageId('h4a'), chapterId('tide.ch3')), { data: null, error: 'Chapter not found' });
  assert.deepEqual(await scenes.moveSceneToChapter(pageId('t3a'), chapterId('hollow.ch1')), { data: null, error: 'Scene not found' });
  assert.deepEqual(await scenes.moveSceneToUnplaced(pageId('t3a')), { data: null, error: 'Scene not found' });
  assert.deepEqual(await scenes.moveSceneToUnplaced('00000000-0000-4000-8000-000000000000'), { data: null, error: 'Scene not found' });
  // The RPC itself, directly: same refusal.
  assert.deepEqual((await sb.rpc('move_scene', { p_scene_id: pageId('h4a'), p_chapter_id: chapterId('ash.ch2') })).data,
    { status: 'error', error: 'A Scene can only move within its own manuscript' });
  // Signed out: the action refuses, and anon cannot call the function.
  signIn(db, null);
  assert.deepEqual(await scenes.moveSceneToUnplaced(pageId('h4a')), { data: null, error: 'Not authenticated' });
  assert.ok((await as(db, null).rpc('move_scene', { p_scene_id: pageId('h4a'), p_chapter_id: null })).error);

  assert.deepEqual(await snapshot(db), before);
});

test('a move that fails part-way rolls back completely: the Scene, both lists and the totals are unchanged', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  // Make a write AFTER the Scene row update fail: the Project row update its
  // triggers make (updated_at on every move; the ordered total when placed
  // words change, migration 020).
  await db.exec(`
    create function public.test_fail_total() returns trigger language plpgsql as $$
    begin raise exception 'simulated failure'; end $$;
    create trigger test_fail_total before update on public.projects
      for each row execute function public.test_fail_total();`);
  const before = await snapshot(db);

  for (const [sceneId, target] of [
    [pageId('h4a'), chapterId('hollow.ch1')], // Chapter → Chapter
    [pageId('h4a'), null], // Chapter → Unplaced
    [pageId('h3b'), chapterId('hollow.ch5')], // Unplaced → Chapter
  ]) {
    const r = target === null ? await scenes.moveSceneToUnplaced(sceneId) : await scenes.moveSceneToChapter(sceneId, target);
    assert.equal(r.data, null);
    assert.match(r.error, /simulated failure/);
    assert.deepEqual(await snapshot(db), before, `${sceneId} → ${target}`);
  }
});

// ── concurrency ───────────────────────────────────────────────────────────────

test('simultaneous moves into the same Chapter never tie: each gets its own position', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const ch5 = chapterId('hollow.ch5');
  const movers = ['h3b', 'h3c', 'h6a', 'h6b', 'h4a', 'h1a'].map(pageId); // four Unplaced, two placed
  const results = await Promise.all(movers.map((id) => scenes.moveSceneToChapter(id, ch5)));
  for (const r of results) assert.equal(r.error, null, r.error);

  const rows = await all(db, `select id, position from public.scenes where chapter_id = $1 order by position`, [ch5]);
  assert.deepEqual(rows.map((r) => r.position), [0, 1, 2, 3, 4, 5], 'distinct, contiguous positions');
  assert.deepEqual(new Set(rows.map((r) => r.id)), new Set(movers));
  assert.equal(await storedTotal(db, projectId('hollow')), 1450 + 380 + 95 + 250 + 260, 'placed → placed moves do not change it');
  await assertAllPositionsValid(db);
});

test('simultaneous moves into Unplaced, alongside Unplaced creation, never tie', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const ms = await manuscriptOf(db, projectId('hollow'));
  const results = await Promise.all([
    scenes.moveSceneToUnplaced(pageId('h4a')),
    scenes.createUnplacedScene(projectId('hollow'), 'New'),
    scenes.moveSceneToUnplaced(pageId('h4c')),
    scenes.moveSceneToUnplaced(pageId('h1a')),
  ]);
  for (const r of results) assert.equal(r.error, null, r.error);
  const positions = (await all(db, `select position from public.scenes where manuscript_id = $1 and chapter_id is null`, [ms]))
    .map((r) => r.position);
  assert.equal(positions.length, 8);
  await assertAllPositionsValid(db);
  assert.equal(await storedTotal(db, projectId('hollow')), 1450 - 200 - 150 - 120);
});

test('the same Scene moved to two places at once ends in exactly one, with valid positions', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const [a, b] = await Promise.all([
    scenes.moveSceneToChapter(pageId('h3b'), chapterId('hollow.ch1')),
    scenes.moveSceneToChapter(pageId('h3b'), chapterId('hollow.ch5')),
  ]);
  assert.equal(a.error, null);
  assert.equal(b.error, null);
  const row = await one(db, `select chapter_id from public.scenes where id = $1`, [pageId('h3b')]);
  assert.equal(row.chapter_id, chapterId('hollow.ch5'), 'the later move wins');
  assert.deepEqual(await ids(db, 'chapter_id = $1', [chapterId('hollow.ch1')]), [pageId('h1a')]);
  assert.equal((await one(db, `select count(*)::int as n from public.scenes where id = $1`, [pageId('h3b')])).n, 1);
  await assertAllPositionsValid(db);
  assert.equal(await storedTotal(db, projectId('hollow')), 1450 + 380);
});

test('move_scene holds the per-account advisory lock (the one the Scene insert/save RPCs take) for its whole transaction', async () => {
  const db = await seededDb();
  const advisory = (tx) => tx.query(`select count(*)::int as n from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()`);
  await asUser(db, ALICE, async (tx) => {
    assert.equal((await advisory(tx)).rows[0].n, 0);
    await tx.query(`select public.move_scene($1, $2)`, [pageId('h3b'), chapterId('hollow.ch5')]);
    assert.equal((await advisory(tx)).rows[0].n, 1, 'still held until commit');
    // Same key as insert_unplaced_scene_checked / save_scene_checked: re-taking it is a no-op for this backend.
    await tx.query(`select public.lock_account_word_budget()`);
    assert.equal((await advisory(tx)).rows[0].n, 1);
  });
});

// ── offline queue ─────────────────────────────────────────────────────────────

test('REAL sync engine: prose queued offline lands on the moved Scene after Unplaced → Chapter and Chapter → Unplaced', async () => {
  const db = await seededDb();
  signIn(db, BRAM);

  // Offline edits to an Unplaced Scene and a placed one, queued by Scene ID.
  await engine.writeToPendingQueue(pageId('t1a'), BRAM, syntheticDoc('offline-a', 705), 705);
  await engine.writeToPendingQueue(pageId('t3a'), BRAM, syntheticDoc('offline-b', 333), 333);

  // Both move before the queue flushes (each bumps the version).
  const placed = (await scenes.moveSceneToChapter(pageId('t1a'), chapterId('tide.ch2'))).data;
  const unplaced = (await scenes.moveSceneToUnplaced(pageId('t3a'))).data;
  await offline.cacheScene(placed, projectId('tide'));
  await offline.cacheScene(unplaced, projectId('tide'));
  assert.equal(await storedTotal(db, projectId('tide')), 1320 + 700 - 330);

  await engine.flushPendingQueue();
  assert.equal(await offline.getPendingWrite(pageId('t1a')), null, 'queue cleared');
  assert.equal(await offline.getPendingWrite(pageId('t3a')), null, 'queue cleared');
  assert.deepEqual(await one(db, `select chapter_id, position, word_count from public.scenes where id = $1`, [pageId('t1a')]),
    { chapter_id: chapterId('tide.ch2'), position: 1, word_count: 705 });
  assert.deepEqual(await one(db, `select chapter_id, word_count from public.scenes where id = $1`, [pageId('t3a')]),
    { chapter_id: null, word_count: 333 });
  assert.equal(await storedTotal(db, projectId('tide')), 1320 + 705 - 330, 'the placed Scene\'s new words count; the Unplaced one\'s do not');
  assert.equal((await one(db, `select count(*)::int as n from public.scenes where id = any($1)`, [[pageId('t1a'), pageId('t3a')]])).n, 2,
    'no copies were made');
});
