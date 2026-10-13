-- ── Migration 057: atomic, idempotent writing credit ─────────────────────────
--
-- Writing activity (Today's Words, writing days, the streak, the activity
-- calendar) is read from public.writing_sessions: one row per writer, Scene
-- (or Project, or account) and LOCAL calendar day, holding the words the
-- writer typed that day (credited by the editor at each save; never pasted,
-- imported, restored or moved prose — the editor decides what is credited,
-- the database only adds it up). The stats audit found two faults in how a
-- credit reached the row:
--
--   1. The write was select-then-update from the application. Two tabs (or
--      a tab and the offline replay) crediting the same row at once could
--      each read the same old total and one increment was lost.
--   2. A credit queued offline was replayed, then forgotten; a replay that
--      reached the server but whose "forget" never ran (tab closed, storage
--      error) was replayed again and counted twice. The one RPC the code
--      tried first, increment_writing_session, never existed in any tracked
--      migration (014 asserts its absence), so every call fell back to the
--      racy path.
--
-- This migration adds, and changes nothing else:
--
-- public.writing_credit_receipts — one row per credit the writer's device
--   has made (credit_id chosen by the device, user_id, created_at). A
--   credit's receipt is written in the same statement as its words: the
--   same credit sent twice (a retried action, a replayed offline queue)
--   lands once. RLS: the owner may read their receipts; no client writes
--   (no insert/update/delete policy) — only the function below, as owner.
--
-- public.credit_writing_words(p_credit_id, p_project_id, p_scene_id,
--   p_session_date, p_words) returns boolean — SECURITY DEFINER, search_path
--   pinned, signed-in writers only (42501 otherwise; anon has no execute).
--   Records the receipt (false, and nothing else written, if it exists), then
--   adds p_words to the writer's row for that day in ONE insert … on conflict
--   do update over the existing partial unique indexes (writing_sessions_
--   scene_unique / _project_unique / _null_project_unique), so concurrent
--   credits serialise on the row and every increment lands. The row is the
--   caller's own: p_project_id must be a Project the caller owns, else the
--   credit is recorded at account level (project_id null) — never against
--   another writer's Project; p_scene_id must be an existing Scene of that
--   Project, else at Project level (scene_id null) — as detach_scene_
--   writing_sessions (022) already does for a deleted Scene's history. A
--   trashed Scene keeps its own row (it still exists). The day is the
--   caller's LOCAL calendar date, supplied by the device; the server never
--   substitutes its own clock.
--
-- Nothing about writing_sessions, its indexes, policies or triggers changes;
-- the application's previous direct-upsert path keeps working on a database
-- without this migration (the action falls back to it when the function is
-- absent). No XP, level, unlockable or Arena object is touched.
--
-- Proven by tools/sync-harness/tests/app-writing-activity.test.mjs.
--
-- Apply before the app deploy that sends credit ids (the previous app never
-- calls the function). Safe to apply earlier.
-- Rollback:
--   drop function if exists public.credit_writing_words(uuid, uuid, uuid, date, integer);
--   drop table if exists public.writing_credit_receipts;
--   delete from public.schema_migrations where version = '057';

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 057 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '057') then
    raise exception 'Migration 057 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '056') then
    raise exception 'Migration 057 requires migration 056 (Early Access). Nothing was changed.';
  end if;
  if to_regclass('public.writing_sessions') is null or to_regclass('public.scenes') is null then
    raise exception 'Migration 057 is for the Rune 2.0 database (writing_sessions with scenes). Nothing was changed.';
  end if;
end
$$;

-- ── Receipts: one credit, once ──────────────────────────────────────────────

create table public.writing_credit_receipts (
  credit_id  uuid primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamp with time zone default now() not null
);

create index writing_credit_receipts_user_idx on public.writing_credit_receipts (user_id, created_at);

alter table public.writing_credit_receipts enable row level security;

create policy "Writers read own credit receipts" on public.writing_credit_receipts
  for select using (auth.uid() = user_id);

revoke all on public.writing_credit_receipts from public, anon;
grant select on public.writing_credit_receipts to authenticated;

-- ── The credit ──────────────────────────────────────────────────────────────

create or replace function public.credit_writing_words(
  p_credit_id uuid,
  p_project_id uuid,
  p_scene_id uuid,
  p_session_date date,
  p_words integer
)
 returns boolean
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_user uuid := auth.uid();
  v_project uuid := p_project_id;
  v_scene uuid := p_scene_id;
begin
  if v_user is null then
    raise exception 'A writing credit needs a signed-in writer' using errcode = '42501';
  end if;
  if p_credit_id is null then
    raise exception 'A writing credit needs its id' using errcode = '22023';
  end if;
  if p_session_date is null then
    raise exception 'A writing credit needs the writer''s local date' using errcode = '22023';
  end if;
  if p_words is null or p_words <= 0 then
    raise exception 'A writing credit is a positive number of words' using errcode = '22023';
  end if;

  -- The receipt first: the same credit again is a no-op.
  insert into public.writing_credit_receipts (credit_id, user_id)
  values (p_credit_id, v_user)
  on conflict (credit_id) do nothing;
  if not found then
    return false;
  end if;

  -- The row is the caller's own: their Project, their Scene of that Project.
  if v_project is not null
     and not exists (select 1 from public.projects p where p.id = v_project and p.user_id = v_user) then
    v_project := null;
    v_scene := null;
  end if;
  if v_scene is not null
     and not exists (
       select 1 from public.scenes s
         join public.manuscripts m on m.id = s.manuscript_id
        where s.id = v_scene and m.project_id = v_project
     ) then
    v_scene := null;
  end if;

  if v_scene is not null then
    insert into public.writing_sessions (user_id, project_id, scene_id, session_date, words_added)
    values (v_user, v_project, v_scene, p_session_date, p_words)
    on conflict (user_id, scene_id, session_date) where scene_id is not null
    do update set words_added = writing_sessions.words_added + excluded.words_added;
  elsif v_project is not null then
    insert into public.writing_sessions (user_id, project_id, scene_id, session_date, words_added)
    values (v_user, v_project, null, p_session_date, p_words)
    on conflict (user_id, project_id, session_date) where project_id is not null and scene_id is null
    do update set words_added = writing_sessions.words_added + excluded.words_added;
  else
    insert into public.writing_sessions (user_id, project_id, scene_id, session_date, words_added)
    values (v_user, null, null, p_session_date, p_words)
    on conflict (user_id, session_date) where project_id is null and scene_id is null
    do update set words_added = writing_sessions.words_added + excluded.words_added;
  end if;

  return true;
end;
$function$;

revoke execute on function public.credit_writing_words(uuid, uuid, uuid, date, integer) from public;
revoke execute on function public.credit_writing_words(uuid, uuid, uuid, date, integer) from anon;
grant execute on function public.credit_writing_words(uuid, uuid, uuid, date, integer) to authenticated, service_role;

insert into public.schema_migrations (version, name, applied_at, note)
values ('057', '057_writing_credit.sql', now(), 'Atomic, idempotent writing credit: writing_credit_receipts (one row per device credit; owner reads, no client writes) and credit_writing_words(credit, project, scene, local date, words) — receipt then one insert … on conflict do update on writing_sessions, the caller''s own Project/Scene only (else Project/account level); writing_sessions itself unchanged');
