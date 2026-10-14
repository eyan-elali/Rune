-- ── Migration 058: the first touch's referring site ──────────────────────────
--
-- The launch funnel (Pulse) buckets each writer's first touch into a channel:
-- campaign parameters decide when present; without them, the site the writer
-- arrived from (Organic search, Instagram, Referral …) is the only honest
-- signal, and acquisition_attribution had nowhere to keep it.
--
-- This migration adds, and changes nothing else:
--
-- public.acquisition_attribution.referrer_host text — the referring site's
--   HOST only (e.g. "google.com", "l.instagram.com"), never a path or query.
--   Null for a campaign-tagged touch without a referrer and for every row
--   written before this migration (no backfill: unknown stays unknown).
--
-- The table's RLS (enabled, no user-facing policies — service role only), its
-- one-row-per-user constraint and first-touch-wins upsert are unchanged.
--
-- Apply before or after the app deploy: the app retries the attribution write
-- without referrer_host on a database that lacks the column.
-- Rollback:
--   alter table public.acquisition_attribution drop column if exists referrer_host;
--   delete from public.schema_migrations where version = '058';

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 058 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '058') then
    raise exception 'Migration 058 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '057') then
    raise exception 'Migration 058 requires migration 057 (writing credit). Nothing was changed.';
  end if;
  if to_regclass('public.acquisition_attribution') is null then
    raise exception 'Migration 058 needs public.acquisition_attribution. Nothing was changed.';
  end if;
end
$$;

alter table public.acquisition_attribution
  add column referrer_host text
  constraint acquisition_attribution_referrer_host_len check (referrer_host is null or char_length(referrer_host) <= 200);

insert into public.schema_migrations (version, name, applied_at, note)
values ('058', '058_attribution_referrer.sql', now(), 'acquisition_attribution.referrer_host (host only, nullable, no backfill) for the launch funnel''s channel buckets; RLS and first-touch semantics unchanged');
