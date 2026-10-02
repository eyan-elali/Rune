-- ── Migration 044: Scene Views owned per Base ─────────────────────────────────
--
-- Rune 2.0, Milestone 21F. A saved Scene View (032) belongs to ONE BASE: the
-- Manuscript's page, or one Group's page. Until now every Scene View was the
-- Manuscript's and a Group's page showed the same tabs within its scope
-- (Milestone 21E.2); now each Base names, orders and keeps its own Views —
-- Part 1 may have "List" and "By POV", Part 2 "List", "Revision Status" and
-- "Timeline", the Manuscript "List", "By Arc" and "Timeline" — and none of
-- them appears in another Base's tabs.
--
-- What does NOT change: a Base is still a structural scope over the one set
-- of canonical Scenes (no Scene is copied, no membership row exists, the
-- scope is worked out from the manuscript structure every time), the View
-- engine and the config rules are the same for every Base, and a View is
-- configuration only — nothing here reads, writes or moves a Scene, a value
-- or any prose.
--
-- public.scene_views — CHANGED: group_id uuid (null = the Manuscript's Base;
--   set = that Group's Base). (group_id, manuscript_id) references
--   manuscript_groups(id, manuscript_id) ON DELETE CASCADE, so a View's Group
--   is always in the View's Manuscript, and a deleted Group takes only its
--   own Views with it (delete_manuscript_group only deletes an empty Group;
--   its saved Views are configuration, not content). A Group that MOVES keeps
--   its id, so its Views stay its own; a Chapter or Scene that moves only
--   changes which Scenes a Base's scope holds. Positions are now unique per
--   Base (manuscript_id, group_id, position — nulls not distinct) instead of
--   per Manuscript. Every existing row keeps group_id null: the Manuscript's
--   Views are exactly as they were, in the same order, and a Group's Base
--   starts with no saved View (the app shows it an unsaved List that the
--   first change saves, as the Manuscript's page always has).
-- check_scene_view — REDEFINED (a superset): a View cannot move to another
--   Base (group_id never changes after insert).
-- create_scene_view(project, name, type, config, group_id default null) —
--   REPLACES create_scene_view(project, name, type, config): the same call
--   with the same four arguments still creates a Manuscript View (a stale
--   client keeps working); with a Group id of that Manuscript it creates
--   that Group's View, at the end of that Group's. The 50-View limit is per
--   Base.
-- move_scene_view, delete_scene_view — REDEFINED (same signatures): a View
--   is reordered among, and the gap closed within, ITS OWN Base's Views.
-- update_scene_view, sync_scene_views_with_property, prune_scene_view_config,
--   default_scene_view_config, manuscript_scene_view_fields — UNCHANGED: the
--   config rules and the property triggers are by Manuscript and so already
--   cover every Base's Views.
-- read_project_backup — UNCHANGED: 'scene_views' rows carry group_id now.
--
-- Nothing here touches scenes, chapters, manuscript_groups, manuscripts,
-- their triggers, policies or functions.
--
-- For the Rune 2.0 database only: it requires 043. Apply BEFORE the app
-- deploy that creates Group Views (that app sends p_group_id; without this
-- migration the call fails as an unknown function, and nothing is written).
-- The previous app keeps working unchanged: it reads scene_views (an extra
-- column is ignored) and calls the four-argument create.
-- Rollback (every Group's Views are deleted; the Manuscript's stay):
--   delete from public.scene_views where group_id is not null;
--   restore the 032 definitions of move_scene_view and delete_scene_view (from schema.sql at 043);
--   drop function public.create_scene_view(uuid, text, text, jsonb, uuid);
--   restore the 042 definition of create_scene_view(uuid, text, text, jsonb) (from schema.sql at 043);
--   restore the 032 definition of check_scene_view (from schema.sql at 043);
--   alter table public.scene_views drop constraint scene_views_base_position_key;
--   alter table public.scene_views add constraint scene_views_manuscript_id_position_key unique (manuscript_id, position) deferrable initially deferred;
--   alter table public.scene_views drop column group_id;  (drops its index and FK)
--   delete from public.schema_migrations where version = '044';
-- Apply as ONE script (psql -1, or the SQL editor).

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 044 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '044') then
    raise exception 'Migration 044 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '043') then
    raise exception 'Migration 044 requires migration 043 (Revision Note items). Nothing was changed.';
  end if;
  if (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.scene_views'::regclass) <> current_user then
    raise exception 'Migration 044 must be applied by the owner of public.scene_views (%, not %). Nothing was changed.',
      (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.scene_views'::regclass), current_user;
  end if;
end
$$;

-- ── The Base a View belongs to ───────────────────────────────────────────────

alter table public.scene_views add column group_id uuid;

-- MATCH SIMPLE: a null group_id (the Manuscript's Base) is not checked. A
-- View's Group must be in the View's Manuscript; a deleted Group takes its
-- own Views (configuration only) with it.
alter table public.scene_views add constraint scene_views_group_same_manuscript_fkey
  foreign key (group_id, manuscript_id) references public.manuscript_groups(id, manuscript_id) on delete cascade;

alter table public.scene_views drop constraint scene_views_manuscript_id_position_key;
alter table public.scene_views add constraint scene_views_base_position_key
  unique nulls not distinct (manuscript_id, group_id, position) deferrable initially deferred;

create index scene_views_group_id_idx on public.scene_views using btree (group_id) where group_id is not null;

-- As 032, plus: a View cannot move to another Base.
create or replace function public.check_scene_view()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if tg_op = 'UPDATE' and new.manuscript_id is distinct from old.manuscript_id then
    raise exception 'A view cannot move to another Manuscript' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and new.group_id is distinct from old.group_id then
    raise exception 'A view cannot move to another Base' using errcode = 'check_violation';
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

-- ── Creating, ordering and deleting within a Base ───────────────────────────

drop function public.create_scene_view(uuid, text, text, jsonb);

-- As 042, plus p_group_id: null makes the Manuscript's View (exactly the
-- four-argument call of before), a Group of the Manuscript makes that
-- Group's, at the end of that Base's Views. At most 50 Views per Base.
create function public.create_scene_view(p_project_id uuid, p_name text, p_type text, p_config jsonb, p_group_id uuid default null)
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

  if p_group_id is not null
     and not exists (select 1 from public.manuscript_groups g where g.id = p_group_id and g.manuscript_id = v_manuscript_id) then
    return jsonb_build_object('status', 'error', 'error', 'Group not found');
  end if;
  if p_type is null or p_type not in ('list', 'table', 'board', 'timeline') then
    return jsonb_build_object('status', 'error', 'error', 'Unknown view type');
  end if;
  if v_name = '' then
    v_name := case p_type when 'list' then 'List' when 'table' then 'Table' when 'board' then 'Board' else 'Timeline' end;
  end if;
  if (select count(*) from public.scene_views v
       where v.manuscript_id = v_manuscript_id and v.group_id is not distinct from p_group_id) >= 50 then
    return jsonb_build_object('status', 'error', 'error', 'A base can have at most 50 scene views');
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

  insert into public.scene_views (manuscript_id, project_id, group_id, name, type, position, config)
  select v_manuscript_id, p_project_id, p_group_id, v_name, p_type, coalesce(max(v.position), 0) + 1, v_config
    from public.scene_views v
   where v.manuscript_id = v_manuscript_id and v.group_id is not distinct from p_group_id
  returning * into v_view;

  return jsonb_build_object('status', 'ok', 'view', to_jsonb(v_view));
end;
$function$;

revoke execute on function public.create_scene_view(uuid, text, text, jsonb, uuid) from public, anon;

-- As 032, among the View's own Base's Views.
create or replace function public.move_scene_view(p_view_id uuid, p_index integer)
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

  select count(*) into v_count from public.scene_views v
   where v.manuscript_id = v_view.manuscript_id and v.group_id is not distinct from v_view.group_id;
  v_target := greatest(0, least(coalesce(p_index, v_count - 1), v_count - 1)) + 1;

  update public.scene_views v
     set position = o.next
    from (
      select id, row_number() over (order by (id = p_view_id), position) as rank
        from public.scene_views
       where manuscript_id = v_view.manuscript_id and group_id is not distinct from v_view.group_id
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

-- As 032, closing the gap within the View's own Base.
create or replace function public.delete_scene_view(p_view_id uuid)
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
           where manuscript_id = v_view.manuscript_id and group_id is not distinct from v_view.group_id) r
   where v.id = r.id and v.position <> r.rank;
  return jsonb_build_object('status', 'ok');
end;
$function$;

insert into public.schema_migrations (version, name, applied_at, note)
values ('044', '044_scene_view_bases.sql', now(), 'Scene Views owned per Base: scene_views.group_id (null = the Manuscript''s Base, else that Group''s; FK with its Manuscript, cascade on Group deletion), positions unique per Base; create_scene_view takes an optional group_id (the four-argument call is unchanged); move and delete work within the View''s Base; every existing View stays the Manuscript''s');
