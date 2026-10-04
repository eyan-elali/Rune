-- ── Migration 032: Scene Properties and Scene Views ─────────────────────────
--
-- Rune 2.0, Milestone 14. The Manuscript defines its own Scene properties
-- ("POV", "Status", "Characters", or none at all), every Scene may hold a
-- value for each, and the Manuscript's Scenes can be seen through saved
-- List, Table and Board Views (architecture §8, §16–19). Rune gives no
-- property a meaning. A writer who never defines one sees nothing new.
--
-- Scene metadata sits BESIDE the prose, never in it: nothing here writes a
-- Scene row, so its content, words, version, updated_at, placement and order
-- are untouched by every property, value or View operation. The save path
-- (save_scene_checked), the offline queue and the version model are unchanged.
--
-- public.scene_property_definitions — NEW. One row is one Scene property of
-- one Manuscript, available to all of its Scenes.
--   * manuscript_id: its Manuscript, for life; project_id: that Manuscript's
--     Project (checked by the trigger). Deleted with the Manuscript (only ever
--     with its Project).
--   * name, type, options, position: exactly as a Collection property (026).
--     Types: text | number | select | multi_select | status | date |
--     checkbox | relationship. Values are checked by the same
--     workspace_property_value_valid and options by workspace_property_options_valid.
--   * relation_target / relation_collection_id / relation_many: as a
--     Collection property's (028) — a Relationship to Entries of one
--     Collection of the same Project, to Pages, or to Scenes; one or several.
--     If the target Collection is permanently deleted, the property goes with
--     it (it can hold nothing any more), as for Collection Relationships.
--
-- public.scene_property_values — NEW. One row is one Scene's value for one
-- property of ITS Manuscript. No row = no value. Deleted with its property
-- (delete_scene_property confirms how many) or with its Scene (only ever a
-- permanent deletion from Trash). A trashed Scene keeps its values; restoring
-- it brings them back unchanged.
--
-- public.scene_views — NEW. One row is one saved View of the Manuscript's
-- Scenes: configuration only, like a Collection View (027), and never a Scene,
-- a value or any prose. A Manuscript may have none: the shell then shows its
-- Scenes in manuscript order, unsaved. config names only the Manuscript's own
-- Scene properties — and two read-only fields every Scene has:
--   "words"     — its word count (show, sort, filter greater / less than)
--   "placement" — "placed" or "unplaced" (show, filter)
-- `sort: null` means MANUSCRIPT ORDER: placed Scenes in reading order
-- (Group → Chapter → Scene), then Unplaced Scenes. The order is derived
-- from the manuscript structure every time; nothing here stores a position
-- or a Scene number. Moving a Scene between a Board's columns sets a property
-- value; it never changes the manuscript's order.
--
-- One set of View rules for every owner — NEW prune_view_config(fields,
-- config), which both prune_workspace_view_config (redefined) and
-- prune_scene_view_config use. The rules grow, for Collections and Scenes alike:
--   * filters: text "contains"; number and date "gt" / "lt"; a Relationship
--     "is" / "is_not" (includes / doesn't include) one target id;
--   * group_by: a select or status property, or a Relationship to Entries of
--     a Collection (a Board then has a column per Entry of that Collection).
--   workspace_view_config_shape_valid accepts the new operators (a superset:
--   every existing config stays valid).
--
-- public.object_references — CHANGED: scene_property_id, the Scene property a
-- reference is a value of (source 'scene' only), beside property_id (a
-- Collection property; source 'entry' only). A Scene Relationship value is
-- therefore one ordinary reference row — Scene → Entry — and every backlink,
-- dormant-in-Trash and permanent-deletion rule of 028/030/031 applies to it
-- unchanged. object_references_property_from_entry becomes
-- object_references_property_source_check; the once-key includes
-- scene_property_id. add_object_reference and remove_object_reference
-- (redefined) only ever count, find or remove GENERIC references, so a
-- generic-link call can never remove a Scene property value.
--
-- Writes: clients only READ the three tables (RLS: the Project's owner). Every
-- change goes through a SECURITY DEFINER function below, which checks
-- ownership against projects.user_id = auth.uid(), under lock_project_workspace:
--   * create_scene_property(project, name, type) → { property }
--   * create_scene_relationship_property(project, name, target, target_collection, many) → { property }
--   * update_scene_property(property, changes) → { property, cleared }
--       changes: any of name, type, options (as 026), many, target,
--       target_collection_id (as 028: the target only while no Scene holds a
--       value; "one" only while none holds several).
--   * move_scene_property(property, index) → { property }
--   * delete_scene_property(property, expected_values) — refused unless
--       expected_values is how many Scenes hold a value.
--   * set_scene_property_value(scene, property, value) → { value }  (empty clears)
--   * set_scene_relationship(scene, property, targets uuid[]) → { targets }
--   * create_scene_view(project, name, type, config) → { view }
--   * update_scene_view(view, changes) → { view }
--   * move_scene_view(view, index) → { view }
--   * delete_scene_view(view)
--   A trashed Scene's values cannot be set; nothing can point at an object in
--   Trash. list_workspace_trash and delete_trashed_workspace_object (redefined)
--   count Scene Relationships that point at a Collection too.
--
-- Unchanged on purpose: every scenes/chapters/manuscripts/projects table,
-- policy and trigger; save_scene_checked and every other manuscript RPC;
-- duplicate_project_checked (a duplicate copies the manuscript, not its
-- metadata, as it copies no Workspace object); export; word totals.
--
-- For the Rune 2.0 database only: it requires 031. Apply BEFORE the app deploy
-- that uses it. The previous app never reads the new tables and never sees a
-- Scene property value (it has none to see until the new app makes one).
-- Rollback (drops every Scene property, value and View; no prose is touched):
--   delete from public.object_references where scene_property_id is not null;
--   drop table public.scene_views, public.scene_property_values, public.scene_property_definitions;
--   alter table public.object_references drop column scene_property_id;  (drops its key and FK)
--   re-create object_references_property_from_entry and object_references_once_key as 028,
--   check_object_reference, add_object_reference, remove_object_reference as 028,
--   workspace_view_config_shape_valid as 027, prune_workspace_view_config as 028,
--   list_workspace_trash and delete_trashed_workspace_object as 031, and the
--   trigger workspace_collection_properties_views_changed as 027;
--   drop the functions this migration creates;
--   delete from public.schema_migrations where version = '032';
-- Apply as ONE script (psql -1, or the SQL editor).

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 032 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '032') then
    raise exception 'Migration 032 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '031') then
    raise exception 'Migration 032 requires migration 031 (scene trash). Nothing was changed.';
  end if;
  -- As in 024–031: the SECURITY DEFINER functions run as their owner, which
  -- must own the Workspace and manuscript tables or they would be subject to RLS.
  if (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.workspace_collections'::regclass) <> current_user
     or (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.scenes'::regclass) <> current_user then
    raise exception 'Migration 032 must be applied by the owner of public.workspace_collections and public.scenes (%). Nothing was changed.',
      current_user;
  end if;
end
$$;

-- ── View rules, for every owner ─────────────────────────────────────────────

-- As 027, with the operators contains / gt / lt. A superset: every config
-- valid before is valid now.
create or replace function public.workspace_view_config_shape_valid(p_config jsonb)
 returns boolean
 language sql
 immutable
 set search_path to ''
as $function$
  select jsonb_typeof(p_config) = 'object'
     and not exists (select 1 from jsonb_object_keys(p_config) k where k not in ('properties', 'sort', 'filters', 'group_by'))
     -- properties: distinct strings
     and (not p_config ? 'properties' or (
           jsonb_typeof(p_config -> 'properties') = 'array'
       and jsonb_array_length(p_config -> 'properties') <= 200
       and not exists (select 1 from jsonb_array_elements(p_config -> 'properties') x where jsonb_typeof(x) <> 'string')
       and (select count(distinct x) = count(*) from jsonb_array_elements(p_config -> 'properties') x)))
     -- sort: null or { by, direction }
     and (not p_config ? 'sort' or jsonb_typeof(p_config -> 'sort') = 'null' or (
           jsonb_typeof(p_config -> 'sort') = 'object'
       and not exists (select 1 from jsonb_object_keys(p_config -> 'sort') k where k not in ('by', 'direction'))
       and jsonb_typeof(p_config -> 'sort' -> 'by') = 'string'
       and (p_config -> 'sort' ->> 'direction') in ('asc', 'desc')))
     -- filters: [{ property, op, value? }]
     and (not p_config ? 'filters' or (
           jsonb_typeof(p_config -> 'filters') = 'array'
       and jsonb_array_length(p_config -> 'filters') <= 20
       and not exists (
             select 1 from jsonb_array_elements(p_config -> 'filters') f
              where jsonb_typeof(f) <> 'object'
                 or exists (select 1 from jsonb_object_keys(f) k where k not in ('property', 'op', 'value'))
                 or jsonb_typeof(f -> 'property') is distinct from 'string'
                 or (f ->> 'op') is null
                 or (f ->> 'op') not in ('is', 'is_not', 'is_empty', 'is_not_empty', 'contains', 'gt', 'lt')
                 or ((f ->> 'op') in ('is', 'is_not', 'contains') and jsonb_typeof(f -> 'value') is distinct from 'string')
                 or ((f ->> 'op') in ('gt', 'lt') and coalesce(jsonb_typeof(f -> 'value'), '') not in ('number', 'string'))
                 or ((f ->> 'op') in ('is_empty', 'is_not_empty') and f ? 'value'))))
     -- group_by: null or a string
     and (not p_config ? 'group_by' or jsonb_typeof(p_config -> 'group_by') in ('null', 'string'));
$function$;

-- The one set of View rules. `p_fields`: what the View's owner offers —
-- [{ id, type, options, relation_target, native }] (a native field is
-- read-only: it is shown, sorted and filtered, never grouped by and never
-- empty). Returns the (well-formed) config with every reference that isn't
-- valid for those fields removed; order is kept. A config is valid exactly
-- when pruning its normalised form changes nothing.
--   properties: fields that exist.
--   sort:       "title", or a field with one value (not multi-select or Relationship).
--   filters:    is_empty / is_not_empty on any non-native field;
--               is / is_not: a choice field's option, or a Relationship's target id;
--               contains: a text field, 1–200 characters;
--               gt / lt: a number field and a number, a date field and "YYYY-MM-DD".
--   group_by:   a select or status field, or a Relationship to Entries.
create function public.prune_view_config(p_fields jsonb, p_config jsonb)
 returns jsonb
 language sql
 immutable
 set search_path to ''
as $function$
  with c as (select public.normalize_workspace_view_config(p_config) as v),
  fields as (
    select f ->> 'id' as id, f ->> 'type' as type, coalesce(f -> 'options', '[]'::jsonb) as options,
           f ->> 'relation_target' as relation_target, coalesce((f ->> 'native')::boolean, false) as native
      from jsonb_array_elements(coalesce(p_fields, '[]'::jsonb)) f
  )
  select jsonb_build_object(
    'properties', coalesce((
        select jsonb_agg(x order by i)
          from c, jsonb_array_elements(c.v -> 'properties') with ordinality as t(x, i)
         where exists (select 1 from fields where fields.id = x #>> '{}')), '[]'::jsonb),
    'sort', (
        select case
                 when jsonb_typeof(c.v -> 'sort') <> 'object' then 'null'::jsonb
                 when c.v -> 'sort' ->> 'by' = 'title' then c.v -> 'sort'
                 when exists (select 1 from fields where fields.id = c.v -> 'sort' ->> 'by'
                                 and fields.type in ('text', 'number', 'select', 'status', 'date', 'checkbox'))
                   then c.v -> 'sort'
                 else 'null'::jsonb
               end
          from c),
    'filters', coalesce((
        select jsonb_agg(f order by i)
          from c, jsonb_array_elements(c.v -> 'filters') with ordinality as t(f, i)
         where exists (
                 select 1 from fields
                  where fields.id = f ->> 'property'
                    and (   ((f ->> 'op') in ('is_empty', 'is_not_empty') and not fields.native)
                         or ((f ->> 'op') in ('is', 'is_not') and fields.type in ('select', 'status', 'multi_select')
                             and exists (select 1 from jsonb_array_elements(fields.options) o where o -> 'id' = f -> 'value'))
                         or ((f ->> 'op') in ('is', 'is_not') and fields.type = 'relationship'
                             and (f ->> 'value') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
                         or ((f ->> 'op') = 'contains' and fields.type = 'text'
                             and btrim(f ->> 'value') <> '' and char_length(f ->> 'value') <= 200)
                         or ((f ->> 'op') in ('gt', 'lt') and fields.type = 'number' and jsonb_typeof(f -> 'value') = 'number')
                         or ((f ->> 'op') in ('gt', 'lt') and fields.type = 'date' and jsonb_typeof(f -> 'value') = 'string'
                             and (f ->> 'value') ~ '^\d{4}-\d{2}-\d{2}$')))), '[]'::jsonb),
    'group_by', (
        select case
                 when exists (select 1 from fields
                               where fields.id = c.v ->> 'group_by' and not fields.native
                                 and (fields.type in ('select', 'status')
                                      or (fields.type = 'relationship' and fields.relation_target = 'entry')))
                   then c.v -> 'group_by'
                 else 'null'::jsonb
               end
          from c))
  from c;
$function$;

-- As 028, through the one set of rules: a Collection's fields are its properties.
create or replace function public.prune_workspace_view_config(p_collection_id uuid, p_config jsonb)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  select public.prune_view_config(
    coalesce((select jsonb_agg(jsonb_build_object('id', p.id::text, 'type', p.type, 'options', p.options,
                                                  'relation_target', p.relation_target))
                from public.workspace_collection_properties p
               where p.collection_id = p_collection_id), '[]'::jsonb),
    p_config);
$function$;

revoke execute on function public.prune_view_config(jsonb, jsonb) from public, anon;

-- A Relationship grouping a Board holds only while it points to Entries: a
-- change of target prunes the Views as a change of type or options does.
drop trigger workspace_collection_properties_views_changed on public.workspace_collection_properties;
create trigger workspace_collection_properties_views_changed
  after update of type, options, relation_target, relation_collection_id on public.workspace_collection_properties
  for each row execute function public.sync_workspace_views_with_property();

-- ── Scene property definitions ──────────────────────────────────────────────

create table public.scene_property_definitions (
  id                     uuid        default gen_random_uuid() not null,
  manuscript_id          uuid        not null,
  project_id             uuid        not null,                        -- the Manuscript's Project
  name                   text        not null,
  type                   text        not null,
  options                jsonb       default '[]'::jsonb not null,
  position               integer     not null,
  relation_target        text,
  relation_collection_id uuid,
  relation_many          boolean     default false not null,
  created_at             timestamptz default now() not null,
  updated_at             timestamptz default now() not null
);

alter table public.scene_property_definitions add constraint scene_property_definitions_pkey primary key (id);
alter table public.scene_property_definitions add constraint scene_property_definitions_id_manuscript_id_key unique (id, manuscript_id);
alter table public.scene_property_definitions add constraint scene_property_definitions_manuscript_id_fkey
  foreign key (manuscript_id) references public.manuscripts(id) on delete cascade;
alter table public.scene_property_definitions add constraint scene_property_definitions_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete cascade;
alter table public.scene_property_definitions add constraint scene_property_definitions_name_check
  check (name = btrim(name) and name <> '' and char_length(name) <= 100);
alter table public.scene_property_definitions add constraint scene_property_definitions_type_check
  check (type in ('text', 'number', 'select', 'multi_select', 'status', 'date', 'checkbox', 'relationship'));
alter table public.scene_property_definitions add constraint scene_property_definitions_options_check
  check (jsonb_typeof(options) = 'array' and (type in ('select', 'multi_select', 'status') or options = '[]'::jsonb));
alter table public.scene_property_definitions add constraint scene_property_definitions_position_check
  check (position > 0);
alter table public.scene_property_definitions add constraint scene_property_definitions_relation_check
  check ((type = 'relationship') = (relation_target is not null)
     and (relation_target is null or relation_target in ('entry', 'page', 'scene'))
     and (relation_collection_id is not null) = (coalesce(relation_target, '') = 'entry')
     and (type = 'relationship' or not relation_many));
alter table public.scene_property_definitions add constraint scene_property_definitions_relation_target_fkey
  foreign key (relation_collection_id, project_id) references public.workspace_collections(id, project_id) on delete cascade;
-- 1..n within a Manuscript; moves renumber inside one statement.
alter table public.scene_property_definitions add constraint scene_property_definitions_manuscript_id_position_key
  unique (manuscript_id, position) deferrable initially deferred;

create unique index scene_property_definitions_manuscript_id_name_key
  on public.scene_property_definitions using btree (manuscript_id, lower(name));
create index scene_property_definitions_project_id_idx
  on public.scene_property_definitions using btree (project_id);
create index scene_property_definitions_relation_collection_id_idx
  on public.scene_property_definitions using btree (relation_collection_id) where relation_collection_id is not null;

-- Options are checked, the Manuscript (and so the Project) is kept for life,
-- nothing new points at a Collection in Trash, and the database owns the
-- timestamps.
create function public.check_scene_property_definition()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if not public.workspace_property_options_valid(new.options) then
    raise exception 'Invalid property options' using errcode = 'check_violation';
  end if;
  if new.relation_collection_id is not null
     and (tg_op = 'INSERT' or new.relation_collection_id is distinct from old.relation_collection_id)
     and not public.workspace_object_active('collection', new.relation_collection_id) then
    raise exception 'That collection is in Trash' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.manuscripts m where m.id = new.manuscript_id and m.project_id = new.project_id) then
      raise exception 'A Scene property belongs to its Manuscript''s Project' using errcode = 'check_violation';
    end if;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;
  if new.manuscript_id is distinct from old.manuscript_id then
    raise exception 'A Scene property cannot move to another Manuscript' using errcode = 'check_violation';
  end if;
  new.id := old.id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$function$;

revoke execute on function public.check_scene_property_definition() from public, anon;

create trigger scene_property_definitions_forbid_project_reassignment before update of project_id on public.scene_property_definitions
  for each row execute function public.forbid_project_reassignment();
create trigger scene_property_definitions_check before insert or update on public.scene_property_definitions
  for each row execute function public.check_scene_property_definition();

alter table public.scene_property_definitions enable row level security;

create policy "scene_property_definitions: select own" on public.scene_property_definitions
  as permissive for select to authenticated
  using (exists (select 1 from public.projects p
                 where p.id = scene_property_definitions.project_id and p.user_id = (select auth.uid())));

revoke insert, update, delete on public.scene_property_definitions from anon, authenticated;

-- ── Scene property values ───────────────────────────────────────────────────

create table public.scene_property_values (
  scene_id       uuid        not null,
  property_id    uuid        not null,
  manuscript_id  uuid        not null,                                -- the Scene's and the property's
  project_id     uuid        not null,                                -- the Manuscript's Project
  value          jsonb       not null,
  updated_at     timestamptz default now() not null
);

alter table public.scene_property_values add constraint scene_property_values_pkey primary key (scene_id, property_id);
-- A permanently deleted Scene takes its values; a trashed one keeps them.
alter table public.scene_property_values add constraint scene_property_values_scene_id_fkey
  foreign key (scene_id) references public.scenes(id) on delete cascade;
alter table public.scene_property_values add constraint scene_property_values_property_same_manuscript_fkey
  foreign key (property_id, manuscript_id) references public.scene_property_definitions(id, manuscript_id) on delete cascade;
alter table public.scene_property_values add constraint scene_property_values_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete cascade;

create index scene_property_values_property_id_idx on public.scene_property_values using btree (property_id);
create index scene_property_values_project_id_idx on public.scene_property_values using btree (project_id);

-- Every value is checked against its property's type and options (a
-- Relationship's values are references, never rows here); the Scene belongs
-- to the property's Manuscript; a value keeps its Scene and property for life.
create function public.check_scene_property_value()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare
  v_property public.scene_property_definitions%rowtype;
begin
  if tg_op = 'UPDATE' and (new.scene_id is distinct from old.scene_id
                           or new.property_id is distinct from old.property_id
                           or new.manuscript_id is distinct from old.manuscript_id) then
    raise exception 'A value keeps its Scene and property for life' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' and not exists (select 1 from public.scenes s where s.id = new.scene_id and s.manuscript_id = new.manuscript_id) then
    raise exception 'A Scene holds values only for its own Manuscript''s properties' using errcode = 'check_violation';
  end if;
  select * into v_property from public.scene_property_definitions p where p.id = new.property_id;
  -- A missing property is left to the foreign key.
  if found then
    if v_property.project_id is distinct from new.project_id then
      raise exception 'A value belongs to its property''s Project' using errcode = 'check_violation';
    end if;
    if not public.workspace_property_value_valid(v_property.type, v_property.options, new.value) then
      raise exception 'Invalid value for a % property', v_property.type using errcode = 'check_violation';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

revoke execute on function public.check_scene_property_value() from public, anon;

create trigger scene_property_values_forbid_project_reassignment before update of project_id on public.scene_property_values
  for each row execute function public.forbid_project_reassignment();
create trigger scene_property_values_check before insert or update on public.scene_property_values
  for each row execute function public.check_scene_property_value();

alter table public.scene_property_values enable row level security;

create policy "scene_property_values: select own" on public.scene_property_values
  as permissive for select to authenticated
  using (exists (select 1 from public.projects p
                 where p.id = scene_property_values.project_id and p.user_id = (select auth.uid())));

revoke insert, update, delete on public.scene_property_values from anon, authenticated;

-- ── Scene Views ─────────────────────────────────────────────────────────────

-- What a Scene View can name: the Manuscript's Scene properties, then the two
-- read-only fields every Scene has.
create function public.manuscript_scene_view_fields(p_manuscript_id uuid)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  select coalesce((select jsonb_agg(jsonb_build_object('id', p.id::text, 'type', p.type, 'options', p.options,
                                                       'relation_target', p.relation_target) order by p.position)
                     from public.scene_property_definitions p
                    where p.manuscript_id = p_manuscript_id), '[]'::jsonb)
      || jsonb_build_array(
           jsonb_build_object('id', 'words', 'type', 'number', 'native', true),
           jsonb_build_object('id', 'placement', 'type', 'select', 'native', true,
                              'options', '[{"id": "placed", "name": "Placed"}, {"id": "unplaced", "name": "Unplaced"}]'::jsonb));
$function$;

-- (plpgsql, not sql: the canonical schema creates functions alphabetically,
-- before prune_view_config exists.)
create function public.prune_scene_view_config(p_manuscript_id uuid, p_config jsonb)
 returns jsonb
 language plpgsql
 stable
 set search_path to ''
as $function$
begin
  return public.prune_view_config(public.manuscript_scene_view_fields(p_manuscript_id), p_config);
end;
$function$;

-- The config a new Scene View of `p_type` starts with: a List shows the first
-- three properties, a Table the word count and every property, a Board groups
-- by the first status property (else the first select). Every one opens in
-- manuscript order (sort null).
create function public.default_scene_view_config(p_manuscript_id uuid, p_type text)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  select jsonb_build_object(
    'properties', case p_type
      when 'board' then '[]'::jsonb
      when 'table' then '["words"]'::jsonb || coalesce((
        select jsonb_agg(to_jsonb(p.id::text) order by p.position)
          from public.scene_property_definitions p where p.manuscript_id = p_manuscript_id), '[]'::jsonb)
      else coalesce((
        select jsonb_agg(to_jsonb(p.id::text) order by p.position)
          from public.scene_property_definitions p where p.manuscript_id = p_manuscript_id and p.position <= 3), '[]'::jsonb)
    end,
    'sort', 'null'::jsonb,
    'filters', '[]'::jsonb,
    'group_by', case p_type
      when 'board' then coalesce((
        select to_jsonb(p.id::text)
          from public.scene_property_definitions p
         where p.manuscript_id = p_manuscript_id and p.type in ('status', 'select')
         order by (p.type = 'status') desc, p.position
         limit 1), 'null'::jsonb)
      else 'null'::jsonb
    end);
$function$;

revoke execute on function public.manuscript_scene_view_fields(uuid) from public, anon;
revoke execute on function public.prune_scene_view_config(uuid, jsonb) from public, anon;
revoke execute on function public.default_scene_view_config(uuid, text) from public, anon;

create table public.scene_views (
  id             uuid        default gen_random_uuid() not null,
  manuscript_id  uuid        not null,
  project_id     uuid        not null,                                -- the Manuscript's Project
  name           text        not null,
  type           text        not null,
  position       integer     not null,
  config         jsonb       default '{"properties": [], "sort": null, "filters": [], "group_by": null}'::jsonb not null,
  created_at     timestamptz default now() not null,
  updated_at     timestamptz default now() not null
);

alter table public.scene_views add constraint scene_views_pkey primary key (id);
alter table public.scene_views add constraint scene_views_manuscript_id_fkey
  foreign key (manuscript_id) references public.manuscripts(id) on delete cascade;
alter table public.scene_views add constraint scene_views_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete cascade;
alter table public.scene_views add constraint scene_views_name_check
  check (name = btrim(name) and name <> '' and char_length(name) <= 100);
alter table public.scene_views add constraint scene_views_type_check
  check (type in ('list', 'table', 'board'));
alter table public.scene_views add constraint scene_views_position_check
  check (position > 0);
alter table public.scene_views add constraint scene_views_manuscript_id_position_key
  unique (manuscript_id, position) deferrable initially deferred;

create index scene_views_project_id_idx on public.scene_views using btree (project_id);

-- The config is checked against the Manuscript's Scene fields, the Manuscript
-- is kept for life, and the database owns the timestamps.
create function public.check_scene_view()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if tg_op = 'UPDATE' and new.manuscript_id is distinct from old.manuscript_id then
    raise exception 'A view cannot move to another Manuscript' using errcode = 'check_violation';
  end if;
  if not public.workspace_view_config_shape_valid(new.config)
     or new.config is distinct from public.prune_scene_view_config(new.manuscript_id, new.config) then
    raise exception 'Invalid view configuration' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.manuscripts m where m.id = new.manuscript_id and m.project_id = new.project_id) then
      raise exception 'A Scene View belongs to its Manuscript''s Project' using errcode = 'check_violation';
    end if;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;
  new.id := old.id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$function$;

revoke execute on function public.check_scene_view() from public, anon;

create trigger scene_views_forbid_project_reassignment before update of project_id on public.scene_views
  for each row execute function public.forbid_project_reassignment();
create trigger scene_views_check before insert or update on public.scene_views
  for each row execute function public.check_scene_view();

alter table public.scene_views enable row level security;

create policy "scene_views: select own" on public.scene_views
  as permissive for select to authenticated
  using (exists (select 1 from public.projects p
                 where p.id = scene_views.project_id and p.user_id = (select auth.uid())));

revoke insert, update, delete on public.scene_views from anon, authenticated;

-- Keeps every Scene View of a Manuscript in step with its properties, as
-- sync_workspace_views_with_property does for a Collection's:
--   added:   joins every Table's columns, and the List and Board Views
--            showing fewer than three fields; a select/status becomes the
--            grouping of a Board with none.
--   changed: (type, options, target) references that no longer hold are pruned.
--   removed: every reference to it is pruned.
create function public.sync_scene_views_with_property()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare
  v_manuscript_id uuid := coalesce(new.manuscript_id, old.manuscript_id);
begin
  -- The Manuscript itself is being deleted: its Views go with it.
  if not exists (select 1 from public.manuscripts m where m.id = v_manuscript_id) then
    return null;
  end if;

  if tg_op = 'INSERT' then
    update public.scene_views v
       set config = jsonb_set(v.config, '{properties}', (v.config -> 'properties') || to_jsonb(new.id::text))
     where v.manuscript_id = v_manuscript_id
       and (v.type = 'table' or jsonb_array_length(v.config -> 'properties') < 3);
    if new.type in ('select', 'status') then
      update public.scene_views v
         set config = jsonb_set(v.config, '{group_by}', to_jsonb(new.id::text))
       where v.manuscript_id = v_manuscript_id and v.type = 'board' and jsonb_typeof(v.config -> 'group_by') = 'null';
    end if;
    return null;
  end if;

  update public.scene_views v
     set config = public.prune_scene_view_config(v_manuscript_id, v.config)
   where v.manuscript_id = v_manuscript_id
     and v.config is distinct from public.prune_scene_view_config(v_manuscript_id, v.config);
  return null;
end;
$function$;

revoke execute on function public.sync_scene_views_with_property() from public, anon;

create trigger scene_property_definitions_views_added after insert on public.scene_property_definitions
  for each row execute function public.sync_scene_views_with_property();
create trigger scene_property_definitions_views_changed
  after update of type, options, relation_target, relation_collection_id on public.scene_property_definitions
  for each row execute function public.sync_scene_views_with_property();
create trigger scene_property_definitions_views_removed after delete on public.scene_property_definitions
  for each row execute function public.sync_scene_views_with_property();

-- ── References: Scene Relationship values ───────────────────────────────────

alter table public.object_references add column scene_property_id uuid;

-- A Collection property's values come from Entries; a Scene property's from Scenes.
alter table public.object_references drop constraint object_references_property_from_entry;
alter table public.object_references add constraint object_references_property_source_check
  check ((property_id is null or source_type = 'entry')
     and (scene_property_id is null or source_type = 'scene'));
-- Once per source, target and property (and once generically).
alter table public.object_references drop constraint object_references_once_key;
alter table public.object_references add constraint object_references_once_key
  unique nulls not distinct (source_entry_id, source_document_id, source_scene_id,
                             target_entry_id, target_document_id, target_scene_id, property_id, scene_property_id);
-- A Scene Relationship's values go with it (delete_scene_property confirms how many).
alter table public.object_references add constraint object_references_scene_property_id_fkey
  foreign key (scene_property_id) references public.scene_property_definitions(id) on delete cascade;

create index object_references_scene_property_id_idx on public.object_references using btree (scene_property_id)
  where scene_property_id is not null;

-- As 028, plus a Scene Relationship value: a Relationship property of the
-- source Scene's own Manuscript, a target it allows, one value unless it holds
-- several.
create or replace function public.check_object_reference()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare
  v_property public.workspace_collection_properties%rowtype;
  v_scene_property public.scene_property_definitions%rowtype;
begin
  if tg_op = 'UPDATE' then
    if (new.project_id, new.source_type, new.source_entry_id, new.source_document_id, new.source_scene_id,
        new.target_type, new.target_entry_id, new.target_document_id, new.target_scene_id, new.property_id,
        new.scene_property_id)
       is distinct from
       (old.project_id, old.source_type, old.source_entry_id, old.source_document_id, old.source_scene_id,
        old.target_type, old.target_entry_id, old.target_document_id, old.target_scene_id, old.property_id,
        old.scene_property_id) then
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

  if new.scene_property_id is not null then
    select pr.* into v_scene_property
      from public.scene_property_definitions pr
      join public.scenes s on s.manuscript_id = pr.manuscript_id
     where pr.id = new.scene_property_id and s.id = new.source_scene_id and pr.type = 'relationship';
    if not found then
      raise exception 'Not a Relationship property of the Scene''s Manuscript' using errcode = 'check_violation';
    end if;
    if new.target_type <> v_scene_property.relation_target
       or (v_scene_property.relation_target = 'entry'
           and not exists (select 1 from public.workspace_collection_entries t
                            where t.id = new.target_entry_id and t.collection_id = v_scene_property.relation_collection_id)) then
      raise exception 'The Relationship "%" cannot point to that', v_scene_property.name using errcode = 'check_violation';
    end if;
    if not v_scene_property.relation_many
       and exists (select 1 from public.object_references r
                    where r.scene_property_id = new.scene_property_id and r.source_scene_id = new.source_scene_id) then
      raise exception 'The Relationship "%" holds one value', v_scene_property.name using errcode = 'check_violation';
    end if;
  end if;

  new.created_at := now();
  return new;
end;
$function$;

-- As 028, except that only GENERIC references are found and counted — a Scene
-- Relationship value (scene_property_id) is never mistaken for one.
create or replace function public.add_object_reference(p_source_type text, p_source_id uuid, p_target_type text, p_target_id uuid)
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
   where r.property_id is null and r.scene_property_id is null
     and r.source_type = p_source_type and coalesce(r.source_entry_id, r.source_document_id, r.source_scene_id) = p_source_id
     and r.target_type = p_target_type and coalesce(r.target_entry_id, r.target_document_id, r.target_scene_id) = p_target_id;
  if found then
    return jsonb_build_object('status', 'ok', 'reference', to_jsonb(v_reference));
  end if;
  if (select count(*) from public.object_references r
       where r.property_id is null and r.scene_property_id is null and r.source_type = p_source_type
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
   where r.property_id is null and r.scene_property_id is null and r.source_type = p_source_type
     and coalesce(r.source_entry_id, r.source_document_id, r.source_scene_id) = p_source_id
  returning * into v_reference;

  return jsonb_build_object('status', 'ok', 'reference', to_jsonb(v_reference));
end;
$function$;

-- As 028: removes one GENERIC reference — never a Relationship value of an
-- Entry or a Scene, never either object.
create or replace function public.remove_object_reference(p_reference_id uuid)
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
   where r.id = p_reference_id and p.user_id = auth.uid() and r.property_id is null and r.scene_property_id is null;
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Reference not found');
  end if;
  perform public.lock_project_workspace(v_reference.project_id);
  delete from public.object_references r where r.id = p_reference_id;
  return jsonb_build_object('status', 'ok');
end;
$function$;

-- ── Functions: Scene properties ─────────────────────────────────────────────

-- The Manuscript of a Project `auth.uid()` owns, or null. Internal.
create function public.owned_project_manuscript(p_project_id uuid)
 returns uuid
 language sql
 stable
 set search_path to ''
as $function$
  select m.id
    from public.manuscripts m
    join public.projects p on p.id = m.project_id
   where m.project_id = p_project_id and p.user_id = auth.uid();
$function$;

revoke execute on function public.owned_project_manuscript(uuid) from public, anon, authenticated;

-- Adds a Scene property at the end of the Manuscript's Scene properties.
create function public.create_scene_property(p_project_id uuid, p_name text, p_type text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_manuscript_id uuid;
  v_name text := left(btrim(coalesce(p_name, '')), 100);
  v_property public.scene_property_definitions%rowtype;
begin
  -- SECURITY DEFINER: ownership is checked here, not by RLS.
  v_manuscript_id := public.owned_project_manuscript(p_project_id);
  if v_manuscript_id is null then
    return jsonb_build_object('status', 'error', 'error', 'Manuscript not found');
  end if;
  perform public.lock_project_workspace(p_project_id);

  if v_name = '' then
    return jsonb_build_object('status', 'error', 'error', 'A property needs a name');
  end if;
  if p_type is null or p_type not in ('text', 'number', 'select', 'multi_select', 'status', 'date', 'checkbox') then
    return jsonb_build_object('status', 'error', 'error', 'Unknown property type');
  end if;
  if exists (select 1 from public.scene_property_definitions p
              where p.manuscript_id = v_manuscript_id and lower(p.name) = lower(v_name)) then
    return jsonb_build_object('status', 'error', 'error', 'A property with this name already exists');
  end if;
  if (select count(*) from public.scene_property_definitions p where p.manuscript_id = v_manuscript_id) >= 100 then
    return jsonb_build_object('status', 'error', 'error', 'A manuscript can have at most 100 scene properties');
  end if;

  insert into public.scene_property_definitions (manuscript_id, project_id, name, type, position)
  select v_manuscript_id, p_project_id, v_name, p_type, coalesce(max(p.position), 0) + 1
    from public.scene_property_definitions p
   where p.manuscript_id = v_manuscript_id
  returning * into v_property;

  return jsonb_build_object('status', 'ok', 'property', to_jsonb(v_property));
end;
$function$;

-- Adds a Relationship Scene property at the end. p_target: 'entry' (with
-- p_target_collection_id, an active Collection of the same Project), 'page'
-- or 'scene'.
create function public.create_scene_relationship_property(
  p_project_id uuid, p_name text, p_target text, p_target_collection_id uuid, p_many boolean)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_manuscript_id uuid;
  v_name text := left(btrim(coalesce(p_name, '')), 100);
  v_property public.scene_property_definitions%rowtype;
begin
  v_manuscript_id := public.owned_project_manuscript(p_project_id);
  if v_manuscript_id is null then
    return jsonb_build_object('status', 'error', 'error', 'Manuscript not found');
  end if;
  perform public.lock_project_workspace(p_project_id);

  if v_name = '' then
    return jsonb_build_object('status', 'error', 'error', 'A property needs a name');
  end if;
  if p_target is null or p_target not in ('entry', 'page', 'scene') then
    return jsonb_build_object('status', 'error', 'error', 'Unknown relationship target');
  end if;
  if p_target = 'entry' then
    if not exists (select 1 from public.workspace_collections c
                    where c.id = p_target_collection_id and c.project_id = p_project_id and c.trashed_at is null) then
      return jsonb_build_object('status', 'error', 'error', 'Target collection not found');
    end if;
  elsif p_target_collection_id is not null then
    return jsonb_build_object('status', 'error', 'error', 'Only an Entry relationship names a collection');
  end if;
  if exists (select 1 from public.scene_property_definitions p
              where p.manuscript_id = v_manuscript_id and lower(p.name) = lower(v_name)) then
    return jsonb_build_object('status', 'error', 'error', 'A property with this name already exists');
  end if;
  if (select count(*) from public.scene_property_definitions p where p.manuscript_id = v_manuscript_id) >= 100 then
    return jsonb_build_object('status', 'error', 'error', 'A manuscript can have at most 100 scene properties');
  end if;

  insert into public.scene_property_definitions
    (manuscript_id, project_id, name, type, position, relation_target, relation_collection_id, relation_many)
  select v_manuscript_id, p_project_id, v_name, 'relationship', coalesce(max(p.position), 0) + 1,
         p_target, p_target_collection_id, coalesce(p_many, true)
    from public.scene_property_definitions p
   where p.manuscript_id = v_manuscript_id
  returning * into v_property;

  return jsonb_build_object('status', 'ok', 'property', to_jsonb(v_property));
end;
$function$;

-- Changes a Scene property. changes: any of
--   name, type, options   — as update_workspace_collection_property (026): a
--                           type changes only where no value is lost; removing
--                           an option clears it from the Scenes that used it
--                           (`cleared`: how many Scenes changed);
--   many, target, target_collection_id — a Relationship only, as
--                           update_workspace_relationship_property (028).
create function public.update_scene_property(p_property_id uuid, p_changes jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_old public.scene_property_definitions%rowtype;
  v_new public.scene_property_definitions%rowtype;
  v_key text;
  v_opt jsonb;
  v_options jsonb := '[]'::jsonb;
  v_ids text[];
  v_cleared integer := 0;
begin
  select pr.* into v_old
    from public.scene_property_definitions pr
    join public.projects p on p.id = pr.project_id
   where pr.id = p_property_id and p.user_id = auth.uid();
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Property not found');
  end if;
  perform public.lock_project_workspace(v_old.project_id);
  -- Re-read under the lock.
  select * into v_old from public.scene_property_definitions where id = p_property_id;
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Property not found');
  end if;
  v_new := v_old;

  if jsonb_typeof(p_changes) is distinct from 'object' then
    return jsonb_build_object('status', 'error', 'error', 'Nothing to change');
  end if;
  for v_key in select jsonb_object_keys(p_changes) loop
    if v_key not in ('name', 'type', 'options', 'many', 'target', 'target_collection_id') then
      return jsonb_build_object('status', 'error', 'error', format('Unknown change: %s', v_key));
    end if;
  end loop;

  if p_changes ? 'name' then
    if jsonb_typeof(p_changes -> 'name') is distinct from 'string' or btrim(p_changes ->> 'name') = '' then
      return jsonb_build_object('status', 'error', 'error', 'A property needs a name');
    end if;
    v_new.name := left(btrim(p_changes ->> 'name'), 100);
    if exists (select 1 from public.scene_property_definitions p
                where p.manuscript_id = v_old.manuscript_id and p.id <> v_old.id and lower(p.name) = lower(v_new.name)) then
      return jsonb_build_object('status', 'error', 'error', 'A property with this name already exists');
    end if;
  end if;

  if p_changes ? 'type' then
    v_new.type := p_changes ->> 'type';
    -- Only where every value survives as it is (select ↔ status), or is
    -- wrapped losslessly (a single choice becomes a one-item multi-select).
    if v_new.type is distinct from v_old.type
       and not (v_old.type in ('select', 'status') and v_new.type in ('select', 'status', 'multi_select')) then
      return jsonb_build_object('status', 'error', 'error', 'This property’s type can’t be changed');
    end if;
  end if;

  if p_changes ? 'options' then
    if v_new.type not in ('select', 'multi_select', 'status') then
      return jsonb_build_object('status', 'error', 'error', 'Only a choice property has options');
    end if;
    if jsonb_typeof(p_changes -> 'options') is distinct from 'array' then
      return jsonb_build_object('status', 'error', 'error', 'Invalid property options');
    end if;
    -- An option keeps its id; one without an id is new and gets one here. An
    -- id the property never had is refused (a client can't invent a reference).
    for v_opt in select * from jsonb_array_elements(p_changes -> 'options') loop
      if jsonb_typeof(v_opt) <> 'object' then
        return jsonb_build_object('status', 'error', 'error', 'Invalid property options');
      end if;
      if v_opt ? 'id' and not exists (select 1 from jsonb_array_elements(v_old.options) o where o -> 'id' = v_opt -> 'id') then
        return jsonb_build_object('status', 'error', 'error', 'Unknown option');
      end if;
      v_options := v_options || jsonb_build_array(jsonb_build_object(
        'id', coalesce(v_opt ->> 'id', gen_random_uuid()::text),
        'name', left(btrim(coalesce(v_opt ->> 'name', '')), 100)));
    end loop;
    if not public.workspace_property_options_valid(v_options) then
      return jsonb_build_object('status', 'error', 'error', 'Each option needs a different name');
    end if;
    v_new.options := v_options;
  end if;

  if p_changes ? 'many' or p_changes ? 'target' or p_changes ? 'target_collection_id' then
    if v_old.type <> 'relationship' then
      return jsonb_build_object('status', 'error', 'error', 'Only a relationship points somewhere');
    end if;
  end if;

  if p_changes ? 'many' then
    if jsonb_typeof(p_changes -> 'many') is distinct from 'boolean' then
      return jsonb_build_object('status', 'error', 'error', 'many must be true or false');
    end if;
    v_new.relation_many := (p_changes ->> 'many')::boolean;
    if not v_new.relation_many and exists (
         select 1 from public.object_references r where r.scene_property_id = p_property_id
          group by r.source_scene_id having count(*) > 1) then
      return jsonb_build_object('status', 'error', 'error', 'Some scenes hold more than one');
    end if;
  end if;

  if p_changes ? 'target' or p_changes ? 'target_collection_id' then
    v_new.relation_target := coalesce(p_changes ->> 'target', v_old.relation_target);
    if v_new.relation_target not in ('entry', 'page', 'scene') then
      return jsonb_build_object('status', 'error', 'error', 'Unknown relationship target');
    end if;
    v_new.relation_collection_id := case when v_new.relation_target = 'entry'
                                         then coalesce((p_changes ->> 'target_collection_id')::uuid, v_old.relation_collection_id)
                                         else null end;
    if v_new.relation_target = 'entry'
       and not exists (select 1 from public.workspace_collections c
                        where c.id = v_new.relation_collection_id and c.project_id = v_old.project_id and c.trashed_at is null) then
      return jsonb_build_object('status', 'error', 'error', 'Target collection not found');
    end if;
    if (v_new.relation_target, v_new.relation_collection_id) is distinct from (v_old.relation_target, v_old.relation_collection_id)
       and exists (select 1 from public.object_references r where r.scene_property_id = p_property_id) then
      return jsonb_build_object('status', 'error', 'error', 'Clear its values before changing what it points to');
    end if;
  end if;

  -- Values first, then the definition, so every value is valid against the
  -- options it will have when the statement ends.
  v_ids := array(select o ->> 'id' from jsonb_array_elements(v_new.options) o);
  if v_old.type in ('select', 'status') then
    -- Removed options: those values are cleared.
    delete from public.scene_property_values v
     where v.property_id = v_old.id and not ((v.value #>> '{}') = any (v_ids));
    get diagnostics v_cleared = row_count;
  elsif v_old.type = 'multi_select' then
    with stripped as (
      select v.scene_id,
             coalesce((select jsonb_agg(x order by i) from jsonb_array_elements(v.value) with ordinality as t(x, i)
                        where (x #>> '{}') = any (v_ids)), '[]'::jsonb) as value
        from public.scene_property_values v
       where v.property_id = v_old.id
    ), changed as (
      select s.* from stripped s
        join public.scene_property_values v on v.scene_id = s.scene_id and v.property_id = v_old.id
       where s.value <> v.value
    ), emptied as (
      delete from public.scene_property_values v using changed c
       where v.property_id = v_old.id and v.scene_id = c.scene_id and c.value = '[]'::jsonb
      returning 1
    ), narrowed as (
      update public.scene_property_values v set value = c.value from changed c
       where v.property_id = v_old.id and v.scene_id = c.scene_id and c.value <> '[]'::jsonb
      returning 1
    )
    select (select count(*) from emptied) + (select count(*) from narrowed) into v_cleared;
  end if;

  update public.scene_property_definitions
     set name = v_new.name, type = v_new.type, options = v_new.options,
         relation_target = v_new.relation_target, relation_collection_id = v_new.relation_collection_id,
         relation_many = v_new.relation_many
   where id = v_old.id
  returning * into v_new;

  if v_old.type in ('select', 'status') and v_new.type = 'multi_select' then
    update public.scene_property_values v set value = jsonb_build_array(v.value) where v.property_id = v_old.id;
  end if;

  return jsonb_build_object('status', 'ok', 'property', to_jsonb(v_new), 'cleared', v_cleared);
end;
$function$;

-- Moves a Scene property to `p_index` (0-based) among the Manuscript's.
create function public.move_scene_property(p_property_id uuid, p_index integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_property public.scene_property_definitions%rowtype;
  v_count integer;
  v_target integer;
begin
  select pr.* into v_property
    from public.scene_property_definitions pr
    join public.projects p on p.id = pr.project_id
   where pr.id = p_property_id and p.user_id = auth.uid();
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Property not found');
  end if;
  perform public.lock_project_workspace(v_property.project_id);

  select count(*) into v_count from public.scene_property_definitions p where p.manuscript_id = v_property.manuscript_id;
  v_target := greatest(0, least(coalesce(p_index, v_count - 1), v_count - 1)) + 1;

  -- One statement: the others close up around the moved one (position is
  -- unique, checked at commit).
  update public.scene_property_definitions p
     set position = o.next
    from (
      select id, row_number() over (order by (id = p_property_id), position) as rank
        from public.scene_property_definitions
       where manuscript_id = v_property.manuscript_id
    ) r
    cross join lateral (
      select case
               when r.id = p_property_id then v_target
               when r.rank < v_target then r.rank
               else r.rank + 1
             end as next
    ) o
   where p.id = r.id and p.position <> o.next;

  select * into v_property from public.scene_property_definitions where id = p_property_id;
  return jsonb_build_object('status', 'ok', 'property', to_jsonb(v_property));
end;
$function$;

-- Deletes a Scene property and every value it has — never a Scene, never
-- prose, never the objects a Relationship pointed to. The caller states how
-- many Scenes hold a value (what the writer confirmed); if it isn't that
-- number any more, nothing is deleted and the current number comes back.
create function public.delete_scene_property(p_property_id uuid, p_expected_values integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_property public.scene_property_definitions%rowtype;
  v_values integer;
begin
  select pr.* into v_property
    from public.scene_property_definitions pr
    join public.projects p on p.id = pr.project_id
   where pr.id = p_property_id and p.user_id = auth.uid();
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Property not found');
  end if;
  perform public.lock_project_workspace(v_property.project_id);

  if v_property.type = 'relationship' then
    select count(distinct r.source_scene_id) into v_values from public.object_references r where r.scene_property_id = p_property_id;
  else
    select count(*) into v_values from public.scene_property_values v where v.property_id = p_property_id;
  end if;
  if v_values is distinct from coalesce(p_expected_values, 0) then
    return jsonb_build_object('status', 'confirm', 'values', v_values);
  end if;

  -- Its values go with it (scene_property_values_property_same_manuscript_fkey,
  -- object_references_scene_property_id_fkey).
  delete from public.scene_property_definitions p where p.id = p_property_id;
  update public.scene_property_definitions p
     set position = r.rank
    from (select id, row_number() over (order by position) as rank
            from public.scene_property_definitions
           where manuscript_id = v_property.manuscript_id) r
   where p.id = r.id and p.position <> r.rank;
  return jsonb_build_object('status', 'ok', 'deleted_values', v_values);
end;
$function$;

-- Sets (or, with an empty value, clears) one Scene's value for one property of
-- its Manuscript. Empty: null, "", a blank string, [], false. Writes only
-- scene_property_values: the Scene's row — prose, words, version — is never
-- touched. A Scene in Trash is not found.
create function public.set_scene_property_value(p_scene_id uuid, p_property_id uuid, p_value jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_manuscript_id uuid;
  v_project_id uuid;
  v_property public.scene_property_definitions%rowtype;
  v_value jsonb := p_value;
begin
  select s.manuscript_id, m.project_id into v_manuscript_id, v_project_id
    from public.scenes s
    join public.manuscripts m on m.id = s.manuscript_id
    join public.projects p on p.id = m.project_id
   where s.id = p_scene_id and p.user_id = auth.uid() and s.trashed_at is null;
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Scene not found');
  end if;
  perform public.lock_project_workspace(v_project_id);
  -- Only a (non-Relationship) property of the Scene's own Manuscript.
  select * into v_property from public.scene_property_definitions pr
   where pr.id = p_property_id and pr.manuscript_id = v_manuscript_id and pr.type <> 'relationship';
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
    delete from public.scene_property_values v where v.scene_id = p_scene_id and v.property_id = p_property_id;
    return jsonb_build_object('status', 'ok', 'value', null);
  end if;
  if not public.workspace_property_value_valid(v_property.type, v_property.options, v_value) then
    return jsonb_build_object('status', 'error', 'error', 'Invalid value');
  end if;

  insert into public.scene_property_values (scene_id, property_id, manuscript_id, project_id, value)
  values (p_scene_id, p_property_id, v_manuscript_id, v_project_id, v_value)
  on conflict (scene_id, property_id) do update set value = excluded.value;
  return jsonb_build_object('status', 'ok', 'value', v_value);
end;
$function$;

-- Sets one Scene's whole value for one Relationship property of its
-- Manuscript: the targets, in order (duplicates collapse, first kept); [] or
-- null clears it. As set_workspace_entry_relationship (030): the Scene and
-- every new target must be active, and dormant targets (in Trash — never
-- shown, so never sent) are kept after the visible ones; a one-value
-- Relationship given a new target replaces a dormant one. Writes only
-- object_references: the Scene's row is never touched.
create function public.set_scene_relationship(p_scene_id uuid, p_property_id uuid, p_target_ids uuid[])
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_manuscript_id uuid;
  v_project_id uuid;
  v_property public.scene_property_definitions%rowtype;
  v_targets uuid[];
  v_bad integer;
begin
  select s.manuscript_id, m.project_id into v_manuscript_id, v_project_id
    from public.scenes s
    join public.manuscripts m on m.id = s.manuscript_id
    join public.projects p on p.id = m.project_id
   where s.id = p_scene_id and p.user_id = auth.uid() and s.trashed_at is null;
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Scene not found');
  end if;
  perform public.lock_project_workspace(v_project_id);
  select * into v_property from public.scene_property_definitions pr
   where pr.id = p_property_id and pr.manuscript_id = v_manuscript_id and pr.type = 'relationship';
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
  if p_scene_id = any (v_targets) then
    return jsonb_build_object('status', 'error', 'error', 'A scene cannot point to itself');
  end if;
  select count(*) into v_bad
    from unnest(v_targets) t
   where not public.workspace_object_active(v_property.relation_target, t)
      or case v_property.relation_target
           when 'entry' then not exists (select 1 from public.workspace_collection_entries e
                                          where e.id = t and e.collection_id = v_property.relation_collection_id
                                            and e.project_id = v_project_id)
           else public.reference_object_project(v_property.relation_target, t) is distinct from v_project_id
         end;
  if v_bad > 0 then
    return jsonb_build_object('status', 'error', 'error', 'Not a valid target');
  end if;

  -- Visible targets no longer chosen go; dormant ones stay, unless a one-value
  -- Relationship is being given a new target.
  delete from public.object_references r
   where r.scene_property_id = p_property_id and r.source_scene_id = p_scene_id
     and not (coalesce(r.target_entry_id, r.target_document_id, r.target_scene_id) = any (v_targets))
     and (public.workspace_object_active(r.target_type, coalesce(r.target_entry_id, r.target_document_id, r.target_scene_id))
          or (not v_property.relation_many and cardinality(v_targets) > 0));
  update public.object_references r
     set position = o.ord
    from unnest(v_targets) with ordinality as o(t, ord)
   where r.scene_property_id = p_property_id and r.source_scene_id = p_scene_id
     and coalesce(r.target_entry_id, r.target_document_id, r.target_scene_id) = o.t
     and r.position <> o.ord;
  -- Dormant targets after the visible ones, in their order.
  update public.object_references r
     set position = cardinality(v_targets) + d.ord
    from (select x.id, row_number() over (order by x.position, x.id) as ord
            from public.object_references x
           where x.scene_property_id = p_property_id and x.source_scene_id = p_scene_id
             and not (coalesce(x.target_entry_id, x.target_document_id, x.target_scene_id) = any (v_targets))) d
   where r.id = d.id and r.position <> cardinality(v_targets) + d.ord;
  insert into public.object_references
    (project_id, source_type, source_scene_id, target_type, target_entry_id, target_document_id, target_scene_id,
     scene_property_id, position)
  select v_project_id, 'scene', p_scene_id, v_property.relation_target,
         case when v_property.relation_target = 'entry' then o.t end,
         case when v_property.relation_target = 'page' then o.t end,
         case when v_property.relation_target = 'scene' then o.t end,
         p_property_id, o.ord
    from unnest(v_targets) with ordinality as o(t, ord)
   where not exists (select 1 from public.object_references r
                      where r.scene_property_id = p_property_id and r.source_scene_id = p_scene_id
                        and coalesce(r.target_entry_id, r.target_document_id, r.target_scene_id) = o.t);

  return jsonb_build_object('status', 'ok', 'targets', to_jsonb(v_targets));
end;
$function$;

-- ── Functions: Scene Views ──────────────────────────────────────────────────

-- Adds a View at the end of the Manuscript's Scene Views. p_config null: the
-- type's defaults.
create function public.create_scene_view(p_project_id uuid, p_name text, p_type text, p_config jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_manuscript_id uuid;
  v_name text := left(btrim(coalesce(p_name, '')), 100);
  v_config jsonb;
  v_view public.scene_views%rowtype;
begin
  v_manuscript_id := public.owned_project_manuscript(p_project_id);
  if v_manuscript_id is null then
    return jsonb_build_object('status', 'error', 'error', 'Manuscript not found');
  end if;
  perform public.lock_project_workspace(p_project_id);

  if p_type is null or p_type not in ('list', 'table', 'board') then
    return jsonb_build_object('status', 'error', 'error', 'Unknown view type');
  end if;
  if v_name = '' then
    v_name := case p_type when 'list' then 'List' when 'table' then 'Table' else 'Board' end;
  end if;
  if (select count(*) from public.scene_views v where v.manuscript_id = v_manuscript_id) >= 50 then
    return jsonb_build_object('status', 'error', 'error', 'A manuscript can have at most 50 scene views');
  end if;

  if p_config is null or p_config = 'null'::jsonb then
    v_config := public.default_scene_view_config(v_manuscript_id, p_type);
  else
    if not public.workspace_view_config_shape_valid(p_config) then
      return jsonb_build_object('status', 'error', 'error', 'Invalid view configuration');
    end if;
    v_config := public.normalize_workspace_view_config(p_config);
    if v_config is distinct from public.prune_scene_view_config(v_manuscript_id, v_config) then
      return jsonb_build_object('status', 'error', 'error', 'Invalid view configuration');
    end if;
  end if;
  if p_type = 'board' and jsonb_typeof(v_config -> 'group_by') = 'null' then
    v_config := jsonb_set(v_config, '{group_by}', public.default_scene_view_config(v_manuscript_id, 'board') -> 'group_by');
  end if;

  insert into public.scene_views (manuscript_id, project_id, name, type, position, config)
  select v_manuscript_id, p_project_id, v_name, p_type, coalesce(max(v.position), 0) + 1, v_config
    from public.scene_views v
   where v.manuscript_id = v_manuscript_id
  returning * into v_view;

  return jsonb_build_object('status', 'ok', 'view', to_jsonb(v_view));
end;
$function$;

-- Changes a Scene View's name, type and/or config (the whole config, naming
-- only this Manuscript's Scene fields). A Board with no grouping takes the
-- first status (else select) property, if there is one.
create function public.update_scene_view(p_view_id uuid, p_changes jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_old public.scene_views%rowtype;
  v_new public.scene_views%rowtype;
  v_key text;
begin
  select v.* into v_old
    from public.scene_views v
    join public.projects p on p.id = v.project_id
   where v.id = p_view_id and p.user_id = auth.uid();
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'View not found');
  end if;
  perform public.lock_project_workspace(v_old.project_id);
  -- Re-read under the lock.
  select * into v_old from public.scene_views where id = p_view_id;
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'View not found');
  end if;
  v_new := v_old;

  if jsonb_typeof(p_changes) is distinct from 'object' then
    return jsonb_build_object('status', 'error', 'error', 'Nothing to change');
  end if;
  for v_key in select jsonb_object_keys(p_changes) loop
    if v_key not in ('name', 'type', 'config') then
      return jsonb_build_object('status', 'error', 'error', format('Unknown change: %s', v_key));
    end if;
  end loop;

  if p_changes ? 'name' then
    if jsonb_typeof(p_changes -> 'name') is distinct from 'string' or btrim(p_changes ->> 'name') = '' then
      return jsonb_build_object('status', 'error', 'error', 'A view needs a name');
    end if;
    v_new.name := left(btrim(p_changes ->> 'name'), 100);
  end if;

  if p_changes ? 'type' then
    if (p_changes ->> 'type') is null or (p_changes ->> 'type') not in ('list', 'table', 'board') then
      return jsonb_build_object('status', 'error', 'error', 'Unknown view type');
    end if;
    v_new.type := p_changes ->> 'type';
  end if;

  if p_changes ? 'config' then
    if not public.workspace_view_config_shape_valid(p_changes -> 'config') then
      return jsonb_build_object('status', 'error', 'error', 'Invalid view configuration');
    end if;
    v_new.config := public.normalize_workspace_view_config(p_changes -> 'config');
    if v_new.config is distinct from public.prune_scene_view_config(v_old.manuscript_id, v_new.config) then
      return jsonb_build_object('status', 'error', 'error', 'Invalid view configuration');
    end if;
  end if;

  if v_new.type = 'board' and jsonb_typeof(v_new.config -> 'group_by') = 'null' then
    v_new.config := jsonb_set(v_new.config, '{group_by}',
      public.default_scene_view_config(v_old.manuscript_id, 'board') -> 'group_by');
  end if;

  update public.scene_views
     set name = v_new.name, type = v_new.type, config = v_new.config
   where id = v_old.id
  returning * into v_new;

  return jsonb_build_object('status', 'ok', 'view', to_jsonb(v_new));
end;
$function$;

-- Moves a Scene View to `p_index` (0-based) among the Manuscript's.
create function public.move_scene_view(p_view_id uuid, p_index integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_view public.scene_views%rowtype;
  v_count integer;
  v_target integer;
begin
  select v.* into v_view
    from public.scene_views v
    join public.projects p on p.id = v.project_id
   where v.id = p_view_id and p.user_id = auth.uid();
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'View not found');
  end if;
  perform public.lock_project_workspace(v_view.project_id);

  select count(*) into v_count from public.scene_views v where v.manuscript_id = v_view.manuscript_id;
  v_target := greatest(0, least(coalesce(p_index, v_count - 1), v_count - 1)) + 1;

  update public.scene_views v
     set position = o.next
    from (
      select id, row_number() over (order by (id = p_view_id), position) as rank
        from public.scene_views
       where manuscript_id = v_view.manuscript_id
    ) r
    cross join lateral (
      select case
               when r.id = p_view_id then v_target
               when r.rank < v_target then r.rank
               else r.rank + 1
             end as next
    ) o
   where v.id = r.id and v.position <> o.next;

  select * into v_view from public.scene_views where id = p_view_id;
  return jsonb_build_object('status', 'ok', 'view', to_jsonb(v_view));
end;
$function$;

-- Deletes a Scene View — configuration only: no Scene, value or prose is
-- touched. A Manuscript may keep none (its Scenes then show in manuscript
-- order, unsaved).
create function public.delete_scene_view(p_view_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_view public.scene_views%rowtype;
begin
  select v.* into v_view
    from public.scene_views v
    join public.projects p on p.id = v.project_id
   where v.id = p_view_id and p.user_id = auth.uid();
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'View not found');
  end if;
  perform public.lock_project_workspace(v_view.project_id);

  delete from public.scene_views v where v.id = p_view_id;
  update public.scene_views v
     set position = r.rank
    from (select id, row_number() over (order by position) as rank
            from public.scene_views
           where manuscript_id = v_view.manuscript_id) r
   where v.id = r.id and v.position <> r.rank;
  return jsonb_build_object('status', 'ok');
end;
$function$;

-- ── Trash: Scene Relationships that point at a Collection ───────────────────

-- As 031, except that a trashed Collection's `properties` counts the Scene
-- Relationships pointing at it too (they go if it is deleted permanently).
create or replace function public.list_workspace_trash(p_project_id uuid)
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
               null::integer as entries, null::integer as properties,
               null::uuid as from_chapter_id, null::text as from_chapter_title, null::boolean as from_chapter_active
          from public.workspace_documents d
          left join public.workspace_folders ff on ff.id = d.trashed_from_folder_id
         where d.project_id = p_project_id and d.trashed_at is not null
        union all
        select 'folder', f.id, f.title, f.trashed_at,
               f.trashed_from_folder_id, ff.title, (ff.id is not null and ff.trashed_at is null),
               null, null, null, null, null, null, null, null
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
               null, null, null
          from public.workspace_collections c
          left join public.workspace_folders ff on ff.id = c.trashed_from_folder_id
         where c.project_id = p_project_id and c.trashed_at is not null
        union all
        select 'entry', e.id, e.title, e.trashed_at,
               null, null, null,
               c.id, c.title, c.trashed_at is null,
               null, null, null, null, null
          from public.workspace_collection_entries e
          join public.workspace_collections c on c.id = e.collection_id
         where e.project_id = p_project_id and e.trashed_at is not null
        union all
        select 'scene', s.id, s.title, s.trashed_at,
               null, null, null, null, null, null, null, null,
               s.trashed_from_chapter_id, ch.title, ch.id is not null
          from public.scenes s
          join public.manuscripts m on m.id = s.manuscript_id
          left join public.chapters ch on ch.id = s.trashed_from_chapter_id and ch.manuscript_id = s.manuscript_id
         where m.project_id = p_project_id and s.trashed_at is not null
      ) t), '[]'::jsonb));
end;
$function$;

-- As 031, except that `properties` counts the Scene Relationships pointing at a
-- deleted Collection too (scene_property_definitions_relation_target_fkey takes
-- them, and their values, with it — never a Scene).
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
    v_properties := v_properties
      + (select count(*) from public.scene_property_definitions sp where sp.relation_collection_id = p_id);
    delete from public.workspace_collection_entries e where e.collection_id = p_id;
    get diagnostics v_entries = row_count;
    delete from public.workspace_collections c where c.id = p_id;
  end if;
  return jsonb_build_object('status', 'ok', 'entries', v_entries, 'properties', v_properties);
end;
$function$;

revoke execute on function public.create_scene_property(uuid, text, text) from public, anon;
revoke execute on function public.create_scene_relationship_property(uuid, text, text, uuid, boolean) from public, anon;
revoke execute on function public.update_scene_property(uuid, jsonb) from public, anon;
revoke execute on function public.move_scene_property(uuid, integer) from public, anon;
revoke execute on function public.delete_scene_property(uuid, integer) from public, anon;
revoke execute on function public.set_scene_property_value(uuid, uuid, jsonb) from public, anon;
revoke execute on function public.set_scene_relationship(uuid, uuid, uuid[]) from public, anon;
revoke execute on function public.create_scene_view(uuid, text, text, jsonb) from public, anon;
revoke execute on function public.update_scene_view(uuid, jsonb) from public, anon;
revoke execute on function public.move_scene_view(uuid, integer) from public, anon;
revoke execute on function public.delete_scene_view(uuid) from public, anon;

insert into public.schema_migrations (version, name, applied_at, note)
values ('032', '032_scene_properties_views.sql', now(), 'Scene Properties and Scene Views: scene_property_definitions (typed, ordered, per Manuscript; Relationship to Entries, Pages or Scenes), scene_property_values (one checked value per Scene and property; never the Scene row), scene_views (saved List/Table/Board over the Manuscript''s Scenes; manuscript order by default; words and placement as read-only fields); Scene Relationship values are object_references rows (scene_property_id); one owner-agnostic prune_view_config for Collection and Scene Views, with contains / greater / less filters, Relationship filters and Relationship grouping; client read-only, writes through SECURITY DEFINER functions');
