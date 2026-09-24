// Regression test for the July 2026 production save failure, reproduced
// exactly as the live catalog showed it. Ported from sqldrift.mjs onto the
// Supabase shim — every original check is preserved.
//
// The fault was a hand-applied trigger on public.pages that never existed in
// the repo (trg_page_updated → bump_project_updated_at) whose body referenced
// `projects` / `chapters` UNQUALIFIED with no pinned search_path. Fired from
// inside save_page_checked (`set search_path = ''`) it raised
// `relation "projects" does not exist` and rolled back every checked save.
// Direct updates under a normal search path kept working.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, readMigration, readRepoFile, asUser, createAuthUser } from '../lib/pg.mjs';

const U1 = '11111111-1111-1111-1111-111111111111';
const U2 = '22222222-2222-2222-2222-222222222222';
const PROJ1 = 'aaaaaaaa-0000-0000-0000-000000000001';
const P1 = 'cccccccc-0000-0000-0000-000000000001';

let db;

async function trySave(uid, words) {
  try {
    const r = await asUser(db, uid, (tx) => tx.query(
      `select public.save_page_checked($1::uuid, $2::jsonb, $3::int, null::int) as res`,
      [P1, JSON.stringify({ t: 'doc', words }), words]));
    return { res: r.rows[0].res, error: null };
  } catch (e) {
    return { res: null, error: { message: e.message, code: e.code } };
  }
}

const pageRow = async () => (await db.query(`select word_count, version from public.pages where id = $1`, [P1])).rows[0];
const projUpdatedAt = async () => (await db.query(`select updated_at from public.projects where id = $1`, [PROJ1])).rows[0].updated_at;

before(async () => {
  db = await createTestDb();
  // Production baseline: already has the FIXED bump_project_updated_at and the
  // trg_page_updated trigger, plus production's save_page_checked.
  await db.exec(readRepoFile('src/lib/supabase/schema.sql'));
  await createAuthUser(db, U1);
  await db.exec(`
    insert into public.projects (id, user_id, title, updated_at) values ('${PROJ1}','${U1}', 't', now() - interval '1 hour');
    insert into public.chapters (id, project_id, title, position) values ('bbbbbbbb-0000-0000-0000-000000000001','${PROJ1}', 'c', 1);
    insert into public.pages (id, chapter_id, title, position) values ('${P1}','bbbbbbbb-0000-0000-0000-000000000001', 'p', 0);
  `);

  // Put back the EXACT hand-applied production body from before migration 012
  // (verbatim from the July 2026 live catalog, including casing): unqualified
  // table names, no pinned search_path. trg_page_updated already points at it.
  await db.exec(`
    CREATE OR REPLACE FUNCTION public.bump_project_updated_at()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    BEGIN
      UPDATE projects SET updated_at = NOW()
      WHERE id = (SELECT project_id FROM chapters WHERE id = NEW.chapter_id);
      RETURN NEW;
    END;
    $function$;
  `);
});

test('broken: save_page_checked raises the EXACT production error and rolls back', async () => {
  const grow = await trySave(U1, 650);
  assert.equal(grow.error?.message, 'relation "projects" does not exist', JSON.stringify(grow.error ?? grow.res));
  assert.deepEqual(await pageRow(), { word_count: 0, version: 1 }, 'whole transaction rolled back');
});

test('broken: a direct UPDATE (normal search path) still succeeds through the same trigger', async () => {
  // The trigger inherits the caller's search path — this is why only the RPC
  // path failed in production.
  await asUser(db, U1, (tx) =>
    tx.query(`update public.pages set word_count = 5, content = '{}'::jsonb where id = $1`, [P1]));
  const bumped = await db.query(
    `select updated_at > now() - interval '5 minutes' as recent from public.projects where id = $1`, [PROJ1]);
  assert.equal(bumped.rows[0].recent, true, 'trigger itself works when names resolve');
});

test('migration 012 applies idempotently and the checked save commits through the real trigger', async () => {
  await db.exec(readMigration('012_fix_bump_project_updated_at.sql'));
  await db.exec(readMigration('012_fix_bump_project_updated_at.sql'));

  const before = await projUpdatedAt();
  const fixed = await trySave(U1, 653);
  assert.equal(fixed.res?.status, 'ok', JSON.stringify(fixed.res ?? fixed.error));
  const row = await pageRow();
  assert.equal(row.word_count, 653);
  assert.ok(row.version >= 2, `version advanced (${row.version})`);
  const after = await projUpdatedAt();
  assert.ok(new Date(after).getTime() >= new Date(before).getTime(), 'project.updated_at advanced');
  assert.ok(new Date(after).getTime() > Date.now() - 5 * 60_000, 'project.updated_at is recent');

  const trigs = (await db.query(
    `select tgname from pg_trigger where tgrelid = 'public.pages'::regclass and not tgisinternal order by tgname`)).rows.map((r) => r.tgname);
  assert.equal(trigs.filter((t) => t === 'trg_page_updated').length, 1, 'trigger attached exactly once');
  assert.ok(trigs.includes('page_version_trigger'), JSON.stringify(trigs));
});

test('012-post: word limit still enforced and non-owner still cannot save', async () => {
  const blocked = await trySave(U1, 2500);
  assert.equal(blocked.res?.status, 'word_limit_blocked', JSON.stringify(blocked.res ?? blocked.error));

  await createAuthUser(db, U2);
  const other = await asUser(db, U2, (tx) =>
    tx.query(`select public.save_page_checked($1::uuid,'{}'::jsonb,10,null::int) as res`, [P1]));
  assert.deepEqual(other.rows[0].res, { status: 'error', error: 'Page not found' }, 'RLS intact');
});

test('012-post: no trigger function on pages/chapters/projects references an unqualified app table', async () => {
  // Same bounded scan as migration 012's post-apply verification.
  const scan = (await db.query(`
    select p.proname,
           p.prosrc ~* '(from|join|update|insert\\s+into|delete\\s+from)\\s+(projects|pages|chapters|profiles|user_pricing_entitlements|writing_sessions|game_sessions|xp_events)[^.\\w]' as bad
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_proc  p on p.oid = t.tgfoid
    where not t.tgisinternal
      and c.relnamespace = 'public'::regnamespace
      and c.relname in ('pages','chapters','projects')
  `)).rows;
  assert.ok(scan.length > 0, 'scan found trigger functions');
  assert.ok(scan.every((r) => r.bad === false), JSON.stringify(scan));
});
