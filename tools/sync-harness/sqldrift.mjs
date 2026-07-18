// Regression test for the July 2026 production save failure, reproduced
// exactly as the live catalog showed it.
//
// The migration-011 word-limit functions were canonical and fully qualified
// in production (their deployed bodies were inspected directly). The fault
// was a hand-applied trigger on public.pages that never existed in this repo:
//
//   CREATE TRIGGER trg_page_updated AFTER UPDATE ON pages
//   FOR EACH ROW EXECUTE FUNCTION bump_project_updated_at();
//
// whose function body referenced `projects` and `chapters` UNQUALIFIED with
// no pinned search_path. A trigger function without its own search_path
// inherits the calling context's — and save_page_checked runs with
// `set search_path = ''` — so every checked save raised
// `relation "projects" does not exist` and rolled back the whole
// transaction, leaving the server page at 0 words. Direct table updates
// under a normal search path kept working, which is why only the RPC save
// path broke.
//
// This file: reconstructs that state in real Postgres (PGlite), proves the
// exact error and the rollback, proves the direct-update contrast, applies
// migration 012 (twice — idempotency), and proves the save now commits
// through the real trigger with the parent project's updated_at advancing.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

const HERE = new URL('.', import.meta.url).pathname;
const MIG011 = fs.readFileSync(HERE + '../../src/lib/supabase/migrations/011_account_word_limit.sql', 'utf8');
const MIG012 = fs.readFileSync(HERE + '../../src/lib/supabase/migrations/012_fix_bump_project_updated_at.sql', 'utf8');

const U1 = '11111111-1111-1111-1111-111111111111';
const U2 = '22222222-2222-2222-2222-222222222222';
const PROJ1 = 'aaaaaaaa-0000-0000-0000-000000000001';
const P1 = 'cccccccc-0000-0000-0000-000000000001';

const results = [];
function check(name, cond, detail = '') { results.push({ name, pass: !!cond, detail }); }

const db = new PGlite();
await db.exec(`
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create role authenticated;
create table public.profiles (id uuid primary key, subscription_tier text not null default 'free');
create table public.projects (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id), title text not null default 't', description text, cover_color text, word_count int not null default 0, updated_at timestamptz not null default now());
create table public.chapters (id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id), title text not null default 'c', position int not null default 0);
create table public.pages (id uuid primary key default gen_random_uuid(), chapter_id uuid not null references public.chapters(id), title text not null default 'p', content jsonb, word_count int not null default 0, position int not null default 0, is_canonical boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version int not null default 1);
create table public.user_pricing_entitlements (user_id uuid primary key references public.profiles(id), pricing_cohort text not null default 'starter_2k');
create function public.increment_page_version() returns trigger as $$ begin new.version = old.version + 1; new.updated_at = now(); return new; end; $$ language plpgsql;
create trigger page_version_trigger before update on public.pages for each row execute function public.increment_page_version();
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.chapters enable row level security;
alter table public.pages enable row level security;
alter table public.user_pricing_entitlements enable row level security;
create policy p1 on public.profiles for select using (auth.uid() = id);
create policy p2 on public.projects for select using (user_id = auth.uid());
create policy p2u on public.projects for update using (user_id = auth.uid());
create policy p3 on public.chapters for select using (exists (select 1 from public.projects where projects.id = chapters.project_id and projects.user_id = auth.uid()));
create policy p4 on public.pages for select using (exists (select 1 from public.chapters join public.projects on projects.id = chapters.project_id where chapters.id = pages.chapter_id and projects.user_id = auth.uid()));
create policy p5 on public.pages for update using (exists (select 1 from public.chapters join public.projects on projects.id = chapters.project_id where chapters.id = pages.chapter_id and projects.user_id = auth.uid()));
create policy p6 on public.user_pricing_entitlements for select using (auth.uid() = user_id);
grant usage on schema public, auth to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function auth.uid() to authenticated;
insert into public.profiles (id) values ('${U1}');
insert into public.user_pricing_entitlements (user_id) values ('${U1}');
insert into public.projects (id, user_id, updated_at) values ('${PROJ1}','${U1}', now() - interval '1 hour');
insert into public.chapters (id, project_id) values ('bbbbbbbb-0000-0000-0000-000000000001','${PROJ1}');
insert into public.pages (id, chapter_id) values ('${P1}','bbbbbbbb-0000-0000-0000-000000000001');
`);

await db.exec(MIG011); // canonical word-limit functions, as in production

// The EXACT deployed production state: unqualified body, no pinned
// search_path, attached AFTER UPDATE on pages (verbatim from the live
// catalog, including casing).
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
CREATE TRIGGER trg_page_updated
AFTER UPDATE ON pages
FOR EACH ROW
EXECUTE FUNCTION bump_project_updated_at();
`);

async function asUser(uid, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}

async function trySave(uid, words) {
  return asUser(uid, async () => {
    try {
      const r = await db.query(
        `select public.save_page_checked($1::uuid, $2::jsonb, $3::int, null::int) as res`,
        [P1, JSON.stringify({ t: 'doc', words }), words]
      );
      return { res: r.rows[0].res, error: null };
    } catch (e) {
      return { res: null, error: { message: e.message, code: e.code } };
    }
  });
}

const pageRow = async () => (await db.query(`select word_count, version from public.pages where id = $1`, [P1])).rows[0];
const projUpdatedAt = async () => (await db.query(`select updated_at from public.projects where id = $1`, [PROJ1])).rows[0].updated_at;

// ── Broken state: checked save aborts with the exact production error ──────
{
  const grow = await trySave(U1, 650);
  check('broken: save_page_checked raises the EXACT production error',
    grow.error?.message === 'relation "projects" does not exist',
    JSON.stringify(grow.error ?? grow.res));
  const row = await pageRow();
  check('broken: whole transaction rolled back — page still 0 words, version 1',
    row.word_count === 0 && row.version === 1, JSON.stringify(row));
}

// ── Contrast: a direct table UPDATE under a normal search path succeeds, ───
//    because the trigger inherits the caller's search path (this is why only
//    the RPC path failed in production).
{
  const r = await asUser(U1, async () => {
    try {
      await db.query(`update public.pages set word_count = 5, content = '{}'::jsonb where id = $1`, [P1]);
      return { error: null };
    } catch (e) {
      return { error: { message: e.message } };
    }
  });
  check('broken: direct UPDATE (normal search path) still succeeds through the same trigger',
    r.error === null, JSON.stringify(r.error));
  const bumped = await db.query(`select updated_at > now() - interval '5 minutes' as recent from public.projects where id = $1`, [PROJ1]);
  check('broken: direct UPDATE bumped project.updated_at (trigger itself works when names resolve)',
    bumped.rows[0].recent === true, '');
}

// ── Apply migration 012, twice — must be idempotent ────────────────────────
await db.exec(MIG012);
await db.exec(MIG012);

{
  const before = await projUpdatedAt();
  const fixed = await trySave(U1, 653);
  check('012-post: growth save through the real trigger returns ok',
    fixed.res?.status === 'ok', JSON.stringify(fixed.res ?? fixed.error));
  const row = await pageRow();
  check('012-post: page content/word_count persisted and version advanced',
    row.word_count === 653 && row.version >= 2, JSON.stringify(row));
  const after = await projUpdatedAt();
  check('012-post: trg_page_updated advanced parent project.updated_at',
    new Date(after).getTime() >= new Date(before).getTime() && new Date(after).getTime() > Date.now() - 5 * 60_000,
    `before=${before} after=${after}`);

  const trigs = (await db.query(`select tgname from pg_trigger where tgrelid = 'public.pages'::regclass and not tgisinternal order by tgname`)).rows.map(r => r.tgname);
  check('012-post: trigger still attached exactly once (migration did not recreate it)',
    trigs.filter(t => t === 'trg_page_updated').length === 1 && trigs.includes('page_version_trigger'),
    JSON.stringify(trigs));

  const blocked = await trySave(U1, 2500);
  check('012-post: word-limit still enforced (2500 > 2000 blocked)',
    blocked.res?.status === 'word_limit_blocked', JSON.stringify(blocked.res ?? blocked.error));

  // non-owner still cannot save (RLS intact through the whole path)
  await db.exec(`insert into public.profiles (id) values ('${U2}') on conflict do nothing;`);
  const other = await asUser(U2, async () => {
    const r = await db.query(`select public.save_page_checked($1::uuid,'{}'::jsonb,10,null::int) as res`, [P1]);
    return r.rows[0].res;
  });
  check('012-post: non-owner gets "Page not found" (RLS intact)',
    other?.status === 'error' && other?.error === 'Page not found', JSON.stringify(other));
}

// ── Bounded qualification scan (same query as migration 012's verification):
//    no trigger function on pages/chapters/projects may reference an
//    unqualified application table.
{
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
  check('012-post: no trigger function on pages/chapters/projects has unqualified app-table refs',
    scan.length > 0 && scan.every(r => r.bad === false), JSON.stringify(scan));
}

let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '   [' + r.detail + ']' : ''}`);
}
process.exit(failed ? 1 : 0);
