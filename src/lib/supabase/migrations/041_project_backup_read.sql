-- ── Migration 041: Whole-Project Backup — one read-only, owner-checked read ──
--
-- Rune 2.0, Milestone 19. "Download Project Backup" gives the writer a complete
-- archive of one Project: the manuscript (Groups, Chapters, Scenes — placed,
-- Unplaced and in Trash), Scene properties and Views, Revision Notes at every
-- level, Scene History and Milestones, the Workspace (Folders, Pages,
-- Collections, Entries, properties, values, Views — in Trash too), references,
-- and the Project's writing history. The archive is built on the writer's
-- device; nothing is stored or copied on the server.
--
-- Row Level Security deliberately hides what is in Trash (Chapters, Scenes,
-- Pages, Folders, Collections and their Entries) and the Revision Notes and
-- references that touch it, so an ordinary read can't produce a faithful
-- backup. This migration adds ONE function that reads them:
--
--   read_project_backup(p_project_id, p_kind, p_after, p_limit) → jsonb
--     { status: 'ok', rows: [<row as JSON>, …], next: <cursor> | null }
--     { status: 'error', error: 'Project not found' | 'Unknown kind' }
--
--   * owner-checked: only the Project's own writer (auth.uid()) gets rows; any
--     other caller gets 'Project not found' and nothing else;
--   * every row of one kind for that Project, active and in Trash alike,
--     exactly as stored (to_jsonb of the row — the backup marks Trash from
--     each row's own trashed_at), a page at a time: keyset order by primary
--     key, at most p_limit rows (1–500, default 200), `next` to continue;
--   * kinds (a fixed list; the table name never comes from the caller):
--     groups, chapters, scenes, scene_property_definitions,
--     scene_property_values, scene_views, revision_notes, scene_revisions,
--     milestones, milestone_scenes, workspace_nodes, workspace_folders,
--     workspace_documents, workspace_collections,
--     workspace_collection_properties, workspace_collection_views,
--     workspace_collection_entries, workspace_entry_values, object_references,
--     writing_sessions, writing_goals, project_notes (the caller's own rows of
--     the last three);
--   * STABLE and SECURITY DEFINER with an empty search_path: it can only read.
--     No table, column, policy, trigger, grant on a table, or row changes, and
--     no existing function is touched.
--
-- For the Rune 2.0 database only (it reads 015–040 tables): requires 040.
-- Apply BEFORE the app deploy that offers "Download Project Backup" (without
-- it the backup is refused, with nothing downloaded; manuscript export does
-- not use it). Applying it earlier is safe: nothing calls it.
-- Rollback:
--   drop function public.read_project_backup(uuid, text, text, integer);
--   delete from public.schema_migrations where version = '041';
-- Apply as ONE script (psql -1, or the SQL editor).

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 041 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '041') then
    raise exception 'Migration 041 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '040') then
    raise exception 'Migration 041 requires migration 040 (Revision Notes on the Manuscript and Groups). Nothing was changed.';
  end if;
end
$$;

create function public.read_project_backup(
  p_project_id uuid,
  p_kind text,
  p_after text default null,
  p_limit integer default 200
)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare
  v_manuscript_id uuid;
  v_limit integer := greatest(1, least(coalesce(p_limit, 200), 500));
  v_table text;
  v_filter text;
  v_keys text[];
  v_order text;
  v_after text;
  v_cursor text;
  v_rows jsonb;
  v_count integer;
  v_last text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select m.id into v_manuscript_id
    from public.projects p
    join public.manuscripts m on m.project_id = p.id
   where p.id = p_project_id and p.user_id = auth.uid();
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Project not found');
  end if;

  -- The kind → (table, rows of this Project, key columns). Constants only.
  case p_kind
    when 'groups' then v_table := 'manuscript_groups'; v_filter := 't.manuscript_id = $2'; v_keys := array['id'];
    when 'chapters' then v_table := 'chapters'; v_filter := 't.manuscript_id = $2'; v_keys := array['id'];
    when 'scenes' then v_table := 'scenes'; v_filter := 't.manuscript_id = $2'; v_keys := array['id'];
    when 'scene_property_definitions' then v_table := 'scene_property_definitions'; v_filter := 't.manuscript_id = $2'; v_keys := array['id'];
    when 'scene_property_values' then v_table := 'scene_property_values'; v_filter := 't.manuscript_id = $2'; v_keys := array['scene_id', 'property_id'];
    when 'scene_views' then v_table := 'scene_views'; v_filter := 't.manuscript_id = $2'; v_keys := array['id'];
    when 'revision_notes' then v_table := 'revision_notes'; v_filter := 't.project_id = $1'; v_keys := array['id'];
    when 'scene_revisions' then v_table := 'scene_revisions'; v_filter := 't.manuscript_id = $2'; v_keys := array['id'];
    when 'milestones' then v_table := 'manuscript_milestones'; v_filter := 't.manuscript_id = $2'; v_keys := array['id'];
    when 'milestone_scenes' then
      v_table := 'manuscript_milestone_scenes';
      v_filter := 't.milestone_id in (select ml.id from public.manuscript_milestones ml where ml.manuscript_id = $2)';
      v_keys := array['milestone_id', 'scene_id'];
    when 'workspace_nodes' then v_table := 'workspace_nodes'; v_filter := 't.project_id = $1'; v_keys := array['id'];
    when 'workspace_folders' then v_table := 'workspace_folders'; v_filter := 't.project_id = $1'; v_keys := array['id'];
    when 'workspace_documents' then v_table := 'workspace_documents'; v_filter := 't.project_id = $1'; v_keys := array['id'];
    when 'workspace_collections' then v_table := 'workspace_collections'; v_filter := 't.project_id = $1'; v_keys := array['id'];
    when 'workspace_collection_properties' then v_table := 'workspace_collection_properties'; v_filter := 't.project_id = $1'; v_keys := array['id'];
    when 'workspace_collection_views' then v_table := 'workspace_collection_views'; v_filter := 't.project_id = $1'; v_keys := array['id'];
    when 'workspace_collection_entries' then v_table := 'workspace_collection_entries'; v_filter := 't.project_id = $1'; v_keys := array['id'];
    when 'workspace_entry_values' then v_table := 'workspace_entry_values'; v_filter := 't.project_id = $1'; v_keys := array['entry_id', 'property_id'];
    when 'object_references' then v_table := 'object_references'; v_filter := 't.project_id = $1'; v_keys := array['id'];
    when 'writing_sessions' then v_table := 'writing_sessions'; v_filter := 't.project_id = $1 and t.user_id = auth.uid()'; v_keys := array['id'];
    when 'writing_goals' then v_table := 'writing_goals'; v_filter := 't.project_id = $1 and t.user_id = auth.uid()'; v_keys := array['id'];
    when 'project_notes' then v_table := 'project_notes'; v_filter := 't.project_id = $1 and t.user_id = auth.uid()'; v_keys := array['id'];
    else
      return jsonb_build_object('status', 'error', 'error', 'Unknown kind');
  end case;

  -- Keyset paging: rows after the cursor (the last row's key, "a" or "a:b").
  v_order := array_to_string(array(select 't.' || quote_ident(k) from unnest(v_keys) k), ', ');
  v_cursor := array_to_string(array(select 't.' || quote_ident(k) || '::text' from unnest(v_keys) k), ' || '':'' || ');
  if p_after is not null then
    v_after := format('(%s) > (%s)', v_order,
      array_to_string(array(select format('split_part($3, '':'', %s)::uuid', i) from generate_subscripts(v_keys, 1) i), ', '));
  else
    v_after := 'true';
  end if;

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t) order by %1$s), ''[]''::jsonb), count(*)::int, max(%2$s)
       from (select * from public.%3$I t where %4$s and %5$s order by %1$s limit %6$s) t',
    v_order, v_cursor, v_table, v_filter, v_after, v_limit)
    into v_rows, v_count, v_last
    using p_project_id, v_manuscript_id, p_after;

  return jsonb_build_object(
    'status', 'ok',
    'rows', v_rows,
    'next', case when v_count = v_limit then v_last else null end);
end;
$function$;

revoke execute on function public.read_project_backup(uuid, text, text, integer) from public, anon;

insert into public.schema_migrations (version, name, applied_at, note)
values ('041', '041_project_backup_read.sql', now(), 'read_project_backup(project, kind, after, limit): one STABLE SECURITY DEFINER owner-checked read of every row of one kind of the caller''s Project, Trash included, keyset-paged, for the on-device Whole-Project Backup; no table, policy, trigger, grant on a table or row changes');
