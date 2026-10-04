-- ── Migration 034: Table column widths, saved per View ─────────────────────
--
-- Rune 2.0, Milestone 15 (the Milestone 14 carry-over). A Table View's
-- columns can be dragged wider or narrower, and the widths are kept with the
-- saved View — a Collection's (027) and the Manuscript's Scene Views (032)
-- alike, through the one set of View rules both already share.
--
-- The View config gains an OPTIONAL key:
--   widths: { "<field id>" | "title": <integer pixels, 80–640> }
-- "title" is the name column; any other key is one of the owner's fields
-- (a property, or a Scene's read-only "words" / "placement"). A column with
-- no stored width uses the app's default for its type.
--
--   * workspace_view_config_shape_valid — REDEFINED (a superset): also
--     accepts widths (an object of at most 210 integer widths from 80 to 640).
--   * normalize_workspace_view_config — REDEFINED: keeps widths when the
--     config has them. A config WITHOUT widths normalises exactly as before,
--     so every stored config, every default config and every config a
--     previous app sends stays valid and unchanged.
--   * prune_view_config — REDEFINED: also removes the widths of fields that
--     no longer exist (and so, through the existing property triggers, when
--     a property is deleted). Everything else is pruned exactly as before.
--
-- No table, column, constraint, trigger, policy or row changes: widths live
-- inside the existing config column and are written through the existing
-- create_/update_* View functions. A previous app deployment keeps working:
-- it never sends widths, and when it saves a View it sends back the config it
-- read, widths included, so it does not erase them.
--
-- For the Rune 2.0 database only: it requires 033. Apply it BEFORE the app
-- deploy that saves widths (without it, a resize is refused as an invalid
-- configuration and the column springs back; nothing else is affected).
-- Rollback (widths are only configuration):
--   update public.workspace_collection_views set config = config - 'widths' where config ? 'widths';
--   update public.scene_views set config = config - 'widths' where config ? 'widths';
--   re-create workspace_view_config_shape_valid and prune_view_config as 032,
--   and normalize_workspace_view_config as 027;
--   delete from public.schema_migrations where version = '034';
-- Apply as ONE script (psql -1, or the SQL editor).

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 034 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '034') then
    raise exception 'Migration 034 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '033') then
    raise exception 'Migration 034 requires migration 033 (manuscript import). Nothing was changed.';
  end if;
end
$$;

-- As 032, plus widths.
create or replace function public.workspace_view_config_shape_valid(p_config jsonb)
 returns boolean
 language sql
 immutable
 set search_path to ''
as $function$
  select jsonb_typeof(p_config) = 'object'
     and not exists (select 1 from jsonb_object_keys(p_config) k where k not in ('properties', 'sort', 'filters', 'group_by', 'widths'))
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
                 or (w.value #>> '{}')::numeric not between 80 and 640)));
$function$;

-- As 027; widths are kept when present (and only then).
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
    || case when p_config ? 'widths' then jsonb_build_object('widths', p_config -> 'widths') else '{}'::jsonb end;
$function$;

-- As 032, plus widths.
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
    -- widths: kept only for the name column and fields that exist; the key
    -- is present exactly when the config had it.
    || case when c.v ? 'widths' then jsonb_build_object('widths', coalesce((
         select jsonb_object_agg(w.key, w.value)
           from jsonb_each(c.v -> 'widths') w
          where w.key = 'title' or exists (select 1 from fields where fields.id = w.key)), '{}'::jsonb))
       else '{}'::jsonb end
  from c;
$function$;



insert into public.schema_migrations (version, name, applied_at, note)
values ('034', '034_view_column_widths.sql', now(), 'Table column widths saved per View: an optional widths key in Collection and Scene View configs (80–640 px), pruned with the fields it names');
