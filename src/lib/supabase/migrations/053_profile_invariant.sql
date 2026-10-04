-- ── Migration 053: Every account in Rune has a profile ──────────────────────
--
-- Rune 2.0, Beta Completion E follow-up. A fresh account on the Rune 2.0
-- database confirmed its email and had no public.profiles row: the signup
-- trigger (on_auth_user_created → handle_new_user, which writes the profile
-- and the pricing entitlement) did not run for it. projects.user_id references
-- profiles, so its first Project failed with projects_user_id_fkey. This
-- migration restores the invariant
--   auth user → verified email → profile (pen name) → beta access → Projects
-- in the database, and gives the app a way to repair the state without
-- service-role access or a placeholder pen name.
--
-- auth.users — on_auth_user_created is (re-)created. It lives on auth.users,
--   outside a public-schema dump, so a restore or a dashboard edit can lose it
--   without anything in public noticing. Dropping and creating it here is the
--   same trigger whether or not it existed.
--
-- public.handle_new_user() — CHANGED: idempotent (on conflict do nothing on
--   both rows). Otherwise identical: the pen name the writer chose at signup
--   (raw_user_meta_data.display_name, or null), starter_2k / not_offered.
--
-- public.complete_profile(p_display_name) — NEW, authenticated. The required
--   profile step (/complete-profile): creates the caller's profile with the pen
--   name they just chose if it is missing (and its pricing entitlement, with
--   the same defaults as signup), or sets the pen name on the existing one.
--   Idempotent: a refresh, a double submit or a repeat call leaves one profile
--   and one entitlement. Never creates a profile without a real pen name.
--
-- public.projects_require_beta_access() — CHANGED: a signed-in request now
--   needs the account's profile first, with a clear refusal instead of a
--   foreign-key error, and before beta access is checked or accepted. Beta
--   access is never treated as a profile.
--
-- Existing accounts: no row is written. An account that has no profile (the
-- state above) keeps its auth user and its beta access, and is sent to
-- /complete-profile by the app; the migration only reports how many there are.
--
-- Apply BEFORE (or with) the app deploy that calls complete_profile: the
-- previous app's /complete-profile updates the profile in place, which a
-- missing profile silently ignores. Must be applied by the owner of
-- public.projects (the postgres role, which may also create triggers on
-- auth.users).
-- Rollback:
--   drop function public.complete_profile(text);
--   re-run the projects_require_beta_access() and handle_new_user() bodies from 052 / schema.sql
--   (keep the on_auth_user_created trigger: it is required);
--   delete from public.schema_migrations where version = '053';

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 053 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '053') then
    raise exception 'Migration 053 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '052') then
    raise exception 'Migration 053 requires migration 052 (closed beta). Nothing was changed.';
  end if;
  if (select tableowner from pg_tables where schemaname = 'public' and tablename = 'projects') <> current_user then
    raise exception 'Migration 053 must be applied by the owner of public.projects (%, not %). Nothing was changed.',
      (select tableowner from pg_tables where schemaname = 'public' and tablename = 'projects'), current_user;
  end if;
end $$;

-- ── Signup ──────────────────────────────────────────────────────────────────

create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
  )
  on conflict (id) do nothing;

  insert into public.user_pricing_entitlements (
    user_id,
    pricing_cohort,
    founder_offer_status
  ) values (
    new.id,
    'starter_2k',
    'not_offered'
  )
  on conflict (user_id) do nothing;

  return new;
end;
$function$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── The required profile step ───────────────────────────────────────────────

create or replace function public.complete_profile(p_display_name text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_name text := btrim(coalesce(p_display_name, ''));
  v_row public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  -- The app validates the full pen-name rules (lib/penName.ts); the database
  -- keeps the part no request may skip: a real name of 2–40 characters.
  if char_length(v_name) < 2 or char_length(v_name) > 40 then
    raise exception 'invalid_pen_name' using errcode = '22023';
  end if;

  insert into public.profiles (id, display_name, xp, level, has_written_first_words, subscription_tier)
  values (auth.uid(), v_name, 0, 1, false, 'free')
  on conflict (id) do update set display_name = excluded.display_name;

  insert into public.user_pricing_entitlements (user_id, pricing_cohort, founder_offer_status)
  values (auth.uid(), 'starter_2k', 'not_offered')
  on conflict (user_id) do nothing;

  select * into v_row from public.profiles where id = auth.uid();
  return jsonb_build_object('id', v_row.id, 'display_name', v_row.display_name);
end;
$function$;

revoke all on function public.complete_profile(text) from public, anon;
grant execute on function public.complete_profile(text) to authenticated, service_role;

-- ── Projects: profile first, then beta access ───────────────────────────────

create or replace function public.projects_require_beta_access()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if auth.uid() is not null then
    if not exists (select 1 from public.profiles where id = new.user_id) then
      raise exception 'Choose your pen name before creating a project.'
        using errcode = '42501';
    end if;
    if public.beta_access_state(new.user_id, true) not in ('member', 'admin', 'accepted') then
      raise exception 'Rune is in closed beta. This account hasn’t been given access yet.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;

do $$
declare
  v_missing int;
begin
  select count(*) into v_missing
    from auth.users u
   where not exists (select 1 from public.profiles p where p.id = u.id);
  if v_missing > 0 then
    raise notice 'Migration 053: % account(s) have no profile; Rune sends them to /complete-profile.', v_missing;
  end if;
end $$;

insert into public.schema_migrations (version, name, applied_at, note)
values ('053', '053_profile_invariant.sql', now(), 'Profile invariant: on_auth_user_created re-created, handle_new_user idempotent, complete_profile (creates a missing profile with the chosen pen name, idempotent), projects_require_beta_access checks the profile before beta access');
