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
} from '@/lib/offline/syncEngine';
import { getOfflineDB, cachePage } from '@/lib/offline/db';
import {
  server, resetServer, createServerPage, metadataUpdate, remoteContentSave, releaseHang, releaseFetchHang,
} from './mocks/serverState.js';

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
  await cachePage(
    {
      id: PAGE, chapter_id: 'ch-1', title: 'Page 1', content: null,
      word_count: 0, position: 0, is_canonical: false,
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
  const serverRow = server.pages.get(PAGE);
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
  const serverRow = server.pages.get(PAGE);
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
  const serverRow = server.pages.get(PAGE);
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
  const serverRow = server.pages.get(PAGE);
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
  check('G1: baseline sync ok (server 500)', server.pages.get(PAGE).word_count === 500, '');

  // another device writes different content (620 words)
  remoteContentSave(PAGE, doc(620, 'remote'), 620);

  // this tab edits from the old baseline and syncs (editor path, expected=500)
  await writeToPendingQueue(PAGE, USER, doc(510), 510);
  await syncPendingWrite(PAGE, 'online', 500);
  let pending = await getPending();
  check('G1: editor path flags genuine conflict', pending?.syncStatus === 'conflict', pending?.syncStatus);
  check('G1: remote content NOT overwritten', server.pages.get(PAGE).word_count === 620, '');

  // flush path re-evaluates: still a genuine conflict (confirmed baseline 500 ≠ server 620)
  const flushResult = await flushPendingQueue();
  pending = await getPending();
  check('G1: flush re-confirms genuine conflict (no silent overwrite)', pending?.syncStatus === 'conflict' && flushResult.synced === 0, JSON.stringify(flushResult));

  // Keep Local force-write wins explicitly
  const res = await forceWriteLocalContent(PAGE);
  check('G1: Keep Local force-writes and verifies', res.status === 'ok' && res.wordCount === 510, JSON.stringify(res));
  check('G1: server now holds kept local version', server.pages.get(PAGE).word_count === 510, '');
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
  check('G2: remote content preserved', JSON.stringify(server.pages.get(PAGE).content).includes('other0'), '');
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
  check('G3: server has newest content', server.pages.get(PAGE).word_count === 505, '');
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
  check('W: server unchanged', server.pages.get(PAGE).word_count === 0, '');
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
  const serverRow = server.pages.get(PAGE);
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
  const serverRow = server.pages.get(PAGE);
  const saves = server.log.filter(l => l.op === 'save_page_checked').length;
  check('I: content correct after repeated sync calls', serverRow.word_count === 300, '');
  check('I: exactly one server save issued', saves === 1, 'saves=' + saves);
  check('I: queue empty, no duplication', (await getPending()) === null, '');
}

// ── M: stale queue entry for a deleted/inaccessible page — accurate
//    classification, prose preserved, no opaque coercion error
async function m() {
  resetServer();
  // NO server page created — simulates a pending row whose page was deleted
  const db = await getOfflineDB();
  await db.put('pending_writes', {
    id: PAGE, userId: USER, content: doc(650), wordCount: 650,
    localUpdatedAt: Date.now(), syncStatus: 'pending', retryCount: 0,
  });
  const errs = [];
  const origError = console.error;
  console.error = (...a) => errs.push(a.join(' '));
  await syncPendingWrite(PAGE, 'online');
  console.error = origError;
  const pending = await getPending();
  check('M: missing server row classified as failed (not conflict, not deleted)',
    pending?.syncStatus === 'failed', pending?.syncStatus);
  check('M: precise reason recorded — no coercion message',
    pending?.lastError?.includes('deleted or is not accessible') && !pending?.lastError?.includes('coerce'),
    pending?.lastError);
  check('M: log line includes the page id', errs.some(e => e.includes(PAGE)), JSON.stringify(errs));
  check('M: prose preserved in queue', pending?.wordCount === 650, '');
  // flush retries it without crashing and without changing classification
  const flushResult = await flushPendingQueue();
  const after = await getPending();
  check('M: flush retry keeps accurate failed state', after?.syncStatus === 'failed' && flushResult.failed === 1, JSON.stringify(flushResult));
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
  check('KL: acknowledged baseline synced (server 40w)', server.pages.get(PAGE).word_count === 40, '');

  // Local and server diverge → a legitimate conflict is presented.
  remoteContentSave(PAGE, doc(55, 'remote'), 55);
  await writeToPendingQueue(PAGE, USER, doc(41), 41);
  await syncPendingWrite(PAGE, 'online', 40); // editor path, confirmed baseline 40
  check('KL: legitimate conflict presented', (await getPending())?.syncStatus === 'conflict', '');

  // User chooses Keep Local — force-write succeeds and returns the new version.
  const res = await forceWriteLocalContent(PAGE);
  const keptVersion = server.pages.get(PAGE).version;
  check('KL: Keep Local succeeds, returns kept word count', res.status === 'ok' && res.wordCount === 41, JSON.stringify(res));
  check('KL: server now holds kept-local content (41w)', server.pages.get(PAGE).word_count === 41, '');
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
  check('KL: new local edit persisted (42w)', server.pages.get(PAGE).word_count === 42, '');
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
  check('KLRACE: server holds kept-local content (41w)', server.pages.get(PAGE).word_count === 41, server.pages.get(PAGE).word_count);
  const cache = await getCache();
  check('KLRACE: confirmed baseline == committed server version',
    cache?.serverWordCount === 41 && cache?.serverVersion === server.pages.get(PAGE).version,
    JSON.stringify({ w: cache?.serverWordCount, cv: cache?.serverVersion, sv: server.pages.get(PAGE).version }));
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
  check('KLEXT: external content not overwritten', server.pages.get(PAGE).word_count === 70, '');
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
  check('KLREPEAT: final content persisted (46w)', server.pages.get(PAGE).word_count === 46, '');
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
  check('KLMETA: server has newest content (42w)', server.pages.get(PAGE).word_count === 42, '');
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
  const srv = server.pages.get(PAGE);
  const db = await getOfflineDB();
  await db.delete('pending_writes', PAGE);
  await db.put('page_cache', {
    id: PAGE, content: srv.content, wordCount: srv.word_count,
    serverUpdatedAt: srv.updated_at, serverVersion: srv.version,
    serverWordCount: srv.word_count, serverContent: srv.content, cachedAt: Date.now(),
  });

  // Edit the kept server content and sync — must not false-conflict.
  await writeToPendingQueue(PAGE, USER, doc(56, 'remote'), 56);
  const f = await flushPendingQueue();
  check('KLSERVER: edit after Keep Server syncs with no false conflict',
    f.synced === 1 && f.conflicts === 0, JSON.stringify(f));
  check('KLSERVER: server advanced from the kept baseline (56w)', server.pages.get(PAGE).word_count === 56, '');
}

const scenarios = { r1, r2, r3, r6, r7, g1, g2, g3, w, f, i, m, kl, klrace, klext, klrepeat, klmeta, klserver };
const name = process.env.SCENARIO;
if (!scenarios[name]) { console.error('unknown scenario', name); process.exit(2); }
await scenarios[name]();

let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '   [' + r.detail + ']' : ''}`);
}
process.exit(failed ? 1 : 0);
