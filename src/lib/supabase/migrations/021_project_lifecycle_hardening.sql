-- ── Migration 021: atomic Project creation; Chapter deletion keeps its prose ─
--
-- Rune 2.0 Phase 1, Task 8. Four changes:
--
-- 1. create_project_checked(p_title, p_description, p_cover_color,
--    p_first_scene_content, p_first_scene_word_count, p_request_id) — NEW.
--    Creates a Project, its Manuscript (trg_project_manuscript), "Chapter 1"
--    (position 1) and its first Scene "Scene 1" (position 0) in ONE
--    transaction. Until now the app inserted the Project, then called
--    create_chapter_checked in a second request: a failure in between left a
--    Project with no Chapter (onboarding deleted it again; the dashboard's
--    createProjectWithDraft did not; the New Project dialog never created a
--    Chapter at all).
--      1. lock_account_word_budget() — the per-account lock every Scene
--         creation, save and move takes (raises 'Not authenticated').
--      2. retry deduplication: p_request_id is a client-generated id for ONE
--         creation attempt, stored in projects.creation_request_id. When the
--         caller already has a Project with that id (a retry whose first
--         response was lost), nothing is written and that Project is
--         returned with created = false. Retries are serialised by the lock;
--         the unique index below is the backstop. null = no deduplication.
--      3. validation: a title that is empty after trimming is refused.
--      4. the free-limit check on the first Scene's words, identical to
--         create_chapter_checked's; an empty first Scene is never blocked.
--      5. the inserts. The ordered total is maintained by
--         scenes_refresh_project_word_count, as for every Scene insert.
--    Any error rolls everything back: there is never a Project without its
--    Manuscript, Chapter 1 and Scene 1.
--    Returns { status: 'ok', created, project, chapter, scene_id }
--          | { status: 'word_limit_blocked', limit } | { status: 'error', error }.
--    On a deduplicated retry, chapter / scene_id are the Project's first
--    Chapter and its first Scene today (null if the writer removed them).
--    SECURITY DEFINER: clients can no longer INSERT projects (below); the
--    Project is always inserted for auth.uid().
--
-- 2. Direct Project inserts are closed to clients. INSERT on public.projects
--    is revoked from anon and authenticated and the "projects: insert own"
--    policy is dropped. (The older catch-all policy "Users can manage their
--    own projects" stays; without the privilege it grants no INSERT.)
--    Projects are created only by create_project_checked and
--    duplicate_project_checked, both SECURITY DEFINER. Clients also can no
--    longer choose a Project's initial word_count.
--    Clients can no longer WRITE projects.word_count either: the BEFORE UPDATE
--    trigger projects_protect_word_count refuses a changed word_count when the
--    current role is anon or authenticated. The database maintains it
--    (migration 020's SECURITY DEFINER trigger runs as the table owner).
--    Every other writer-editable column is unchanged.
--
-- 3. Deleting a Chapter never deletes a Scene.
--    scenes_chapter_same_manuscript_fkey was ON DELETE CASCADE: deleting a
--    Chapter row deleted its placed Scenes (and, through
--    writing_sessions_scene_id_fkey, their writing history). It is re-created
--    with NO ACTION: a Chapter that still holds a Scene cannot be deleted by
--    anyone. Deleting a Project still removes everything (its Manuscript
--    cascades to both its Chapters and its Scenes in the same statement).
--    delete_chapter(p_chapter_id) — NEW, SECURITY INVOKER (RLS decides
--    ownership, as for move_scene):
--      1. lock_account_word_budget(), then the Chapter row FOR UPDATE
--         (another writer's Chapter is invisible: 'Chapter not found'),
--         then its Scenes FOR UPDATE.
--      2. each placed Scene moves to the end of its Manuscript's Unplaced
--         Scenes, in its Chapter order: chapter_id and position change on the
--         SAME row. Scene IDs, prose, word counts and writing history are
--         untouched, so offline saves queued by Scene ID still land.
--         scenes_refresh_project_word_count removes their words from the
--         ordered total in the same transaction.
--      3. the now-empty Chapter row is deleted.
--    Any error rolls everything back: the Chapter and every Scene unchanged.
--    Returns { status: 'ok', unplaced_scene_ids: [...] } | { status: 'error', error }.
--    Deleting a Scene itself is unchanged: a direct DELETE under RLS, which
--    still removes that Scene's writing history (writing_sessions_scene_id_fkey).
--
-- 4. projects.creation_request_id uuid (nullable) with a partial unique index
--    on (user_id, creation_request_id) — the deduplication key of 1.
--
-- For the Rune 2.0 database only: it requires 020. Apply it together with
-- the app deploy that calls create_project_checked / delete_chapter: the
-- previous app inserts Projects directly (refused after 021) and deletes a
-- Chapter directly (refused after 021 while the Chapter holds Scenes).
-- Rollback:
--   drop function public.create_project_checked(text, text, text, jsonb, integer, uuid);
--   drop function public.delete_chapter(uuid);
--   drop trigger projects_protect_word_count on public.projects;
--   drop function public.protect_project_word_count();
--   grant insert on public.projects to anon, authenticated;
--   create policy "projects: insert own" on public.projects as permissive for insert
--     to public with check ((auth.uid() = user_id));
--   alter table public.scenes drop constraint scenes_chapter_same_manuscript_fkey;
--   alter table public.scenes add constraint scenes_chapter_same_manuscript_fkey
--     foreign key (chapter_id, manuscript_id) references public.chapters(id, manuscript_id) on delete cascade;
--   drop index public.projects_user_id_creation_request_id_key;
--   alter table public.projects drop column creation_request_id;
--   delete from public.schema_migrations where version = '021';
-- Apply as ONE script (psql -1, or the SQL editor).

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 021 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '021') then
    raise exception 'Migration 021 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '020') then
    raise exception 'Migration 021 requires migration 020 (manuscript totals). Nothing was changed.';
  end if;
  -- create_project_checked runs as its owner (the role applying this), which
  -- must own projects, chapters and scenes, or it would be subject to RLS.
  if (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.projects'::regclass) <> current_user
     or (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.chapters'::regclass) <> current_user
     or (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.scenes'::regclass) <> current_user then
    raise exception 'Migration 021 must be applied by the owner of public.projects, public.chapters and public.scenes (%, not %). Nothing was changed.',
      (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.projects'::regclass), current_user;
  end if;
end
$$;

-- ── 4. The deduplication key ────────────────────────────────────────────────

alter table public.projects add column creation_request_id uuid;
create unique index projects_user_id_creation_request_id_key
  on public.projects (user_id, creation_request_id)
  where creation_request_id is not null;

-- ── 1. Project → Manuscript → Chapter 1 → Scene 1, atomically ──────────────

create function public.create_project_checked(p_title text, p_description text, p_cover_color text, p_first_scene_content jsonb, p_first_scene_word_count integer, p_request_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_word_count int := coalesce(p_first_scene_word_count, 0);
  v_project public.projects%rowtype;
  v_manuscript_id uuid;
  v_chapter public.chapters%rowtype;
  v_has_chapter boolean;
  v_scene_id uuid;
  v_limit int;
  v_new_total int;
begin
  perform public.lock_account_word_budget();

  -- A retry of a creation that already happened: return it, write nothing.
  if p_request_id is not null then
    select * into v_project
      from public.projects p
     where p.user_id = auth.uid() and p.creation_request_id = p_request_id;
    if found then
      select c.* into v_chapter
        from public.chapters c
        join public.manuscripts m on m.id = c.manuscript_id
       where m.project_id = v_project.id
       order by c.position
       limit 1;
      v_has_chapter := found;
      if v_has_chapter then
        select s.id into v_scene_id
          from public.scenes s
         where s.chapter_id = v_chapter.id
         order by s.position
         limit 1;
      end if;
      return jsonb_build_object('status', 'ok', 'created', false,
        'project', to_jsonb(v_project),
        'chapter', case when v_has_chapter then to_jsonb(v_chapter) end,
        'scene_id', v_scene_id);
    end if;
  end if;

  if v_title = '' then
    return jsonb_build_object('status', 'error', 'error', 'Title is required');
  end if;

  if v_word_count > 0 then
    v_limit := public.free_word_limit_for_caller();
    if v_limit is not null then
      v_new_total := public.account_word_total(null, v_word_count);
      if v_new_total > v_limit then
        return jsonb_build_object('status', 'word_limit_blocked', 'limit', v_limit);
      end if;
    end if;
  end if;

  insert into public.projects (user_id, title, description, cover_color, creation_request_id)
  values (auth.uid(), v_title, p_description, p_cover_color, p_request_id)
  returning * into v_project;

  -- Created by trg_project_manuscript.
  select m.id into v_manuscript_id
    from public.manuscripts m
   where m.project_id = v_project.id;
  if v_manuscript_id is null then
    raise exception 'create_project_checked: the Manuscript of Project % was not created', v_project.id;
  end if;

  insert into public.chapters (manuscript_id, title, position)
  values (v_manuscript_id, 'Chapter 1', 1)
  returning * into v_chapter;

  insert into public.scenes (manuscript_id, chapter_id, title, content, word_count, position)
  values (v_manuscript_id, v_chapter.id, 'Scene 1', p_first_scene_content, v_word_count, 0)
  returning id into v_scene_id;

  -- Re-read: scenes_refresh_project_word_count has set word_count.
  select * into v_project from public.projects p where p.id = v_project.id;

  return jsonb_build_object('status', 'ok', 'created', true,
    'project', to_jsonb(v_project), 'chapter', to_jsonb(v_chapter), 'scene_id', v_scene_id);
end;
$function$;

revoke execute on function public.create_project_checked(text, text, text, jsonb, integer, uuid) from public, anon;

-- ── 2. Projects: no client INSERT; word_count is the database's ────────────

revoke insert on public.projects from anon, authenticated;
drop policy "projects: insert own" on public.projects;

create function public.protect_project_word_count()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if new.word_count is distinct from old.word_count
     and current_user in ('anon', 'authenticated') then
    raise exception 'projects.word_count is maintained by the database'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

revoke execute on function public.protect_project_word_count() from public, anon;

create trigger projects_protect_word_count
  before update of word_count on public.projects
  for each row execute function public.protect_project_word_count();

-- ── 3. Deleting a Chapter moves its Scenes to Unplaced ──────────────────────

alter table public.scenes drop constraint scenes_chapter_same_manuscript_fkey;
-- MATCH SIMPLE: a null chapter_id (Unplaced) is not checked. NO ACTION: a
-- Chapter that still holds a Scene cannot be deleted.
alter table public.scenes add constraint scenes_chapter_same_manuscript_fkey
  foreign key (chapter_id, manuscript_id) references public.chapters(id, manuscript_id);

create function public.delete_chapter(p_chapter_id uuid)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare
  v_chapter public.chapters%rowtype;
  v_scene_ids uuid[];
  v_base int;
begin
  perform public.lock_account_word_budget();

  -- RLS: another writer's Chapter is invisible.
  select * into v_chapter from public.chapters c where c.id = p_chapter_id for update;
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Chapter not found');
  end if;

  select coalesce(array_agg(s.id order by s.position, s.id), '{}')
    into v_scene_ids
    from (select sc.id, sc.position from public.scenes sc
           where sc.chapter_id = p_chapter_id for update) s;

  select coalesce(max(s.position) + 1, 0) into v_base
    from public.scenes s
   where s.manuscript_id = v_chapter.manuscript_id and s.chapter_id is null;

  -- Same rows, new placement. scenes_refresh_project_word_count takes their
  -- words out of the ordered total.
  update public.scenes s
     set chapter_id = null, position = v_base + o.ord::int - 1
    from unnest(v_scene_ids) with ordinality as o(id, ord)
   where s.id = o.id;

  delete from public.chapters c where c.id = p_chapter_id;

  return jsonb_build_object('status', 'ok', 'unplaced_scene_ids', to_jsonb(v_scene_ids));
end;
$function$;

revoke execute on function public.delete_chapter(uuid) from public, anon;

insert into public.schema_migrations (version, name, applied_at, note)
values ('021', '021_project_lifecycle_hardening.sql', now(),
        'Rune 2.0 project lifecycle: create_project_checked (Project + Manuscript + Chapter 1 + Scene 1 atomically, deduplicated by creation_request_id); no client INSERT on projects or write of projects.word_count; Chapter deletion (delete_chapter) moves its Scenes to Unplaced, FK no longer cascades');
