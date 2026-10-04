-- ── Migration 026: Collection Properties ────────────────────────────────────
--
-- Rune 2.0 Workspace, Milestone 9. A Collection defines its properties once
-- ("Role", "Status", "Affiliation") and each of its Entries holds values for
-- them (architecture §12–13, §16): structured information beside the Entry's
-- freeform body. Properties are always optional — a Collection with none is
-- exactly a Milestone 8 Collection. Rune gives no property a meaning.
--
-- public.workspace_collection_properties — NEW. One row is one property
-- definition of one Collection.
--   * Belongs to one Collection for life; project_id is that Collection's
--     (composite FK). Deleting the Collection (only ever an empty one) takes
--     its definitions with it: they are configuration, not writing.
--   * name: trimmed, 1–100 characters, unique within the Collection (ignoring
--     case).
--   * type: text | number | select | multi_select | status | date | checkbox.
--     Relationship is deferred to the relationships milestone (§17); a new
--     type is one more value here and one more branch in
--     workspace_property_value_valid.
--   * options: the choices of a select, multi_select or status property —
--     a JSON array of { "id": text, "name": text }, in display order, owned by
--     the property. Values refer to an option by its id, so renaming an
--     option renames it everywhere. Always [] for other types.
--   * position: 1..n within the Collection (the order the Entry shows them).
--   * shown_in_list: whether the Collection's list shows its values beside
--     each Entry's name — the one list setting before saved Views exist.
--
-- public.workspace_entry_values — NEW. One row is one Entry's value for one
-- property. No row = no value (a cleared value is deleted, never stored as
-- null, "", [] or false).
--   * (entry_id, collection_id) → the Entry and (property_id, collection_id)
--     → the property: both composite FKs name the same collection_id, so a
--     value for another Collection's property is impossible. Deleting a
--     property deletes its values (ON DELETE CASCADE) — only ever through
--     delete_workspace_collection_property, which requires the caller to
--     confirm how many values will go.
--   * value: JSON, by type — text: a non-blank string (≤ 2000); number: a
--     JSON number; select/status: one option id; multi_select: a non-empty
--     array of distinct option ids; date: "YYYY-MM-DD"; checkbox: true.
--     Checked on every write (workspace_entry_values_check).
--
-- Writes: clients only READ both tables (RLS: the Project's owner). Every
-- change goes through a SECURITY DEFINER function below, which checks
-- ownership against projects.user_id = auth.uid():
--   * create_workspace_collection_property(collection, name, type) → { property }
--   * update_workspace_collection_property(property, changes jsonb) → { property, cleared }
--       changes: any of name, type, options, shown_in_list. A type changes
--       only where no value is lost (select ↔ status, select/status →
--       multi_select). Removing an option clears it from the values that
--       used it (`cleared`: how many Entries changed).
--   * move_workspace_collection_property(property, index) → { property }
--   * delete_workspace_collection_property(property, expected_values) — refused
--       unless expected_values is the number of values it would delete.
--   * set_workspace_entry_value(entry, property, value) → { value }  (null clears)
--
-- Nothing here touches a manuscript table, function or policy, or any Page,
-- Folder, node, Collection or Entry row. It adds one constraint to
-- workspace_collection_entries: unique (id, collection_id), for the values' FK.
--
-- For the Rune 2.0 database only: it requires 025. Apply BEFORE the app deploy
-- that uses it. The previous app never reads the new tables; the new app
-- shows no properties (and offers none) until this is applied.
-- Rollback (drops every property and value):
--   drop table public.workspace_entry_values;
--   drop table public.workspace_collection_properties;
--   alter table public.workspace_collection_entries drop constraint workspace_collection_entries_id_collection_id_key;
--   drop function public.create_workspace_collection_property(uuid, text, text);
--   drop function public.update_workspace_collection_property(uuid, jsonb);
--   drop function public.move_workspace_collection_property(uuid, integer);
--   drop function public.delete_workspace_collection_property(uuid, integer);
--   drop function public.set_workspace_entry_value(uuid, uuid, jsonb);
--   drop function public.check_workspace_collection_property();
--   drop function public.check_workspace_entry_value();
--   drop function public.workspace_property_value_valid(text, jsonb, jsonb);
--   drop function public.workspace_property_options_valid(jsonb);
--   delete from public.schema_migrations where version = '026';
-- Apply as ONE script (psql -1, or the SQL editor).

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 026 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '026') then
    raise exception 'Migration 026 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '025') then
    raise exception 'Migration 026 requires migration 025 (workspace collections). Nothing was changed.';
  end if;
  -- As in 024–025: the SECURITY DEFINER functions run as their owner, which
  -- must own the Workspace tables or they would be subject to RLS.
  if (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.workspace_collections'::regclass) <> current_user then
    raise exception 'Migration 026 must be applied by the owner of public.workspace_collections (%, not %). Nothing was changed.',
      (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.workspace_collections'::regclass), current_user;
  end if;
end
$$;

-- ── Validation ──────────────────────────────────────────────────────────────

-- A property's options: [{ "id", "name" }, …] — ids and names non-blank and
-- unique (names ignoring case), names trimmed and at most 100 characters, at
-- most 200 options.
create function public.workspace_property_options_valid(p_options jsonb)
 returns boolean
 language sql
 immutable
 set search_path to ''
as $function$
  select jsonb_typeof(p_options) = 'array'
     and jsonb_array_length(p_options) <= 200
     and not exists (
           select 1 from jsonb_array_elements(p_options) o
            where jsonb_typeof(o) <> 'object'
               or jsonb_typeof(o -> 'id') is distinct from 'string'
               or jsonb_typeof(o -> 'name') is distinct from 'string'
               or btrim(o ->> 'id') = '' or char_length(o ->> 'id') > 64
               or btrim(o ->> 'name') = '' or o ->> 'name' <> btrim(o ->> 'name')
               or char_length(o ->> 'name') > 100
               or exists (select 1 from jsonb_object_keys(o) k where k not in ('id', 'name')))
     and (select count(distinct o ->> 'id') = count(*) and count(distinct lower(o ->> 'name')) = count(*)
            from jsonb_array_elements(p_options) o);
$function$;

-- Whether `p_value` is a stored value of a property of type `p_type` with
-- `p_options` (see the header for each type's form). Never true of an empty
-- value: clearing deletes the row.
create function public.workspace_property_value_valid(p_type text, p_options jsonb, p_value jsonb)
 returns boolean
 language plpgsql
 immutable
 set search_path to ''
as $function$
declare
  v_ids text[] := array(select o ->> 'id' from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) o);
begin
  case p_type
    when 'text' then
      return jsonb_typeof(p_value) = 'string' and btrim(p_value #>> '{}') <> '' and char_length(p_value #>> '{}') <= 2000;
    when 'number' then
      return jsonb_typeof(p_value) = 'number';
    when 'checkbox' then
      return p_value = 'true'::jsonb;
    when 'select', 'status' then
      return jsonb_typeof(p_value) = 'string' and (p_value #>> '{}') = any (v_ids);
    when 'multi_select' then
      return jsonb_typeof(p_value) = 'array'
         and jsonb_array_length(p_value) > 0
         and not exists (select 1 from jsonb_array_elements(p_value) v
                          where jsonb_typeof(v) <> 'string' or not ((v #>> '{}') = any (v_ids)))
         and (select count(distinct v) = count(*) from jsonb_array_elements(p_value) v);
    when 'date' then
      if jsonb_typeof(p_value) <> 'string' or (p_value #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then
        return false;
      end if;
      begin
        return to_char((p_value #>> '{}')::date, 'YYYY-MM-DD') = (p_value #>> '{}');
      exception when others then
        return false;
      end;
    else
      return false;
  end case;
end;
$function$;

revoke execute on function public.workspace_property_options_valid(jsonb) from public, anon;
revoke execute on function public.workspace_property_value_valid(text, jsonb, jsonb) from public, anon;

-- ── Property definitions ────────────────────────────────────────────────────

create table public.workspace_collection_properties (
  id             uuid        default gen_random_uuid() not null,
  collection_id  uuid        not null,
  project_id     uuid        not null,                                -- the Collection's Project
  name           text        not null,
  type           text        not null,
  options        jsonb       default '[]'::jsonb not null,
  position       integer     not null,
  shown_in_list  boolean     default false not null,
  created_at     timestamptz default now() not null,
  updated_at     timestamptz default now() not null
);

alter table public.workspace_collection_properties add constraint workspace_collection_properties_pkey primary key (id);
alter table public.workspace_collection_properties add constraint workspace_collection_properties_id_collection_id_key unique (id, collection_id);
alter table public.workspace_collection_properties add constraint workspace_collection_properties_collection_same_project_fkey
  foreign key (collection_id, project_id) references public.workspace_collections(id, project_id) on delete cascade;
alter table public.workspace_collection_properties add constraint workspace_collection_properties_name_check
  check (name = btrim(name) and name <> '' and char_length(name) <= 100);
alter table public.workspace_collection_properties add constraint workspace_collection_properties_type_check
  check (type in ('text', 'number', 'select', 'multi_select', 'status', 'date', 'checkbox'));
alter table public.workspace_collection_properties add constraint workspace_collection_properties_options_check
  check (jsonb_typeof(options) = 'array' and (type in ('select', 'multi_select', 'status') or options = '[]'::jsonb));
alter table public.workspace_collection_properties add constraint workspace_collection_properties_position_check
  check (position > 0);
-- 1..n within a Collection; moves renumber inside one statement.
alter table public.workspace_collection_properties add constraint workspace_collection_properties_collection_id_position_key
  unique (collection_id, position) deferrable initially deferred;

create unique index workspace_collection_properties_collection_id_name_key
  on public.workspace_collection_properties using btree (collection_id, lower(name));
create index workspace_collection_properties_project_id_idx
  on public.workspace_collection_properties using btree (project_id);

-- Options are checked, the Collection is kept for life, and the database owns
-- the timestamps.
create function public.check_workspace_collection_property()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if not public.workspace_property_options_valid(new.options) then
    raise exception 'Invalid property options' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;
  if new.collection_id is distinct from old.collection_id then
    raise exception 'A property cannot move to another Collection' using errcode = 'check_violation';
  end if;
  new.id := old.id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$function$;

revoke execute on function public.check_workspace_collection_property() from public, anon;

create trigger workspace_collection_properties_forbid_project_reassignment before update of project_id on public.workspace_collection_properties
  for each row execute function public.forbid_project_reassignment();
create trigger workspace_collection_properties_check before insert or update on public.workspace_collection_properties
  for each row execute function public.check_workspace_collection_property();

alter table public.workspace_collection_properties enable row level security;

create policy "workspace_collection_properties: select own" on public.workspace_collection_properties
  as permissive for select to authenticated
  using (exists (select 1 from public.projects p
                 where p.id = workspace_collection_properties.project_id and p.user_id = (select auth.uid())));

revoke insert, update, delete on public.workspace_collection_properties from anon, authenticated;

-- ── Entry values ────────────────────────────────────────────────────────────

-- The values' foreign key names an Entry together with its Collection.
alter table public.workspace_collection_entries add constraint workspace_collection_entries_id_collection_id_key unique (id, collection_id);

create table public.workspace_entry_values (
  entry_id       uuid        not null,
  property_id    uuid        not null,
  collection_id  uuid        not null,                                -- the Entry's and the property's
  project_id     uuid        not null,                                -- the Collection's Project
  value          jsonb       not null,
  updated_at     timestamptz default now() not null
);

alter table public.workspace_entry_values add constraint workspace_entry_values_pkey primary key (entry_id, property_id);
alter table public.workspace_entry_values add constraint workspace_entry_values_entry_same_collection_fkey
  foreign key (entry_id, collection_id) references public.workspace_collection_entries(id, collection_id) on delete cascade;
alter table public.workspace_entry_values add constraint workspace_entry_values_property_same_collection_fkey
  foreign key (property_id, collection_id) references public.workspace_collection_properties(id, collection_id) on delete cascade;
alter table public.workspace_entry_values add constraint workspace_entry_values_collection_same_project_fkey
  foreign key (collection_id, project_id) references public.workspace_collections(id, project_id) on delete cascade;

create index workspace_entry_values_property_id_idx on public.workspace_entry_values using btree (property_id);
create index workspace_entry_values_project_id_idx on public.workspace_entry_values using btree (project_id);

-- Every value is checked against its property's type and options; a value
-- keeps its Entry and property for life.
create function public.check_workspace_entry_value()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare
  v_property public.workspace_collection_properties%rowtype;
begin
  if tg_op = 'UPDATE' and (new.entry_id is distinct from old.entry_id
                           or new.property_id is distinct from old.property_id
                           or new.collection_id is distinct from old.collection_id) then
    raise exception 'A value keeps its Entry and property for life' using errcode = 'check_violation';
  end if;
  select * into v_property from public.workspace_collection_properties p where p.id = new.property_id;
  -- A missing property is left to the foreign key.
  if found and not public.workspace_property_value_valid(v_property.type, v_property.options, new.value) then
    raise exception 'Invalid value for a % property', v_property.type using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

revoke execute on function public.check_workspace_entry_value() from public, anon;

create trigger workspace_entry_values_forbid_project_reassignment before update of project_id on public.workspace_entry_values
  for each row execute function public.forbid_project_reassignment();
create trigger workspace_entry_values_check before insert or update on public.workspace_entry_values
  for each row execute function public.check_workspace_entry_value();

alter table public.workspace_entry_values enable row level security;

create policy "workspace_entry_values: select own" on public.workspace_entry_values
  as permissive for select to authenticated
  using (exists (select 1 from public.projects p
                 where p.id = workspace_entry_values.project_id and p.user_id = (select auth.uid())));

revoke insert, update, delete on public.workspace_entry_values from anon, authenticated;

-- ── Functions ───────────────────────────────────────────────────────────────

create function public.create_workspace_collection_property(p_collection_id uuid, p_name text, p_type text)
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
  if p_type is null or p_type not in ('text', 'number', 'select', 'multi_select', 'status', 'date', 'checkbox') then
    return jsonb_build_object('status', 'error', 'error', 'Unknown property type');
  end if;
  if exists (select 1 from public.workspace_collection_properties p
              where p.collection_id = p_collection_id and lower(p.name) = lower(v_name)) then
    return jsonb_build_object('status', 'error', 'error', 'A property with this name already exists');
  end if;

  -- The Collection's list shows the first three properties by default; the
  -- writer can change that per property.
  insert into public.workspace_collection_properties (collection_id, project_id, name, type, position, shown_in_list)
  select p_collection_id, v_project_id, v_name, p_type,
         coalesce(max(p.position), 0) + 1,
         count(*) filter (where p.shown_in_list) < 3
    from public.workspace_collection_properties p
   where p.collection_id = p_collection_id
  returning * into v_property;

  return jsonb_build_object('status', 'ok', 'property', to_jsonb(v_property));
end;
$function$;

create function public.update_workspace_collection_property(p_property_id uuid, p_changes jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_old public.workspace_collection_properties%rowtype;
  v_new public.workspace_collection_properties%rowtype;
  v_key text;
  v_opt jsonb;
  v_options jsonb := '[]'::jsonb;
  v_ids text[];
  v_cleared integer := 0;
  v_n integer;
begin
  select pr.* into v_old
    from public.workspace_collection_properties pr
    join public.projects p on p.id = pr.project_id
   where pr.id = p_property_id and p.user_id = auth.uid();
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Property not found');
  end if;
  perform public.lock_project_workspace(v_old.project_id);
  -- Re-read under the lock.
  select * into v_old from public.workspace_collection_properties where id = p_property_id;
  v_new := v_old;

  if jsonb_typeof(p_changes) is distinct from 'object' then
    return jsonb_build_object('status', 'error', 'error', 'Nothing to change');
  end if;
  for v_key in select jsonb_object_keys(p_changes) loop
    if v_key not in ('name', 'type', 'options', 'shown_in_list') then
      return jsonb_build_object('status', 'error', 'error', format('Unknown change: %s', v_key));
    end if;
  end loop;

  if p_changes ? 'name' then
    if jsonb_typeof(p_changes -> 'name') is distinct from 'string' or btrim(p_changes ->> 'name') = '' then
      return jsonb_build_object('status', 'error', 'error', 'A property needs a name');
    end if;
    v_new.name := left(btrim(p_changes ->> 'name'), 100);
    if exists (select 1 from public.workspace_collection_properties p
                where p.collection_id = v_old.collection_id and p.id <> v_old.id and lower(p.name) = lower(v_new.name)) then
      return jsonb_build_object('status', 'error', 'error', 'A property with this name already exists');
    end if;
  end if;

  if p_changes ? 'shown_in_list' then
    if jsonb_typeof(p_changes -> 'shown_in_list') is distinct from 'boolean' then
      return jsonb_build_object('status', 'error', 'error', 'shown_in_list must be true or false');
    end if;
    v_new.shown_in_list := (p_changes ->> 'shown_in_list')::boolean;
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

  -- Values first, then the definition, so every value is valid against the
  -- options it will have when the statement ends.
  v_ids := array(select o ->> 'id' from jsonb_array_elements(v_new.options) o);
  if v_old.type in ('select', 'status') then
    -- Removed options: those values are cleared.
    delete from public.workspace_entry_values v
     where v.property_id = v_old.id and not ((v.value #>> '{}') = any (v_ids));
    get diagnostics v_cleared = row_count;
  elsif v_old.type = 'multi_select' then
    with stripped as (
      select v.entry_id,
             coalesce((select jsonb_agg(x order by i) from jsonb_array_elements(v.value) with ordinality as t(x, i)
                        where (x #>> '{}') = any (v_ids)), '[]'::jsonb) as value
        from public.workspace_entry_values v
       where v.property_id = v_old.id
    ), changed as (
      select s.* from stripped s
        join public.workspace_entry_values v on v.entry_id = s.entry_id and v.property_id = v_old.id
       where s.value <> v.value
    ), emptied as (
      delete from public.workspace_entry_values v using changed c
       where v.property_id = v_old.id and v.entry_id = c.entry_id and c.value = '[]'::jsonb
      returning 1
    ), narrowed as (
      update public.workspace_entry_values v set value = c.value from changed c
       where v.property_id = v_old.id and v.entry_id = c.entry_id and c.value <> '[]'::jsonb
      returning 1
    )
    select (select count(*) from emptied) + (select count(*) from narrowed) into v_cleared;
  end if;

  update public.workspace_collection_properties
     set name = v_new.name, type = v_new.type, options = v_new.options, shown_in_list = v_new.shown_in_list
   where id = v_old.id
  returning * into v_new;

  if v_old.type in ('select', 'status') and v_new.type = 'multi_select' then
    update public.workspace_entry_values v set value = jsonb_build_array(v.value) where v.property_id = v_old.id;
    get diagnostics v_n = row_count;
  end if;

  return jsonb_build_object('status', 'ok', 'property', to_jsonb(v_new), 'cleared', v_cleared);
end;
$function$;

-- Moves a property to `p_index` (0-based) among its Collection's properties.
create function public.move_workspace_collection_property(p_property_id uuid, p_index integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_property public.workspace_collection_properties%rowtype;
  v_count integer;
  v_target integer;
begin
  select pr.* into v_property
    from public.workspace_collection_properties pr
    join public.projects p on p.id = pr.project_id
   where pr.id = p_property_id and p.user_id = auth.uid();
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Property not found');
  end if;
  perform public.lock_project_workspace(v_property.project_id);

  select count(*) into v_count from public.workspace_collection_properties p where p.collection_id = v_property.collection_id;
  v_target := greatest(0, least(coalesce(p_index, v_count - 1), v_count - 1)) + 1;

  -- One statement: the others close up around the moved one (position is
  -- unique, checked at commit).
  update public.workspace_collection_properties p
     set position = o.next
    from (
      select id, row_number() over (order by (id = p_property_id), position) as rank
        from public.workspace_collection_properties
       where collection_id = v_property.collection_id
    ) r
    cross join lateral (
      select case
               when r.id = p_property_id then v_target
               when r.rank < v_target then r.rank
               else r.rank + 1
             end as next
    ) o
   where p.id = r.id and p.position <> o.next;

  select * into v_property from public.workspace_collection_properties where id = p_property_id;
  return jsonb_build_object('status', 'ok', 'property', to_jsonb(v_property));
end;
$function$;

-- Deletes a property and every value it has. The caller states how many
-- values that is (what the writer confirmed); if it isn't that number any
-- more, nothing is deleted and the current number comes back.
create function public.delete_workspace_collection_property(p_property_id uuid, p_expected_values integer)
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

  select count(*) into v_values from public.workspace_entry_values v where v.property_id = p_property_id;
  if v_values is distinct from coalesce(p_expected_values, 0) then
    return jsonb_build_object('status', 'confirm', 'values', v_values);
  end if;

  -- Its values go with it (workspace_entry_values_property_same_collection_fkey).
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

-- Sets (or, with an empty value, clears) one Entry's value for one property
-- of its own Collection. Empty: null, "", a blank string, [], false.
create function public.set_workspace_entry_value(p_entry_id uuid, p_property_id uuid, p_value jsonb)
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
  if not found then
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

revoke execute on function public.create_workspace_collection_property(uuid, text, text) from public, anon;
revoke execute on function public.update_workspace_collection_property(uuid, jsonb) from public, anon;
revoke execute on function public.move_workspace_collection_property(uuid, integer) from public, anon;
revoke execute on function public.delete_workspace_collection_property(uuid, integer) from public, anon;
revoke execute on function public.set_workspace_entry_value(uuid, uuid, jsonb) from public, anon;

insert into public.schema_migrations (version, name, applied_at, note)
values ('026', '026_collection_properties.sql', now(), 'Collection Properties: workspace_collection_properties (typed definitions with owned options, ordered, list visibility) and workspace_entry_values (one checked value per Entry and property, same-Collection composite FKs); client read-only, writes through SECURITY DEFINER functions; property deletion requires the confirmed value count');
