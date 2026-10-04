-- ── Migration 048: a Canvas note becomes a Page or an Unplaced Scene ────────
--
-- Rune 2.0, Milestone 22C. A Canvas-local text note may grow into real
-- supporting material (a Workspace Page) or real manuscript prose (an
-- Unplaced Scene). This migration adds ONE function that does the whole
-- promotion in one transaction, so a failure can never leave the writer with
-- neither the note nor the new object:
--
--   convert_canvas_note(p_item_id, p_target, p_new_item_id, p_title, p_content, p_word_count)
--     → { status: 'ok', target: 'page' | 'scene', object_id, item, connections: [...] }
--     → { status: 'error', error }   (nothing written)
--
--   * p_item_id: the note placement (must be the caller's, on an active
--     Canvas, of item_type 'note').
--   * p_target: 'page' — a workspace_documents row of the Canvas's Project
--     with p_title (null = untitled) and p_content as its text, placed at the
--     top of the Workspace by place_new_workspace_object exactly as a new
--     Page is; 'scene' — an Unplaced Scene through insert_unplaced_scene_checked
--     (the one creation path: ownership, the per-account lock, the checked
--     total; p_title null = an unnamed Scene; p_word_count is the editor's
--     count of p_content). No writing_sessions row is written: a promotion is
--     not writing, so it earns no Today words, no writing day and no session.
--     The Scene is Unplaced: outside narrative order and the ordered total
--     until the writer places it.
--   * p_content: the note's text AS THE WRITER SEES IT (the client sends its
--     current document, so an edit not yet saved is never lost to the
--     promotion); it becomes the Page's or Scene's content unchanged.
--   * The note placement is REPLACED by a live placement of the new object
--     with id p_new_item_id (the client's, so a retried call after a lost
--     reply is answered with the placement it made, never a second one):
--     same Canvas, geometry, z, Section membership and manual_size; label =
--     the title. Every connection that touched the note is re-made with the
--     same id, direction and label, its end moved to the new placement (a
--     placement and a connection keep their ends for life, so the rows are
--     re-created rather than updated). The note row is deleted.
--   * Idempotent: if p_new_item_id already exists on the caller's Canvas, the
--     call is answered with it and its connections, and nothing is written.
--
-- No table, column, trigger, policy or existing function changes. Nothing
-- here touches a placed Scene, a Chapter, the ordered total or any row of
-- another Project.
--
-- Apply BEFORE the app deploy that offers "Convert to Page / Scene" (without
-- it the conversion is refused and nothing is changed — the note stays).
-- Rollback:
--   drop function public.convert_canvas_note(uuid, text, uuid, text, jsonb, integer);
--   delete from public.schema_migrations where version = '048';
-- Apply as ONE script, following tools/db-audit/STAGING.md.

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 048 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '048') then
    raise exception 'Migration 048 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '047') then
    raise exception 'Migration 048 requires migration 047 (Project attachments). Nothing was changed.';
  end if;
end $$;

create function public.convert_canvas_note(
  p_item_id uuid,
  p_target text,
  p_new_item_id uuid,
  p_title text,
  p_content jsonb,
  p_word_count integer default 0
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_note public.workspace_canvas_items%rowtype;
  v_new public.workspace_canvas_items%rowtype;
  v_project_id uuid;
  v_manuscript_id uuid;
  v_object_id uuid;
  v_title text;
  v_content jsonb;
  v_conns public.workspace_canvas_connections[];
  v_conn public.workspace_canvas_connections;
  v_scene jsonb;
  v_target_type text;
begin
  if p_target is null or p_target not in ('page', 'scene') then
    return jsonb_build_object('status', 'error', 'error', 'Unknown target');
  end if;
  if p_new_item_id is null then
    return jsonb_build_object('status', 'error', 'error', 'A conversion needs the new placement''s id');
  end if;

  -- Already done (a retried call): the placement it made, and its connections.
  select i.* into v_new
    from public.workspace_canvas_items i
    join public.projects p on p.id = i.project_id
   where i.id = p_new_item_id and p.user_id = auth.uid();
  if found then
    if v_new.item_type <> p_target then
      return jsonb_build_object('status', 'error', 'error', 'That id belongs to another placement');
    end if;
    return jsonb_build_object('status', 'ok', 'target', p_target,
      'object_id', coalesce(v_new.document_id, v_new.scene_id), 'item', to_jsonb(v_new),
      'connections', coalesce((select jsonb_agg(to_jsonb(k)) from public.workspace_canvas_connections k
                                where k.source_item_id = v_new.id or k.target_item_id = v_new.id), '[]'::jsonb));
  end if;

  -- SECURITY DEFINER: ownership is checked here, not by RLS.
  select i.* into v_note
    from public.workspace_canvas_items i
    join public.workspace_canvases c on c.id = i.canvas_id
    join public.projects p on p.id = i.project_id
   where i.id = p_item_id and p.user_id = auth.uid() and c.trashed_at is null;
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Note not found');
  end if;
  if v_note.item_type <> 'note' then
    return jsonb_build_object('status', 'error', 'error', 'Only a note can be converted');
  end if;
  v_project_id := v_note.project_id;
  perform public.lock_project_workspace(v_project_id);

  v_title := left(nullif(btrim(coalesce(p_title, '')), ''), 200);
  v_content := case when p_content is not null and jsonb_typeof(p_content) = 'object' then p_content
                    else coalesce(v_note.content, '{"type": "doc", "content": []}'::jsonb) end;

  if p_target = 'page' then
    insert into public.workspace_documents (project_id, title, content)
    values (v_project_id, v_title, v_content)
    returning id into v_object_id;
    v_target_type := 'page';
  else
    select m.id into v_manuscript_id from public.manuscripts m where m.project_id = v_project_id;
    if v_manuscript_id is null then
      return jsonb_build_object('status', 'error', 'error', 'Manuscript not found');
    end if;
    -- The one creation path for an Unplaced Scene. An unnamed Scene is stored blank.
    v_scene := public.insert_unplaced_scene_checked(v_manuscript_id, coalesce(v_title, ''), v_content, greatest(coalesce(p_word_count, 0), 0));
    if v_scene->>'status' <> 'ok' then
      return jsonb_build_object('status', 'error', 'error', coalesce(v_scene->>'error', v_scene->>'status'));
    end if;
    v_object_id := (v_scene->>'id')::uuid;
    v_target_type := 'scene';
  end if;

  -- The connections that touched the note, then the note (its connections cascade).
  select coalesce(array_agg(k), array[]::public.workspace_canvas_connections[]) into v_conns
    from public.workspace_canvas_connections k
   where k.source_item_id = v_note.id or k.target_item_id = v_note.id;
  delete from public.workspace_canvas_items i where i.id = v_note.id;

  insert into public.workspace_canvas_items
    (id, canvas_id, project_id, item_type, document_id, scene_id, label, x, y, width, height, z, section_id, manual_size)
  values
    (p_new_item_id, v_note.canvas_id, v_project_id, v_target_type,
     case when v_target_type = 'page' then v_object_id end,
     case when v_target_type = 'scene' then v_object_id end,
     v_title, v_note.x, v_note.y, v_note.width, v_note.height, v_note.z, v_note.section_id, v_note.manual_size)
  returning * into v_new;

  foreach v_conn in array v_conns loop
    insert into public.workspace_canvas_connections (id, canvas_id, project_id, source_item_id, target_item_id, directed, label)
    values (v_conn.id, v_conn.canvas_id, v_conn.project_id,
            case when v_conn.source_item_id = v_note.id then v_new.id else v_conn.source_item_id end,
            case when v_conn.target_item_id = v_note.id then v_new.id else v_conn.target_item_id end,
            v_conn.directed, v_conn.label);
  end loop;

  return jsonb_build_object('status', 'ok', 'target', p_target, 'object_id', v_object_id, 'item', to_jsonb(v_new),
    'connections', coalesce((select jsonb_agg(to_jsonb(k)) from public.workspace_canvas_connections k
                              where k.source_item_id = v_new.id or k.target_item_id = v_new.id), '[]'::jsonb));
end;
$function$;

revoke execute on function public.convert_canvas_note(uuid, text, uuid, text, jsonb, integer) from public, anon;

insert into public.schema_migrations (version, name, applied_at, note)
values ('048', '048_canvas_note_promotion.sql', now(), 'Canvas note promotion (M22C): convert_canvas_note(item, ''page'' | ''scene'', new_item_id, title, content, word_count) creates a Workspace Page or an Unplaced Scene (through insert_unplaced_scene_checked; no writing session) from a note''s text and replaces the note placement with a live placement of it (same geometry, Section, connections re-made) in one transaction; idempotent by the new placement id; no table, trigger or policy changes');
