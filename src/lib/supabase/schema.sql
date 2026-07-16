-- ═══════════════════════════════════════════════════════════════════
--  Rune — Database Schema
-- ═══════════════════════════════════════════════════════════════════

-- ── profiles ────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id                       uuid        primary key references auth.users (id) on delete cascade,
  username                 text        unique,
  display_name             text,
  avatar_url               text,
  xp                       integer     not null default 0,
  level                    integer     not null default 1,
  preferences              jsonb,
  has_written_first_words  boolean     not null default false,
  is_admin                 boolean     not null default false,
  created_at               timestamptz not null default now()
);

-- ── Migration: onboarding flag (run once on existing databases) ──────
-- alter table public.profiles
--   add column if not exists has_written_first_words boolean not null default false;
--
-- Mark existing users who have already written words as done with onboarding:
-- update public.profiles p
-- set has_written_first_words = true
-- where exists (
--   select 1 from public.projects proj
--   join public.chapters c on c.project_id = proj.id
--   join public.pages pg on pg.chapter_id = c.id
--   where proj.user_id = p.id and pg.word_count > 0
-- );

-- ── Migration: admin access, for Pulse (run once on existing databases) ─
-- alter table public.profiles
--   add column if not exists is_admin boolean not null default false;
--
-- Grant yourself access (run manually, once, in the Supabase SQL editor):
-- update public.profiles set is_admin = true where id = '<your-user-id>';

-- ── projects ────────────────────────────────────────────────────────
create table if not exists public.projects (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references public.profiles (id) on delete cascade,
  title        text        not null,
  description  text,
  cover_color  text,
  word_count   integer     not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── chapters ────────────────────────────────────────────────────────
create table if not exists public.chapters (
  id          uuid        primary key default gen_random_uuid(),
  project_id  uuid        not null references public.projects (id) on delete cascade,
  title       text        not null,
  position    integer     not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── pages ───────────────────────────────────────────────────────────
create table if not exists public.pages (
  id          uuid        primary key default gen_random_uuid(),
  chapter_id  uuid        not null references public.chapters (id) on delete cascade,
  title       text        not null,
  content     jsonb,
  word_count  integer     not null default 0,
  position    integer     not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── game_sessions ────────────────────────────────────────────────────
create table if not exists public.game_sessions (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references public.profiles (id) on delete cascade,
  mode             text        not null,
  words_written    integer     not null default 0,
  duration_seconds integer,
  xp_earned        integer     not null default 0,
  completed        boolean     not null default false,
  enemy_type       text,
  created_at       timestamptz not null default now()
);

-- Existing projects created before enemy_type: run once in Supabase SQL if inserts fail:
-- alter table public.game_sessions add column if not exists enemy_type text;

-- ── xp_events ────────────────────────────────────────────────────────
create table if not exists public.xp_events (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references public.profiles (id) on delete cascade,
  amount            integer     not null,
  reason            text        not null,
  source_session_id uuid,
  created_at        timestamptz not null default now()
);

-- Run once in Supabase SQL if xp_events already exists:
-- alter table public.xp_events add column if not exists source_session_id uuid;

-- ═══════════════════════════════════════════════════════════════════
--  Row Level Security
-- ═══════════════════════════════════════════════════════════════════

alter table public.profiles      enable row level security;
alter table public.projects      enable row level security;
alter table public.chapters      enable row level security;
alter table public.pages         enable row level security;
alter table public.game_sessions enable row level security;
alter table public.xp_events     enable row level security;

-- profiles: users manage only their own row
create policy "profiles: select own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: update own"
  on public.profiles for update
  using (auth.uid() = id);

-- Guard against privilege escalation: the "update own" policy above has no
-- WITH CHECK restricting which columns change, so without this trigger any
-- authenticated user could grant themselves admin access with a direct
-- PostgREST PATCH request. Only requests carrying an 'authenticated' JWT
-- role are blocked from changing is_admin — manual grants via the Supabase
-- SQL editor (no JWT, auth.role() is null) and service-role writes both
-- pass through untouched.
create or replace function public.protect_is_admin()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() = 'authenticated' and new.is_admin is distinct from old.is_admin then
    new.is_admin := old.is_admin;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_is_admin
  before update on public.profiles
  for each row execute function public.protect_is_admin();

-- ── Migration: protect is_admin from self-escalation (run once on existing databases) ─
-- create or replace function public.protect_is_admin()
-- returns trigger
-- language plpgsql
-- security definer set search_path = public
-- as $$
-- begin
--   if auth.role() = 'authenticated' and new.is_admin is distinct from old.is_admin then
--     new.is_admin := old.is_admin;
--   end if;
--   return new;
-- end;
-- $$;
-- drop trigger if exists profiles_protect_is_admin on public.profiles;
-- create trigger profiles_protect_is_admin
--   before update on public.profiles
--   for each row execute function public.protect_is_admin();

-- Guard against privilege escalation on billing columns: same gap as above —
-- "update own" has no WITH CHECK, so without this trigger any authenticated
-- user could PATCH subscription_tier to 'scribe', or point stripe_customer_id
-- at an arbitrary Stripe customer, directly. stripe_customer_id is now
-- protected: its write path moved to service-role code in
-- getOrCreateStripeCustomerId (src/lib/actions/billing.ts), so there is no
-- longer any legitimate reason for an authenticated client to write it.
-- Added by migration 009.
create or replace function public.protect_billing_columns()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.role() = 'authenticated' then
    if new.subscription_tier is distinct from old.subscription_tier then
      new.subscription_tier := old.subscription_tier;
    end if;
    if new.subscription_status is distinct from old.subscription_status then
      new.subscription_status := old.subscription_status;
    end if;
    if new.subscription_price_id is distinct from old.subscription_price_id then
      new.subscription_price_id := old.subscription_price_id;
    end if;
    if new.subscription_period_end is distinct from old.subscription_period_end then
      new.subscription_period_end := old.subscription_period_end;
    end if;
    if new.stripe_customer_id is distinct from old.stripe_customer_id then
      new.stripe_customer_id := old.stripe_customer_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_billing_columns
  before update on public.profiles
  for each row execute function public.protect_billing_columns();

-- ── Migration: protect billing columns from self-escalation (run once on existing databases, migration 009) ─
-- create or replace function public.protect_billing_columns()
-- returns trigger
-- language plpgsql
-- security definer set search_path = ''
-- as $$
-- begin
--   if auth.role() = 'authenticated' then
--     if new.subscription_tier is distinct from old.subscription_tier then
--       new.subscription_tier := old.subscription_tier;
--     end if;
--     if new.subscription_status is distinct from old.subscription_status then
--       new.subscription_status := old.subscription_status;
--     end if;
--     if new.subscription_price_id is distinct from old.subscription_price_id then
--       new.subscription_price_id := old.subscription_price_id;
--     end if;
--     if new.subscription_period_end is distinct from old.subscription_period_end then
--       new.subscription_period_end := old.subscription_period_end;
--     end if;
--     if new.stripe_customer_id is distinct from old.stripe_customer_id then
--       new.stripe_customer_id := old.stripe_customer_id;
--     end if;
--   end if;
--   return new;
-- end;
-- $$;
-- drop trigger if exists profiles_protect_billing_columns on public.profiles;
-- create trigger profiles_protect_billing_columns
--   before update on public.profiles
--   for each row execute function public.protect_billing_columns();

-- projects: users manaehage only their own projects
create policy "projects: select own"
  on public.projects for select
  using (auth.uid() = user_id);

create policy "projects: insert own"
  on public.pmusirojects for insert
  with check (auth.uid() = user_id);

create policy "projects: update own"
  on public.projects for update
  using (auth.uid() = user_id);

create policy "projects: delete own"
  on public.projects for delete
  using (auth.uid() = user_id);

-- chapters: access derived from project ownership
create policy "chapters: select own"
  on public.chapters for select
  using (
    exists (
      select 1 from public.projects
      where projects.id = chapters.project_id
        and projects.user_id = auth.uid()
    )
  );

create policy "chapters: insert own"
  on public.chapters for insert
  with check (
    exists (
      select 1 from public.projects
      where projects.id = chapters.project_id
        and projects.user_id = auth.uid()
    )
  );

create policy "chapters: update own"
  on public.chapters for update
  using (
    exists (
      select 1 from public.projects
      where projects.id = chapters.project_id
        and projects.user_id = auth.uid()
    )
  );

create policy "chapters: delete own"
  on public.chapters for delete
  using (
    exists (
      select 1 from public.projects
      where projects.id = chapters.project_id
        and projects.user_id = auth.uid()
    )
  );

-- pages: access derived from chapter → project ownership
create policy "pages: select own"
  on public.pages for select
  using (
    exists (
      select 1 from public.chapters
      join public.projects on projects.id = chapters.project_id
      where chapters.id = pages.chapter_id
        and projects.user_id = auth.uid()
    )
  );

create policy "pages: insert own"
  on public.pages for insert
  with check (
    exists (
      select 1 from public.chapters
      join public.projects on projects.id = chapters.project_id
      where chapters.id = pages.chapter_id
        and projects.user_id = auth.uid()
    )
  );

create policy "pages: update own"
  on public.pages for update
  using (
    exists (
      select 1 from public.chapters
      join public.projects on projects.id = chapters.project_id
      where chapters.id = pages.chapter_id
        and projects.user_id = auth.uid()
    )
  );

create policy "pages: delete own"
  on public.pages for delete
  using (
    exists (
      select 1 from public.chapters
      join public.projects on projects.id = chapters.project_id
      where chapters.id = pages.chapter_id
        and projects.user_id = auth.uid()
    )
  );

-- game_sessions: users manage only their own sessions
create policy "game_sessions: select own"
  on public.game_sessions for select
  using (auth.uid() = user_id);

create policy "game_sessions: insert own"
  on public.game_sessions for insert
  with check (auth.uid() = user_id);

create policy "game_sessions: update own"
  on public.game_sessions for update
  using (auth.uid() = user_id);

create policy "game_sessions: delete own"
  on public.game_sessions for delete
  using (auth.uid() = user_id);

-- xp_events: users can read and insert their own events
create policy "xp_events: select own"
  on public.xp_events for select
  using (auth.uid() = user_id);

create policy "xp_events: insert own"
  on public.xp_events for insert
  with check (auth.uid() = user_id);

-- ── user_unlockables ─────────────────────────────────────────────────
create table if not exists public.user_unlockables (
  user_id       uuid        not null references public.profiles (id) on delete cascade,
  unlockable_id text        not null,
  unlocked_at   timestamptz not null default now(),
  primary key (user_id, unlockable_id)
);

alter table public.user_unlockables enable row level security;

create policy "user_unlockables: select own"
  on public.user_unlockables for select
  using (auth.uid() = user_id);

create policy "user_unlockables: insert own"
  on public.user_unlockables for insert
  with check (auth.uid() = user_id);

-- ── project_notes ────────────────────────────────────────────────────
create table if not exists public.project_notes (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references public.profiles (id) on delete cascade,
  project_id    uuid        not null references public.projects (id) on delete cascade,
  content       text        not null,
  is_completed  boolean     not null default false,
  is_pinned     boolean     not null default false,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz,
  updated_at    timestamptz not null default now()
);

alter table public.project_notes enable row level security;

create policy "project_notes: select own"
  on public.project_notes for select
  using (auth.uid() = user_id);

create policy "project_notes: insert own"
  on public.project_notes for insert
  with check (auth.uid() = user_id);

create policy "project_notes: update own"
  on public.project_notes for update
  using (auth.uid() = user_id);

create policy "project_notes: delete own"
  on public.project_notes for delete
  using (auth.uid() = user_id);

-- ── Migration: add project_notes (run once on existing databases) ────
-- create table if not exists public.project_notes ( ... see above ... );

-- ── future_letters ────────────────────────────────────────────────────
-- Private letters writers leave for themselves during onboarding, tied to
-- the project created in the same request. Not shown anywhere in the
-- product yet — resurfacing UI/notifications are a future phase.
create table if not exists public.future_letters (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references public.profiles (id) on delete cascade,
  project_id   uuid        not null references public.projects (id) on delete cascade,
  content      text        not null,
  created_at   timestamptz not null default now(),
  reveal_at    timestamptz not null default (now() + interval '1 year'),
  revealed_at  timestamptz
);

alter table public.future_letters enable row level security;

create policy "future_letters: select own"
  on public.future_letters for select
  using (auth.uid() = user_id);

create policy "future_letters: insert own"
  on public.future_letters for insert
  with check (auth.uid() = user_id);

create policy "future_letters: update own"
  on public.future_letters for update
  using (auth.uid() = user_id);

create policy "future_letters: delete own"
  on public.future_letters for delete
  using (auth.uid() = user_id);

-- ── Migration: add future_letters (run once on existing databases) ───
-- See src/lib/supabase/migrations/008_future_letters.sql for the exact SQL.
-- alter table public.project_notes enable row level security;
-- (create policies as above)
--
-- ── Migration: drop legacy tasks table (run once on existing databases) ─
-- drop table if exists public.tasks cascade;

-- ── deleted_accounts ────────────────────────────────────────────────
-- Admin-only audit log. RLS is enabled but no user-facing policies exist,
-- so only the service role key can read or write rows. Regular users never
-- touch this table. Records persist forever after the originating auth user
-- is deleted. Use the Supabase Table Editor (service role) to view them.
create table if not exists public.deleted_accounts (
  id                    uuid        primary key default gen_random_uuid(),
  original_user_id      uuid        not null,
  email                 text,
  username              text,
  display_name          text,
  xp                    integer,
  level                 integer,
  subscription_tier     text,
  -- Captured at deletion time from analytics_excluded_users, which cascades
  -- away with the profile — this is the only durable record of exclusion
  -- status once that row is gone. Not personal data; a plain boolean. See
  -- migration 010. No Pulse metric reads this yet (no account-deletion
  -- metric exists today), but a future one can filter on it correctly.
  was_excluded_account  boolean     not null default false,
  deleted_at            timestamptz not null default now()
);

alter table public.deleted_accounts enable row level security;
-- No policies — only the service-role key (never exposed to clients) can access.

-- ── Migration: add deleted_accounts (run once on existing databases) ─
-- create table if not exists public.deleted_accounts (
--   id                uuid        primary key default gen_random_uuid(),
--   original_user_id  uuid        not null,
--   email             text,
--   username          text,
--   display_name      text,
--   xp                integer,
--   level             integer,
--   subscription_tier text,
--   deleted_at        timestamptz not null default now()
-- );
-- alter table public.deleted_accounts enable row level security;

-- ── Migration: was_excluded_account on deleted_accounts (run once on existing databases) ─
-- alter table public.deleted_accounts
--   add column if not exists was_excluded_account boolean not null default false;

-- ── analytics_events ─────────────────────────────────────────────────
-- First-party product analytics. RLS is enabled but no user-facing policies
-- exist, so only the service-role key can read or write rows — same pattern
-- as deleted_accounts. All writes go through recordAnalyticsEvent() in
-- src/lib/actions/analytics.ts, which always supplies a dedupe_key (see the
-- unique index below), so a plain upsert with ignoreDuplicates is enough —
-- no SECURITY DEFINER RPC is needed for this table.
create table if not exists public.analytics_events (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        references public.profiles (id) on delete cascade,
  event_name   text        not null,
  project_id   uuid        references public.projects (id) on delete cascade,
  local_date   date,
  metadata     jsonb,
  dedupe_key   text,
  created_at   timestamptz not null default now()
);

alter table public.analytics_events enable row level security;
-- No policies — only the service-role key (never exposed to clients) can access.

-- User timelines: "everything that happened for this user, in order"
create index if not exists analytics_events_user_created_idx
  on public.analytics_events (user_id, created_at);

-- Funnel queries: "how many users hit event X, and when"
create index if not exists analytics_events_name_created_idx
  on public.analytics_events (event_name, created_at);

-- Deduplication (one-time milestones and repeatable-but-idempotent events).
-- recordAnalyticsEvent() always populates dedupe_key — either a caller-
-- supplied value (e.g. a local_date, or "session_2") for events that
-- legitimately repeat, or a fixed sentinel for true one-time milestones —
-- so a single non-partial unique index covers both cases.
create unique index if not exists analytics_events_dedupe_idx
  on public.analytics_events (user_id, event_name, dedupe_key);

-- ── Migration: add analytics_events (run once on existing databases) ─
-- create table if not exists public.analytics_events (
--   id           uuid        primary key default gen_random_uuid(),
--   user_id      uuid        references public.profiles (id) on delete cascade,
--   event_name   text        not null,
--   project_id   uuid        references public.projects (id) on delete cascade,
--   local_date   date,
--   metadata     jsonb,
--   dedupe_key   text,
--   created_at   timestamptz not null default now()
-- );
-- alter table public.analytics_events enable row level security;
-- create index if not exists analytics_events_user_created_idx
--   on public.analytics_events (user_id, created_at);
-- create index if not exists analytics_events_name_created_idx
--   on public.analytics_events (event_name, created_at);
-- create unique index if not exists analytics_events_dedupe_idx
--   on public.analytics_events (user_id, event_name, dedupe_key);

-- ── acquisition_attribution ──────────────────────────────────────────
-- First-touch UTM/campaign attribution. One row per user, written once at
-- signup and never overwritten. Schema only for now — no capture logic
-- exists yet; a later phase will read a landing-page cookie and insert here
-- with `on conflict (user_id) do nothing` for first-touch-wins semantics.
create table if not exists public.acquisition_attribution (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null unique references public.profiles (id) on delete cascade,
  source       text,
  medium       text,
  campaign     text,
  content      text,
  term         text,
  fbclid       text,
  landing_path text,
  captured_at  timestamptz,
  created_at   timestamptz not null default now()
);

alter table public.acquisition_attribution enable row level security;
-- No policies — only the service-role key (never exposed to clients) can access.

-- ── Migration: add acquisition_attribution (run once on existing databases) ─
-- create table if not exists public.acquisition_attribution (
--   id           uuid        primary key default gen_random_uuid(),
--   user_id      uuid        not null unique references public.profiles (id) on delete cascade,
--   source       text,
--   medium       text,
--   campaign     text,
--   content      text,
--   term         text,
--   fbclid       text,
--   landing_path text,
--   captured_at  timestamptz,
--   created_at   timestamptz not null default now()
-- );
-- alter table public.acquisition_attribution enable row level security;

-- ── founder_notes ───────────────────────────────────────────────────
-- Pulse's "Open Questions" panel — lightweight, manually-written product
-- hypotheses (e.g. "Is onboarding too long?"). Admin-only, same zero-policy
-- RLS pattern as deleted_accounts/analytics_events. Not tied to a specific
-- writer's account, so no cascade-delete relationship to profiles.
create table if not exists public.founder_notes (
  id         uuid        primary key default gen_random_uuid(),
  author_id  uuid        references public.profiles (id) on delete set null,
  content    text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.founder_notes enable row level security;
-- No policies — only the service-role key (never exposed to clients) can access.

-- ── Migration: add founder_notes (run once on existing databases) ────
-- create table if not exists public.founder_notes (
--   id         uuid        primary key default gen_random_uuid(),
--   author_id  uuid        references public.profiles (id) on delete set null,
--   content    text        not null,
--   created_at timestamptz not null default now(),
--   updated_at timestamptz not null default now()
-- );
-- alter table public.founder_notes enable row level security;

-- ── analytics_excluded_users ─────────────────────────────────────────
-- Founder/test-account exclusion for Pulse. Pure allowlist of accounts whose
-- analytics_events rows remain stored but are filtered out of Pulse's default
-- aggregate metrics — see getExcludedUserIds() in src/lib/actions/pulse.ts.
-- Same zero-policy RLS pattern as analytics_events/deleted_accounts/
-- founder_notes. Added by migration 010.
create table if not exists public.analytics_excluded_users (
  user_id    uuid        primary key references public.profiles (id) on delete cascade,
  reason     text,
  created_by uuid        references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.analytics_excluded_users enable row level security;
-- No policies — only the service-role key (never exposed to clients) can access.

-- ── Migration: add analytics_excluded_users (run once on existing databases) ─
-- create table if not exists public.analytics_excluded_users (
--   user_id    uuid        primary key references public.profiles (id) on delete cascade,
--   reason     text,
--   created_by uuid        references public.profiles (id) on delete set null,
--   created_at timestamptz not null default now()
-- );
-- alter table public.analytics_excluded_users enable row level security;

-- ── user_pricing_entitlements ────────────────────────────────────────
-- Trusted, server-only pricing/word-limit entitlement. Deliberately a
-- separate table rather than columns on `profiles` (see the RLS note above
-- protect_billing_columns) — there is NO insert/update/delete policy for
-- authenticated users at all, so it can't be self-escalated by construction.
-- All writes go through service-role server actions (src/lib/actions/pricing.ts)
-- or the Stripe webhook. Added by migration 009.
create table if not exists public.user_pricing_entitlements (
  user_id                     uuid        primary key references public.profiles(id) on delete cascade,
  pricing_cohort              text        not null default 'starter_2k' check (pricing_cohort in ('legacy_15k','starter_2k')),
  pricing_notice_resolved_at  timestamptz,
  founder_offer_status        text        not null default 'not_offered' check (founder_offer_status in ('not_offered','eligible','claimed','declined')),
  founder_offer_claimed_at    timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists user_pricing_entitlements_cohort_idx
  on public.user_pricing_entitlements (pricing_cohort);

alter table public.user_pricing_entitlements enable row level security;

create policy "user_pricing_entitlements: select own"
  on public.user_pricing_entitlements for select
  using (auth.uid() = user_id);

create or replace function public.touch_pricing_entitlement_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger user_pricing_entitlements_touch_updated_at
  before update on public.user_pricing_entitlements
  for each row execute function public.touch_pricing_entitlement_updated_at();

-- ── Migration: add user_pricing_entitlements + backfill + protect_billing_columns (run once on existing databases, migration 009) ─
-- See src/lib/supabase/migrations/009_pricing_cohorts.sql for the full,
-- ordered script (table creation, trigger replacement, legacy backfill,
-- protect_billing_columns, starter_2k repair pass, and a final assertion
-- that aborts the whole migration if any profile is left unclassified) —
-- run that file directly in the Supabase SQL editor rather than
-- reassembling it from this comment.

-- ═══════════════════════════════════════════════════════════════════
--  Auto-create profile on signup
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    display_name,
    avatar_url,
    xp,
    level,
    has_written_first_words,
    subscription_tier
  ) values (
    new.id,
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'avatar_url',
    0,
    1,
    false,
    'free'
  );

  insert into public.user_pricing_entitlements (
    user_id,
    pricing_cohort,
    founder_offer_status
  ) values (
    new.id,
    'starter_2k',
    'not_offered'
  );

  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
