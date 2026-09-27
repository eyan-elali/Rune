-- ── Migration 025: Workspace Collections + Collection Entries ────────────────
--
-- Rune 2.0 Workspace, Milestone 8. The next two generic Workspace primitives
-- (architecture §12–13): a Collection — many things of one writer-defined
-- kind ("Characters", "Locations", "Research") — and its Entries. Rune gives
-- no Collection a meaning: nothing here knows what "Characters" is.
--
-- public.workspace_collections — NEW. One row is one Collection.
--   * Belongs directly to one Project (project_id) and never moves to another
--     (forbid_project_reassignment, from 023). Deleting the Project removes it.
--   * title is optional (null = untitled; never blank), at most 200 characters.
--   * Owns its Entries. Property definitions and saved Views will hang off
--     collection_id later; nothing for them exists yet.
--   * Placed in the Workspace tree by one canonical node, like a Page or a
--     Folder (§14). A Collection is never a parent in the tree: its Entries
--     are not tree items.
--   * RLS: writers read and rename (UPDATE of title) their own Collections.
--     They cannot INSERT or DELETE them directly (no privilege, no policy):
--     create_workspace_collection and delete_workspace_collection do.
--
-- public.workspace_collection_entries — NEW. One row is one Entry.
--   * Belongs to exactly one Collection (collection_id), for life
--     (workspace_collection_entries_freeze_collection). project_id is the
--     Collection's Project, carried on the row so RLS is one lookup; the
--     composite foreign key (collection_id, project_id) makes a mismatch
--     impossible.
--   * title is optional (null = untitled), at most 200 characters.
--   * content is TipTap JSON (a JSON object), empty doc by default — freeform
--     notes, never manuscript prose: never counted toward any word total, never
--     written by the Scene save path.
--   * version: bumped by the database whenever content changes, never by a
--     rename (stamp_workspace_document, from 023 — the same rule as a Page),
--     so saves compare against it (update … where version = expected).
--   * No position: a Collection lists its Entries in creation order until
--     saved Views exist. No property values yet.
--   * NO ACTION foreign key to the Collection: a Collection that still holds an
--     Entry cannot be deleted, whatever deletes it. Deleting the Project
--     removes both (one statement, so the check passes).
--   * RLS: writers read, create and update Entries only in their own Projects.
--     There is no DELETE for clients (no privilege, no policy): deletion in
--     Rune 2.0 is recoverable (§26, Trash), and Trash does not exist yet.
--
-- public.workspace_nodes — CHANGED: a third target type.
--   target_type 'collection' → collection_id → workspace_collections(id, project_id)
--   unique (collection_id): one canonical place. The node goes with its
--   Collection. Folders stay the only parents (check_workspace_node_parent is
--   unchanged), so a Collection sits at the top level or in any Folder, and
--   nothing can be placed inside one. Existing Page and Folder nodes are not
--   touched.
--   * freeze_workspace_node_target and its trigger also cover collection_id.
--   * place_new_workspace_object also places a new Collection (end of the top
--     level), whoever inserts it.
--
-- Functions — NEW, SECURITY DEFINER, ownership checked against
-- projects.user_id = auth.uid(), under lock_project_workspace() as in 024:
--   * create_workspace_collection(p_project_id, p_parent_node_id, p_title)
--       → { collection, node_id }   (appended at the end of the parent Folder)
--   * delete_workspace_collection(p_collection_id) → {} — only an EMPTY
--       Collection ('Only an empty collection can be deleted'). Its node goes
--       with it and the gap among its siblings closes.
--   Moving and reordering a Collection is move_workspace_node, unchanged.
--
-- Nothing here touches a manuscript table, function or policy, or any existing
-- Page, Folder or node row.
--
-- For the Rune 2.0 database only: it requires 024. Apply BEFORE the app deploy
-- that uses it (the new loader reads workspace_collections). The previous app
-- is unaffected: it never reads the new tables, and its node read ignores the
-- new column.
-- Rollback (drops every Collection and Entry):
--   drop trigger workspace_collections_place_new on public.workspace_collections;
--   delete from public.workspace_nodes where target_type = 'collection';
--   alter table public.workspace_nodes drop constraint workspace_nodes_collection_same_project_fkey;
--   alter table public.workspace_nodes drop constraint workspace_nodes_collection_id_key;
--   alter table public.workspace_nodes drop constraint workspace_nodes_target_matches_type;
--   alter table public.workspace_nodes drop constraint workspace_nodes_target_type_check;
--   drop trigger workspace_nodes_freeze_target on public.workspace_nodes;
--   alter table public.workspace_nodes drop column collection_id;
--   (then restore 024's target_type_check, target_matches_type,
--    freeze_workspace_node_target, place_new_workspace_object and the
--    workspace_nodes_freeze_target trigger from 024_workspace_tree.sql)
--   drop table public.workspace_collection_entries;
--   drop table public.workspace_collections;
--   drop function public.create_workspace_collection(uuid, uuid, text);
--   drop function public.delete_workspace_collection(uuid);
--   drop function public.freeze_workspace_entry_collection();
--   delete from public.schema_migrations where version = '025';
-- Apply as ONE script (psql -1, or the SQL editor).

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 025 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '025') then
    raise exception 'Migration 025 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '024') then
    raise exception 'Migration 025 requires migration 024 (workspace tree). Nothing was changed.';
  end if;
  -- As in 024: the SECURITY DEFINER functions run as their owner, which must
  -- own the Workspace tables or they would be subject to RLS.
  if (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.workspace_nodes'::regclass) <> current_user then
    raise exception 'Migration 025 must be applied by the owner of public.workspace_nodes (%, not %). Nothing was changed.',
      (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.workspace_nodes'::regclass), current_user;
  end if;
end
$$;

-- ── Collections ─────────────────────────────────────────────────────────────

create table public.workspace_collections (
  id          uuid        default gen_random_uuid() not null,
  project_id  uuid        not null,
  title       text,                                                   -- null = untitled
  created_at  timestamptz default now() not null,
  updated_at  timestamptz default now() not null
);

alter table public.workspace_collections add constraint workspace_collections_pkey primary key (id);
alter table public.workspace_collections add constraint workspace_collections_id_project_id_key unique (id, project_id);
alter table public.workspace_collections add constraint workspace_collections_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete cascade;
alter table public.workspace_collections add constraint workspace_collections_title_check
  check (title is null or (btrim(title) <> '' and char_length(title) <= 200));

create index workspace_collections_project_id_idx on public.workspace_collections using btree (project_id);

-- Timestamps are the database's; a rename moves updated_at. The Folder's
-- stamp (024) is exactly this rule for a titled, content-less row.
create trigger workspace_collections_forbid_project_reassignment before update of project_id on public.workspace_collections
  for each row execute function public.forbid_project_reassignment();
create trigger workspace_collections_stamp before insert or update on public.workspace_collections
  for each row execute function public.stamp_workspace_folder();

alter table public.workspace_collections enable row level security;

create policy "workspace_collections: select own" on public.workspace_collections
  as permissive for select to authenticated
  using (exists (select 1 from public.projects p
                 where p.id = workspace_collections.project_id and p.user_id = (select auth.uid())));
create policy "workspace_collections: update own" on public.workspace_collections
  as permissive for update to authenticated
  using (exists (select 1 from public.projects p
                 where p.id = workspace_collections.project_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p
                      where p.id = workspace_collections.project_id and p.user_id = (select auth.uid())));

revoke insert, delete on public.workspace_collections from anon, authenticated;

-- ── Entries ─────────────────────────────────────────────────────────────────

create table public.workspace_collection_entries (
  id             uuid        default gen_random_uuid() not null,
  collection_id  uuid        not null,
  project_id     uuid        not null,                                -- the Collection's Project
  title          text,                                                -- null = untitled
  content        jsonb       default '{"type": "doc", "content": []}'::jsonb not null,
  version        integer     default 1     not null,
  created_at     timestamptz default now() not null,
  updated_at     timestamptz default now() not null
);

alter table public.workspace_collection_entries add constraint workspace_collection_entries_pkey primary key (id);
alter table public.workspace_collection_entries add constraint workspace_collection_entries_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete cascade;
-- NO ACTION: a Collection holding an Entry cannot be deleted.
alter table public.workspace_collection_entries add constraint workspace_collection_entries_collection_same_project_fkey
  foreign key (collection_id, project_id) references public.workspace_collections(id, project_id);
alter table public.workspace_collection_entries add constraint workspace_collection_entries_title_check
  check (title is null or (btrim(title) <> '' and char_length(title) <= 200));
alter table public.workspace_collection_entries add constraint workspace_collection_entries_content_is_object
  check (jsonb_typeof(content) = 'object');

-- A Collection's Entries in creation order (its list).
create index workspace_collection_entries_collection_id_created_at_idx
  on public.workspace_collection_entries using btree (collection_id, created_at);
create index workspace_collection_entries_project_id_idx
  on public.workspace_collection_entries using btree (project_id);

-- An Entry keeps its Collection for life.
create function public.freeze_workspace_entry_collection()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if new.collection_id is distinct from old.collection_id then
    raise exception 'An Entry cannot move to another Collection'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

revoke execute on function public.freeze_workspace_entry_collection() from public, anon;

create trigger workspace_collection_entries_forbid_project_reassignment before update of project_id on public.workspace_collection_entries
  for each row execute function public.forbid_project_reassignment();
create trigger workspace_collection_entries_freeze_collection before update of collection_id on public.workspace_collection_entries
  for each row execute function public.freeze_workspace_entry_collection();
-- Version and timestamps: the Page rule (023) — content bumps version, a
-- rename never does.
create trigger workspace_collection_entries_stamp before insert or update on public.workspace_collection_entries
  for each row execute function public.stamp_workspace_document();

alter table public.workspace_collection_entries enable row level security;

create policy "workspace_collection_entries: select own" on public.workspace_collection_entries
  as permissive for select to authenticated
  using (exists (select 1 from public.projects p
                 where p.id = workspace_collection_entries.project_id and p.user_id = (select auth.uid())));
create policy "workspace_collection_entries: insert own" on public.workspace_collection_entries
  as permissive for insert to authenticated
  with check (exists (select 1 from public.projects p
                      where p.id = workspace_collection_entries.project_id and p.user_id = (select auth.uid())));
create policy "workspace_collection_entries: update own" on public.workspace_collection_entries
  as permissive for update to authenticated
  using (exists (select 1 from public.projects p
                 where p.id = workspace_collection_entries.project_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p
                      where p.id = workspace_collection_entries.project_id and p.user_id = (select auth.uid())));

revoke delete on public.workspace_collection_entries from anon, authenticated;

-- ── Nodes: the Collection target ────────────────────────────────────────────

alter table public.workspace_nodes add column collection_id uuid;             -- target_type 'collection'

alter table public.workspace_nodes drop constraint workspace_nodes_target_type_check;
alter table public.workspace_nodes add constraint workspace_nodes_target_type_check
  check (target_type in ('page', 'folder', 'collection'));
alter table public.workspace_nodes drop constraint workspace_nodes_target_matches_type;
alter table public.workspace_nodes add constraint workspace_nodes_target_matches_type
  check ((target_type = 'page' and document_id is not null and folder_id is null and collection_id is null)
      or (target_type = 'folder' and folder_id is not null and document_id is null and collection_id is null)
      or (target_type = 'collection' and collection_id is not null and document_id is null and folder_id is null));
alter table public.workspace_nodes add constraint workspace_nodes_collection_id_key unique (collection_id);
alter table public.workspace_nodes add constraint workspace_nodes_collection_same_project_fkey
  foreign key (collection_id, project_id) references public.workspace_collections(id, project_id) on delete cascade;

create or replace function public.freeze_workspace_node_target()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if new.target_type is distinct from old.target_type
     or new.document_id is distinct from old.document_id
     or new.folder_id is distinct from old.folder_id
     or new.collection_id is distinct from old.collection_id then
    raise exception 'A Workspace node keeps its object for life'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

drop trigger workspace_nodes_freeze_target on public.workspace_nodes;
create trigger workspace_nodes_freeze_target before update of target_type, document_id, folder_id, collection_id on public.workspace_nodes
  for each row execute function public.freeze_workspace_node_target();

-- Every new Page, Folder or Collection gets its node at the end of the top
-- level, whoever inserted it.
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
                 end;
begin
  if v_type is null then
    raise exception 'place_new_workspace_object: % is not a Workspace object table', tg_table_name;
  end if;
  perform public.lock_project_workspace(new.project_id);
  insert into public.workspace_nodes (project_id, target_type, document_id, folder_id, collection_id, parent_node_id, position)
  values (new.project_id, v_type,
          case when v_type = 'page' then new.id end,
          case when v_type = 'folder' then new.id end,
          case when v_type = 'collection' then new.id end,
          null,
          (select coalesce(max(n.position), 0) + 1 from public.workspace_nodes n
            where n.project_id = new.project_id and n.parent_node_id is null));
  return null;
end;
$function$;

create trigger workspace_collections_place_new after insert on public.workspace_collections
  for each row execute function public.place_new_workspace_object();

-- ── Collection functions ────────────────────────────────────────────────────

create function public.create_workspace_collection(p_project_id uuid, p_parent_node_id uuid, p_title text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_collection public.workspace_collections%rowtype;
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

  insert into public.workspace_collections (project_id, title)
  values (p_project_id, left(nullif(btrim(coalesce(p_title, '')), ''), 200))
  returning * into v_collection;

  select n.id into v_node_id from public.workspace_nodes n where n.collection_id = v_collection.id;
  if p_parent_node_id is not null then
    perform public.place_workspace_node(v_node_id, p_parent_node_id, null);
  end if;

  return jsonb_build_object('status', 'ok', 'collection', to_jsonb(v_collection), 'node_id', v_node_id);
end;
$function$;

create function public.delete_workspace_collection(p_collection_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_project_id uuid;
  v_parent uuid;
begin
  select c.project_id into v_project_id
    from public.workspace_collections c
    join public.projects p on p.id = c.project_id
   where c.id = p_collection_id and p.user_id = auth.uid();
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Collection not found');
  end if;
  perform public.lock_project_workspace(v_project_id);

  -- Only an empty Collection: there is no Trash, so no Entry is ever lost.
  if exists (select 1 from public.workspace_collection_entries e where e.collection_id = p_collection_id) then
    return jsonb_build_object('status', 'error', 'error', 'Only an empty collection can be deleted');
  end if;

  select n.parent_node_id into v_parent from public.workspace_nodes n where n.collection_id = p_collection_id;
  -- Its node goes with it (workspace_nodes_collection_same_project_fkey).
  delete from public.workspace_collections c where c.id = p_collection_id;
  perform public.renumber_workspace_siblings(v_project_id, v_parent);
  return jsonb_build_object('status', 'ok');
end;
$function$;

revoke execute on function public.create_workspace_collection(uuid, uuid, text) from public, anon;
revoke execute on function public.delete_workspace_collection(uuid) from public, anon;

insert into public.schema_migrations (version, name, applied_at, note)
values ('025', '025_workspace_collections.sql', now(), 'Workspace Collections + Entries: workspace_collections (one canonical node each), workspace_collection_entries (content-versioned, RLS by Project owner, no client DELETE), empty-only Collection deletion');
