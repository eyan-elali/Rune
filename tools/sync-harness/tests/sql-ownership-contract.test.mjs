// Ownership / RLS contracts for manuscript prose, through REAL Postgres (PGlite)
// running the production baseline, driven with the exact query shapes the app
// sends. Written for the Rune 2.0 Page → Scene migration.
//
// Today a Page's owner is found only through Page → Chapter → Project → User.
// An Unplaced Scene has no Chapter, so before any Page is unplaced, ownership
// must also run Scene → Manuscript → Project → User. That schema does not exist
// yet. This file therefore has two parts:
//
//   CURRENT — executable now. Every browser-direct and server shape reaches a
//     future-Unplaced alternate for its owner and nobody else, and the free
//     limit counts it. These must keep passing at every Phase 1 stage.
//
//   FUTURE — the same contracts for an Unplaced Scene (chapter_id null). They
//     are SKIPPED (reported, not passed) until the schema has the Manuscript
//     ownership path, detected as `public.manuscripts` + `pages.manuscript_id`
//     (the names the Phase 1 audit proposed). They activate automatically once
//     schema.sql carries them. If the schema task picks other names, update
//     `ownershipSchema()` and the few statements marked ASSUMES.
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
import { createTestDb, readRepoFile } from '../lib/pg.mjs';
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
  await db.exec(readRepoFile('src/lib/supabase/schema.sql'));
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

// ── CURRENT: executable now ───────────────────────────────────────────────────

test('CURRENT: the owner reaches a future-Unplaced alternate through every browser-direct read shape', async () => {
  const db = await seededDb();
  for (const [name, shape] of Object.entries(READ_SHAPES)) {
    const r = await shape(as(db, ALICE), ALT_ALICE);
    assert.equal(r.error, null, name);
    assert.equal(r.data.length, 1, `${name}: exactly one row`);
  }
});

test('CURRENT: another user and anon see nothing through any read shape', async () => {
  const db = await seededDb();
  for (const [who, sb] of [['bram', as(db, BRAM)], ['anon', as(db, null)]]) {
    for (const [name, shape] of Object.entries(READ_SHAPES)) {
      const r = await shape(sb, ALT_ALICE);
      assert.ok(r.error !== null || r.data.length === 0, `${who} ${name}: must not see alice's page`);
    }
  }
});

test('CURRENT: a queued write to a future-Unplaced alternate replays by ID through the REAL autosave action', async () => {
  const db = await seededDb();
  const r = await replayQueuedWrite(db, BRAM, ALT_BRAM, 730);
  assert.equal(r.saved.status, 'ok', JSON.stringify(r.saved));
  assert.equal(r.saved.version, r.pre.version + 1);
  assert.deepEqual(r.verify, [{ word_count: 730, version: r.pre.version + 1 }]);
});

test('CURRENT: Keep Local on an alternate — owner ok, other user "Page not found", anon rejected', async () => {
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

test('CURRENT: the free limit counts alternates — growing one is blocked for an over-limit starter writer', async () => {
  const db = await seededDb();
  const total = await as(db, ALICE).rpc('account_word_total');
  assert.equal(total.data, 3035);
  const grow = await autosave(db, ALICE, ALT_ALICE, syntheticDoc('grow', 381), 381, 3);
  assert.deepEqual(grow, { status: 'word_limit_blocked' });
  const shrink = await autosave(db, ALICE, ALT_ALICE, syntheticDoc('shrink', 300), 300, 3);
  assert.equal(shrink.status, 'ok', 'shrinking is never blocked');
});

test('CURRENT: other users cannot update, delete, or insert into a writer\'s chapters', async () => {
  const db = await seededDb();
  const bram = as(db, BRAM);
  assert.deepEqual((await bram.from('pages').update({ title: 'x' }).eq('id', ALT_ALICE).select('id')).data, []);
  assert.deepEqual((await bram.from('pages').delete().eq('id', ALT_ALICE).select('id')).data, []);
  const ins = await bram.from('pages').insert({ chapter_id: chapterId('hollow.ch3'), title: 'x', position: 9 });
  assert.equal(ins.error?.code, '42501');
  const after = await takeManuscriptSnapshot(db);
  assertNoViolations(checkMigration(await takeManuscriptSnapshot(await seededDb()), after, { stage: 'additive' }), { labels: LABELS });
});

test('CURRENT: the export loader returns the owner\'s pages (alternates included, before selection) and nothing to others', async () => {
  const db = await seededDb();
  const mine = await EXPORT_LOAD(as(db, ALICE), projectId('hollow'));
  assert.equal(mine.length, 11);
  assert.ok(mine.includes(ALT_ALICE));
  assert.deepEqual(await EXPORT_LOAD(as(db, BRAM), projectId('hollow')), []);
});

// ── the gate between CURRENT and FUTURE ───────────────────────────────────────

async function ownershipSchema(db) {
  const r = await db.query(`
    select to_regclass('public.manuscripts') is not null as has_table,
           exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'pages' and column_name = 'manuscript_id') as has_column`);
  const { has_table: hasTable, has_column: hasColumn } = r.rows[0];
  if (hasTable !== hasColumn) {
    throw new Error(`partial Manuscript ownership schema (manuscripts table: ${hasTable}, pages.manuscript_id: ${hasColumn}) — update ownershipSchema() in this file`);
  }
  return hasTable;
}

test('GATE: pages ownership is Chapter-only today; once the Manuscript path exists, every command has a policy that uses it', async () => {
  const db = await seededDb();
  const policies = (await db.query(`
    select policyname, cmd, coalesce(qual, '') || ' ' || coalesce(with_check, '') as expr
    from pg_policies where schemaname = 'public' and tablename = 'pages'`)).rows;
  if (!(await ownershipSchema(db))) {
    assert.ok(policies.length > 0);
    for (const p of policies) {
      assert.match(p.expr, /chapter/, `${p.policyname}: ownership resolves through the Chapter`);
      assert.doesNotMatch(p.expr, /manuscript/);
    }
    return;
  }
  for (const cmd of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
    assert.ok(policies.some((p) => (p.cmd === cmd || p.cmd === 'ALL') && /manuscript/.test(p.expr)),
      `no ${cmd} policy on pages resolves ownership through the Manuscript`);
  }
});

// ── FUTURE: activate when the Manuscript ownership schema exists ─────────────

const PENDING = 'pending: needs the Manuscript ownership path (manuscripts + pages.manuscript_id), Phase 1 Manuscript ownership task';

/** Moves pages to Unplaced the way the data step will: as the migration owner, chapter_id := null. */
async function unplace(db, ...ids) {
  await db.query(`update public.pages set chapter_id = null where id = any($1::uuid[])`, [ids]); // ASSUMES Unplaced = chapter_id null
}

async function futureDb(t) {
  const db = await seededDb();
  if (!(await ownershipSchema(db))) { t.skip(PENDING); return null; }
  return db;
}

test('FUTURE: the owner reaches an Unplaced Scene through every browser-direct read shape', async (t) => {
  const db = await futureDb(t); if (!db) return;
  await unplace(db, ALT_ALICE);
  for (const [name, shape] of Object.entries(READ_SHAPES)) {
    const r = await shape(as(db, ALICE), ALT_ALICE);
    assert.equal(r.error, null, name);
    assert.equal(r.data.length, 1, `${name}: exactly one row`);
  }
});

test('FUTURE: another user and anon cannot read, update or delete an Unplaced Scene', async (t) => {
  const db = await futureDb(t); if (!db) return;
  await unplace(db, ALT_ALICE);
  for (const [who, sb] of [['bram', as(db, BRAM)], ['anon', as(db, null)]]) {
    for (const [name, shape] of Object.entries(READ_SHAPES)) {
      const r = await shape(sb, ALT_ALICE);
      assert.ok(r.error !== null || r.data.length === 0, `${who} ${name}`);
    }
    const upd = await sb.from('pages').update({ title: 'x' }).eq('id', ALT_ALICE).select('id');
    assert.ok(upd.error !== null || upd.data.length === 0, `${who} update`);
    const del = await sb.from('pages').delete().eq('id', ALT_ALICE).select('id');
    assert.ok(del.error !== null || del.data.length === 0, `${who} delete`);
  }
  const r = await db.query(`select count(*)::int as n from public.pages where id = $1`, [ALT_ALICE]);
  assert.equal(r.rows[0].n, 1);
});

test('FUTURE: a queued write to an Unplaced Scene replays by the same ID; Keep Local works; others get "Page not found"', async (t) => {
  const db = await futureDb(t); if (!db) return;
  await unplace(db, ALT_BRAM);
  const r = await replayQueuedWrite(db, BRAM, ALT_BRAM, 730);
  assert.equal(r.saved.status, 'ok', JSON.stringify(r.saved));
  assert.deepEqual(r.verify, [{ word_count: 730, version: r.pre.version + 1 }]);
  const keep = await KEEP_LOCAL(as(db, BRAM), ALT_BRAM, syntheticDoc('keep', 740), 740);
  assert.equal(keep.data?.status, 'ok', JSON.stringify(keep));
  const other = await KEEP_LOCAL(as(db, ALICE), ALT_BRAM, { type: 'doc' }, 1);
  assert.deepEqual(other.data, { status: 'error', error: 'Page not found' });
  const still = await db.query(`select chapter_id from public.pages where id = $1`, [ALT_BRAM]);
  assert.equal(still.rows[0].chapter_id, null, 'saving does not re-place the Scene');
});

test('FUTURE: Unplaced Scenes still count toward the free limit — no bypass', async (t) => {
  const db = await futureDb(t); if (!db) return;
  await unplace(db, pageId('h3b'), pageId('h3c'), pageId('h6a'), pageId('h6b'), pageId('a1a'));
  assert.equal((await as(db, ALICE).rpc('account_word_total')).data, 3035);
  const grow = await autosave(db, ALICE, ALT_ALICE, syntheticDoc('grow', 381), 381, 3);
  assert.deepEqual(grow, { status: 'word_limit_blocked' });
});

test('FUTURE: cross-tenant injection — nobody can put a Scene into another writer\'s Manuscript', async (t) => {
  const db = await futureDb(t); if (!db) return;
  // ASSUMES manuscripts(project_id) — one Manuscript per Project.
  const aliceManuscript = (await db.query(`select id from public.manuscripts where project_id = $1`, [projectId('hollow')])).rows[0].id;
  const bram = as(db, BRAM);
  // bram owns this Chapter, so the insert may be accepted, but only into bram's own Manuscript.
  await bram.from('pages').insert({ chapter_id: chapterId('tide.ch3'), manuscript_id: aliceManuscript, title: 'injected', position: 9 });
  const unplaced = await bram.from('pages').insert({ chapter_id: null, manuscript_id: aliceManuscript, title: 'injected', position: 0 });
  assert.ok(unplaced.error, 'an Unplaced insert into another writer\'s Manuscript is rejected');
  const foreign = await db.query(
    `select count(*)::int as n from public.pages where manuscript_id = $1 and title = 'injected'`, [aliceManuscript]);
  assert.equal(foreign.rows[0].n, 0, 'alice\'s Manuscript gained no foreign Scene');
});

test('FUTURE: the export loader never includes Unplaced Scenes', async (t) => {
  const db = await futureDb(t); if (!db) return;
  await unplace(db, ALT_ALICE);
  const ids = await EXPORT_LOAD(as(db, ALICE), projectId('hollow'));
  assert.ok(!ids.includes(ALT_ALICE));
  assert.equal(ids.length, 10);
});

test('FUTURE: dress rehearsal — the approved mapping, run as SQL on the ownership schema, passes checkMigration(cutover)', async (t) => {
  const db = await futureDb(t); if (!db) return;
  const beforeSnap = await takeManuscriptSnapshot(db);
  await db.exec(`
    alter table public.pages disable trigger page_version_trigger;
    alter table public.pages disable trigger trg_page_updated;
    update public.pages p set chapter_id = null
      where not p.is_canonical
        and exists (select 1 from public.pages c where c.chapter_id = p.chapter_id and c.is_canonical);
    update public.pages set is_canonical = false where is_canonical;
    alter table public.pages enable trigger page_version_trigger;
    alter table public.pages enable trigger trg_page_updated;
  `);
  const afterSnap = await takeManuscriptSnapshot(db); // needs the reader's Manuscript path for Unplaced rows
  assertNoViolations(checkMigration(beforeSnap, afterSnap, { stage: 'cutover' }), { labels: LABELS });
});
