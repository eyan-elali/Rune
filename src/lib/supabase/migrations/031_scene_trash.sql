-- ── Migration 031: Scene Trash ──────────────────────────────────────────────
--
-- Rune 2.0, Phase 1 cleanup. Manuscript Scenes — placed or Unplaced — join
-- the Project's Trash (architecture §26), on the same terms as the Workspace
-- objects of 030: a trashed Scene is its own row, kept whole (id, title,
-- prose, words, version), hidden from every reader until it is restored or
-- deleted permanently. Chapters and Manuscript Groups have no Trash yet.
--
-- public.scenes — NEW columns:
--   * trashed_at               — null = active; set = in Trash since then.
--   * trashed_from_chapter_id  — the Chapter it was placed in when trashed;
--                                null = it was Unplaced. No foreign key: the
--                                Chapter may be deleted meanwhile.
--   The Scene's own `position` is kept as it was, so a restore can put it
--   back in the same place. A trashed Scene is never placed (chapter_id is
--   null; scenes_trash_check), so:
--     * it leaves the ordered manuscript total at once
--       (scenes_refresh_project_word_count, unchanged) and comes back with it;
--     * it holds no Chapter slot (scenes_chapter_id_position_key only covers
--       placed Scenes), and scenes_unplaced_position_excl now covers only
--       ACTIVE Unplaced Scenes — a trashed Scene holds no Unplaced slot either.
--
-- Visibility: scenes' select / update / delete policies require an active
-- Scene, so every reader — the shell, export, dashboards, the legacy pages,
-- save_scene_checked (SECURITY INVOKER) — sees only active Scenes. A save into
-- a trashed Scene writes nothing and answers 'Scene not found', which the
-- offline queue already keeps as `failed` with the prose preserved (and
-- retries — see src/lib/offline/README.md); after a restore it saves.
-- References to or from a trashed Scene go dormant (workspace_object_active,
-- redefined), and search_project_content skips trashed Scenes.
--
-- Unchanged on purpose:
--   * Version: trashing or restoring never changes a Scene's version or
--     updated_at (increment_scene_version skips that one transition), so a
--     draft or queued save based on its version never becomes a conflict.
--   * The legacy free-word allowance counts a trashed Scene's words exactly as
--     before (every Scene of the writer's). account_word_total becomes
--     SECURITY DEFINER — same signature, same body, same explicit
--     auth.uid() filter — so it counts the same rows from every caller now
--     that RLS hides trashed ones.
--   * Writing history: trashing touches no writing_sessions row. Permanent
--     deletion keeps it through scenes_detach_writing_sessions, as for any
--     deleted Scene.
--   * Every RPC signature; save_scene_checked, insert_*, move_scene,
--     reorder_chapter_scenes, delete_chapter and ordered_manuscript_word_total
--     are not redefined.
--   * duplicate_project_checked copies only active Scenes (redefined: the
--     copy is of the manuscript, not of its Trash).
--
-- Functions:
--   * trash_workspace_object / restore_workspace_object /
--     delete_trashed_workspace_object / workspace_trash_state accept type
--     'scene' (redefined; every other type exactly as 030), through the NEW
--     internal trash_manuscript_scene, restore_manuscript_scene and
--     delete_trashed_manuscript_scene. Restore: to its Chapter — in its old
--     place if that is free, else at the Chapter's end — and, if that Chapter
--     is gone, to the end of Unplaced Scenes ('unplaced'). An Unplaced Scene
--     returns to Unplaced. Permanent deletion is only from Trash.
--   * list_workspace_trash lists trashed Scenes too, with their Chapter
--     (from_chapter_id / from_chapter_title / from_chapter_active).
--   * owned_workspace_object_project knows a Scene's Project (its Manuscript's).
--
-- For the Rune 2.0 database only: it requires 030. Nothing existing is
-- trashed, so every row stays visible and every total stays the same. Safe to
-- apply before the app deploy that uses it.
-- Rollback (PERMANENTLY DELETES every trashed Scene; restore first to keep them):
--   delete from public.scenes where trashed_at is not null;
--   then re-create, as 015–030 define them: the scenes policies,
--   scenes_unplaced_position_excl, increment_scene_version,
--   duplicate_project_checked, search_project_content, workspace_object_active,
--   owned_workspace_object_project and the five Trash functions;
--   alter function public.account_word_total(uuid, integer) security invoker;
--   drop function public.trash_manuscript_scene(uuid), public.restore_manuscript_scene(uuid),
--     public.delete_trashed_manuscript_scene(uuid);
--   alter table public.scenes drop constraint scenes_trash_check,
--     drop column trashed_at, drop column trashed_from_chapter_id;
--   delete from public.schema_migrations where version = '031';
-- Apply as ONE script (psql -1, or the SQL editor).

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 031 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '031') then
    raise exception 'Migration 031 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '030') then
    raise exception 'Migration 031 requires migration 030 (workspace trash). Nothing was changed.';
  end if;
  if (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.scenes'::regclass) <> current_user then
    raise exception 'Migration 031 must be applied by the owner of public.scenes (%, not %). Nothing was changed.',
      (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.scenes'::regclass), current_user;
  end if;
end
$$;

-- ── Columns ─────────────────────────────────────────────────────────────────

alter table public.scenes
  add column trashed_at              timestamptz,
  add column trashed_from_chapter_id uuid;

-- A trashed Scene is never placed; only a trashed Scene remembers a Chapter.
alter table public.scenes add constraint scenes_trash_check
  check ((trashed_at is null or chapter_id is null)
     and (trashed_at is not null or trashed_from_chapter_id is null));

create index scenes_trashed_idx on public.scenes using btree (manuscript_id, trashed_at) where trashed_at is not null;

-- Unplaced order is among ACTIVE Unplaced Scenes only.
alter table public.scenes drop constraint scenes_unplaced_position_excl;
alter table public.scenes
  add constraint scenes_unplaced_position_excl
  exclude using btree (manuscript_id with =, position with =) where (chapter_id is null and trashed_at is null)
  deferrable initially immediate;

-- ── Version: Trash is not an edit ───────────────────────────────────────────

-- As 015, except that moving to or from Trash keeps the version and updated_at.
create or replace function public.increment_scene_version()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if new.trashed_at is distinct from old.trashed_at then
    new.version = old.version;
    new.updated_at = old.updated_at;
    return new;
  end if;
  new.version = old.version + 1;
  new.updated_at = now(); -- server-side high-precision timestamp
  return new;
end;
$function$;

-- The allowance counts every Scene of the writer's, trashed or not, from every caller.
alter function public.account_word_total(uuid, integer) security definer;

-- ── Policies: active Scenes only ────────────────────────────────────────────

drop policy "scenes: select own" on public.scenes;
drop policy "scenes: update own" on public.scenes;
drop policy "scenes: delete own" on public.scenes;
create policy "scenes: select own" on public.scenes
  as permissive for select to authenticated
  using (scenes.trashed_at is null
         and exists (select 1 from public.manuscripts m join public.projects p on p.id = m.project_id
                     where m.id = scenes.manuscript_id and p.user_id = (select auth.uid())));
create policy "scenes: update own" on public.scenes
  as permissive for update to authenticated
  using (scenes.trashed_at is null
         and exists (select 1 from public.manuscripts m join public.projects p on p.id = m.project_id
                     where m.id = scenes.manuscript_id and p.user_id = (select auth.uid())))
  with check (scenes.trashed_at is null
              and exists (select 1 from public.manuscripts m join public.projects p on p.id = m.project_id
                          where m.id = scenes.manuscript_id and p.user_id = (select auth.uid())));
create policy "scenes: delete own" on public.scenes
  as permissive for delete to authenticated
  using (scenes.trashed_at is null
         and exists (select 1 from public.manuscripts m join public.projects p on p.id = m.project_id
                     where m.id = scenes.manuscript_id and p.user_id = (select auth.uid())));

-- ── Active objects, ownership, search, duplication ──────────────────────────

-- As 030, except that a Scene is active only while it is not in Trash.
create or replace function public.workspace_object_active(p_type text, p_id uuid)
 returns boolean
 language sql
 stable
 set search_path to ''
as $function$
  select case p_type
    when 'page' then exists (select 1 from public.workspace_documents d where d.id = p_id and d.trashed_at is null)
    when 'folder' then exists (select 1 from public.workspace_folders f where f.id = p_id and f.trashed_at is null)
    when 'collection' then exists (select 1 from public.workspace_collections c where c.id = p_id and c.trashed_at is null)
    when 'entry' then exists (select 1 from public.workspace_collection_entries e
                                join public.workspace_collections c on c.id = e.collection_id
                               where e.id = p_id and e.trashed_at is null and c.trashed_at is null)
    when 'scene' then exists (select 1 from public.scenes s where s.id = p_id and s.trashed_at is null)
    else false
  end;
$function$;

-- As 030, with a Scene's Project (its Manuscript's).
create or replace function public.owned_workspace_object_project(p_type text, p_id uuid)
 returns uuid
 language sql
 stable
 set search_path to ''
as $function$
  select p.id
    from public.projects p
   where p.user_id = auth.uid()
     and p.id = case p_type
       when 'page' then (select d.project_id from public.workspace_documents d where d.id = p_id)
       when 'folder' then (select f.project_id from public.workspace_folders f where f.id = p_id)
       when 'collection' then (select c.project_id from public.workspace_collections c where c.id = p_id)
       when 'entry' then (select e.project_id from public.workspace_collection_entries e where e.id = p_id)
       when 'scene' then (select m.project_id from public.scenes s join public.manuscripts m on m.id = s.manuscript_id where s.id = p_id)
     end;
$function$;

-- As 030, except that trashed Scenes are never searched either.
create or replace function public.search_project_content(p_project_id uuid, p_query text, p_limit integer default 100)
 returns jsonb
 language sql
 stable
 security invoker
 set search_path to 'public'
as $function$
  with q as (
    select lower(btrim(regexp_replace(coalesce(p_query, ''), '\s+', ' ', 'g'))) as q
  ),
  owned as (
    select p.id from public.projects p where p.id = p_project_id and p.user_id = auth.uid()
  ),
  texts as (
    select 'scene'::text as object_type, s.id as object_id, public.rich_text_plain(s.content) as body, 0 as kind_rank
      from public.scenes s
      join public.manuscripts m on m.id = s.manuscript_id
      join owned o on o.id = m.project_id
     where s.trashed_at is null
    union all
    select 'page', d.id, public.rich_text_plain(d.content), 1
      from public.workspace_documents d
      join owned o on o.id = d.project_id
     where d.trashed_at is null
    union all
    select 'entry', e.id, public.rich_text_plain(e.content), 2
      from public.workspace_collection_entries e
      join public.workspace_collections c on c.id = e.collection_id
      join owned o on o.id = e.project_id
     where e.trashed_at is null and c.trashed_at is null
  ),
  found as (
    select t.object_type, t.object_id, t.body, t.kind_rank, strpos(lower(t.body), q.q) as at, length(q.q) as len
      from texts t, q
     where length(q.q) >= 2
       and strpos(lower(t.body), q.q) > 0
  ),
  windowed as (
    select f.*, greatest(f.at - 60, 1) as w_from, least(f.at + f.len + 80, length(f.body) + 1) as w_to
      from found f
  )
  select coalesce(jsonb_agg(jsonb_build_object('type', r.object_type, 'id', r.object_id, 'snippet', r.snippet)
                            order by r.kind_rank, r.object_id), '[]'::jsonb)
    from (
      select w.object_type,
             w.object_id,
             w.kind_rank,
             -- An excerpt around the first match, trimmed to whole words, with
             -- an ellipsis where the text goes on.
             case when w.w_from > 1 then '…' else '' end
               || btrim(regexp_replace(regexp_replace(substr(w.body, w.w_from, w.w_to - w.w_from),
                    case when w.w_from > 1 then '^\S*\s' else '^' end, ''),
                    case when w.w_to <= length(w.body) then '\s\S*$' else '$' end, ''))
               || case when w.w_to <= length(w.body) then '…' else '' end as snippet
        from windowed w
       order by w.kind_rank, w.object_id
       limit greatest(1, least(coalesce(p_limit, 100), 200))
    ) r;
$function$;

-- As 022, except that only active Scenes are counted and copied.
create or replace function public.duplicate_project_checked(p_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_source public.projects%rowtype;
  v_source_manuscript_id uuid;
  v_source_chapter record;
  v_new_project public.projects%rowtype;
  v_new_manuscript_id uuid;
  v_new_chapter_id uuid;
  v_group_map jsonb;
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
   where s.manuscript_id = v_source_manuscript_id and s.trashed_at is null;

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

  -- Every Group in one statement (a parent's foreign key is checked at its end).
  select coalesce(jsonb_object_agg(g.id, gen_random_uuid()), '{}'::jsonb) into v_group_map
    from public.manuscript_groups g
   where g.manuscript_id = v_source_manuscript_id;

  insert into public.manuscript_groups (id, manuscript_id, parent_group_id, title, position)
  select (v_group_map ->> g.id::text)::uuid, v_new_manuscript_id,
         (v_group_map ->> g.parent_group_id::text)::uuid, g.title, g.position
    from public.manuscript_groups g
   where g.manuscript_id = v_source_manuscript_id;

  for v_source_chapter in
    select * from public.chapters where manuscript_id = v_source_manuscript_id order by position
  loop
    insert into public.chapters (manuscript_id, group_id, title, position)
    values (v_new_manuscript_id, (v_group_map ->> v_source_chapter.group_id::text)::uuid,
            v_source_chapter.title, v_source_chapter.position)
    returning id into v_new_chapter_id;

    insert into public.scenes (manuscript_id, chapter_id, title, content, word_count, position)
    select v_new_manuscript_id, v_new_chapter_id, s.title, s.content, s.word_count, s.position
      from public.scenes s
     where s.chapter_id = v_source_chapter.id and s.trashed_at is null
     order by s.position;
  end loop;

  insert into public.scenes (manuscript_id, chapter_id, title, content, word_count, position)
  select v_new_manuscript_id, null, s.title, s.content, s.word_count, s.position
    from public.scenes s
   where s.manuscript_id = v_source_manuscript_id and s.chapter_id is null and s.trashed_at is null
   order by s.position;

  return jsonb_build_object('status', 'ok', 'project', to_jsonb(v_new_project));
end;
$function$;

-- ── Scene Trash ─────────────────────────────────────────────────────────────

-- Moves one active Scene to Trash: it leaves its Chapter (or Unplaced Scenes),
-- remembering the Chapter; its position, prose, words and version stay.
-- Internal: called by trash_workspace_object.
create function public.trash_manuscript_scene(p_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_scene public.scenes%rowtype;
begin
  perform public.lock_account_word_budget();
  select s.* into v_scene
    from public.scenes s
    join public.manuscripts m on m.id = s.manuscript_id
    join public.projects p on p.id = m.project_id
   where s.id = p_id and p.user_id = auth.uid()
     for update of s;
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Item not found');
  end if;
  if v_scene.trashed_at is not null then
    return jsonb_build_object('status', 'error', 'error', 'Already in Trash');
  end if;

  -- scenes_refresh_project_word_count takes a placed Scene's words out of the
  -- ordered total.
  update public.scenes
     set trashed_at = now(), trashed_from_chapter_id = v_scene.chapter_id, chapter_id = null
   where id = p_id;
  return jsonb_build_object('status', 'ok', 'moved', 0);
end;
$function$;

-- Brings one Scene back from Trash as the same Scene: into its Chapter — in
-- its old place if that is free, else at the Chapter's end ('original') — or,
-- if that Chapter no longer exists, at the end of Unplaced Scenes
-- ('unplaced'). An Unplaced Scene returns to Unplaced ('original'). Never
-- blocked by the free-word allowance: restoring is not writing.
-- Internal: called by restore_workspace_object.
create function public.restore_manuscript_scene(p_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_scene public.scenes%rowtype;
  v_chapter uuid;
  v_position integer;
begin
  perform public.lock_account_word_budget();
  select s.* into v_scene
    from public.scenes s
    join public.manuscripts m on m.id = s.manuscript_id
    join public.projects p on p.id = m.project_id
   where s.id = p_id and p.user_id = auth.uid()
     for update of s;
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Item not found');
  end if;
  if v_scene.trashed_at is null then
    return jsonb_build_object('status', 'error', 'error', 'Not in Trash');
  end if;

  select c.id into v_chapter
    from public.chapters c
   where c.id = v_scene.trashed_from_chapter_id and c.manuscript_id = v_scene.manuscript_id
     for update;

  if v_chapter is not null then
    if exists (select 1 from public.scenes s where s.chapter_id = v_chapter and s.position = v_scene.position) then
      select coalesce(max(s.position) + 1, 0) into v_position from public.scenes s where s.chapter_id = v_chapter;
    else
      v_position := v_scene.position;
    end if;
  else
    if exists (select 1 from public.scenes s
                where s.manuscript_id = v_scene.manuscript_id and s.chapter_id is null
                  and s.trashed_at is null and s.position = v_scene.position) then
      select coalesce(max(s.position) + 1, 0) into v_position
        from public.scenes s
       where s.manuscript_id = v_scene.manuscript_id and s.chapter_id is null and s.trashed_at is null;
    else
      v_position := v_scene.position;
    end if;
  end if;

  update public.scenes
     set trashed_at = null, trashed_from_chapter_id = null, chapter_id = v_chapter, position = v_position
   where id = p_id;
  if v_chapter is not null then
    update public.chapters set updated_at = now() where id = v_chapter;
  end if;

  return jsonb_build_object('status', 'ok',
    'location', case when v_scene.trashed_from_chapter_id is not null and v_chapter is null then 'unplaced' else 'original' end);
end;
$function$;

-- Permanently deletes one Scene that is in Trash. Irreversible: its prose
-- goes. Its writing history stays (scenes_detach_writing_sessions), and its
-- references go (028's ON DELETE CASCADE) — never the objects at their other
-- ends. Internal: called by delete_trashed_workspace_object.
create function public.delete_trashed_manuscript_scene(p_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  perform public.lock_account_word_budget();
  if not exists (select 1 from public.scenes s
                   join public.manuscripts m on m.id = s.manuscript_id
                   join public.projects p on p.id = m.project_id
                  where s.id = p_id and p.user_id = auth.uid()) then
    return jsonb_build_object('status', 'error', 'error', 'Item not found');
  end if;
  if not exists (select 1 from public.scenes s where s.id = p_id and s.trashed_at is not null) then
    return jsonb_build_object('status', 'error', 'error', 'Only an item in Trash can be deleted permanently');
  end if;
  delete from public.scenes s where s.id = p_id;
  return jsonb_build_object('status', 'ok', 'entries', 0, 'properties', 0);
end;
$function$;

revoke execute on function public.trash_manuscript_scene(uuid) from public, anon, authenticated;
revoke execute on function public.restore_manuscript_scene(uuid) from public, anon, authenticated;
revoke execute on function public.delete_trashed_manuscript_scene(uuid) from public, anon, authenticated;

-- ── The Trash functions: Scenes too ─────────────────────────────────────────

-- As 030, plus Scenes.
create or replace function public.trash_workspace_object(p_type text, p_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_project_id uuid;
  v_node public.workspace_nodes%rowtype;
  v_from_folder uuid;
  v_child uuid;
  v_at integer;
  v_moved integer := 0;
begin
  -- A Scene (031) follows the manuscript's rules, not the Workspace tree's.
  if p_type = 'scene' then
    return public.trash_manuscript_scene(p_id);
  end if;
  if p_type is null or p_type not in ('page', 'folder', 'collection', 'entry') then
    return jsonb_build_object('status', 'error', 'error', 'Unknown item type');
  end if;
  v_project_id := public.owned_workspace_object_project(p_type, p_id);
  if v_project_id is null then
    return jsonb_build_object('status', 'error', 'error', 'Item not found');
  end if;
  perform public.lock_project_workspace(v_project_id);
  if not public.workspace_object_active(p_type, p_id) then
    return jsonb_build_object('status', 'error', 'error', 'Already in Trash');
  end if;

  if p_type = 'entry' then
    update public.workspace_collection_entries set trashed_at = now() where id = p_id;
    return jsonb_build_object('status', 'ok', 'moved', 0);
  end if;

  select n.* into v_node from public.workspace_nodes n
   where case p_type when 'page' then n.document_id when 'folder' then n.folder_id else n.collection_id end = p_id;
  if found then
    select pn.folder_id into v_from_folder from public.workspace_nodes pn where pn.id = v_node.parent_node_id;

    -- A Folder's items take its place, in order, just after it; then it goes.
    if p_type = 'folder' then
      v_at := v_node.position;          -- 0-based: just after the Folder
      for v_child in
        select c.id from public.workspace_nodes c where c.parent_node_id = v_node.id order by c.position, c.id
      loop
        perform public.place_workspace_node(v_child, v_node.parent_node_id, v_at);
        v_at := v_at + 1;
        v_moved := v_moved + 1;
      end loop;
    end if;

    delete from public.workspace_nodes n where n.id = v_node.id;
    perform public.renumber_workspace_siblings(v_project_id, v_node.parent_node_id);
  end if;

  if p_type = 'page' then
    update public.workspace_documents
       set trashed_at = now(), trashed_from_folder_id = v_from_folder, trashed_from_position = v_node.position
     where id = p_id;
  elsif p_type = 'folder' then
    update public.workspace_folders
       set trashed_at = now(), trashed_from_folder_id = v_from_folder, trashed_from_position = v_node.position
     where id = p_id;
  else
    update public.workspace_collections
       set trashed_at = now(), trashed_from_folder_id = v_from_folder, trashed_from_position = v_node.position
     where id = p_id;
  end if;
  return jsonb_build_object('status', 'ok', 'moved', v_moved);
end;
$function$;

-- As 030, plus Scenes.
create or replace function public.restore_workspace_object(p_type text, p_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_project_id uuid;
  v_trashed_at timestamptz;
  v_from_folder uuid;
  v_from_position integer;
  v_parent uuid;
  v_index integer;
  v_node_id uuid;
begin
  -- A Scene (031) follows the manuscript's rules, not the Workspace tree's.
  if p_type = 'scene' then
    return public.restore_manuscript_scene(p_id);
  end if;
  if p_type is null or p_type not in ('page', 'folder', 'collection', 'entry') then
    return jsonb_build_object('status', 'error', 'error', 'Unknown item type');
  end if;
  v_project_id := public.owned_workspace_object_project(p_type, p_id);
  if v_project_id is null then
    return jsonb_build_object('status', 'error', 'error', 'Item not found');
  end if;
  perform public.lock_project_workspace(v_project_id);

  if p_type = 'entry' then
    select e.trashed_at into v_trashed_at from public.workspace_collection_entries e where e.id = p_id;
    if v_trashed_at is null then
      return jsonb_build_object('status', 'error', 'error', 'Not in Trash');
    end if;
    if not exists (select 1 from public.workspace_collection_entries e
                     join public.workspace_collections c on c.id = e.collection_id
                    where e.id = p_id and c.trashed_at is null) then
      return jsonb_build_object('status', 'error', 'error', 'Restore its collection first');
    end if;
    update public.workspace_collection_entries set trashed_at = null where id = p_id;
    return jsonb_build_object('status', 'ok', 'location', 'original');
  end if;

  if p_type = 'page' then
    select d.trashed_at, d.trashed_from_folder_id, d.trashed_from_position
      into v_trashed_at, v_from_folder, v_from_position from public.workspace_documents d where d.id = p_id;
  elsif p_type = 'folder' then
    select f.trashed_at, f.trashed_from_folder_id, f.trashed_from_position
      into v_trashed_at, v_from_folder, v_from_position from public.workspace_folders f where f.id = p_id;
  else
    select c.trashed_at, c.trashed_from_folder_id, c.trashed_from_position
      into v_trashed_at, v_from_folder, v_from_position from public.workspace_collections c where c.id = p_id;
  end if;
  if v_trashed_at is null then
    return jsonb_build_object('status', 'error', 'error', 'Not in Trash');
  end if;

  -- Where it was, if that is still somewhere: an active Folder of this Project
  -- (its node) or the top level. Otherwise the end of the top level.
  if v_from_folder is null then
    v_parent := null;
    v_index := v_from_position - 1;
  else
    select n.id into v_parent
      from public.workspace_nodes n
      join public.workspace_folders f on f.id = n.folder_id
     where f.id = v_from_folder and f.project_id = v_project_id and f.trashed_at is null;
    v_index := case when v_parent is null then null else v_from_position - 1 end;
  end if;

  if p_type = 'page' then
    update public.workspace_documents set trashed_at = null, trashed_from_folder_id = null, trashed_from_position = null where id = p_id;
  elsif p_type = 'folder' then
    update public.workspace_folders set trashed_at = null, trashed_from_folder_id = null, trashed_from_position = null where id = p_id;
  else
    update public.workspace_collections set trashed_at = null, trashed_from_folder_id = null, trashed_from_position = null where id = p_id;
  end if;

  -- Its one node (the unique target keys refuse a second), made at the end of
  -- the top level and then put in place.
  insert into public.workspace_nodes (project_id, target_type, document_id, folder_id, collection_id, parent_node_id, position)
  values (v_project_id, p_type,
          case when p_type = 'page' then p_id end,
          case when p_type = 'folder' then p_id end,
          case when p_type = 'collection' then p_id end,
          null,
          (select coalesce(max(n.position), 0) + 1 from public.workspace_nodes n
            where n.project_id = v_project_id and n.parent_node_id is null))
  returning id into v_node_id;
  perform public.place_workspace_node(v_node_id, v_parent, v_index);

  return jsonb_build_object('status', 'ok', 'node_id', v_node_id,
    'location', case when v_from_folder is not null and v_parent is null then 'top' else 'original' end);
end;
$function$;

-- As 030, plus Scenes.
create or replace function public.delete_trashed_workspace_object(p_type text, p_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_project_id uuid;
  v_entries integer := 0;
  v_properties integer := 0;
  v_in_trash boolean;
begin
  -- A Scene (031) follows the manuscript's rules, not the Workspace tree's.
  if p_type = 'scene' then
    return public.delete_trashed_manuscript_scene(p_id);
  end if;
  if p_type is null or p_type not in ('page', 'folder', 'collection', 'entry') then
    return jsonb_build_object('status', 'error', 'error', 'Unknown item type');
  end if;
  v_project_id := public.owned_workspace_object_project(p_type, p_id);
  if v_project_id is null then
    return jsonb_build_object('status', 'error', 'error', 'Item not found');
  end if;
  perform public.lock_project_workspace(v_project_id);

  -- Only what is in Trash itself (an Entry: trashed on its own).
  v_in_trash := case p_type
    when 'page' then exists (select 1 from public.workspace_documents d where d.id = p_id and d.trashed_at is not null)
    when 'folder' then exists (select 1 from public.workspace_folders f where f.id = p_id and f.trashed_at is not null)
    when 'collection' then exists (select 1 from public.workspace_collections c where c.id = p_id and c.trashed_at is not null)
    else exists (select 1 from public.workspace_collection_entries e where e.id = p_id and e.trashed_at is not null)
  end;
  if not v_in_trash then
    return jsonb_build_object('status', 'error', 'error', 'Only an item in Trash can be deleted permanently');
  end if;

  if p_type = 'page' then
    delete from public.workspace_documents d where d.id = p_id;
  elsif p_type = 'folder' then
    delete from public.workspace_folders f where f.id = p_id;
  elsif p_type = 'entry' then
    delete from public.workspace_collection_entries e where e.id = p_id;
  else
    select count(*) into v_properties from public.workspace_collection_properties pr
     where pr.relation_collection_id = p_id and pr.collection_id <> p_id;
    delete from public.workspace_collection_entries e where e.collection_id = p_id;
    get diagnostics v_entries = row_count;
    delete from public.workspace_collections c where c.id = p_id;
  end if;
  return jsonb_build_object('status', 'ok', 'entries', v_entries, 'properties', v_properties);
end;
$function$;

-- As 030, plus Scenes.
create or replace function public.workspace_trash_state(p_type text, p_id uuid)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
begin
  if p_type is null or p_type not in ('page', 'folder', 'collection', 'entry', 'scene')
     or public.owned_workspace_object_project(p_type, p_id) is null then
    return jsonb_build_object('status', 'ok', 'state', 'missing');
  end if;
  return jsonb_build_object('status', 'ok', 'state',
    case when public.workspace_object_active(p_type, p_id) then 'active' else 'trashed' end);
end;
$function$;

-- As 030, with trashed Scenes (and, for them, their Chapter) in the list.
create or replace function public.list_workspace_trash(p_project_id uuid)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
begin
  if not exists (select 1 from public.projects p where p.id = p_project_id and p.user_id = auth.uid()) then
    return jsonb_build_object('status', 'error', 'error', 'Project not found');
  end if;

  return jsonb_build_object('status', 'ok', 'items', coalesce((
    select jsonb_agg(to_jsonb(t) order by t.trashed_at desc, t.id)
      from (
        select 'page' as type, d.id, d.title, d.trashed_at,
               d.trashed_from_folder_id as from_folder_id, ff.title as from_folder_title,
               (ff.id is not null and ff.trashed_at is null) as from_folder_active,
               null::uuid as collection_id, null::text as collection_title, null::boolean as collection_active,
               null::integer as entries, null::integer as properties,
               null::uuid as from_chapter_id, null::text as from_chapter_title, null::boolean as from_chapter_active
          from public.workspace_documents d
          left join public.workspace_folders ff on ff.id = d.trashed_from_folder_id
         where d.project_id = p_project_id and d.trashed_at is not null
        union all
        select 'folder', f.id, f.title, f.trashed_at,
               f.trashed_from_folder_id, ff.title, (ff.id is not null and ff.trashed_at is null),
               null, null, null, null, null, null, null, null
          from public.workspace_folders f
          left join public.workspace_folders ff on ff.id = f.trashed_from_folder_id
         where f.project_id = p_project_id and f.trashed_at is not null
        union all
        select 'collection', c.id, c.title, c.trashed_at,
               c.trashed_from_folder_id, ff.title, (ff.id is not null and ff.trashed_at is null),
               null, null, null,
               (select count(*)::integer from public.workspace_collection_entries e where e.collection_id = c.id),
               (select count(*)::integer from public.workspace_collection_properties pr
                 where pr.relation_collection_id = c.id and pr.collection_id <> c.id),
               null, null, null
          from public.workspace_collections c
          left join public.workspace_folders ff on ff.id = c.trashed_from_folder_id
         where c.project_id = p_project_id and c.trashed_at is not null
        union all
        select 'entry', e.id, e.title, e.trashed_at,
               null, null, null,
               c.id, c.title, c.trashed_at is null,
               null, null, null, null, null
          from public.workspace_collection_entries e
          join public.workspace_collections c on c.id = e.collection_id
         where e.project_id = p_project_id and e.trashed_at is not null
        union all
        select 'scene', s.id, s.title, s.trashed_at,
               null, null, null, null, null, null, null, null,
               s.trashed_from_chapter_id, ch.title, ch.id is not null
          from public.scenes s
          join public.manuscripts m on m.id = s.manuscript_id
          left join public.chapters ch on ch.id = s.trashed_from_chapter_id and ch.manuscript_id = s.manuscript_id
         where m.project_id = p_project_id and s.trashed_at is not null
      ) t), '[]'::jsonb));
end;
$function$;

insert into public.schema_migrations (version, name, applied_at, note)
values ('031', '031_scene_trash.sql', now(), 'Scene Trash: scenes.trashed_at + trashed_from_chapter_id (a trashed Scene is unplaced, keeps its position, version and updated_at, and holds no Unplaced slot); RLS shows active Scenes only; restore to its Chapter (old place if free, else the end) or to Unplaced when the Chapter is gone; permanent deletion keeps writing history; the Trash RPCs accept scene; account_word_total SECURITY DEFINER so the allowance still counts every Scene; duplicate_project_checked and search_project_content skip trashed Scenes');
