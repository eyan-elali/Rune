-- ── Migration 010: analytics_excluded_users (founder/test account exclusion) ──
--
-- Lets Pulse exclude specific accounts (the founder's own account, controlled
-- QA/test accounts) from default aggregate metrics without deleting or
-- altering their underlying analytics_events rows. Pure allowlist-style
-- exclusion table, service-role-managed only — no policy lets an
-- authenticated user read or write it, mirroring analytics_events/
-- deleted_accounts/founder_notes (RLS enabled, zero policies).
--
-- user_id references profiles(id) on delete cascade: if an excluded account
-- is later deleted, its analytics_events rows are already cascade-deleted
-- (schema.sql), so the exclusion row has nothing left to exclude — cascading
-- here just avoids leaving a meaningless orphaned row behind.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.analytics_excluded_users (
  user_id    uuid        primary key references public.profiles (id) on delete cascade,
  reason     text,
  created_by uuid        references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.analytics_excluded_users enable row level security;
-- No policies — only the service-role key (never exposed to clients) can access.

-- ── deleted_accounts: preserve exclusion status across the cascade ───────────
--
-- analytics_excluded_users.user_id cascades on profile deletion (by design —
-- once a profile and its analytics_events are gone, there's nothing left to
-- exclude). But deleteAccount() (src/lib/actions/settings.ts) separately
-- writes a permanent audit row to deleted_accounts *before* that cascade
-- fires. Without capturing exclusion status at that moment, a founder/test
-- account's deletion would become indistinguishable from a real writer's
-- churn the instant the cascade erases the link — no metric exists today
-- that reads deleted_accounts, but if one is added later there would be no
-- way to reconstruct which historical deletions were internal.
--
-- A single boolean is enough: it's not personal data, and it's the only
-- durable way to keep a future deletion metric filterable once the FK-linked
-- exclusion row is gone.
alter table public.deleted_accounts
  add column if not exists was_excluded_account boolean not null default false;
