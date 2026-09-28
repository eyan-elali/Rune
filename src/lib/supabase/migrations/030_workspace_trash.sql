-- ── Migration 030: Workspace Trash ──────────────────────────────────────────
--
-- Rune 2.0 Workspace, Milestone 13. Deletion of Workspace objects becomes
-- recoverable (architecture §26–27): a Page, Folder, Collection or Entry goes
-- to its Project's Trash, can be restored as the same object, and is destroyed
-- only by an explicit permanent deletion from Trash.
--
-- The model is object-level soft deletion. Nothing is copied: a trashed object
-- is its own row with `trashed_at` set, keeping its id, title, content,
-- version, property values, Views and references.
--
-- workspace_documents, workspace_folders, workspace_collections — NEW columns:
--   * trashed_at              — null = active; set = in Trash since then.
--   * trashed_from_folder_id  — the Folder (object id, not node id) it sat in
--                               when trashed; null = the top level.
--   * trashed_from_position   — its 1-based place among that parent's items.
--   Both trashed_from_* are null whenever trashed_at is (…_trash_check). They
--   say where to restore it; there is no foreign key, because the Folder may
--   later be trashed or deleted, and restoring then falls back to the top.
-- workspace_collection_entries — NEW column trashed_at. An Entry never leaves
--   its Collection, so it needs no place. An Entry is ACTIVE when it and its
--   Collection are both untrashed: trashing a Collection trashes its Entries
--   with it without writing them, so restoring it brings back exactly the
--   Entries that were active, and an Entry trashed on its own stays in Trash.
--
-- The Workspace tree: a trashed Page, Folder or Collection has NO node. Its
-- node is removed when it is trashed (siblings renumbered 1..n) and a new one
-- is made when it is restored, so every workspace_nodes row is an active
-- object's one canonical place (the unique target keys still hold, and no
-- tree function can reach a trashed object).
--
-- A Folder is navigation, not ownership (§11, §14): trashing a Folder trashes
-- only the Folder. Its items move up into its place — into the Folder's own
-- parent, where the Folder stood, in their order — and stay active. A
-- restored Folder comes back empty.
--
-- Visibility — the whole shell and every older client see only active objects,
-- because RLS says so:
--   * select / update policies of the four tables require the object to be
--     active (an Entry: its Collection too). Inserts must be active (an Entry:
--     into an active Collection). Clients therefore cannot read, rename, save
--     into, trash or restore a trashed object directly; a save into one that
--     was trashed in another window matches no row, and nothing is written.
--   * object_references: a reference is visible only while both of its ends
--     are active (workspace_object_active). A trashed object's references are
--     kept, dormant, and return with it; nothing is duplicated.
--   * search_project_content (029) skips trashed Pages and Entries explicitly.
--   Property definitions, values and Views stay readable (configuration of a
--   Collection, harmless without its Entries).
--
-- Writes through SECURITY DEFINER functions, which bypass RLS, are held to
-- active objects too:
--   * set_workspace_entry_value — refuses a trashed Entry (redefined).
--   * set_workspace_entry_relationship — refuses a trashed Entry or target,
--     and keeps a value's dormant targets (those in Trash) when the writer
--     edits the visible ones: the client never sees them, so it never sends
--     them. A one-value Relationship given a new target replaces a dormant one.
--   * guard_workspace_trash (trigger) — no new reference to or from a
--     trashed object; no property or View added to a trashed Collection; no
--     Relationship pointed at a trashed Collection.
--
-- Functions — NEW, SECURITY DEFINER, ownership checked against
-- projects.user_id = auth.uid(), under lock_project_workspace(). Types are
-- 'page' | 'folder' | 'collection' | 'entry'. Each returns
-- { status: 'ok', … } or { status: 'error', error } and writes nothing on an
-- error:
--   * trash_workspace_object(type, id) → { moved } (a Folder's items moved up)
--   * restore_workspace_object(type, id) → { location: 'original' | 'top' }
--       An Entry whose Collection is in Trash is refused ('Restore its
--       collection first'); it never becomes active outside its owner.
--   * delete_trashed_workspace_object(type, id) → { entries, properties }
--       Only an object in Trash. A Collection goes with all its Entries,
--       properties, values and Views; a Relationship of ANOTHER Collection
--       that points at it goes too (it can hold nothing any more). The
--       references from and to what is deleted go (ON DELETE CASCADE, 028);
--       the objects at their other ends never do.
--   * list_workspace_trash(project) → { items } — the Project's Trash, newest
--       first, with where each item came from.
--   * workspace_trash_state(type, id) → { state: 'active' | 'trashed' | 'missing' }
--       What a save that matched nothing ran into.
--
-- Unchanged: delete_workspace_folder and delete_workspace_collection (024–025,
-- empty only, used by the previous app), Project deletion (everything,
-- trashed or not, goes with the Project), and everything in the manuscript —
-- no Scene, Chapter, Group, Manuscript or Project table, function or policy
-- changes. Scenes have no Trash yet; a Scene end of a reference is always
-- active.
--
-- For the Rune 2.0 database only: it requires 029. Nothing existing is
-- trashed, so every existing row stays visible. Safe to apply before the app
-- deploy that uses it (the previous app only ever sees active objects, and
-- its reads and writes keep working); the new app offers no Trash until it is
-- applied.
-- Rollback (PERMANENTLY DELETES everything in Trash; restore first to keep it):
--   select public.delete_trashed_workspace_object(…) for each item, or
--   delete from public.workspace_collection_entries e using public.workspace_collections c
--    where e.collection_id = c.id and (e.trashed_at is not null or c.trashed_at is not null);
--   delete from public.workspace_collections where trashed_at is not null;
--   delete from public.workspace_documents where trashed_at is not null;
--   delete from public.workspace_folders where trashed_at is not null;
--   drop the functions and triggers below; restore 023–029's policies,
--   set_workspace_entry_value (026), set_workspace_entry_relationship (028)
--   and search_project_content (029); drop the trashed_* columns;
--   delete from public.schema_migrations where version = '030';
-- Apply as ONE script (psql -1, or the SQL editor).

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 030 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '030') then
    raise exception 'Migration 030 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '029') then
    raise exception 'Migration 030 requires migration 029 (project search). Nothing was changed.';
  end if;
  -- As in 024–028: the SECURITY DEFINER functions run as their owner, which
  -- must own the Workspace tables or they would be subject to RLS.
  if (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.workspace_nodes'::regclass) <> current_user then
    raise exception 'Migration 030 must be applied by the owner of public.workspace_nodes (%, not %). Nothing was changed.',
      (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.workspace_nodes'::regclass), current_user;
  end if;
end
$$;

-- ── Columns ─────────────────────────────────────────────────────────────────

alter table public.workspace_documents
  add column trashed_at             timestamptz,
  add column trashed_from_folder_id uuid,
  add column trashed_from_position  integer;
alter table public.workspace_folders
  add column trashed_at             timestamptz,
  add column trashed_from_folder_id uuid,
  add column trashed_from_position  integer;
alter table public.workspace_collections
  add column trashed_at             timestamptz,
  add column trashed_from_folder_id uuid,
  add column trashed_from_position  integer;
alter table public.workspace_collection_entries
  add column trashed_at             timestamptz;

alter table public.workspace_documents add constraint workspace_documents_trash_check
  check ((trashed_at is not null or (trashed_from_folder_id is null and trashed_from_position is null))
     and (trashed_from_position is null or trashed_from_position > 0));
alter table public.workspace_folders add constraint workspace_folders_trash_check
  check ((trashed_at is not null or (trashed_from_folder_id is null and trashed_from_position is null))
     and (trashed_from_position is null or trashed_from_position > 0));
alter table public.workspace_collections add constraint workspace_collections_trash_check
  check ((trashed_at is not null or (trashed_from_folder_id is null and trashed_from_position is null))
     and (trashed_from_position is null or trashed_from_position > 0));

-- A Project's Trash, newest first.
create index workspace_documents_trashed_idx on public.workspace_documents using btree (project_id, trashed_at) where trashed_at is not null;
create index workspace_folders_trashed_idx on public.workspace_folders using btree (project_id, trashed_at) where trashed_at is not null;
create index workspace_collections_trashed_idx on public.workspace_collections using btree (project_id, trashed_at) where trashed_at is not null;
create index workspace_collection_entries_trashed_idx on public.workspace_collection_entries using btree (project_id, trashed_at) where trashed_at is not null;

-- ── Active objects ──────────────────────────────────────────────────────────

-- Whether an object is active (not in Trash). An Entry is active only while its
-- Collection is. A Scene has no Trash: always active. False for a missing
-- object. SECURITY INVOKER: under a writer's RLS it sees only their rows; in
-- the SECURITY DEFINER functions below it checks trashed_at itself.
create function public.workspace_object_active(p_type text, p_id uuid)
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
    when 'scene' then true
    else false
  end;
$function$;

revoke execute on function public.workspace_object_active(text, uuid) from public, anon;

-- ── Policies: active objects only ───────────────────────────────────────────

drop policy "workspace_documents: select own" on public.workspace_documents;
drop policy "workspace_documents: insert own" on public.workspace_documents;
drop policy "workspace_documents: update own" on public.workspace_documents;
create policy "workspace_documents: select own" on public.workspace_documents
  as permissive for select to authenticated
  using (workspace_documents.trashed_at is null
         and exists (select 1 from public.projects p
                     where p.id = workspace_documents.project_id and p.user_id = (select auth.uid())));
create policy "workspace_documents: insert own" on public.workspace_documents
  as permissive for insert to authenticated
  with check (workspace_documents.trashed_at is null
              and exists (select 1 from public.projects p
                          where p.id = workspace_documents.project_id and p.user_id = (select auth.uid())));
create policy "workspace_documents: update own" on public.workspace_documents
  as permissive for update to authenticated
  using (workspace_documents.trashed_at is null
         and exists (select 1 from public.projects p
                     where p.id = workspace_documents.project_id and p.user_id = (select auth.uid())))
  with check (workspace_documents.trashed_at is null
              and exists (select 1 from public.projects p
                          where p.id = workspace_documents.project_id and p.user_id = (select auth.uid())));

drop policy "workspace_folders: select own" on public.workspace_folders;
drop policy "workspace_folders: update own" on public.workspace_folders;
create policy "workspace_folders: select own" on public.workspace_folders
  as permissive for select to authenticated
  using (workspace_folders.trashed_at is null
         and exists (select 1 from public.projects p
                     where p.id = workspace_folders.project_id and p.user_id = (select auth.uid())));
create policy "workspace_folders: update own" on public.workspace_folders
  as permissive for update to authenticated
  using (workspace_folders.trashed_at is null
         and exists (select 1 from public.projects p
                     where p.id = workspace_folders.project_id and p.user_id = (select auth.uid())))
  with check (workspace_folders.trashed_at is null
              and exists (select 1 from public.projects p
                          where p.id = workspace_folders.project_id and p.user_id = (select auth.uid())));

drop policy "workspace_collections: select own" on public.workspace_collections;
drop policy "workspace_collections: update own" on public.workspace_collections;
create policy "workspace_collections: select own" on public.workspace_collections
  as permissive for select to authenticated
  using (workspace_collections.trashed_at is null
         and exists (select 1 from public.projects p
                     where p.id = workspace_collections.project_id and p.user_id = (select auth.uid())));
create policy "workspace_collections: update own" on public.workspace_collections
  as permissive for update to authenticated
  using (workspace_collections.trashed_at is null
         and exists (select 1 from public.projects p
                     where p.id = workspace_collections.project_id and p.user_id = (select auth.uid())))
  with check (workspace_collections.trashed_at is null
              and exists (select 1 from public.projects p
                          where p.id = workspace_collections.project_id and p.user_id = (select auth.uid())));

drop policy "workspace_collection_entries: select own" on public.workspace_collection_entries;
drop policy "workspace_collection_entries: insert own" on public.workspace_collection_entries;
drop policy "workspace_collection_entries: update own" on public.workspace_collection_entries;
create policy "workspace_collection_entries: select own" on public.workspace_collection_entries
  as permissive for select to authenticated
  using (workspace_collection_entries.trashed_at is null
         and exists (select 1 from public.workspace_collections c
                     join public.projects p on p.id = c.project_id
                     where c.id = workspace_collection_entries.collection_id and c.trashed_at is null
                       and p.id = workspace_collection_entries.project_id and p.user_id = (select auth.uid())));
create policy "workspace_collection_entries: insert own" on public.workspace_collection_entries
  as permissive for insert to authenticated
  with check (workspace_collection_entries.trashed_at is null
              and exists (select 1 from public.workspace_collections c
                          join public.projects p on p.id = c.project_id
                          where c.id = workspace_collection_entries.collection_id and c.trashed_at is null
                            and p.id = workspace_collection_entries.project_id and p.user_id = (select auth.uid())));
create policy "workspace_collection_entries: update own" on public.workspace_collection_entries
  as permissive for update to authenticated
  using (workspace_collection_entries.trashed_at is null
         and exists (select 1 from public.workspace_collections c
                     join public.projects p on p.id = c.project_id
                     where c.id = workspace_collection_entries.collection_id and c.trashed_at is null
                       and p.id = workspace_collection_entries.project_id and p.user_id = (select auth.uid())))
  with check (workspace_collection_entries.trashed_at is null
              and exists (select 1 from public.workspace_collections c
                          join public.projects p on p.id = c.project_id
                          where c.id = workspace_collection_entries.collection_id and c.trashed_at is null
                            and p.id = workspace_collection_entries.project_id and p.user_id = (select auth.uid())));

-- A reference is shown while both of its ends are active; in Trash it is kept, dormant.
drop policy "object_references: select own" on public.object_references;
create policy "object_references: select own" on public.object_references
  as permissive for select to authenticated
  using (exists (select 1 from public.projects p
                 where p.id = object_references.project_id and p.user_id = (select auth.uid()))
         and public.workspace_object_active(object_references.source_type,
               coalesce(object_references.source_entry_id, object_references.source_document_id, object_references.source_scene_id))
         and public.workspace_object_active(object_references.target_type,
               coalesce(object_references.target_entry_id, object_references.target_document_id, object_references.target_scene_id)));

-- ── Guards on SECURITY DEFINER writes ───────────────────────────────────────

-- Nothing new may attach to an object in Trash: no reference to or from one,
-- no property or View added to a trashed Collection, no Relationship pointed
-- at one. (Existing rows are untouched; this checks only what is being added.)
create function public.guard_workspace_trash()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if tg_table_name = 'object_references' then
    if not public.workspace_object_active(new.source_type, coalesce(new.source_entry_id, new.source_document_id, new.source_scene_id))
       or not public.workspace_object_active(new.target_type, coalesce(new.target_entry_id, new.target_document_id, new.target_scene_id)) then
      raise exception 'Nothing can be linked to or from an item in Trash' using errcode = 'check_violation';
    end if;
  elsif tg_table_name = 'workspace_collection_properties' then
    if tg_op = 'INSERT' and not public.workspace_object_active('collection', new.collection_id) then
      raise exception 'This collection is in Trash' using errcode = 'check_violation';
    end if;
    if new.relation_collection_id is not null
       and (tg_op = 'INSERT' or new.relation_collection_id is distinct from old.relation_collection_id)
       and not public.workspace_object_active('collection', new.relation_collection_id) then
      raise exception 'That collection is in Trash' using errcode = 'check_violation';
    end if;
  elsif tg_table_name = 'workspace_collection_views' then
    if not public.workspace_object_active('collection', new.collection_id) then
      raise exception 'This collection is in Trash' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$function$;

revoke execute on function public.guard_workspace_trash() from public, anon;

create trigger object_references_guard_trash before insert on public.object_references
  for each row execute function public.guard_workspace_trash();
create trigger workspace_collection_properties_guard_trash before insert or update of relation_collection_id on public.workspace_collection_properties
  for each row execute function public.guard_workspace_trash();
create trigger workspace_collection_views_guard_trash before insert on public.workspace_collection_views
  for each row execute function public.guard_workspace_trash();

-- As 026, except that a trashed Entry is not found: a window still showing it
-- cannot change (or clear) its values.
create or replace function public.set_workspace_entry_value(p_entry_id uuid, p_property_id uuid, p_value jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_entry public.workspace_collection_entries%rowtype;
  v_property public.workspace_collection_properties%rowtype;
  v_value jsonb := p_value;
begin
  select e.* into v_entry
    from public.workspace_collection_entries e
    join public.projects p on p.id = e.project_id
   where e.id = p_entry_id and p.user_id = auth.uid();
  if not found or not public.workspace_object_active('entry', p_entry_id) then
    return jsonb_build_object('status', 'error', 'error', 'Entry not found');
  end if;
  -- Only a property of the Entry's own Collection.
  select * into v_property from public.workspace_collection_properties pr
   where pr.id = p_property_id and pr.collection_id = v_entry.collection_id;
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Property not found');
  end if;

  if v_property.type = 'text' and jsonb_typeof(v_value) = 'string' then
    v_value := to_jsonb(btrim(v_value #>> '{}'));
  elsif v_property.type = 'multi_select' and jsonb_typeof(v_value) = 'array' then
    -- Duplicates collapse, first occurrence kept.
    v_value := coalesce((select jsonb_agg(x order by i)
                           from (select x, min(i) as i from jsonb_array_elements(v_value) with ordinality as t(x, i) group by x) d),
                        '[]'::jsonb);
  end if;

  if v_value is null or v_value = 'null'::jsonb or v_value = '""'::jsonb or v_value = '[]'::jsonb or v_value = 'false'::jsonb then
    delete from public.workspace_entry_values v where v.entry_id = p_entry_id and v.property_id = p_property_id;
    return jsonb_build_object('status', 'ok', 'value', null);
  end if;
  if not public.workspace_property_value_valid(v_property.type, v_property.options, v_value) then
    return jsonb_build_object('status', 'error', 'error', 'Invalid value');
  end if;

  insert into public.workspace_entry_values (entry_id, property_id, collection_id, project_id, value)
  values (p_entry_id, p_property_id, v_entry.collection_id, v_entry.project_id, v_value)
  on conflict (entry_id, property_id) do update set value = excluded.value;
  return jsonb_build_object('status', 'ok', 'value', v_value);
end;
$function$;

-- As 028, with Trash: the Entry and every new target must be active, and a
-- value's dormant targets (in Trash — never shown, so never sent) are kept
-- after the visible ones, to come back when restored. A one-value
-- Relationship given a new target replaces a dormant one.
create or replace function public.set_workspace_entry_relationship(p_entry_id uuid, p_property_id uuid, p_target_ids uuid[])
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_entry public.workspace_collection_entries%rowtype;
  v_property public.workspace_collection_properties%rowtype;
  v_targets uuid[];
  v_bad integer;
begin
  select e.* into v_entry
    from public.workspace_collection_entries e
    join public.projects p on p.id = e.project_id
   where e.id = p_entry_id and p.user_id = auth.uid();
  if not found or not public.workspace_object_active('entry', p_entry_id) then
    return jsonb_build_object('status', 'error', 'error', 'Entry not found');
  end if;
  perform public.lock_project_workspace(v_entry.project_id);
  select * into v_property from public.workspace_collection_properties pr
   where pr.id = p_property_id and pr.collection_id = v_entry.collection_id and pr.type = 'relationship';
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Property not found');
  end if;

  v_targets := coalesce((select array_agg(t order by i)
                           from (select t, min(i) as i from unnest(coalesce(p_target_ids, '{}')) with ordinality as u(t, i)
                                  where t is not null group by t) d), '{}');
  if cardinality(v_targets) > 1 and not v_property.relation_many then
    return jsonb_build_object('status', 'error', 'error', 'This relationship holds one value');
  end if;
  if cardinality(v_targets) > 500 then
    return jsonb_build_object('status', 'error', 'error', 'Too many values');
  end if;
  if p_entry_id = any (v_targets) then
    return jsonb_build_object('status', 'error', 'error', 'An entry cannot point to itself');
  end if;
  select count(*) into v_bad
    from unnest(v_targets) t
   where not public.workspace_object_active(v_property.relation_target, t)
      or case v_property.relation_target
           when 'entry' then not exists (select 1 from public.workspace_collection_entries e
                                          where e.id = t and e.collection_id = v_property.relation_collection_id
                                            and e.project_id = v_entry.project_id)
           else public.reference_object_project(v_property.relation_target, t) is distinct from v_entry.project_id
         end;
  if v_bad > 0 then
    return jsonb_build_object('status', 'error', 'error', 'Not a valid target');
  end if;

  -- Visible targets no longer chosen go; dormant ones stay, unless a one-value
  -- Relationship is being given a new target.
  delete from public.object_references r
   where r.property_id = p_property_id and r.source_entry_id = p_entry_id
     and not (coalesce(r.target_entry_id, r.target_document_id, r.target_scene_id) = any (v_targets))
     and (public.workspace_object_active(r.target_type, coalesce(r.target_entry_id, r.target_document_id, r.target_scene_id))
          or (not v_property.relation_many and cardinality(v_targets) > 0));
  update public.object_references r
     set position = o.ord
    from unnest(v_targets) with ordinality as o(t, ord)
   where r.property_id = p_property_id and r.source_entry_id = p_entry_id
     and coalesce(r.target_entry_id, r.target_document_id, r.target_scene_id) = o.t
     and r.position <> o.ord;
  -- Dormant targets after the visible ones, in their order.
  update public.object_references r
     set position = cardinality(v_targets) + d.ord
    from (select x.id, row_number() over (order by x.position, x.id) as ord
            from public.object_references x
           where x.property_id = p_property_id and x.source_entry_id = p_entry_id
             and not (coalesce(x.target_entry_id, x.target_document_id, x.target_scene_id) = any (v_targets))) d
   where r.id = d.id and r.position <> cardinality(v_targets) + d.ord;
  insert into public.object_references
    (project_id, source_type, source_entry_id, target_type, target_entry_id, target_document_id, target_scene_id, property_id, position)
  select v_entry.project_id, 'entry', p_entry_id, v_property.relation_target,
         case when v_property.relation_target = 'entry' then o.t end,
         case when v_property.relation_target = 'page' then o.t end,
         case when v_property.relation_target = 'scene' then o.t end,
         p_property_id, o.ord
    from unnest(v_targets) with ordinality as o(t, ord)
   where not exists (select 1 from public.object_references r
                      where r.property_id = p_property_id and r.source_entry_id = p_entry_id
                        and coalesce(r.target_entry_id, r.target_document_id, r.target_scene_id) = o.t);

  return jsonb_build_object('status', 'ok', 'targets', to_jsonb(v_targets));
end;
$function$;

-- As 029, except that Pages and Entries in Trash (an Entry's Collection
-- included) are never searched. RLS already hides them; this says so.
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

-- ── Trash functions ─────────────────────────────────────────────────────────

-- The Project of a Workspace object of `p_type` that `auth.uid()` owns, or null.
-- Internal.
create function public.owned_workspace_object_project(p_type text, p_id uuid)
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
     end;
$function$;

revoke execute on function public.owned_workspace_object_project(text, uuid) from public, anon, authenticated;

-- Moves one active Page, Folder, Collection or Entry to Trash. A Page, Folder
-- or Collection leaves the tree (its node goes; its siblings close the gap),
-- remembering where it was. A Folder's items first move up into its place.
-- Nothing else changes: content, version, values, Views and references stay.
create function public.trash_workspace_object(p_type text, p_id uuid)
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

-- Brings one object back from Trash as the same object. A Page, Folder or
-- Collection returns to the Folder and place it left if that Folder is still
-- active ('original'), and otherwise to the end of the top level ('top'). A
-- restored Folder is empty: its items stayed where they moved to. An Entry
-- returns to its Collection — only while that Collection is active.
create function public.restore_workspace_object(p_type text, p_id uuid)
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

-- Permanently deletes one object that is in Trash. Irreversible. A Collection
-- goes with all its Entries (those in Trash on their own included), its
-- properties, values and Views, and with any Relationship of another
-- Collection that points at it. Every reference from or to what is deleted
-- goes with it (028's ON DELETE CASCADE) — never the object at the other end.
create function public.delete_trashed_workspace_object(p_type text, p_id uuid)
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

-- A Project's Trash, newest first: every Page, Folder and Collection in Trash,
-- and every Entry trashed on its own (an Entry of a trashed Collection that
-- was not is inside that Collection's item). Each with where it came from.
-- Titles and counts only, never content.
create function public.list_workspace_trash(p_project_id uuid)
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
               null::integer as entries, null::integer as properties
          from public.workspace_documents d
          left join public.workspace_folders ff on ff.id = d.trashed_from_folder_id
         where d.project_id = p_project_id and d.trashed_at is not null
        union all
        select 'folder', f.id, f.title, f.trashed_at,
               f.trashed_from_folder_id, ff.title, (ff.id is not null and ff.trashed_at is null),
               null, null, null, null, null
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
          from public.workspace_collections c
          left join public.workspace_folders ff on ff.id = c.trashed_from_folder_id
         where c.project_id = p_project_id and c.trashed_at is not null
        union all
        select 'entry', e.id, e.title, e.trashed_at,
               null, null, null,
               c.id, c.title, c.trashed_at is null,
               null, null
          from public.workspace_collection_entries e
          join public.workspace_collections c on c.id = e.collection_id
         where e.project_id = p_project_id and e.trashed_at is not null
      ) t), '[]'::jsonb));
end;
$function$;

-- Whether an object is active, in Trash, or gone (or not this writer's) — for
-- a save that matched no row.
create function public.workspace_trash_state(p_type text, p_id uuid)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
begin
  if p_type is null or p_type not in ('page', 'folder', 'collection', 'entry')
     or public.owned_workspace_object_project(p_type, p_id) is null then
    return jsonb_build_object('status', 'ok', 'state', 'missing');
  end if;
  return jsonb_build_object('status', 'ok', 'state',
    case when public.workspace_object_active(p_type, p_id) then 'active' else 'trashed' end);
end;
$function$;

revoke execute on function public.trash_workspace_object(text, uuid) from public, anon;
revoke execute on function public.restore_workspace_object(text, uuid) from public, anon;
revoke execute on function public.delete_trashed_workspace_object(text, uuid) from public, anon;
revoke execute on function public.list_workspace_trash(uuid) from public, anon;
revoke execute on function public.workspace_trash_state(text, uuid) from public, anon;

insert into public.schema_migrations (version, name, applied_at, note)
values ('030', '030_workspace_trash.sql', now(), 'Workspace Trash: object-level soft deletion (trashed_at, and for tree objects where they came from) of Pages, Folders, Collections and Entries; a trashed tree object has no node; RLS shows active objects only, and references only while both ends are active; trash / restore / permanent delete / list / state RPCs; set_workspace_entry_value, set_workspace_entry_relationship and search_project_content respect Trash; no manuscript change');
