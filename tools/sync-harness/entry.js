// Post-fix verification of the Rune save/conflict pipeline — exercises the
// REAL src/lib/offline/syncEngine.ts + db.ts. Scenario names map to the
// pre-fix reproduction scenarios (R*) plus regression scenarios (G*, W)
// that must STILL detect genuine conflicts and enforce the word limit.
import 'fake-indexeddb/auto';
import {
  writeToPendingQueue,
  syncPendingWrite,
  flushPendingQueue,
  forceWriteLocalContent,
  isUnsupportedSaveFailure,
} from '@/lib/offline/syncEngine';
import { getOfflineDB, cacheScene, storeOfflineWritingCredit } from '@/lib/offline/db';
import {
  server, resetServer, createServerPage, metadataUpdate, remoteContentSave, releaseHang, releaseFetchHang,
  applyPlacementMigration, trashServerScene, restoreServerScene, deleteServerScene, tick, nowIso,
} from './mocks/serverState.js';
import { getOfflineStorageSummary, getRetiredDrafts, getRetiredDraftText, discardRetiredDraft } from '@/lib/offline/db';
import { recordWordsWrittenCalls } from './mocks/actionsMisc.js';
import { TAB_ID, getTabBaseline, noteServerState, acceptServerState } from '@/lib/offline/tabBaseline';

const PAGE = 'page-1';
const USER = 'user-1';

function doc(words, prefix = 'w') {
  const text = Array.from({ length: words }, (_, i) => prefix + i).join(' ');
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

const results = [];
function check(name, cond, detail = '') { results.push({ name, pass: !!cond, detail }); }

async function getPending() {
  const db = await getOfflineDB();
  return (await db.get('pending_writes', PAGE)) ?? null;
}
async function getCache() {
  const db = await getOfflineDB();
  return (await db.get('page_cache', PAGE)) ?? null;
}

async function createPageAndPrimeCache() {
  const row = createServerPage(PAGE);
  await cacheScene(
    {
      id: PAGE, chapter_id: 'ch-1', title: 'Page 1', content: null,
      word_count: 0, position: 0, manuscript_id: 'ms-1', version: 1,
      created_at: row.updated_at, updated_at: row.updated_at,
    },
    'proj-1'
  );
}

// ── R1 (fixed): rename during typing + background flush → NO conflict, uploads
async function r1() {
  resetServer();
  await createPageAndPrimeCache();
  await writeToPendingQueue(PAGE, USER, doc(650), 650);
  metadataUpdate(PAGE); // user names the page — trigger bumps version/updated_at
  const flushResult = await flushPendingQueue();
  const serverRow = server.scenes.get(PAGE);
  check('R1-fixed: flush uploads despite metadata bump', flushResult.synced === 1 && flushResult.conflicts === 0, JSON.stringify(flushResult));
  check('R1-fixed: server received all 650 words', serverRow.word_count === 650, serverRow.word_count);
  check('R1-fixed: queue cleared', (await getPending()) === null, '');
  const cache = await getCache();
  check('R1-fixed: confirmed baseline recorded', cache?.serverWordCount === 650 && cache?.serverContent !== undefined, '');
}

// ── R2 (fixed): a pre-latched false 'conflict' row (the production stranded
//    state) self-heals on the next flush — Scenario F recovery.
async function r2() {
  resetServer();
  await createPageAndPrimeCache();
  await writeToPendingQueue(PAGE, USER, doc(650), 650);
  const db = await getOfflineDB();
  const pending = await db.get('pending_writes', PAGE);
  await db.put('pending_writes', { ...pending, syncStatus: 'conflict' }); // as latched in prod
  metadataUpdate(PAGE); // stale-baseline cause still present

  const flushResult = await flushPendingQueue();
  const serverRow = server.scenes.get(PAGE);
  check('R2-fixed: latched conflict re-evaluated and uploaded', flushResult.synced === 1, JSON.stringify(flushResult));
  check('R2-fixed: stranded 650-word prose recovered to server', serverRow.word_count === 650, serverRow.word_count);
  check('R2-fixed: conflict state cleared', (await getPending()) === null, '');
}

// ── R3 (fixed): newer keystroke content survives an older save's ok-path
async function r3() {
  resetServer();
  await createPageAndPrimeCache();
  await writeToPendingQueue(PAGE, USER, doc(500), 500);
  server.rpcMode = 'hang';
  const inflight = syncPendingWrite(PAGE, 'online', 0);
  await new Promise(r => setTimeout(r, 20));
  await writeToPendingQueue(PAGE, USER, doc(520), 520); // keystroke during in-flight save
  server.rpcMode = 'ok';
  releaseHang();
  await inflight;

  const after = await getPending();
  check('R3-fixed: newer 520w content still queued after older ok', after?.wordCount === 520 && after?.syncStatus === 'pending', JSON.stringify({ wc: after?.wordCount, st: after?.syncStatus }));
  // next cycle uploads the newest content
  await syncPendingWrite(PAGE, 'online', 500);
  const serverRow = server.scenes.get(PAGE);
  check('R3-fixed: next sync persists newest content (520w)', serverRow.word_count === 520, serverRow.word_count);
  check('R3-fixed: queue clean at end', (await getPending()) === null, '');
}

// ── R6 (fixed): server errors are propagated, recorded, and categorized
async function r6() {
  resetServer();
  await createPageAndPrimeCache();
  await writeToPendingQueue(PAGE, USER, doc(650), 650);
  server.rpcMode = 'error';
  const errs = [];
  const origError = console.error;
  console.error = (...a) => errs.push(a.join(' '));
  await syncPendingWrite(PAGE, 'online', 0);
  console.error = origError;
  const pending = await getPending();
  check('R6-fixed: write stays pending for retry', pending?.syncStatus === 'pending', pending?.syncStatus);
  check('R6-fixed: real error message logged', errs.some(e => e.includes('simulated postgres error')), JSON.stringify(errs));
  check('R6-fixed: lastError recorded on the queue row', pending?.lastError?.includes('simulated postgres error'), pending?.lastError);

  const res = await forceWriteLocalContent(PAGE);
  check('R6-fixed: Keep Local returns categorized server error', res.status === 'error' && res.category === 'server' && res.message.includes('simulated'), JSON.stringify(res));
  check('R6-fixed: local prose intact after failed Keep Local', (await getPending())?.wordCount === 650, '');
}

// ── R7 (fixed): poisoned optimistic baseline vs empty server → uploads
async function r7() {
  resetServer();
  await createPageAndPrimeCache();
  await writeToPendingQueue(PAGE, USER, doc(421), 421);
  await syncPendingWrite(PAGE, 'online', 421); // poisoned expected baseline, server at 0
  const serverRow = server.scenes.get(PAGE);
  check('R7-fixed: empty-server rule overrides poisoned baseline — uploads', serverRow.word_count === 421, serverRow.word_count);
  check('R7-fixed: no conflict latched', (await getPending()) === null, '');
}

// ── G1: genuine two-writer conflict is STILL detected (editor + flush paths)
async function g1() {
  resetServer();
  await createPageAndPrimeCache();
  // confirmed sync at 500 words
  await writeToPendingQueue(PAGE, USER, doc(500), 500);
  await syncPendingWrite(PAGE, 'online', 0);
  check('G1: baseline sync ok (server 500)', server.scenes.get(PAGE).word_count === 500, '');

  // another device writes different content (620 words)
  remoteContentSave(PAGE, doc(620, 'remote'), 620);

  // this tab edits from the old baseline and syncs (editor path, expected=500)
  await writeToPendingQueue(PAGE, USER, doc(510), 510);
  await syncPendingWrite(PAGE, 'online', 500);
  let pending = await getPending();
  check('G1: editor path flags genuine conflict', pending?.syncStatus === 'conflict', pending?.syncStatus);
  check('G1: remote content NOT overwritten', server.scenes.get(PAGE).word_count === 620, '');

  // flush path re-evaluates: still a genuine conflict (confirmed baseline 500 ≠ server 620)
  const flushResult = await flushPendingQueue();
  pending = await getPending();
  check('G1: flush re-confirms genuine conflict (no silent overwrite)', pending?.syncStatus === 'conflict' && flushResult.synced === 0, JSON.stringify(flushResult));

  // Keep Local force-write wins explicitly
  const res = await forceWriteLocalContent(PAGE);
  check('G1: Keep Local force-writes and verifies', res.status === 'ok' && res.wordCount === 510, JSON.stringify(res));
  check('G1: server now holds kept local version', server.scenes.get(PAGE).word_count === 510, '');
}

// ── G2: remote edit with IDENTICAL word count is caught by the deep content check
async function g2() {
  resetServer();
  await createPageAndPrimeCache();
  await writeToPendingQueue(PAGE, USER, doc(500), 500);
  await syncPendingWrite(PAGE, 'online', 0); // confirmed baseline: 500 words, content doc(500,'w')

  // another device saves DIFFERENT prose with the SAME word count
  remoteContentSave(PAGE, doc(500, 'other'), 500);

  // background flush path (no in-memory baseline): word counts equal, version advanced
  await writeToPendingQueue(PAGE, USER, doc(505), 505);
  await flushPendingQueue();
  const pending = await getPending();
  check('G2: identical-word-count remote edit detected via deep content check', pending?.syncStatus === 'conflict', pending?.syncStatus);
  check('G2: remote content preserved', JSON.stringify(server.scenes.get(PAGE).content).includes('other0'), '');
}

// ── G3: metadata-only bump after a confirmed sync → no conflict (deep check passes)
async function g3() {
  resetServer();
  await createPageAndPrimeCache();
  await writeToPendingQueue(PAGE, USER, doc(500), 500);
  await syncPendingWrite(PAGE, 'online', 0);
  metadataUpdate(PAGE); // rename after confirmed sync
  await writeToPendingQueue(PAGE, USER, doc(505), 505);
  const flushResult = await flushPendingQueue();
  check('G3: rename after confirmed sync — flush still uploads', flushResult.synced === 1 && flushResult.conflicts === 0, JSON.stringify(flushResult));
  check('G3: server has newest content', server.scenes.get(PAGE).word_count === 505, '');
}

// ── W: word-limit enforcement unchanged
async function w() {
  resetServer();
  await createPageAndPrimeCache();
  await writeToPendingQueue(PAGE, USER, doc(650), 650);
  server.rpcMode = 'word_limit_blocked';
  await syncPendingWrite(PAGE, 'online', 0);
  const pending = await getPending();
  check('W: blocked write stays pending (nothing lost)', pending?.syncStatus === 'pending' && pending?.wordCount === 650, pending?.syncStatus);
  check('W: server unchanged', server.scenes.get(PAGE).word_count === 0, '');
  const res = await forceWriteLocalContent(PAGE);
  check('W: Keep Local reports word_limit_blocked distinctly', res.status === 'word_limit_blocked', JSON.stringify(res));
}

// ── F: full stranded-prose production state recovery (Scenario F)
async function f() {
  resetServer();
  // server page exists, EMPTY; IDB holds 650-word prose latched 'conflict';
  // cache has a stale legacy baseline (no serverWordCount, old serverUpdatedAt)
  createServerPage(PAGE);
  metadataUpdate(PAGE); // server row was renamed at some point
  const db = await getOfflineDB();
  await db.put('page_cache', {
    id: PAGE, content: doc(650), wordCount: 650,
    serverUpdatedAt: new Date(0).toISOString(), cachedAt: Date.now(),
  });
  await db.put('pending_writes', {
    id: PAGE, userId: USER, content: doc(650), wordCount: 650,
    localUpdatedAt: Date.now(), syncStatus: 'conflict', retryCount: 3,
  });

  const flushResult = await flushPendingQueue();
  const serverRow = server.scenes.get(PAGE);
  check('F: stranded prose auto-recovered by first flush', flushResult.synced === 1, JSON.stringify(flushResult));
  check('F: server holds the full 650 words', serverRow.word_count === 650, serverRow.word_count);
  check('F: conflict cleared, queue empty', (await getPending()) === null, '');
  const cache = await getCache();
  check('F: confirmed baseline established for future syncs', cache?.serverWordCount === 650, '');
}

// ── I: retry idempotency — same pending write synced repeatedly
async function i() {
  resetServer();
  await createPageAndPrimeCache();
  await writeToPendingQueue(PAGE, USER, doc(300), 300);
  await syncPendingWrite(PAGE, 'online', 0);
  await syncPendingWrite(PAGE, 'online', 300); // retry after success → no pending, no-op
  await flushPendingQueue();                    // nothing to do
  const serverRow = server.scenes.get(PAGE);
  const saves = server.log.filter(l => l.op === 'save_scene_checked').length;
  check('I: content correct after repeated sync calls', serverRow.word_count === 300, '');
  check('I: exactly one server save issued', saves === 1, 'saves=' + saves);
  check('I: queue empty, no duplication', (await getPending()) === null, '');
}

// ── M: stale queue entry for a deleted/inaccessible page — accurate
//    classification, prose preserved, no opaque coercion error
async function m() {
  resetServer();
  // NO server row, and no confirmed baseline — the Scene was permanently
  // deleted (or never existed here) while 650 unsent words sit in the queue.
  const db = await getOfflineDB();
  await db.put('pending_writes', {
    id: PAGE, userId: USER, content: doc(650), wordCount: 650,
    localUpdatedAt: Date.now(), syncStatus: 'pending', retryCount: 0,
  });
  const logs = captureConsole();
  await syncPendingWrite(PAGE, 'online');
  logs.restore();
  const pending = await getPending();
  check('M: missing server row with unsent prose → terminal retired (not conflict, not deleted)',
    pending?.syncStatus === 'retired', pending?.syncStatus);
  check('M: precise reason recorded — no coercion message',
    pending?.retiredReason?.includes('permanently deleted or is not this account') && !pending?.lastError?.includes('coerce'),
    pending?.retiredReason);
  check('M: log line includes the page id', logs.lines.some(e => e.includes(PAGE)), JSON.stringify(logs.lines));
  check('M: prose preserved in queue', pending?.wordCount === 650 && pending?.content?.content?.[0]?.content?.[0]?.text?.startsWith('w0 w1'), '');
  // flush leaves it alone: no retry, no further server calls, no new log line
  const callsBefore = server.log.length;
  const logs2 = captureConsole();
  const flushResult = await flushPendingQueue();
  logs2.restore();
  const after = await getPending();
  check('M: flush does not retry a retired row', after?.syncStatus === 'retired' && flushResult.failed === 0 && server.log.length === callsBefore, JSON.stringify(flushResult));
  check('M: flush logs nothing for a retired row', logs2.lines.length === 0, JSON.stringify(logs2.lines));
}

// ── Stale-queue helpers ──────────────────────────────────────────────────────
function captureConsole() {
  const lines = [];
  const origError = console.error, origWarn = console.warn;
  console.error = (...a) => lines.push('error ' + a.join(' '));
  console.warn = (...a) => lines.push('warn ' + a.join(' '));
  return { lines, restore() { console.error = origError; console.warn = origWarn; } };
}
function saveCalls(id = PAGE) {
  return server.log.filter((l) => l.op === 'save_scene_checked' && l.id === id).length;
}

// ── S1: a retryable network failure stays retryable and succeeds later ──────
async function s1() {
  resetServer();
  await createPageAndPrimeCache();
  await writeToPendingQueue(PAGE, USER, doc(120), 120);
  server.fetchMode = 'network_error';
  const logs = captureConsole();
  await syncPendingWrite(PAGE, 'online', 0);
  await flushPendingQueue();
  await flushPendingQueue();
  logs.restore();
  let pending = await getPending();
  check('S1: network failure → failed, retryable, prose kept', pending?.syncStatus === 'failed' && pending?.wordCount === 120, pending?.syncStatus);
  check('S1: network failure never consults Trash state', !server.log.some((l) => l.op === 'workspace_trash_state'), JSON.stringify(server.log));
  check('S1: the same failure is logged once, not on every retry', logs.lines.filter((l) => l.includes('Failed to fetch')).length === 1, JSON.stringify(logs.lines));
  server.fetchMode = 'ok';
  const res = await flushPendingQueue();
  pending = await getPending();
  check('S1: retry after reconnect uploads', res.synced === 1 && pending === null && server.scenes.get(PAGE).word_count === 120, JSON.stringify(res));
}

// ── S2: definitive not-found with nothing unsaved → retired and dropped ──────
async function s2() {
  resetServer();
  await createPageAndPrimeCache();
  await writeToPendingQueue(PAGE, USER, doc(80), 80);
  await syncPendingWrite(PAGE, 'online', 0); // confirmed: baseline = doc(80)
  check('S2: setup synced', (await getPending()) === null, '');
  // The editor's trailing debounce re-queues the same content, then the Scene
  // is permanently deleted (another device).
  await writeToPendingQueue(PAGE, USER, doc(80), 80);
  deleteServerScene(PAGE);
  const logs = captureConsole();
  await flushPendingQueue();
  const callsAfterFirst = server.log.length;
  await flushPendingQueue();
  await flushPendingQueue();
  logs.restore();
  check('S2: queue row retired and dropped (content already on the server)', (await getPending()) === null, '');
  check('S2: no save attempted, no resurrection', saveCalls() === 1 && !server.scenes.has(PAGE), JSON.stringify(server.log));
  check('S2: later flushes make no server calls', server.log.length === callsAfterFirst, '');
  check('S2: logged exactly once', logs.lines.length === 1 && logs.lines[0].includes('retired and dropped'), JSON.stringify(logs.lines));
}

// ── S3: a stale item never blocks later valid queue items ───────────────────
async function s3() {
  resetServer();
  const STALE = 'a-stale', VALID = 'b-valid';
  const db = await getOfflineDB();
  await db.put('pending_writes', { id: STALE, userId: USER, content: doc(50), wordCount: 50, localUpdatedAt: Date.now(), syncStatus: 'pending', retryCount: 0 });
  createServerPage(VALID);
  await writeToPendingQueue(VALID, USER, doc(70), 70);
  const res = await flushPendingQueue();
  check('S3: valid write synced despite the stale one ahead of it', res.synced === 1 && server.scenes.get(VALID).word_count === 70, JSON.stringify(res));
  check('S3: stale write retired, prose kept', (await db.get('pending_writes', STALE))?.syncStatus === 'retired', '');
  check('S3: valid write cleared', (await db.get('pending_writes', VALID)) === undefined, '');
  const res2 = await flushPendingQueue();
  check('S3: next flush is clean', res2.synced === 0 && res2.failed === 0 && res2.conflicts === 0, JSON.stringify(res2));
}

// ── S4: a stale save never resurrects a deleted Scene ────────────────────────
async function s4() {
  resetServer();
  await createPageAndPrimeCache();
  await writeToPendingQueue(PAGE, USER, doc(300), 300);
  deleteServerScene(PAGE);
  await syncPendingWrite(PAGE, 'online', 0);
  await flushPendingQueue();
  check('S4: no server row was created', !server.scenes.has(PAGE), '');
  check('S4: save_scene_checked never called for the deleted Scene', saveCalls() === 0, JSON.stringify(server.log));
  check('S4: unsent prose retired, not lost', (await getPending())?.syncStatus === 'retired' && (await getPending())?.wordCount === 300, '');
}

// ── S5: unique queued prose for a deleted Scene is never silently discarded ─
async function s5() {
  resetServer();
  await createPageAndPrimeCache();
  await writeToPendingQueue(PAGE, USER, doc(40), 40);
  await syncPendingWrite(PAGE, 'online', 0); // baseline doc(40)
  await writeToPendingQueue(PAGE, USER, doc(90, 'new'), 90); // 50 words beyond the baseline
  deleteServerScene(PAGE);
  await flushPendingQueue();
  const pending = await getPending();
  check('S5: retired row keeps the exact unsent content', pending?.syncStatus === 'retired' && pending?.content?.content?.[0]?.content?.[0]?.text?.startsWith('new0 new1'), '');
  const summary = await getOfflineStorageSummary();
  check('S5: summary counts it as retired, not pending', summary.retired === 1 && summary.pending === 0, JSON.stringify(summary));
  const drafts = await getRetiredDrafts();
  check('S5: Settings can list it (no prose in the listing)', drafts.length === 1 && drafts[0].sceneId === PAGE && drafts[0].wordCount === 90 && !JSON.stringify(drafts).includes('new0'), JSON.stringify(drafts));
  const text = await getRetiredDraftText(PAGE);
  check('S5: its plain text is recoverable', text?.startsWith('new0 new1') && text.split(/\s+/).length === 90, text?.slice(0, 40));
  check('S5: discarding is explicit', (await discardRetiredDraft(PAGE)) === true && (await getPending()) === null, '');
}

// ── S6: Trash and restore are not permanent deletion ─────────────────────────
async function s6() {
  resetServer();
  await createPageAndPrimeCache();
  await writeToPendingQueue(PAGE, USER, doc(40), 40);
  await syncPendingWrite(PAGE, 'online', 0);
  await writeToPendingQueue(PAGE, USER, doc(55), 55); // unsent edit
  trashServerScene(PAGE);
  const logs = captureConsole();
  await flushPendingQueue();
  await flushPendingQueue();
  logs.restore();
  let pending = await getPending();
  check('S6: trashed Scene with unsent prose → failed (retryable), not retired', pending?.syncStatus === 'failed' && pending?.lastError?.includes('in Trash'), pending?.lastError);
  check('S6: save never attempted against a trashed Scene', saveCalls() === 1, JSON.stringify(server.log));
  check('S6: logged once across repeated flushes', logs.lines.length === 1, JSON.stringify(logs.lines));
  restoreServerScene(PAGE);
  const res = await flushPendingQueue();
  pending = await getPending();
  check('S6: after restore the queued edit saves', res.synced === 1 && pending === null && server.scenes.get(PAGE).word_count === 55, JSON.stringify(res));

  // The reported production case: a trailing empty save for a Scene that was
  // emptied and then trashed. Nothing unsent — retire and drop.
  await writeToPendingQueue(PAGE, USER, { type: 'doc', content: [{ type: 'paragraph' }] }, 0);
  remoteContentSave(PAGE, { type: 'doc', content: [{ type: 'paragraph' }] }, 0);
  trashServerScene(PAGE);
  const logs2 = captureConsole();
  await flushPendingQueue();
  await flushPendingQueue();
  logs2.restore();
  check('S6: trashed + empty queued save → retired and dropped', (await getPending()) === null, '');
  check('S6: the Scene stays in Trash, untouched', server.trashed.has(PAGE) && server.scenes.has(PAGE), '');
  check('S6: dropped once, silently afterwards', logs2.lines.length === 1 && logs2.lines[0].includes('in Trash'), JSON.stringify(logs2.lines));
}

// ── S7: duplicate stale retries do not accumulate ───────────────────────────
async function s7() {
  resetServer();
  const db = await getOfflineDB();
  await db.put('pending_writes', { id: PAGE, userId: USER, content: doc(25), wordCount: 25, localUpdatedAt: Date.now(), syncStatus: 'pending', retryCount: 0 });
  const logs = captureConsole();
  for (let i = 0; i < 6; i++) {
    await flushPendingQueue();
    await syncPendingWrite(PAGE, 'online');
  }
  logs.restore();
  const all = await db.getAll('pending_writes');
  const row = all[0];
  check('S7: exactly one queue row', all.length === 1, String(all.length));
  check('S7: retryCount untouched, status retired', row.retryCount === 0 && row.syncStatus === 'retired', JSON.stringify({ r: row.retryCount, s: row.syncStatus }));
  check('S7: one log line for twelve attempts', logs.lines.length === 1, JSON.stringify(logs.lines));
  check('S7: one Trash-state lookup, then silence', server.log.filter((l) => l.op === 'workspace_trash_state').length === 1, JSON.stringify(server.log));
}

// ── S8: explicit terminal state, and ambiguity never retires ─────────────────
async function s8() {
  resetServer();
  const db = await getOfflineDB();
  await db.put('pending_writes', { id: PAGE, userId: USER, content: doc(25), wordCount: 25, localUpdatedAt: Date.now(), syncStatus: 'pending', retryCount: 0 });
  // Ambiguous: the Trash-state RPC itself fails (offline, or a database
  // without 031) → must stay retryable.
  server.trashStateMode = 'error';
  await syncPendingWrite(PAGE, 'online');
  let row = await getPending();
  check('S8: undeterminable Trash state → failed, not retired', row?.syncStatus === 'failed' && row?.lastError?.includes('could not be determined'), row?.lastError);
  // Now definitive:
  server.trashStateMode = 'ok';
  await syncPendingWrite(PAGE, 'online');
  row = await getPending();
  check('S8: definitive → retired with retiredAt and retiredReason', row?.syncStatus === 'retired' && typeof row?.retiredAt === 'number' && typeof row?.retiredReason === 'string', JSON.stringify(row && { s: row.syncStatus, at: row.retiredAt, why: row.retiredReason }));
  check('S8: retiredReason carries no prose', !row?.retiredReason?.includes('w0'), row?.retiredReason);
  const summary = await getOfflineStorageSummary();
  check('S8: excluded from pending, counted as retired', summary.pending === 0 && summary.retired === 1, JSON.stringify(summary));
  // A different account's row is never classified at all.
  await db.put('pending_writes', { id: 'other-acct', userId: 'user-2', content: doc(10), wordCount: 10, localUpdatedAt: Date.now(), syncStatus: 'pending', retryCount: 0 });
  await syncPendingWrite('other-acct', 'online');
  const other = await db.get('pending_writes', 'other-acct');
  check('S8: another account\'s queued save stays failed/retryable, never retired', other?.syncStatus === 'failed' && other?.lastError?.includes('different account'), other?.lastError);
  check('S8: no Trash lookup for another account\'s row', !server.log.some((l) => l.op === 'workspace_trash_state' && l.id === 'other-acct'), '');
}

// ── S9: a valid Scene save is unchanged, and a stranded 'syncing' row revives ─
async function s9() {
  resetServer();
  await createPageAndPrimeCache();
  await writeToPendingQueue(PAGE, USER, doc(200), 200);
  const res = await flushPendingQueue();
  const cache = await getCache();
  check('S9: valid save → one server call, queue cleared, baseline confirmed', res.synced === 1 && saveCalls() === 1 && (await getPending()) === null && cache?.serverWordCount === 200, JSON.stringify(res));
  check('S9: no Trash lookup on the happy path', !server.log.some((l) => l.op === 'workspace_trash_state'), '');

  // A row left 'syncing' by a tab that closed mid-request (no syncingSince:
  // written by an earlier client) must be revived by the flush.
  const db = await getOfflineDB();
  await db.put('pending_writes', { id: PAGE, userId: USER, content: doc(230), wordCount: 230, localUpdatedAt: Date.now(), syncStatus: 'syncing', retryCount: 0 });
  const res2 = await flushPendingQueue();
  check('S9: stranded syncing row (no timestamp) revived and saved', res2.synced === 1 && server.scenes.get(PAGE).word_count === 230 && (await getPending()) === null, JSON.stringify(res2));
  // A fresh 'syncing' mark is left alone (another caller owns it).
  await db.put('pending_writes', { id: PAGE, userId: USER, content: doc(240), wordCount: 240, localUpdatedAt: Date.now(), syncStatus: 'syncing', syncingSince: Date.now(), retryCount: 0 });
  const res3 = await flushPendingQueue();
  check('S9: a fresh syncing row is not touched by the flush', res3.synced === 0 && (await getPending())?.syncStatus === 'syncing' && server.scenes.get(PAGE).word_count === 230, JSON.stringify(res3));
  // ...until it is stale.
  await db.put('pending_writes', { ...(await getPending()), syncingSince: Date.now() - 10 * 60 * 1000 });
  const res4 = await flushPendingQueue();
  check('S9: a stale syncing row is revived', res4.synced === 1 && server.scenes.get(PAGE).word_count === 240, JSON.stringify(res4));
}

// ── KL: the exact production Keep-Local lifecycle — the "false conflict after
//    Keep Local" bug. Baseline v-N (40w) → genuine conflict → Keep Local
//    succeeds (server advances one version) → next local edit → background poll
//    reads the client's OWN new version → NO false conflict → edit persists.
async function kl() {
  resetServer();
  await createPageAndPrimeCache();
  // Confirmed acknowledged baseline: 40 words, recorded in cache + on server.
  await writeToPendingQueue(PAGE, USER, doc(40), 40);
  await syncPendingWrite(PAGE, 'online', 0);
  check('KL: acknowledged baseline synced (server 40w)', server.scenes.get(PAGE).word_count === 40, '');

  // Local and server diverge → a legitimate conflict is presented.
  remoteContentSave(PAGE, doc(55, 'remote'), 55);
  await writeToPendingQueue(PAGE, USER, doc(41), 41);
  await syncPendingWrite(PAGE, 'online', 40); // editor path, confirmed baseline 40
  check('KL: legitimate conflict presented', (await getPending())?.syncStatus === 'conflict', '');

  // User chooses Keep Local — force-write succeeds and returns the new version.
  const res = await forceWriteLocalContent(PAGE);
  const keptVersion = server.scenes.get(PAGE).version;
  check('KL: Keep Local succeeds, returns kept word count', res.status === 'ok' && res.wordCount === 41, JSON.stringify(res));
  check('KL: server now holds kept-local content (41w)', server.scenes.get(PAGE).word_count === 41, '');
  check('KL: queue cleared after Keep Local', (await getPending()) === null, '');
  const cacheAfterKL = await getCache();
  check('KL: IDB baseline adopted the acknowledged version + word count',
    cacheAfterKL?.serverVersion === keptVersion && cacheAfterKL?.serverWordCount === 41,
    JSON.stringify({ v: cacheAfterKL?.serverVersion, kept: keptVersion, w: cacheAfterKL?.serverWordCount }));

  // The next local edit + a background poll that reads server version === the
  // client's own kept version must NOT be misread as an external edit.
  await writeToPendingQueue(PAGE, USER, doc(42), 42);
  const flush = await flushPendingQueue();
  check('KL: next edit does NOT false-conflict; background poll uploads',
    flush.synced === 1 && flush.conflicts === 0, JSON.stringify(flush));
  check('KL: new local edit persisted (42w)', server.scenes.get(PAGE).word_count === 42, '');
  check('KL: queue clean at end', (await getPending()) === null, '');
}

// ── KLRACE: the async race the fix closes — a background sync captures stale
//    server state (a slow fetch) BEFORE Keep Local, Keep Local completes fully,
//    then the stale sync resumes. It must not raise/resurrect a false conflict.
async function klrace() {
  resetServer();
  await createPageAndPrimeCache();
  await writeToPendingQueue(PAGE, USER, doc(40), 40);
  await syncPendingWrite(PAGE, 'online', 0);
  // Genuine conflict setup: server independently at 55w, local at 41w.
  remoteContentSave(PAGE, doc(55, 'remote'), 55);
  await writeToPendingQueue(PAGE, USER, doc(41), 41);
  await syncPendingWrite(PAGE, 'online', 40);
  check('KLRACE: conflict staged', (await getPending())?.syncStatus === 'conflict', '');

  // A background flush sync begins and its server fetch hangs holding the
  // pre-Keep-Local snapshot (55w).
  server.fetchMode = 'hang';
  const staleSync = syncPendingWrite(PAGE, 'offline_sync');
  await new Promise((r) => setTimeout(r, 20));

  // User clicks Keep Local while that sync is in flight. With the per-page lock
  // it queues behind the sync instead of interleaving.
  const keepLocal = forceWriteLocalContent(PAGE);
  await new Promise((r) => setTimeout(r, 20));

  // Release the hung fetch; later fetches (Keep Local's verify) run normally.
  server.fetchMode = 'ok';
  releaseFetchHang();

  const [, klRes] = await Promise.all([staleSync, keepLocal]);
  check('KLRACE: Keep Local still succeeds under the race', klRes.status === 'ok' && klRes.wordCount === 41, JSON.stringify(klRes));

  const pending = await getPending();
  check('KLRACE: stale in-flight sync did NOT resurrect a false conflict', pending === null, JSON.stringify(pending));
  check('KLRACE: server holds kept-local content (41w)', server.scenes.get(PAGE).word_count === 41, server.scenes.get(PAGE).word_count);
  const cache = await getCache();
  check('KLRACE: confirmed baseline == committed server version',
    cache?.serverWordCount === 41 && cache?.serverVersion === server.scenes.get(PAGE).version,
    JSON.stringify({ w: cache?.serverWordCount, cv: cache?.serverVersion, sv: server.scenes.get(PAGE).version }));
}

// ── KLEXT: a GENUINE external edit landing AFTER Keep Local must still conflict.
async function klext() {
  resetServer();
  await createPageAndPrimeCache();
  await writeToPendingQueue(PAGE, USER, doc(40), 40);
  await syncPendingWrite(PAGE, 'online', 0);
  remoteContentSave(PAGE, doc(55, 'remote'), 55);
  await writeToPendingQueue(PAGE, USER, doc(41), 41);
  await syncPendingWrite(PAGE, 'online', 40);
  const kl = await forceWriteLocalContent(PAGE); // server 41 @ kept version

  // Another device writes real content AFTER the kept version.
  remoteContentSave(PAGE, doc(70, 'remote2'), 70);

  await writeToPendingQueue(PAGE, USER, doc(42), 42);
  await syncPendingWrite(PAGE, 'online', kl.status === 'ok' ? kl.wordCount : 41); // editor baseline = kept 41
  const pending = await getPending();
  check('KLEXT: genuine external edit after Keep Local still conflicts', pending?.syncStatus === 'conflict', pending?.syncStatus);
  check('KLEXT: external content not overwritten', server.scenes.get(PAGE).word_count === 70, '');
}

// ── KLREPEAT: the reported loop — after Keep Local, repeated edit+poll cycles
//    must never re-raise a conflict.
async function klrepeat() {
  resetServer();
  await createPageAndPrimeCache();
  await writeToPendingQueue(PAGE, USER, doc(40), 40);
  await syncPendingWrite(PAGE, 'online', 0);
  remoteContentSave(PAGE, doc(55, 'remote'), 55);
  await writeToPendingQueue(PAGE, USER, doc(41), 41);
  await syncPendingWrite(PAGE, 'online', 40);
  const res = await forceWriteLocalContent(PAGE);
  check('KLREPEAT: Keep Local ok', res.status === 'ok', JSON.stringify(res));

  let conflicts = 0;
  for (let n = 42; n <= 46; n++) {
    await writeToPendingQueue(PAGE, USER, doc(n), n);
    const f = await flushPendingQueue();
    conflicts += f.conflicts;
    // interleave an editor-path sync too, using the kept baseline
    await writeToPendingQueue(PAGE, USER, doc(n), n);
    await syncPendingWrite(PAGE, 'online', n);
    const p = await getPending();
    if (p?.syncStatus === 'conflict') conflicts++;
  }
  check('KLREPEAT: no conflict recurs across repeated edit+poll cycles', conflicts === 0, 'conflicts=' + conflicts);
  check('KLREPEAT: final content persisted (46w)', server.scenes.get(PAGE).word_count === 46, '');
  check('KLREPEAT: queue clean at end', (await getPending()) === null, '');
}

// ── KLMETA: after Keep Local, a metadata-only bump (rename) with identical
//    content/word count must NOT be read as a conflict (deep content check).
async function klmeta() {
  resetServer();
  await createPageAndPrimeCache();
  await writeToPendingQueue(PAGE, USER, doc(40), 40);
  await syncPendingWrite(PAGE, 'online', 0);
  remoteContentSave(PAGE, doc(55, 'remote'), 55);
  await writeToPendingQueue(PAGE, USER, doc(41), 41);
  await syncPendingWrite(PAGE, 'online', 40);
  await forceWriteLocalContent(PAGE); // server: doc(41), 41w, kept version
  metadataUpdate(PAGE); // rename → version bumps; content + word count identical

  await writeToPendingQueue(PAGE, USER, doc(42), 42);
  const f = await flushPendingQueue();
  check('KLMETA: metadata-only bump after Keep Local does not false-conflict',
    f.synced === 1 && f.conflicts === 0, JSON.stringify(f));
  check('KLMETA: server has newest content (42w)', server.scenes.get(PAGE).word_count === 42, '');
}

// ── KLSERVER: Keep Server resets the baseline (mirrors the modal's IDB reset);
//    subsequent edits sync against the server baseline with no false conflict.
async function klserver() {
  resetServer();
  await createPageAndPrimeCache();
  await writeToPendingQueue(PAGE, USER, doc(40), 40);
  await syncPendingWrite(PAGE, 'online', 0);
  remoteContentSave(PAGE, doc(55, 'remote'), 55);
  await writeToPendingQueue(PAGE, USER, doc(41), 41);
  await syncPendingWrite(PAGE, 'online', 40);
  check('KLSERVER: conflict staged', (await getPending())?.syncStatus === 'conflict', '');

  // Keep Server — the exact IDB reset SyncConflictModal.handleKeepServer performs.
  const srv = server.scenes.get(PAGE);
  const db = await getOfflineDB();
  await db.delete('pending_writes', PAGE);
  await db.put('page_cache', {
    id: PAGE, content: srv.content, wordCount: srv.word_count,
    serverUpdatedAt: srv.updated_at, serverVersion: srv.version,
    serverWordCount: srv.word_count, serverContent: srv.content, cachedAt: Date.now(),
  });
  // …and moves this tab's baseline to the kept version (2026-10-12).
  acceptServerState(PAGE, srv.word_count, srv.version);

  // Edit the kept server content and sync — must not false-conflict.
  await writeToPendingQueue(PAGE, USER, doc(56, 'remote'), 56);
  const f = await flushPendingQueue();
  check('KLSERVER: edit after Keep Server syncs with no false conflict',
    f.synced === 1 && f.conflicts === 0, JSON.stringify(f));
  check('KLSERVER: server advanced from the kept baseline (56w)', server.scenes.get(PAGE).word_count === 56, '');
}

// ── S10 (BC-B): auth ambiguity is never "the Scene is gone". No browser
//    session, a server action answering 'Not authenticated', and a Trash-state
//    lookup refused for auth all leave the prose 'failed' (retried), never
//    'retired', and never consult or trust a 'missing' answer.
async function s10() {
  resetServer();
  await createPageAndPrimeCache();
  await writeToPendingQueue(PAGE, USER, doc(140), 140);

  // (a) The browser has no session (expired, or logged out in another tab).
  server.session = null;
  const logs = captureConsole();
  await syncPendingWrite(PAGE, 'online', 0);
  let pending = await getPending();
  check('S10a: no session → failed, prose kept, nothing sent', pending?.syncStatus === 'failed' && pending?.wordCount === 140 && saveCalls() === 0 && !server.log.some((l) => l.op === 'workspace_trash_state'), JSON.stringify(pending?.syncStatus));

  // (b) The session is back but the server action sees no user (cookie expired mid-request).
  server.session = { user: { id: USER } };
  server.rpcMode = 'unauthenticated';
  await flushPendingQueue();
  pending = await getPending();
  check('S10b: server says Not authenticated → pending with the reason, retried, never retired', pending?.syncStatus === 'pending' && /Not authenticated/.test(pending?.lastError ?? '') , JSON.stringify(pending));
  server.rpcMode = 'ok';

  // (c) The Scene read answers no rows and the Trash lookup is refused for auth: ambiguous, never 'missing'.
  trashServerScene(PAGE);
  server.trashStateMode = 'auth_error';
  await flushPendingQueue();
  pending = await getPending();
  check('S10c: Trash lookup refused for auth → failed, not retired', pending?.syncStatus === 'failed' && pending?.wordCount === 140, JSON.stringify(pending?.syncStatus));
  logs.restore();

  // Identity resolved and the Scene restored: the queued prose lands.
  server.trashStateMode = 'ok';
  restoreServerScene(PAGE);
  const res = await flushPendingQueue();
  check('S10: once identity and the Scene are back, the prose is saved', res.synced === 1 && server.scenes.get(PAGE).word_count === 140 && (await getPending()) === null, JSON.stringify(res));
}

// ── S11 (BC-B): a stale client against a server without the save function.
//    The prose is kept and marked; the timed flush leaves it alone (the
//    answer would not change); a writer-initiated send and a direct sync (a
//    reloaded editor) try again; an updated server takes it.
async function s11() {
  resetServer();
  await createPageAndPrimeCache();
  await writeToPendingQueue(PAGE, USER, doc(90), 90);
  server.rpcMode = 'missing_function';
  const logs = captureConsole();
  await syncPendingWrite(PAGE, 'online', 0);
  let pending = await getPending();
  check('S11: missing function → failed with the reason, prose kept', pending?.syncStatus === 'failed' && isUnsupportedSaveFailure(pending) && pending?.wordCount === 90, JSON.stringify(pending));
  const callsBefore = saveCalls();
  await flushPendingQueue();
  await flushPendingQueue();
  check('S11: the timed flush does not retry it', saveCalls() === callsBefore && (await getPending())?.syncStatus === 'failed', String(saveCalls()));
  await flushPendingQueue({ includeUnsupported: true });
  check('S11: a writer-initiated send tries again', saveCalls() === callsBefore + 1, String(saveCalls()));
  logs.restore();
  check('S11: the failure is logged once', logs.lines.filter((l) => l.includes('schema cache')).length === 1, JSON.stringify(logs.lines));
  // The server is updated (or the client reloaded against a current one): a direct sync saves it.
  server.rpcMode = 'ok';
  await syncPendingWrite(PAGE, 'online', 0);
  check('S11: saved once the server has the function', (await getPending()) === null && server.scenes.get(PAGE).word_count === 90, '');
}

// ── S12 (BC-B): a trailing keystroke on a Scene whose row is in Trash
//    elsewhere keeps the prose 'failed' (not 'retired'); the queue summary
//    reports the failure and its reason, scoped to the writer.
async function s12() {
  resetServer();
  await createPageAndPrimeCache();
  await writeToPendingQueue(PAGE, USER, doc(60), 60);
  trashServerScene(PAGE);
  const logs = captureConsole();
  await flushPendingQueue();
  logs.restore();
  const pending = await getPending();
  check('S12: in Trash elsewhere → failed with its reason', pending?.syncStatus === 'failed' && /Trash/.test(pending?.lastError ?? ''), JSON.stringify(pending?.lastError));
  const mine = await getOfflineStorageSummary(USER);
  const theirs = await getOfflineStorageSummary('someone-else');
  check('S12: the summary counts the failure with its reason, for this writer only', mine.pending === 1 && mine.failed === 1 && /Trash/.test(mine.failedReason ?? '') && theirs.pending === 0 && theirs.failed === 0, JSON.stringify({ mine, theirs }));
}

// ── MIG: the Rune 2.0 canonical cutover lands while a write is queued offline.
//    PAGE is a non-canonical sibling in a canonical chapter, so the approved
//    mapping (architecture doc §42) makes it an Unplaced Scene. pending_writes
//    and pending_writing_credits carry only the Page ID (no chapter), so the
//    replay must land on the SAME row with no ID remapping. `bumpVersion`
//    models a data step that failed to suppress the version trigger.
async function migration(tag, bumpVersion) {
  resetServer();
  const row = createServerPage(PAGE, { wordCount: 380, content: doc(380, 'alt') });
  Object.assign(server.scenes.get(PAGE), { chapter_id: 'ch-canon' });
  await cacheScene({
    id: PAGE, chapter_id: 'ch-canon', title: 'Page 2', content: row.content, word_count: 380,
    position: 1, manuscript_id: 'ms-1', version: 1, created_at: row.updated_at, updated_at: row.updated_at,
  }, 'proj-1');

  // Offline: typing queues locally and banks a writing credit.
  await writeToPendingQueue(PAGE, USER, doc(395, 'alt'), 395);
  await storeOfflineWritingCredit('proj-1', PAGE, 15);
  const db = await getOfflineDB();
  const pendingKeys = await db.getAllKeys('pending_writes');
  const creditPages = (await db.getAll('pending_writing_credits')).map((c) => c.pageId); // legacy serialized field name
  check(`${tag}: queued write and credit are keyed by the Page ID only`,
    JSON.stringify(pendingKeys) === JSON.stringify([PAGE]) && JSON.stringify(creditPages) === JSON.stringify([PAGE]),
    JSON.stringify({ pendingKeys, creditPages }));

  // The cutover runs on the server while this client is offline.
  applyPlacementMigration(PAGE, { chapterId: null, bumpVersion });
  const idsAfterMigration = [...server.scenes.keys()];

  // Reconnect.
  const flushResult = await flushPendingQueue();
  const saves = server.log.filter((l) => l.op === 'save_scene_checked');
  const serverRow = server.scenes.get(PAGE);
  check(`${tag}: replay uploads with no conflict`, flushResult.synced === 1 && flushResult.conflicts === 0 && flushResult.failed === 0, JSON.stringify(flushResult));
  check(`${tag}: exactly one save, addressed to the same Page ID`, saves.length === 1 && saves[0].id === PAGE, JSON.stringify(saves.map((l) => l.id)));
  check(`${tag}: the Scene holds the queued prose`, serverRow.word_count === 395 && JSON.stringify(serverRow.content) === JSON.stringify(doc(395, 'alt')), serverRow.word_count);
  check(`${tag}: no row created or re-identified`, JSON.stringify([...server.scenes.keys()]) === JSON.stringify(idsAfterMigration) && idsAfterMigration.length === 1, JSON.stringify([...server.scenes.keys()]));
  check(`${tag}: saving does not re-place the Scene`, serverRow.chapter_id === null, serverRow.chapter_id);
  check(`${tag}: queue empty`, (await getPending()) === null, '');
  check(`${tag}: writing credit applied to the same Page ID and Project`,
    recordWordsWrittenCalls.length === 1 && recordWordsWrittenCalls[0].sceneId === PAGE && recordWordsWrittenCalls[0].projectId === 'proj-1' && recordWordsWrittenCalls[0].words === 15,
    JSON.stringify(recordWordsWrittenCalls));
  const cache = await getCache();
  check(`${tag}: confirmed baseline advanced on the same cache key`, cache?.serverWordCount === 395, cache?.serverWordCount);
}


// ── Reliability pass (2026-10-12): the false "Changed elsewhere" ─────────────
// The open editor syncs with the 'tab' baseline (tabBaseline.ts). Each case
// below is a way this tab's OWN save used to be read as a change made
// elsewhere, or a genuine one that must still be caught.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const saves = () => server.log.filter((l) => l.op === 'save_scene_checked');

// Opens the Scene as the writing surface does: a fresh server read, cached.
async function openFresh(id = PAGE) {
  const row = server.scenes.get(id);
  await cacheScene({
    id, chapter_id: 'ch-1', title: 'Page 1', content: row.content,
    word_count: row.word_count, position: 0, manuscript_id: 'ms-1', version: row.version,
    created_at: row.updated_at, updated_at: row.updated_at,
  }, 'proj-1');
}

// FC1 — the reported bug: typing continues while save A is in flight; A is
// acknowledged with newer typing still queued; save B must not conflict.
async function fc1() {
  resetServer();
  createServerPage(PAGE, { wordCount: 100, content: doc(100) });
  await openFresh();
  await writeToPendingQueue(PAGE, USER, doc(150), 150);
  server.rpcMode = 'hang';
  const a = syncPendingWrite(PAGE, 'online', 'tab');
  await sleep(20);
  await writeToPendingQueue(PAGE, USER, doc(170), 170); // typing continues
  server.rpcMode = 'ok';
  releaseHang();
  await a;
  // Coalescing is not involved: B is a separate, later debounce.
  check('FC1: A acknowledged, newer typing still queued', server.scenes.get(PAGE).word_count === 150 && (await getPending())?.wordCount === 170, '');
  check('FC1: tab baseline moved to the acknowledged save', getTabBaseline(PAGE)?.wordCount === 150, JSON.stringify(getTabBaseline(PAGE)));
  await syncPendingWrite(PAGE, 'online', 'tab'); // save B
  const p = await getPending();
  check('FC1: save B is not a conflict', p === null, JSON.stringify({ st: p?.syncStatus }));
  check('FC1: server holds the newest text', server.scenes.get(PAGE).word_count === 170, server.scenes.get(PAGE).word_count);
  check('FC1: exactly two saves', saves().length === 2, saves().length);
}

// FC2 — save B is requested while save A is still in flight: B is not
// dropped onto A's promise; a follow-up sends it as soon as A lands.
async function fc2() {
  resetServer();
  createServerPage(PAGE, { wordCount: 100, content: doc(100) });
  await openFresh();
  await writeToPendingQueue(PAGE, USER, doc(150), 150);
  server.rpcMode = 'hang';
  const a = syncPendingWrite(PAGE, 'online', 'tab');
  await sleep(20);
  await writeToPendingQueue(PAGE, USER, doc(170), 170);
  const b = syncPendingWrite(PAGE, 'online', 'tab'); // arrives during A
  const c = syncPendingWrite(PAGE, 'offline_sync');  // the background flush too
  check('FC2: later callers share one follow-up', b === c, '');
  server.rpcMode = 'ok';
  releaseHang();
  await Promise.all([a, b, c]);
  const p = await getPending();
  check('FC2: follow-up saved the newer text without another keystroke', p === null && server.scenes.get(PAGE).word_count === 170, JSON.stringify({ st: p?.syncStatus, server: server.scenes.get(PAGE).word_count }));
  check('FC2: two saves, in order, no conflict', JSON.stringify(saves().map((l) => l.words)) === '[150,170]', JSON.stringify(saves().map((l) => l.words)));
}

// FC3 — the 30-second background flush uploads the open editor's queued row;
// the editor's next save must not read that upload as someone else's.
async function fc3() {
  resetServer();
  createServerPage(PAGE, { wordCount: 100, content: doc(100) });
  await openFresh();
  await writeToPendingQueue(PAGE, USER, doc(120), 120);
  const flushed = await flushPendingQueue();
  check('FC3: flush uploaded the editor row', flushed.synced === 1, JSON.stringify(flushed));
  await writeToPendingQueue(PAGE, USER, doc(130), 130);
  await syncPendingWrite(PAGE, 'online', 'tab');
  check('FC3: editor save after a flush upload is not a conflict', (await getPending()) === null && server.scenes.get(PAGE).word_count === 130, (await getPending())?.syncStatus);
}

// FC4 — a sibling tab of this browser uploaded THIS tab's queued words (its
// flush picked up the shared row). This tab's baseline is stale, but the
// server holds its own words: no conflict. The same upload of words typed in
// the OTHER tab is a genuine two-tab divergence and must still conflict.
const fc4 = () => siblingUpload(TAB_ID);
const fc11 = () => siblingUpload('another-tab');
async function siblingUpload(writer) {
  {
    resetServer();
    createServerPage(PAGE, { wordCount: 100, content: doc(100) });
    await openFresh();
    const db = await getOfflineDB();
    await db.delete('pending_writes', PAGE);
    // The sibling tab's flush: server save + the shared cache it confirms.
    const r = await saveSceneCheckedDirect(doc(140, writer === TAB_ID ? 'w' : 'x'), 140);
    const cache = await getCache();
    await db.put('page_cache', { ...cache, serverWordCount: 140, serverVersion: r.version, serverContent: doc(140), serverWriterTab: writer });
    await writeToPendingQueue(PAGE, USER, doc(145), 145);
    await syncPendingWrite(PAGE, 'online', 'tab');
    const p = await getPending();
    if (writer === TAB_ID) {
      check('FC4: own words uploaded by a sibling tab are not a conflict', p === null && server.scenes.get(PAGE).word_count === 145, p?.syncStatus);
    } else {
      check('FC4: another tab\'s words still conflict', p?.syncStatus === 'conflict' && server.scenes.get(PAGE).word_count === 140, p?.syncStatus);
    }
  }
}
async function saveSceneCheckedDirect(content, words) {
  const row = server.scenes.get(PAGE);
  tick(500);
  row.content = content; row.word_count = words; row.version += 1; row.updated_at = nowIso();
  return { version: row.version };
}

// FC5 — genuine remote edits through the 'tab' path.
async function fc5() {
  // (a) another device changed the Scene while local words are queued → conflict, nothing overwritten.
  resetServer();
  createServerPage(PAGE, { wordCount: 100, content: doc(100) });
  await openFresh();
  await writeToPendingQueue(PAGE, USER, doc(110), 110);
  remoteContentSave(PAGE, doc(300, 'remote'), 300);
  await syncPendingWrite(PAGE, 'online', 'tab');
  let p = await getPending();
  check('FC5a: remote edit + local queued words → conflict', p?.syncStatus === 'conflict', p?.syncStatus);
  check('FC5a: remote text not overwritten, local text kept', server.scenes.get(PAGE).word_count === 300 && p?.wordCount === 110, '');
  // Typing on while conflicted keeps the conflict and the newest words.
  await writeToPendingQueue(PAGE, USER, doc(112), 112);
  await syncPendingWrite(PAGE, 'online', 'tab');
  p = await getPending();
  check('FC5a: still a conflict after more typing, newest words kept', p?.syncStatus === 'conflict' && p?.wordCount === 112, JSON.stringify({ st: p?.syncStatus, wc: p?.wordCount }));
}

// (Each case runs in its own process: server versions restart per reset, but
// a tab's knowledge of a Scene's version, like the real server's, never goes back.)
async function fc8() {
  let p;
  // (b) remote edit with identical word count, local words queued → conflict (content check).
  resetServer();
  createServerPage(PAGE, { wordCount: 100, content: doc(100) });
  await openFresh();
  await writeToPendingQueue(PAGE, USER, doc(105), 105);
  await syncPendingWrite(PAGE, 'online', 'tab');
  remoteContentSave(PAGE, doc(105, 'other'), 105);
  await writeToPendingQueue(PAGE, USER, doc(106), 106);
  await syncPendingWrite(PAGE, 'online', 'tab');
  p = await getPending();
  check('FC5b: same-count remote edit → conflict', p?.syncStatus === 'conflict', p?.syncStatus);
}

async function fc9() {
  // (c) remote edit, then this tab re-reads the Scene before typing (no local
  //     divergence): the fresh read becomes the baseline → no conflict.
  resetServer();
  createServerPage(PAGE, { wordCount: 100, content: doc(100) });
  await openFresh();
  remoteContentSave(PAGE, doc(200, 'remote'), 200);
  await openFresh();
  await writeToPendingQueue(PAGE, USER, doc(201, 'remote'), 201);
  await syncPendingWrite(PAGE, 'online', 'tab');
  check('FC5c: remote edit read before typing → saves, no conflict', (await getPending()) === null && server.scenes.get(PAGE).word_count === 201, '');
}

async function fc10() {
  // (d) a rename (metadata-only version bump) after this tab's save → no conflict.
  resetServer();
  createServerPage(PAGE, { wordCount: 100, content: doc(100) });
  await openFresh();
  await writeToPendingQueue(PAGE, USER, doc(101), 101);
  await syncPendingWrite(PAGE, 'online', 'tab');
  metadataUpdate(PAGE);
  await writeToPendingQueue(PAGE, USER, doc(102), 102);
  await syncPendingWrite(PAGE, 'online', 'tab');
  check('FC5d: rename after own save → no conflict', (await getPending()) === null && server.scenes.get(PAGE).word_count === 102, '');
}

// FC6 — ordering of what this tab knows: an older observation arriving late
// never replaces a newer one; queue revisions strictly increase.
async function fc6() {
  resetServer();
  noteServerState('x', 500, 7);
  noteServerState('x', 400, 5); // a slow read from before save 7
  check('FC6: older server state arriving late is ignored', getTabBaseline('x')?.wordCount === 500, JSON.stringify(getTabBaseline('x')));
  createServerPage(PAGE);
  const stamps = [];
  for (let k = 0; k < 5; k++) {
    await writeToPendingQueue(PAGE, USER, doc(k + 1), k + 1);
    stamps.push((await getPending()).localUpdatedAt);
  }
  check('FC6: queue revisions strictly increase within a millisecond', stamps.every((t, k) => k === 0 || t > stamps[k - 1]), JSON.stringify(stamps));
  check('FC6: rows carry the writing tab', (await getPending()).writerTab === TAB_ID, '');
}

// FC7 — offline writing, then reconnect replay, then connection flapping.
async function fc7() {
  resetServer();
  createServerPage(PAGE, { wordCount: 100, content: doc(100) });
  await openFresh();
  // Offline: keystrokes are queued; nothing reaches the server.
  for (let k = 1; k <= 20; k++) await writeToPendingQueue(PAGE, USER, doc(100 + k), 100 + k);
  check('FC7: offline words queued, server untouched', (await getPending())?.wordCount === 120 && saves().length === 0, '');
  // Flapping: the first reconnect attempts fail in transit.
  server.fetchMode = 'network_error';
  const errs = []; const orig = console.error; console.error = (...a) => errs.push(a.join(' '));
  await syncPendingWrite(PAGE, 'online', 'tab');
  await writeToPendingQueue(PAGE, USER, doc(125), 125);
  await syncPendingWrite(PAGE, 'online', 'tab');
  console.error = orig;
  let p = await getPending();
  check('FC7: a failed attempt keeps the newest words queued, not conflicted', p?.wordCount === 125 && p?.syncStatus !== 'conflict', JSON.stringify({ st: p?.syncStatus, wc: p?.wordCount }));
  // Back online: the editor (reconnect) and the flush both replay.
  server.fetchMode = 'ok';
  const [r1] = await Promise.all([flushPendingQueue(), syncPendingWrite(PAGE, 'online', 'tab')]);
  p = await getPending();
  check('FC7: replay saved everything, no conflict', p === null && server.scenes.get(PAGE).word_count === 125 && r1.conflicts === 0, JSON.stringify({ st: p?.syncStatus, r1 }));
  check('FC7: replay sent one save (no duplicate)', saves().length === 1, saves().length);
  check('FC7: one Scene row, never a copy', server.scenes.size === 1, server.scenes.size);
  // Flap again mid-writing.
  await writeToPendingQueue(PAGE, USER, doc(126), 126);
  server.fetchMode = 'network_error';
  console.error = () => {};
  await flushPendingQueue();
  console.error = orig;
  server.fetchMode = 'ok';
  await writeToPendingQueue(PAGE, USER, doc(127), 127);
  await syncPendingWrite(PAGE, 'online', 'tab');
  check('FC7: after a second flap, newest words saved, no conflict', (await getPending()) === null && server.scenes.get(PAGE).word_count === 127, '');
}

// FC12 — a stale queue row (its Scene permanently deleted) and a Scene in
// Trash never block an unrelated current save in the same flush.
async function fc12() {
  resetServer();
  createServerPage('gone', { wordCount: 10, content: doc(10) });
  createServerPage('trashed', { wordCount: 10, content: doc(10) });
  createServerPage(PAGE, { wordCount: 100, content: doc(100) });
  for (const id of ['gone', 'trashed', PAGE]) await openFresh(id);
  await writeToPendingQueue('gone', USER, doc(12), 12);
  await writeToPendingQueue('trashed', USER, doc(14), 14);
  await writeToPendingQueue(PAGE, USER, doc(120), 120);
  deleteServerScene('gone');
  trashServerScene('trashed');
  const warn = console.warn; const err = console.error; console.warn = () => {}; console.error = () => {};
  const r = await flushPendingQueue();
  console.warn = warn; console.error = err;
  const db = await getOfflineDB();
  const gone = await db.get('pending_writes', 'gone');
  const trashed = await db.get('pending_writes', 'trashed');
  check('FC12: the live Scene saved despite stale rows ahead of it', (await getPending()) === null && server.scenes.get(PAGE).word_count === 120, JSON.stringify(r));
  check('FC12: the deleted Scene\'s unsent words kept as retired, never dropped', gone?.syncStatus === 'retired' && gone?.wordCount === 12, gone?.syncStatus);
  check('FC12: the trashed Scene\'s words wait (failed, retried after restore)', trashed?.syncStatus === 'failed' && trashed?.wordCount === 14, trashed?.syncStatus);
  restoreServerScene('trashed');
  console.error = () => {};
  await flushPendingQueue();
  console.error = err;
  check('FC12: restored Scene receives its queued words', server.scenes.get('trashed').word_count === 14 && !(await db.get('pending_writes', 'trashed')), '');
}

// FC13 — the background flush leaves a recent row typed in ANOTHER tab to
// that tab's editor (it could be words over an older version than this tab's
// baseline knows); a stale one (tab closed) and a writer-initiated flush send it.
async function fc13() {
  resetServer();
  createServerPage(PAGE, { wordCount: 100, content: doc(100) });
  await openFresh();
  await writeToPendingQueue(PAGE, USER, doc(90, 'x'), 90);
  const db = await getOfflineDB();
  const row = await db.get('pending_writes', PAGE);
  await db.put('pending_writes', { ...row, writerTab: 'another-tab' });
  let r = await flushPendingQueue();
  check('FC13: a recent row of another tab is not sent by this tab\'s flush', saves().length === 0 && (await getPending())?.syncStatus === 'pending', JSON.stringify(r));
  r = await flushPendingQueue({ includeUnsupported: true });
  check('FC13: a writer-initiated flush (Send now / logout) sends it', saves().length === 1 && (await getPending()) === null, JSON.stringify(r));
  await writeToPendingQueue(PAGE, USER, doc(95, 'x'), 95);
  const row2 = await db.get('pending_writes', PAGE);
  await db.put('pending_writes', { ...row2, writerTab: 'closed-tab', localUpdatedAt: Date.now() - 3 * 60 * 1000 });
  r = await flushPendingQueue();
  check('FC13: a row left by a closed tab (older than the grace) is sent', saves().length === 2 && (await getPending()) === null, JSON.stringify(r));
}

// FC14 — this tab's own row, picked up by this tab's background flush after
// ANOTHER tab saved a newer version: judged against this tab's baseline, it
// is a conflict (the shared cache already holds the other tab's save, and
// against it these words would look unchanged and overwrite it).
async function fc14() {
  resetServer();
  createServerPage(PAGE, { wordCount: 100, content: doc(100) });
  await openFresh();
  const r = await saveSceneCheckedDirect(doc(140, 'x'), 140);
  const db = await getOfflineDB();
  const cache = await getCache();
  await db.put('page_cache', { ...cache, serverWordCount: 140, serverVersion: r.version, serverContent: doc(140, 'x'), serverWriterTab: 'another-tab' });
  await writeToPendingQueue(PAGE, USER, doc(103), 103); // typed here, on the 100-word version
  const warn = console.warn; console.warn = () => {};
  const res = await flushPendingQueue();
  console.warn = warn;
  const p = await getPending();
  check('FC14: own row over another tab\'s newer save → conflict from the flush too', p?.syncStatus === 'conflict' && res.conflicts === 1, JSON.stringify(res));
  check('FC14: the other tab\'s save is not overwritten', server.scenes.get(PAGE).word_count === 140, server.scenes.get(PAGE).word_count);
}

// FC15 — a sibling tab of this browser saved words typed THERE at the same
// word count as this tab's baseline (two-tab edits that each swap one word;
// or the other tab's "Keep yours"). The shared cache now holds that save, not
// this tab's confirmed copy, so no content comparison is possible: this tab's
// next save is a conflict, never a silent overwrite (reproduced live, 2026-10-14).
// A rename after this tab's own save (fc10) and this tab's own words uploaded
// by the sibling (fc4) stay conflict-free.
async function fc15() {
  resetServer();
  createServerPage(PAGE, { wordCount: 100, content: doc(100) });
  await openFresh();
  await writeToPendingQueue(PAGE, USER, doc(107, 'mine'), 107);
  await syncPendingWrite(PAGE, 'online', 'tab');
  check('FC15: this tab saved first', (await getPending()) === null && server.scenes.get(PAGE).word_count === 107, '');
  // The sibling tab's save (its editor, flush or Keep Local), same count.
  const r = await saveSceneCheckedDirect(doc(107, 'theirs'), 107);
  const db = await getOfflineDB();
  const cache = await getCache();
  await db.put('page_cache', { ...cache, serverWordCount: 107, serverVersion: r.version, serverContent: doc(107, 'theirs'), serverWriterTab: 'another-tab' });
  await writeToPendingQueue(PAGE, USER, doc(108, 'mine'), 108);
  const warn = console.warn; console.warn = () => {};
  await syncPendingWrite(PAGE, 'online', 'tab');
  console.warn = warn;
  const p = await getPending();
  check('FC15: same-count save from another tab → conflict', p?.syncStatus === 'conflict', p?.syncStatus);
  check('FC15: the other tab\'s save is not overwritten', JSON.stringify(server.scenes.get(PAGE).content) === JSON.stringify(doc(107, 'theirs')), '');
  check('FC15: this tab\'s words are kept', p?.wordCount === 108, p?.wordCount);
}

// NC1 — a Scene just created by "+ Scene" (or an empty Chapter's "Start
// writing"): the server returns the empty Scene, the shell caches it, and its
// editor appears and takes focus. The writer's first words then save through
// the ordinary path: no conflict against the empty server copy, one Scene row,
// and a reload (a fresh read) shows them. Typing on after the reload saves too.
async function nc1() {
  resetServer();
  createServerPage(PAGE); // insert_scene_checked: an empty Scene, version 1
  await openFresh(); // AddSceneAction / startChapter: cacheScene(r.data)
  await writeToPendingQueue(PAGE, USER, doc(12, 'first'), 12);
  await syncPendingWrite(PAGE, 'online', 'tab');
  check('NC1: first words in a new Scene save, no conflict', (await getPending()) === null && server.scenes.get(PAGE).word_count === 12, (await getPending())?.syncStatus);
  check('NC1: the saved text is the typed text', JSON.stringify(server.scenes.get(PAGE).content) === JSON.stringify(doc(12, 'first')), '');
  check('NC1: one Scene row, never a copy', server.scenes.size === 1, server.scenes.size);
  await openFresh(); // reload
  check('NC1: a reload reads the typed text back', (await getCache())?.serverWordCount === 12 && JSON.stringify((await getCache())?.content) === JSON.stringify(doc(12, 'first')), '');
  await writeToPendingQueue(PAGE, USER, doc(15, 'first'), 15);
  await syncPendingWrite(PAGE, 'online', 'tab');
  check('NC1: writing on after the reload saves, no conflict', (await getPending()) === null && server.scenes.get(PAGE).word_count === 15, '');
  check('NC1: two saves in all', saves().length === 2, saves().length);
}

const mig = () => migration('MIG', false);
const migbump = () => migration('MIGBUMP', true);

const scenarios = { r1, r2, r3, r6, r7, g1, g2, g3, w, f, i, m, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12, kl, klrace, klext, klrepeat, klmeta, klserver, mig, migbump, fc1, fc2, fc3, fc4, fc5, fc6, fc7, fc8, fc9, fc10, fc11, fc12, fc13, fc14, fc15, nc1 };
const name = process.env.SCENARIO;
if (!scenarios[name]) { console.error('unknown scenario', name); process.exit(2); }
await scenarios[name]();

let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '   [' + r.detail + ']' : ''}`);
}
process.exit(failed ? 1 : 0);
