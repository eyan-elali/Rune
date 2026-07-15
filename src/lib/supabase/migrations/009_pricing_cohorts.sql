-- ── Migration 009: Pricing cohorts (legacy 15k grandfathering + starter 2k) ──
--
-- Splits users into two permanent word-limit cohorts:
--   legacy_15k  — every account that existed before this migration, keeps a
--                 15,000-word free allowance per project forever.
--   starter_2k  — every account created after this migration, gets a
--                 2,000-word free allowance per project.
--
-- Also introduces a private "Founding Scribe" offer ($6.99/mo vs the public
-- $9.99/mo), tracked via founder_offer_status, offered once via a one-time
-- in-app notice to eligible legacy free users only.
--
-- Entitlement lives in its own table rather than on `profiles` because
-- `profiles: update own` (see schema.sql) has no WITH CHECK restricting which
-- columns a user's own client can PATCH — only `is_admin` is protected today.
-- user_pricing_entitlements has NO update/insert/delete policy for
-- authenticated users at all, so it can't be self-escalated by construction.
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: table + RLS + index.
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

drop policy if exists "user_pricing_entitlements: select own" on public.user_pricing_entitlements;
create policy "user_pricing_entitlements: select own"
  on public.user_pricing_entitlements for select
  using (auth.uid() = user_id);

-- Deliberately NO insert/update/delete policy for authenticated users here.
-- All writes happen through service-role server actions (src/lib/actions/pricing.ts)
-- or the Stripe webhook (src/app/api/webhooks/stripe/route.ts).
--
-- No explicit GRANT/REVOKE statements are added here: this repo's existing
-- convention (schema.sql, all of migrations 001-008) relies entirely on RLS
-- + policies for access control and never issues table-level GRANT/REVOKE —
-- Supabase's default schema-level grants to anon/authenticated/service_role
-- are left as-is everywhere else, with RLS as the sole gate. Adding explicit
-- per-table privileges here would introduce a pattern not used anywhere
-- else in the schema; flagging this as a deliberate omission rather than an
-- oversight — see the accompanying chat response for the reasoning.

create or replace function public.touch_pricing_entitlement_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_pricing_entitlements_touch_updated_at on public.user_pricing_entitlements;
create trigger user_pricing_entitlements_touch_updated_at
  before update on public.user_pricing_entitlements
  for each row execute function public.touch_pricing_entitlement_updated_at();

-- Step 2: make new signups authoritative BEFORE backfilling existing users,
-- so any signup that lands during this migration gets starter_2k immediately
-- rather than depending on statement ordering for correctness (see the
-- repair pass and hard-guarantee assertion at the end of this file).
--
-- search_path = '' (not `= public`): every object this function touches is
-- schema-qualified below (public.profiles, public.user_pricing_entitlements),
-- so an empty search path can't be hijacked by an object created in a
-- schema that would otherwise resolve first — pg_catalog is still always
-- implicitly searched by Postgres regardless, so built-ins are unaffected.
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

-- Step 3: backfill every existing profile as legacy_15k — this cohort
-- assignment (and the 15,000-word allowance it carries) is unconditional for
-- every pre-migration account. The founder_offer_status is more restrictive:
--   - subscription_tier = 'scribe' (paid at migration)   -> 'not_offered', permanently
--   - free AND has at least one project at migration time -> 'eligible'
--   - free with NO project at migration time              -> 'not_offered'
-- The last case matters: without it, a legacy account that had never
-- written anything before the migration would become founder-eligible the
-- moment it completes onboarding for the first time post-migration (since
-- completing onboarding is itself part of the pricing notice's *other*
-- eligibility condition — see showPricingNotice in app/(app)/layout.tsx).
-- Restricting eligibility to accounts that already had a project AT
-- MIGRATION TIME (not just "eventually has one") keeps the founding offer
-- for genuine returning early users, not brand-new accounts that happen to
-- land in the legacy_15k cohort by a migration-timing accident.
insert into public.user_pricing_entitlements (user_id, pricing_cohort, founder_offer_status)
select
  p.id,
  'legacy_15k',
  case
    when p.subscription_tier = 'scribe' then 'not_offered'
    when exists (select 1 from public.projects pr where pr.user_id = p.id) then 'eligible'
    else 'not_offered'
  end
from public.profiles p
on conflict (user_id) do nothing;

-- Step 4: close a pre-existing privilege-escalation gap on `profiles`.
-- "profiles: update own" (schema.sql) has no WITH CHECK, so an authenticated
-- user's own PostgREST client could otherwise PATCH subscription_tier/status/
-- price_id/period_end/stripe_customer_id directly and self-grant Scribe
-- entitlement (or point their account at an arbitrary Stripe customer).
-- Mirrors the existing protect_is_admin() pattern exactly.
--
-- stripe_customer_id is now protected too (previously excluded, since it was
-- written by the user's own authenticated session in billing.ts/
-- checkout/route.ts — that write path has been moved to service-role code,
-- see getOrCreateStripeCustomerId in src/lib/actions/billing.ts, so there is
-- no longer any legitimate reason for an authenticated client to write it).
--
-- search_path = '' for the same reason as handle_new_user() above — the only
-- non-pg_catalog reference here, auth.role(), is already schema-qualified.
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

drop trigger if exists profiles_protect_billing_columns on public.profiles;
create trigger profiles_protect_billing_columns
  before update on public.profiles
  for each row execute function public.protect_billing_columns();

-- Step 5: repair pass. This narrows — it does not by itself mathematically
-- eliminate — the migration-window race where a signup could land between
-- the trigger replacement in Step 2 and this statement's own snapshot:
-- running it last, immediately before commit, means it sees any profile
-- committed up to that point, including one that raced in and used the OLD
-- trigger. Any profile still missing an entitlement row after Step 3 gets
-- the safe, tighter starter_2k default rather than being left absent. The
-- hard guarantee is Step 6 below, not this statement: Step 6 aborts the
-- entire migration if any gap remains, rather than assuming this pass alone
-- closed it.
insert into public.user_pricing_entitlements (user_id, pricing_cohort, founder_offer_status)
select p.id, 'starter_2k', 'not_offered'
from public.profiles p
on conflict (user_id) do nothing;

-- Step 6: hard guarantee. If any public.profiles row still lacks a
-- public.user_pricing_entitlements row at this point — a bug in the steps
-- above, not merely an unlucky timing window — abort the entire migration
-- (this raise rolls back everything in the same transaction) rather than
-- silently leaving accounts unclassified, which the app would otherwise
-- paper over by defaulting a missing row to starter_2k at read time.
do $$
declare
  missing_count integer;
begin
  select count(*)
    into missing_count
  from public.profiles p
  left join public.user_pricing_entitlements upe on upe.user_id = p.id
  where upe.user_id is null;

  if missing_count > 0 then
    raise exception
      'Migration 009 aborted: % public.profiles row(s) have no matching public.user_pricing_entitlements row',
      missing_count;
  end if;
end;
$$;
