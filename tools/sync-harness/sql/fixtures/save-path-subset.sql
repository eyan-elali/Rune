-- ═══════════════════════════════════════════════════════════════════════════
--  Save-path schema subset (test fixture — load AFTER sql/supabase-shim.sql)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The hand-maintained "faithful subset" the July 2026 incident harness
-- (sqltest.mjs / sqldrift.mjs) used, moved here unchanged apart from roles
-- and auth now coming from the Supabase shim. Enough for migration 011's
-- functions and migration 012's trigger function to run through real RLS and
-- the migration-006 version trigger.
--
-- TEMPORARY: Phase 0 Commit D replaces this with the reconciled, production-
-- equivalent src/lib/supabase/schema.sql. Tests that load this file are then
-- switched over. Do not add new schema here.
--
-- Deliberately NOT created here: trg_page_updated (tests attach either the
-- fixed or the historical broken trigger function themselves).

create table public.profiles (
  id uuid primary key,
  subscription_tier text not null default 'free'
);
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  title text not null default 't',
  description text, cover_color text,
  word_count int not null default 0,
  updated_at timestamptz not null default now()
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
create policy "projects: update own" on public.projects for update using (user_id = auth.uid());
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
