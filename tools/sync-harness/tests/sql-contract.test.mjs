// save_page_checked contract through REAL Postgres (PGlite), real RLS, the
// migration-006 version trigger and the migration-012 trg_page_updated
// trigger function. Ported from sqltest.mjs (July 2026 incident harness) onto
// the Supabase shim — every original check S1–S8 is preserved.
//
// Scenarios share one database and run in order (node:test runs tests in a
// file sequentially), exactly as the original script did.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, readMigration, asUser, HARNESS_DIR } from '../lib/pg.mjs';
import fs from 'node:fs';
import path from 'node:path';

const U1 = '11111111-1111-1111-1111-111111111111';
const U2 = '22222222-2222-2222-2222-222222222222';
const PROJ1 = 'aaaaaaaa-0000-0000-0000-000000000001';
const P1 = 'cccccccc-0000-0000-0000-000000000001';
const P2 = 'cccccccc-0000-0000-0000-000000000002';

let db;

async function rpc(uid, sql, params = []) {
  try {
    const r = await asUser(db, uid, (tx) => tx.query(sql, params));
    return { res: r.rows[0]?.res ?? null, error: null };
  } catch (e) {
    return { res: null, error: { message: e.message, code: e.code } };
  }
}

const save = (uid, pageId, content, words, version) =>
  rpc(uid, `select public.save_page_checked($1::uuid, $2::jsonb, $3::int, $4::int) as res`,
    [pageId, JSON.stringify(content), words, version]);

before(async () => {
  db = await createTestDb();
  await db.exec(fs.readFileSync(path.join(HARNESS_DIR, 'sql/fixtures/save-path-subset.sql'), 'utf8'));
  await db.exec(readMigration('011_account_word_limit.sql'));
  // migration 012's fixed bump_project_updated_at + the production trigger it
  // belongs to, so every scenario exercises the real save path.
  await db.exec(readMigration('012_fix_bump_project_updated_at.sql'));
  await db.exec(`create trigger trg_page_updated after update on public.pages
                   for each row execute function public.bump_project_updated_at();`);
  // seed: U1 free/starter_2k, U2 free (no entitlements row); project/chapter/page
  // for U1, with project.updated_at in the past so the trigger bump is observable.
  await db.exec(`
    insert into public.profiles (id, subscription_tier) values ('${U1}','free'), ('${U2}','free');
    insert into public.user_pricing_entitlements (user_id, pricing_cohort) values ('${U1}','starter_2k');
    insert into public.projects (id, user_id, updated_at) values ('${PROJ1}','${U1}', now() - interval '1 hour');
    insert into public.chapters (id, project_id) values ('bbbbbbbb-0000-0000-0000-000000000001','${PROJ1}');
    insert into public.pages (id, chapter_id) values ('${P1}','bbbbbbbb-0000-0000-0000-000000000001');
  `);
});

test('S1: normal growth save on a fresh page commits through the real triggers', async () => {
  const { res, error } = await save(U1, P1, { type: 'doc', words: 650 }, 650, 1);
  assert.equal(res?.status, 'ok', JSON.stringify(res ?? error));
  const row = (await db.query(`select word_count, version from public.pages where id = $1`, [P1])).rows[0];
  assert.deepEqual(row, { word_count: 650, version: 2 }, 'row persisted (650 words, version 2)');
  const proj = (await db.query(
    `select updated_at > now() - interval '5 minutes' as bumped from public.projects where id = $1`, [PROJ1])).rows[0];
  assert.equal(proj.bumped, true, 'trg_page_updated bumped parent project.updated_at');
});

test('S2: stale expected_version → version_mismatch, row untouched', async () => {
  const { res, error } = await save(U1, P1, {}, 651, 1);
  assert.equal(res?.status, 'version_mismatch', JSON.stringify(res ?? error));
  const row = (await db.query(`select word_count from public.pages where id = $1`, [P1])).rows[0];
  assert.equal(row.word_count, 650);
});

test('S3: growth past 2000 → word_limit_blocked (limit 2000)', async () => {
  const { res, error } = await save(U1, P1, {}, 2100, null);
  assert.equal(res?.status, 'word_limit_blocked', JSON.stringify(res ?? error));
  assert.equal(res?.limit, 2000);
});

test('S4: null expected_version (Keep Local path) under limit → ok', async () => {
  const { res, error } = await save(U1, P1, { keepLocal: true }, 700, null);
  assert.equal(res?.status, 'ok', JSON.stringify(res ?? error));
});

test('S5: user with NO entitlements row defaults to the starter 2k limit', async () => {
  await db.exec(`
    insert into public.projects (id, user_id) values ('aaaaaaaa-0000-0000-0000-000000000002','${U2}');
    insert into public.chapters (id, project_id) values ('bbbbbbbb-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000002');
    insert into public.pages (id, chapter_id) values ('${P2}','bbbbbbbb-0000-0000-0000-000000000002');
  `);
  const ok = await save(U2, P2, {}, 500, null);
  assert.equal(ok.res?.status, 'ok', JSON.stringify(ok.res ?? ok.error));
  const blocked = await save(U2, P2, {}, 2500, null);
  assert.equal(blocked.res?.status, 'word_limit_blocked', JSON.stringify(blocked.res ?? blocked.error));
});

test("S6: another user's page is invisible → status error 'Page not found'", async () => {
  const { res, error } = await save(U2, P1, {}, 10, null);
  assert.equal(res?.status, 'error', JSON.stringify(res ?? error));
  assert.equal(res?.error, 'Page not found');
});

test('S7 fingerprint: stale 3-arg account_word_total overload (2-arg missing) → RPC raises', async () => {
  await db.exec(`
    drop function public.account_word_total(uuid, int);
    create function public.account_word_total(p_project uuid default null, p_page uuid default null, p_wc int default null)
      returns int language sql stable as $$ select 0 $$;
  `);
  const r = await save(U1, P1, {}, 800, null);
  assert.notEqual(r.error, null, JSON.stringify(r));
  // restore the committed definition for later scenarios
  await db.exec(`drop function public.account_word_total(uuid, uuid, int);`);
  await db.exec(readMigration('011_account_word_limit.sql'));
});

test('S8 fingerprint: user_pricing_entitlements table missing → RPC raises', async () => {
  await db.exec(`drop table public.user_pricing_entitlements;`);
  const r = await save(U1, P1, {}, 900, null);
  assert.notEqual(r.error, null, JSON.stringify(r));
});
