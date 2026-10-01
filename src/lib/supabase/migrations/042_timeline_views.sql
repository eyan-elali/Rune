-- ── Migration 042: Timeline Views ────────────────────────────────────────────
--
-- Rune 2.0, Milestone 20. A saved View — a Collection's (027) or the
-- Manuscript's Scene View (032) — can now be a TIMELINE: the same items,
-- arranged along one horizontal axis. Timeline is a View like List, Table and
-- Board: configuration only, never an item, a value or any prose, and never a
-- Timeline object of its own.
--
-- The View config gains one OPTIONAL key:
--   axis: null | "<field id>"
--     A Scene View: "manuscript" — the Scene's actual place in the manuscript
--     (Group → Chapter → Scene), derived from the structure every time and
--     never stored — or a number or date Scene property.
--     A Collection View: a number or date property of the Collection.
--   Lanes, when a Timeline has them, are the existing group_by (a select or
--   status property, or a Relationship to a Collection's Entries), exactly
--   as a Board's columns: one rule, one pruning.
--
--   * type check constraints on workspace_collection_views and scene_views —
--     REPLACED: 'timeline' joins list | table | board.
--   * workspace_view_config_shape_valid — REDEFINED (a superset): also
--     accepts axis (null or a string of at most 100 characters).
--   * normalize_workspace_view_config — REDEFINED: keeps axis when the config
--     has it (as widths, 034). A config without axis normalises exactly as
--     before, so every stored and every default config stays valid.
--   * manuscript_scene_view_fields — REDEFINED: the Manuscript's fields also
--     include { id: "manuscript", type: "position", native: true } — the
--     manuscript-position axis. It is an axis only: never a shown property,
--     a sort, a filter or a grouping.
--   * prune_view_config — REDEFINED: axis is kept while it names a number or
--     date property (never a read-only field: a Scene's words are a count,
--     not a chronology), or the "position" field (which only a Manuscript offers, so
--     "manuscript" is refused for a Collection View); "position" is never a
--     shown property. Everything else is pruned exactly as before.
--   * default_workspace_view_config / default_scene_view_config — REDEFINED:
--     a new Timeline shows only names, and its axis is the manuscript (Scenes)
--     or the first date property, else the first number property (Entries).
--   * create_/update_workspace_collection_view and create_/update_scene_view —
--     REDEFINED: accept 'timeline' (default name "Timeline"); a Timeline saved
--     without an axis takes the default one, as a Board takes a grouping.
--   * sync_workspace_views_with_property / sync_scene_views_with_property —
--     REDEFINED: a new date or number property becomes the axis of every
--     Timeline that has none (as a new select/status becomes an ungrouped
--     Board's grouping). A deleted or changed property prunes an axis naming
--     it, through the existing pruning.
--
-- No table, column, row, policy or trigger changes beyond the two check
-- constraints: axis lives inside the existing config column and is written
-- through the existing View functions. Nothing here touches a manuscript
-- table, a Scene, a value, an Entry, or the manuscript's order: a Timeline
-- reads the manuscript's structure; it never writes it.
--
-- For the Rune 2.0 database only: it requires 041. Apply it BEFORE the app
-- deploy that offers Timeline views (without it, creating one is refused as an
-- unknown view type and nothing else is affected). The previous app never
-- creates a Timeline and never sends axis; when it saves a View it sends back
-- the config it read, axis included, so it does not erase it.
-- Rollback (Timelines are only configuration):
--   delete from public.workspace_collection_views where type = 'timeline';
--   delete from public.scene_views where type = 'timeline';
--   update public.workspace_collection_views set config = config - 'axis' where config ? 'axis';
--   update public.scene_views set config = config - 'axis' where config ? 'axis';
--   re-create the two type check constraints as 027 / 032, and
--   workspace_view_config_shape_valid, normalize_workspace_view_config and
--   prune_view_config as 034; manuscript_scene_view_fields,
--   default_scene_view_config, create_scene_view, update_scene_view and
--   sync_scene_views_with_property as 032; default_workspace_view_config,
--   create_workspace_collection_view, update_workspace_collection_view and
--   sync_workspace_views_with_property as 027;
--   delete from public.schema_migrations where version = '042';
-- Apply as ONE script (psql -1, or the SQL editor).

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 042 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '042') then
    raise exception 'Migration 042 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '041') then
    raise exception 'Migration 042 requires migration 041 (project backup read). Nothing was changed.';
  end if;
  if (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.workspace_collection_views'::regclass) <> current_user
     or (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.scene_views'::regclass) <> current_user then
    raise exception 'Migration 042 must be applied by the owner of public.workspace_collection_views and public.scene_views (%). Nothing was changed.',
      current_user;
  end if;
end
$$;

-- ── The View type ───────────────────────────────────────────────────────────

alter table public.workspace_collection_views drop constraint workspace_collection_views_type_check;
alter table public.workspace_collection_views add constraint workspace_collection_views_type_check
  check (type in ('list', 'table', 'board', 'timeline'));

alter table public.scene_views drop constraint scene_views_type_check;
alter table public.scene_views add constraint scene_views_type_check
  check (type in ('list', 'table', 'board', 'timeline'));

-- ── View rules, for every owner ─────────────────────────────────────────────

-- As 034, plus axis.
create or replace function public.workspace_view_config_shape_valid(p_config jsonb)
 returns boolean
 language sql
 immutable
 set search_path to ''
as $function$
  select jsonb_typeof(p_config) = 'object'
     and not exists (select 1 from jsonb_object_keys(p_config) k where k not in ('properties', 'sort', 'filters', 'group_by', 'widths', 'axis'))
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
     and (not p_config ? 'group_by' or jsonb_typeof(p_config -> 'group_by') in ('null', 'string'))
     -- widths: { key: integer 80–640 }, at most 210 keys of at most 100 characters
     and (not p_config ? 'widths' or (
           jsonb_typeof(p_config -> 'widths') = 'object'
       and (select count(*) from jsonb_object_keys(p_config -> 'widths')) <= 210
       and not exists (
             select 1 from jsonb_each(p_config -> 'widths') w
              where char_length(w.key) > 100
                 or jsonb_typeof(w.value) <> 'number'
                 or (w.value #>> '{}')::numeric <> floor((w.value #>> '{}')::numeric)
                 or (w.value #>> '{}')::numeric not between 80 and 640)))
     -- axis: null or a string (a field id)
     and (not p_config ? 'axis' or jsonb_typeof(p_config -> 'axis') = 'null'
          or (jsonb_typeof(p_config -> 'axis') = 'string' and char_length(p_config ->> 'axis') between 1 and 100));
$function$;

-- As 034; axis is kept when present (and only then), like widths.
create or replace function public.normalize_workspace_view_config(p_config jsonb)
 returns jsonb
 language sql
 immutable
 set search_path to ''
as $function$
  select jsonb_build_object(
    'properties', coalesce(p_config -> 'properties', '[]'::jsonb),
    'sort',       coalesce(p_config -> 'sort', 'null'::jsonb),
    'filters',    coalesce(p_config -> 'filters', '[]'::jsonb),
    'group_by',   coalesce(p_config -> 'group_by', 'null'::jsonb))
    || case when p_config ? 'widths' then jsonb_build_object('widths', p_config -> 'widths') else '{}'::jsonb end
    || case when p_config ? 'axis' then jsonb_build_object('axis', p_config -> 'axis') else '{}'::jsonb end;
$function$;

-- As 034, plus axis; a "position" field is an axis only.
create or replace function public.prune_view_config(p_fields jsonb, p_config jsonb)
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
         where exists (select 1 from fields where fields.id = x #>> '{}' and fields.type <> 'position')), '[]'::jsonb),
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
    -- widths: kept only for the name column and fields that exist; the key
    -- is present exactly when the config had it.
    || case when c.v ? 'widths' then jsonb_build_object('widths', coalesce((
         select jsonb_object_agg(w.key, w.value)
           from jsonb_each(c.v -> 'widths') w
          where w.key = 'title' or exists (select 1 from fields where fields.id = w.key)), '{}'::jsonb))
       else '{}'::jsonb end
    -- axis: a number or date field, or the manuscript position; the key is
    -- present exactly when the config had it.
    || case when c.v ? 'axis' then jsonb_build_object('axis', (
         select case
                  when exists (select 1 from fields where fields.id = c.v ->> 'axis'
                                  and ((fields.type in ('number', 'date') and not fields.native) or fields.type = 'position'))
                    then c.v -> 'axis'
                  else 'null'::jsonb
                end))
       else '{}'::jsonb end
  from c;
$function$;

-- As 032, plus the manuscript-position axis.
create or replace function public.manuscript_scene_view_fields(p_manuscript_id uuid)
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
                              'options', '[{"id": "placed", "name": "Placed"}, {"id": "unplaced", "name": "Unplaced"}]'::jsonb),
           jsonb_build_object('id', 'manuscript', 'type', 'position', 'native', true));
$function$;

-- ── Defaults ────────────────────────────────────────────────────────────────

-- As 027, plus a Timeline: names only, along the first date property, else
-- the first number property, else nothing yet.
create or replace function public.default_workspace_view_config(p_collection_id uuid, p_type text)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  select jsonb_build_object(
    'properties', case p_type
      when 'board' then '[]'::jsonb
      when 'timeline' then '[]'::jsonb
      else coalesce((
        select jsonb_agg(to_jsonb(p.id::text) order by p.position)
          from public.workspace_collection_properties p
         where p.collection_id = p_collection_id
           and (p_type = 'table' or p.position <= 3)), '[]'::jsonb)
    end,
    'sort', 'null'::jsonb,
    'filters', '[]'::jsonb,
    'group_by', case p_type
      when 'board' then coalesce((
        select to_jsonb(p.id::text)
          from public.workspace_collection_properties p
         where p.collection_id = p_collection_id and p.type in ('status', 'select')
         order by (p.type = 'status') desc, p.position
         limit 1), 'null'::jsonb)
      else 'null'::jsonb
    end)
    || case when p_type = 'timeline' then jsonb_build_object('axis', coalesce((
         select to_jsonb(p.id::text)
           from public.workspace_collection_properties p
          where p.collection_id = p_collection_id and p.type in ('date', 'number')
          order by (p.type = 'date') desc, p.position
          limit 1), 'null'::jsonb))
       else '{}'::jsonb end;
$function$;

-- As 032, plus a Timeline: names only, along the manuscript.
create or replace function public.default_scene_view_config(p_manuscript_id uuid, p_type text)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  select jsonb_build_object(
    'properties', case p_type
      when 'board' then '[]'::jsonb
      when 'timeline' then '[]'::jsonb
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
    end)
    || case when p_type = 'timeline' then '{"axis": "manuscript"}'::jsonb else '{}'::jsonb end;
$function$;

-- ── Collection Views ────────────────────────────────────────────────────────

-- As 027, plus 'timeline'; a Timeline without an axis takes the default one.
create or replace function public.create_workspace_collection_view(p_collection_id uuid, p_name text, p_type text, p_config jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_project_id uuid;
  v_name text := left(btrim(coalesce(p_name, '')), 100);
  v_config jsonb;
  v_view public.workspace_collection_views%rowtype;
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

  if p_type is null or p_type not in ('list', 'table', 'board', 'timeline') then
    return jsonb_build_object('status', 'error', 'error', 'Unknown view type');
  end if;
  if v_name = '' then
    v_name := case p_type when 'list' then 'List' when 'table' then 'Table' when 'board' then 'Board' else 'Timeline' end;
  end if;
  if (select count(*) from public.workspace_collection_views v where v.collection_id = p_collection_id) >= 50 then
    return jsonb_build_object('status', 'error', 'error', 'A collection can have at most 50 views');
  end if;

  if p_config is null or p_config = 'null'::jsonb then
    v_config := public.default_workspace_view_config(p_collection_id, p_type);
  else
    if not public.workspace_view_config_shape_valid(p_config) then
      return jsonb_build_object('status', 'error', 'error', 'Invalid view configuration');
    end if;
    v_config := public.normalize_workspace_view_config(p_config);
    if v_config is distinct from public.prune_workspace_view_config(p_collection_id, v_config) then
      return jsonb_build_object('status', 'error', 'error', 'Invalid view configuration');
    end if;
  end if;
  if p_type = 'timeline' and jsonb_typeof(v_config -> 'axis') is distinct from 'string' then
    v_config := jsonb_set(v_config, '{axis}', public.default_workspace_view_config(p_collection_id, 'timeline') -> 'axis');
  end if;

  insert into public.workspace_collection_views (collection_id, project_id, name, type, position, config)
  select p_collection_id, v_project_id, v_name, p_type, coalesce(max(v.position), 0) + 1, v_config
    from public.workspace_collection_views v
   where v.collection_id = p_collection_id
  returning * into v_view;

  return jsonb_build_object('status', 'ok', 'view', to_jsonb(v_view));
end;
$function$;

-- As 027, plus 'timeline'; a Timeline with no axis takes the default one.
create or replace function public.update_workspace_collection_view(p_view_id uuid, p_changes jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_old public.workspace_collection_views%rowtype;
  v_new public.workspace_collection_views%rowtype;
  v_key text;
begin
  select v.* into v_old
    from public.workspace_collection_views v
    join public.projects p on p.id = v.project_id
   where v.id = p_view_id and p.user_id = auth.uid();
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'View not found');
  end if;
  perform public.lock_project_workspace(v_old.project_id);
  -- Re-read under the lock.
  select * into v_old from public.workspace_collection_views where id = p_view_id;
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
    if (p_changes ->> 'type') is null or (p_changes ->> 'type') not in ('list', 'table', 'board', 'timeline') then
      return jsonb_build_object('status', 'error', 'error', 'Unknown view type');
    end if;
    v_new.type := p_changes ->> 'type';
  end if;

  if p_changes ? 'config' then
    if not public.workspace_view_config_shape_valid(p_changes -> 'config') then
      return jsonb_build_object('status', 'error', 'error', 'Invalid view configuration');
    end if;
    v_new.config := public.normalize_workspace_view_config(p_changes -> 'config');
    if v_new.config is distinct from public.prune_workspace_view_config(v_old.collection_id, v_new.config) then
      return jsonb_build_object('status', 'error', 'error', 'Invalid view configuration');
    end if;
  end if;

  if v_new.type = 'board' and jsonb_typeof(v_new.config -> 'group_by') = 'null' then
    v_new.config := jsonb_set(v_new.config, '{group_by}',
      public.default_workspace_view_config(v_old.collection_id, 'board') -> 'group_by');
  end if;
  if v_new.type = 'timeline' and jsonb_typeof(v_new.config -> 'axis') is distinct from 'string' then
    v_new.config := jsonb_set(v_new.config, '{axis}',
      public.default_workspace_view_config(v_old.collection_id, 'timeline') -> 'axis');
  end if;

  update public.workspace_collection_views
     set name = v_new.name, type = v_new.type, config = v_new.config
   where id = v_old.id
  returning * into v_new;

  return jsonb_build_object('status', 'ok', 'view', to_jsonb(v_new));
end;
$function$;

-- As 027, plus: a new date or number property becomes the axis of every
-- Timeline that has none.
create or replace function public.sync_workspace_views_with_property()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare
  v_collection_id uuid := coalesce(new.collection_id, old.collection_id);
begin
  -- The Collection itself is being deleted: its Views go with it.
  if not exists (select 1 from public.workspace_collections c where c.id = v_collection_id) then
    return null;
  end if;

  if tg_op = 'INSERT' then
    update public.workspace_collection_views v
       set config = jsonb_set(v.config, '{properties}', (v.config -> 'properties') || to_jsonb(new.id::text))
     where v.collection_id = v_collection_id
       and (v.type = 'table' or jsonb_array_length(v.config -> 'properties') < 3);
    if new.type in ('select', 'status') then
      update public.workspace_collection_views v
         set config = jsonb_set(v.config, '{group_by}', to_jsonb(new.id::text))
       where v.collection_id = v_collection_id and v.type = 'board' and jsonb_typeof(v.config -> 'group_by') = 'null';
    end if;
    if new.type in ('date', 'number') then
      update public.workspace_collection_views v
         set config = jsonb_set(v.config, '{axis}', to_jsonb(new.id::text))
       where v.collection_id = v_collection_id and v.type = 'timeline' and jsonb_typeof(v.config -> 'axis') is distinct from 'string';
    end if;
    return null;
  end if;

  update public.workspace_collection_views v
     set config = public.prune_workspace_view_config(v_collection_id, v.config)
   where v.collection_id = v_collection_id
     and v.config is distinct from public.prune_workspace_view_config(v_collection_id, v.config);
  return null;
end;
$function$;

-- ── Scene Views ─────────────────────────────────────────────────────────────

-- As 032, plus 'timeline'; a Timeline without an axis is along the manuscript.
create or replace function public.create_scene_view(p_project_id uuid, p_name text, p_type text, p_config jsonb)
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

  if p_type is null or p_type not in ('list', 'table', 'board', 'timeline') then
    return jsonb_build_object('status', 'error', 'error', 'Unknown view type');
  end if;
  if v_name = '' then
    v_name := case p_type when 'list' then 'List' when 'table' then 'Table' when 'board' then 'Board' else 'Timeline' end;
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
  if p_type = 'timeline' and jsonb_typeof(v_config -> 'axis') is distinct from 'string' then
    v_config := jsonb_set(v_config, '{axis}', public.default_scene_view_config(v_manuscript_id, 'timeline') -> 'axis');
  end if;

  insert into public.scene_views (manuscript_id, project_id, name, type, position, config)
  select v_manuscript_id, p_project_id, v_name, p_type, coalesce(max(v.position), 0) + 1, v_config
    from public.scene_views v
   where v.manuscript_id = v_manuscript_id
  returning * into v_view;

  return jsonb_build_object('status', 'ok', 'view', to_jsonb(v_view));
end;
$function$;

-- As 032, plus 'timeline'; a Timeline with no axis is along the manuscript.
create or replace function public.update_scene_view(p_view_id uuid, p_changes jsonb)
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
    if (p_changes ->> 'type') is null or (p_changes ->> 'type') not in ('list', 'table', 'board', 'timeline') then
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
  if v_new.type = 'timeline' and jsonb_typeof(v_new.config -> 'axis') is distinct from 'string' then
    v_new.config := jsonb_set(v_new.config, '{axis}',
      public.default_scene_view_config(v_old.manuscript_id, 'timeline') -> 'axis');
  end if;

  update public.scene_views
     set name = v_new.name, type = v_new.type, config = v_new.config
   where id = v_old.id
  returning * into v_new;

  return jsonb_build_object('status', 'ok', 'view', to_jsonb(v_new));
end;
$function$;

-- As 032, plus: a new date or number property becomes the axis of every
-- Timeline that has none (a Scene Timeline normally has the manuscript).
create or replace function public.sync_scene_views_with_property()
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
    if new.type in ('date', 'number') then
      update public.scene_views v
         set config = jsonb_set(v.config, '{axis}', to_jsonb(new.id::text))
       where v.manuscript_id = v_manuscript_id and v.type = 'timeline' and jsonb_typeof(v.config -> 'axis') is distinct from 'string';
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

insert into public.schema_migrations (version, name, applied_at, note)
values ('042', '042_timeline_views.sql', now(), 'Timeline Views: ''timeline'' joins the Collection and Scene View types; an optional axis key in the View config (a number or date property, or "manuscript" for a Scene View''s manuscript position), pruned with the fields it names; lanes are the existing group_by');
