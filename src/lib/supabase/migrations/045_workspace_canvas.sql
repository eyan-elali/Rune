-- ── Migration 045: Workspace Canvas (foundation) ─────────────────────────────
--
-- Rune 2.0, Milestone 22A. A Canvas is a spatial thinking surface: the writer
-- arranges the real pieces of their book — Scenes, Chapters, Pages, Entries,
-- other Canvases — and Canvas-local text notes on an unbounded plane, without
-- changing the book itself. Spatial placement never changes manuscript order,
-- Chapter membership, Workspace hierarchy, properties, relationships or
-- prose: nothing here reads, writes or moves a Scene, a Chapter, a Page, an
-- Entry or any of their rows.
--
-- public.workspace_canvases — NEW. One row is one Canvas.
--   * A Workspace object like a Page, Folder or Collection (architecture §9,
--     §14): belongs directly to one Project (project_id), never moves to
--     another (forbid_project_reassignment), and has exactly one canonical
--     place in the Workspace tree — a workspace_nodes row with target_type
--     'canvas' (canvas_id), at the top level or in a Folder, made by
--     place_new_workspace_object when the Canvas is inserted. Writers may have
--     any number of Canvases per Project; none is special.
--   * title is optional (null = untitled; never blank), at most 200 characters.
--   * Trash (030's model): trashed_at, trashed_from_folder_id,
--     trashed_from_position, exactly as a Page's. A trashed Canvas has no node
--     and is hidden by RLS; its items stay, hidden with it.
--   * RLS: writers read and rename (UPDATE of title) their own active Canvases.
--     No INSERT or DELETE for clients: create_workspace_canvas and the Trash
--     functions do.
--
-- public.workspace_canvas_items — NEW. One row is one PLACEMENT on one Canvas.
--   A placement is not the canonical object: it is where the Canvas shows
--   something, and what. item_type is one of
--     'scene'   → scene_id          → scenes(id)
--     'chapter' → chapter_id        → chapters(id)
--     'page'    → document_id       → workspace_documents(id, project_id)
--     'entry'   → entry_id          → workspace_collection_entries(id)
--     'canvas'  → target_canvas_id  → workspace_canvases(id, project_id)   (a link to another Canvas)
--     'note'    → no target; content (TipTap JSON, paragraphs) is the note itself
--   (workspace_canvas_items_target_matches_type: exactly the column of its
--   type is set, and content only for a note.) A later type — an image (M22C)
--   — adds a column the same way.
--   * A live placement is a LIVE REFERENCE: nothing of the target is copied
--     but `label`, the title it had when placed — shown only if the target is
--     ever unreachable (in Trash), never otherwise (architecture §28: the
--     placement survives, says what it was, and resolves again on restore).
--   * The same object may be placed on many Canvases, and more than once on
--     one Canvas: no uniqueness is enforced here (the app warns quietly).
--   * Every foreign key to a target is ON DELETE CASCADE: a target's PERMANENT
--     deletion (only ever from Trash) removes its placements with it — the
--     Canvas never resurrects an object, and a placement never points at
--     nothing. Trash alone deletes no row, so a trashed target keeps its
--     placements; RLS hides the target meanwhile, and the app shows the
--     placement as unavailable. The target is held to the placement's Project
--     and must be active when placed (check_workspace_canvas_item); a
--     placement keeps its Canvas, type and target for life
--     (freeze_workspace_canvas_item).
--   * Geometry: x, y (world coordinates, unbounded; finite and within ±10⁹),
--     width, height (> 0, ≤ 10⁵), z (stacking order). Canvas-local only.
--   * version: bumped by the database whenever content, geometry, z or label
--     changes (stamp_workspace_canvas_item), so writes are conditional
--     (write_canvas_items) and a stale window never overwrites a newer
--     arrangement or a newer note silently.
--   * RLS: writers read the items of their own ACTIVE Canvases. No INSERT,
--     UPDATE or DELETE for clients (no privilege, no policy): every write is
--     write_canvas_items.
--   * No word is ever counted from a note: nothing here touches scenes,
--     writing_sessions, projects.word_count or any total.
--
-- public.workspace_nodes — CHANGED: a fourth target type, 'canvas' → canvas_id
--   (unique: one canonical place; ON DELETE CASCADE with the Canvas; the node
--   goes with it). Folders stay the only parents (check_workspace_node_parent
--   is unchanged). freeze_workspace_node_target and place_new_workspace_object
--   learn the new column. No existing node changes.
--
-- Functions — NEW, SECURITY DEFINER, ownership checked explicitly against
-- projects.user_id = auth.uid(), each returning { status: 'ok', … } or
-- { status: 'error', error }:
--   * create_workspace_canvas(p_project_id, p_parent_node_id, p_title)
--       → { canvas, node_id }   (appended at the end of the parent Folder, under
--       lock_project_workspace(), as a Collection is)
--   * write_canvas_items(p_canvas_id, p_changes jsonb) → { results: [...] }
--       One atomic batch of changes to ONE Canvas's items — the shape every
--       Canvas write takes (a move of twenty cards is one call):
--         { op: 'create', id, item_type, target_id?, label?, content?, x, y, width, height, z }
--         { op: 'update', id, expected_version, x?, y?, width?, height?, z?, content? }
--         { op: 'delete', id }
--       Each change is answered in order: { id, status: 'ok' | 'conflict' |
--       'missing' | 'error', version?, item?, error? }. 'conflict' (an update
--       whose expected_version is not the row's) writes nothing for that
--       change and returns the row as it is; 'missing' is an update of a row
--       that is gone. A create with an id that already exists on this Canvas
--       is 'ok' with the row's version and writes nothing; a delete of a row
--       that is gone is 'ok': a retried batch after a lost reply never
--       duplicates or fails. Invalid input ('error') fails only its own
--       change. Ownership, an unknown Canvas or one in Trash fail the whole
--       call with no write. Only the Canvas's own rows are ever touched.
-- Redefined (same signatures; every other type exactly as 037): the Trash
-- functions accept 'canvas' — trash_workspace_object, restore_workspace_object,
-- delete_trashed_workspace_object, workspace_trash_state, list_workspace_trash
-- (a Canvas is listed with how many items it holds, `items`; every other
-- branch gets items null), owned_workspace_object_project,
-- workspace_object_active. A Canvas is trashed, restored and deleted exactly
-- as a Page (its node goes, its place is remembered, it comes back there or at
-- the top); its items follow it, hidden, and permanent deletion removes them
-- with it — and removes every placement of that Canvas on other Canvases.
-- read_project_backup (041) accepts two more kinds: 'workspace_canvases' and
-- 'workspace_canvas_items'.
--
-- Nothing here touches a manuscript table, function, trigger or policy, any
-- existing Workspace row, or any write path of a Page, Entry or Scene.
--
-- For the Rune 2.0 database only: it requires 044. Apply BEFORE the app deploy
-- that offers Canvases (the new loader reads workspace_canvases; without this
-- migration it offers none and the Workspace works as before). The previous
-- app keeps working unchanged: it reads workspace_nodes with select * (an
-- extra column is ignored) and never sees a 'canvas' node until one exists.
-- Rollback (drops every Canvas, every placement and every note):
--   drop function public.write_canvas_items(uuid, jsonb);
--   drop function public.create_workspace_canvas(uuid, uuid, text);
--   restore the 041 definition of read_project_backup, and the 037 definitions
--     of trash_workspace_object, restore_workspace_object,
--     delete_trashed_workspace_object, workspace_trash_state, list_workspace_trash,
--     owned_workspace_object_project, workspace_object_active (from schema.sql at 044);
--   drop trigger workspace_canvases_place_new on public.workspace_canvases;
--   delete from public.workspace_nodes where target_type = 'canvas';
--   alter table public.workspace_nodes drop column canvas_id;  (drops its key and FK)
--   restore 025's workspace_nodes_target_type_check, workspace_nodes_target_matches_type,
--     freeze_workspace_node_target and place_new_workspace_object (from schema.sql at 044);
--   drop table public.workspace_canvas_items;
--   drop table public.workspace_canvases;
--   drop function public.check_workspace_canvas_item(), public.freeze_workspace_canvas_item(),
--     public.stamp_workspace_canvas_item();
--   delete from public.schema_migrations where version = '045';
-- Apply as ONE script (psql -1, or the SQL editor).

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 045 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '045') then
    raise exception 'Migration 045 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '044') then
    raise exception 'Migration 045 requires migration 044 (Scene View bases). Nothing was changed.';
  end if;
  -- As in 024–030: the SECURITY DEFINER functions run as their owner, which
  -- must own the Workspace tables or they would be subject to RLS.
  if (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.workspace_nodes'::regclass) <> current_user then
    raise exception 'Migration 045 must be applied by the owner of public.workspace_nodes (%, not %). Nothing was changed.',
      (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.workspace_nodes'::regclass), current_user;
  end if;
end
$$;

-- ── Canvases ────────────────────────────────────────────────────────────────

create table public.workspace_canvases (
  id                     uuid        default gen_random_uuid() not null,
  project_id             uuid        not null,
  title                  text,                                              -- null = untitled
  trashed_at             timestamptz,
  trashed_from_folder_id uuid,
  trashed_from_position  integer,
  created_at             timestamptz default now() not null,
  updated_at             timestamptz default now() not null
);

alter table public.workspace_canvases add constraint workspace_canvases_pkey primary key (id);
alter table public.workspace_canvases add constraint workspace_canvases_id_project_id_key unique (id, project_id);
alter table public.workspace_canvases add constraint workspace_canvases_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete cascade;
alter table public.workspace_canvases add constraint workspace_canvases_title_check
  check (title is null or (btrim(title) <> '' and char_length(title) <= 200));
alter table public.workspace_canvases add constraint workspace_canvases_trash_check
  check ((trashed_at is not null or (trashed_from_folder_id is null and trashed_from_position is null))
     and (trashed_from_position is null or trashed_from_position > 0));

create index workspace_canvases_project_id_idx on public.workspace_canvases using btree (project_id);
create index workspace_canvases_trashed_idx on public.workspace_canvases using btree (project_id, trashed_at) where trashed_at is not null;

-- Timestamps are the database's; a rename moves updated_at (the Folder's
-- stamp, 024: exactly this rule for a titled, content-less row).
create trigger workspace_canvases_forbid_project_reassignment before update of project_id on public.workspace_canvases
  for each row execute function public.forbid_project_reassignment();
create trigger workspace_canvases_stamp before insert or update on public.workspace_canvases
  for each row execute function public.stamp_workspace_folder();

alter table public.workspace_canvases enable row level security;

create policy "workspace_canvases: select own" on public.workspace_canvases
  as permissive for select to authenticated
  using (workspace_canvases.trashed_at is null
         and exists (select 1 from public.projects p
                     where p.id = workspace_canvases.project_id and p.user_id = (select auth.uid())));
create policy "workspace_canvases: update own" on public.workspace_canvases
  as permissive for update to authenticated
  using (workspace_canvases.trashed_at is null
         and exists (select 1 from public.projects p
                     where p.id = workspace_canvases.project_id and p.user_id = (select auth.uid())))
  with check (workspace_canvases.trashed_at is null
              and exists (select 1 from public.projects p
                          where p.id = workspace_canvases.project_id and p.user_id = (select auth.uid())));

revoke insert, delete on public.workspace_canvases from anon, authenticated;
revoke update on public.workspace_canvases from anon;

-- ── Nodes: the Canvas target ────────────────────────────────────────────────

alter table public.workspace_nodes add column canvas_id uuid;                 -- target_type 'canvas'

alter table public.workspace_nodes drop constraint workspace_nodes_target_type_check;
alter table public.workspace_nodes add constraint workspace_nodes_target_type_check
  check (target_type in ('page', 'folder', 'collection', 'canvas'));
alter table public.workspace_nodes drop constraint workspace_nodes_target_matches_type;
alter table public.workspace_nodes add constraint workspace_nodes_target_matches_type
  check ((target_type = 'page' and document_id is not null and folder_id is null and collection_id is null and canvas_id is null)
      or (target_type = 'folder' and folder_id is not null and document_id is null and collection_id is null and canvas_id is null)
      or (target_type = 'collection' and collection_id is not null and document_id is null and folder_id is null and canvas_id is null)
      or (target_type = 'canvas' and canvas_id is not null and document_id is null and folder_id is null and collection_id is null));
alter table public.workspace_nodes add constraint workspace_nodes_canvas_id_key unique (canvas_id);
alter table public.workspace_nodes add constraint workspace_nodes_canvas_same_project_fkey
  foreign key (canvas_id, project_id) references public.workspace_canvases(id, project_id) on delete cascade;

create or replace function public.freeze_workspace_node_target()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if new.target_type is distinct from old.target_type
     or new.document_id is distinct from old.document_id
     or new.folder_id is distinct from old.folder_id
     or new.collection_id is distinct from old.collection_id
     or new.canvas_id is distinct from old.canvas_id then
    raise exception 'A Workspace node keeps its object for life'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

drop trigger workspace_nodes_freeze_target on public.workspace_nodes;
create trigger workspace_nodes_freeze_target before update of target_type, document_id, folder_id, collection_id, canvas_id on public.workspace_nodes
  for each row execute function public.freeze_workspace_node_target();

create or replace function public.place_new_workspace_object()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_type text := case tg_table_name
                   when 'workspace_documents' then 'page'
                   when 'workspace_folders' then 'folder'
                   when 'workspace_collections' then 'collection'
                   when 'workspace_canvases' then 'canvas'
                 end;
begin
  if v_type is null then
    raise exception 'place_new_workspace_object: % is not a Workspace object table', tg_table_name;
  end if;
  perform public.lock_project_workspace(new.project_id);
  insert into public.workspace_nodes (project_id, target_type, document_id, folder_id, collection_id, canvas_id, parent_node_id, position)
  values (new.project_id, v_type,
          case when v_type = 'page' then new.id end,
          case when v_type = 'folder' then new.id end,
          case when v_type = 'collection' then new.id end,
          case when v_type = 'canvas' then new.id end,
          null,
          (select coalesce(max(n.position), 0) + 1 from public.workspace_nodes n
            where n.project_id = new.project_id and n.parent_node_id is null));
  return null;
end;
$function$;

create trigger workspace_canvases_place_new after insert on public.workspace_canvases
  for each row execute function public.place_new_workspace_object();

-- ── Placements ──────────────────────────────────────────────────────────────

create table public.workspace_canvas_items (
  id                uuid             default gen_random_uuid() not null,
  canvas_id         uuid             not null,
  project_id        uuid             not null,                               -- the Canvas's Project
  item_type         text             not null,
  scene_id          uuid,                                                    -- 'scene'
  chapter_id        uuid,                                                    -- 'chapter'
  document_id       uuid,                                                    -- 'page'
  entry_id          uuid,                                                    -- 'entry'
  target_canvas_id  uuid,                                                    -- 'canvas'
  label             text,                                                    -- a live target's title when placed (fallback only)
  content           jsonb,                                                   -- 'note': TipTap JSON
  x                 double precision default 0 not null,
  y                 double precision default 0 not null,
  width             double precision not null,
  height            double precision not null,
  z                 integer          default 0 not null,
  version           integer          default 1 not null,
  created_at        timestamptz      default now() not null,
  updated_at        timestamptz      default now() not null
);

alter table public.workspace_canvas_items add constraint workspace_canvas_items_pkey primary key (id);
alter table public.workspace_canvas_items add constraint workspace_canvas_items_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete cascade;
alter table public.workspace_canvas_items add constraint workspace_canvas_items_canvas_same_project_fkey
  foreign key (canvas_id, project_id) references public.workspace_canvases(id, project_id) on delete cascade;
alter table public.workspace_canvas_items add constraint workspace_canvas_items_scene_id_fkey
  foreign key (scene_id) references public.scenes(id) on delete cascade;
alter table public.workspace_canvas_items add constraint workspace_canvas_items_chapter_id_fkey
  foreign key (chapter_id) references public.chapters(id) on delete cascade;
alter table public.workspace_canvas_items add constraint workspace_canvas_items_document_same_project_fkey
  foreign key (document_id, project_id) references public.workspace_documents(id, project_id) on delete cascade;
alter table public.workspace_canvas_items add constraint workspace_canvas_items_entry_id_fkey
  foreign key (entry_id) references public.workspace_collection_entries(id) on delete cascade;
alter table public.workspace_canvas_items add constraint workspace_canvas_items_target_canvas_same_project_fkey
  foreign key (target_canvas_id, project_id) references public.workspace_canvases(id, project_id) on delete cascade;
alter table public.workspace_canvas_items add constraint workspace_canvas_items_item_type_check
  check (item_type in ('scene', 'chapter', 'page', 'entry', 'canvas', 'note'));
alter table public.workspace_canvas_items add constraint workspace_canvas_items_target_matches_type
  check (
    (item_type = 'scene'   and scene_id is not null and chapter_id is null and document_id is null and entry_id is null and target_canvas_id is null and content is null)
 or (item_type = 'chapter' and chapter_id is not null and scene_id is null and document_id is null and entry_id is null and target_canvas_id is null and content is null)
 or (item_type = 'page'    and document_id is not null and scene_id is null and chapter_id is null and entry_id is null and target_canvas_id is null and content is null)
 or (item_type = 'entry'   and entry_id is not null and scene_id is null and chapter_id is null and document_id is null and target_canvas_id is null and content is null)
 or (item_type = 'canvas'  and target_canvas_id is not null and scene_id is null and chapter_id is null and document_id is null and entry_id is null and content is null)
 or (item_type = 'note'    and content is not null and jsonb_typeof(content) = 'object'
                           and scene_id is null and chapter_id is null and document_id is null and entry_id is null and target_canvas_id is null and label is null));
-- A Canvas never links to itself.
alter table public.workspace_canvas_items add constraint workspace_canvas_items_not_self_link
  check (target_canvas_id is distinct from canvas_id);
alter table public.workspace_canvas_items add constraint workspace_canvas_items_label_check
  check (label is null or char_length(label) <= 200);
-- Finite, bounded geometry (NaN fails every comparison).
alter table public.workspace_canvas_items add constraint workspace_canvas_items_geometry_check
  check (x between -1e9 and 1e9 and y between -1e9 and 1e9
     and width > 0 and width <= 1e5 and height > 0 and height <= 1e5
     and z between -1e8 and 1e8);

create index workspace_canvas_items_canvas_id_idx on public.workspace_canvas_items using btree (canvas_id);
create index workspace_canvas_items_project_id_idx on public.workspace_canvas_items using btree (project_id);
create index workspace_canvas_items_scene_id_idx on public.workspace_canvas_items using btree (scene_id) where scene_id is not null;
create index workspace_canvas_items_chapter_id_idx on public.workspace_canvas_items using btree (chapter_id) where chapter_id is not null;
create index workspace_canvas_items_document_id_idx on public.workspace_canvas_items using btree (document_id) where document_id is not null;
create index workspace_canvas_items_entry_id_idx on public.workspace_canvas_items using btree (entry_id) where entry_id is not null;
create index workspace_canvas_items_target_canvas_id_idx on public.workspace_canvas_items using btree (target_canvas_id) where target_canvas_id is not null;

-- The database owns version and timestamps: a new placement starts at 1; an
-- update bumps the version whenever what the Canvas shows changes.
create function public.stamp_workspace_canvas_item()
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
  if (new.content, new.x, new.y, new.width, new.height, new.z, new.label)
     is distinct from (old.content, old.x, old.y, old.width, old.height, old.z, old.label) then
    new.version := old.version + 1;
    new.updated_at := now();
  else
    new.version := old.version;
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$function$;

-- A placement keeps its Canvas, its type and its target for life.
create function public.freeze_workspace_canvas_item()
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
     or new.target_canvas_id is distinct from old.target_canvas_id then
    raise exception 'A Canvas placement keeps its canvas, type and target for life'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

-- The target of a new placement is of the placement's Project and active (not
-- in Trash). The Page and Canvas targets are already held to the Project by
-- their composite foreign keys; a Scene's and a Chapter's Project is its
-- Manuscript's, an Entry's is on its row.
create function public.check_workspace_canvas_item()
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
  if new.item_type = 'note' then
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

revoke execute on function public.stamp_workspace_canvas_item() from public, anon;
revoke execute on function public.freeze_workspace_canvas_item() from public, anon;
revoke execute on function public.check_workspace_canvas_item() from public, anon;

create trigger workspace_canvas_items_forbid_project_reassignment before update of project_id on public.workspace_canvas_items
  for each row execute function public.forbid_project_reassignment();
create trigger workspace_canvas_items_stamp before insert or update on public.workspace_canvas_items
  for each row execute function public.stamp_workspace_canvas_item();
create trigger workspace_canvas_items_freeze before update of canvas_id, project_id, item_type, scene_id, chapter_id, document_id, entry_id, target_canvas_id on public.workspace_canvas_items
  for each row execute function public.freeze_workspace_canvas_item();
create trigger workspace_canvas_items_check before insert on public.workspace_canvas_items
  for each row execute function public.check_workspace_canvas_item();

alter table public.workspace_canvas_items enable row level security;

-- The items of the writer's own ACTIVE Canvases. (A trashed target's
-- placement is still listed: the app shows it as unavailable.)
create policy "workspace_canvas_items: select own" on public.workspace_canvas_items
  as permissive for select to authenticated
  using (exists (select 1 from public.workspace_canvases c
                   join public.projects p on p.id = c.project_id
                  where c.id = workspace_canvas_items.canvas_id
                    and c.trashed_at is null
                    and p.user_id = (select auth.uid())));

revoke insert, update, delete on public.workspace_canvas_items from anon, authenticated;

-- ── Trash: a Canvas is a tree object, exactly as a Page ─────────────────────

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
       when 'canvas' then (select c.project_id from public.workspace_canvases c where c.id = p_id)
       when 'scene' then (select m.project_id from public.scenes s join public.manuscripts m on m.id = s.manuscript_id where s.id = p_id)
       when 'chapter' then (select m.project_id from public.chapters c join public.manuscripts m on m.id = c.manuscript_id where c.id = p_id)
     end;
$function$;

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
    when 'canvas' then exists (select 1 from public.workspace_canvases c where c.id = p_id and c.trashed_at is null)
    when 'scene' then exists (select 1 from public.scenes s where s.id = p_id and s.trashed_at is null)
    when 'chapter' then exists (select 1 from public.chapters c where c.id = p_id and c.trashed_at is null)
    else false
  end;
$function$;

create or replace function public.workspace_trash_state(p_type text, p_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
begin
  if p_type is null or p_type not in ('page', 'folder', 'collection', 'entry', 'canvas', 'scene', 'chapter')
     or public.owned_workspace_object_project(p_type, p_id) is null then
    return jsonb_build_object('status', 'ok', 'state', 'missing');
  end if;
  return jsonb_build_object('status', 'ok', 'state',
    case when public.workspace_object_active(p_type, p_id) then 'active' else 'trashed' end);
end;
$function$;

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
  -- A Chapter (037) goes with its Scenes, as one piece of the manuscript.
  if p_type = 'chapter' then
    return public.trash_manuscript_chapter(p_id);
  end if;
  if p_type is null or p_type not in ('page', 'folder', 'collection', 'entry', 'canvas') then
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
   where case p_type when 'page' then n.document_id when 'folder' then n.folder_id when 'canvas' then n.canvas_id else n.collection_id end = p_id;
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
  elsif p_type = 'canvas' then
    update public.workspace_canvases
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
  -- A Chapter (037) goes with its Scenes, as one piece of the manuscript.
  if p_type = 'chapter' then
    return public.restore_manuscript_chapter(p_id);
  end if;
  if p_type is null or p_type not in ('page', 'folder', 'collection', 'entry', 'canvas') then
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
  elsif p_type = 'canvas' then
    select c.trashed_at, c.trashed_from_folder_id, c.trashed_from_position
      into v_trashed_at, v_from_folder, v_from_position from public.workspace_canvases c where c.id = p_id;
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
  elsif p_type = 'canvas' then
    update public.workspace_canvases set trashed_at = null, trashed_from_folder_id = null, trashed_from_position = null where id = p_id;
  else
    update public.workspace_collections set trashed_at = null, trashed_from_folder_id = null, trashed_from_position = null where id = p_id;
  end if;

  -- Its one node (the unique target keys refuse a second), made at the end of
  -- the top level and then put in place.
  insert into public.workspace_nodes (project_id, target_type, document_id, folder_id, collection_id, canvas_id, parent_node_id, position)
  values (v_project_id, p_type,
          case when p_type = 'page' then p_id end,
          case when p_type = 'folder' then p_id end,
          case when p_type = 'collection' then p_id end,
          case when p_type = 'canvas' then p_id end,
          null,
          (select coalesce(max(n.position), 0) + 1 from public.workspace_nodes n
            where n.project_id = v_project_id and n.parent_node_id is null))
  returning id into v_node_id;
  perform public.place_workspace_node(v_node_id, v_parent, v_index);

  return jsonb_build_object('status', 'ok', 'node_id', v_node_id,
    'location', case when v_from_folder is not null and v_parent is null then 'top' else 'original' end);
end;
$function$;

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
  -- A Chapter (037) goes with its Scenes, as one piece of the manuscript.
  if p_type = 'chapter' then
    return public.delete_trashed_manuscript_chapter(p_id);
  end if;
  if p_type is null or p_type not in ('page', 'folder', 'collection', 'entry', 'canvas') then
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
    when 'canvas' then exists (select 1 from public.workspace_canvases c where c.id = p_id and c.trashed_at is not null)
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
  elsif p_type = 'canvas' then
    -- Its items go with it, and so does every placement of it on another
    -- Canvas (ON DELETE CASCADE). Nothing it showed is touched.
    delete from public.workspace_canvases c where c.id = p_id;
  else
    select count(*) into v_properties from public.workspace_collection_properties pr
     where pr.relation_collection_id = p_id and pr.collection_id <> p_id;
    v_properties := v_properties
      + (select count(*) from public.scene_property_definitions sp where sp.relation_collection_id = p_id);
    delete from public.workspace_collection_entries e where e.collection_id = p_id;
    get diagnostics v_entries = row_count;
    delete from public.workspace_collections c where c.id = p_id;
  end if;
  return jsonb_build_object('status', 'ok', 'entries', v_entries, 'properties', v_properties);
end;
$function$;

-- Canvases are listed too, with how many items each holds (`items`).
create or replace function public.list_workspace_trash(p_project_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
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
               null::uuid as from_chapter_id, null::text as from_chapter_title, null::boolean as from_chapter_active,
               null::uuid as from_group_id, null::text as from_group_title, null::boolean as from_group_active,
               null::integer as scenes, null::integer as words, null::integer as items
          from public.workspace_documents d
          left join public.workspace_folders ff on ff.id = d.trashed_from_folder_id
         where d.project_id = p_project_id and d.trashed_at is not null
        union all
        select 'folder', f.id, f.title, f.trashed_at,
               f.trashed_from_folder_id, ff.title, (ff.id is not null and ff.trashed_at is null),
               null, null, null, null, null, null, null, null, null, null, null, null, null, null
          from public.workspace_folders f
          left join public.workspace_folders ff on ff.id = f.trashed_from_folder_id
         where f.project_id = p_project_id and f.trashed_at is not null
        union all
        select 'collection', c.id, c.title, c.trashed_at,
               c.trashed_from_folder_id, ff.title, (ff.id is not null and ff.trashed_at is null),
               null, null, null,
               (select count(*)::integer from public.workspace_collection_entries e where e.collection_id = c.id),
               (select count(*)::integer from public.workspace_collection_properties pr
                 where pr.relation_collection_id = c.id and pr.collection_id <> c.id)
                 + (select count(*)::integer from public.scene_property_definitions sp where sp.relation_collection_id = c.id),
               null, null, null, null, null, null, null, null, null
          from public.workspace_collections c
          left join public.workspace_folders ff on ff.id = c.trashed_from_folder_id
         where c.project_id = p_project_id and c.trashed_at is not null
        union all
        select 'canvas', cv.id, cv.title, cv.trashed_at,
               cv.trashed_from_folder_id, ff.title, (ff.id is not null and ff.trashed_at is null),
               null, null, null, null, null,
               null, null, null, null, null, null, null, null,
               (select count(*)::integer from public.workspace_canvas_items i where i.canvas_id = cv.id)
          from public.workspace_canvases cv
          left join public.workspace_folders ff on ff.id = cv.trashed_from_folder_id
         where cv.project_id = p_project_id and cv.trashed_at is not null
        union all
        select 'entry', e.id, e.title, e.trashed_at,
               null, null, null,
               c.id, c.title, c.trashed_at is null,
               null, null, null, null, null, null, null, null, null, null, null
          from public.workspace_collection_entries e
          join public.workspace_collections c on c.id = e.collection_id
         where e.project_id = p_project_id and e.trashed_at is not null
        union all
        select 'scene', s.id, s.title, s.trashed_at,
               null, null, null, null, null, null, null, null,
               s.trashed_from_chapter_id, ch.title, (ch.id is not null and ch.trashed_at is null),
               null, null, null, null, s.word_count, null
          from public.scenes s
          join public.manuscripts m on m.id = s.manuscript_id
          left join public.chapters ch on ch.id = s.trashed_from_chapter_id and ch.manuscript_id = s.manuscript_id
         where m.project_id = p_project_id and s.trashed_at is not null and not s.trashed_with_chapter
        union all
        select 'chapter', ch.id, ch.title, ch.trashed_at,
               null, null, null, null, null, null, null, null, null, null, null,
               ch.trashed_from_group_id, g.title, g.id is not null,
               (select count(*)::integer from public.scenes s
                 where s.trashed_with_chapter and s.trashed_from_chapter_id = ch.id),
               (select coalesce(sum(s.word_count), 0)::integer from public.scenes s
                 where s.trashed_with_chapter and s.trashed_from_chapter_id = ch.id),
               null
          from public.chapters ch
          join public.manuscripts m on m.id = ch.manuscript_id
          left join public.manuscript_groups g on g.id = ch.trashed_from_group_id and g.manuscript_id = ch.manuscript_id
         where m.project_id = p_project_id and ch.trashed_at is not null
      ) t), '[]'::jsonb));
end;
$function$;

-- ── Creation ────────────────────────────────────────────────────────────────

create function public.create_workspace_canvas(p_project_id uuid, p_parent_node_id uuid, p_title text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_canvas public.workspace_canvases%rowtype;
  v_node_id uuid;
begin
  -- SECURITY DEFINER: ownership is checked here, not by RLS.
  if not exists (select 1 from public.projects p where p.id = p_project_id and p.user_id = auth.uid()) then
    return jsonb_build_object('status', 'error', 'error', 'Project not found');
  end if;
  perform public.lock_project_workspace(p_project_id);

  if p_parent_node_id is not null and not exists (
    select 1 from public.workspace_nodes n
     where n.id = p_parent_node_id and n.project_id = p_project_id and n.target_type = 'folder') then
    return jsonb_build_object('status', 'error', 'error', 'Folder not found');
  end if;

  insert into public.workspace_canvases (project_id, title)
  values (p_project_id, left(nullif(btrim(coalesce(p_title, '')), ''), 200))
  returning * into v_canvas;

  select n.id into v_node_id from public.workspace_nodes n where n.canvas_id = v_canvas.id;
  if p_parent_node_id is not null then
    perform public.place_workspace_node(v_node_id, p_parent_node_id, null);
  end if;

  return jsonb_build_object('status', 'ok', 'canvas', to_jsonb(v_canvas), 'node_id', v_node_id);
end;
$function$;

revoke execute on function public.create_workspace_canvas(uuid, uuid, text) from public, anon;

-- ── Writes: one batch per Canvas ────────────────────────────────────────────

create function public.write_canvas_items(p_canvas_id uuid, p_changes jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_project_id uuid;
  v_change jsonb;
  v_op text;
  v_id uuid;
  v_type text;
  v_target uuid;
  v_expected integer;
  v_row public.workspace_canvas_items%rowtype;
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
      v_op := v_change->>'op';
      v_id := (v_change->>'id')::uuid;
      if v_id is null then
        raise exception 'A change needs an id';
      end if;

      if v_op = 'delete' then
        -- Only this Canvas's rows; a row already gone is fine (a retried batch).
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
          if v_type is null or v_type not in ('scene', 'chapter', 'page', 'entry', 'canvas', 'note') then
            raise exception 'Unknown item type';
          end if;
          v_target := case when v_type = 'note' then null else (v_change->>'target_id')::uuid end;
          if v_type <> 'note' and v_target is null then
            raise exception 'A % placement needs a target', v_type;
          end if;
          insert into public.workspace_canvas_items
            (id, canvas_id, project_id, item_type, scene_id, chapter_id, document_id, entry_id, target_canvas_id, label, content, x, y, width, height, z)
          values
            (v_id, p_canvas_id, v_project_id, v_type,
             case when v_type = 'scene' then v_target end,
             case when v_type = 'chapter' then v_target end,
             case when v_type = 'page' then v_target end,
             case when v_type = 'entry' then v_target end,
             case when v_type = 'canvas' then v_target end,
             case when v_type = 'note' then null else left(v_change->>'label', 200) end,
             case when v_type = 'note' then coalesce(v_change->'content', '{"type": "doc", "content": []}'::jsonb) end,
             coalesce((v_change->>'x')::double precision, 0),
             coalesce((v_change->>'y')::double precision, 0),
             (v_change->>'width')::double precision,
             (v_change->>'height')::double precision,
             coalesce((v_change->>'z')::integer, 0))
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
          update public.workspace_canvas_items i
             set x = case when v_change ? 'x' then (v_change->>'x')::double precision else i.x end,
                 y = case when v_change ? 'y' then (v_change->>'y')::double precision else i.y end,
                 width = case when v_change ? 'width' then (v_change->>'width')::double precision else i.width end,
                 height = case when v_change ? 'height' then (v_change->>'height')::double precision else i.height end,
                 z = case when v_change ? 'z' then (v_change->>'z')::integer else i.z end,
                 content = case when v_change ? 'content' then v_change->'content' else i.content end
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

revoke execute on function public.write_canvas_items(uuid, jsonb) from public, anon;

-- ── Backup: two more kinds ──────────────────────────────────────────────────

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
values ('045', '045_workspace_canvas.sql', now(), 'Workspace Canvas foundation: workspace_canvases (a Workspace object with one canonical node, Trash as a Page) + workspace_canvas_items (placements of Scenes, Chapters, Pages, Entries, Canvases and Canvas-local notes; versioned; ON DELETE CASCADE with the target), create_workspace_canvas, write_canvas_items (one atomic, idempotent batch per Canvas), Trash functions accept ''canvas'', read_project_backup gains two kinds');
