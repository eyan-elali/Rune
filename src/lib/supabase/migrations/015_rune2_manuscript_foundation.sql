-- ── Migration 015: Rune 2.0 manuscript foundation (EMPTY databases only) ────
--
-- Rune 2.0 Phase 1, Task 2. Replaces the Rune 1.x manuscript tables with the
-- Rune 2.0 domain model:
--
--   projects ─1:1─ manuscripts ─1:n─ chapters
--                        └──────1:n─ scenes ──0..1── chapter (placement)
--
--   * manuscripts: exactly one per Project, created by a trigger on project
--     insert, deleted with the Project. Ownership resolves through the Project.
--   * chapters.manuscript_id replaces chapters.project_id.
--   * scenes replaces pages. A Scene BELONGS to one Manuscript (manuscript_id,
--     never changes) and is PLACED in a Chapter of that same Manuscript, or
--     Unplaced (chapter_id null). A composite foreign key makes a Scene in a
--     Chapter of another Manuscript impossible.
--   * writing_sessions.scene_id replaces writing_sessions.page_id.
--   * save_scene_checked / insert_scene_checked replace save_page_checked /
--     insert_page_checked, with the same arguments (renamed), return shapes and
--     statuses. The not-found error string is now 'Scene not found'.
--   * account_word_total(p_candidate_scene_id, p_candidate_word_count) still
--     counts EVERY Scene the writer owns, placed or Unplaced.
--   * No canonical behavior: no is_canonical, no canonical trigger or function.
--
-- WHO MAY RUN THIS: only a database built from the Rune 1.x baseline
-- (src/lib/supabase/baseline/production-2026-09-24.sql + 013 + 014) that holds
-- NO manuscript data — the new, empty Rune 2.0 database. It drops and
-- re-creates tables, so the guard below refuses to run if projects, chapters,
-- pages or writing_sessions hold a single row. It is NOT the Rune 1.x →
-- Rune 2.0 data migration. Moving real Rune 1.x manuscripts (keeping every
-- Page ID as its Scene ID, the §42 canonical mapping, stale clients and
-- queued offline saves) is a separate, future migration with its own
-- compatibility plan. See tools/sync-harness/lib/legacy-to-rune2.mjs for the
-- test prototype that proves the target schema can receive that data.
--
-- Compatibility: the Rune 1.x app code on this branch still reads `pages`,
-- `chapters.project_id` and `writing_sessions.page_id` and calls
-- save_page_checked / insert_page_checked. It does not work against a
-- database after this migration until the application task moves it to
-- Scene semantics. There are no users, stale clients or queued offline saves
-- for this database, which is why nothing here keeps the legacy contracts.
--
-- Rollback (the database is empty, so rolling back = rebuilding): drop the
-- Supabase project's `public` schema objects and rebuild from the baseline, or
-- simply create a new project. Before this migration commits, any error rolls
-- back everything.
--
-- Requires 013 and 014. Apply as ONE script (psql -1, or the SQL editor).

do $$
declare
  t text;
  n bigint;
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 015 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '015') then
    raise exception 'Migration 015 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '014') then
    raise exception 'Migration 015 requires migration 014 (the baseline assertions). Nothing was changed.';
  end if;

  -- Empty-database guard. Never let this run where manuscripts exist.
  foreach t in array array['projects', 'chapters', 'pages', 'writing_sessions'] loop
    execute format('select count(*) from public.%I', t) into n;
    if n > 0 then
      raise exception 'Migration 015 only runs on an EMPTY Rune 2.0 database, but public.% has % row(s). It is not the Rune 1.x data migration. Nothing was changed.', t, n;
    end if;
  end loop;
end
$$;

-- ── 1. Retire the Rune 1.x manuscript objects ───────────────────────────────
-- Tables go with their policies, indexes, triggers and foreign keys.
drop table public.writing_sessions;
drop table public.pages;
drop table public.chapters;

drop function public.enforce_single_canonical_page();
drop function public.increment_page_version();
drop function public.save_page_checked(uuid, jsonb, integer, integer);
drop function public.insert_page_checked(uuid, text, jsonb, integer, integer);
-- Argument renamed (p_candidate_page_id → p_candidate_scene_id): re-created below.
drop function public.account_word_total(uuid, integer);

-- ── 2. Tables ───────────────────────────────────────────────────────────────

create table public.manuscripts (
  id         uuid        default gen_random_uuid() not null,
  project_id uuid        not null,
  created_at timestamptz default now()             not null,
  updated_at timestamptz default now()             not null
);

create table public.chapters (
  id            uuid        default gen_random_uuid() not null,
  manuscript_id uuid        not null,
  title         text        not null,
  position      integer     not null,
  created_at    timestamptz default now()             not null,
  updated_at    timestamptz default now()             not null,
  is_completed  boolean     default false
);

create table public.scenes (
  id            uuid        default gen_random_uuid() not null,
  manuscript_id uuid        not null,
  chapter_id    uuid,                                  -- null = Unplaced
  title         text        not null,
  content       jsonb,
  word_count    integer     default 0                 not null,
  position      integer     not null,
  version       integer     default 1                 not null,
  created_at    timestamptz default now()             not null,
  updated_at    timestamptz default now()             not null
);

create table public.writing_sessions (
  id           uuid        default gen_random_uuid() not null,
  user_id      uuid        not null,
  project_id   uuid,
  scene_id     uuid,
  words_added  integer     default 0                 not null,
  session_date date        default CURRENT_DATE      not null,
  created_at   timestamptz default now()             not null
);

-- ── 3. Keys and constraints ─────────────────────────────────────────────────

alter table public.manuscripts add constraint manuscripts_pkey primary key (id);
alter table public.manuscripts add constraint manuscripts_project_id_key unique (project_id);
alter table public.manuscripts add constraint manuscripts_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete cascade;

alter table public.chapters add constraint chapters_pkey primary key (id);
-- Target of scenes' composite foreign key (a Scene's Chapter must share its Manuscript).
alter table public.chapters add constraint chapters_id_manuscript_id_key unique (id, manuscript_id);
alter table public.chapters add constraint chapters_manuscript_id_fkey
  foreign key (manuscript_id) references public.manuscripts(id) on delete cascade;

alter table public.scenes add constraint scenes_pkey primary key (id);
alter table public.scenes add constraint scenes_manuscript_id_fkey
  foreign key (manuscript_id) references public.manuscripts(id) on delete cascade;
-- MATCH SIMPLE: a null chapter_id (Unplaced) is not checked; a non-null one must
-- name a Chapter of the SAME Manuscript. Deleting a Chapter deletes its placed
-- Scenes, as deleting a Chapter deleted its Pages in Rune 1.x.
alter table public.scenes add constraint scenes_chapter_same_manuscript_fkey
  foreign key (chapter_id, manuscript_id) references public.chapters(id, manuscript_id) on delete cascade;

alter table public.writing_sessions add constraint writing_sessions_pkey primary key (id);
alter table public.writing_sessions add constraint writing_sessions_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;
alter table public.writing_sessions add constraint writing_sessions_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete cascade;
-- Unchanged from Rune 1.x: deleting a Scene deletes its writing history.
alter table public.writing_sessions add constraint writing_sessions_scene_id_fkey
  foreign key (scene_id) references public.scenes(id) on delete cascade;

-- ── 4. Indexes ──────────────────────────────────────────────────────────────

create index chapters_manuscript_id_position_idx on public.chapters (manuscript_id, position);
create index scenes_chapter_id_position_idx on public.scenes (chapter_id, position);
create index scenes_manuscript_id_idx on public.scenes (manuscript_id);

-- writing_sessions: one row per (user, Scene, day) for editor writing, one per
-- (user, Project, day) and one per (user, day) for writing with no Scene.
-- Same uniqueness as Rune 1.x, without production's two duplicate indexes.
create unique index writing_sessions_scene_unique on public.writing_sessions (user_id, scene_id, session_date)
  where scene_id is not null;
create unique index writing_sessions_project_unique on public.writing_sessions (user_id, project_id, session_date)
  where project_id is not null and scene_id is null;
create unique index writing_sessions_null_project_unique on public.writing_sessions (user_id, session_date)
  where project_id is null and scene_id is null;

-- ── 5. Functions ────────────────────────────────────────────────────────────

-- Every Project has exactly one Manuscript, created with it. SECURITY DEFINER
-- because writers have no INSERT policy on manuscripts; it inserts only the
-- row for the Project that was just inserted (and passed projects' RLS).
create function public.create_project_manuscript()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  insert into public.manuscripts (project_id) values (new.id);
  return null;
end;
$function$;

-- A placed Scene inserted with only its chapter_id gets that Chapter's
-- Manuscript. SECURITY INVOKER on purpose: the Chapter lookup runs under the
-- caller's RLS, so another writer's Chapter yields no Manuscript and the
-- insert fails. Consistency itself is enforced by the composite foreign key.
create function public.fill_scene_manuscript_id()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if new.manuscript_id is null and new.chapter_id is not null then
    select c.manuscript_id into new.manuscript_id
      from public.chapters c
     where c.id = new.chapter_id;
  end if;
  return new;
end;
$function$;

-- A Chapter or Scene belongs to one Manuscript for life. Moving a Scene
-- between Chapters (or to Unplaced) changes chapter_id, never manuscript_id.
create function public.forbid_manuscript_reassignment()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if new.manuscript_id is distinct from old.manuscript_id then
    raise exception 'A row of % cannot move to another Manuscript', tg_table_name
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

create function public.increment_scene_version()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  new.version = old.version + 1;
  new.updated_at = now(); -- server-side high-precision timestamp
  return new;
end;
$function$;

-- Same function name and trigger role as Rune 1.x (migration 012): a Scene
-- update bumps its Project's updated_at, now resolved through the Manuscript.
create or replace function public.bump_project_updated_at()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  update public.projects
  set updated_at = now()
  where id = (
    select m.project_id
    from public.manuscripts m
    where m.id = new.manuscript_id
  );

  return new;
end;
$function$;

-- The free-limit account total (migration 011 semantics, unchanged): every
-- Scene the caller owns, placed or Unplaced, through Scene → Manuscript →
-- Project. It is NOT the ordered manuscript total (placed Scenes only); the
-- two must never be collapsed, or moving prose to Unplaced would bypass the
-- limit.
create function public.account_word_total(p_candidate_scene_id uuid default null::uuid, p_candidate_word_count integer default null::integer)
 returns integer
 language plpgsql
 stable
 set search_path to ''
as $function$
declare
  v_total int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  with existing_scenes as (
    select
      case
        when p_candidate_scene_id is not null and s.id = p_candidate_scene_id
        then p_candidate_word_count
        else s.word_count
      end as word_count
    from public.scenes s
    join public.manuscripts m on m.id = s.manuscript_id
    join public.projects pr on pr.id = m.project_id
    where pr.user_id = auth.uid()
  ),
  new_scene as (
    -- Synthetic row for a brand-new Scene not yet inserted anywhere.
    select p_candidate_word_count as word_count
    where p_candidate_scene_id is null
      and p_candidate_word_count is not null
  )
  select coalesce(sum(word_count), 0)
  into v_total
  from (
    select word_count from existing_scenes
    union all
    select word_count from new_scene
  ) all_words;

  return v_total;
end;
$function$;

-- Save-path RPC. Same contract as Rune 1.x save_page_checked: arguments
-- (renamed), return shape and status values 'ok' | 'word_limit_blocked' |
-- 'version_mismatch' | 'error'. SECURITY INVOKER: RLS is the ownership check.
create function public.save_scene_checked(p_scene_id uuid, p_content jsonb, p_word_count integer, p_expected_version integer default null::integer)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare
  v_old_word_count int;
  v_limit int;
  v_new_total int;
  v_updated public.scenes%rowtype;
begin
  perform public.lock_account_word_budget();

  select s.word_count
    into v_old_word_count
    from public.scenes s
    where s.id = p_scene_id;

  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Scene not found');
  end if;

  -- Only enforce when words are being added — never block edits/deletions.
  -- A Scene that is already over the allowance is never trapped: shrinking
  -- or net-neutral edits always pass, only further growth is blocked.
  if p_word_count > v_old_word_count then
    v_limit := public.free_word_limit_for_caller();
    if v_limit is not null then
      v_new_total := public.account_word_total(p_scene_id, p_word_count);
      if v_new_total > v_limit then
        return jsonb_build_object('status', 'word_limit_blocked', 'limit', v_limit);
      end if;
    end if;
  end if;

  if p_expected_version is not null then
    update public.scenes
       set content = p_content, word_count = p_word_count
     where id = p_scene_id and version = p_expected_version
     returning * into v_updated;

    if not found then
      return jsonb_build_object('status', 'version_mismatch');
    end if;
  else
    update public.scenes
       set content = p_content, word_count = p_word_count
     where id = p_scene_id
     returning * into v_updated;

    if not found then
      return jsonb_build_object('status', 'error', 'error', 'Scene not found');
    end if;
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'updated_at', v_updated.updated_at,
    'version', v_updated.version
  );
end;
$function$;

-- Creates a placed Scene with an atomic free-limit check (Rune 1.x
-- insert_page_checked contract). The Manuscript is derived from the Chapter
-- (fill_scene_manuscript_id), never supplied by the caller. Creating Unplaced
-- Scenes is a separate, later RPC.
create function public.insert_scene_checked(p_chapter_id uuid, p_title text, p_content jsonb, p_word_count integer, p_position integer)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare
  v_limit int;
  v_new_total int;
  v_new public.scenes%rowtype;
begin
  perform public.lock_account_word_budget();

  if p_word_count > 0 then
    v_limit := public.free_word_limit_for_caller();
    if v_limit is not null then
      v_new_total := public.account_word_total(null, p_word_count);
      if v_new_total > v_limit then
        return jsonb_build_object('status', 'word_limit_blocked', 'limit', v_limit);
      end if;
    end if;
  end if;

  insert into public.scenes (chapter_id, title, content, word_count, position)
  values (p_chapter_id, p_title, p_content, p_word_count, p_position)
  returning * into v_new;

  return jsonb_build_object('status', 'ok', 'id', v_new.id);
end;
$function$;

-- Same contract as Rune 1.x (migration 011): status 'ok' with the new
-- project, 'word_limit_blocked', or 'error'. Copies Chapters and every Scene,
-- placed and Unplaced, into the new Project's Manuscript.
--   * The limit check counts every source Scene (the account-total definition).
--   * The new projects.word_count is the ORDERED manuscript total: placed
--     Scenes only. (Rune 1.x stored the all-pages sum here; with no Unplaced
--     Scenes the two are equal.)
create or replace function public.duplicate_project_checked(p_project_id uuid)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare
  v_source public.projects%rowtype;
  v_source_manuscript_id uuid;
  v_source_chapter record;
  v_new_project public.projects%rowtype;
  v_new_manuscript_id uuid;
  v_new_chapter_id uuid;
  v_new_title text;
  v_used_numbers int[];
  v_draft_num int;
  v_source_total int;
  v_placed_total int;
  v_account_total int;
  v_limit int;
begin
  perform public.lock_account_word_budget();

  select * into v_source
    from public.projects
   where id = p_project_id and user_id = auth.uid();

  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Project not found');
  end if;

  select m.id into v_source_manuscript_id
    from public.manuscripts m
   where m.project_id = p_project_id;

  select coalesce(sum(s.word_count), 0),
         coalesce(sum(s.word_count) filter (where s.chapter_id is not null), 0)
    into v_source_total, v_placed_total
    from public.scenes s
   where s.manuscript_id = v_source_manuscript_id;

  if v_source_total > 0 then
    v_limit := public.free_word_limit_for_caller();
    if v_limit is not null then
      v_account_total := public.account_word_total();
      if v_account_total + v_source_total > v_limit then
        return jsonb_build_object('status', 'word_limit_blocked', 'limit', v_limit);
      end if;
    end if;
  end if;

  -- Unique "— Draft N" title: smallest unused number starting at 2 (gap-filling).
  select array_agg((regexp_match(p.title, '— Draft (\d+)$'))[1]::int)
    into v_used_numbers
  from public.projects p
  where p.user_id = auth.uid()
    and p.title ilike v_source.title || ' — Draft%'
    and regexp_match(p.title, '— Draft (\d+)$') is not null;

  v_draft_num := 2;
  while v_used_numbers is not null and v_draft_num = any(v_used_numbers) loop
    v_draft_num := v_draft_num + 1;
  end loop;

  v_new_title := v_source.title || ' — Draft ' || v_draft_num;

  insert into public.projects (user_id, title, description, cover_color, word_count)
  values (auth.uid(), v_new_title, v_source.description, v_source.cover_color, v_placed_total)
  returning * into v_new_project;

  -- Created by trg_project_manuscript.
  select m.id into v_new_manuscript_id
    from public.manuscripts m
   where m.project_id = v_new_project.id;

  for v_source_chapter in
    select * from public.chapters where manuscript_id = v_source_manuscript_id order by position
  loop
    insert into public.chapters (manuscript_id, title, position)
    values (v_new_manuscript_id, v_source_chapter.title, v_source_chapter.position)
    returning id into v_new_chapter_id;

    insert into public.scenes (manuscript_id, chapter_id, title, content, word_count, position)
    select v_new_manuscript_id, v_new_chapter_id, s.title, s.content, s.word_count, s.position
      from public.scenes s
     where s.chapter_id = v_source_chapter.id
     order by s.position;
  end loop;

  insert into public.scenes (manuscript_id, chapter_id, title, content, word_count, position)
  select v_new_manuscript_id, null, s.title, s.content, s.word_count, s.position
    from public.scenes s
   where s.manuscript_id = v_source_manuscript_id and s.chapter_id is null
   order by s.position;

  return jsonb_build_object('status', 'ok', 'project', to_jsonb(v_new_project));
end;
$function$;

-- ── 6. Function privileges ──────────────────────────────────────────────────
-- Writers call these as `authenticated`. PUBLIC and anon lose EXECUTE (the
-- bodies also reject a null auth.uid()).
revoke execute on function public.account_word_total(uuid, integer) from public, anon;
revoke execute on function public.save_scene_checked(uuid, jsonb, integer, integer) from public, anon;
revoke execute on function public.insert_scene_checked(uuid, text, jsonb, integer, integer) from public, anon;

-- ── 7. Triggers ─────────────────────────────────────────────────────────────

create trigger trg_project_manuscript after insert on public.projects
  for each row execute function public.create_project_manuscript();

create trigger chapters_forbid_manuscript_reassignment before update of manuscript_id on public.chapters
  for each row execute function public.forbid_manuscript_reassignment();

create trigger scenes_fill_manuscript_id before insert on public.scenes
  for each row execute function public.fill_scene_manuscript_id();
create trigger scenes_forbid_manuscript_reassignment before update of manuscript_id on public.scenes
  for each row execute function public.forbid_manuscript_reassignment();
create trigger scene_version_trigger before update on public.scenes
  for each row execute function public.increment_scene_version();
create trigger trg_scene_updated after update on public.scenes
  for each row execute function public.bump_project_updated_at();

-- ── 8. Row Level Security ───────────────────────────────────────────────────
-- Ownership always resolves to projects.user_id: Manuscript → Project for
-- manuscripts; Chapter/Scene → Manuscript → Project for the rest. A Scene's
-- Chapter never decides ownership (an Unplaced Scene has none). Policies apply
-- to `authenticated` only; anon has no path.

alter table public.manuscripts enable row level security;
alter table public.chapters enable row level security;
alter table public.scenes enable row level security;
alter table public.writing_sessions enable row level security;

-- manuscripts: read-only for writers. Created by trg_project_manuscript,
-- deleted with their Project; no field is writer-editable yet.
create policy "manuscripts: select own" on public.manuscripts
  as permissive for select to authenticated
  using (exists (select 1 from public.projects p
                 where p.id = manuscripts.project_id and p.user_id = (select auth.uid())));

create policy "chapters: select own" on public.chapters
  as permissive for select to authenticated
  using (exists (select 1 from public.manuscripts m join public.projects p on p.id = m.project_id
                 where m.id = chapters.manuscript_id and p.user_id = (select auth.uid())));
create policy "chapters: insert own" on public.chapters
  as permissive for insert to authenticated
  with check (exists (select 1 from public.manuscripts m join public.projects p on p.id = m.project_id
                      where m.id = chapters.manuscript_id and p.user_id = (select auth.uid())));
create policy "chapters: update own" on public.chapters
  as permissive for update to authenticated
  using (exists (select 1 from public.manuscripts m join public.projects p on p.id = m.project_id
                 where m.id = chapters.manuscript_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from public.manuscripts m join public.projects p on p.id = m.project_id
                      where m.id = chapters.manuscript_id and p.user_id = (select auth.uid())));
create policy "chapters: delete own" on public.chapters
  as permissive for delete to authenticated
  using (exists (select 1 from public.manuscripts m join public.projects p on p.id = m.project_id
                 where m.id = chapters.manuscript_id and p.user_id = (select auth.uid())));

create policy "scenes: select own" on public.scenes
  as permissive for select to authenticated
  using (exists (select 1 from public.manuscripts m join public.projects p on p.id = m.project_id
                 where m.id = scenes.manuscript_id and p.user_id = (select auth.uid())));
create policy "scenes: insert own" on public.scenes
  as permissive for insert to authenticated
  with check (exists (select 1 from public.manuscripts m join public.projects p on p.id = m.project_id
                      where m.id = scenes.manuscript_id and p.user_id = (select auth.uid())));
create policy "scenes: update own" on public.scenes
  as permissive for update to authenticated
  using (exists (select 1 from public.manuscripts m join public.projects p on p.id = m.project_id
                 where m.id = scenes.manuscript_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from public.manuscripts m join public.projects p on p.id = m.project_id
                      where m.id = scenes.manuscript_id and p.user_id = (select auth.uid())));
create policy "scenes: delete own" on public.scenes
  as permissive for delete to authenticated
  using (exists (select 1 from public.manuscripts m join public.projects p on p.id = m.project_id
                 where m.id = scenes.manuscript_id and p.user_id = (select auth.uid())));

-- Unchanged from Rune 1.x.
create policy "Users manage own writing sessions" on public.writing_sessions
  as permissive for all to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

insert into public.schema_migrations (version, name, applied_at, note)
values ('015', '015_rune2_manuscript_foundation.sql', now(),
        'Rune 2.0 manuscript foundation on an empty database: manuscripts, chapters.manuscript_id, scenes (replaces pages), writing_sessions.scene_id, Scene save RPCs, no canonical behavior');
