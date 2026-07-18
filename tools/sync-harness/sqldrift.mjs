// Drift reconstruction: proves which function shape produces the EXACT
// production error `relation "projects" does not exist` when save_page_checked
// runs, and that migration 012 repairs a database in that state.
//
// Postgres reports the FIRST unresolvable relation in parse order, so the
// observed message uniquely constrains where the unqualified reference lives:
//   - unqualified body of save_page_checked itself      → "pages"
//   - unqualified free_word_limit_for_caller            → "profiles"
//   - unqualified account_word_total (chapters-first)   → "chapters"
//   - unqualified account_word_total (projects-first)   → "projects"  ← observed
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

const HERE = new URL('.', import.meta.url).pathname;
const MIG011 = fs.readFileSync(HERE + '../../src/lib/supabase/migrations/011_account_word_limit.sql', 'utf8');
const MIG012_PATH = HERE + '../../src/lib/supabase/migrations/012_requalify_word_limit_functions.sql';

const U1 = '11111111-1111-1111-1111-111111111111';
const results = [];
function check(name, cond, detail = '') { results.push({ name, pass: !!cond, detail }); }

const db = new PGlite();
await db.exec(`
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create role authenticated;
create table public.profiles (id uuid primary key, subscription_tier text not null default 'free');
create table public.projects (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id), title text not null default 't', description text, cover_color text, word_count int not null default 0);
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
create policy p3 on public.chapters for select using (exists (select 1 from public.projects where projects.id = chapters.project_id and projects.user_id = auth.uid()));
create policy p4 on public.pages for select using (exists (select 1 from public.chapters join public.projects on projects.id = chapters.project_id where chapters.id = pages.chapter_id and projects.user_id = auth.uid()));
create policy p5 on public.pages for update using (exists (select 1 from public.chapters join public.projects on projects.id = chapters.project_id where chapters.id = pages.chapter_id and projects.user_id = auth.uid()));
create policy p6 on public.user_pricing_entitlements for select using (auth.uid() = user_id);
grant usage on schema public, auth to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function auth.uid() to authenticated;
insert into public.profiles (id) values ('${U1}');
insert into public.user_pricing_entitlements (user_id) values ('${U1}');
insert into public.projects (id, user_id) values ('aaaaaaaa-0000-0000-0000-000000000001','${U1}');
insert into public.chapters (id, project_id) values ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001');
insert into public.pages (id, chapter_id) values ('cccccccc-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001');
`);
const P1 = 'cccccccc-0000-0000-0000-000000000001';

await db.exec(MIG011); // start from the canonical (working) state

async function trySave(words) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${U1}', false);`);
  try {
    const r = await db.query(
      `select public.save_page_checked($1::uuid, $2::jsonb, $3::int, null::int) as res`,
      [P1, JSON.stringify({ t: 'doc' }), words]
    );
    return { res: r.rows[0].res, error: null };
  } catch (e) {
    return { res: null, error: { message: e.message, code: e.code } };
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

// ── Drift variant D1 (matches production): account_word_total drafted with
//    unqualified, projects-first references under search_path = ''
await db.exec(`
create or replace function public.account_word_total(
  p_candidate_page_id uuid default null, p_candidate_word_count int default null
) returns int language plpgsql stable set search_path = ''
as $$
declare v_total int;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select coalesce(sum(case when p_candidate_page_id is not null and p.id = p_candidate_page_id
                           then p_candidate_word_count else p.word_count end), 0)
    into v_total
    from projects pr
    join chapters c on c.project_id = pr.id
    join pages p on p.chapter_id = c.id
   where pr.user_id = auth.uid();
  return coalesce(v_total, 0) + coalesce(case when p_candidate_page_id is null then p_candidate_word_count end, 0);
end; $$;
`);

{
  const grow = await trySave(650);
  check('D1: growth save (typing) fails with EXACT production error',
    grow.error?.message === 'relation "projects" does not exist',
    JSON.stringify(grow.error ?? grow.res));
  const shrink = await trySave(0);
  check('D1: non-growth save skips the limit branch and still succeeds',
    shrink.res?.status === 'ok', JSON.stringify(shrink.res ?? shrink.error));
}

// ── Distinguishing fingerprints of the other drift locations
await db.exec(MIG011); // restore canonical, then break free_word_limit_for_caller
await db.exec(`
create or replace function public.free_word_limit_for_caller()
returns int language plpgsql stable set search_path = ''
as $$
declare v_tier text; v_cohort text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select subscription_tier into v_tier from profiles where id = auth.uid();
  if coalesce(v_tier,'free') <> 'free' then return null; end if;
  select coalesce(pricing_cohort,'starter_2k') into v_cohort from user_pricing_entitlements where user_id = auth.uid();
  return case coalesce(v_cohort,'starter_2k') when 'legacy_15k' then 15000 else 2000 end;
end; $$;
`);
{
  const grow = await trySave(651);
  check('D2: unqualified free_word_limit_for_caller yields "profiles" instead',
    grow.error?.message === 'relation "profiles" does not exist', JSON.stringify(grow.error ?? grow.res));
}

await db.exec(MIG011);
await db.exec(`
create or replace function public.save_page_checked(
  p_page_id uuid, p_content jsonb, p_word_count int, p_expected_version int default null
) returns jsonb language plpgsql set search_path = ''
as $$
declare v_old int;
begin
  select word_count into v_old from pages where id = p_page_id;
  return jsonb_build_object('status','ok');
end; $$;
`);
{
  const grow = await trySave(652);
  check('D3: unqualified save_page_checked body yields "pages" instead',
    grow.error?.message === 'relation "pages" does not exist', JSON.stringify(grow.error ?? grow.res));
}

// ── Migration 012 repairs the drifted database ──────────────────────────────
// Restore canonical state first (D3 broke save_page_checked), then recreate
// the production-like drifted state (D1) and apply 012.
await db.exec(MIG011);
await db.exec(`
create or replace function public.account_word_total(
  p_candidate_page_id uuid default null, p_candidate_word_count int default null
) returns int language plpgsql stable set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  return (select coalesce(sum(word_count),0) from projects);
end; $$;
`);
// also plant the stale 3-arg overload 012 must defensively drop
await db.exec(`
create or replace function public.account_word_total(a uuid, b uuid, c int)
returns int language sql stable as $$ select 0 $$;
`);

{
  const broken = await trySave(653);
  check('012-pre: drifted DB fails with the production error',
    broken.error?.message === 'relation "projects" does not exist', JSON.stringify(broken.error ?? broken.res));
}

const MIG012 = fs.readFileSync(MIG012_PATH, 'utf8');
await db.exec(MIG012);
await db.exec(MIG012); // idempotency: applying twice must be safe

{
  const fixed = await trySave(653);
  check('012-post: growth save succeeds after migration 012', fixed.res?.status === 'ok', JSON.stringify(fixed.res ?? fixed.error));
  const row = (await db.query(`select word_count, version from public.pages where id=$1`, [P1])).rows[0];
  check('012-post: row persisted with typed word count', row.word_count === 653, JSON.stringify(row));
  const overloads = (await db.query(`
    select count(*)::int as n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname='public' and p.proname='account_word_total'`)).rows[0].n;
  check('012-post: exactly one account_word_total remains (stale overload dropped)', overloads === 1, 'count=' + overloads);
  const blocked = await trySave(2500);
  check('012-post: word-limit still enforced (2500 > 2000 blocked)',
    blocked.res?.status === 'word_limit_blocked', JSON.stringify(blocked.res ?? blocked.error));
  // non-owner still cannot save
  await db.exec(`insert into public.profiles (id) values ('22222222-2222-2222-2222-222222222222') on conflict do nothing;`);
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);`);
  let other;
  try {
    const r = await db.query(`select public.save_page_checked($1::uuid,'{}'::jsonb,10,null::int) as res`, [P1]);
    other = r.rows[0].res;
  } finally { await db.exec(`reset role;`); }
  check('012-post: non-owner gets "Page not found" (RLS intact)', other?.status === 'error' && other?.error === 'Page not found', JSON.stringify(other));
}

let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '   [' + r.detail + ']' : ''}`);
}
process.exit(failed ? 1 : 0);
