// Writing activity (Today's Words, Writing Streak, Writing Activity) and the
// credit foundation under it — migration 057, the action, the offline replay
// and the pure rules (lib/rune2/writingActivity.ts).
//
//   * 057: credit_writing_words is atomic (one insert … on conflict do update
//     on the writer's row), idempotent (a receipt per credit id), the caller's
//     own Project and Scene only; a deleted Scene's credit lands at Project
//     level; anon and a signed-out caller get nothing
//   * recordWordsWritten sends a credit id through the RPC and never credits
//     the same id twice by a second route; without an id the old path stands
//   * the REAL sync engine replays queued credits one by one with their ids,
//     so a replay that runs twice lands once
//   * the activity read: today's words are the Project's, the window and the
//     streak are the writer's, by the device's local date
//   * pure rules: day arithmetic across DST and month ends, daily totals,
//     streak (today, yesterday, a missed day), the calendar's weeks and
//     months, the intensity scale from the writer's own habit
//   * the editor credits typed words only, through one path, with one id
import 'fake-indexeddb/auto';
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createTestDb, readRepoFile, HARNESS_DIR, REPO_DIR, LEGACY_BASELINE, RUNE2_SCHEMA } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';
import { prototypeLegacyToRune2 } from '../lib/legacy-to-rune2.mjs';
import { USERS, pageId, projectId, seedFixture } from '../fixtures/manuscript-fixture.mjs';

const ALICE = USERS.alice.id;
const BRAM = USERS.bram.id;
const HOLLOW = projectId('hollow');
const TIDE = projectId('tide');
const read = (f) => fs.readFileSync(path.join(REPO_DIR, f), 'utf8');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const as = (db, userId) => createSupabaseAdapter(db, userId ? { userId } : {});
const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const all = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const BROWSER = path.join(HARNESS_DIR, 'mocks/supabaseBrowser.js');

let legacy, writingStats, activity, engine, offline, rules, prefs, settings;
before(async () => {
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
  writingStats = await bundleForTest('src/lib/actions/writingStats.ts', { name: 'wa_writingStats' });
  activity = await bundleForTest('src/lib/actions/writingActivity.ts', { name: 'wa_activity' });
  engine = await bundleForTest('src/lib/offline/syncEngine.ts', { name: 'wa_syncEngine', aliases: { '@/lib/supabase/client': BROWSER } });
  offline = await bundleForTest('src/lib/offline/db.ts', { name: 'wa_offline_db' });
  rules = await bundleForTest('src/lib/rune2/writingActivity.ts', { name: 'wa_rules' });
  prefs = await bundleForTest('src/lib/rune2/preferences.ts', { name: 'wa_prefs' });
  settings = await bundleForTest('src/lib/actions/settings.ts', { name: 'wa_settings' });
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
  for (const mod of [writingStats, activity, engine, settings]) mod.setServerClient?.(sb);
  return sb;
}

const todayRows = (db, user, date) =>
  all(db, `select project_id, scene_id, words_added from public.writing_sessions where user_id = $1 and session_date = $2 order by words_added`, [user, date]);

// ── Migration 057 ───────────────────────────────────────────────────────────

test('057 is recorded and schema.sql carries it; the function pins its path, anon cannot call it', async () => {
  const db = await seededDb();
  assert.equal((await one(db, `select count(*)::int as n from public.schema_migrations where version = '057'`)).n, 1);
  const fn = await one(db, `select p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'credit_writing_words'`);
  assert.equal(fn.prosecdef, true);
  assert.ok(fn.proconfig.some((c) => c.startsWith('search_path=')));
  assert.equal((await one(db, `select has_function_privilege('anon', 'public.credit_writing_words(uuid, uuid, uuid, date, integer)', 'execute') as ok`)).ok, false);
  assert.equal((await one(db, `select has_function_privilege('authenticated', 'public.credit_writing_words(uuid, uuid, uuid, date, integer)', 'execute') as ok`)).ok, true);
  // The receipts table: owner reads, no client writes.
  const policies = await all(db, `select cmd from pg_policies where tablename = 'writing_credit_receipts'`);
  assert.deepEqual(policies.map((p) => p.cmd), ['SELECT']);
  // The migration refuses to run twice.
  await assert.rejects(db.exec(readRepoFile('src/lib/supabase/migrations/057_writing_credit.sql')), /already been applied/);
});

test('057: a credit is one atomic increment on the writer\'s row; the same credit id again is a no-op', async () => {
  const db = await seededDb();
  const sb = signIn(db, ALICE);
  const scene = pageId('h6c');
  const credit = (id, words) => sb.rpc('credit_writing_words', { p_credit_id: uuid(id), p_project_id: HOLLOW, p_scene_id: scene, p_session_date: '2026-10-12', p_words: words });
  assert.deepEqual(await credit(1, 40), { data: true, error: null });
  assert.deepEqual(await credit(2, 2), { data: true, error: null });
  assert.deepEqual(await credit(1, 40), { data: false, error: null }, 'a replay lands once');
  assert.deepEqual(await todayRows(db, ALICE, '2026-10-12'), [{ project_id: HOLLOW, scene_id: scene, words_added: 42 }]);
  // Two "tabs" (two clients of the same writer) interleaving: every increment lands.
  const other = as(db, ALICE);
  for (let i = 0; i < 10; i++) {
    await Promise.all([
      sb.rpc('credit_writing_words', { p_credit_id: uuid(100 + i), p_project_id: HOLLOW, p_scene_id: scene, p_session_date: '2026-10-12', p_words: 1 }),
      other.rpc('credit_writing_words', { p_credit_id: uuid(200 + i), p_project_id: HOLLOW, p_scene_id: scene, p_session_date: '2026-10-12', p_words: 1 }),
    ]);
  }
  assert.deepEqual(await todayRows(db, ALICE, '2026-10-12'), [{ project_id: HOLLOW, scene_id: scene, words_added: 62 }]);
  assert.equal((await one(db, `select count(*)::int as n from public.writing_credit_receipts where user_id = $1`, [ALICE])).n, 22);
});

test('057: the caller\'s own objects only — a deleted Scene lands at Project level, another writer\'s Project at account level; bad arguments are refused', async () => {
  const db = await seededDb();
  const sb = signIn(db, ALICE);
  const gone = uuid(999);
  assert.deepEqual(await sb.rpc('credit_writing_words', { p_credit_id: uuid(1), p_project_id: HOLLOW, p_scene_id: gone, p_session_date: '2026-10-12', p_words: 5 }), { data: true, error: null });
  assert.deepEqual(await todayRows(db, ALICE, '2026-10-12'), [{ project_id: HOLLOW, scene_id: null, words_added: 5 }]);
  // Bram's Project: never a row against it — the credit is Alice's, at account level.
  assert.deepEqual(await sb.rpc('credit_writing_words', { p_credit_id: uuid(2), p_project_id: TIDE, p_scene_id: null, p_session_date: '2026-10-12', p_words: 7 }), { data: true, error: null });
  assert.deepEqual(await todayRows(db, ALICE, '2026-10-12'), [{ project_id: HOLLOW, scene_id: null, words_added: 5 }, { project_id: null, scene_id: null, words_added: 7 }]);
  assert.equal((await one(db, `select count(*)::int as n from public.writing_sessions where project_id = $1 and user_id = $2`, [TIDE, ALICE])).n, 0);
  // Bram's Scene named under Alice's Project: the Scene is not of that Project, so Project level.
  assert.deepEqual(await sb.rpc('credit_writing_words', { p_credit_id: uuid(3), p_project_id: HOLLOW, p_scene_id: pageId('t3b'), p_session_date: '2026-10-12', p_words: 1 }), { data: true, error: null });
  assert.equal((await one(db, `select words_added from public.writing_sessions where user_id = $1 and project_id = $2 and scene_id is null and session_date = '2026-10-12'`, [ALICE, HOLLOW])).words_added, 6);
  for (const bad of [
    { p_credit_id: null, p_project_id: HOLLOW, p_scene_id: null, p_session_date: '2026-10-12', p_words: 1 },
    { p_credit_id: uuid(4), p_project_id: HOLLOW, p_scene_id: null, p_session_date: null, p_words: 1 },
    { p_credit_id: uuid(5), p_project_id: HOLLOW, p_scene_id: null, p_session_date: '2026-10-12', p_words: 0 },
  ]) {
    assert.equal((await sb.rpc('credit_writing_words', bad)).error?.code, '22023');
  }
  assert.equal((await as(db, null).rpc('credit_writing_words', { p_credit_id: uuid(6), p_project_id: HOLLOW, p_scene_id: null, p_session_date: '2026-10-12', p_words: 1 })).error?.code, '42501');
  assert.equal((await one(db, `select count(*)::int as n from public.writing_credit_receipts`)).n, 3, 'a refused credit leaves no receipt');
});

// ── The action and the replay ───────────────────────────────────────────────

test('recordWordsWritten with a credit id goes through the RPC once; the same id again adds nothing; without an id the previous path still works', async () => {
  const db = await seededDb();
  const sb = signIn(db, ALICE);
  const scene = pageId('h6c');
  await writingStats.recordWordsWritten(HOLLOW, 30, scene, '2026-10-12', uuid(1));
  await writingStats.recordWordsWritten(HOLLOW, 30, scene, '2026-10-12', uuid(1));
  assert.equal(await writingStats.getTodayWords(ALICE, '2026-10-12'), 30);
  assert.equal(sb.calls.filter((c) => c.kind === 'rpc' && c.name === 'credit_writing_words').length, 2);
  assert.ok(!sb.calls.some((c) => c.kind === 'rpc' && c.name === 'increment_writing_session'), 'the phantom RPC is never called');
  await writingStats.recordWordsWritten(HOLLOW, 5, scene, '2026-10-12');
  assert.equal(await writingStats.getTodayWords(ALICE, '2026-10-12'), 35, 'a client without ids (an older app) still credits');
});

test('REAL sync engine: queued credits replay one by one with their ids; replaying the same queue twice lands once', async () => {
  const db = await seededDb();
  signIn(db, BRAM);
  await offline.storeOfflineWritingCredit(TIDE, pageId('t3b'), 7, uuid(11));
  await offline.storeOfflineWritingCredit(TIDE, pageId('t3b'), 3, uuid(12));
  const idb = await offline.getOfflineDB();
  const queued = await idb.getAll('pending_writing_credits');
  assert.deepEqual(queued.map((c) => c.id).sort(), [uuid(11), uuid(12)]);
  assert.ok(queued.every((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.sessionDate)), 'each credit keeps the local day it was written on');
  await engine.flushOfflineWritingCredits();
  const today = queued[0].sessionDate;
  const rowsOnce = await todayRows(db, BRAM, today);
  assert.deepEqual(rowsOnce.map((r) => r.words_added), [10]);
  assert.deepEqual(await idb.getAll('pending_writing_credits'), []);
  // The "forget" never ran (another tab, a storage error): the same entries replay again — and add nothing.
  for (const c of queued) await idb.put('pending_writing_credits', c);
  await engine.flushOfflineWritingCredits();
  assert.deepEqual((await todayRows(db, BRAM, today)).map((r) => r.words_added), [10], 'a replay is a no-op');
  assert.deepEqual(await idb.getAll('pending_writing_credits'), []);
});

// ── The activity read ───────────────────────────────────────────────────────

test('readWritingActivity: today is the Project\'s, the window and the writing days are the writer\'s, by the given local date', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const credit = (n, project, scene, date, words) => writingStats.recordWordsWritten(project, words, scene, date, uuid(n));
  await credit(1, HOLLOW, pageId('h6c'), '2026-10-12', 300);
  await credit(2, HOLLOW, null, '2026-10-12', 42);
  await credit(3, projectId('ash'), null, '2026-10-12', 100); // another Project of Alice's: not today's, but a writing day
  await credit(4, HOLLOW, null, '2026-10-11', 50);
  await credit(5, HOLLOW, null, '2026-05-01', 9); // outside the sixteen-week window
  const r = await activity.readWritingActivity(HOLLOW, '2026-10-12');
  assert.equal(r.error, null);
  assert.equal(r.data.todayProject, 342);
  const totals = rules.dailyTotals(r.data.days, ['2026-10-11', '2026-10-12']);
  assert.deepEqual(totals, [{ date: '2026-10-11', words: 50 }, { date: '2026-10-12', words: 442 }]);
  assert.ok(!r.data.days.some((d) => d.date === '2026-05-01'), 'outside the window');
  assert.ok(r.data.writingDates.includes('2026-05-01') && r.data.writingDates.includes('2026-10-11'), 'every writing day, all time, for the streak');
  assert.ok(r.data.writingDates.every((d, i, a) => i === 0 || a[i - 1] < d), 'sorted, distinct');
  // Switching Projects: the same writer, another today.
  assert.equal((await activity.readWritingActivity(projectId('ash'), '2026-10-12')).data.todayProject, 100);
  // The device's day decides "today": a server on another calendar day changes nothing.
  assert.equal((await activity.readWritingActivity(HOLLOW, '2026-10-11')).data.todayProject, 50);
  assert.equal((await activity.readWritingActivity(HOLLOW, 'yesterday')).error, 'A local date is needed.');
  // Another writer sees none of it.
  signIn(db, BRAM);
  assert.equal((await activity.readWritingActivity(HOLLOW, '2026-10-12')).data.todayProject, 0);
});

// ── The rules ───────────────────────────────────────────────────────────────

test('day arithmetic is over date strings: month ends, leap days and DST changes never move a day', () => {
  assert.equal(rules.shiftDay('2026-03-01', -1), '2026-02-28');
  assert.equal(rules.shiftDay('2028-02-28', 1), '2028-02-29');
  assert.equal(rules.shiftDay('2026-12-31', 1), '2027-01-01');
  // Across the US and EU DST changes (2026-03-08, 2026-03-29, 2026-10-25, 2026-11-01).
  assert.deepEqual(rules.daysEnding('2026-03-09', 3), ['2026-03-07', '2026-03-08', '2026-03-09']);
  assert.deepEqual(rules.daysEnding('2026-11-02', 3), ['2026-10-31', '2026-11-01', '2026-11-02']);
  assert.equal(rules.weekdayOf('2026-10-12'), 0, 'a Monday');
  assert.equal(rules.weekdayOf('2026-10-18'), 6, 'a Sunday');
  assert.equal(rules.shortDate('2026-10-12'), 'Oct 12');
});

test('the streak: consecutive local days with words, to today or yesterday; a missed day starts again; best is the longest run', () => {
  assert.deepEqual(rules.writingStreak([], '2026-10-12'), { current: 0, best: 0 });
  assert.deepEqual(rules.writingStreak(['2026-10-12'], '2026-10-12'), { current: 1, best: 1 });
  assert.deepEqual(rules.writingStreak(['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-12'], '2026-10-12'), { current: 3, best: 3 });
  assert.deepEqual(rules.writingStreak(['2026-10-10', '2026-10-11'], '2026-10-12'), { current: 2, best: 2 }, 'nothing yet today: yesterday\'s run still stands');
  assert.deepEqual(rules.writingStreak(['2026-10-09', '2026-10-10'], '2026-10-12'), { current: 0, best: 2 }, 'a missed day');
  assert.deepEqual(rules.writingStreak(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-10-11', '2026-10-12'], '2026-10-12'), { current: 2, best: 4 });
  // Midnight: the same days read a day later are one longer when today was written on, or a day older.
  assert.deepEqual(rules.writingStreak(['2026-10-11', '2026-10-12'], '2026-10-13'), { current: 2, best: 2 });
  assert.deepEqual(rules.writingStreak(['2026-10-11', '2026-10-12'], '2026-10-14'), { current: 0, best: 2 });
});

test('dailyTotals groups the ledger by day over the window, zero where nothing was written', () => {
  const rows = [{ date: '2026-10-12', words: 300 }, { date: '2026-10-12', words: 42 }, { date: '2026-10-10', words: 5 }, { date: '2026-01-01', words: 99 }];
  assert.deepEqual(rules.dailyTotals(rows, rules.daysEnding('2026-10-12', 3)), [
    { date: '2026-10-10', words: 5 }, { date: '2026-10-11', words: 0 }, { date: '2026-10-12', words: 342 },
  ]);
});

test('the calendar: sixteen Monday-first weeks ending with today\'s week, cut after today, months named where they begin', () => {
  const today = '2026-10-14'; // a Wednesday
  const days = rules.dailyTotals([{ date: '2026-10-14', words: 400 }, { date: '2026-10-01', words: 100 }], rules.daysEnding(today, 112));
  const cal = rules.activityCalendar(days, today);
  assert.equal(cal.length, rules.ACTIVITY_WEEKS);
  assert.equal(rules.activityStart(today), '2026-06-29', 'a Monday, fifteen weeks before this week\'s');
  assert.equal(cal[0].cells[0].date, '2026-06-29');
  assert.equal(cal[15].cells.length, 3, 'Monday to Wednesday: nothing after today');
  assert.equal(cal[15].cells[2].date, today);
  assert.ok(cal.slice(0, 15).every((w) => w.cells.length === 7));
  assert.equal(cal[0].month, '2026-07', 'the first week names the month that begins in it (July), else its own');
  assert.equal(cal.find((w) => w.cells.some((c) => c.date === '2026-10-01')).month, '2026-10');
  assert.equal(cal[15].cells[2].words, 400);
  assert.equal(cal[15].cells[2].level, 4);
  assert.equal(cal[15].cells[0].level, 0);
});

test('intensity is read against the writer\'s own habit: the 90th percentile of their writing days, never below 250 words', () => {
  assert.equal(rules.activityScale([]), 250);
  assert.equal(rules.activityScale([{ date: 'a', words: 40 }, { date: 'b', words: 0 }]), 250, 'a sparse beginning keeps the floor');
  const busy = Array.from({ length: 20 }, (_, i) => ({ date: String(i), words: (i + 1) * 100 }));
  assert.equal(rules.activityScale(busy), 1900, 'the 90th percentile, so one freak day does not flatten the rest');
  assert.equal(rules.activityLevel(0, 1000), 0);
  assert.equal(rules.activityLevel(1, 1000), 1);
  assert.equal(rules.activityLevel(250, 1000), 1);
  assert.equal(rules.activityLevel(500, 1000), 2);
  assert.equal(rules.activityLevel(800, 1000), 3);
  assert.equal(rules.activityLevel(801, 1000), 4);
  assert.equal(rules.activityLevel(5000, 1000), 4);
});

// ── Source contracts ────────────────────────────────────────────────────────

test('the editor credits typed words only, through one path, with one id, logged for the board', () => {
  const editor = code(read('src/components/editor/useSceneEditor.ts'));
  assert.equal((editor.match(/const creditTypedWords = useCallback\(/g) || []).length, 1, 'one definition');
  assert.equal((editor.match(/creditTypedWords\(/g) || []).length, 3, 'three callers (save, scene switch, unmount)');
  assert.equal((editor.match(/recordWordsWritten\(/g) || []).length, 1, 'the server is reached from one place');
  assert.match(editor, /const id = crypto\.randomUUID\(\);[\s\S]*?recordWordsWritten\(projectId, words, sceneId, date, id\)/);
  assert.match(editor, /storeOfflineWritingCredit\(projectId, sceneId, words, id\)/);
  assert.match(editor, /logWritingCredit\(\{ id, projectId, date, words, pending: !online \}\)/);
  // The classification that makes "typed" mean typed is intact.
  assert.match(editor, /getMeta\("paste"\)/);
  assert.match(editor, /getMeta\("uiEvent"\) === "drop"/);
  assert.match(editor, /isHistoryTransaction\(transaction\)/);
  assert.match(editor, /if \(delta < 0\) \{[\s\S]*?Math\.max\(0, pendingEligibleWordsRef\.current \+ delta\)/, 'a deletion shrinks the pool, never earned credit');
  assert.match(editor, /Math\.min\(eligibleWords, rawDelta\)/, 'capped at the Scene\'s net growth');
  // The credit never waits on XP, and XP never decides it.
  const creditFn = editor.slice(editor.indexOf('const creditTypedWords'), editor.indexOf('const handleSave'));
  assert.doesNotMatch(creditFn, /xp|Xp|XP/);
});

test('the activity read and rules know nothing of XP, levels, unlockables, Arena or Pulse; imports never write', () => {
  for (const f of ['src/lib/rune2/writingActivity.ts', 'src/lib/actions/writingActivity.ts', 'src/components/editor/writingCreditLog.ts']) {
    const src = code(read(f));
    for (const word of ['xp', 'XP', 'Level', 'unlockable', 'Arena', 'game', 'pulse']) assert.doesNotMatch(src, new RegExp(`\\b${word}\\b`), `${f}: ${word}`);
  }
  const action = read('src/lib/actions/writingActivity.ts');
  assert.doesNotMatch(action, /\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/, 'read only');
  // Import, History restore and Canvas conversion write no credit (the database says so too).
  for (const [file, fn] of [['033_manuscript_import.sql', 'writing_sessions'], ['036_scene_history.sql', 'writing_sessions']]) {
    const m = fs.readdirSync(path.join(REPO_DIR, 'src/lib/supabase/migrations')).find((n) => n.startsWith(file.slice(0, 3)));
    assert.ok(m, file);
    const sql = read(`src/lib/supabase/migrations/${m}`);
    assert.doesNotMatch(code(sql).replace(/--.*$/gm, ''), new RegExp(`insert into public\\.${fn}`), `${m} writes no credit`);
  }
});

// ── The Daily Writing Goal ──────────────────────────────────────────────────
// Account-wide, per local day, the same credited words; stored with its
// history (lib/rune2/preferences.ts) so a past day is judged by the goal that
// applied then.

test('the daily goal history: well-formed entries only, one per day (the last stands), sorted; the goal on a day is the last entry on or before it', () => {
  assert.deepEqual(prefs.resolveDailyGoal(undefined), []);
  assert.deepEqual(prefs.resolveDailyGoal('500'), []);
  assert.deepEqual(prefs.resolveDailyGoal([{ from: '2026-10-01', target: 500 }, { from: 'Oct 2', target: 1 }, { from: '2026-10-05', target: 0 }, { from: '2026-10-03', target: null }, { from: '2026-10-01', target: 750 }, { from: '2026-10-04', target: 1.5 }]),
    [{ from: '2026-10-01', target: 750 }, { from: '2026-10-03', target: null }]);
  const h = [{ from: '2026-10-01', target: 500 }, { from: '2026-10-10', target: 1000 }, { from: '2026-10-20', target: null }, { from: '2026-10-25', target: 300 }];
  assert.equal(prefs.dailyGoalOn(h, '2026-09-30'), null, 'before the writer ever set one: no goal');
  assert.equal(prefs.dailyGoalOn(h, '2026-10-01'), 500);
  assert.equal(prefs.dailyGoalOn(h, '2026-10-09'), 500, 'the goal that applied then, not the one raised later');
  assert.equal(prefs.dailyGoalOn(h, '2026-10-10'), 1000, 'changing today\'s goal changes today');
  assert.equal(prefs.dailyGoalOn(h, '2026-10-22'), null, 'turned off: later days have no goal');
  assert.equal(prefs.dailyGoalOn(h, '2026-10-25'), 300);
  assert.equal(prefs.hasDailyGoalHistory([]), false);
  assert.equal(prefs.hasDailyGoalHistory([{ from: '2026-10-01', target: null }]), false);
  assert.equal(prefs.hasDailyGoalHistory(h), true);
  // Setting, changing and turning off, from today.
  let s = prefs.setDailyGoal([], '2026-10-12', 500);
  assert.deepEqual(s, [{ from: '2026-10-12', target: 500 }]);
  s = prefs.setDailyGoal(s, '2026-10-12', 750);
  assert.deepEqual(s, [{ from: '2026-10-12', target: 750 }], 'a second change the same day replaces that day\'s entry');
  s = prefs.setDailyGoal(s, '2026-10-14', null);
  assert.deepEqual(s, [{ from: '2026-10-12', target: 750 }, { from: '2026-10-14', target: null }]);
  assert.equal(prefs.dailyGoalOn(s, '2026-10-13'), 750, 'the day before it was turned off keeps its goal');
  // The history is bounded: the latest entries are kept.
  const many = Array.from({ length: 450 }, (_, i) => ({ from: `2025-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`, target: 100 + i }));
  assert.ok(prefs.resolveDailyGoal(many).length <= prefs.DAILY_GOAL_HISTORY_MAX);
});

test('a daily goal change is validated as a preference: the whole history, each entry a local day with a target in range or off', () => {
  assert.deepEqual(prefs.validatePreferenceChange({ dailyGoal: [{ from: '2026-10-12', target: 500 }] }), { patch: { rune2DailyGoal: [{ from: '2026-10-12', target: 500 }] }, error: null });
  assert.deepEqual(prefs.validatePreferenceChange({ dailyGoal: [] }), { patch: { rune2DailyGoal: [] }, error: null }, 'never set is a valid history');
  assert.deepEqual(prefs.validatePreferenceChange({ dailyGoal: [{ from: '2026-10-12', target: null }] }).patch, { rune2DailyGoal: [{ from: '2026-10-12', target: null }] }, 'off');
  for (const bad of [{ dailyGoal: 500 }, { dailyGoal: { from: '2026-10-12', target: 500 } }, { dailyGoal: [{ from: '2026-10-12', target: 0 }] }, { dailyGoal: [{ from: '2026-10-12', target: 100001 }] }, { dailyGoal: [{ from: '12/10/2026', target: 500 }] }, { dailyGoal: [{ from: '2026-10-12', target: '500' }] }, { dailyGoal: [{ from: '2026-10-12', target: 2.5 }] }]) {
    assert.equal(prefs.validatePreferenceChange(bad).patch, null, JSON.stringify(bad));
  }
  assert.deepEqual(prefs.readRunePreferences({ rune2DailyGoal: [{ from: '2026-10-12', target: 500 }] }).dailyGoal, [{ from: '2026-10-12', target: 500 }]);
  assert.deepEqual(prefs.readRunePreferences(null).dailyGoal, []);
  assert.deepEqual(prefs.DAILY_GOAL_PRESETS, [250, 500, 750, 1000]);
});

test('server: creating, changing and turning off the daily goal lands on the account (profiles.preferences) and reads back; nothing else of the profile changes', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const before = (await one(db, `select preferences from public.profiles where id = $1`, [ALICE])).preferences;
  let r = await settings.updateRunePreferences({ dailyGoal: [{ from: '2026-10-12', target: 500 }] });
  assert.equal(r.error, null);
  assert.deepEqual(r.data.dailyGoal, [{ from: '2026-10-12', target: 500 }]);
  r = await settings.updateRunePreferences({ dailyGoal: [{ from: '2026-10-12', target: 500 }, { from: '2026-10-15', target: 1000 }] });
  assert.deepEqual(r.data.dailyGoal, [{ from: '2026-10-12', target: 500 }, { from: '2026-10-15', target: 1000 }]);
  r = await settings.updateRunePreferences({ dailyGoal: [{ from: '2026-10-12', target: 500 }, { from: '2026-10-15', target: 1000 }, { from: '2026-10-20', target: null }] });
  assert.equal(prefs.dailyGoalOn(r.data.dailyGoal, '2026-10-21'), null, 'turned off');
  assert.equal(prefs.dailyGoalOn(r.data.dailyGoal, '2026-10-13'), 500, 'history kept');
  const after = (await one(db, `select preferences from public.profiles where id = $1`, [ALICE])).preferences;
  const { rune2DailyGoal, ...rest } = after;
  assert.deepEqual(rest, before ?? {}, 'only the goal key changed');
  assert.equal(rune2DailyGoal.length, 3);
  assert.equal((await settings.updateRunePreferences({ dailyGoal: [{ from: '2026-10-12', target: 0 }] })).error, 'A daily goal is a whole number of words per day.');
  // It is the account's, not a Project's: the same answer from another Project's board, and Bram sees nothing.
  signIn(db, BRAM);
  assert.deepEqual(prefs.readRunePreferences((await one(db, `select preferences from public.profiles where id = $1`, [BRAM])).preferences).dailyGoal, []);
});

test('a day against its goal: reached, under (still a writing day), or no goal; the ring\'s progress; today\'s goal is counted across every Project', () => {
  const h = [{ from: '2026-10-01', target: 500 }, { from: '2026-10-10', target: 1000 }, { from: '2026-10-20', target: null }];
  assert.deepEqual(rules.dayGoal(642, h, '2026-09-30'), null, 'before the goal: no status, never "missed"');
  assert.deepEqual(rules.dayGoal(642, h, '2026-10-01'), { target: 500, hit: true });
  assert.deepEqual(rules.dayGoal(642, h, '2026-10-10'), { target: 1000, hit: false }, 'raised on the 10th: the 10th is judged by 1,000');
  assert.deepEqual(rules.dayGoal(642, h, '2026-10-09'), { target: 500, hit: true }, 'the 9th keeps the goal that applied then');
  assert.deepEqual(rules.dayGoal(500, h, '2026-10-05'), { target: 500, hit: true }, 'exactly the target is reached');
  assert.deepEqual(rules.dayGoal(0, h, '2026-10-05'), { target: 500, hit: false });
  assert.deepEqual(rules.dayGoal(2000, h, '2026-10-21'), null, 'turned off: no status');
  assert.deepEqual(rules.dailyGoalProgress(0, 500), { share: 0, percent: 0, remaining: 500, reached: false });
  assert.deepEqual(rules.dailyGoalProgress(250, 500), { share: 0.5, percent: 50, remaining: 250, reached: false });
  assert.deepEqual(rules.dailyGoalProgress(500, 500), { share: 1, percent: 100, remaining: 0, reached: true });
  assert.deepEqual(rules.dailyGoalProgress(900, 500), { share: 1, percent: 180, remaining: 0, reached: true }, 'past the target the ring stays whole and the number keeps counting');
  // The calendar carries each day's status; today's cell moves with the day's words across Projects.
  const days = rules.dailyTotals([{ date: '2026-10-12', words: 300 }, { date: '2026-10-12', words: 500 }, { date: '2026-10-11', words: 120 }], rules.daysEnding('2026-10-12', 112));
  const cells = rules.activityCalendar(days, '2026-10-12', 16, h).flatMap((w) => w.cells);
  const on = (d) => cells.find((c) => c.date === d);
  assert.deepEqual(on('2026-10-12').goal, { target: 1000, hit: false }, '800 of 1,000 today, both Projects counted');
  assert.deepEqual(on('2026-10-11').goal, { target: 1000, hit: false });
  assert.deepEqual(on('2026-09-15').goal, null);
  const crossed = rules.activityCalendar(rules.dailyTotals([{ date: '2026-10-12', words: 1000 }], rules.daysEnding('2026-10-12', 112)), '2026-10-12', 16, h).flatMap((w) => w.cells);
  assert.deepEqual(crossed.find((c) => c.date === '2026-10-12').goal, { target: 1000, hit: true }, 'crossing the goal: today\'s cell is reached');
  // Words mode is untouched by a goal: the same cells, the same levels.
  assert.deepEqual(rules.activityCalendar(days, '2026-10-12').flatMap((w) => w.cells).map((c) => c.level), cells.map((c) => c.level));
  // The streak is not the goal: a day under its goal still counts.
  assert.deepEqual(rules.writingStreak(['2026-10-11', '2026-10-12'], '2026-10-12'), { current: 2, best: 2 });
});

test('the Daily Goal widget: in the Activity group, wide and small, opt-in; the board\'s goal mode is a widget option; nothing celebratory', () => {
  const widgets = code(read('src/components/rune2/Widgets.tsx'));
  assert.match(widgets, /case "dailyGoal":/);
  assert.match(widgets, /role="progressbar"[\s\S]*?aria-valuetext=\{text\}/, 'exact progress text for assistive technology');
  assert.match(widgets, /todayAll/, 'today across every Project');
  assert.match(widgets, /update\(\{ dailyGoal: history \}\)/, 'saved as an account preference');
  for (const word of ['confetti', 'flame', 'fireworks', 'missed day', 'Missed', 'Don’t lose', 'behind']) assert.doesNotMatch(widgets, new RegExp(word), word);
  assert.match(widgets, /dayLabel\(/);
  assert.match(widgets, /· No daily goal/);
  assert.match(widgets, /· Goal reached/);
  const css = read('src/app/(rune2)/rune2.css');
  assert.match(css, /\.r2-activity-day\[data-goal="hit"\] \{[^}]*--r2-success/);
  assert.doesNotMatch(css.slice(css.indexOf('Daily goal ──')), /--r2-danger/, 'no red in the goal grammar');
});

test('the history cap never turns a day in the activity window into "no goal": the governing entry is always kept, across the trim boundary', () => {
  // 450 daily changes ending today: the cap keeps the latest 400. Every day the calendar
  // shows (the last 112) is still judged by exactly the entry that applied — including the
  // first days of the window, whose entry sits far back in the kept list, and a day whose
  // goal was set long before the window and never changed since.
  const today = '2026-10-12';
  const changes = Array.from({ length: 450 }, (_, i) => ({ from: rules.shiftDay(today, -(449 - i)), target: 100 + i }));
  const kept = prefs.resolveDailyGoal(changes);
  assert.equal(kept.length, prefs.DAILY_GOAL_HISTORY_MAX);
  for (const date of rules.daysEnding(today, rules.ACTIVITY_WEEKS * 7)) {
    const expected = changes.filter((c) => c.from <= date).at(-1).target;
    assert.equal(prefs.dailyGoalOn(kept, date), expected, date);
  }
  // Sparse history: one goal set years ago, 400 later changes, the window well after them all.
  const sparse = [{ from: '2020-01-01', target: 300 }, ...Array.from({ length: 400 }, (_, i) => ({ from: rules.shiftDay('2024-01-01', i), target: 500 + i }))];
  const keptSparse = prefs.resolveDailyGoal(sparse);
  assert.equal(keptSparse.length, 400);
  assert.equal(prefs.dailyGoalOn(keptSparse, today), 899, 'the last change governs every later day');
  for (const date of rules.daysEnding(today, rules.ACTIVITY_WEEKS * 7)) assert.equal(prefs.dailyGoalOn(keptSparse, date), 899, date);
  // A goal active across the trim boundary (set once, then only turned off and on much later) is kept, with its entry.
  const across = [{ from: '2025-01-01', target: 750 }, ...Array.from({ length: 400 }, (_, i) => ({ from: rules.shiftDay('2025-06-01', i), target: i % 2 ? null : 750 }))];
  const keptAcross = prefs.resolveDailyGoal(across);
  assert.equal(keptAcross[0].from, '2025-06-01', 'the oldest kept entry is the 400th most recent change');
  for (const date of rules.daysEnding(today, rules.ACTIVITY_WEEKS * 7)) {
    assert.equal(prefs.dailyGoalOn(keptAcross, date), across.filter((c) => c.from <= date).at(-1).target, date);
  }
  // What the cap forgets is only older than every kept change: never a day any surface judges.
  assert.equal(prefs.dailyGoalOn(keptAcross, '2025-03-01'), null);
});
