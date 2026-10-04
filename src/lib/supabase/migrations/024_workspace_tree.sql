-- ── Migration 024: the Workspace tree (Folders + WorkspaceNodes) ─────────────
--
-- Rune 2.0 Workspace, Milestone 7. Turns the flat list of Workspace Pages into
-- a tree the writer shapes (architecture §11, §14–15). The tree is NAVIGATION
-- ONLY: it says where the writer wants to see an object, never what owns it.
-- Pages and Folders both belong directly to their Project, wherever they sit.
--
-- public.workspace_folders — NEW. One row is one Folder.
--   * Purely organisational: no body, no content, no prose (§11).
--   * Belongs directly to one Project (project_id) and never moves to another
--     (forbid_project_reassignment, from 023). Deleting the Project removes it.
--   * title is optional (null = untitled; never blank), at most 200 characters.
--   * RLS: writers read and rename (UPDATE of title) their own Folders. They
--     cannot INSERT or DELETE them directly (no privilege, no policy):
--     create_workspace_folder and delete_workspace_folder do.
--
-- public.workspace_nodes — NEW. One row is one object's place in the tree.
--   Conceptually WorkspaceNode(target_type, target_id, parent node, position).
--   Physically the target is one foreign-key column per target type, so the
--   database itself guarantees the target exists, lives in the same Project,
--   and takes its node with it when it is deleted:
--     target_type 'page'   → document_id   → workspace_documents(id, project_id)
--     target_type 'folder' → folder_id → workspace_folders(id, project_id)
--   (workspace_nodes_target_matches_type: exactly the column of its type is
--   set.) A later target type (Collections) adds a column the same way.
--   * ONE canonical node per object: unique (document_id), unique (folder_id).
--     No aliases or shortcuts in the beta (§14).
--   * parent_node_id null = top level of the Workspace. A composite foreign
--     key (parent_node_id, project_id) makes a parent in another Project
--     impossible; NO ACTION, so a node that still has children cannot be
--     removed. In this milestone only a FOLDER may have children
--     (workspace_nodes_check_parent). The architecture also allows Page → Page
--     and Page → Folder nesting (§15); lifting that is a change to this one
--     trigger, with no data to migrate.
--   * Cycles are refused by the same trigger, whatever writes the row.
--   * position orders a node among its siblings: 1..n with no gaps and no
--     ties. workspace_nodes_sibling_position_key is unique across
--     (project_id, parent_node_id, position), nulls not distinct, DEFERRABLE
--     (checked at the end of each statement, so one UPDATE can renumber).
--   * The target and Project of a node never change
--     (workspace_nodes_freeze_target, forbid_project_reassignment).
--   * RLS: writers read their own Projects' nodes. They cannot INSERT, UPDATE
--     or DELETE nodes at all (no privilege, no policy).
--
-- Every Workspace object gets its node when it is created, whoever creates it:
-- the AFTER INSERT trigger place_new_workspace_object (on workspace_documents
-- and workspace_folders) appends it at the end of the top level. That includes
-- a Page inserted directly under RLS by an app deployed before this migration
-- (023's createWorkspacePage), so an older client can never leave a Page with
-- no place in the tree.
--
-- Functions — NEW, SECURITY DEFINER, ownership checked explicitly against
-- projects.user_id = auth.uid(), each under lock_project_workspace() (a
-- per-Project advisory lock, so siblings are read and renumbered with no other
-- tree write in between). Each returns { status: 'ok', … } or
-- { status: 'error', error } and writes nothing on an error:
--   * create_workspace_document(p_project_id, p_parent_node_id, p_title)
--       → { page, node_id }   (Page appended at the end of the parent)
--   * create_workspace_folder(p_project_id, p_parent_node_id, p_title)
--       → { folder, node_id } (Folder appended at the end of the parent)
--   * move_workspace_node(p_node_id, p_parent_node_id, p_index)
--       → { moved }  — puts the node at p_index (0-based; null = last) among
--       the destination's children; reordering is a move within the same
--       parent. The destination's children are renumbered 1..n, and so is the
--       parent it left; only rows whose place changes are written. Page ids,
--       titles, content and versions are never touched. Refused: another
--       writer's node or destination ('… not found'), a destination in another
--       Project, a destination that is not a Folder, a Folder into itself or
--       its own descendant.
--   * delete_workspace_folder(p_folder_id) → {} — only an EMPTY Folder
--       ('Only an empty folder can be deleted'). Deleting a Folder never
--       deletes, moves or reorders anything else except closing the gap it
--       leaves among its siblings. There is no Trash yet, so nothing that holds
--       anything can be deleted.
--
-- Backfill: every existing Workspace Page gets one top-level node, numbered
-- 1..n per Project in the order the navigator showed them until now
-- (created_at, id). No Page's id, title, content, version or timestamps change.
--
-- workspace_documents gains unique (id, project_id), the target of the node's
-- composite foreign key. Nothing else on it changes.
--
-- Nothing here touches a manuscript table, function or policy.
--
-- For the Rune 2.0 database only: it requires 023. Safe to apply before the
-- app deploy that uses it: the previous app only reads workspace_documents and
-- inserts Pages directly, and the insert trigger places those.
-- Rollback (drops every Folder and every Page's place; Pages themselves stay):
--   drop trigger workspace_documents_place_new on public.workspace_documents;
--   drop table public.workspace_nodes;
--   drop table public.workspace_folders;
--   drop function public.create_workspace_document(uuid, uuid, text);
--   drop function public.create_workspace_folder(uuid, uuid, text);
--   drop function public.move_workspace_node(uuid, uuid, integer);
--   drop function public.delete_workspace_folder(uuid);
--   drop function public.place_workspace_node(uuid, uuid, integer);
--   drop function public.renumber_workspace_siblings(uuid, uuid);
--   drop function public.place_new_workspace_object();
--   drop function public.check_workspace_node_parent();
--   drop function public.freeze_workspace_node_target();
--   drop function public.stamp_workspace_folder();
--   drop function public.lock_project_workspace(uuid);
--   alter table public.workspace_documents drop constraint workspace_documents_id_project_id_key;
--   delete from public.schema_migrations where version = '024';
-- Apply as ONE script (psql -1, or the SQL editor).

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 024 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '024') then
    raise exception 'Migration 024 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '023') then
    raise exception 'Migration 024 requires migration 023 (workspace pages). Nothing was changed.';
  end if;
  -- The SECURITY DEFINER functions and triggers below run as their owner (the
  -- role applying this), which must own workspace_documents, or they would be
  -- subject to its RLS.
  if (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.workspace_documents'::regclass) <> current_user then
    raise exception 'Migration 024 must be applied by the owner of public.workspace_documents (%, not %). Nothing was changed.',
      (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.workspace_documents'::regclass), current_user;
  end if;
end
$$;

-- ── Folders ─────────────────────────────────────────────────────────────────

create table public.workspace_folders (
  id          uuid        default gen_random_uuid() not null,
  project_id  uuid        not null,
  title       text,                                                   -- null = untitled
  created_at  timestamptz default now() not null,
  updated_at  timestamptz default now() not null
);

alter table public.workspace_folders add constraint workspace_folders_pkey primary key (id);
alter table public.workspace_folders add constraint workspace_folders_id_project_id_key unique (id, project_id);
alter table public.workspace_folders add constraint workspace_folders_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete cascade;
alter table public.workspace_folders add constraint workspace_folders_title_check
  check (title is null or (btrim(title) <> '' and char_length(title) <= 200));

create index workspace_folders_project_id_idx on public.workspace_folders using btree (project_id);

-- The database owns the timestamps; a rename moves updated_at.
create function public.stamp_workspace_folder()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;
  new.id := old.id;
  new.created_at := old.created_at;
  new.updated_at := case when new.title is distinct from old.title then now() else old.updated_at end;
  return new;
end;
$function$;

revoke execute on function public.stamp_workspace_folder() from public, anon;

create trigger workspace_folders_forbid_project_reassignment before update of project_id on public.workspace_folders
  for each row execute function public.forbid_project_reassignment();
create trigger workspace_folders_stamp before insert or update on public.workspace_folders
  for each row execute function public.stamp_workspace_folder();

alter table public.workspace_folders enable row level security;

create policy "workspace_folders: select own" on public.workspace_folders
  as permissive for select to authenticated
  using (exists (select 1 from public.projects p
                 where p.id = workspace_folders.project_id and p.user_id = (select auth.uid())));
create policy "workspace_folders: update own" on public.workspace_folders
  as permissive for update to authenticated
  using (exists (select 1 from public.projects p
                 where p.id = workspace_folders.project_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p
                      where p.id = workspace_folders.project_id and p.user_id = (select auth.uid())));

revoke insert, delete on public.workspace_folders from anon, authenticated;

-- ── Nodes ───────────────────────────────────────────────────────────────────

alter table public.workspace_documents add constraint workspace_documents_id_project_id_key unique (id, project_id);

create table public.workspace_nodes (
  id              uuid        default gen_random_uuid() not null,
  project_id      uuid        not null,
  target_type     text        not null,
  document_id         uuid,                                               -- target_type 'page'
  folder_id       uuid,                                               -- target_type 'folder'
  parent_node_id  uuid,                                               -- null = top level
  position        integer     not null,
  created_at      timestamptz default now() not null
);

alter table public.workspace_nodes add constraint workspace_nodes_pkey primary key (id);
-- Target of the parent foreign key (a parent must share its child's Project).
alter table public.workspace_nodes add constraint workspace_nodes_id_project_id_key unique (id, project_id);
alter table public.workspace_nodes add constraint workspace_nodes_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete cascade;
alter table public.workspace_nodes add constraint workspace_nodes_target_type_check
  check (target_type in ('page', 'folder'));
alter table public.workspace_nodes add constraint workspace_nodes_target_matches_type
  check ((target_type = 'page' and document_id is not null and folder_id is null)
      or (target_type = 'folder' and folder_id is not null and document_id is null));
-- One canonical place per object.
alter table public.workspace_nodes add constraint workspace_nodes_document_id_key unique (document_id);
alter table public.workspace_nodes add constraint workspace_nodes_folder_id_key unique (folder_id);
-- MATCH SIMPLE: only the column of the node's type is checked. The node goes
-- with its object.
alter table public.workspace_nodes add constraint workspace_nodes_document_same_project_fkey
  foreign key (document_id, project_id) references public.workspace_documents(id, project_id) on delete cascade;
alter table public.workspace_nodes add constraint workspace_nodes_folder_same_project_fkey
  foreign key (folder_id, project_id) references public.workspace_folders(id, project_id) on delete cascade;
-- MATCH SIMPLE: a null parent (top level) is not checked. NO ACTION: a node
-- that still has children cannot be removed.
alter table public.workspace_nodes add constraint workspace_nodes_parent_same_project_fkey
  foreign key (parent_node_id, project_id) references public.workspace_nodes(id, project_id);
alter table public.workspace_nodes add constraint workspace_nodes_not_own_parent
  check (parent_node_id <> id);
alter table public.workspace_nodes add constraint workspace_nodes_position_check
  check (position > 0);
alter table public.workspace_nodes add constraint workspace_nodes_sibling_position_key
  unique nulls not distinct (project_id, parent_node_id, position) deferrable initially immediate;

create index workspace_nodes_parent_node_id_idx on public.workspace_nodes using btree (parent_node_id);

-- A node keeps its object for life.
create function public.freeze_workspace_node_target()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if new.target_type is distinct from old.target_type
     or new.document_id is distinct from old.document_id
     or new.folder_id is distinct from old.folder_id then
    raise exception 'A Workspace node keeps its object for life'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

-- A parent is a Folder, and a node never ends up inside itself: walk up from
-- the new parent.
create function public.check_workspace_node_parent()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.parent_node_id is null
     or (tg_op = 'UPDATE' and new.parent_node_id is not distinct from old.parent_node_id) then
    return new;
  end if;
  if not exists (select 1 from public.workspace_nodes n
                  where n.id = new.parent_node_id and n.target_type = 'folder') then
    raise exception 'Only a Folder can hold other Workspace items'
      using errcode = 'check_violation';
  end if;
  if exists (
       with recursive up(id) as (
         select new.parent_node_id
         union
         select n.parent_node_id
           from public.workspace_nodes n
           join up on n.id = up.id
          where n.parent_node_id is not null)
       select 1 from up where up.id = new.id) then
    raise exception 'A Folder cannot be placed inside itself or one of its own Folders'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

revoke execute on function public.freeze_workspace_node_target() from public, anon;
revoke execute on function public.check_workspace_node_parent() from public, anon;

create trigger workspace_nodes_forbid_project_reassignment before update of project_id on public.workspace_nodes
  for each row execute function public.forbid_project_reassignment();
create trigger workspace_nodes_freeze_target before update of target_type, document_id, folder_id on public.workspace_nodes
  for each row execute function public.freeze_workspace_node_target();
create trigger workspace_nodes_check_parent before insert or update of parent_node_id on public.workspace_nodes
  for each row execute function public.check_workspace_node_parent();

alter table public.workspace_nodes enable row level security;

create policy "workspace_nodes: select own" on public.workspace_nodes
  as permissive for select to authenticated
  using (exists (select 1 from public.projects p
                 where p.id = workspace_nodes.project_id and p.user_id = (select auth.uid())));

revoke insert, update, delete on public.workspace_nodes from anon, authenticated;

-- ── Placement ───────────────────────────────────────────────────────────────

-- Serialises every write to one Project's Workspace tree. Internal.
create function public.lock_project_workspace(p_project_id uuid)
 returns void
 language sql
 set search_path to ''
as $function$
  select pg_advisory_xact_lock(('x' || substr(md5('rune.workspace:' || p_project_id::text), 1, 16))::bit(64)::bigint);
$function$;

-- Numbers one parent's children 1..n in their current order, closing gaps.
-- Internal: the caller holds the Project's lock.
create function public.renumber_workspace_siblings(p_project_id uuid, p_parent_node_id uuid)
 returns void
 language sql
 set search_path to ''
as $function$
  update public.workspace_nodes n
     set position = o.ord
    from (select s.id, row_number() over (order by s.position, s.id)::int as ord
            from public.workspace_nodes s
           where s.project_id = p_project_id
             and s.parent_node_id is not distinct from p_parent_node_id) o
   where n.id = o.id and n.position <> o.ord;
$function$;

-- Puts one node at p_index (0-based; null = last) among the children of
-- p_parent_node_id (null = top level), numbers them 1..n, and closes the gap
-- in the parent it left. One UPDATE per parent: the sibling constraint is
-- checked at the end of each statement. Internal: callers hold the Project's
-- lock and have validated ownership and the destination. Returns whether
-- anything changed.
create function public.place_workspace_node(p_node_id uuid, p_parent_node_id uuid, p_index integer)
 returns boolean
 language plpgsql
 set search_path to ''
as $function$
declare
  v_project_id uuid;
  v_old_parent uuid;
  v_ids uuid[];
  v_n int;
  v_i int;
  v_changed int;
begin
  select n.project_id, n.parent_node_id into v_project_id, v_old_parent
    from public.workspace_nodes n where n.id = p_node_id;

  select coalesce(array_agg(n.id order by n.position, n.id), '{}') into v_ids
    from public.workspace_nodes n
   where n.project_id = v_project_id
     and n.parent_node_id is not distinct from p_parent_node_id
     and n.id <> p_node_id;

  v_n := coalesce(array_length(v_ids, 1), 0);
  v_i := least(greatest(coalesce(p_index, v_n), 0), v_n);
  v_ids := v_ids[1:v_i] || p_node_id || v_ids[v_i + 1:v_n];

  update public.workspace_nodes n
     set parent_node_id = p_parent_node_id, position = o.ord::int
    from unnest(v_ids) with ordinality as o(id, ord)
   where n.id = o.id
     and (n.position <> o.ord or n.parent_node_id is distinct from p_parent_node_id);
  get diagnostics v_changed = row_count;

  if v_old_parent is distinct from p_parent_node_id then
    perform public.renumber_workspace_siblings(v_project_id, v_old_parent);
  end if;

  return v_changed > 0;
end;
$function$;

-- Every new Page or Folder gets its node at the end of the top level,
-- whoever inserted it.
create function public.place_new_workspace_object()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_type text := case tg_table_name when 'workspace_documents' then 'page' else 'folder' end;
begin
  perform public.lock_project_workspace(new.project_id);
  insert into public.workspace_nodes (project_id, target_type, document_id, folder_id, parent_node_id, position)
  values (new.project_id, v_type,
          case when v_type = 'page' then new.id end,
          case when v_type = 'folder' then new.id end,
          null,
          (select coalesce(max(n.position), 0) + 1 from public.workspace_nodes n
            where n.project_id = new.project_id and n.parent_node_id is null));
  return null;
end;
$function$;

revoke execute on function public.lock_project_workspace(uuid) from public, anon, authenticated;
revoke execute on function public.renumber_workspace_siblings(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.place_workspace_node(uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.place_new_workspace_object() from public, anon;

create trigger workspace_documents_place_new after insert on public.workspace_documents
  for each row execute function public.place_new_workspace_object();
create trigger workspace_folders_place_new after insert on public.workspace_folders
  for each row execute function public.place_new_workspace_object();

-- ── Backfill: every existing Page at the top level, in the order shown until now ─

insert into public.workspace_nodes (project_id, target_type, document_id, parent_node_id, position)
select d.project_id, 'page', d.id, null,
       row_number() over (partition by d.project_id order by d.created_at, d.id)::int
  from public.workspace_documents d;

-- ── Tree functions ──────────────────────────────────────────────────────────

create function public.create_workspace_document(p_project_id uuid, p_parent_node_id uuid, p_title text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_page public.workspace_documents%rowtype;
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

  insert into public.workspace_documents (project_id, title)
  values (p_project_id, left(nullif(btrim(coalesce(p_title, '')), ''), 200))
  returning * into v_page;

  select n.id into v_node_id from public.workspace_nodes n where n.document_id = v_page.id;
  if p_parent_node_id is not null then
    perform public.place_workspace_node(v_node_id, p_parent_node_id, null);
  end if;

  return jsonb_build_object('status', 'ok', 'page', to_jsonb(v_page), 'node_id', v_node_id);
end;
$function$;

create function public.create_workspace_folder(p_project_id uuid, p_parent_node_id uuid, p_title text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_folder public.workspace_folders%rowtype;
  v_node_id uuid;
begin
  if not exists (select 1 from public.projects p where p.id = p_project_id and p.user_id = auth.uid()) then
    return jsonb_build_object('status', 'error', 'error', 'Project not found');
  end if;
  perform public.lock_project_workspace(p_project_id);

  if p_parent_node_id is not null and not exists (
    select 1 from public.workspace_nodes n
     where n.id = p_parent_node_id and n.project_id = p_project_id and n.target_type = 'folder') then
    return jsonb_build_object('status', 'error', 'error', 'Folder not found');
  end if;

  insert into public.workspace_folders (project_id, title)
  values (p_project_id, left(nullif(btrim(coalesce(p_title, '')), ''), 200))
  returning * into v_folder;

  select n.id into v_node_id from public.workspace_nodes n where n.folder_id = v_folder.id;
  if p_parent_node_id is not null then
    perform public.place_workspace_node(v_node_id, p_parent_node_id, null);
  end if;

  return jsonb_build_object('status', 'ok', 'folder', to_jsonb(v_folder), 'node_id', v_node_id);
end;
$function$;

create function public.move_workspace_node(p_node_id uuid, p_parent_node_id uuid, p_index integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_project_id uuid;
  v_parent public.workspace_nodes%rowtype;
begin
  select n.project_id into v_project_id
    from public.workspace_nodes n
    join public.projects p on p.id = n.project_id
   where n.id = p_node_id and p.user_id = auth.uid();
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Item not found');
  end if;
  perform public.lock_project_workspace(v_project_id);

  if p_parent_node_id is not null then
    select n.* into v_parent
      from public.workspace_nodes n
      join public.projects p on p.id = n.project_id
     where n.id = p_parent_node_id and p.user_id = auth.uid();
    if not found then
      return jsonb_build_object('status', 'error', 'error', 'Folder not found');
    end if;
    if v_parent.project_id <> v_project_id then
      return jsonb_build_object('status', 'error', 'error', 'Items can only move within their own Project');
    end if;
    if v_parent.target_type <> 'folder' then
      return jsonb_build_object('status', 'error', 'error', 'Only a Folder can hold other items');
    end if;
    if exists (
         with recursive up(id) as (
           select p_parent_node_id
           union
           select n.parent_node_id from public.workspace_nodes n join up on n.id = up.id
            where n.parent_node_id is not null)
         select 1 from up where up.id = p_node_id) then
      return jsonb_build_object('status', 'error', 'error', 'A Folder cannot move inside itself');
    end if;
  end if;

  return jsonb_build_object('status', 'ok', 'moved',
    public.place_workspace_node(p_node_id, p_parent_node_id, p_index));
end;
$function$;

create function public.delete_workspace_folder(p_folder_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_project_id uuid;
  v_node public.workspace_nodes%rowtype;
begin
  select f.project_id into v_project_id
    from public.workspace_folders f
    join public.projects p on p.id = f.project_id
   where f.id = p_folder_id and p.user_id = auth.uid();
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Folder not found');
  end if;
  perform public.lock_project_workspace(v_project_id);

  select n.* into v_node from public.workspace_nodes n where n.folder_id = p_folder_id;
  if exists (select 1 from public.workspace_nodes n where n.parent_node_id = v_node.id) then
    return jsonb_build_object('status', 'error', 'error', 'Only an empty folder can be deleted');
  end if;

  -- Its node goes with it (workspace_nodes_folder_same_project_fkey).
  delete from public.workspace_folders f where f.id = p_folder_id;
  perform public.renumber_workspace_siblings(v_project_id, v_node.parent_node_id);
  return jsonb_build_object('status', 'ok');
end;
$function$;

revoke execute on function public.create_workspace_document(uuid, uuid, text) from public, anon;
revoke execute on function public.create_workspace_folder(uuid, uuid, text) from public, anon;
revoke execute on function public.move_workspace_node(uuid, uuid, integer) from public, anon;
revoke execute on function public.delete_workspace_folder(uuid) from public, anon;

insert into public.schema_migrations (version, name, applied_at, note)
values ('024', '024_workspace_tree.sql', now(), 'Workspace tree: workspace_folders + workspace_nodes (one canonical node per Page/Folder), atomic create/move/delete-empty-folder RPCs, top-level backfill of existing Pages');
