// Unplaced Scenes (Rune 2.0 Phase 1, Task 4): the REAL application code that
// moves Scenes between a Chapter and the Manuscript's Unplaced Scenes, and
// what every other system does with an Unplaced Scene — autosave, the offline
// queue and view cache, writing history, the ordered total, the free-limit
// total and export — against the Rune 2.0 schema in real Postgres + RLS.
//
// Data: the synthetic legacy fixture moved into the Rune 2.0 schema with the
// approved mapping (lib/legacy-to-rune2.mjs): the former canonical siblings
// are already Unplaced (h3b, h3c, h6a, h6b, a1a for alice; t1a, t1c for bram).
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
const sessionsOf = (db, id) => all(db, `select id, words_added, session_date::text from public.writing_sessions where scene_id = $1 order by id`, [id]);
// account_word_total() as the writer — the free-limit figure save_scene_checked enforces.
const accountTotal = async (db, userId) => (await as(db, userId).rpc('account_word_total')).data;

const BROWSER = path.join(HARNESS_DIR, 'mocks/supabaseBrowser.js');
let legacy;
let scenes, chapters, writingStats, exporter, engine, offline;
before(async () => {
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
  scenes = await bundleForTest('src/lib/actions/scenes.ts', { name: 'unplaced_scenes' });
  chapters = await bundleForTest('src/lib/actions/chapters.ts', { name: 'unplaced_chapters' });
  writingStats = await bundleForTest('src/lib/actions/writingStats.ts', { name: 'unplaced_writingStats' });
  exporter = await bundleForTest('src/lib/export/projectExport.ts', {
    name: 'unplaced_projectExport', aliases: { jspdf: path.join(HARNESS_DIR, 'mocks/jspdf.js') },
  });
  engine = await bundleForTest('src/lib/offline/syncEngine.ts', { name: 'unplaced_syncEngine', aliases: { '@/lib/supabase/client': BROWSER } });
  offline = await bundleForTest('src/lib/offline/db.ts', { name: 'unplaced_offline_db' });
});

// One fake IndexedDB per process: start every test with empty offline stores.
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
  for (const mod of [scenes, chapters, writingStats, engine]) mod.setServerClient(sb);
  return sb;
}

async function exportedIds(db, userId, pid) {
  const { chapters: chs, scenesPerChapter } = await exporter.loadManuscriptForExport(as(db, userId), pid);
  return chs.flatMap((c) => (scenesPerChapter[c.id] ?? []).map((s) => s.id));
}

// ── moving ────────────────────────────────────────────────────────────────────

test('Chapter → Unplaced: same row, same ID and prose; appended to the Unplaced list; leaves the Chapter, the ordered total and export', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const before = await sceneRow(db, pageId('h4a')); // hollow.ch4, 200 words
  const lastUnplaced = (await scenes.getUnplacedScenes(projectId('hollow'))).data.at(-1);
  const exportBefore = await exportedIds(db, ALICE, projectId('hollow'));
  assert.ok(exportBefore.includes(pageId('h4a')));

  const r = await scenes.moveSceneToUnplaced(pageId('h4a'));
  assert.equal(r.error, null, r.error);
  assert.equal(r.data.id, pageId('h4a'));
  assert.equal(r.data.chapter_id, null);

  const after = await sceneRow(db, pageId('h4a'));
  assert.deepEqual(
    { ...after, position: undefined, version: undefined },
    { ...before, chapter_id: null, position: undefined, version: undefined },
    'identity, Manuscript, prose, word count and created_at are unchanged — only the placement moved');
  assert.equal(after.position, lastUnplaced.position + 1, 'appended after the existing Unplaced Scenes');

  const unplaced = (await scenes.getUnplacedScenes(projectId('hollow'))).data.map((s) => s.id);
  assert.equal(unplaced.at(-1), pageId('h4a'));
  assert.ok(!(await scenes.getScenes(chapterId('hollow.ch4'))).data.some((s) => s.id === pageId('h4a')));
  assert.equal(await storedTotal(db, projectId('hollow')), 1450 - 200, 'the ordered total was recalculated without it');
  assert.deepEqual(await exportedIds(db, ALICE, projectId('hollow')), exportBefore.filter((id) => id !== pageId('h4a')));
});

test('Unplaced → Chapter: appended at the end of the Chapter with a valid position; joins the ordered total and export in order', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const before = await sceneRow(db, pageId('h3b')); // Unplaced, 380 words
  const r = await scenes.moveSceneToChapter(pageId('h3b'), chapterId('hollow.ch4'));
  assert.equal(r.error, null, r.error);
  assert.equal(r.data.id, pageId('h3b'));

  const placed = (await scenes.getScenes(chapterId('hollow.ch4'))).data;
  assert.deepEqual(placed.map((s) => s.id), [pageId('h4a'), pageId('h4b'), pageId('h4c'), pageId('h3b')]);
  assert.equal(placed.at(-1).position, 3, 'max existing position (2) + 1');
  assert.deepEqual({ ...(await sceneRow(db, pageId('h3b'))), position: 0, version: 0 },
    { ...before, chapter_id: chapterId('hollow.ch4'), position: 0, version: 0 });

  assert.equal(await storedTotal(db, projectId('hollow')), 1450 + 380);
  const exported = await exportedIds(db, ALICE, projectId('hollow'));
  const ch4 = exported.slice(exported.indexOf(pageId('h4a')), exported.indexOf(pageId('h4a')) + 4);
  assert.deepEqual(ch4, [pageId('h4a'), pageId('h4b'), pageId('h4c'), pageId('h3b')]);

  // Into an empty Chapter: position 0.
  const r2 = await scenes.moveSceneToChapter(pageId('h3c'), chapterId('hollow.ch5'));
  assert.equal(r2.data.position, 0);
});

test('a round trip Chapter → Unplaced → Chapter preserves the Scene ID, prose and writing history (no copies, no remapping)', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const id = pageId('h3a'); // hollow.ch3, 410 words, two writing-session rows
  const before = await sceneRow(db, id);
  const history = await sessionsOf(db, id);
  assert.equal(history.length, 2);
  const count = async () => (await one(db, `select count(*)::int as n from public.scenes`)).n;
  const n = await count();

  // hollow.ch3's only placed Scene is h3a; the server allows emptying a Chapter (the UI does not offer it).
  assert.equal((await scenes.moveSceneToUnplaced(id)).error, null);
  assert.equal((await scenes.moveSceneToChapter(id, chapterId('hollow.ch3'))).error, null);

  const after = await sceneRow(db, id);
  assert.equal(after.id, before.id);
  assert.equal(after.chapter_id, before.chapter_id);
  assert.deepEqual(after.content, before.content);
  assert.equal(after.word_count, before.word_count);
  assert.equal(after.created_at, before.created_at);
  assert.deepEqual(await sessionsOf(db, id), history, 'writing history stays on the same Scene ID');
  assert.equal(await count(), n, 'no Scene was created or deleted');
  assert.equal(await storedTotal(db, projectId('hollow')), 1450);
});

test('moves are idempotent: Unplaced → Unplaced and Chapter → same Chapter change nothing', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const u = await sceneRow(db, pageId('h3b'));
  assert.equal((await scenes.moveSceneToUnplaced(pageId('h3b'))).error, null);
  assert.deepEqual(await sceneRow(db, pageId('h3b')), u);
  const p = await sceneRow(db, pageId('h1a'));
  assert.equal((await scenes.moveSceneToChapter(pageId('h1a'), chapterId('hollow.ch1'))).error, null);
  assert.deepEqual(await sceneRow(db, pageId('h1a')), p);
});

test('cross-Manuscript moves are refused: the writer\'s own other project, another writer\'s Chapter or Scene — nothing changes', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const snapshot = () => all(db, `select id, manuscript_id, chapter_id, position from public.scenes order by id`);
  const before = await snapshot();

  assert.deepEqual(await scenes.moveSceneToChapter(pageId('h3b'), chapterId('ash.ch1')),
    { data: null, error: 'A Scene can only move within its own manuscript' }, 'alice\'s own other project');
  assert.deepEqual(await scenes.moveSceneToChapter(pageId('h3b'), chapterId('tide.ch1')),
    { data: null, error: 'Chapter not found' }, 'bram\'s Chapter is invisible to alice');
  assert.deepEqual(await scenes.moveSceneToChapter(pageId('t1c'), chapterId('hollow.ch1')),
    { data: null, error: 'Scene not found' }, 'bram\'s Scene is invisible to alice');
  assert.deepEqual(await scenes.moveSceneToUnplaced(pageId('t3a')), { data: null, error: 'Scene not found' });

  // Bypassing the app's check, the database still refuses (composite foreign key / RLS).
  const direct = await as(db, ALICE).from('scenes').update({ chapter_id: chapterId('ash.ch1') }).eq('id', pageId('h3b'));
  assert.ok(direct.error, 'placing into a Chapter of another Manuscript fails in the database');
  const hijack = await as(db, BRAM).from('scenes').update({ chapter_id: null }).eq('id', pageId('h1a')).select('id');
  assert.deepEqual(hijack.data ?? [], [], 'another writer cannot unplace alice\'s Scene');

  signIn(db, null);
  assert.deepEqual(await scenes.moveSceneToUnplaced(pageId('h1a')), { data: null, error: 'Not authenticated' });
  assert.deepEqual(await snapshot(), before);
});

// ── counting ──────────────────────────────────────────────────────────────────

test('the ordered total excludes Unplaced Scenes; the account total (a metric since 037) includes them, so moving never changes it', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  assert.equal(await accountTotal(db, ALICE), 3035);

  await scenes.moveSceneToUnplaced(pageId('h1a')); // 120 placed words
  assert.equal(await storedTotal(db, projectId('hollow')), 1450 - 120);
  const { data: chs } = await chapters.getChapters(projectId('hollow'));
  assert.equal(chs.flatMap((c) => c.scenes).reduce((s, x) => s + x.word_count, 0), 1450 - 120, 'placed Scenes only');
  assert.equal(await accountTotal(db, ALICE), 3035, 'unplacing does not lower the account total');

  await scenes.moveSceneToChapter(pageId('a1a'), chapterId('ash.ch2')); // 500 Unplaced words
  assert.equal(await storedTotal(db, projectId('ash')), 100 + 500);
  assert.equal(await accountTotal(db, ALICE), 3035, 'placing does not raise it');
});

test('no free limit (037): a writer past the old allowance grows and shrinks an Unplaced Scene freely', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const moved = (await scenes.moveSceneToUnplaced(pageId('h4a'))).data;
  const grow = await scenes.syncSceneWithLimitCheck(pageId('h4a'), syntheticDoc('grow', 210), 210, moved.version);
  assert.equal(grow.status, 'ok', JSON.stringify(grow));
  const shrink = await scenes.syncSceneWithLimitCheck(pageId('h4a'), syntheticDoc('shrink', 150), 150, grow.version);
  assert.equal(shrink.status, 'ok');
  assert.deepEqual(await one(db, `select chapter_id, word_count from public.scenes where id = $1`, [pageId('h4a')]),
    { chapter_id: null, word_count: 150 }, 'still Unplaced');
});

// ── editing and saving ────────────────────────────────────────────────────────

test('an Unplaced Scene is editable: the autosave action saves it, it stays Unplaced, and the ordered total is untouched', async () => {
  const db = await seededDb();
  signIn(db, BRAM);
  const moved = (await scenes.moveSceneToUnplaced(pageId('t3b'))).data; // tide.ch3, 340 words
  assert.equal(await storedTotal(db, projectId('tide')), 1320 - 340);

  const saved = await scenes.syncSceneWithLimitCheck(pageId('t3b'), syntheticDoc('edit', 360), 360, moved.version);
  assert.equal(saved.status, 'ok', JSON.stringify(saved));
  assert.equal(saved.version, moved.version + 1);
  await scenes.afterSceneSync(pageId('t3b'));
  assert.deepEqual(await one(db, `select chapter_id, word_count from public.scenes where id = $1`, [pageId('t3b')]),
    { chapter_id: null, word_count: 360 });
  assert.equal(await storedTotal(db, projectId('tide')), 1320 - 340, 'Unplaced words never enter the ordered total');

  // The move bumped the version: a save still holding the pre-move version gets
  // version_mismatch (the sync engine retries it), never a silent overwrite.
  assert.deepEqual(await scenes.syncSceneWithLimitCheck(pageId('t3b'), syntheticDoc('stale', 1), 1, moved.version - 1),
    { status: 'version_mismatch' });

  assert.equal((await scenes.renameScene(pageId('t3b'), 'Loose ends')).data.title, 'Loose ends');
});

test('REAL sync engine: an edit queued offline while the Scene is placed lands on the same ID after it moved to Unplaced — no false conflict', async () => {
  const db = await seededDb();
  signIn(db, BRAM);
  const placed = (await scenes.getScenes(chapterId('tide.ch3'))).data;
  await offline.cacheScene(placed.find((s) => s.id === pageId('t3b')), projectId('tide'));

  // Offline: the writer keeps typing; the save is queued by Scene ID.
  await engine.writeToPendingQueue(pageId('t3b'), BRAM, syntheticDoc('offline', 352), 352);
  // The Scene is moved to Unplaced (this tab after reconnecting, or another device).
  const moved = (await scenes.moveSceneToUnplaced(pageId('t3b'))).data;
  await offline.cacheScene(moved, projectId('tide')); // what EditorShell does after a move

  // The offline view cache files it under Unplaced, keeping the queued prose.
  assert.deepEqual((await offline.getCachedUnplacedScenes(projectId('tide'))).map((s) => [s.id, s.chapter_id]), [[pageId('t3b'), null]]);
  assert.ok(!(await offline.getCachedScenesForChapter(chapterId('tide.ch3'))).some((s) => s.id === pageId('t3b')));
  assert.equal((await offline.getPendingWrite(pageId('t3b'))).wordCount, 352);

  // Reconnect: the queue replays. The placement change bumped version/updated_at
  // but not word_count, so it is not mistaken for another device's edit.
  await engine.flushPendingQueue();
  assert.equal(await offline.getPendingWrite(pageId('t3b')), null, 'queue cleared');
  assert.deepEqual(await one(db, `select chapter_id, word_count from public.scenes where id = $1`, [pageId('t3b')]),
    { chapter_id: null, word_count: 352 });
  assert.equal(await storedTotal(db, projectId('tide')), 1320 - 340, 'afterSceneSync kept the ordered total placed-only');
});

test('REAL sync engine: an edit queued offline to an Unplaced Scene syncs, and still lands after the Scene is placed into a Chapter', async () => {
  const db = await seededDb();
  signIn(db, BRAM);
  const unplaced = (await scenes.getUnplacedScenes(projectId('tide'))).data;
  assert.deepEqual(unplaced.map((s) => s.id).sort(), [pageId('t1a'), pageId('t1c')].sort());
  for (const s of unplaced) await offline.cacheScene(s, projectId('tide'));

  await engine.writeToPendingQueue(pageId('t1c'), BRAM, syntheticDoc('draft', 725), 725);
  await engine.syncPendingWrite(pageId('t1c'), 'offline_sync');
  assert.equal(await offline.getPendingWrite(pageId('t1c')), null);
  assert.equal((await one(db, `select word_count from public.scenes where id = $1`, [pageId('t1c')])).word_count, 725);

  await engine.writeToPendingQueue(pageId('t1c'), BRAM, syntheticDoc('draft', 730), 730);
  await scenes.moveSceneToChapter(pageId('t1c'), chapterId('tide.ch2'));
  await engine.syncPendingWrite(pageId('t1c'), 'offline_sync');
  assert.equal(await offline.getPendingWrite(pageId('t1c')), null);
  assert.deepEqual(await one(db, `select chapter_id, word_count from public.scenes where id = $1`, [pageId('t1c')]),
    { chapter_id: chapterId('tide.ch2'), word_count: 730 });
  assert.equal(await storedTotal(db, projectId('tide')), 1320 + 730, 'once placed, its words are in the ordered total');
});

test('offline view cache: stale placements are forgotten without touching content, baselines or pending writes', async () => {
  const db = await seededDb();
  signIn(db, BRAM);
  for (const s of (await scenes.getScenes(chapterId('tide.ch3'))).data) await offline.cacheScene(s, projectId('tide'));
  await engine.writeToPendingQueue(pageId('t3b'), BRAM, syntheticDoc('pending', 341), 341);
  const idb = await offline.getOfflineDB();
  const cachedBefore = await idb.get('page_cache', pageId('t3b'));

  // Moved on another device: this device's next online load of tide.ch3 lists only t3a.
  await scenes.moveSceneToUnplaced(pageId('t3b'));
  const fresh = (await scenes.getScenes(chapterId('tide.ch3'))).data.map((s) => s.id);
  await offline.forgetStalePlacements(projectId('tide'), chapterId('tide.ch3'), fresh);

  assert.deepEqual((await offline.getCachedScenesForChapter(chapterId('tide.ch3'))).map((s) => s.id), [pageId('t3a')]);
  assert.deepEqual(await offline.getCachedUnplacedScenes(projectId('tide')), [], 'not guessed into Unplaced either');
  const cachedAfter = await idb.get('page_cache', pageId('t3b'));
  assert.equal(cachedAfter.chapter_id, undefined);
  assert.deepEqual({ ...cachedAfter, chapter_id: undefined }, { ...cachedBefore, chapter_id: undefined },
    'content, serverWordCount/serverVersion baselines and metadata are untouched');
  assert.equal((await offline.getPendingWrite(pageId('t3b'))).wordCount, 341, 'the queued write is untouched');

  // Loading the Unplaced view re-files it.
  for (const s of (await scenes.getUnplacedScenes(projectId('tide'))).data) await offline.cacheScene(s, projectId('tide'));
  assert.ok((await offline.getCachedUnplacedScenes(projectId('tide'))).some((s) => s.id === pageId('t3b')));
  // Unplaced lists are per Project.
  assert.deepEqual(await offline.getCachedUnplacedScenes(projectId('hollow')), []);
});

test('offline view cache: the Unplaced view finds its Project through any cached Chapter', async () => {
  const db = await seededDb();
  signIn(db, BRAM);
  assert.equal(await offline.getCachedProject(projectId('tide')), null);
  const chapter = await one(db, `select * from public.chapters where id = $1`, [chapterId('tide.ch3')]);
  const project = await one(db, `select id, title from public.projects where id = $1`, [projectId('tide')]);
  await offline.cacheChapterMeta({ ...chapter, created_at: String(chapter.created_at), updated_at: String(chapter.updated_at) }, project);
  assert.deepEqual(await offline.getCachedProject(projectId('tide')), project);
  assert.equal(await offline.getCachedProject(projectId('hollow')), null);
});

// ── writing history ───────────────────────────────────────────────────────────

test('writing sessions attach to an Unplaced Scene by its ID (online and offline credits), and stay with it when it is placed', async () => {
  const db = await seededDb();
  signIn(db, BRAM);
  await scenes.moveSceneToUnplaced(pageId('t3a'));

  await writingStats.recordWordsWritten(projectId('tide'), 9, pageId('t3a'), '2026-09-20');
  await writingStats.recordWordsWritten(projectId('tide'), 4, pageId('t3a'), '2026-09-20');
  await offline.storeOfflineWritingCredit(projectId('tide'), pageId('t3a'), 6);
  await engine.flushOfflineWritingCredits();

  const rows = await all(db, `select scene_id, project_id, words_added, session_date::text as d from public.writing_sessions
    where user_id = $1 and session_date > '2026-09-01' order by session_date`, [BRAM]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { scene_id: pageId('t3a'), project_id: projectId('tide'), words_added: 13, d: '2026-09-20' });
  assert.equal(rows[1].scene_id, pageId('t3a'));
  assert.equal(rows[1].words_added, 6);

  const history = await sessionsOf(db, pageId('t3a'));
  await scenes.moveSceneToChapter(pageId('t3a'), chapterId('tide.ch3'));
  assert.deepEqual(await sessionsOf(db, pageId('t3a')), history);
});
