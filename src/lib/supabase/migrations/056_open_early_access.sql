-- ── Migration 056: Early Access — any account may own a Project ─────────────
--
-- Sutura leaves the closed beta for open Early Access: anyone can create an
-- account and start writing at once. The closed beta's only server-side
-- boundary was projects_require_beta_access (052, refined by 053), which
-- refused a Project to a signed-in account without a beta_access row. This
-- migration removes that refusal and nothing else. Nothing here reads,
-- writes or moves a Scene, a Chapter or any Workspace object, and no row of
-- any table is written, changed or deleted.
--
-- public.projects_require_beta_access() — CHANGED: keeps 053's profile-first
--   check (a signed-in request needs the account's profile, with a clear
--   refusal instead of a foreign-key error) and no longer consults or accepts
--   beta access. The trigger keeps its name so that rollback is one function
--   body; it is now the profile check only.
--
-- public.beta_before_user_created(event) — CHANGED: allows every sign-up.
--   It was never enabled by a migration (052 left it optional, in Supabase →
--   Authentication → Hooks); if it was enabled by hand, this stops it from
--   refusing new writers. It should also be switched off there.
--
-- Kept, as history and for the operator (Pulse): public.beta_access (every
--   approval and acceptance, still protected by beta_access_keep_accepted),
--   public.beta_waitlist (every interested address), public.beta_feedback
--   (still how "Send feedback" is stored), beta_access_state,
--   claim_beta_access and join_beta_waitlist. None of them decides access
--   any longer; the app no longer calls claim_beta_access or
--   join_beta_waitlist.
--
-- Apply BEFORE (or with) the app deploy that opens sign-up: the previous app
-- still turns an account without access away at the door, so applying this
-- first changes nothing a writer sees; the new app without this would let a
-- new account through onboarding only to have its first Project refused.
-- Must be applied by the owner of public.projects (the postgres role).
-- Rollback (closes the door again for accounts without a beta_access row):
--   re-run the projects_require_beta_access() body from 053 and the
--   beta_before_user_created(jsonb) body from 052;
--   delete from public.schema_migrations where version = '056';

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 056 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '056') then
    raise exception 'Migration 056 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '055') then
    raise exception 'Migration 056 requires migration 055 (attachment registration hardening). Nothing was changed.';
  end if;
  if (select tableowner from pg_tables where schemaname = 'public' and tablename = 'projects') <> current_user then
    raise exception 'Migration 056 must be applied by the owner of public.projects (%, not %). Nothing was changed.',
      (select tableowner from pg_tables where schemaname = 'public' and tablename = 'projects'), current_user;
  end if;
end $$;

-- ── Projects: the profile, and nothing else ─────────────────────────────────

create or replace function public.projects_require_beta_access()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if auth.uid() is not null
     and not exists (select 1 from public.profiles where id = new.user_id) then
    raise exception 'Choose your pen name before creating a project.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

-- ── The optional Auth hook: allows every sign-up ────────────────────────────

create or replace function public.beta_before_user_created(event jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  return '{}'::jsonb;
end;
$function$;

insert into public.schema_migrations (version, name, applied_at, note)
values ('056', '056_open_early_access.sql', now(), 'Early Access: projects_require_beta_access checks the profile only (beta access no longer consulted or accepted); beta_before_user_created allows every sign-up; beta_access, beta_waitlist, beta_feedback and their rows kept');
