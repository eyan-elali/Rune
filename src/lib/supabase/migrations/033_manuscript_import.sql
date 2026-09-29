-- ── Migration 033: Manuscript Import — one atomic creation of an imported manuscript ─
--
-- Rune 2.0, Milestone 15. The writer chooses a .docx / .md / .txt file, Rune
-- reads it ON THE WRITER'S DEVICE, shows the structure it found, the writer
-- corrects it, and only then confirms. Confirmation is this ONE function call:
--
-- public.import_manuscript_checked(p_title text, p_manuscript jsonb, p_request_id uuid) — NEW.
--   Creates a NEW Project — its Manuscript (trg_project_manuscript), and
--   every Manuscript Group, Chapter and Scene of the confirmed structure — in
--   one transaction. Nothing is merged into, moved in or deleted from any
--   existing Project: an import never touches a manuscript that already
--   exists. Any error rolls everything back: there is never a partial import.
--
--   p_manuscript = { items: [item, …], unplaced: [scene, …] }
--     item  = { kind: 'group',   title: text | null, items: [item, …] }
--           | { kind: 'chapter', title: text,        scenes: [scene, …] }  (at least one Scene)
--     scene = { title: text | null, content: <TipTap doc>, word_count: int ≥ 0 }
--   Groups nest at most 4 deep. Siblings (Groups and Chapters together) are
--   numbered 1..n in the given order, a Chapter's Scenes 0..n-1, the Unplaced
--   Scenes 0..n-1 — the same ordering model as 022. At most 1,000 Groups,
--   5,000 Chapters and 20,000 Scenes; titles as the tables allow (a Scene with
--   no title is unnamed, "").
--
--   1. lock_account_word_budget() — the per-account lock every manuscript
--      write takes (it also refuses an unauthenticated caller).
--   2. p_request_id (a client UUID reused by retries): if a Project already
--      exists for it, that Project is returned (created: false) and nothing
--      is written — a retried confirmation never imports twice. Same key as
--      create_project_checked (projects.creation_request_id, 021).
--   3. validation of the whole structure BEFORE the first write. A refusal
--      returns { status: 'error', error } and writes nothing.
--   4. the free-word limit, exactly as every other creation path checks it
--      (account_word_total with the imported words — placed and Unplaced —
--      against free_word_limit_for_caller()): { status: 'word_limit_blocked', limit }.
--      Current implementation reality, not Rune 2.0 pricing; this function
--      follows whatever those two functions decide.
--   5. the rows. The owner is always auth.uid(): no id in the payload names
--      an existing object, so nothing can be written into another writer's
--      (or another) Project. projects.word_count is maintained by
--      scenes_refresh_project_word_count (020), as for every Scene.
--   Returns { status: 'ok', created: true, project, manuscript_id, groups,
--   chapters, scenes }.
--
--   Imported prose is ordinary manuscript data: ordinary Groups, Chapters
--   and Scenes (no "imported" marker), counted in the ordered total and
--   exported like any other. It is NOT writing activity: this function writes
--   no writing_sessions row, so Today's Words, writing days, streaks and
--   sessions are unchanged by an import.
--
-- Internal (no client may call them): import_manuscript_shape (validation
-- and counts) and import_manuscript_items (the recursive insert).
--
-- Unchanged on purpose: every table, column, constraint, trigger and policy;
-- every existing function (create_project_checked, save_scene_checked,
-- insert_scene_checked, account_word_total, …). No row is written by this
-- migration.
--
-- For the Rune 2.0 database only: it requires 032. Apply it BEFORE the app
-- deploy that offers Import (without it, the import is refused with an error
-- and nothing is written; nothing else in the app uses it).
-- Rollback:
--   drop function public.import_manuscript_checked(text, jsonb, uuid);
--   drop function public.import_manuscript_items(uuid, uuid, jsonb);
--   drop function public.import_manuscript_shape(jsonb, integer);
--   delete from public.schema_migrations where version = '033';
-- Apply as ONE script (psql -1, or the SQL editor).

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 033 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '033') then
    raise exception 'Migration 033 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '032') then
    raise exception 'Migration 033 requires migration 032 (scene properties and views). Nothing was changed.';
  end if;
  -- As in 019–032: the SECURITY DEFINER function runs as its owner, which
  -- must own the manuscript tables or it would be subject to RLS.
  if (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.projects'::regclass) <> current_user
     or (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.scenes'::regclass) <> current_user then
    raise exception 'Migration 033 must be applied by the owner of public.projects and public.scenes (%). Nothing was changed.',
      current_user;
  end if;
end
$$;

-- Validates a list of items (and, recursively, their Groups' items) and
-- counts them: { groups, chapters, scenes, words } — or { error }.
create function public.import_manuscript_shape(p_items jsonb, p_depth integer)
 returns jsonb
 language plpgsql
 immutable
 set search_path to ''
as $function$
declare
  v_item jsonb;
  v_scene jsonb;
  v_inner jsonb;
  v_groups bigint := 0;
  v_chapters bigint := 0;
  v_scenes bigint := 0;
  v_words bigint := 0;
begin
  if jsonb_typeof(p_items) is distinct from 'array' then
    return jsonb_build_object('error', 'Invalid manuscript structure');
  end if;
  for v_item in select x from jsonb_array_elements(p_items) x loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      return jsonb_build_object('error', 'Invalid manuscript structure');
    end if;
    if v_item ->> 'kind' = 'group' then
      if p_depth >= 4 then
        return jsonb_build_object('error', 'Groups can be nested at most 4 deep');
      end if;
      if jsonb_typeof(v_item -> 'title') not in ('null', 'string')
         or (jsonb_typeof(v_item -> 'title') = 'string'
             and (btrim(v_item ->> 'title') = '' or char_length(v_item ->> 'title') > 500)) then
        return jsonb_build_object('error', 'A group title must be text of at most 500 characters, or none');
      end if;
      v_inner := public.import_manuscript_shape(v_item -> 'items', p_depth + 1);
      if v_inner ? 'error' then
        return v_inner;
      end if;
      v_groups := v_groups + 1 + (v_inner ->> 'groups')::bigint;
      v_chapters := v_chapters + (v_inner ->> 'chapters')::bigint;
      v_scenes := v_scenes + (v_inner ->> 'scenes')::bigint;
      v_words := v_words + (v_inner ->> 'words')::bigint;
    elsif v_item ->> 'kind' = 'chapter' then
      if jsonb_typeof(v_item -> 'title') is distinct from 'string'
         or btrim(v_item ->> 'title') = '' or char_length(v_item ->> 'title') > 500 then
        return jsonb_build_object('error', 'A chapter needs a title of at most 500 characters');
      end if;
      if jsonb_typeof(v_item -> 'scenes') is distinct from 'array' or jsonb_array_length(v_item -> 'scenes') = 0 then
        return jsonb_build_object('error', 'A chapter needs at least one scene');
      end if;
      v_chapters := v_chapters + 1;
      for v_scene in select x from jsonb_array_elements(v_item -> 'scenes') x loop
        v_inner := public.import_manuscript_shape(jsonb_build_array(jsonb_build_object('kind', 'scene', 'scene', v_scene)), p_depth);
        if v_inner ? 'error' then
          return v_inner;
        end if;
        v_scenes := v_scenes + 1;
        v_words := v_words + (v_inner ->> 'words')::bigint;
      end loop;
    elsif v_item ->> 'kind' = 'scene' then
      -- One Scene (a Chapter's, or Unplaced), wrapped by the caller.
      v_scene := v_item -> 'scene';
      if jsonb_typeof(v_scene) is distinct from 'object'
         or jsonb_typeof(v_scene -> 'title') not in ('null', 'string')
         or char_length(coalesce(v_scene ->> 'title', '')) > 500
         or jsonb_typeof(v_scene -> 'content') is distinct from 'object'
         or v_scene -> 'content' ->> 'type' is distinct from 'doc'
         or jsonb_typeof(v_scene -> 'content' -> 'content') is distinct from 'array'
         or jsonb_typeof(v_scene -> 'word_count') is distinct from 'number'
         or (v_scene ->> 'word_count')::numeric <> floor((v_scene ->> 'word_count')::numeric)
         or (v_scene ->> 'word_count')::numeric not between 0 and 2000000 then
        return jsonb_build_object('error', 'Invalid scene');
      end if;
      v_scenes := v_scenes + 1;
      v_words := v_words + (v_scene ->> 'word_count')::bigint;
    else
      return jsonb_build_object('error', 'Invalid manuscript structure');
    end if;
  end loop;
  return jsonb_build_object('groups', v_groups, 'chapters', v_chapters, 'scenes', v_scenes, 'words', v_words);
end;
$function$;

-- Inserts a validated list of items under p_parent_group_id (null: the
-- Manuscript's top level), siblings numbered 1..n, a Chapter's Scenes 0..n-1.
-- Internal: import_manuscript_checked has validated everything and owns the
-- new, empty Manuscript.
create function public.import_manuscript_items(p_manuscript_id uuid, p_parent_group_id uuid, p_items jsonb)
 returns void
 language plpgsql
 set search_path to ''
as $function$
declare
  v_item jsonb;
  v_position int;
  v_group_id uuid;
  v_chapter_id uuid;
begin
  for v_item, v_position in
    select x, i::int from jsonb_array_elements(p_items) with ordinality as t(x, i)
  loop
    if v_item ->> 'kind' = 'group' then
      insert into public.manuscript_groups (manuscript_id, parent_group_id, title, position)
      values (p_manuscript_id, p_parent_group_id, nullif(btrim(v_item ->> 'title'), ''), v_position)
      returning id into v_group_id;
      perform public.import_manuscript_items(p_manuscript_id, v_group_id, v_item -> 'items');
    else
      insert into public.chapters (manuscript_id, group_id, title, position)
      values (p_manuscript_id, p_parent_group_id, btrim(v_item ->> 'title'), v_position)
      returning id into v_chapter_id;
      insert into public.scenes (manuscript_id, chapter_id, title, content, word_count, position)
      select p_manuscript_id, v_chapter_id, coalesce(btrim(s ->> 'title'), ''), s -> 'content',
             (s ->> 'word_count')::int, (i - 1)::int
        from jsonb_array_elements(v_item -> 'scenes') with ordinality as t(s, i)
       order by i;
    end if;
  end loop;
end;
$function$;

create function public.import_manuscript_checked(p_title text, p_manuscript jsonb, p_request_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_project public.projects%rowtype;
  v_manuscript_id uuid;
  v_items jsonb;
  v_unplaced jsonb;
  v_shape jsonb;
  v_unplaced_shape jsonb;
  v_words bigint;
  v_limit int;
begin
  perform public.lock_account_word_budget();

  -- A retry of an import that already happened: return it, write nothing.
  if p_request_id is not null then
    select * into v_project
      from public.projects p
     where p.user_id = auth.uid() and p.creation_request_id = p_request_id;
    if found then
      select m.id into v_manuscript_id from public.manuscripts m where m.project_id = v_project.id;
      return jsonb_build_object('status', 'ok', 'created', false,
        'project', to_jsonb(v_project), 'manuscript_id', v_manuscript_id);
    end if;
  end if;

  if v_title = '' or char_length(v_title) > 200 then
    return jsonb_build_object('status', 'error', 'error', 'The project needs a title of at most 200 characters');
  end if;
  if jsonb_typeof(p_manuscript) is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(p_manuscript) k where k not in ('items', 'unplaced')) then
    return jsonb_build_object('status', 'error', 'error', 'Invalid manuscript structure');
  end if;
  v_items := coalesce(p_manuscript -> 'items', '[]'::jsonb);
  v_unplaced := coalesce(p_manuscript -> 'unplaced', '[]'::jsonb);
  if jsonb_typeof(v_unplaced) is distinct from 'array' then
    return jsonb_build_object('status', 'error', 'error', 'Invalid manuscript structure');
  end if;

  v_shape := public.import_manuscript_shape(v_items, 0);
  if v_shape ? 'error' then
    return jsonb_build_object('status', 'error', 'error', v_shape ->> 'error');
  end if;
  v_unplaced_shape := public.import_manuscript_shape(
    coalesce((select jsonb_agg(jsonb_build_object('kind', 'scene', 'scene', s)) from jsonb_array_elements(v_unplaced) s), '[]'::jsonb), 0);
  if v_unplaced_shape ? 'error' then
    return jsonb_build_object('status', 'error', 'error', v_unplaced_shape ->> 'error');
  end if;
  if (v_shape ->> 'chapters')::int = 0 and (v_unplaced_shape ->> 'scenes')::int = 0 then
    return jsonb_build_object('status', 'error', 'error', 'There is nothing to import');
  end if;
  if (v_shape ->> 'groups')::int > 1000 or (v_shape ->> 'chapters')::int > 5000
     or (v_shape ->> 'scenes')::int + (v_unplaced_shape ->> 'scenes')::int > 20000 then
    return jsonb_build_object('status', 'error', 'error', 'This manuscript has more structure than one import can create');
  end if;

  v_words := (v_shape ->> 'words')::bigint + (v_unplaced_shape ->> 'words')::bigint;
  if v_words > 2000000 then
    return jsonb_build_object('status', 'error', 'error', 'This manuscript is too long to import');
  end if;
  if v_words > 0 then
    v_limit := public.free_word_limit_for_caller();
    if v_limit is not null and public.account_word_total(null, v_words::int) > v_limit then
      return jsonb_build_object('status', 'word_limit_blocked', 'limit', v_limit);
    end if;
  end if;

  insert into public.projects (user_id, title, creation_request_id)
  values (auth.uid(), v_title, p_request_id)
  returning * into v_project;

  -- Created by trg_project_manuscript.
  select m.id into v_manuscript_id
    from public.manuscripts m
   where m.project_id = v_project.id;
  if v_manuscript_id is null then
    raise exception 'import_manuscript_checked: the Manuscript of Project % was not created', v_project.id;
  end if;

  perform public.import_manuscript_items(v_manuscript_id, null, v_items);

  insert into public.scenes (manuscript_id, chapter_id, title, content, word_count, position)
  select v_manuscript_id, null, coalesce(btrim(s ->> 'title'), ''), s -> 'content', (s ->> 'word_count')::int, (i - 1)::int
    from jsonb_array_elements(v_unplaced) with ordinality as t(s, i)
   order by i;

  -- The stored total, as the triggers left it.
  select * into v_project from public.projects where id = v_project.id;

  return jsonb_build_object('status', 'ok', 'created', true,
    'project', to_jsonb(v_project), 'manuscript_id', v_manuscript_id,
    'groups', (v_shape ->> 'groups')::int,
    'chapters', (v_shape ->> 'chapters')::int,
    'scenes', (v_shape ->> 'scenes')::int + (v_unplaced_shape ->> 'scenes')::int);
end;
$function$;

revoke execute on function public.import_manuscript_shape(jsonb, integer) from public, anon, authenticated;
revoke execute on function public.import_manuscript_items(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.import_manuscript_checked(text, jsonb, uuid) from public, anon;

insert into public.schema_migrations (version, name, applied_at, note)
values ('033', '033_manuscript_import.sql', now(), 'Manuscript Import: import_manuscript_checked creates a new Project and its whole imported structure in one transaction');
