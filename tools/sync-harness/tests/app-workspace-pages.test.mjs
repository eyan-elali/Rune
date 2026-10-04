// Workspace Pages (Rune 2.0 Workspace, Milestone 6, migration 023): the REAL
// Workspace Page actions and loader against the Rune 2.0 schema in real
// Postgres + RLS, the Page save engine (lib/rune2/workspacePageSaver.ts) with
// deterministic timers, and the shell rules that let a Page join the working
// set by id.
//
//   * creation, loading/reopening, content save (version-checked), rename
//   * ownership isolation: another writer can't read, create, save or rename;
//     no client DELETE at all (Trash doesn't exist yet); a Page never changes
//     Project; the database owns version and timestamps
//   * the manuscript is untouched by any of it: Scenes, Chapters, totals,
//     account_word_total and writing history
//   * the save engine: debounce, one save in flight, typing during a save,
//     conflicts, retries, recovery of unsaved device copies
//   * a Page opens in at most one tab
//
// Data: the synthetic legacy fixture moved into the Rune 2.0 schema
// (lib/legacy-to-rune2.mjs). alice owns hollow and ash; bram owns tide.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, readRepoFile, asUser, LEGACY_BASELINE, RUNE2_SCHEMA } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';
import { prototypeLegacyToRune2 } from '../lib/legacy-to-rune2.mjs';
import { USERS, projectId, seedFixture } from '../fixtures/manuscript-fixture.mjs';

const ALICE = USERS.alice.id;
const BRAM = USERS.bram.id;
const HOLLOW = projectId('hollow');
const TIDE = projectId('tide');

const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const all = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const doc = (...paragraphs) => ({
  type: 'doc',
  content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
});

let legacy;
let pages, workspace, scenes, saverMod, model, target, ws;
before(async () => {
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
  pages = await bundleForTest('src/lib/actions/workspacePages.ts', { name: 'ws_pages' });
  workspace = await bundleForTest('src/lib/rune2/projectWorkspace.ts', { name: 'ws_loader' });
  scenes = await bundleForTest('src/lib/actions/scenes.ts', { name: 'ws_scenes' });
  saverMod = await bundleForTest('src/lib/rune2/workspacePageSaver.ts', { name: 'ws_saver' });
  model = await bundleForTest('src/lib/rune2/navigatorModel.ts', { name: 'ws_model' });
  target = await bundleForTest('src/lib/rune2/writingTarget.ts', { name: 'ws_target' });
  ws = await bundleForTest('src/lib/rune2/workingSet.ts', { name: 'ws_working_set' });
});

async function seededDb() {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  await prototypeLegacyToRune2(legacy, db);
  return db;
}

function signIn(db, userId) {
  const sb = createSupabaseAdapter(db, { userId });
  for (const mod of [pages, workspace, scenes]) mod.setServerClient(sb);
  return sb;
}

const ok = (r) => { assert.equal(r.error, null, r.error); return r.data; };

/** Everything the manuscript is: structure, prose, totals, history, account totals. */
async function manuscriptState(db) {
  return {
    projects: await all(db, `select id, word_count, updated_at from public.projects order by id`),
    manuscripts: await all(db, `select * from public.manuscripts order by id`),
    groups: await all(db, `select * from public.manuscript_groups order by id`),
    chapters: await all(db, `select * from public.chapters order by id`),
    scenes: await all(db, `select * from public.scenes order by id`),
    sessions: await all(db, `select * from public.writing_sessions order by id`),
    accountTotals: {
      alice: await asUser(db, ALICE, async (tx) => (await tx.query(`select public.account_word_total() as n`)).rows[0].n),
      bram: await asUser(db, BRAM, async (tx) => (await tx.query(`select public.account_word_total() as n`)).rows[0].n),
    },
  };
}

// ── 1. creation, loading, saving, renaming ─────────────────────────────────────

test('create: an empty, untitled Page in the writer\'s Project, at version 1; titles are trimmed, blank is untitled', async () => {
  const db = await seededDb();
  signIn(db, ALICE);

  const page = ok(await pages.createWorkspacePage(HOLLOW));
  assert.equal(page.project_id, HOLLOW);
  assert.equal(page.title, null);
  assert.equal(page.version, 1);
  assert.deepEqual(page.content, { type: 'doc', content: [] });

  assert.equal(ok(await pages.createWorkspacePage(HOLLOW, '  Ending Ideas  ')).title, 'Ending Ideas');
  assert.equal(ok(await pages.createWorkspacePage(HOLLOW, '   ')).title, null);
  assert.equal(ok(await pages.createWorkspacePage(HOLLOW, 'x'.repeat(300))).title.length, 200);

  // Not in `pages` (production's manuscript table), not in `scenes`.
  assert.equal(await one(db, `select to_regclass('public.pages') as t`).then((r) => r.t), null);
  assert.equal((await one(db, `select count(*)::int as n from public.scenes where id = $1`, [page.id])).n, 0);
});

test('load and reopen: the Project\'s Pages in creation order, titles only; a Page reopens with its saved content', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  // PGlite's clock has millisecond resolution (real Postgres: microseconds);
  // a tick apart, so creation order is what created_at records.
  const tick = () => new Promise((r) => setTimeout(r, 3));
  const a = ok(await pages.createWorkspacePage(HOLLOW, 'Magic System'));
  await tick();
  const b = ok(await pages.createWorkspacePage(HOLLOW, null));
  await tick();
  const c = ok(await pages.createWorkspacePage(HOLLOW, 'Research'));
  ok(await pages.createWorkspacePage(projectId('ash'), 'Elsewhere'));

  const { pages: list } = await workspace.loadProjectWorkspace(HOLLOW);
  assert.deepEqual(list.map((p) => p.id), [a.id, b.id, c.id]);
  assert.deepEqual(Object.keys(list[0]).sort(), ['created_at', 'id', 'title', 'updated_at'], 'never content');

  const saved = await pages.saveWorkspacePageContent(a.id, doc('Runes cost memory.'), 1);
  assert.equal(saved.status, 'ok');
  const reopened = ok(await pages.getWorkspacePage(a.id));
  assert.deepEqual(reopened.content, doc('Runes cost memory.'));
  assert.equal(reopened.version, 2);
});

test('save: conditional on the version; a stale save writes nothing and reports the current version', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const page = ok(await pages.createWorkspacePage(HOLLOW, 'Notes'));

  const first = await pages.saveWorkspacePageContent(page.id, doc('one'), 1);
  assert.equal(first.status, 'ok');
  assert.equal(first.version, 2);
  const second = await pages.saveWorkspacePageContent(page.id, doc('one', 'two'), 2);
  assert.equal(second.version, 3);

  // Another window still on version 2.
  const stale = await pages.saveWorkspacePageContent(page.id, doc('elsewhere'), 2);
  assert.deepEqual(stale, { status: 'conflict', version: 3 });
  assert.deepEqual(ok(await pages.getWorkspacePage(page.id)).content, doc('one', 'two'));

  // Invalid content is refused before reaching the database.
  assert.equal((await pages.saveWorkspacePageContent(page.id, { type: 'paragraph' }, 3)).status, 'error');
  assert.equal((await pages.saveWorkspacePageContent(page.id, doc('x'), 1.5)).status, 'error');
  assert.equal(ok(await pages.getWorkspacePage(page.id)).version, 3);
});

test('rename: title only — never the version or content, so a rename can\'t make a content save conflict', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const page = ok(await pages.createWorkspacePage(HOLLOW, 'Draft'));
  await pages.saveWorkspacePageContent(page.id, doc('body'), 1);

  assert.deepEqual(ok(await pages.renameWorkspacePage(page.id, '  History of Drelareth ')), { title: 'History of Drelareth' });
  const after = ok(await pages.getWorkspacePage(page.id));
  assert.equal(after.version, 2, 'rename does not bump the version');
  assert.deepEqual(after.content, doc('body'));
  assert.equal((await pages.saveWorkspacePageContent(page.id, doc('body', 'more'), 2)).status, 'ok', 'the pending save still lands');

  assert.deepEqual(ok(await pages.renameWorkspacePage(page.id, '   ')), { title: null });
  assert.equal((await pages.renameWorkspacePage('00000000-0000-4000-8000-00000000dead', 'x')).error, 'Page not found');
});

test('the database owns version and timestamps: a client cannot set them', async () => {
  const db = await seededDb();
  const page = await asUser(db, ALICE, async (tx) => (await tx.query(
    `insert into public.workspace_documents (project_id, version, created_at) values ($1, 99, '2000-01-01') returning *`, [HOLLOW])).rows[0]);
  assert.equal(page.version, 1);
  assert.notEqual(new Date(page.created_at).getUTCFullYear(), 2000);
  const updated = await asUser(db, ALICE, async (tx) => (await tx.query(
    `update public.workspace_documents set version = 50, created_at = '2000-01-01', title = 'T' where id = $1 returning *`, [page.id])).rows[0]);
  assert.equal(updated.version, 1, 'a title change keeps the version');
  assert.equal(String(updated.created_at), String(page.created_at));
});

// ── 2. ownership isolation ─────────────────────────────────────────────────────

test('isolation: another writer can\'t list, read, create in, save or rename a writer\'s Pages', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const page = ok(await pages.createWorkspacePage(HOLLOW, 'Private'));
  await pages.saveWorkspacePageContent(page.id, doc('secret notes'), 1);

  signIn(db, BRAM);
  assert.deepEqual((await workspace.loadProjectWorkspace(HOLLOW)).pages, []);
  assert.equal((await pages.getWorkspacePage(page.id)).error, 'Page not found');
  assert.ok((await pages.createWorkspacePage(HOLLOW, 'Intruder')).error, 'RLS refuses a Page in another writer\'s Project');
  assert.deepEqual(await pages.saveWorkspacePageContent(page.id, doc('overwritten'), 2), { status: 'not_found' });
  assert.equal((await pages.renameWorkspacePage(page.id, 'Mine now')).error, 'Page not found');

  // Nor through a direct query.
  const direct = await asUser(db, BRAM, async (tx) => (await tx.query(
    `update public.workspace_documents set content = '{"type":"doc"}' where id = $1 returning id`, [page.id])).rows);
  assert.deepEqual(direct, []);
  // Bram's own Project works as usual.
  assert.equal(ok(await pages.createWorkspacePage(TIDE, 'Tide notes')).project_id, TIDE);

  const stored = await one(db, `select title, content, version from public.workspace_documents where id = $1`, [page.id]);
  assert.deepEqual(stored, { title: 'Private', content: doc('secret notes'), version: 2 });

  // Signed out: nothing.
  const anon = createSupabaseAdapter(db, {});
  pages.setServerClient(anon);
  assert.equal((await pages.getWorkspacePage(page.id)).error, 'Not authenticated');
});

test('no client DELETE (Trash doesn\'t exist yet); a Page never moves to another Project; deleting its Project removes it', async () => {
  const db = await seededDb();
  signIn(db, ALICE);
  const page = ok(await pages.createWorkspacePage(HOLLOW, 'Keep'));

  await assert.rejects(
    asUser(db, ALICE, (tx) => tx.query(`delete from public.workspace_documents where id = $1`, [page.id])),
    /permission denied/
  );
  await assert.rejects(
    asUser(db, ALICE, (tx) => tx.query(`update public.workspace_documents set project_id = $2 where id = $1`, [page.id, projectId('ash')])),
    /cannot move to another Project/
  );
  // Moving it into another writer's Project is refused by RLS as well.
  await assert.rejects(
    asUser(db, ALICE, (tx) => tx.query(`update public.workspace_documents set project_id = $2 where id = $1`, [page.id, TIDE])),
    /row-level security|cannot move/
  );
  assert.equal((await one(db, `select project_id from public.workspace_documents where id = $1`, [page.id])).project_id, HOLLOW);

  await db.query(`delete from public.projects where id = $1`, [HOLLOW]);
  assert.equal((await one(db, `select count(*)::int as n from public.workspace_documents where id = $1`, [page.id])).n, 0);
});

// ── 3. the manuscript is unchanged ─────────────────────────────────────────────

test('Workspace Pages never touch the manuscript: Scenes, Chapters, totals, account totals and writing history are identical', async () => {
  const db = await seededDb();
  const before = await manuscriptState(db);

  signIn(db, ALICE);
  const page = ok(await pages.createWorkspacePage(HOLLOW, 'World'));
  const long = doc(...Array.from({ length: 50 }, (_, i) => `word `.repeat(40) + i));
  assert.equal((await pages.saveWorkspacePageContent(page.id, long, 1)).status, 'ok');
  ok(await pages.renameWorkspacePage(page.id, 'World, revised'));
  signIn(db, BRAM);
  ok(await pages.createWorkspacePage(TIDE, null));

  assert.deepEqual(await manuscriptState(db), before);

  // The account total (a metric since 037) still counts Scenes only: a Page's words never reach it.
  const aliceTotal = await asUser(db, ALICE, async (tx) => (await tx.query(`select public.account_word_total() as n`)).rows[0].n);
  assert.equal(aliceTotal, before.accountTotals.alice);
});

// ── 4. the save engine ─────────────────────────────────────────────────────────

/** Deterministic timers: run() fires everything due, in order. */
function fakeTimers() {
  let now = 0;
  let seq = 0;
  const pending = new Map();
  return {
    set: (fn, ms) => { const id = ++seq; pending.set(id, { fn, at: now + ms }); return id; },
    clear: (id) => pending.delete(id),
    async advance(ms) {
      now += ms;
      for (;;) {
        const due = [...pending.entries()].filter(([, t]) => t.at <= now).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        pending.delete(due[0]);
        due[1].fn();
        await settle();
      }
      await settle();
    },
    get size() { return pending.size; },
  };
}
const settle = () => new Promise((r) => setImmediate(r));

/** An in-memory server with the database's conditional-save semantics. */
function fakeServer(start = { content: doc(), version: 1 }) {
  const server = { ...start, calls: [], gate: null, fail: 0, gone: false };
  server.save = async (content, expectedVersion) => {
    server.calls.push({ content, expectedVersion });
    if (server.gate) await server.gate;
    if (server.fail > 0) { server.fail -= 1; throw new Error('Failed to fetch'); }
    if (server.gone) return { status: 'not_found' };
    if (expectedVersion !== server.version) return { status: 'conflict', version: server.version };
    server.content = content;
    server.version += 1;
    return { status: 'ok', version: server.version, updated_at: new Date().toISOString() };
  };
  return server;
}

function makeSaver(server, extra = {}) {
  const timers = fakeTimers();
  const drafts = [];
  const statuses = [];
  const saver = new saverMod.PageSaver({
    content: server.content,
    version: server.version,
    save: server.save,
    persist: (d) => drafts.push(structuredClone(d)),
    onStatus: (s) => statuses.push(s),
    delay: 800,
    retryDelays: [2000, 5000],
    timers,
    ...extra,
  });
  return { saver, timers, drafts, statuses };
}

test('saver: every change reaches the device at once, and the server once after a pause (debounced)', async () => {
  const server = fakeServer();
  const { saver, timers, drafts } = makeSaver(server);

  saver.change(doc('a'));
  saver.change(doc('ab'));
  saver.change(doc('abc'));
  assert.deepEqual(drafts.map((d) => d.dirty), [true, true, true]);
  assert.deepEqual(drafts.at(-1).content, doc('abc'));
  assert.equal(saver.status, 'pending');
  await timers.advance(799);
  assert.equal(server.calls.length, 0);
  await timers.advance(1);
  assert.equal(server.calls.length, 1, 'one save for the burst');
  assert.deepEqual(server.content, doc('abc'));
  assert.equal(saver.status, 'saved');
  assert.equal(saver.dirty, false);
  assert.deepEqual(drafts.at(-1), { content: doc('abc'), baseVersion: 2, dirty: false }, 'device copy marked clean on the new version');
});

test('saver: typing during a save is never lost or marked clean by the older save; the next save uses the new version', async () => {
  const server = fakeServer();
  const { saver, timers } = makeSaver(server);
  let release;
  server.gate = new Promise((r) => { release = r; });

  saver.change(doc('first'));
  await timers.advance(800);
  assert.equal(saver.status, 'saving');
  saver.change(doc('first', 'second'));
  await timers.advance(5000);
  assert.equal(server.calls.length, 1, 'one save in flight at a time');

  server.gate = null;
  release();
  await settle();
  assert.equal(saver.dirty, true, 'the newer content is still unsaved');
  assert.equal(saver.status, 'pending');
  await timers.advance(800);
  assert.equal(server.calls.length, 2);
  assert.equal(server.calls[1].expectedVersion, 2);
  assert.deepEqual(server.content, doc('first', 'second'));
  assert.equal(saver.status, 'saved');
});

test('saver: flush() saves now and resolves once the latest content is on the server', async () => {
  const server = fakeServer();
  const { saver } = makeSaver(server);
  saver.change(doc('leaving'));
  await saver.flush();
  assert.deepEqual(server.content, doc('leaving'));
  assert.equal(saver.status, 'saved');
  await saver.flush();
  assert.equal(server.calls.length, 1, 'nothing to save: no request');
});

test('saver: failures keep the content dirty on the device and retry with backoff; flush retries at once', async () => {
  const server = fakeServer();
  const { saver, timers, drafts } = makeSaver(server);
  server.fail = 2;

  saver.change(doc('offline words'));
  await timers.advance(800);
  assert.equal(saver.status, 'retrying');
  assert.equal(drafts.at(-1).dirty, true);
  saver.change(doc('offline words', 'more'));
  assert.equal(saver.status, 'retrying', 'typing keeps the retry state and its backoff');
  await timers.advance(2000);
  assert.equal(server.calls.length, 2);
  assert.equal(saver.status, 'retrying');

  await saver.flush(); // reconnect
  assert.equal(saver.status, 'saved');
  assert.deepEqual(server.content, doc('offline words', 'more'));
  assert.equal(drafts.at(-1).dirty, false);
});

test('saver: a change made elsewhere is never overwritten — conflict, then keep mine or use theirs', async () => {
  const server = fakeServer();
  const { saver, timers, drafts } = makeSaver(server);
  // Another window saves first.
  await server.save(doc('from the other window'), 1);

  saver.change(doc('from this window'));
  await timers.advance(800);
  assert.equal(saver.status, 'conflict');
  assert.deepEqual(server.content, doc('from the other window'));
  assert.equal(drafts.at(-1).dirty, true, 'this window\'s writing is kept on the device');
  saver.change(doc('from this window', 'still typing'));
  await timers.advance(10_000);
  assert.equal(server.calls.length, 2, 'no further saves while in conflict');

  await saver.keepMine();
  assert.equal(saver.status, 'saved');
  assert.deepEqual(server.content, doc('from this window', 'still typing'));

  // Or: use theirs.
  await server.save(doc('theirs again'), server.version);
  saver.change(doc('mine again'));
  await timers.advance(800);
  assert.equal(saver.status, 'conflict');
  saver.acceptServer({ content: server.content, version: server.version });
  assert.equal(saver.status, 'saved');
  assert.deepEqual(saver.content, doc('theirs again'));
  assert.deepEqual(drafts.at(-1), { content: doc('theirs again'), baseVersion: server.version, dirty: false });
});

test('saver: a Page that is gone stops saving and keeps the writing on the device', async () => {
  const server = fakeServer();
  const { saver, timers, drafts } = makeSaver(server);
  server.gone = true;
  saver.change(doc('kept'));
  await timers.advance(800);
  assert.equal(saver.status, 'unavailable');
  saver.change(doc('kept', 'more'));
  await timers.advance(10_000);
  assert.equal(server.calls.length, 1);
  assert.deepEqual(drafts.at(-1), { content: doc('kept', 'more'), baseVersion: 1, dirty: true });
});

test('saver: a recovered unsaved draft saves on its own when the Page opens', async () => {
  const server = fakeServer({ content: doc('old'), version: 3 });
  const timers = fakeTimers();
  const saver = new saverMod.PageSaver({ content: doc('recovered'), version: 3, dirty: true, save: server.save, timers });
  assert.equal(saver.status, 'pending');
  await timers.advance(0);
  assert.deepEqual(server.content, doc('recovered'));
  assert.equal(saver.status, 'saved');
});

test('openPage: unsaved writing on the device is never discarded', () => {
  const { openPage } = saverMod;
  const server = { content: doc('server'), version: 4 };

  assert.deepEqual(openPage(server, null), { content: doc('server'), version: 4, dirty: false, conflictVersion: null });
  assert.deepEqual(openPage(server, { content: doc('cache'), baseVersion: 2, dirty: false }).content, doc('server'), 'a clean copy is only a cache');
  assert.deepEqual(openPage(server, { content: doc('draft'), baseVersion: 4, dirty: true }),
    { content: doc('draft'), version: 4, dirty: true, conflictVersion: null }, 'unsaved on the current version: saved next');
  assert.deepEqual(openPage(server, { content: { content: doc('server').content, type: 'doc' }, baseVersion: 3, dirty: true }),
    { content: doc('server'), version: 4, dirty: false, conflictVersion: null }, 'identical (keys reordered by jsonb): already saved');
  assert.deepEqual(openPage(server, { content: doc('draft'), baseVersion: 3, dirty: true }),
    { content: doc('draft'), version: 3, dirty: true, conflictVersion: 4 }, 'unsaved on an older version: a conflict to resolve');
  assert.deepEqual(openPage(null, { content: doc('offline'), baseVersion: 2, dirty: true }),
    { content: doc('offline'), version: 2, dirty: true, conflictVersion: null }, 'offline: the device copy');
  assert.equal(openPage(null, null), null);

  assert.equal(saverMod.sameDoc({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 }), true);
  assert.equal(saverMod.sameDoc({ a: 1 }, { a: 1, b: 2 }), false);
});

// ── 5. the shell: a Page is an object by id ────────────────────────────────────

test('shell model: a Page is indexed beside the manuscript, is not a writing target, and opens in at most one tab', () => {
  const summaries = [
    { id: 'p1', title: 'Magic System', created_at: '', updated_at: '' },
    { id: 'p2', title: null, created_at: '', updated_at: '' },
  ];
  // A flat Workspace: the tree of Pages with no Folders.
  const tree = summaries.map((p, i) => ({ nodeId: `n${i}`, kind: 'page', id: p.id, title: p.title, children: [] }));
  const index = model.indexWorkspace(tree, { p1: 'Magic Systems' });
  assert.deepEqual([...index.values()].map((e) => [e.kind, e.id, e.title, e.named, e.words, e.path.length]), [
    ['workspacePage', 'p1', 'Magic Systems', true, 0, 0],
    ['workspacePage', 'p2', 'Untitled', false, 0, 0],
  ]);
  assert.equal(target.writingTargetFor(index.get('p1'), index), null, 'never opened in the manuscript writing surface');

  const has = (k) => k === ws.MANUSCRIPT_TAB || index.has(k);
  let s = { tabs: [ws.MANUSCRIPT_TAB], active: ws.MANUSCRIPT_TAB };
  s = ws.openTab(s, 'p1');
  s = ws.openTab(s, 'p1');
  s = ws.navigateTab(s, 'p1');
  assert.deepEqual(s, { tabs: [ws.MANUSCRIPT_TAB, 'p1'], active: 'p1' }, 'opening the same Page again goes to its tab');
  s = ws.navigateTab({ tabs: [ws.MANUSCRIPT_TAB, 'p1'], active: ws.MANUSCRIPT_TAB }, 'p1');
  assert.deepEqual(s.tabs, [ws.MANUSCRIPT_TAB, 'p1']);
  assert.deepEqual(ws.resolveTabs({ tabs: ['p1', 'p2'], active: 'p2' }, has), { tabs: ['p1', 'p2'], active: 'p2' });
  assert.deepEqual(ws.closeTab({ tabs: [ws.MANUSCRIPT_TAB, 'p1'], active: 'p1' }, 'p1'),
    { tabs: [ws.MANUSCRIPT_TAB], active: ws.MANUSCRIPT_TAB });
});
