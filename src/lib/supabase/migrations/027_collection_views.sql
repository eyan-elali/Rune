-- ── Migration 027: Collection Views ─────────────────────────────────────────
--
-- Rune 2.0 Workspace, Milestone 10. A Collection presents its one set of
-- Entries in saved Views — List, Table, Board (architecture §18). A View is
-- configuration only: which properties it shows and in what order, how it
-- sorts, which Entries it filters to, and (a Board) which property it groups
-- by. It never holds an Entry, a value or any writing, so deleting a View can
-- never delete one. Every View of a Collection shows the same Entries and the
-- same values (workspace_entry_values): an edit in one is an edit in all.
--
-- public.workspace_collection_views — NEW. One row is one saved View.
--   * Belongs to one Collection for life; project_id is that Collection's
--     (composite FK). Deleting the Collection (only ever an empty one) takes
--     its Views with it.
--   * name: trimmed, 1–100 characters. Not unique ("Board" twice is allowed).
--   * type: list | table | board.
--   * position: 1..n within the Collection (the order of the View switcher).
--     The first View is the one a Collection opens in.
--   * config: always this normalised object —
--       { "properties": [property id, …],   shown, in order (List: the quiet
--                                            line under each name; Table: the
--                                            columns; Board: the card lines)
--         "sort":       null | { "by": "title" | property id,
--                                "direction": "asc" | "desc" },
--         "filters":    [ { "property": id, "op": "is" | "is_not", "value": option id }
--                       | { "property": id, "op": "is_empty" | "is_not_empty" } ],  all must hold
--         "group_by":   null | property id }  a select or status property (Board)
--     Every id is a property of THIS Collection (and every option id one of
--     that property's options): checked on every write
--     (workspace_collection_views_check). "is"/"is_not" apply to choice
--     properties only (a multi-select "is" means "includes"); sort never uses
--     a multi-select. A Collection's properties change under its Views, so a
--     property's removal, an option's removal or a type change prunes every
--     View of the Collection in the same statement (prune_workspace_view_config):
--     a View never names something that no longer exists.
--   * A new property joins every Table View's columns, and the List and
--     Board Views that show fewer than three properties (the rule 026 used
--     for shown_in_list); a new select or status property becomes the
--     grouping of a Board View that has none.
--
-- Default View: every Collection has at least one. A new Collection gets a
-- "List" View with it (trigger); this migration gives each existing Collection
-- one whose properties are exactly those 026 marked shown_in_list, in order —
-- so each list reads exactly as before. The last View cannot be deleted.
--
-- workspace_collection_properties.shown_in_list is kept, unchanged and still
-- writable, for the previous app; the new app reads visibility from the View.
-- It can be dropped once no deployed client writes it.
--
-- Writes: clients only READ the table (RLS: the Project's owner). Every change
-- goes through a SECURITY DEFINER function below, which checks ownership
-- against projects.user_id = auth.uid():
--   * create_workspace_collection_view(collection, name, type, config) → { view }
--       config null = sensible defaults for the type.
--   * update_workspace_collection_view(view, changes jsonb) → { view }
--       changes: any of name, type, config (the whole config).
--   * move_workspace_collection_view(view, index) → { view }
--   * delete_workspace_collection_view(view) — refused for the last View.
--
-- Nothing here touches a manuscript table, function or policy, or any Page,
-- Folder, node, Collection, Entry, property or value row.
--
-- For the Rune 2.0 database only: it requires 026. Apply BEFORE the app deploy
-- that uses it. The previous app never reads the new table; the new app shows
-- each Collection as its List (from shown_in_list) and offers no Views until
-- this is applied.
-- Rollback (drops every View; no content is lost):
--   drop trigger workspace_collections_default_view on public.workspace_collections;
--   drop trigger workspace_collection_properties_views_added on public.workspace_collection_properties;
--   drop trigger workspace_collection_properties_views_changed on public.workspace_collection_properties;
--   drop trigger workspace_collection_properties_views_removed on public.workspace_collection_properties;
--   drop table public.workspace_collection_views;
--   drop function public.create_workspace_collection_view(uuid, text, text, jsonb);
--   drop function public.update_workspace_collection_view(uuid, jsonb);
--   drop function public.move_workspace_collection_view(uuid, integer);
--   drop function public.delete_workspace_collection_view(uuid);
--   drop function public.create_default_workspace_collection_view();
--   drop function public.sync_workspace_views_with_property();
--   drop function public.check_workspace_collection_view();
--   drop function public.default_workspace_view_config(uuid, text);
--   drop function public.prune_workspace_view_config(uuid, jsonb);
--   drop function public.normalize_workspace_view_config(jsonb);
--   drop function public.workspace_view_config_shape_valid(jsonb);
--   delete from public.schema_migrations where version = '027';
-- Apply as ONE script (psql -1, or the SQL editor).

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 027 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '027') then
    raise exception 'Migration 027 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '026') then
    raise exception 'Migration 027 requires migration 026 (collection properties). Nothing was changed.';
  end if;
  -- As in 024–026: the SECURITY DEFINER functions run as their owner, which
  -- must own the Workspace tables or they would be subject to RLS.
  if (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.workspace_collections'::regclass) <> current_user then
    raise exception 'Migration 027 must be applied by the owner of public.workspace_collections (%, not %). Nothing was changed.',
      (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.workspace_collections'::regclass), current_user;
  end if;
end
$$;

-- ── Configuration rules ─────────────────────────────────────────────────────

-- The form of a config, before its references are checked: only the four
-- keys, each of its type; at most 200 shown properties (distinct) and 20
-- filters. Missing keys are allowed here (normalize fills them in).
create function public.workspace_view_config_shape_valid(p_config jsonb)
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
                 or (f ->> 'op') not in ('is', 'is_not', 'is_empty', 'is_not_empty')
                 or ((f ->> 'op') in ('is', 'is_not') and jsonb_typeof(f -> 'value') is distinct from 'string')
                 or ((f ->> 'op') in ('is_empty', 'is_not_empty') and f ? 'value'))))
     -- group_by: null or a string
     and (not p_config ? 'group_by' or jsonb_typeof(p_config -> 'group_by') in ('null', 'string'));
$function$;

-- A config with every key present (missing ones take their empty default).
create function public.normalize_workspace_view_config(p_config jsonb)
 returns jsonb
 language sql
 immutable
 set search_path to ''
as $function$
  select jsonb_build_object(
    'properties', coalesce(p_config -> 'properties', '[]'::jsonb),
    'sort',       coalesce(p_config -> 'sort', 'null'::jsonb),
    'filters',    coalesce(p_config -> 'filters', '[]'::jsonb),
    'group_by',   coalesce(p_config -> 'group_by', 'null'::jsonb));
$function$;

-- A (well-formed) config with every reference that isn't valid for the
-- Collection's current properties removed: shown properties that don't exist,
-- a sort by a missing or multi-select property, a grouping by a missing or
-- non-select/status property, filters on a missing property or option (or
-- "is" on a non-choice property). Order is kept. A config is valid exactly
-- when pruning its normalised form changes nothing.
create function public.prune_workspace_view_config(p_collection_id uuid, p_config jsonb)
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
                 when exists (select 1 from props where props.id = c.v -> 'sort' ->> 'by' and props.type <> 'multi_select')
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

-- The config a new View of `p_type` starts with: a List shows the first three
-- properties, a Table every property, a Board groups by the first status
-- property (else the first select) and shows only names on its cards.
create function public.default_workspace_view_config(p_collection_id uuid, p_type text)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  select jsonb_build_object(
    'properties', case p_type
      when 'board' then '[]'::jsonb
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
    end);
$function$;

revoke execute on function public.workspace_view_config_shape_valid(jsonb) from public, anon;
revoke execute on function public.normalize_workspace_view_config(jsonb) from public, anon;
revoke execute on function public.prune_workspace_view_config(uuid, jsonb) from public, anon;
revoke execute on function public.default_workspace_view_config(uuid, text) from public, anon;

-- ── Views ───────────────────────────────────────────────────────────────────

create table public.workspace_collection_views (
  id             uuid        default gen_random_uuid() not null,
  collection_id  uuid        not null,
  project_id     uuid        not null,                                -- the Collection's Project
  name           text        not null,
  type           text        not null,
  position       integer     not null,
  config         jsonb       default '{"properties": [], "sort": null, "filters": [], "group_by": null}'::jsonb not null,
  created_at     timestamptz default now() not null,
  updated_at     timestamptz default now() not null
);

alter table public.workspace_collection_views add constraint workspace_collection_views_pkey primary key (id);
alter table public.workspace_collection_views add constraint workspace_collection_views_collection_same_project_fkey
  foreign key (collection_id, project_id) references public.workspace_collections(id, project_id) on delete cascade;
alter table public.workspace_collection_views add constraint workspace_collection_views_name_check
  check (name = btrim(name) and name <> '' and char_length(name) <= 100);
alter table public.workspace_collection_views add constraint workspace_collection_views_type_check
  check (type in ('list', 'table', 'board'));
alter table public.workspace_collection_views add constraint workspace_collection_views_position_check
  check (position > 0);
-- 1..n within a Collection; moves renumber inside one statement.
alter table public.workspace_collection_views add constraint workspace_collection_views_collection_id_position_key
  unique (collection_id, position) deferrable initially deferred;

create index workspace_collection_views_project_id_idx
  on public.workspace_collection_views using btree (project_id);

-- The config is checked against the Collection's properties, the Collection is
-- kept for life, and the database owns the timestamps.
create function public.check_workspace_collection_view()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if tg_op = 'UPDATE' and new.collection_id is distinct from old.collection_id then
    raise exception 'A view cannot move to another Collection' using errcode = 'check_violation';
  end if;
  if not public.workspace_view_config_shape_valid(new.config)
     or new.config is distinct from public.prune_workspace_view_config(new.collection_id, new.config) then
    raise exception 'Invalid view configuration' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
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

revoke execute on function public.check_workspace_collection_view() from public, anon;

create trigger workspace_collection_views_forbid_project_reassignment before update of project_id on public.workspace_collection_views
  for each row execute function public.forbid_project_reassignment();
create trigger workspace_collection_views_check before insert or update on public.workspace_collection_views
  for each row execute function public.check_workspace_collection_view();

alter table public.workspace_collection_views enable row level security;

create policy "workspace_collection_views: select own" on public.workspace_collection_views
  as permissive for select to authenticated
  using (exists (select 1 from public.projects p
                 where p.id = workspace_collection_views.project_id and p.user_id = (select auth.uid())));

revoke insert, update, delete on public.workspace_collection_views from anon, authenticated;

-- ── Views follow the Collection ─────────────────────────────────────────────

-- A new Collection opens in a List.
create function public.create_default_workspace_collection_view()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  insert into public.workspace_collection_views (collection_id, project_id, name, type, position)
  values (new.id, new.project_id, 'List', 'list', 1);
  return null;
end;
$function$;

revoke execute on function public.create_default_workspace_collection_view() from public, anon;

create trigger workspace_collections_default_view after insert on public.workspace_collections
  for each row execute function public.create_default_workspace_collection_view();

-- Keeps every View of a Collection in step with its properties:
--   added:   joins every Table's columns; the List and Board Views showing
--            fewer than three properties; a select/status becomes the
--            grouping of a Board with none.
--   changed: (type or options) references that no longer hold are pruned.
--   removed: every reference to it is pruned.
create function public.sync_workspace_views_with_property()
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
    return null;
  end if;

  update public.workspace_collection_views v
     set config = public.prune_workspace_view_config(v_collection_id, v.config)
   where v.collection_id = v_collection_id
     and v.config is distinct from public.prune_workspace_view_config(v_collection_id, v.config);
  return null;
end;
$function$;

revoke execute on function public.sync_workspace_views_with_property() from public, anon;

create trigger workspace_collection_properties_views_added after insert on public.workspace_collection_properties
  for each row execute function public.sync_workspace_views_with_property();
create trigger workspace_collection_properties_views_changed after update of type, options on public.workspace_collection_properties
  for each row execute function public.sync_workspace_views_with_property();
create trigger workspace_collection_properties_views_removed after delete on public.workspace_collection_properties
  for each row execute function public.sync_workspace_views_with_property();

-- ── Backfill: one List per existing Collection ──────────────────────────────

-- Exactly the list each Collection showed: its shown_in_list properties, in order.
insert into public.workspace_collection_views (collection_id, project_id, name, type, position, config)
select c.id, c.project_id, 'List', 'list', 1,
       jsonb_build_object(
         'properties', coalesce((
           select jsonb_agg(to_jsonb(p.id::text) order by p.position)
             from public.workspace_collection_properties p
            where p.collection_id = c.id and p.shown_in_list), '[]'::jsonb),
         'sort', 'null'::jsonb,
         'filters', '[]'::jsonb,
         'group_by', 'null'::jsonb)
  from public.workspace_collections c;

-- ── Functions ───────────────────────────────────────────────────────────────

-- Adds a View at the end of a Collection's Views. p_config null: the type's defaults.
create function public.create_workspace_collection_view(p_collection_id uuid, p_name text, p_type text, p_config jsonb)
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

  if p_type is null or p_type not in ('list', 'table', 'board') then
    return jsonb_build_object('status', 'error', 'error', 'Unknown view type');
  end if;
  if v_name = '' then
    v_name := case p_type when 'list' then 'List' when 'table' then 'Table' else 'Board' end;
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

  insert into public.workspace_collection_views (collection_id, project_id, name, type, position, config)
  select p_collection_id, v_project_id, v_name, p_type, coalesce(max(v.position), 0) + 1, v_config
    from public.workspace_collection_views v
   where v.collection_id = p_collection_id
  returning * into v_view;

  return jsonb_build_object('status', 'ok', 'view', to_jsonb(v_view));
end;
$function$;

-- Changes a View's name, type and/or config (the whole config, which must
-- name only this Collection's properties). A Board with no grouping takes
-- the first status (else select) property, if there is one.
create function public.update_workspace_collection_view(p_view_id uuid, p_changes jsonb)
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
    if v_new.config is distinct from public.prune_workspace_view_config(v_old.collection_id, v_new.config) then
      return jsonb_build_object('status', 'error', 'error', 'Invalid view configuration');
    end if;
  end if;

  if v_new.type = 'board' and jsonb_typeof(v_new.config -> 'group_by') = 'null' then
    v_new.config := jsonb_set(v_new.config, '{group_by}',
      public.default_workspace_view_config(v_old.collection_id, 'board') -> 'group_by');
  end if;

  update public.workspace_collection_views
     set name = v_new.name, type = v_new.type, config = v_new.config
   where id = v_old.id
  returning * into v_new;

  return jsonb_build_object('status', 'ok', 'view', to_jsonb(v_new));
end;
$function$;

-- Moves a View to `p_index` (0-based) among its Collection's Views.
create function public.move_workspace_collection_view(p_view_id uuid, p_index integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_view public.workspace_collection_views%rowtype;
  v_count integer;
  v_target integer;
begin
  select v.* into v_view
    from public.workspace_collection_views v
    join public.projects p on p.id = v.project_id
   where v.id = p_view_id and p.user_id = auth.uid();
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'View not found');
  end if;
  perform public.lock_project_workspace(v_view.project_id);

  select count(*) into v_count from public.workspace_collection_views v where v.collection_id = v_view.collection_id;
  v_target := greatest(0, least(coalesce(p_index, v_count - 1), v_count - 1)) + 1;

  -- One statement: the others close up around the moved one (position is
  -- unique, checked at commit).
  update public.workspace_collection_views v
     set position = o.next
    from (
      select id, row_number() over (order by (id = p_view_id), position) as rank
        from public.workspace_collection_views
       where collection_id = v_view.collection_id
    ) r
    cross join lateral (
      select case
               when r.id = p_view_id then v_target
               when r.rank < v_target then r.rank
               else r.rank + 1
             end as next
    ) o
   where v.id = r.id and v.position <> o.next;

  select * into v_view from public.workspace_collection_views where id = p_view_id;
  return jsonb_build_object('status', 'ok', 'view', to_jsonb(v_view));
end;
$function$;

-- Deletes a View — configuration only: no Entry, property or value is
-- touched. The last View of a Collection is kept.
create function public.delete_workspace_collection_view(p_view_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_view public.workspace_collection_views%rowtype;
begin
  select v.* into v_view
    from public.workspace_collection_views v
    join public.projects p on p.id = v.project_id
   where v.id = p_view_id and p.user_id = auth.uid();
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'View not found');
  end if;
  perform public.lock_project_workspace(v_view.project_id);

  if not exists (select 1 from public.workspace_collection_views v
                  where v.collection_id = v_view.collection_id and v.id <> p_view_id) then
    return jsonb_build_object('status', 'error', 'error', 'A collection keeps at least one view');
  end if;

  delete from public.workspace_collection_views v where v.id = p_view_id;
  update public.workspace_collection_views v
     set position = r.rank
    from (select id, row_number() over (order by position) as rank
            from public.workspace_collection_views
           where collection_id = v_view.collection_id) r
   where v.id = r.id and v.position <> r.rank;
  return jsonb_build_object('status', 'ok');
end;
$function$;

revoke execute on function public.create_workspace_collection_view(uuid, text, text, jsonb) from public, anon;
revoke execute on function public.update_workspace_collection_view(uuid, jsonb) from public, anon;
revoke execute on function public.move_workspace_collection_view(uuid, integer) from public, anon;
revoke execute on function public.delete_workspace_collection_view(uuid) from public, anon;

insert into public.schema_migrations (version, name, applied_at, note)
values ('027', '027_collection_views.sql', now(), 'Collection Views: workspace_collection_views (saved List/Table/Board configuration per Collection — shown properties, sort, filters, grouping — checked against the Collection''s own properties and pruned when they change); a default List per Collection (backfilled from shown_in_list); client read-only, writes through SECURITY DEFINER functions; the last View cannot be deleted');
