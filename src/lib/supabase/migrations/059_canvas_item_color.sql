-- 059 — Canvas note and Section colour.
--
-- A note or a Section on a Canvas may carry one of a few curated tones
-- (lib/rune2/canvas.ts CANVAS_TONES; the tints themselves live in
-- lib/rune2/themes.ts, one per theme). Organisation, not decoration: a
-- tone is Canvas-local presentation of the placement, never anything of
-- the book. A live placement (a Scene, Chapter, Page, Entry, Canvas) and an
-- image carry none.
--
-- public.workspace_canvas_items — CHANGED.
--   * color (NEW, text, nullable; null = neutral, the default): one of
--     'ink', 'sage', 'ochre', 'rust', 'plum', 'slate', 'rose'; only a note
--     or a Section may have one (constraint). Absent on a pre-059 read:
--     neutral.
--   * version bumps on a colour change too (stamp trigger redefined).
--
-- public.write_canvas_items — REPLACED (same signature and result shape):
--   a create of a note or a Section may carry `color`; an update may set
--   `color` (null to restore neutral) on a note or a Section — on anything
--   else it is refused for that change alone ('Only a note or a Section has
--   a colour'). An unknown tone is refused by the constraint. A client older
--   than this never sends `color`; a client newer than a database without
--   this migration has its `color` key ignored (the row keeps neutral) —
--   nothing else of the batch changes.
--
-- convert_canvas_note (048) is untouched: the live placement it makes
-- carries no colour (the tone was the note's, and a Scene or Page card is
-- never toned).
--
-- Rollback (reverse order):
--   create or replace function public.write_canvas_items …           -- 047's body
--   create or replace function public.stamp_workspace_canvas_item …  -- 046's body
--   alter table public.workspace_canvas_items drop constraint workspace_canvas_items_color_check;
--   alter table public.workspace_canvas_items drop column color;
--   delete from public.schema_migrations where version = '059';

do $$
begin
  if to_regclass('public.workspace_canvas_items') is null then
    raise exception 'Migration 059 needs public.workspace_canvas_items (045). Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '048') then
    raise exception 'Migration 059 needs 048 (Canvas note promotion) applied first. Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '059') then
    raise exception 'Migration 059 is already applied. Nothing was changed.';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'workspace_canvas_items' and column_name = 'color') then
    raise exception 'public.workspace_canvas_items.color already exists. Nothing was changed.';
  end if;
  if (select tableowner from pg_tables where schemaname = 'public' and tablename = 'workspace_canvas_items') <> current_user then
    raise exception 'Migration 059 must be applied by the owner of public.workspace_canvas_items (%, not %). Nothing was changed.',
      (select tableowner from pg_tables where schemaname = 'public' and tablename = 'workspace_canvas_items'), current_user;
  end if;
end
$$;

-- ── The column ──────────────────────────────────────────────────────────────

alter table public.workspace_canvas_items add column color text;

alter table public.workspace_canvas_items add constraint workspace_canvas_items_color_check
  check (color is null
     or (item_type in ('note', 'section') and color in ('ink', 'sage', 'ochre', 'rust', 'plum', 'slate', 'rose')));

-- ── Version: a colour change is a change the Canvas shows ───────────────────

create or replace function public.stamp_workspace_canvas_item()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;
  new.id := old.id;
  new.created_at := old.created_at;
  if (new.content, new.x, new.y, new.width, new.height, new.z, new.label, new.section_id, new.manual_size, new.color)
     is distinct from (old.content, old.x, old.y, old.width, old.height, old.z, old.label, old.section_id, old.manual_size, old.color) then
    new.version := old.version + 1;
    new.updated_at := now();
  else
    new.version := old.version;
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$function$;

-- ── write_canvas_items: colour on create and update ─────────────────────────

create or replace function public.write_canvas_items(p_canvas_id uuid, p_changes jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_project_id uuid;
  v_change jsonb;
  v_kind text;
  v_op text;
  v_id uuid;
  v_type text;
  v_target uuid;
  v_expected integer;
  v_row public.workspace_canvas_items%rowtype;
  v_conn public.workspace_canvas_connections%rowtype;
  v_results jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  -- SECURITY DEFINER: ownership is checked here, not by RLS.
  select c.project_id into v_project_id
    from public.workspace_canvases c
    join public.projects p on p.id = c.project_id
   where c.id = p_canvas_id and p.user_id = auth.uid();
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Canvas not found');
  end if;
  if exists (select 1 from public.workspace_canvases c where c.id = p_canvas_id and c.trashed_at is not null) then
    return jsonb_build_object('status', 'error', 'error', 'This canvas is in Trash');
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then
    return jsonb_build_object('status', 'error', 'error', 'Invalid changes');
  end if;
  if jsonb_array_length(p_changes) > 500 then
    return jsonb_build_object('status', 'error', 'error', 'Too many changes at once');
  end if;

  for v_change in select * from jsonb_array_elements(p_changes) loop
    begin
      v_kind := coalesce(v_change->>'kind', 'item');
      v_op := v_change->>'op';
      v_id := (v_change->>'id')::uuid;
      if v_id is null then
        raise exception 'A change needs an id';
      end if;

      if v_kind = 'connection' then
        if v_op = 'delete' then
          delete from public.workspace_canvas_connections k where k.id = v_id and k.canvas_id = p_canvas_id;
          v_result := jsonb_build_object('id', v_id, 'status', 'ok');

        elsif v_op = 'create' then
          select k.* into v_conn from public.workspace_canvas_connections k where k.id = v_id;
          if found then
            if v_conn.canvas_id <> p_canvas_id then
              raise exception 'That id belongs to another canvas';
            end if;
            v_result := jsonb_build_object('id', v_id, 'status', 'ok', 'version', v_conn.version);
          else
            insert into public.workspace_canvas_connections (id, canvas_id, project_id, source_item_id, target_item_id, directed, label)
            values (v_id, p_canvas_id, v_project_id,
                    (v_change->>'source_id')::uuid, (v_change->>'target_id')::uuid,
                    coalesce((v_change->>'directed')::boolean, false),
                    left(nullif(btrim(coalesce(v_change->>'label', '')), ''), 200))
            returning * into v_conn;
            v_result := jsonb_build_object('id', v_id, 'status', 'ok', 'version', v_conn.version);
          end if;

        elsif v_op = 'update' then
          v_expected := (v_change->>'expected_version')::integer;
          if v_expected is null then
            raise exception 'An update needs the version it is based on';
          end if;
          select k.* into v_conn from public.workspace_canvas_connections k where k.id = v_id and k.canvas_id = p_canvas_id;
          if not found then
            v_result := jsonb_build_object('id', v_id, 'status', 'missing');
          elsif v_conn.version <> v_expected then
            v_result := jsonb_build_object('id', v_id, 'status', 'conflict', 'version', v_conn.version, 'item', to_jsonb(v_conn));
          else
            update public.workspace_canvas_connections k
               set directed = case when v_change ? 'directed' then coalesce((v_change->>'directed')::boolean, false) else k.directed end,
                   label = case when v_change ? 'label' then left(nullif(btrim(coalesce(v_change->>'label', '')), ''), 200) else k.label end
             where k.id = v_id
            returning * into v_conn;
            v_result := jsonb_build_object('id', v_id, 'status', 'ok', 'version', v_conn.version);
          end if;
        else
          raise exception 'Unknown op';
        end if;

      elsif v_kind <> 'item' then
        raise exception 'Unknown kind';

      elsif v_op = 'delete' then
        -- Only this Canvas's rows; a row already gone is fine (a retried batch).
        -- A Section's members stay (section_id → null); a placement's connections go with it.
        delete from public.workspace_canvas_items i where i.id = v_id and i.canvas_id = p_canvas_id;
        v_result := jsonb_build_object('id', v_id, 'status', 'ok');

      elsif v_op = 'create' then
        select i.* into v_row from public.workspace_canvas_items i where i.id = v_id;
        if found then
          if v_row.canvas_id <> p_canvas_id then
            raise exception 'That id belongs to another canvas';
          end if;
          -- Already there (a retried batch): nothing to write.
          v_result := jsonb_build_object('id', v_id, 'status', 'ok', 'version', v_row.version);
        else
          v_type := v_change->>'item_type';
          if v_type is null or v_type not in ('scene', 'chapter', 'page', 'entry', 'canvas', 'note', 'section', 'image') then
            raise exception 'Unknown item type';
          end if;
          v_target := case when v_type in ('note', 'section') then null else (v_change->>'target_id')::uuid end;
          if v_type not in ('note', 'section') and v_target is null then
            raise exception 'A % placement needs a target', v_type;
          end if;
          insert into public.workspace_canvas_items
            (id, canvas_id, project_id, item_type, scene_id, chapter_id, document_id, entry_id, target_canvas_id, attachment_id, label, content,
             x, y, width, height, z, section_id, manual_size, color)
          values
            (v_id, p_canvas_id, v_project_id, v_type,
             case when v_type = 'scene' then v_target end,
             case when v_type = 'chapter' then v_target end,
             case when v_type = 'page' then v_target end,
             case when v_type = 'entry' then v_target end,
             case when v_type = 'canvas' then v_target end,
             case when v_type = 'image' then v_target end,
             case when v_type = 'note' then null
                  when v_type = 'section' then left(nullif(btrim(coalesce(v_change->>'label', '')), ''), 200)
                  else left(v_change->>'label', 200) end,
             case when v_type = 'note' then coalesce(v_change->'content', '{"type": "doc", "content": []}'::jsonb) end,
             coalesce((v_change->>'x')::double precision, 0),
             coalesce((v_change->>'y')::double precision, 0),
             (v_change->>'width')::double precision,
             (v_change->>'height')::double precision,
             coalesce((v_change->>'z')::integer, 0),
             (v_change->>'section_id')::uuid,   -- a Section with one is refused (never nested)
             coalesce((v_change->>'manual_size')::boolean, false),
             case when v_type in ('note', 'section') then nullif(v_change->>'color', '') end)
          returning * into v_row;
          v_result := jsonb_build_object('id', v_id, 'status', 'ok', 'version', v_row.version);
        end if;

      elsif v_op = 'update' then
        v_expected := (v_change->>'expected_version')::integer;
        if v_expected is null then
          raise exception 'An update needs the version it is based on';
        end if;
        select i.* into v_row from public.workspace_canvas_items i where i.id = v_id and i.canvas_id = p_canvas_id;
        if not found then
          v_result := jsonb_build_object('id', v_id, 'status', 'missing');
        elsif v_row.version <> v_expected then
          v_result := jsonb_build_object('id', v_id, 'status', 'conflict', 'version', v_row.version, 'item', to_jsonb(v_row));
        else
          if v_change ? 'content' and v_row.item_type <> 'note' then
            raise exception 'Only a note has content';
          end if;
          if v_change ? 'label' and v_row.item_type <> 'section' then
            raise exception 'Only a Section is renamed on the Canvas';
          end if;
          if v_change ? 'color' and v_row.item_type not in ('note', 'section') then
            raise exception 'Only a note or a Section has a colour';
          end if;
          update public.workspace_canvas_items i
             set x = case when v_change ? 'x' then (v_change->>'x')::double precision else i.x end,
                 y = case when v_change ? 'y' then (v_change->>'y')::double precision else i.y end,
                 width = case when v_change ? 'width' then (v_change->>'width')::double precision else i.width end,
                 height = case when v_change ? 'height' then (v_change->>'height')::double precision else i.height end,
                 z = case when v_change ? 'z' then (v_change->>'z')::integer else i.z end,
                 content = case when v_change ? 'content' then v_change->'content' else i.content end,
                 label = case when v_change ? 'label' then left(nullif(btrim(coalesce(v_change->>'label', '')), ''), 200) else i.label end,
                 section_id = case when v_change ? 'section_id' then (v_change->>'section_id')::uuid else i.section_id end,
                 manual_size = case when v_change ? 'manual_size' then coalesce((v_change->>'manual_size')::boolean, false) else i.manual_size end,
                 color = case when v_change ? 'color' then nullif(v_change->>'color', '') else i.color end
           where i.id = v_id
          returning * into v_row;
          v_result := jsonb_build_object('id', v_id, 'status', 'ok', 'version', v_row.version);
        end if;

      else
        raise exception 'Unknown op';
      end if;
    exception
      when others then
        -- This change alone fails; the others go through.
        v_result := jsonb_build_object('id', v_change->>'id', 'status', 'error', 'error', sqlerrm);
    end;
    v_results := v_results || v_result;
  end loop;

  return jsonb_build_object('status', 'ok', 'results', v_results);
end;
$function$;

insert into public.schema_migrations (version, name, applied_at, note)
values ('059', '059_canvas_item_color.sql', now(), 'Canvas note and Section colour: workspace_canvas_items.color (nullable; one of seven curated tones; notes and Sections only, by constraint); the stamp trigger bumps version on a colour change; write_canvas_items accepts color on create and update of a note or a Section (same signature and result shape); no other table, trigger, policy or row changes');
