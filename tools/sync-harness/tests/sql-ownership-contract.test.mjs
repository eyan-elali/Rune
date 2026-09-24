// Ownership / RLS contracts for manuscript prose on the Rune 1.x production
// baseline (`pages`), through REAL Postgres (PGlite), driven with the exact
// query shapes the app sends today. Written for the Rune 2.0 Page → Scene
// migration.
//
// A Rune 1.x Page's owner is found only through Page → Chapter → Project →
// User. These tests pin that every browser-direct and server shape reaches a
// future-Unplaced alternate for its owner and nobody else, and that the free
// limit counts it — the behavior the eventual Rune 1.x → Rune 2.0 data
// migration must preserve while real writers are still on this schema.
//
// The Unplaced-Scene contracts (formerly the FUTURE tests here, written
// against a hypothetical `pages.manuscript_id`) now run against the Rune 2.0
// schema, where Scenes own their Manuscript directly:
// tests/sql-rune2-manuscript.test.mjs.
//
// Browser-direct shapes (the app's own files):
//   READ_SYNC      syncEngine.ts  doSyncPendingWrite pre-read
//   READ_DEEP      syncEngine.ts  deep content check
//   READ_CONFLICT  SyncConflictModal.tsx  server version for the conflict modal
//   KEEP_LOCAL     syncEngine.ts  doForceWriteLocalContent → rpc save_page_checked(p_expected_version: null)
//   READ_VERIFY    syncEngine.ts  Keep Local post-save verification
//   EXPORT_LOAD    ManuscriptExportButton.tsx  chapters by project, then pages .in(chapter_id)
// Server shape:
//   AUTOSAVE       actions/pages.ts syncPageWithLimitCheck (REAL module) → save_page_checked(p_expected_version: n)
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, readRepoFile, LEGACY_BASELINE } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';
import { takeManuscriptSnapshot } from '../lib/manuscript-snapshot.mjs';
import { assertNoViolations, checkMigration } from '../lib/manuscript-invariants.mjs';
import { LABELS, USERS, chapterId, pageId, projectId, seedFixture, syntheticDoc } from '../fixtures/manuscript-fixture.mjs';

const ALICE = USERS.alice.id; // starter_2k, all-pages total 3035 (over the 2000 limit)
const BRAM = USERS.bram.id; // legacy_15k, total 2740
const ALT_ALICE = pageId('h3b'); // non-canonical sibling in a canonical chapter → Unplaced after cutover
const ALT_BRAM = pageId('t1c'); // same, owned by bram

const READ_SYNC = (sb, id) => sb.from('pages').select('updated_at, version, word_count').eq('id', id);
const READ_DEEP = (sb, id) => sb.from('pages').select('content').eq('id', id);
const READ_CONFLICT = (sb, id) => sb.from('pages').select('content, word_count, updated_at, version').eq('id', id);
const READ_VERIFY = (sb, id) => sb.from('pages').select('word_count, version').eq('id', id);
const READ_SHAPES = { READ_SYNC, READ_DEEP, READ_CONFLICT, READ_VERIFY };
const KEEP_LOCAL = (sb, id, content, words) =>
  sb.rpc('save_page_checked', { p_page_id: id, p_content: content, p_word_count: words, p_expected_version: null });

async function EXPORT_LOAD(sb, pid) {
  const { data: chapters } = await sb.from('chapters').select('*').eq('project_id', pid).order('position', { ascending: true });
  if (!chapters?.length) return [];
  const { data: pages } = await sb.from('pages').select('*').in('chapter_id', chapters.map((c) => c.id)).order('position', { ascending: true });
  return (pages ?? []).map((p) => p.id);
}

const as = (db, userId) => createSupabaseAdapter(db, userId ? { userId } : {});

async function seededDb() {
  const db = await createTestDb();
  await db.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(db);
  return db;
}

let pagesAction; // the REAL autosave server action module
before(async () => {
  pagesAction = await bundleForTest('src/lib/actions/pages.ts', { name: 'own_actions_pages' });
});

async function autosave(db, userId, id, content, words, version) {
  pagesAction.setServerClient(as(db, userId));
  return pagesAction.syncPageWithLimitCheck(id, content, words, version, 'offline_sync');
}

/** Replays one queued offline write the way the sync engine does: pre-read by ID, autosave with the read version, verify. */
async function replayQueuedWrite(db, userId, id, words) {
  const sb = as(db, userId);
  const pre = await READ_SYNC(sb, id);
  assert.equal(pre.error, null);
  assert.equal(pre.data.length, 1, 'pre-read must find the row by ID (0 rows = queue entry marked failed)');
  const saved = await autosave(db, userId, id, syntheticDoc('replay', words), words, pre.data[0].version);
  const verify = await READ_VERIFY(sb, id);
  return { pre: pre.data[0], saved, verify: verify.data };
}

test('the owner reaches a future-Unplaced alternate through every browser-direct read shape', async () => {
  const db = await seededDb();
  for (const [name, shape] of Object.entries(READ_SHAPES)) {
    const r = await shape(as(db, ALICE), ALT_ALICE);
    assert.equal(r.error, null, name);
    assert.equal(r.data.length, 1, `${name}: exactly one row`);
  }
});

test('another user and anon see nothing through any read shape', async () => {
  const db = await seededDb();
  for (const [who, sb] of [['bram', as(db, BRAM)], ['anon', as(db, null)]]) {
    for (const [name, shape] of Object.entries(READ_SHAPES)) {
      const r = await shape(sb, ALT_ALICE);
      assert.ok(r.error !== null || r.data.length === 0, `${who} ${name}: must not see alice's page`);
    }
  }
});

test('a queued write to a future-Unplaced alternate replays by ID through the REAL autosave action', async () => {
  const db = await seededDb();
  const r = await replayQueuedWrite(db, BRAM, ALT_BRAM, 730);
  assert.equal(r.saved.status, 'ok', JSON.stringify(r.saved));
  assert.equal(r.saved.version, r.pre.version + 1);
  assert.deepEqual(r.verify, [{ word_count: 730, version: r.pre.version + 1 }]);
});

test('Keep Local on an alternate — owner ok, other user "Page not found", anon rejected', async () => {
  const db = await seededDb();
  const ok = await KEEP_LOCAL(as(db, BRAM), ALT_BRAM, syntheticDoc('keep', 700), 700);
  assert.equal(ok.data?.status, 'ok', JSON.stringify(ok));
  const other = await KEEP_LOCAL(as(db, ALICE), ALT_BRAM, { type: 'doc' }, 1);
  assert.deepEqual(other.data, { status: 'error', error: 'Page not found' }, 'the literal string the sync engine matches');
  const anon = await KEEP_LOCAL(as(db, null), ALT_BRAM, { type: 'doc' }, 1);
  assert.ok(anon.error, 'anon is rejected');
  const r = await db.query(`select word_count from public.pages where id = $1`, [ALT_BRAM]);
  assert.equal(r.rows[0].word_count, 700, 'only the owner write landed');
});

test('the free limit counts alternates — growing one is blocked for an over-limit starter writer', async () => {
  const db = await seededDb();
  const total = await as(db, ALICE).rpc('account_word_total');
  assert.equal(total.data, 3035);
  const grow = await autosave(db, ALICE, ALT_ALICE, syntheticDoc('grow', 381), 381, 3);
  assert.deepEqual(grow, { status: 'word_limit_blocked' });
  const shrink = await autosave(db, ALICE, ALT_ALICE, syntheticDoc('shrink', 300), 300, 3);
  assert.equal(shrink.status, 'ok', 'shrinking is never blocked');
});

test('other users cannot update, delete, or insert into a writer\'s chapters', async () => {
  const db = await seededDb();
  const bram = as(db, BRAM);
  assert.deepEqual((await bram.from('pages').update({ title: 'x' }).eq('id', ALT_ALICE).select('id')).data, []);
  assert.deepEqual((await bram.from('pages').delete().eq('id', ALT_ALICE).select('id')).data, []);
  const ins = await bram.from('pages').insert({ chapter_id: chapterId('hollow.ch3'), title: 'x', position: 9 });
  assert.equal(ins.error?.code, '42501');
  const after = await takeManuscriptSnapshot(db);
  assertNoViolations(checkMigration(await takeManuscriptSnapshot(await seededDb()), after, { stage: 'additive' }), { labels: LABELS });
});

test('the export loader returns the owner\'s pages (alternates included, before selection) and nothing to others', async () => {
  const db = await seededDb();
  const mine = await EXPORT_LOAD(as(db, ALICE), projectId('hollow'));
  assert.equal(mine.length, 11);
  assert.ok(mine.includes(ALT_ALICE));
  assert.deepEqual(await EXPORT_LOAD(as(db, BRAM), projectId('hollow')), []);
});

// ── the gate ──────────────────────────────────────────────────────────────────

test('GATE: Rune 1.x pages ownership is Chapter-only — why the data migration must move Scenes to Manuscript ownership', async () => {
  const db = await seededDb();
  const policies = (await db.query(`
    select policyname, coalesce(qual, '') || ' ' || coalesce(with_check, '') as expr
    from pg_policies where schemaname = 'public' and tablename = 'pages'`)).rows;
  assert.ok(policies.length > 0);
  for (const p of policies) {
    assert.match(p.expr, /chapter/, `${p.policyname}: ownership resolves through the Chapter`);
    assert.doesNotMatch(p.expr, /manuscript/);
  }
});
