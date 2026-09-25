// Scene structure (Rune 2.0 Phase 1, Task 5): the REAL application code that
// creates Scenes (in a Chapter and directly in Unplaced), reorders them within
// a Chapter and moves them between Chapters — and what the ordered total,
// export, the free limit and the offline queue do with the result — against
// the Rune 2.0 schema (including migration 016) in real Postgres + RLS.
//
// Data: the synthetic legacy fixture moved into the Rune 2.0 schema
// (lib/legacy-to-rune2.mjs). hollow.ch4 holds three placed Scenes
// (h4a 200, h4b 0, h4c 150 words); hollow.ch3 holds one (h3a); hollow.ch5 none.
import 'fake-indexeddb/auto'; // offline/db.ts and the sync engine
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createTestDb, readRepoFile, HARNESS_DIR, LEGACY_BASELINE, RUNE2_SCHEMA } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';
import { prototypeLegacyToRune2 } from '../lib/legacy-to-rune2.mjs';
import { USERS, chapterId, pageId, projectId, seedFixture, syntheticDoc } from '../fixtures/manuscript-fixture.mjs';

const ALICE = USERS.alice.id; // starter_2k, every-Scene total 3035 (over the 2000 limit)
const BRAM = USERS.bram.id; // legacy_15k, every-Scene total 2740

const as = (db, userId) => createSupabaseAdapter(db, userId ? { userId } : {});
const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const all = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const storedTotal = async (db, pid) => (await one(db, `select word_count from public.projects where id = $1`, [pid])).word_count;
const sceneRow = (db, id) => one(db, `select id, manuscript_id, chapter_id, position, word_count, content, version, created_at::text
  from public.scenes where id = $1`, [id]);
const placement = async (db, cid) =>
  (await all(db, `select id, position from public.scenes where chapter_id = $1 order by position, id`, [cid]));
const manuscriptOf = async (db, pid) => (await one(db, `select id from public.manuscripts where project_id = $1`, [pid])).id;
const accountTotal = async (db, userId) => (await as(db, userId).rpc('account_word_total')).data;

/** Positions in a Chapter or the Unplaced list are distinct integers (no ties). */
async function assertNoTies(db, where, params) {
  const rows = await all(db, `select position from public.scenes where ${where}`, params);
  assert.equal(new Set(rows.map((r) => r.position)).size, rows.length, `no tied positions (${where})`);
}

const BROWSER = path.join(HARNESS_DIR, 'mocks/supabaseBrowser.js');
let legacy;
let scenes, chapters, exporter, engine, offline;
before(async () => {
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
  scenes = await bundleForTest('src/lib/actions/scenes.ts', { name: 'structure_scenes' });
  chapters = await bundleForTest('src/lib/actions/chapters.ts', { name: 'structure_chapters' });
  exporter = await bundleForTest('src/lib/export/projectExport.ts', {
    name: 'structure_projectExport', aliases: { jspdf: path.join(HARNESS_DIR, 'mocks/jspdf.js') },
  });
  engine = await bundleForTest('src/lib/offline/syncEngine.ts', { name: 'structure_syncEngine', aliases: { '@/lib/supabase/client': BROWSER } });
  offline = await bundleForTest('src/lib/offline/db.ts', { name: 'structure_offline_db' });
});

beforeEach(async () => {
  const idb = await offline.getOfflineDB();
  for (const store of ['pending_writes', 'page_cache', 'chapter_meta', 'pending_writing_credits']) await idb.clear(store);
});

async function seededDb() {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  await prototypeLegacyToRune2(legacy, db);
  return db;
}

function signIn(db, userId) {
  const sb = as(db, userId);
  globalThis.__runeBrowserClient = sb;
  for (const mod of [scenes, chapters, engine]) mod.setServerClient(sb);
  return sb;
}

async function exportedIds(db, userId, pid) {
  const { chapters: chs, scenesPerChapter } = await exporter.loadManuscriptForExport(as(db, userId), pid);
  return chs.map((c) => [c.id, (scenesPerChapter[c.id] ?? []).map((s) => s.id)]);
}

// ── Chapter → Chapter ─────────────────────────────────────────────────────────

test('placed Scene → another Chapter: same row, ID, prose and history; appended; totals and export follow', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const id = pageId('h4a'); // hollow.ch4, 200 words
  const before = await sceneRow(db, id);
  const history = await all(db, `select * from public.writing_sessions where scene_id = $1 order by id`, [id]);

  const r = await scenes.moveSceneToChapter(id, chapterId('hollow.ch1'));
  assert.equal(r.error, null, r.error);
  assert.equal(r.data.id, id);

  const after = await sceneRow(db, id);
  assert.deepEqual({ ...after, position: 0, version: 0 }, { ...before, chapter_id: chapterId('hollow.ch1'), position: 0, version: 0 },
    'identity, Manuscript, prose, word count and created_at unchanged');
  assert.deepEqual((await placement(db, chapterId('hollow.ch1'))).map((s) => s.id), [pageId('h1a'), id], 'appended to the target');
  assert.deepEqual((await placement(db, chapterId('hollow.ch4'))).map((s) => s.id), [pageId('h4b'), pageId('h4c')], 'gone from the source');
  assert.deepEqual(await all(db, `select * from public.writing_sessions where scene_id = $1 order by id`, [id]), history);

  assert.equal(await storedTotal(db, projectId('hollow')), 1450, 'a placed → placed move leaves the ordered total unchanged');
  const { data: chs } = await chapters.getChapters(projectId('hollow'));
  const words = (cid) => chs.find((c) => c.id === cid).scenes.reduce((s, x) => s + x.word_count, 0);
  assert.equal(words(chapterId('hollow.ch1')), 120 + 200, 'destination Chapter total');
  assert.equal(words(chapterId('hollow.ch4')), 150, 'source Chapter total');

  const exported = Object.fromEntries(await exportedIds(db, ALICE, projectId('hollow')));
  assert.deepEqual(exported[chapterId('hollow.ch1')], [pageId('h1a'), id]);
  assert.ok(!exported[chapterId('hollow.ch4')].includes(id));
  await assertNoTies(db, 'chapter_id = $1', [chapterId('hollow.ch1')]);
});

test('cross-Manuscript: a placed Scene cannot move to a Chapter of another project or another writer, and nothing changes', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const before = await sceneRow(db, pageId('h4a'));
  assert.deepEqual(await scenes.moveSceneToChapter(pageId('h4a'), chapterId('ash.ch2')),
    { data: null, error: 'A Scene can only move within its own manuscript' });
  assert.deepEqual(await scenes.moveSceneToChapter(pageId('h4a'), chapterId('tide.ch3')),
    { data: null, error: 'Chapter not found' });
  assert.deepEqual(await sceneRow(db, pageId('h4a')), before);
});

// ── emptying a Chapter ────────────────────────────────────────────────────────

test('the only Scene in a Chapter can move to Unplaced; the empty Chapter stays, counts 0, exports empty, and takes new Scenes', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const r = await scenes.moveSceneToUnplaced(pageId('h3a')); // hollow.ch3's only placed Scene
  assert.equal(r.error, null, r.error);
  assert.equal(r.data.chapter_id, null);

  const chapter = await one(db, `select id from public.chapters where id = $1`, [chapterId('hollow.ch3')]);
  assert.ok(chapter, 'the Chapter is not deleted');
  assert.deepEqual((await scenes.getScenes(chapterId('hollow.ch3'))).data, []);
  const { data: chs } = await chapters.getChapters(projectId('hollow'));
  assert.deepEqual(chs.find((c) => c.id === chapterId('hollow.ch3')).scenes, []);
  assert.equal(await storedTotal(db, projectId('hollow')), 1450 - 410);
  const exported = await exportedIds(db, ALICE, projectId('hollow'));
  assert.deepEqual(exported.find(([cid]) => cid === chapterId('hollow.ch3')), [chapterId('hollow.ch3'), []],
    'still in the manuscript structure, with no Scenes');

  // Another Scene can move out of a Chapter with several; and the empty one takes new ones.
  const created = await scenes.createScene(chapterId('hollow.ch3'), 'Scene 1');
  assert.equal(created.error, null, created.error);
  assert.equal(created.data.position, 0);
  const back = await scenes.moveSceneToChapter(pageId('h3a'), chapterId('hollow.ch3'));
  assert.equal(back.data.position, 1);
});

// ── creation ──────────────────────────────────────────────────────────────────

test('additional Scenes in a Chapter append in order through insert_scene_checked', async () => {
  const db = await seededDb();
  const sb = signIn(db, BRAM);
  sb.calls.length = 0;
  const a = await scenes.createScene(chapterId('tide.ch3'), 'Scene 3');
  const b = await scenes.createScene(chapterId('tide.ch3'), 'Scene 4');
  assert.equal(a.error, null, a.error);
  assert.deepEqual([a.data.position, b.data.position], [2, 3]);
  assert.deepEqual([a.data.chapter_id, a.data.word_count, a.data.content], [chapterId('tide.ch3'), 0, null]);
  assert.equal(a.data.manuscript_id, await manuscriptOf(db, projectId('tide')));
  assert.ok(sb.calls.some((c) => c.kind === 'rpc' && c.name === 'insert_scene_checked'), 'the free-limit-checked RPC');
  assert.deepEqual((await placement(db, chapterId('tide.ch3'))).map((s) => s.id),
    [pageId('t3a'), pageId('t3b'), a.data.id, b.data.id]);
  assert.equal(await storedTotal(db, projectId('tide')), 1320, 'empty Scenes do not change the ordered total');

  assert.deepEqual(await scenes.createScene(chapterId('hollow.ch1'), 'x'), { data: null, error: 'Chapter not found' },
    'another writer\'s Chapter is invisible');
});

test('direct Unplaced creation: appended to the Project\'s Unplaced Scenes via the checked RPC; outside the ordered total and export', async () => {
  const db = await seededDb();
  const sb = signIn(db, BRAM);
  const exportBefore = await exportedIds(db, BRAM, projectId('tide'));
  const lastUnplaced = (await scenes.getUnplacedScenes(projectId('tide'))).data.at(-1);
  sb.calls.length = 0;

  const r = await scenes.createUnplacedScene(projectId('tide'), '  Loose thread ');
  assert.equal(r.error, null, r.error);
  assert.deepEqual([r.data.chapter_id, r.data.title, r.data.word_count, r.data.content], [null, 'Loose thread', 0, null]);
  assert.equal(r.data.manuscript_id, await manuscriptOf(db, projectId('tide')));
  assert.equal(r.data.position, lastUnplaced.position + 1, 'end of the Unplaced list');
  assert.ok(sb.calls.some((c) => c.kind === 'rpc' && c.name === 'insert_unplaced_scene_checked'));
  assert.equal((await scenes.getUnplacedScenes(projectId('tide'))).data.at(-1).id, r.data.id);
  await assertNoTies(db, 'manuscript_id = $1 and chapter_id is null', [r.data.manuscript_id]);

  // Written in, it counts toward the account total but not the ordered total or export.
  const saved = await scenes.syncSceneWithLimitCheck(r.data.id, syntheticDoc('loose', 40), 40, r.data.version);
  assert.equal(saved.status, 'ok');
  await scenes.afterSceneSync(r.data.id);
  assert.equal(await storedTotal(db, projectId('tide')), 1320);
  assert.equal(await accountTotal(db, BRAM), 2740 + 40);
  assert.deepEqual(await exportedIds(db, BRAM, projectId('tide')), exportBefore);

  // …and moves into a Chapter like any Unplaced Scene.
  const placed = await scenes.moveSceneToChapter(r.data.id, chapterId('tide.ch2'));
  assert.equal(placed.data.position, 1);
  assert.equal(await storedTotal(db, projectId('tide')), 1320 + 40);

  // Another writer's Project / Manuscript is refused.
  assert.deepEqual(await scenes.createUnplacedScene(projectId('hollow'), 'x'), { data: null, error: 'Project not found' });
  const foreign = await sb.rpc('insert_unplaced_scene_checked',
    { p_manuscript_id: await manuscriptOf(db, projectId('hollow')), p_title: 'x', p_content: null, p_word_count: 0 });
  assert.deepEqual(foreign.data, { status: 'error', error: 'Manuscript not found' });
  signIn(db, null);
  assert.deepEqual(await scenes.createUnplacedScene(projectId('tide'), 'x'), { data: null, error: 'Not authenticated' });
  assert.ok((await as(db, null).rpc('insert_unplaced_scene_checked',
    { p_manuscript_id: r.data.manuscript_id, p_title: 'x', p_content: null, p_word_count: 0 })).error, 'anon cannot call it');
});

test('free limit on direct Unplaced creation: enforced server-side, same as placed creation; an over-limit writer can create empty but not grow', async () => {
  const db = await seededDb();
  signIn(db, ALICE); // 3035 of 2000
  const hollowMs = await manuscriptOf(db, projectId('hollow'));
  const rpc = (sb, words) => sb.rpc('insert_unplaced_scene_checked',
    { p_manuscript_id: hollowMs, p_title: 'x', p_content: words ? syntheticDoc('x', words) : null, p_word_count: words });
  const count = async () => (await one(db, `select count(*)::int as n from public.scenes where manuscript_id = $1`, [hollowMs])).n;
  const n = await count();

  // Creation carrying words is checked exactly like insert_scene_checked.
  assert.deepEqual((await rpc(as(db, ALICE), 5)).data, { status: 'word_limit_blocked', limit: 2000 });
  assert.deepEqual((await as(db, ALICE).rpc('insert_scene_checked',
    { p_chapter_id: chapterId('hollow.ch5'), p_title: 'x', p_content: syntheticDoc('x', 5), p_word_count: 5, p_position: 0 })).data,
  { status: 'word_limit_blocked', limit: 2000 }, 'the placed path, for comparison');
  assert.equal(await count(), n, 'nothing inserted');

  // The app creates empty Scenes; growing one is blocked by save_scene_checked.
  const r = await scenes.createUnplacedScene(projectId('hollow'), 'Scene 5');
  assert.equal(r.error, null, r.error);
  assert.deepEqual(await scenes.syncSceneWithLimitCheck(r.data.id, syntheticDoc('grow', 3), 3, r.data.version),
    { status: 'word_limit_blocked' });
  assert.equal(await accountTotal(db, ALICE), 3035);

  // Under the limit (bram, legacy 15k) a Scene with words can be created directly.
  const bramOk = await as(db, BRAM).rpc('insert_unplaced_scene_checked',
    { p_manuscript_id: await manuscriptOf(db, projectId('tide')), p_title: 'x', p_content: syntheticDoc('x', 5), p_word_count: 5 });
  assert.equal(bramOk.data.status, 'ok');
});

// ── reordering ────────────────────────────────────────────────────────────────

test('reorder: exact new order, positions 0..n-1 with no ties, same IDs and prose; only moved rows are written', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const ch4 = chapterId('hollow.ch4');
  const snapshot = async () => Object.fromEntries((await all(db,
    `select id, content, word_count, version, chapter_id from public.scenes where chapter_id = $1`, [ch4])).map((r) => [r.id, r]));
  const before = await snapshot();

  const order = [pageId('h4c'), pageId('h4a'), pageId('h4b')];
  assert.deepEqual(await scenes.reorderScenes(ch4, order), { error: null });
  assert.deepEqual(await placement(db, ch4), order.map((id, position) => ({ id, position })));

  const after = await snapshot();
  for (const id of order) {
    assert.deepEqual(after[id].content, before[id].content);
    assert.equal(after[id].word_count, before[id].word_count);
    assert.equal(after[id].chapter_id, ch4);
  }
  // h4b was at position 1 before (h4a 0, h4b 1, h4c 2) → now 2; h4a 0 → 1; h4c 2 → 0. All moved:
  assert.ok(order.every((id) => after[id].version === before[id].version + 1));
  // Re-applying the same order writes nothing.
  assert.deepEqual(await scenes.reorderScenes(ch4, order), { error: null });
  assert.deepEqual(await snapshot(), after);

  assert.equal(await storedTotal(db, projectId('hollow')), 1450);
  const exported = Object.fromEntries(await exportedIds(db, ALICE, projectId('hollow')));
  assert.deepEqual(exported[ch4], order, 'export follows the new order');
});

test('reorder refuses a stale or invalid list (missing, extra, duplicate, foreign) without changing anything', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const ch4 = chapterId('hollow.ch4');
  const before = await all(db, `select id, chapter_id, position, version from public.scenes order by id`);
  const stale = { error: 'This chapter changed — reload to see its scenes', stale: true };

  assert.deepEqual(await scenes.reorderScenes(ch4, [pageId('h4a'), pageId('h4b')]), stale, 'a Scene missing');
  assert.deepEqual(await scenes.reorderScenes(ch4, [pageId('h4a'), pageId('h4b'), pageId('h4c'), pageId('h1a')]), stale, 'a Scene from another Chapter');
  assert.deepEqual(await scenes.reorderScenes(ch4, [pageId('h4a'), pageId('h4a'), pageId('h4c')]), stale, 'a duplicate');
  assert.deepEqual(await scenes.reorderScenes(ch4, [pageId('h4a'), pageId('h4b'), pageId('h3b')]), stale, 'an Unplaced Scene in place of one');
  assert.deepEqual(await scenes.reorderScenes(chapterId('hollow.ch5'), [pageId('h3b')]), stale, 'reordering never places a Scene');

  // The list made before a Scene moved out is stale afterwards.
  const listed = (await scenes.getScenes(ch4)).data.map((s) => s.id);
  await scenes.moveSceneToChapter(pageId('h4b'), chapterId('hollow.ch1'));
  assert.deepEqual(await scenes.reorderScenes(ch4, listed.reverse()), stale);
  await scenes.moveSceneToChapter(pageId('h4b'), ch4); // put it back (appended)

  assert.deepEqual(await scenes.reorderScenes(chapterId('tide.ch3'), [pageId('t3b'), pageId('t3a')]),
    { error: 'Chapter not found' }, 'another writer\'s Chapter');
  signIn(db, null);
  assert.deepEqual(await scenes.reorderScenes(ch4, listed), { error: 'Not authenticated' });

  const after = await all(db, `select id, chapter_id, position, version from public.scenes order by id`);
  const untouched = (rows) => rows.filter((r) => r.id !== pageId('h4b'));
  assert.deepEqual(untouched(after), untouched(before), 'no refused reorder changed a row');
});

test('an empty Chapter and a one-Scene Chapter reorder trivially', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  assert.deepEqual(await scenes.reorderScenes(chapterId('hollow.ch5'), []), { error: null });
  assert.deepEqual(await scenes.reorderScenes(chapterId('hollow.ch1'), [pageId('h1a')]), { error: null });
});

test('positions stay valid through a sequence of creates, moves and reorders', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const ch4 = chapterId('hollow.ch4');
  const ch1 = chapterId('hollow.ch1');
  const a = (await scenes.createScene(ch4, 'Scene 4')).data;
  await scenes.moveSceneToChapter(pageId('h3b'), ch4); // Unplaced → ch4
  await scenes.moveSceneToChapter(pageId('h4a'), ch1); // ch4 → ch1
  await scenes.moveSceneToUnplaced(pageId('h4c')); // ch4 → Unplaced
  const u = (await scenes.createUnplacedScene(projectId('hollow'), 'Scene 6')).data;

  const ids = (await scenes.getScenes(ch4)).data.map((s) => s.id);
  assert.deepEqual(ids, [pageId('h4b'), a.id, pageId('h3b')]);
  assert.deepEqual(await scenes.reorderScenes(ch4, [...ids].reverse()), { error: null });
  assert.deepEqual(await placement(db, ch4), [...ids].reverse().map((id, position) => ({ id, position })));

  const ms = await manuscriptOf(db, projectId('hollow'));
  for (const cid of [ch1, ch4, chapterId('hollow.ch3')]) await assertNoTies(db, 'chapter_id = $1', [cid]);
  await assertNoTies(db, 'manuscript_id = $1 and chapter_id is null', [ms]);
  assert.equal((await scenes.getUnplacedScenes(projectId('hollow'))).data.at(-1).id, u.id);
  assert.equal(await storedTotal(db, projectId('hollow')), 1450 + 380 - 150);
});

// ── offline queue ─────────────────────────────────────────────────────────────

test('REAL sync engine: an edit queued offline lands on the same Scene ID after a reorder and a Chapter → Chapter move', async () => {
  const db = await seededDb();
  signIn(db, BRAM);
  const ch3 = chapterId('tide.ch3');
  for (const s of (await scenes.getScenes(ch3)).data) await offline.cachePage(s, projectId('tide'));

  // Offline: the writer keeps typing in t3b; the save is queued by Scene ID.
  await engine.writeToPendingQueue(pageId('t3b'), BRAM, syntheticDoc('offline', 345), 345);

  // The Chapter is reordered (every moved row's version bumps)…
  assert.deepEqual(await scenes.reorderScenes(ch3, [pageId('t3b'), pageId('t3a')]), { error: null });
  // …then the Scene moves to another Chapter (another bump).
  const moved = (await scenes.moveSceneToChapter(pageId('t3b'), chapterId('tide.ch2'))).data;
  await offline.cachePage(moved, projectId('tide')); // what EditorShell does after a move
  assert.deepEqual((await offline.getCachedPagesForChapter(chapterId('tide.ch2'))).map((s) => s.id).includes(pageId('t3b')), true);
  assert.equal((await offline.getPendingWrite(pageId('t3b'))).wordCount, 345, 'the queued write is untouched');

  // Reconnect: the placement changes bumped version but not word_count, so the
  // replay is not mistaken for another device's edit.
  await engine.flushPendingQueue();
  assert.equal(await offline.getPendingWrite(pageId('t3b')), null, 'queue cleared');
  assert.deepEqual(await one(db, `select chapter_id, position, word_count from public.scenes where id = $1`, [pageId('t3b')]),
    { chapter_id: chapterId('tide.ch2'), position: 1, word_count: 345 });
  assert.equal(await storedTotal(db, projectId('tide')), 1320 + 5);
  assert.equal((await one(db, `select count(*)::int as n from public.scenes where id = $1`, [pageId('t3b')])).n, 1, 'no copy was made');
});

test('REAL sync engine: an edit queued offline to a directly-created Unplaced Scene syncs to it', async () => {
  const db = await seededDb();
  signIn(db, BRAM);
  const created = (await scenes.createUnplacedScene(projectId('tide'), 'Scene 3')).data;
  await offline.cachePage(created, projectId('tide'));
  assert.ok((await offline.getCachedUnplacedScenes(projectId('tide'))).some((s) => s.id === created.id));

  await engine.writeToPendingQueue(created.id, BRAM, syntheticDoc('fresh', 12), 12);
  await engine.flushPendingQueue();
  assert.equal(await offline.getPendingWrite(created.id), null);
  assert.deepEqual(await one(db, `select chapter_id, word_count from public.scenes where id = $1`, [created.id]),
    { chapter_id: null, word_count: 12 });
});
