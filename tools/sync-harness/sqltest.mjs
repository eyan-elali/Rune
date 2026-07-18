// Runs migration 011's functions in REAL Postgres (PGlite/WASM) with a faithful
// subset of the Rune schema: RLS policies, the migration-006 version trigger,
// migration-009 entitlements table, and a mocked auth.uid() reading a GUC.
// Verifies save_page_checked's contract as committed, and captures the exact
// failure fingerprints of two suspected production drift states.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

const db = new PGlite();
const MIG011 = fs.readFileSync(new URL('../../src/lib/supabase/migrations/011_account_word_limit.sql', import.meta.url).pathname, 'utf8')
  // grants reference supabase roles; map to our local test role
  .replaceAll('to authenticated', 'to authenticated');

const U1 = '11111111-1111-1111-1111-111111111111';
const U2 = '22222222-2222-2222-2222-222222222222';

const results = [];
function check(name, cond, detail = '') { results.push({ name, pass: !!cond, detail }); }

async function asUser(uid, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}

async function rpc(sql, params = []) {
  try {
    const r = await db.query(sql, params);
    return { rows: r.rows, error: null };
  } catch (e) {
    return { rows: null, error: { message: e.message, code: e.code } };
  }
}

// ── Schema setup (faithful subset) ──────────────────────────────────────────
await db.exec(`
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create role authenticated;

create table public.profiles (
  id uuid primary key,
  subscription_tier text not null default 'free'
);
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  title text not null default 't',
  description text, cover_color text,
  word_count int not null default 0
);
create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  title text not null default 'c',
  position int not null default 0
);
create table public.pages (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters(id),
  title text not null default 'p',
  content jsonb,
  word_count int not null default 0,
  position int not null default 0,
  is_canonical boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1
);
create table public.user_pricing_entitlements (
  user_id uuid primary key references public.profiles(id),
  pricing_cohort text not null default 'starter_2k'
);

-- migration 006 trigger
create function public.increment_page_version() returns trigger as $$
begin
  new.version = old.version + 1;
  new.updated_at = now();
  return new;
end; $$ language plpgsql;
create trigger page_version_trigger before update on public.pages
  for each row execute function public.increment_page_version();

-- RLS (as in schema.sql)
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.chapters enable row level security;
alter table public.pages enable row level security;
alter table public.user_pricing_entitlements enable row level security;

create policy "profiles: select own" on public.profiles for select using (auth.uid() = id);
create policy "projects: select own" on public.projects for select using (user_id = auth.uid());
create policy "chapters: select own" on public.chapters for select using (
  exists (select 1 from public.projects where projects.id = chapters.project_id and projects.user_id = auth.uid()));
create policy "pages: select own" on public.pages for select using (
  exists (select 1 from public.chapters join public.projects on projects.id = chapters.project_id
          where chapters.id = pages.chapter_id and projects.user_id = auth.uid()));
create policy "pages: update own" on public.pages for update using (
  exists (select 1 from public.chapters join public.projects on projects.id = chapters.project_id
          where chapters.id = pages.chapter_id and projects.user_id = auth.uid()));
create policy "pages: insert own" on public.pages for insert with check (
  exists (select 1 from public.chapters join public.projects on projects.id = chapters.project_id
          where chapters.id = pages.chapter_id and projects.user_id = auth.uid()));
create policy "upe: select own" on public.user_pricing_entitlements for select using (auth.uid() = user_id);

grant usage on schema public, auth to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function auth.uid() to authenticated;
`);

await db.exec(MIG011);

// seed: U1 free/starter_2k, U2 free; project/chapter/page for U1
await db.exec(`
insert into public.profiles (id, subscription_tier) values ('${U1}','free'), ('${U2}','free');
insert into public.user_pricing_entitlements (user_id, pricing_cohort) values ('${U1}','starter_2k');
insert into public.projects (id, user_id) values ('aaaaaaaa-0000-0000-0000-000000000001','${U1}');
insert into public.chapters (id, project_id) values ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001');
insert into public.pages (id, chapter_id) values ('cccccccc-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001');
`);
const P1 = 'cccccccc-0000-0000-0000-000000000001';

// S1: normal growth save on new page, under limit, correct version
{
  const r = await asUser(U1, () => rpc(
    `select public.save_page_checked($1::uuid, $2::jsonb, $3::int, $4::int) as res`,
    [P1, JSON.stringify({ type: 'doc', words: 650 }), 650, 1]
  ));
  const res = r.rows?.[0]?.res;
  check('S1: 650-word save on fresh page returns ok', res?.status === 'ok', JSON.stringify(res ?? r.error));
  const row = (await db.query(`select word_count, version from public.pages where id = $1`, [P1])).rows[0];
  check('S1: row persisted (650 words, version 2)', row.word_count === 650 && row.version === 2, JSON.stringify(row));
}

// S2: stale version → version_mismatch, row untouched
{
  const r = await asUser(U1, () => rpc(
    `select public.save_page_checked($1::uuid, $2::jsonb, $3::int, $4::int) as res`,
    [P1, JSON.stringify({}), 651, 1]
  ));
  check('S2: stale expected_version → version_mismatch', r.rows?.[0]?.res?.status === 'version_mismatch', JSON.stringify(r));
  const row = (await db.query(`select word_count from public.pages where id = $1`, [P1])).rows[0];
  check('S2: row unchanged', row.word_count === 650, '');
}

// S3: growth past 2000 → word_limit_blocked
{
  const r = await asUser(U1, () => rpc(
    `select public.save_page_checked($1::uuid, $2::jsonb, $3::int, null::int) as res`,
    [P1, JSON.stringify({}), 2100]
  ));
  const res = r.rows?.[0]?.res;
  check('S3: 2100 words → word_limit_blocked (limit 2000)', res?.status === 'word_limit_blocked' && res?.limit === 2000, JSON.stringify(res ?? r.error));
}

// S4: null expected_version (Keep Local path) under limit → ok
{
  const r = await asUser(U1, () => rpc(
    `select public.save_page_checked($1::uuid, $2::jsonb, $3::int, null::int) as res`,
    [P1, JSON.stringify({ keepLocal: true }), 700]
  ));
  check('S4: Keep Local path (null version) returns ok', r.rows?.[0]?.res?.status === 'ok', JSON.stringify(r.rows?.[0]?.res ?? r.error));
}

// S5: user with NO entitlements row defaults to starter_2k limit
{
  await db.exec(`
    insert into public.projects (id, user_id) values ('aaaaaaaa-0000-0000-0000-000000000002','${U2}');
    insert into public.chapters (id, project_id) values ('bbbbbbbb-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000002');
    insert into public.pages (id, chapter_id) values ('cccccccc-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000002');
  `);
  const P2 = 'cccccccc-0000-0000-0000-000000000002';
  const ok = await asUser(U2, () => rpc(
    `select public.save_page_checked($1::uuid, $2::jsonb, 500, null::int) as res`, [P2, JSON.stringify({})]
  ));
  check('S5: no entitlements row → default 2k limit, 500-word save ok', ok.rows?.[0]?.res?.status === 'ok', JSON.stringify(ok.rows?.[0]?.res ?? ok.error));
  const blocked = await asUser(U2, () => rpc(
    `select public.save_page_checked($1::uuid, $2::jsonb, 2500, null::int) as res`, [P2, JSON.stringify({})]
  ));
  check('S5: no entitlements row → 2500 words blocked', blocked.rows?.[0]?.res?.status === 'word_limit_blocked', JSON.stringify(blocked.rows?.[0]?.res ?? blocked.error));
}

// S6: cross-user access → page invisible → 'Page not found' error status
{
  const r = await asUser(U2, () => rpc(
    `select public.save_page_checked($1::uuid, $2::jsonb, 10, null::int) as res`, [P1, JSON.stringify({})]
  ));
  const res = r.rows?.[0]?.res;
  check('S6: other user\'s page → status error "Page not found"', res?.status === 'error' && res?.error === 'Page not found', JSON.stringify(res ?? r.error));
}

// S7 FINGERPRINT: stale 3-arg account_word_total draft, 2-arg missing
{
  await db.exec(`
    drop function public.account_word_total(uuid, int);
    create function public.account_word_total(p_project uuid default null, p_page uuid default null, p_wc int default null)
      returns int language sql stable as $$ select 0 $$;
  `);
  const r = await asUser(U1, () => rpc(
    `select public.save_page_checked($1::uuid, $2::jsonb, 800, null::int) as res`, [P1, JSON.stringify({})]
  ));
  check('S7 fingerprint: stale 3-arg overload → RPC raises', r.error !== null, JSON.stringify(r.error));
  // restore
  await db.exec(`drop function public.account_word_total(uuid, uuid, int);`);
  await db.exec(MIG011);
}

// S8 FINGERPRINT: user_pricing_entitlements table missing
{
  await db.exec(`drop table public.user_pricing_entitlements;`);
  const r = await asUser(U1, () => rpc(
    `select public.save_page_checked($1::uuid, $2::jsonb, 900, null::int) as res`, [P1, JSON.stringify({})]
  ));
  check('S8 fingerprint: entitlements table missing → RPC raises', r.error !== null, JSON.stringify(r.error));
}

let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '   [' + r.detail + ']' : ''}`);
}
process.exit(failed ? 1 : 0);
