-- ── Migration 028: References, Relationship properties, Backlinks ───────────
--
-- Rune 2.0 Workspace, Milestone 11. The connection layer between creative
-- objects (architecture §17, §20–24, §27): "Nerai → Affiliation →
-- Drelareth", "Worldbuilding Notes → references → Var-Zal", "Scene 12 →
-- Nerai". A reference is its own thing — not structure (Chapter → Scene), not
-- placement (a Workspace node), not a View — and it never copies or merges the
-- objects it joins: both ends are canonical ids, so a rename changes nothing
-- here and every title is read from its object.
--
-- public.object_references — NEW. One row is one forward reference from a
-- source object to a target object of the same Project. Backlinks are never
-- stored: an object's backlinks are the rows whose target it is.
--   * source and target: an Entry, a Workspace Page or a Scene —
--       source_type / target_type: 'entry' | 'page' | 'scene', and exactly
--       the matching one of *_entry_id, *_document_id, *_scene_id set (the
--       workspace_nodes pattern), each a real foreign key. Chapters, Groups
--       and Collections can join as one more type and column each.
--   * project_id: both ends' Project. Entries and Pages are held to it by
--     composite FKs; a Scene (which has no project_id) by the check trigger
--     through its Manuscript. No reference ever crosses Projects or writers.
--   * property_id: null for a generic reference; otherwise the row is one
--     value of that Relationship property of the source Entry's Collection,
--     and the target must be what the property allows (checked on write).
--   * position: the order of the source's references (per property, and
--     among its generic ones). Rows keep their ends for life.
--   * No object references itself; a source references a target at most once
--     per property (and once generically).
--   Deleting an object PERMANENTLY deletes the references from and to it
--   (ON DELETE CASCADE) — never the object at the other end (§27: no
--   cascading semantic deletion). Nothing can delete a Page, Entry or Scene
--   through the app today; a future Trash keeps a trashed object's row, so its
--   references stay, dormant, and come back with it on restore.
--
-- public.workspace_collection_properties — CHANGED:
--   * type may now be 'relationship' (workspace_collection_properties_type_check).
--   * relation_target: 'entry' | 'page' | 'scene' — set exactly for a
--     Relationship. relation_collection_id: the Collection whose Entries it
--     points to (target 'entry' only), in the same Project (composite FK; if
--     that Collection — only ever an empty one — is deleted, the property
--     goes with it: it can hold no value). relation_many: whether an Entry
--     may hold several (false for every other type).
--   A Relationship's values are rows of object_references, never rows of
--   workspace_entry_values (workspace_property_value_valid is false for it).
-- public.workspace_collection_entries — CHANGED: unique (id, project_id), for
-- the references' composite FKs.
--
-- Views: a Relationship property can be shown and filtered empty / not empty
-- like any other; it is not sortable or groupable
-- (prune_workspace_view_config — the one rule changed).
--
-- Writes: clients only READ object_references (RLS: the Project's owner).
-- Every change goes through a SECURITY DEFINER function, which checks
-- ownership against projects.user_id = auth.uid():
--   * create_workspace_relationship_property(collection, name, target, target_collection, many) → { property }
--   * update_workspace_relationship_property(property, changes jsonb) → { property }
--       changes: any of many, target, target_collection_id. The target
--       changes only while no Entry holds a value; "one" only while none
--       holds several. (Name and order: update/move_workspace_collection_property.)
--   * set_workspace_entry_relationship(entry, property, targets uuid[]) → { targets }
--       the whole value, in order; [] clears it.
--   * add_object_reference(source_type, source_id, target_type, target_id) → { reference }
--   * remove_object_reference(reference) — generic references only.
--   delete_workspace_collection_property now also counts a Relationship's
--   values (Entries holding one) for its confirmation.
--
-- Nothing here touches a Scene, Chapter, Group, Manuscript or Project row, a
-- Scene's content or version, the save path, or any manuscript function or
-- policy. A reference from or to a Scene lives only in object_references.
--
-- For the Rune 2.0 database only: it requires 027. Apply BEFORE the app deploy
-- that uses it. The previous app never reads the new table or columns; the new
-- app offers no Relationship, link or backlink until this is applied.
-- Rollback (drops every reference and every Relationship property with it):
--   delete from public.workspace_collection_properties where type = 'relationship';
--   drop table public.object_references;
--   alter table public.workspace_collection_properties drop constraint workspace_collection_properties_relation_target_fkey;
--   alter table public.workspace_collection_properties drop constraint workspace_collection_properties_relation_check;
--   alter table public.workspace_collection_properties drop column relation_target, drop column relation_collection_id, drop column relation_many;
--   alter table public.workspace_collection_properties drop constraint workspace_collection_properties_type_check;
--   alter table public.workspace_collection_properties add constraint workspace_collection_properties_type_check
--     check (type in ('text', 'number', 'select', 'multi_select', 'status', 'date', 'checkbox'));
--   alter table public.workspace_collection_entries drop constraint workspace_collection_entries_id_project_id_key;
--   drop function public.create_workspace_relationship_property(uuid, text, text, uuid, boolean);
--   drop function public.update_workspace_relationship_property(uuid, jsonb);
--   drop function public.set_workspace_entry_relationship(uuid, uuid, uuid[]);
--   drop function public.add_object_reference(text, uuid, text, uuid);
--   drop function public.remove_object_reference(uuid);
--   drop function public.check_object_reference();
--   drop function public.reference_object_project(text, uuid);
--   then re-create delete_workspace_collection_property and
--   prune_workspace_view_config exactly as 026 and 027 define them.
--   delete from public.schema_migrations where version = '028';
-- Apply as ONE script (psql -1, or the SQL editor).

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 028 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '028') then
    raise exception 'Migration 028 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '027') then
    raise exception 'Migration 028 requires migration 027 (collection views). Nothing was changed.';
  end if;
  -- As in 024–027: the SECURITY DEFINER functions run as their owner, which
  -- must own the Workspace tables or they would be subject to RLS.
  if (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.workspace_collections'::regclass) <> current_user then
    raise exception 'Migration 028 must be applied by the owner of public.workspace_collections (%, not %). Nothing was changed.',
      (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.workspace_collections'::regclass), current_user;
  end if;
end
$$;

-- ── Relationship properties ─────────────────────────────────────────────────

alter table public.workspace_collection_properties
  add column relation_target        text,
  add column relation_collection_id uuid,
  add column relation_many          boolean default false not null;

alter table public.workspace_collection_properties drop constraint workspace_collection_properties_type_check;
alter table public.workspace_collection_properties add constraint workspace_collection_properties_type_check
  check (type in ('text', 'number', 'select', 'multi_select', 'status', 'date', 'checkbox', 'relationship'));
-- A Relationship says what it points to; nothing else does.
alter table public.workspace_collection_properties add constraint workspace_collection_properties_relation_check
  check ((type = 'relationship') = (relation_target is not null)
     and (relation_target is null or relation_target in ('entry', 'page', 'scene'))
     and (relation_collection_id is not null) = (coalesce(relation_target, '') = 'entry')
     and (type = 'relationship' or not relation_many));
alter table public.workspace_collection_properties add constraint workspace_collection_properties_relation_target_fkey
  foreign key (relation_collection_id, project_id) references public.workspace_collections(id, project_id) on delete cascade;

create index workspace_collection_properties_relation_collection_id_idx
  on public.workspace_collection_properties using btree (relation_collection_id);

-- ── References ──────────────────────────────────────────────────────────────

-- The references' foreign keys name an Entry together with its Project.
alter table public.workspace_collection_entries add constraint workspace_collection_entries_id_project_id_key unique (id, project_id);

create table public.object_references (
  id                  uuid        default gen_random_uuid() not null,
  project_id          uuid        not null,                         -- both ends' Project
  source_type         text        not null,
  source_entry_id     uuid,
  source_document_id  uuid,
  source_scene_id     uuid,
  target_type         text        not null,
  target_entry_id     uuid,
  target_document_id  uuid,
  target_scene_id     uuid,
  property_id         uuid,                                         -- null: a generic reference
  position            integer     not null,
  created_at          timestamptz default now() not null
);

alter table public.object_references add constraint object_references_pkey primary key (id);
alter table public.object_references add constraint object_references_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete cascade;
alter table public.object_references add constraint object_references_source_type_check
  check (source_type in ('entry', 'page', 'scene'));
alter table public.object_references add constraint object_references_target_type_check
  check (target_type in ('entry', 'page', 'scene'));
alter table public.object_references add constraint object_references_source_matches_type
  check (source_type = 'entry' and source_entry_id is not null and source_document_id is null and source_scene_id is null
      or source_type = 'page' and source_document_id is not null and source_entry_id is null and source_scene_id is null
      or source_type = 'scene' and source_scene_id is not null and source_entry_id is null and source_document_id is null);
alter table public.object_references add constraint object_references_target_matches_type
  check (target_type = 'entry' and target_entry_id is not null and target_document_id is null and target_scene_id is null
      or target_type = 'page' and target_document_id is not null and target_entry_id is null and target_scene_id is null
      or target_type = 'scene' and target_scene_id is not null and target_entry_id is null and target_document_id is null);
alter table public.object_references add constraint object_references_not_self
  check (source_entry_id is distinct from target_entry_id or source_entry_id is null);
alter table public.object_references add constraint object_references_not_self_page
  check (source_document_id is distinct from target_document_id or source_document_id is null);
alter table public.object_references add constraint object_references_not_self_scene
  check (source_scene_id is distinct from target_scene_id or source_scene_id is null);
-- Only an Entry holds property values.
alter table public.object_references add constraint object_references_property_from_entry
  check (property_id is null or source_type = 'entry');
alter table public.object_references add constraint object_references_position_check
  check (position > 0);
-- Once per source, target and property (and once generically).
alter table public.object_references add constraint object_references_once_key
  unique nulls not distinct (source_entry_id, source_document_id, source_scene_id,
                             target_entry_id, target_document_id, target_scene_id, property_id);

-- Both ends in this Project (a Scene's is checked by the trigger), and a
-- permanently deleted end takes the row — never the other end — with it.
alter table public.object_references add constraint object_references_source_entry_same_project_fkey
  foreign key (source_entry_id, project_id) references public.workspace_collection_entries(id, project_id) on delete cascade;
alter table public.object_references add constraint object_references_source_document_same_project_fkey
  foreign key (source_document_id, project_id) references public.workspace_documents(id, project_id) on delete cascade;
alter table public.object_references add constraint object_references_source_scene_id_fkey
  foreign key (source_scene_id) references public.scenes(id) on delete cascade;
alter table public.object_references add constraint object_references_target_entry_same_project_fkey
  foreign key (target_entry_id, project_id) references public.workspace_collection_entries(id, project_id) on delete cascade;
alter table public.object_references add constraint object_references_target_document_same_project_fkey
  foreign key (target_document_id, project_id) references public.workspace_documents(id, project_id) on delete cascade;
alter table public.object_references add constraint object_references_target_scene_id_fkey
  foreign key (target_scene_id) references public.scenes(id) on delete cascade;
-- A Relationship's values go with it (delete_workspace_collection_property confirms how many).
alter table public.object_references add constraint object_references_property_id_fkey
  foreign key (property_id) references public.workspace_collection_properties(id) on delete cascade;

create index object_references_project_id_idx on public.object_references using btree (project_id);
create index object_references_property_id_idx on public.object_references using btree (property_id) where property_id is not null;
-- Backlinks: by target. Sources are covered by the unique key's leading columns
-- only for Entries, so Pages and Scenes get their own.
create index object_references_target_entry_id_idx on public.object_references using btree (target_entry_id) where target_entry_id is not null;
create index object_references_target_document_id_idx on public.object_references using btree (target_document_id) where target_document_id is not null;
create index object_references_target_scene_id_idx on public.object_references using btree (target_scene_id) where target_scene_id is not null;
create index object_references_source_document_id_idx on public.object_references using btree (source_document_id) where source_document_id is not null;
create index object_references_source_scene_id_idx on public.object_references using btree (source_scene_id) where source_scene_id is not null;

-- The Project an object of a reference type belongs to (a Scene's through its
-- Manuscript), or null if there is no such object.
create function public.reference_object_project(p_type text, p_id uuid)
 returns uuid
 language sql
 stable
 set search_path to ''
as $function$
  select case p_type
    when 'entry' then (select e.project_id from public.workspace_collection_entries e where e.id = p_id)
    when 'page'  then (select d.project_id from public.workspace_documents d where d.id = p_id)
    when 'scene' then (select m.project_id from public.scenes s join public.manuscripts m on m.id = s.manuscript_id where s.id = p_id)
  end;
$function$;

revoke execute on function public.reference_object_project(text, uuid) from public, anon;

-- Both ends in the reference's Project; a Relationship value is one its
-- property allows; a reference keeps its ends for life (only its position moves).
create function public.check_object_reference()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare
  v_property public.workspace_collection_properties%rowtype;
begin
  if tg_op = 'UPDATE' then
    if (new.project_id, new.source_type, new.source_entry_id, new.source_document_id, new.source_scene_id,
        new.target_type, new.target_entry_id, new.target_document_id, new.target_scene_id, new.property_id)
       is distinct from
       (old.project_id, old.source_type, old.source_entry_id, old.source_document_id, old.source_scene_id,
        old.target_type, old.target_entry_id, old.target_document_id, old.target_scene_id, old.property_id) then
      raise exception 'A reference keeps its source, target and property for life' using errcode = 'check_violation';
    end if;
    new.id := old.id;
    new.created_at := old.created_at;
    return new;
  end if;

  if public.reference_object_project(new.source_type, coalesce(new.source_entry_id, new.source_document_id, new.source_scene_id))
       is distinct from new.project_id
     or public.reference_object_project(new.target_type, coalesce(new.target_entry_id, new.target_document_id, new.target_scene_id))
       is distinct from new.project_id then
    raise exception 'Both ends of a reference must be in its Project' using errcode = 'check_violation';
  end if;

  if new.property_id is not null then
    select pr.* into v_property
      from public.workspace_collection_properties pr
      join public.workspace_collection_entries e on e.collection_id = pr.collection_id
     where pr.id = new.property_id and e.id = new.source_entry_id and pr.type = 'relationship';
    if not found then
      raise exception 'Not a Relationship property of the Entry''s Collection' using errcode = 'check_violation';
    end if;
    if new.target_type <> v_property.relation_target
       or (v_property.relation_target = 'entry'
           and not exists (select 1 from public.workspace_collection_entries t
                            where t.id = new.target_entry_id and t.collection_id = v_property.relation_collection_id)) then
      raise exception 'The Relationship "%" cannot point to that', v_property.name using errcode = 'check_violation';
    end if;
    if not v_property.relation_many
       and exists (select 1 from public.object_references r
                    where r.property_id = new.property_id and r.source_entry_id = new.source_entry_id) then
      raise exception 'The Relationship "%" holds one value', v_property.name using errcode = 'check_violation';
    end if;
  end if;

  new.created_at := now();
  return new;
end;
$function$;

revoke execute on function public.check_object_reference() from public, anon;

create trigger object_references_forbid_project_reassignment before update of project_id on public.object_references
  for each row execute function public.forbid_project_reassignment();
create trigger object_references_check before insert or update on public.object_references
  for each row execute function public.check_object_reference();

alter table public.object_references enable row level security;

create policy "object_references: select own" on public.object_references
  as permissive for select to authenticated
  using (exists (select 1 from public.projects p
                 where p.id = object_references.project_id and p.user_id = (select auth.uid())));

revoke insert, update, delete on public.object_references from anon, authenticated;

-- ── Views: a Relationship is shown and filtered, never sorted or grouped ───

-- As 027, except that sort skips a Relationship as it skips a multi-select.
create or replace function public.prune_workspace_view_config(p_collection_id uuid, p_config jsonb)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  with c as (select public.normalize_workspace_view_config(p_config) as v),
  props as (
    select p.id::text as id, p.type, p.options
      from public.workspace_collection_properties p
     where p.collection_id = p_collection_id
  )
  select jsonb_build_object(
    'properties', coalesce((
        select jsonb_agg(x order by i)
          from c, jsonb_array_elements(c.v -> 'properties') with ordinality as t(x, i)
         where exists (select 1 from props where props.id = x #>> '{}')), '[]'::jsonb),
    'sort', (
        select case
                 when jsonb_typeof(c.v -> 'sort') <> 'object' then 'null'::jsonb
                 when c.v -> 'sort' ->> 'by' = 'title' then c.v -> 'sort'
                 when exists (select 1 from props where props.id = c.v -> 'sort' ->> 'by' and props.type not in ('multi_select', 'relationship'))
                   then c.v -> 'sort'
                 else 'null'::jsonb
               end
          from c),
    'filters', coalesce((
        select jsonb_agg(f order by i)
          from c, jsonb_array_elements(c.v -> 'filters') with ordinality as t(f, i)
         where exists (
                 select 1 from props
                  where props.id = f ->> 'property'
                    and ((f ->> 'op') in ('is_empty', 'is_not_empty')
                         or (props.type in ('select', 'status', 'multi_select')
                             and exists (select 1 from jsonb_array_elements(props.options) o where o -> 'id' = f -> 'value'))))), '[]'::jsonb),
    'group_by', (
        select case
                 when exists (select 1 from props where props.id = c.v ->> 'group_by' and props.type in ('select', 'status'))
                   then c.v -> 'group_by'
                 else 'null'::jsonb
               end
          from c))
  from c;
$function$;

-- ── Functions ───────────────────────────────────────────────────────────────

-- Adds a Relationship property at the end of a Collection's properties.
-- p_target: 'entry' (with p_target_collection_id, a Collection of the same
-- Project — the Collection itself included), 'page' or 'scene'.
create function public.create_workspace_relationship_property(
  p_collection_id uuid, p_name text, p_target text, p_target_collection_id uuid, p_many boolean)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_project_id uuid;
  v_name text := left(btrim(coalesce(p_name, '')), 100);
  v_property public.workspace_collection_properties%rowtype;
begin
  -- SECURITY DEFINER: ownership is checked here, not by RLS.
  select c.project_id into v_project_id
    from public.workspace_collections c
    join public.projects p on p.id = c.project_id
   where c.id = p_collection_id and p.user_id = auth.uid();
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Collection not found');
  end if;
  perform public.lock_project_workspace(v_project_id);

  if v_name = '' then
    return jsonb_build_object('status', 'error', 'error', 'A property needs a name');
  end if;
  if p_target is null or p_target not in ('entry', 'page', 'scene') then
    return jsonb_build_object('status', 'error', 'error', 'Unknown relationship target');
  end if;
  if p_target = 'entry' then
    if not exists (select 1 from public.workspace_collections c
                    where c.id = p_target_collection_id and c.project_id = v_project_id) then
      return jsonb_build_object('status', 'error', 'error', 'Target collection not found');
    end if;
  elsif p_target_collection_id is not null then
    return jsonb_build_object('status', 'error', 'error', 'Only an Entry relationship names a collection');
  end if;
  if exists (select 1 from public.workspace_collection_properties p
              where p.collection_id = p_collection_id and lower(p.name) = lower(v_name)) then
    return jsonb_build_object('status', 'error', 'error', 'A property with this name already exists');
  end if;

  insert into public.workspace_collection_properties
    (collection_id, project_id, name, type, position, shown_in_list, relation_target, relation_collection_id, relation_many)
  select p_collection_id, v_project_id, v_name, 'relationship',
         coalesce(max(p.position), 0) + 1,
         count(*) filter (where p.shown_in_list) < 3,
         p_target, p_target_collection_id, coalesce(p_many, true)
    from public.workspace_collection_properties p
   where p.collection_id = p_collection_id
  returning * into v_property;

  return jsonb_build_object('status', 'ok', 'property', to_jsonb(v_property));
end;
$function$;

-- Changes what a Relationship points to and how many it holds. changes: any
-- of many (boolean), target, target_collection_id. The target only while no
-- Entry holds a value (nothing is ever silently dropped); one-only while no
-- Entry holds more than one.
create function public.update_workspace_relationship_property(p_property_id uuid, p_changes jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_old public.workspace_collection_properties%rowtype;
  v_new public.workspace_collection_properties%rowtype;
  v_key text;
begin
  select pr.* into v_old
    from public.workspace_collection_properties pr
    join public.projects p on p.id = pr.project_id
   where pr.id = p_property_id and p.user_id = auth.uid() and pr.type = 'relationship';
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Property not found');
  end if;
  perform public.lock_project_workspace(v_old.project_id);
  select * into v_old from public.workspace_collection_properties where id = p_property_id;
  v_new := v_old;

  if jsonb_typeof(p_changes) is distinct from 'object' then
    return jsonb_build_object('status', 'error', 'error', 'Nothing to change');
  end if;
  for v_key in select jsonb_object_keys(p_changes) loop
    if v_key not in ('many', 'target', 'target_collection_id') then
      return jsonb_build_object('status', 'error', 'error', format('Unknown change: %s', v_key));
    end if;
  end loop;

  if p_changes ? 'many' then
    if jsonb_typeof(p_changes -> 'many') is distinct from 'boolean' then
      return jsonb_build_object('status', 'error', 'error', 'many must be true or false');
    end if;
    v_new.relation_many := (p_changes ->> 'many')::boolean;
    if not v_new.relation_many and exists (
         select 1 from public.object_references r where r.property_id = p_property_id
          group by r.source_entry_id having count(*) > 1) then
      return jsonb_build_object('status', 'error', 'error', 'Some entries hold more than one');
    end if;
  end if;

  if p_changes ? 'target' or p_changes ? 'target_collection_id' then
    v_new.relation_target := coalesce(p_changes ->> 'target', v_old.relation_target);
    v_new.relation_collection_id := case when v_new.relation_target = 'entry'
                                         then coalesce((p_changes ->> 'target_collection_id')::uuid, v_old.relation_collection_id)
                                         else null end;
    if v_new.relation_target not in ('entry', 'page', 'scene') then
      return jsonb_build_object('status', 'error', 'error', 'Unknown relationship target');
    end if;
    if v_new.relation_target = 'entry'
       and not exists (select 1 from public.workspace_collections c
                        where c.id = v_new.relation_collection_id and c.project_id = v_old.project_id) then
      return jsonb_build_object('status', 'error', 'error', 'Target collection not found');
    end if;
    if (v_new.relation_target, v_new.relation_collection_id) is distinct from (v_old.relation_target, v_old.relation_collection_id)
       and exists (select 1 from public.object_references r where r.property_id = p_property_id) then
      return jsonb_build_object('status', 'error', 'error', 'Clear its values before changing what it points to');
    end if;
  end if;

  update public.workspace_collection_properties
     set relation_target = v_new.relation_target,
         relation_collection_id = v_new.relation_collection_id,
         relation_many = v_new.relation_many
   where id = p_property_id
  returning * into v_new;
  return jsonb_build_object('status', 'ok', 'property', to_jsonb(v_new));
end;
$function$;

-- Sets one Entry's whole value for one Relationship property of its own
-- Collection: the targets, in order (duplicates collapse, first kept); []
-- or null clears it. Every target must be what the property allows, in the
-- same Project, and not the Entry itself — or nothing changes.
create function public.set_workspace_entry_relationship(p_entry_id uuid, p_property_id uuid, p_target_ids uuid[])
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
  if not found then
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
   where case v_property.relation_target
           when 'entry' then not exists (select 1 from public.workspace_collection_entries e
                                          where e.id = t and e.collection_id = v_property.relation_collection_id
                                            and e.project_id = v_entry.project_id)
           else public.reference_object_project(v_property.relation_target, t) is distinct from v_entry.project_id
         end;
  if v_bad > 0 then
    return jsonb_build_object('status', 'error', 'error', 'Not a valid target');
  end if;

  delete from public.object_references r
   where r.property_id = p_property_id and r.source_entry_id = p_entry_id
     and not (coalesce(r.target_entry_id, r.target_document_id, r.target_scene_id) = any (v_targets));
  update public.object_references r
     set position = o.ord
    from unnest(v_targets) with ordinality as o(t, ord)
   where r.property_id = p_property_id and r.source_entry_id = p_entry_id
     and coalesce(r.target_entry_id, r.target_document_id, r.target_scene_id) = o.t
     and r.position <> o.ord;
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

-- Adds a generic reference from one object to another of the same Project, at
-- the end of the source's references. Already there: returns it unchanged.
create function public.add_object_reference(p_source_type text, p_source_id uuid, p_target_type text, p_target_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_project_id uuid;
  v_reference public.object_references%rowtype;
begin
  if p_source_type is null or p_source_type not in ('entry', 'page', 'scene')
     or p_target_type is null or p_target_type not in ('entry', 'page', 'scene') then
    return jsonb_build_object('status', 'error', 'error', 'Unknown object type');
  end if;
  v_project_id := public.reference_object_project(p_source_type, p_source_id);
  if v_project_id is null or not exists (select 1 from public.projects p where p.id = v_project_id and p.user_id = auth.uid()) then
    return jsonb_build_object('status', 'error', 'error', 'Source not found');
  end if;
  perform public.lock_project_workspace(v_project_id);
  -- Another writer's object, or one of another Project, is simply not found.
  if public.reference_object_project(p_target_type, p_target_id) is distinct from v_project_id then
    return jsonb_build_object('status', 'error', 'error', 'Target not found');
  end if;
  if p_source_type = p_target_type and p_source_id = p_target_id then
    return jsonb_build_object('status', 'error', 'error', 'An object cannot reference itself');
  end if;

  select r.* into v_reference from public.object_references r
   where r.property_id is null
     and r.source_type = p_source_type and coalesce(r.source_entry_id, r.source_document_id, r.source_scene_id) = p_source_id
     and r.target_type = p_target_type and coalesce(r.target_entry_id, r.target_document_id, r.target_scene_id) = p_target_id;
  if found then
    return jsonb_build_object('status', 'ok', 'reference', to_jsonb(v_reference));
  end if;
  if (select count(*) from public.object_references r
       where r.property_id is null and r.source_type = p_source_type
         and coalesce(r.source_entry_id, r.source_document_id, r.source_scene_id) = p_source_id) >= 500 then
    return jsonb_build_object('status', 'error', 'error', 'Too many links');
  end if;

  insert into public.object_references
    (project_id, source_type, source_entry_id, source_document_id, source_scene_id,
     target_type, target_entry_id, target_document_id, target_scene_id, position)
  select v_project_id, p_source_type,
         case when p_source_type = 'entry' then p_source_id end,
         case when p_source_type = 'page' then p_source_id end,
         case when p_source_type = 'scene' then p_source_id end,
         p_target_type,
         case when p_target_type = 'entry' then p_target_id end,
         case when p_target_type = 'page' then p_target_id end,
         case when p_target_type = 'scene' then p_target_id end,
         coalesce(max(r.position), 0) + 1
    from public.object_references r
   where r.property_id is null and r.source_type = p_source_type
     and coalesce(r.source_entry_id, r.source_document_id, r.source_scene_id) = p_source_id
  returning * into v_reference;

  return jsonb_build_object('status', 'ok', 'reference', to_jsonb(v_reference));
end;
$function$;

-- Removes one generic reference — never either object. (A Relationship's
-- values change through set_workspace_entry_relationship.)
create function public.remove_object_reference(p_reference_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_reference public.object_references%rowtype;
begin
  select r.* into v_reference
    from public.object_references r
    join public.projects p on p.id = r.project_id
   where r.id = p_reference_id and p.user_id = auth.uid() and r.property_id is null;
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Reference not found');
  end if;
  perform public.lock_project_workspace(v_reference.project_id);
  delete from public.object_references r where r.id = p_reference_id;
  return jsonb_build_object('status', 'ok');
end;
$function$;

-- As 026, except that a Relationship's values are its references: the count
-- the writer confirms is the number of Entries holding one.
create or replace function public.delete_workspace_collection_property(p_property_id uuid, p_expected_values integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_property public.workspace_collection_properties%rowtype;
  v_values integer;
begin
  select pr.* into v_property
    from public.workspace_collection_properties pr
    join public.projects p on p.id = pr.project_id
   where pr.id = p_property_id and p.user_id = auth.uid();
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Property not found');
  end if;
  perform public.lock_project_workspace(v_property.project_id);

  if v_property.type = 'relationship' then
    select count(distinct r.source_entry_id) into v_values from public.object_references r where r.property_id = p_property_id;
  else
    select count(*) into v_values from public.workspace_entry_values v where v.property_id = p_property_id;
  end if;
  if v_values is distinct from coalesce(p_expected_values, 0) then
    return jsonb_build_object('status', 'confirm', 'values', v_values);
  end if;

  -- Its values go with it (workspace_entry_values_property_same_collection_fkey,
  -- object_references_property_id_fkey). The objects they pointed to stay.
  delete from public.workspace_collection_properties p where p.id = p_property_id;
  update public.workspace_collection_properties p
     set position = r.rank
    from (select id, row_number() over (order by position) as rank
            from public.workspace_collection_properties
           where collection_id = v_property.collection_id) r
   where p.id = r.id and p.position <> r.rank;
  return jsonb_build_object('status', 'ok', 'deleted_values', v_values);
end;
$function$;

revoke execute on function public.create_workspace_relationship_property(uuid, text, text, uuid, boolean) from public, anon;
revoke execute on function public.update_workspace_relationship_property(uuid, jsonb) from public, anon;
revoke execute on function public.set_workspace_entry_relationship(uuid, uuid, uuid[]) from public, anon;
revoke execute on function public.add_object_reference(text, uuid, text, uuid) from public, anon;
revoke execute on function public.remove_object_reference(uuid) from public, anon;

insert into public.schema_migrations (version, name, applied_at, note)
values ('028', '028_references.sql', now(), 'References: object_references (canonical forward references between Entries, Pages and Scenes of one Project — generic, or one value of a Relationship property; typed FKs, cascade only on permanent deletion, backlinks derived by target); Relationship property type (relation_target, relation_collection_id, relation_many); client read-only, writes through SECURITY DEFINER functions');
