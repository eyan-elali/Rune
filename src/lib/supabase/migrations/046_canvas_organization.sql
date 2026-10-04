-- ── Migration 046: Canvas spatial organization ───────────────────────────────
--
-- Rune 2.0, Milestone 22B. A Canvas that grows past a screenful needs ways to
-- keep it legible: Sections (quiet spatial regions that hold placements),
-- connections (a line, or an arrow, with a short label, between two
-- placements), authoritative card sizes, and text notes that Project Search
-- can find. All of it is Canvas-local: nothing here reads, writes or moves a
-- Scene, a Chapter, a Page, an Entry or any of their rows, and no
-- placement, Section or connection is ever a Relationship, a backlink or a
-- manuscript dependency.
--
-- public.workspace_canvas_items — CHANGED.
--   * item_type gains 'section': a Section is a placement row like any
--     other — it has geometry, z and a version, it is created, moved,
--     resized, renamed and deleted through write_canvas_items in the same
--     idempotent, version-checked batches, and it persists on the device the
--     same way. Its title is `label` (null = untitled; ≤ 200), it has no
--     target and no content.
--   * section_id (NEW, nullable; FK to this table ON DELETE SET NULL): the
--     Section a placement belongs to. Membership is explicit, never derived
--     from overlap: the app sets it when a placement is dropped into or out
--     of a Section, and a Section's move carries its members. A Section
--     cannot belong to a Section (no nesting), a member's Section is of the
--     same Canvas, and deleting a Section keeps its placements where they
--     are, now unsectioned (SET NULL).
--   * manual_size (NEW, boolean, default false): whether the writer chose
--     the row's size. width and height were always stored; the app now treats
--     them as the card's size (a card never grows with its object's text).
--     A note grows while it is first typed into, until the writer resizes it.
--   * version bumps on section_id, manual_size and label changes too.
--
-- public.workspace_canvas_connections — NEW. One row is one connection
--   between two PLACEMENTS of one Canvas (source_item_id, target_item_id:
--   workspace_canvas_items rows, both ON DELETE CASCADE), so the same Scene
--   placed twice can be connected once. directed (an arrow) and an optional
--   label (≤ 200). Neither endpoint is a Section (V0). A placement's
--   connections go with it: removing the placement, or the permanent
--   deletion of its target (which cascades to the placement), removes them;
--   a target merely in Trash keeps its placement, so the connection stays.
--   RLS: read own, active Canvases only; no client writes.
--
-- public.write_canvas_items — REPLACED (same signature and result shape).
--   A change may carry `kind: 'connection'` (default 'item'): create
--   {id, source_id, target_id, directed, label}, update {id, expected_version,
--   directed?, label?}, delete {id} — the same idempotent creates, conditional
--   updates and tolerant deletes as items. An item create accepts item_type
--   'section', section_id and manual_size; an item update may set section_id
--   (null to leave a Section), manual_size, and label for a Section (its
--   title). Everything in one batch is one transaction: a Section's move with
--   its members lands whole or not at all.
--
-- public.search_project_content — REPLACED (same signature). Also finds text
--   in Canvas notes ({type: 'canvas_note', id: the item, canvas_id, snippet})
--   and Section titles ({type: 'canvas_section', …}) of the Project's active
--   Canvases. Derived from the rows on read, never copied: geometry,
--   connections and anything visual are not searched.
--
-- public.read_project_backup — REPLACED: kind 'workspace_canvas_connections'.
--
-- Apply BEFORE the app deploy that uses it: the previous app keeps working
-- (it reads the item columns it knows; it never sends a Section or a
-- connection). Without it, the new app cannot save Sections or connections.
--
-- Rollback (nothing else depends on these):
--   drop function public.search_project_content(uuid, text, integer);  -- then re-create 031's
--   drop function public.write_canvas_items(uuid, jsonb);              -- then re-create 045's
--   drop function public.read_project_backup(uuid, text, text, integer); -- then re-create 045's
--   drop table public.workspace_canvas_connections;
--   delete from public.workspace_canvas_items where item_type = 'section';
--   alter table public.workspace_canvas_items drop column section_id, drop column manual_size;
--   -- then re-create 045's constraints and triggers on workspace_canvas_items
--   delete from public.schema_migrations where version = '046';

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 046 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '046') then
    raise exception 'Migration 046 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '045') then
    raise exception 'Migration 046 requires migration 045 (Workspace Canvas). Nothing was changed.';
  end if;
  if (select tableowner from pg_tables where schemaname = 'public' and tablename = 'workspace_canvas_items') <> current_user then
    raise exception 'Migration 046 must be applied by the owner of public.workspace_canvas_items (%, not %). Nothing was changed.',
      (select tableowner from pg_tables where schemaname = 'public' and tablename = 'workspace_canvas_items'), current_user;
  end if;
end $$;

-- ── Items: Sections, membership, chosen sizes ───────────────────────────────

alter table public.workspace_canvas_items add column section_id uuid;
alter table public.workspace_canvas_items add column manual_size boolean default false not null;

alter table public.workspace_canvas_items add constraint workspace_canvas_items_section_id_fkey
  foreign key (section_id) references public.workspace_canvas_items(id) on delete set null;
-- A Section is never in a Section.
alter table public.workspace_canvas_items add constraint workspace_canvas_items_section_not_nested
  check (item_type <> 'section' or section_id is null);

alter table public.workspace_canvas_items drop constraint workspace_canvas_items_item_type_check;
alter table public.workspace_canvas_items add constraint workspace_canvas_items_item_type_check
  check (item_type in ('scene', 'chapter', 'page', 'entry', 'canvas', 'note', 'section'));

alter table public.workspace_canvas_items drop constraint workspace_canvas_items_target_matches_type;
alter table public.workspace_canvas_items add constraint workspace_canvas_items_target_matches_type
  check (
    (item_type = 'scene'   and scene_id is not null and chapter_id is null and document_id is null and entry_id is null and target_canvas_id is null and content is null)
 or (item_type = 'chapter' and chapter_id is not null and scene_id is null and document_id is null and entry_id is null and target_canvas_id is null and content is null)
 or (item_type = 'page'    and document_id is not null and scene_id is null and chapter_id is null and entry_id is null and target_canvas_id is null and content is null)
 or (item_type = 'entry'   and entry_id is not null and scene_id is null and chapter_id is null and document_id is null and target_canvas_id is null and content is null)
 or (item_type = 'canvas'  and target_canvas_id is not null and scene_id is null and chapter_id is null and document_id is null and entry_id is null and content is null)
 or (item_type = 'note'    and content is not null and jsonb_typeof(content) = 'object'
                           and scene_id is null and chapter_id is null and document_id is null and entry_id is null and target_canvas_id is null and label is null)
 or (item_type = 'section' and scene_id is null and chapter_id is null and document_id is null and entry_id is null and target_canvas_id is null and content is null));

create index workspace_canvas_items_section_id_idx on public.workspace_canvas_items using btree (section_id) where section_id is not null;

-- version: membership, a chosen size and a title are what the Canvas shows.
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
  if (new.content, new.x, new.y, new.width, new.height, new.z, new.label, new.section_id, new.manual_size)
     is distinct from (old.content, old.x, old.y, old.width, old.height, old.z, old.label, old.section_id, old.manual_size) then
    new.version := old.version + 1;
    new.updated_at := now();
  else
    new.version := old.version;
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$function$;

-- A member's Section: a Section of the same Canvas. (Checked on insert and
-- whenever section_id changes; the target checks of 045 stay as they were.)
create or replace function public.check_workspace_canvas_item()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_type text;
  v_id uuid;
  v_project uuid;
begin
  if new.section_id is not null and (tg_op = 'INSERT' or new.section_id is distinct from old.section_id) then
    if new.item_type = 'section' then
      raise exception 'A Section cannot be inside a Section'
        using errcode = 'check_violation';
    end if;
    if not exists (select 1 from public.workspace_canvas_items s
                    where s.id = new.section_id and s.canvas_id = new.canvas_id and s.item_type = 'section') then
      raise exception 'That Section is not on this Canvas'
        using errcode = 'check_violation';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    return new;
  end if;
  if new.item_type in ('note', 'section') then
    return new;
  end if;
  v_type := new.item_type;
  v_id := case v_type
    when 'scene' then new.scene_id
    when 'chapter' then new.chapter_id
    when 'page' then new.document_id
    when 'entry' then new.entry_id
    when 'canvas' then new.target_canvas_id
  end;
  v_project := case v_type
    when 'scene' then (select m.project_id from public.scenes s join public.manuscripts m on m.id = s.manuscript_id where s.id = v_id)
    when 'chapter' then (select m.project_id from public.chapters c join public.manuscripts m on m.id = c.manuscript_id where c.id = v_id)
    when 'page' then (select d.project_id from public.workspace_documents d where d.id = v_id)
    when 'entry' then (select e.project_id from public.workspace_collection_entries e where e.id = v_id)
    when 'canvas' then (select c.project_id from public.workspace_canvases c where c.id = v_id)
  end;
  if v_project is distinct from new.project_id then
    raise exception 'A Canvas can only show items of its own Project'
      using errcode = 'check_violation';
  end if;
  if not public.workspace_object_active(v_type, v_id) then
    raise exception 'That item is in Trash'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

drop trigger workspace_canvas_items_check on public.workspace_canvas_items;
create trigger workspace_canvas_items_check before insert or update of section_id on public.workspace_canvas_items
  for each row execute function public.check_workspace_canvas_item();

-- ── Connections ─────────────────────────────────────────────────────────────

create table public.workspace_canvas_connections (
  id              uuid        default gen_random_uuid() not null,
  canvas_id       uuid        not null,
  project_id      uuid        not null,
  source_item_id  uuid        not null,
  target_item_id  uuid        not null,
  directed        boolean     default false not null,
  label           text,
  version         integer     default 1 not null,
  created_at      timestamptz default now() not null,
  updated_at      timestamptz default now() not null
);

alter table public.workspace_canvas_connections add constraint workspace_canvas_connections_pkey primary key (id);
alter table public.workspace_canvas_connections add constraint workspace_canvas_connections_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete cascade;
alter table public.workspace_canvas_connections add constraint workspace_canvas_connections_canvas_same_project_fkey
  foreign key (canvas_id, project_id) references public.workspace_canvases(id, project_id) on delete cascade;
alter table public.workspace_canvas_connections add constraint workspace_canvas_connections_source_item_id_fkey
  foreign key (source_item_id) references public.workspace_canvas_items(id) on delete cascade;
alter table public.workspace_canvas_connections add constraint workspace_canvas_connections_target_item_id_fkey
  foreign key (target_item_id) references public.workspace_canvas_items(id) on delete cascade;
alter table public.workspace_canvas_connections add constraint workspace_canvas_connections_not_self
  check (source_item_id <> target_item_id);
alter table public.workspace_canvas_connections add constraint workspace_canvas_connections_label_check
  check (label is null or (btrim(label) <> '' and char_length(label) <= 200));

create index workspace_canvas_connections_canvas_id_idx on public.workspace_canvas_connections using btree (canvas_id);
create index workspace_canvas_connections_project_id_idx on public.workspace_canvas_connections using btree (project_id);
create index workspace_canvas_connections_source_item_id_idx on public.workspace_canvas_connections using btree (source_item_id);
create index workspace_canvas_connections_target_item_id_idx on public.workspace_canvas_connections using btree (target_item_id);

create function public.stamp_workspace_canvas_connection()
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
  if (new.directed, new.label) is distinct from (old.directed, old.label) then
    new.version := old.version + 1;
    new.updated_at := now();
  else
    new.version := old.version;
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$function$;

-- A connection keeps its Canvas and its two ends for life.
create function public.freeze_workspace_canvas_connection()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if new.canvas_id is distinct from old.canvas_id
     or new.project_id is distinct from old.project_id
     or new.source_item_id is distinct from old.source_item_id
     or new.target_item_id is distinct from old.target_item_id then
    raise exception 'A Canvas connection keeps its canvas and its ends for life'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

-- Both ends are placements (not Sections) of this very Canvas.
create function public.check_workspace_canvas_connection()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if (select count(*) from public.workspace_canvas_items i
       where i.id in (new.source_item_id, new.target_item_id)
         and i.canvas_id = new.canvas_id and i.item_type <> 'section') <> 2 then
    raise exception 'A connection joins two placements of the same Canvas'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

revoke execute on function public.stamp_workspace_canvas_connection() from public, anon;
revoke execute on function public.freeze_workspace_canvas_connection() from public, anon;
revoke execute on function public.check_workspace_canvas_connection() from public, anon;

create trigger workspace_canvas_connections_forbid_project_reassignment before update of project_id on public.workspace_canvas_connections
  for each row execute function public.forbid_project_reassignment();
create trigger workspace_canvas_connections_stamp before insert or update on public.workspace_canvas_connections
  for each row execute function public.stamp_workspace_canvas_connection();
create trigger workspace_canvas_connections_freeze before update of canvas_id, project_id, source_item_id, target_item_id on public.workspace_canvas_connections
  for each row execute function public.freeze_workspace_canvas_connection();
create trigger workspace_canvas_connections_check before insert on public.workspace_canvas_connections
  for each row execute function public.check_workspace_canvas_connection();

alter table public.workspace_canvas_connections enable row level security;

create policy "workspace_canvas_connections: select own" on public.workspace_canvas_connections
  as permissive for select to authenticated
  using (exists (select 1 from public.workspace_canvases c
                   join public.projects p on p.id = c.project_id
                  where c.id = workspace_canvas_connections.canvas_id
                    and c.trashed_at is null
                    and p.user_id = (select auth.uid())));

revoke insert, update, delete on public.workspace_canvas_connections from anon, authenticated;

-- ── Writes: one batch per Canvas, items and connections together ────────────

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
          if v_type is null or v_type not in ('scene', 'chapter', 'page', 'entry', 'canvas', 'note', 'section') then
            raise exception 'Unknown item type';
          end if;
          v_target := case when v_type in ('note', 'section') then null else (v_change->>'target_id')::uuid end;
          if v_type not in ('note', 'section') and v_target is null then
            raise exception 'A % placement needs a target', v_type;
          end if;
          insert into public.workspace_canvas_items
            (id, canvas_id, project_id, item_type, scene_id, chapter_id, document_id, entry_id, target_canvas_id, label, content,
             x, y, width, height, z, section_id, manual_size)
          values
            (v_id, p_canvas_id, v_project_id, v_type,
             case when v_type = 'scene' then v_target end,
             case when v_type = 'chapter' then v_target end,
             case when v_type = 'page' then v_target end,
             case when v_type = 'entry' then v_target end,
             case when v_type = 'canvas' then v_target end,
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
             coalesce((v_change->>'manual_size')::boolean, false))
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
          update public.workspace_canvas_items i
             set x = case when v_change ? 'x' then (v_change->>'x')::double precision else i.x end,
                 y = case when v_change ? 'y' then (v_change->>'y')::double precision else i.y end,
                 width = case when v_change ? 'width' then (v_change->>'width')::double precision else i.width end,
                 height = case when v_change ? 'height' then (v_change->>'height')::double precision else i.height end,
                 z = case when v_change ? 'z' then (v_change->>'z')::integer else i.z end,
                 content = case when v_change ? 'content' then v_change->'content' else i.content end,
                 label = case when v_change ? 'label' then left(nullif(btrim(coalesce(v_change->>'label', '')), ''), 200) else i.label end,
                 section_id = case when v_change ? 'section_id' then (v_change->>'section_id')::uuid else i.section_id end,
                 manual_size = case when v_change ? 'manual_size' then coalesce((v_change->>'manual_size')::boolean, false) else i.manual_size end
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

-- ── Project Search: Canvas notes and Section titles ─────────────────────────

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
    select 'scene'::text as object_type, s.id as object_id, null::uuid as canvas_id, public.rich_text_plain(s.content) as body, 0 as kind_rank
      from public.scenes s
      join public.manuscripts m on m.id = s.manuscript_id
      join owned o on o.id = m.project_id
     where s.trashed_at is null
    union all
    select 'page', d.id, null, public.rich_text_plain(d.content), 1
      from public.workspace_documents d
      join owned o on o.id = d.project_id
     where d.trashed_at is null
    union all
    select 'entry', e.id, null, public.rich_text_plain(e.content), 2
      from public.workspace_collection_entries e
      join public.workspace_collections c on c.id = e.collection_id
      join owned o on o.id = e.project_id
     where e.trashed_at is null and c.trashed_at is null
    union all
    -- Canvas-local writing: a note's text, a Section's title. Never geometry or connections.
    select 'canvas_note', i.id, i.canvas_id, public.rich_text_plain(i.content), 3
      from public.workspace_canvas_items i
      join public.workspace_canvases cv on cv.id = i.canvas_id
      join owned o on o.id = i.project_id
     where i.item_type = 'note' and cv.trashed_at is null
    union all
    select 'canvas_section', i.id, i.canvas_id, i.label, 4
      from public.workspace_canvas_items i
      join public.workspace_canvases cv on cv.id = i.canvas_id
      join owned o on o.id = i.project_id
     where i.item_type = 'section' and i.label is not null and cv.trashed_at is null
  ),
  found as (
    select t.object_type, t.object_id, t.canvas_id, t.body, t.kind_rank, strpos(lower(t.body), q.q) as at, length(q.q) as len
      from texts t, q
     where length(q.q) >= 2
       and strpos(lower(t.body), q.q) > 0
  ),
  windowed as (
    select f.*, greatest(f.at - 60, 1) as w_from, least(f.at + f.len + 80, length(f.body) + 1) as w_to
      from found f
  )
  select coalesce(jsonb_agg(jsonb_build_object('type', r.object_type, 'id', r.object_id, 'snippet', r.snippet)
                              || case when r.canvas_id is null then '{}'::jsonb else jsonb_build_object('canvas_id', r.canvas_id) end
                            order by r.kind_rank, r.object_id), '[]'::jsonb)
    from (
      select w.object_type,
             w.object_id,
             w.canvas_id,
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

-- ── Backup: one more kind ───────────────────────────────────────────────────

create or replace function public.read_project_backup(
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
    when 'workspace_canvases' then v_table := 'workspace_canvases'; v_filter := 't.project_id = $1'; v_keys := array['id'];
    when 'workspace_canvas_items' then v_table := 'workspace_canvas_items'; v_filter := 't.project_id = $1'; v_keys := array['id'];
    when 'workspace_canvas_connections' then v_table := 'workspace_canvas_connections'; v_filter := 't.project_id = $1'; v_keys := array['id'];
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

insert into public.schema_migrations (version, name, applied_at, note)
values ('046', '046_canvas_organization.sql', now(), 'Canvas spatial organization (M22B): item type ''section'' + explicit membership (workspace_canvas_items.section_id, ON DELETE SET NULL, no nesting) + manual_size; workspace_canvas_connections (between two placements of one Canvas, directed, label; cascade with either end); write_canvas_items accepts kind ''connection'' and Section/membership fields in the same atomic batch; search_project_content also finds Canvas notes and Section titles; read_project_backup gains workspace_canvas_connections');
