-- ── Migration 047: Project attachments and image placements ─────────────────
--
-- Rune 2.0, Milestone 22C. A writer's reference material — a map, a face, a
-- photograph of a place — belongs beside the book's pieces on a Canvas. This
-- migration adds the smallest project-owned ATTACHMENT model that can hold
-- those images now and other Workspace media later, and the Canvas placement
-- that shows one. Nothing here reads, writes or moves a Scene, a Chapter, a
-- Page, an Entry or any of their rows; no word is ever counted from an image.
--
-- public.workspace_attachments — NEW. One row is one file the Project owns.
--   * Belongs directly to one Project (project_id; never moves —
--     forbid_project_reassignment). Identity is the row's id, stable for life.
--   * kind: 'image' (the only kind in V0; the check is widened, never
--     replaced, when a later milestone adds one). file_name (as uploaded,
--     ≤ 255), mime_type, byte_size, and for an image its pixel width and
--     height. storage_bucket / storage_key name the original bytes in the
--     platform's object storage (the server writes and reads them; the
--     database never holds bytes). display_key (with display_width /
--     display_height) names an optional browser-sized derivative of a large
--     image, made on upload; a card shows it when present. The original is
--     always kept: it is what a backup carries.
--   * RLS: writers read their own Project's rows. No INSERT, UPDATE or DELETE
--     for clients: the server registers an upload through
--     create_workspace_attachment after the bytes are stored, and removes
--     rows through delete_workspace_attachments after the bytes are gone.
--   * Lifecycle (the deliberate rule, enforced by the two functions below):
--     an attachment lives while anything references it — today, an image
--     placement on any Canvas, active or in Trash. One that nothing
--     references is kept for a grace period (the server asks for rows older
--     than a day), so an undo, a retried batch, a device draft replayed
--     after a reload or a Canvas restored from Trash can still find it;
--     after that the server's sweep deletes its bytes and then its row.
--     delete_workspace_attachments refuses a row that has gained a reference
--     meanwhile. Nothing is ever deleted by a trigger: bytes live outside
--     the database, so deletion is the server's, in that order (bytes, then
--     row), and never cascades from a placement.
--
-- public.workspace_canvas_items — CHANGED.
--   * item_type gains 'image': a placement that shows one attachment of the
--     Canvas's Project — attachment_id (NEW; composite FK to
--     workspace_attachments(id, project_id), ON DELETE CASCADE, so a row the
--     sweep removes takes its placements with it; the sweep only removes
--     unreferenced rows, so in practice none). An image placement is
--     Canvas-local presentation: deleting it deletes the placement only.
--     The same attachment may be placed many times (a duplicate placement
--     references the same bytes). label may hold the file name as a
--     fallback. Geometry, z, Section membership, manual_size and version as
--     for every other placement; the aspect ratio is the app's concern.
--   * freeze_workspace_canvas_item keeps attachment_id for life;
--     check_workspace_canvas_item passes an image (the composite FK holds it
--     to the Project).
--
-- public.write_canvas_items — REPLACED (same signature and result shape):
--   a create accepts item_type 'image' with target_id = the attachment.
--   Everything else exactly as 046.
-- public.read_project_backup — REPLACED: kind 'workspace_attachments'.
--
-- Object storage: the bucket named by storage_bucket is created by the
-- server when first needed (private; the server alone reads and writes it
-- with the service role, after checking the row under the writer's own
-- session). No storage policy is defined here: nothing in the browser ever
-- addresses the bucket directly.
--
-- Apply BEFORE the app deploy that offers images: the previous app keeps
-- working (it never sends an image; its reads ignore the new column and the
-- new type — a Canvas holding an image shows it as nothing, since the old
-- card switch has no branch for it). Without this migration the new app's
-- upload is refused with nothing stored.
-- Rollback (drops every attachment row and image placement; bytes in the
-- bucket must be removed separately):
--   drop function public.read_project_backup(uuid, text, text, integer);  -- then re-create 046's
--   drop function public.write_canvas_items(uuid, jsonb);                 -- then re-create 046's
--   drop function public.delete_workspace_attachments(uuid, uuid[]);
--   drop function public.list_unreferenced_attachments(uuid, interval);
--   drop function public.create_workspace_attachment(uuid, uuid, text, text, text, integer, integer, integer, text, text, text, integer, integer);
--   delete from public.workspace_canvas_items where item_type = 'image';
--   alter table public.workspace_canvas_items drop column attachment_id;
--   -- then re-create 046's item_type / target checks, freeze and check triggers
--   drop table public.workspace_attachments;
--   delete from public.schema_migrations where version = '047';
-- Apply as ONE script, following tools/db-audit/STAGING.md.

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 047 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '047') then
    raise exception 'Migration 047 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '046') then
    raise exception 'Migration 047 requires migration 046 (Canvas spatial organization). Nothing was changed.';
  end if;
  if (select tableowner from pg_tables where schemaname = 'public' and tablename = 'workspace_canvas_items') <> current_user then
    raise exception 'Migration 047 must be applied by the owner of public.workspace_canvas_items (%, not %). Nothing was changed.',
      (select tableowner from pg_tables where schemaname = 'public' and tablename = 'workspace_canvas_items'), current_user;
  end if;
end $$;

-- ── Attachments ─────────────────────────────────────────────────────────────

create table public.workspace_attachments (
  id              uuid        default gen_random_uuid() not null,
  project_id      uuid        not null,
  kind            text        default 'image' not null,
  file_name       text        not null,
  mime_type       text        not null,
  byte_size       integer     not null,
  width           integer,
  height          integer,
  storage_bucket  text        not null,
  storage_key     text        not null,
  display_key     text,
  display_width   integer,
  display_height  integer,
  created_at      timestamptz default now() not null
);

alter table public.workspace_attachments add constraint workspace_attachments_pkey primary key (id);
alter table public.workspace_attachments add constraint workspace_attachments_id_project_id_key unique (id, project_id);
alter table public.workspace_attachments add constraint workspace_attachments_storage_key_key unique (storage_bucket, storage_key);
alter table public.workspace_attachments add constraint workspace_attachments_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete cascade;
alter table public.workspace_attachments add constraint workspace_attachments_kind_check
  check (kind in ('image'));
alter table public.workspace_attachments add constraint workspace_attachments_file_name_check
  check (btrim(file_name) <> '' and char_length(file_name) <= 255);
alter table public.workspace_attachments add constraint workspace_attachments_mime_type_check
  check (mime_type ~ '^[a-z0-9.+-]+/[a-z0-9.+-]+$');
alter table public.workspace_attachments add constraint workspace_attachments_size_check
  check (byte_size > 0
     and (width is null or width > 0) and (height is null or height > 0)
     and (display_width is null or display_width > 0) and (display_height is null or display_height > 0)
     and ((display_key is null) = (display_width is null)) and ((display_key is null) = (display_height is null)));
alter table public.workspace_attachments add constraint workspace_attachments_storage_check
  check (btrim(storage_bucket) <> '' and btrim(storage_key) <> '' and (display_key is null or btrim(display_key) <> ''));
-- An image knows its size.
alter table public.workspace_attachments add constraint workspace_attachments_image_dimensions_check
  check (kind <> 'image' or (width is not null and height is not null));

create index workspace_attachments_project_id_idx on public.workspace_attachments using btree (project_id);

create trigger workspace_attachments_forbid_project_reassignment before update of project_id on public.workspace_attachments
  for each row execute function public.forbid_project_reassignment();

alter table public.workspace_attachments enable row level security;

create policy "workspace_attachments: select own" on public.workspace_attachments
  as permissive for select to authenticated
  using (exists (select 1 from public.projects p
                  where p.id = workspace_attachments.project_id and p.user_id = (select auth.uid())));

revoke insert, update, delete on public.workspace_attachments from anon, authenticated;

-- Registers stored bytes as an attachment of the writer's own Project. The
-- id is the server's (made before the upload, so the storage key can carry
-- it); a retried registration of the same id is 'ok' with the row as it is.
create function public.create_workspace_attachment(
  p_id uuid,
  p_project_id uuid,
  p_kind text,
  p_file_name text,
  p_mime_type text,
  p_byte_size integer,
  p_width integer,
  p_height integer,
  p_storage_bucket text,
  p_storage_key text,
  p_display_key text default null,
  p_display_width integer default null,
  p_display_height integer default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_row public.workspace_attachments%rowtype;
begin
  -- SECURITY DEFINER: ownership is checked here, not by RLS.
  if not exists (select 1 from public.projects p where p.id = p_project_id and p.user_id = auth.uid()) then
    return jsonb_build_object('status', 'error', 'error', 'Project not found');
  end if;
  if p_id is null then
    return jsonb_build_object('status', 'error', 'error', 'An attachment needs an id');
  end if;
  select a.* into v_row from public.workspace_attachments a where a.id = p_id;
  if found then
    if v_row.project_id <> p_project_id then
      return jsonb_build_object('status', 'error', 'error', 'That id belongs to another project');
    end if;
    return jsonb_build_object('status', 'ok', 'attachment', to_jsonb(v_row));
  end if;
  insert into public.workspace_attachments
    (id, project_id, kind, file_name, mime_type, byte_size, width, height, storage_bucket, storage_key, display_key, display_width, display_height)
  values
    (p_id, p_project_id, coalesce(p_kind, 'image'), left(btrim(coalesce(p_file_name, '')), 255), lower(btrim(coalesce(p_mime_type, ''))),
     p_byte_size, p_width, p_height, p_storage_bucket, p_storage_key, p_display_key, p_display_width, p_display_height)
  returning * into v_row;
  return jsonb_build_object('status', 'ok', 'attachment', to_jsonb(v_row));
exception
  when others then
    return jsonb_build_object('status', 'error', 'error', sqlerrm);
end;
$function$;

-- Attachments of the writer's Project that nothing references (no placement
-- on any Canvas, active or in Trash) and that are older than p_older_than:
-- what the server's sweep may delete, bytes first. Rows only, never bytes.
create function public.list_unreferenced_attachments(p_project_id uuid, p_older_than interval default interval '24 hours')
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
  return jsonb_build_object('status', 'ok', 'attachments', coalesce((
    select jsonb_agg(to_jsonb(a) order by a.created_at, a.id)
      from public.workspace_attachments a
     where a.project_id = p_project_id
       and a.created_at < now() - coalesce(p_older_than, interval '24 hours')
       and not exists (select 1 from public.workspace_canvas_items i where i.attachment_id = a.id)
  ), '[]'::jsonb));
end;
$function$;

-- Removes attachment rows whose bytes the server has deleted — only those of
-- the writer's Project that are STILL unreferenced (a reference gained
-- meanwhile keeps the row; the server then has a row without bytes, which the
-- card shows as unavailable — the grace period makes that a rarity). Returns
-- the ids actually deleted.
create function public.delete_workspace_attachments(p_project_id uuid, p_ids uuid[])
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_deleted uuid[];
begin
  if not exists (select 1 from public.projects p where p.id = p_project_id and p.user_id = auth.uid()) then
    return jsonb_build_object('status', 'error', 'error', 'Project not found');
  end if;
  with gone as (
    delete from public.workspace_attachments a
     where a.project_id = p_project_id
       and a.id = any(coalesce(p_ids, array[]::uuid[]))
       and not exists (select 1 from public.workspace_canvas_items i where i.attachment_id = a.id)
    returning a.id)
  select coalesce(array_agg(id), array[]::uuid[]) into v_deleted from gone;
  return jsonb_build_object('status', 'ok', 'deleted', to_jsonb(v_deleted));
end;
$function$;

revoke execute on function public.create_workspace_attachment(uuid, uuid, text, text, text, integer, integer, integer, text, text, text, integer, integer) from public, anon;
revoke execute on function public.list_unreferenced_attachments(uuid, interval) from public, anon;
revoke execute on function public.delete_workspace_attachments(uuid, uuid[]) from public, anon;

-- ── Items: the image placement ──────────────────────────────────────────────

alter table public.workspace_canvas_items add column attachment_id uuid;

alter table public.workspace_canvas_items add constraint workspace_canvas_items_attachment_same_project_fkey
  foreign key (attachment_id, project_id) references public.workspace_attachments(id, project_id) on delete cascade;

alter table public.workspace_canvas_items drop constraint workspace_canvas_items_item_type_check;
alter table public.workspace_canvas_items add constraint workspace_canvas_items_item_type_check
  check (item_type in ('scene', 'chapter', 'page', 'entry', 'canvas', 'note', 'section', 'image'));

alter table public.workspace_canvas_items drop constraint workspace_canvas_items_target_matches_type;
alter table public.workspace_canvas_items add constraint workspace_canvas_items_target_matches_type
  check (
    (item_type = 'scene'   and scene_id is not null and chapter_id is null and document_id is null and entry_id is null and target_canvas_id is null and attachment_id is null and content is null)
 or (item_type = 'chapter' and chapter_id is not null and scene_id is null and document_id is null and entry_id is null and target_canvas_id is null and attachment_id is null and content is null)
 or (item_type = 'page'    and document_id is not null and scene_id is null and chapter_id is null and entry_id is null and target_canvas_id is null and attachment_id is null and content is null)
 or (item_type = 'entry'   and entry_id is not null and scene_id is null and chapter_id is null and document_id is null and target_canvas_id is null and attachment_id is null and content is null)
 or (item_type = 'canvas'  and target_canvas_id is not null and scene_id is null and chapter_id is null and document_id is null and entry_id is null and attachment_id is null and content is null)
 or (item_type = 'image'   and attachment_id is not null and scene_id is null and chapter_id is null and document_id is null and entry_id is null and target_canvas_id is null and content is null)
 or (item_type = 'note'    and content is not null and jsonb_typeof(content) = 'object'
                           and scene_id is null and chapter_id is null and document_id is null and entry_id is null and target_canvas_id is null and attachment_id is null and label is null)
 or (item_type = 'section' and scene_id is null and chapter_id is null and document_id is null and entry_id is null and target_canvas_id is null and attachment_id is null and content is null));

create index workspace_canvas_items_attachment_id_idx on public.workspace_canvas_items using btree (attachment_id) where attachment_id is not null;

create or replace function public.freeze_workspace_canvas_item()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if new.canvas_id is distinct from old.canvas_id
     or new.project_id is distinct from old.project_id
     or new.item_type is distinct from old.item_type
     or new.scene_id is distinct from old.scene_id
     or new.chapter_id is distinct from old.chapter_id
     or new.document_id is distinct from old.document_id
     or new.entry_id is distinct from old.entry_id
     or new.target_canvas_id is distinct from old.target_canvas_id
     or new.attachment_id is distinct from old.attachment_id then
    raise exception 'A Canvas placement keeps its canvas, type and target for life'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

drop trigger workspace_canvas_items_freeze on public.workspace_canvas_items;
create trigger workspace_canvas_items_freeze before update of canvas_id, project_id, item_type, scene_id, chapter_id, document_id, entry_id, target_canvas_id, attachment_id on public.workspace_canvas_items
  for each row execute function public.freeze_workspace_canvas_item();

-- An image's attachment is held to the Project by its composite key; the
-- live-target checks of 046 stay exactly as they were.
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
  if new.item_type in ('note', 'section', 'image') then
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

-- ── Writes: an image is created like any placement ──────────────────────────

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
             x, y, width, height, z, section_id, manual_size)
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
    when 'workspace_attachments' then v_table := 'workspace_attachments'; v_filter := 't.project_id = $1'; v_keys := array['id'];
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
values ('047', '047_workspace_attachments.sql', now(), 'Project attachments (M22C): workspace_attachments (project-owned files — images in V0 — with metadata and storage keys; owner reads, server registers via create_workspace_attachment and sweeps unreferenced rows via list_unreferenced_attachments / delete_workspace_attachments after a grace period); workspace_canvas_items gains item_type ''image'' + attachment_id (composite FK, ON DELETE CASCADE); write_canvas_items creates images; read_project_backup gains workspace_attachments');
