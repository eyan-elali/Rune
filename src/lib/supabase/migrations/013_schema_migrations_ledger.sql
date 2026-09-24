-- ── Migration 013: schema migrations ledger ─────────────────────────────────
--
-- Rune 2.0 Phase 0. Creates public.schema_migrations, the record of which
-- migrations a database has received, so a migration can never be applied
-- twice by accident. Re-running historical files is actively harmful: for
-- example, re-running 007_fix_signup_trigger.sql would replace the current
-- handle_new_user() with a version that no longer creates pricing
-- entitlements.
--
-- Baseline: src/lib/supabase/schema.sql, generated from the production
-- catalog captured 2026-09-24 (src/lib/supabase/catalog/). Migrations 001–012
-- are contained in that baseline and are recorded here as historical.
--
-- From now on, every migration must:
--   1. start with a guard that raises if its version is already recorded, and
--   2. end by inserting its own row.
-- See the template in src/lib/supabase/migrations/README.md.
--
-- Safety: creates one new table and inserts rows into it. Touches no
-- existing table, function, policy, trigger or data. Rollback:
--   drop table public.schema_migrations;
--
-- Apply as ONE script (Supabase SQL editor "Run", or psql -1). The editor runs
-- a multi-statement script as a single transaction, so any error rolls back
-- everything. Follow tools/db-audit/STAGING.md — never apply to production
-- without the backup and staging rehearsal described there.

do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    raise exception 'Migration 013 has already been applied (public.schema_migrations exists). Nothing was changed.';
  end if;
end
$$;

create table public.schema_migrations (
  version      text        primary key,
  name         text        not null,
  applied_at   timestamptz,               -- null: applied before this ledger existed; exact time unknown
  recorded_at  timestamptz not null default now(),
  note         text
);

-- Service-role / SQL-editor only. RLS with no policies blocks API reads and
-- writes; the explicit revoke also removes Supabase's default table grants
-- (including TRUNCATE, which RLS does not govern) from the API roles.
alter table public.schema_migrations enable row level security;
revoke all on public.schema_migrations from anon, authenticated;

insert into public.schema_migrations (version, name, applied_at, note) values
  ('000', 'production baseline 2026-09-24 (schema.sql)', null,
   'Generated from the production catalog snapshot src/lib/supabase/catalog/production-2026-09-24.json. Fresh databases are built from schema.sql, then migrations 013+.'),
  ('001', '001_canonical_page.sql',              null, 'historical — contained in the baseline; never re-run'),
  ('002', '002_word_goals.sql',                  null, 'historical — contained in the baseline; never re-run. Its unique(user_id, project_id, session_date) was later replaced in production by partial unique indexes.'),
  ('003', '003_chapter_completion.sql',          null, 'historical — contained in the baseline; never re-run'),
  ('004', '004_billing.sql',                     null, 'historical — contained in the baseline; never re-run. Production subscription_events shape differs from this file.'),
  ('005', '005_game_tickets.sql',                null, 'historical — contained in the baseline; never re-run'),
  ('006', '006_offline_sync.sql',                null, 'historical — contained in the baseline; never re-run'),
  ('007', '007_fix_signup_trigger.sql',          null, 'historical — SUPERSEDED by 009; re-running regresses handle_new_user'),
  ('008', '008_future_letters.sql',              null, 'historical — contained in the baseline; never re-run'),
  ('009', '009_pricing_cohorts.sql',             null, 'historical — contained in the baseline; never re-run (contains a one-time backfill)'),
  ('010', '010_analytics_excluded_users.sql',    null, 'historical — contained in the baseline; never re-run'),
  ('011', '011_account_word_limit.sql',          null, 'historical — contained in the baseline; never re-run'),
  ('012', '012_fix_bump_project_updated_at.sql', null, 'historical — contained in the baseline; never re-run'),
  ('013', '013_schema_migrations_ledger.sql',    now(), 'ledger created');
