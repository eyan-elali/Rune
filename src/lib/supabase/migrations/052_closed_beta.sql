-- ── Migration 052: Closed beta — access, waitlist, onboarding, feedback ─────
--
-- Rune 2.0, Beta Completion E. The closed beta is free and full-featured and
-- open only to approved email addresses. Nothing here reads, writes or moves
-- a Scene, a Chapter or any Workspace object.
--
-- public.beta_access — NEW. One row per approved email (normalized:
--   lower-case, trimmed). A row IS the approval; there is no status. When the
--   account signed in with that email first enters Rune, the row records it
--   (user_id, accepted_at) and from then on access belongs to that account,
--   not to the email.
--   * An accepted row cannot be deleted, re-pointed at another account or
--     another email, or un-accepted (beta_access_keep_accepted): an operator
--     editing the list can never strand a writer's manuscript. Only deleting
--     the account itself releases it — the email then stays approved, ready
--     to accept again.
--   * No client access (RLS on, no policies, no privileges). The operator
--     works through Pulse (service role) or the SQL editor.
--   * Every account that exists when this migration runs is accepted here,
--     so no one already using this database loses access.
--
-- public.beta_waitlist — NEW. Interest only: email (normalized), an optional
--   name and an optional "what do you write?", created_at. Being on it grants
--   nothing. Written only by join_beta_waitlist; no client reads.
--
-- public.beta_access_state(user, claim) — NEW, internal (no client grant).
--   'member' (accepted), 'admin' (profiles.is_admin: never locked out, never
--   recorded), 'accepted' (approved and accepted by this call), 'approved'
--   (approved, not yet accepted: only when claim is false), 'waitlisted', or
--   'none'.
-- public.claim_beta_access() — NEW, authenticated. beta_access_state for the
--   caller, accepting an approved email.
-- public.join_beta_waitlist(email, name, writes) — NEW, anon + authenticated.
--   Idempotent; reveals nothing about the address (the same answer whether it
--   was new, already waiting, or already approved).
--
-- public.projects — CHANGED: projects_require_beta_access (BEFORE INSERT).
--   A request made as a signed-in writer (auth.uid() set) can create a
--   Project only for an account with beta access. Every Project is created
--   by create_project_checked, import_manuscript_checked or
--   duplicate_project_checked, so this one trigger is the server-side
--   boundary: without access an account cannot own any writing. Requests
--   without a JWT subject (the service role, the SQL editor) are not checked.
--
-- public.beta_before_user_created(event) — NEW, NOT ENABLED. A Supabase Auth
--   "before user created" hook refusing sign-up for an email that is not
--   approved. Enabling it (Supabase → Authentication → Hooks) is an optional,
--   separate step; without it an unapproved address can create an account
--   but can never enter Rune or own a Project.
--
-- public.account_onboarding — NEW. The account's one onboarding journey:
--   path ('new' | 'import'), the Project it created (project_id), the
--   request id that keeps a retried "new project" from creating a second one,
--   started_at, completed_at. The writer reads their own row; it changes only
--   through onboarding_begin / onboarding_choose_path /
--   onboarding_attach_project / onboarding_complete (all owner-scoped,
--   idempotent; a completed journey never changes again).
--
-- public.beta_feedback — NEW. What a writer sends with "Send feedback": the
--   text they wrote, an optional category, and safe context (build, route,
--   device class, browser, Project id) — never manuscript content. The writer
--   may insert their own; nobody reads through the API but the service role.
--
-- Apply BEFORE the app deploy that gates on beta access. The previous app
-- keeps working for every existing account (all are accepted here); a new
-- account it lets sign up cannot create a Project until approved.
-- Rollback:
--   drop trigger projects_require_beta_access on public.projects;
--   drop function public.projects_require_beta_access();
--   drop function public.beta_before_user_created(jsonb);
--   drop function public.join_beta_waitlist(text, text, text);
--   drop function public.claim_beta_access();
--   drop function public.beta_access_state(uuid, boolean);
--   drop function public.onboarding_begin();
--   drop function public.onboarding_choose_path(text);
--   drop function public.onboarding_attach_project(uuid);
--   drop function public.onboarding_complete();
--   drop table public.beta_feedback;
--   drop table public.account_onboarding;
--   drop table public.beta_waitlist;
--   drop table public.beta_access;
--   drop function public.beta_access_keep_accepted();
--   delete from public.schema_migrations where version = '052';

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 052 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '052') then
    raise exception 'Migration 052 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '051') then
    raise exception 'Migration 052 requires migration 051 (Trash visibility). Nothing was changed.';
  end if;
  if (select tableowner from pg_tables where schemaname = 'public' and tablename = 'projects') <> current_user then
    raise exception 'Migration 052 must be applied by the owner of public.projects (%, not %). Nothing was changed.',
      (select tableowner from pg_tables where schemaname = 'public' and tablename = 'projects'), current_user;
  end if;
end $$;

-- ── Beta access ─────────────────────────────────────────────────────────────

create table public.beta_access (
  email       text primary key,
  user_id     uuid unique references auth.users (id) on delete set null,
  approved_at timestamp with time zone not null default now(),
  accepted_at timestamp with time zone,
  constraint beta_access_email_normalized
    check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+$' and length(email) <= 320),
  constraint beta_access_accepted_together check ((user_id is null) = (accepted_at is null))
);

alter table public.beta_access enable row level security;
revoke all on public.beta_access from anon, authenticated;

-- An accepted writer keeps access. Fires for every role (the SQL editor
-- included), so only deleting the account releases a row.
create or replace function public.beta_access_keep_accepted()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if old.user_id is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if exists (select 1 from auth.users where id = old.user_id) then
    if tg_op = 'DELETE' then
      raise exception 'beta_access: % has already accepted the beta; an accepted writer keeps access', old.email
        using errcode = '42501';
    end if;
    if new.user_id is distinct from old.user_id or new.email <> old.email
       or new.accepted_at is distinct from old.accepted_at then
      raise exception 'beta_access: % has already accepted the beta; its account and email cannot change', old.email
        using errcode = '42501';
    end if;
    return new;
  end if;
  -- The account was deleted (on delete set null): the email stays approved.
  if tg_op = 'UPDATE' and new.user_id is null then
    new.accepted_at := null;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

create trigger beta_access_keep_accepted before update or delete on public.beta_access
  for each row execute function public.beta_access_keep_accepted();

-- ── Waitlist ────────────────────────────────────────────────────────────────

create table public.beta_waitlist (
  email      text primary key,
  name       text,
  writes     text,
  created_at timestamp with time zone not null default now(),
  constraint beta_waitlist_email_normalized
    check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+$' and length(email) <= 320),
  constraint beta_waitlist_name_length check (name is null or length(name) <= 120),
  constraint beta_waitlist_writes_length check (writes is null or length(writes) <= 500)
);

alter table public.beta_waitlist enable row level security;
revoke all on public.beta_waitlist from anon, authenticated;

create or replace function public.join_beta_waitlist(p_email text, p_name text default null, p_writes text default null)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_writes text := nullif(btrim(coalesce(p_writes, '')), '');
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 320 then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  insert into public.beta_waitlist (email, name, writes)
  values (v_email, left(v_name, 120), left(v_writes, 500))
  on conflict (email) do nothing;
end;
$function$;

revoke all on function public.join_beta_waitlist(text, text, text) from public;
grant execute on function public.join_beta_waitlist(text, text, text) to anon, authenticated, service_role;

-- ── Access state ────────────────────────────────────────────────────────────

create or replace function public.beta_access_state(p_user uuid, p_claim boolean)
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_email text;
begin
  if p_user is null then
    return 'none';
  end if;
  if exists (select 1 from public.beta_access where user_id = p_user) then
    return 'member';
  end if;
  if exists (select 1 from public.profiles where id = p_user and is_admin) then
    return 'admin';
  end if;
  select lower(btrim(email)) into v_email from auth.users where id = p_user;
  if coalesce(v_email, '') = '' then
    return 'none';
  end if;
  if p_claim then
    update public.beta_access set user_id = p_user, accepted_at = now()
     where email = v_email and user_id is null;
    if found then
      return 'accepted';
    end if;
    -- A concurrent call may have accepted it a moment ago.
    if exists (select 1 from public.beta_access where user_id = p_user) then
      return 'member';
    end if;
  elsif exists (select 1 from public.beta_access where email = v_email and user_id is null) then
    return 'approved';
  end if;
  if exists (select 1 from public.beta_waitlist where email = v_email) then
    return 'waitlisted';
  end if;
  return 'none';
end;
$function$;

revoke all on function public.beta_access_state(uuid, boolean) from public, anon, authenticated;

create or replace function public.claim_beta_access()
 returns text
 language sql
 security definer
 set search_path to ''
as $function$
  select public.beta_access_state(auth.uid(), true);
$function$;

revoke all on function public.claim_beta_access() from public, anon;
grant execute on function public.claim_beta_access() to authenticated, service_role;

-- ── The boundary: only a beta member owns a Project ─────────────────────────

create or replace function public.projects_require_beta_access()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if auth.uid() is not null
     and public.beta_access_state(new.user_id, true) not in ('member', 'admin', 'accepted') then
    raise exception 'Rune is in closed beta. This account hasn’t been given access yet.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

create trigger projects_require_beta_access before insert on public.projects
  for each row execute function public.projects_require_beta_access();

-- ── Optional Auth hook (not enabled by this migration) ──────────────────────

create or replace function public.beta_before_user_created(event jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_email text := lower(btrim(coalesce(event -> 'user' ->> 'email', '')));
begin
  if v_email <> '' and exists (select 1 from public.beta_access where email = v_email) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Rune is in closed beta. This email hasn’t been invited yet.'));
end;
$function$;

revoke all on function public.beta_before_user_created(jsonb) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    execute 'grant execute on function public.beta_before_user_created(jsonb) to supabase_auth_admin';
  end if;
end $$;

-- Everyone already here keeps access.
insert into public.beta_access (email, user_id, approved_at, accepted_at)
select lower(btrim(u.email)), u.id, now(), now()
  from auth.users u
 where coalesce(btrim(u.email), '') ~ '^[^@\s]+@[^@\s]+$'
on conflict (email) do nothing;

-- ── Onboarding ──────────────────────────────────────────────────────────────

create table public.account_onboarding (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  path         text,
  project_id   uuid references public.projects (id) on delete set null,
  request_id   uuid not null default gen_random_uuid(),
  started_at   timestamp with time zone not null default now(),
  completed_at timestamp with time zone,
  constraint account_onboarding_path check (path is null or path in ('new', 'import'))
);

alter table public.account_onboarding enable row level security;
revoke all on public.account_onboarding from anon, authenticated;
grant select on public.account_onboarding to authenticated;
create policy "account_onboarding: select own" on public.account_onboarding
  as permissive for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.onboarding_begin()
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_row public.account_onboarding;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  insert into public.account_onboarding (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select * into v_row from public.account_onboarding where user_id = auth.uid();
  return to_jsonb(v_row);
end;
$function$;

-- The path can change until a Project is attached; after that it is history.
create or replace function public.onboarding_choose_path(p_path text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_row public.account_onboarding;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_path is null or p_path not in ('new', 'import') then
    raise exception 'Unknown onboarding path' using errcode = '22023';
  end if;
  insert into public.account_onboarding (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  update public.account_onboarding set path = p_path
   where user_id = auth.uid() and completed_at is null and project_id is null;
  select * into v_row from public.account_onboarding where user_id = auth.uid();
  return to_jsonb(v_row);
end;
$function$;

-- The first Project the journey made. Only the writer's own, and only once.
create or replace function public.onboarding_attach_project(p_project uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_row public.account_onboarding;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.projects where id = p_project and user_id = auth.uid()) then
    raise exception 'Project not found' using errcode = '42501';
  end if;
  update public.account_onboarding set project_id = p_project
   where user_id = auth.uid() and completed_at is null and project_id is null;
  select * into v_row from public.account_onboarding where user_id = auth.uid();
  return to_jsonb(v_row);
end;
$function$;

create or replace function public.onboarding_complete()
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_row public.account_onboarding;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  insert into public.account_onboarding (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  update public.account_onboarding set completed_at = now()
   where user_id = auth.uid() and completed_at is null;
  select * into v_row from public.account_onboarding where user_id = auth.uid();
  return to_jsonb(v_row);
end;
$function$;

revoke all on function public.onboarding_begin() from public, anon;
revoke all on function public.onboarding_choose_path(text) from public, anon;
revoke all on function public.onboarding_attach_project(uuid) from public, anon;
revoke all on function public.onboarding_complete() from public, anon;
grant execute on function public.onboarding_begin() to authenticated, service_role;
grant execute on function public.onboarding_choose_path(text) to authenticated, service_role;
grant execute on function public.onboarding_attach_project(uuid) to authenticated, service_role;
grant execute on function public.onboarding_complete() to authenticated, service_role;

-- ── Feedback ────────────────────────────────────────────────────────────────

create table public.beta_feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  category   text,
  body       text not null,
  context    jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  constraint beta_feedback_category check (category is null or category in ('confusing', 'broken', 'idea', 'other')),
  constraint beta_feedback_body_length check (length(btrim(body)) between 1 and 5000),
  constraint beta_feedback_context_object check (jsonb_typeof(context) = 'object' and length(context::text) <= 2000)
);

create index beta_feedback_created_at_idx on public.beta_feedback (created_at desc);

alter table public.beta_feedback enable row level security;
revoke all on public.beta_feedback from anon, authenticated;
grant insert on public.beta_feedback to authenticated;
create policy "beta_feedback: insert own" on public.beta_feedback
  as permissive for insert to authenticated
  with check (user_id = (select auth.uid()));

insert into public.schema_migrations (version, name, applied_at, note)
values ('052', '052_closed_beta.sql', now(), 'Closed beta (BC-E): beta_access (approved emails; accepted rows protected), beta_waitlist, claim_beta_access / join_beta_waitlist, projects_require_beta_access insert trigger, optional beta_before_user_created Auth hook (not enabled), account_onboarding + onboarding_* RPCs, beta_feedback; every existing account accepted');
