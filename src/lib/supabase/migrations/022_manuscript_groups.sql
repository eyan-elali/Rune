-- ── Migration 022: Manuscript Groups; unique Unplaced order; Scene deletion keeps writing history ─
--
-- Rune 2.0 Phase 1, Task 9. Four changes:
--
-- 1. Manuscript Groups (architecture §4). public.manuscript_groups — NEW.
--    A Group ("Part I", "Book Two", "Act I", "Interlude": one type for all)
--    belongs to one Manuscript, holds no prose, and contains Chapters and/or
--    other Groups, recursively. It never contains a Scene directly: Scenes
--    reference Chapters only.
--      * parent_group_id null = directly under the Manuscript. A composite
--        foreign key (parent_group_id, manuscript_id) makes a parent in
--        another Manuscript impossible; NO ACTION, so a Group that still holds
--        a Group cannot be deleted.
--      * chapters.group_id (nullable) — NEW. null = directly under the
--        Manuscript (every existing Chapter). Same composite foreign key, NO
--        ACTION: a Group that still holds a Chapter cannot be deleted.
--      * title is optional (null = untitled; never blank).
--      * cycles (A inside B inside A) are refused by the trigger
--        manuscript_groups_forbid_cycle, whatever writes the row.
--      * deleting a Project removes its Groups with its Manuscript.
--      * RLS: writers read and rename their own Groups (UPDATE of title under
--        RLS, as for Chapters). They cannot INSERT or DELETE them directly
--        (no privilege, no policy): create_manuscript_group and
--        delete_manuscript_group do.
--
-- 2. One ordering model for manuscript structure. Every Group and Chapter has
--    a PARENT (a Group, or the Manuscript itself when null) and a position
--    among that parent's children, Groups and Chapters together:
--        (manuscript_id, parent, position) is unique across BOTH tables.
--    Enforced by chapters_sibling_position_key (replaces
--    chapters_manuscript_id_position_key; existing Chapters are all top level,
--    so their positions already satisfy it — nothing is renumbered),
--    manuscript_groups_sibling_position_key, and the triggers
--    *_check_sibling_position for a Group and a Chapter sharing a slot.
--    Reading order is depth-first: a parent's children by position, a Group's
--    own children before its next sibling. Positions are only an order: gaps
--    are harmless (deletions leave them).
--    Group placement (parent_group_id, position) and Chapter placement
--    (group_id, position) can only change through the functions below:
--    *_protect_placement refuses such a change from anon / authenticated.
--    Functions — NEW, SECURITY DEFINER, ownership checked explicitly against
--    projects.user_id = auth.uid(), each under lock_account_word_budget()
--    (the per-account lock every structure write already takes, so siblings
--    are read and renumbered with no other structure write in between):
--      * create_manuscript_group(p_manuscript_id, p_parent_group_id, p_title)
--        → { status: 'ok', group } — appended after the parent's last child.
--      * delete_manuscript_group(p_group_id) → { status: 'ok' } — refused
--        ('Only an empty Group can be deleted') while it holds anything.
--      * move_manuscript_group(p_group_id, p_parent_group_id, p_index) and
--        move_chapter(p_chapter_id, p_parent_group_id, p_index)
--        → { status: 'ok', moved } — put the item at p_index (0-based; null =
--        last) among the destination's children. Reordering is a move within
--        the same parent. The destination's children are renumbered 1..n in
--        ONE step (only rows whose position changes are written); ids,
--        contents and every Scene are untouched. Refused, writing nothing:
--        another writer's item or destination ('… not found'), a destination
--        in another Manuscript, a Group into itself or its own descendant.
--    create_chapter_checked (same signature): a new Chapter is appended after
--    the Manuscript's last top-level child, Group or Chapter.
--    duplicate_project_checked (same signature): also copies the Groups, and
--    each Chapter keeps its place in them.
--
-- 3. Unplaced Scenes have a unique order within their Manuscript:
--    scenes_unplaced_position_excl, EXCLUDE (manuscript_id =, position =)
--    WHERE chapter_id is null, DEFERRABLE (checked at the end of each
--    statement, so a future one-statement reorder can swap positions).
--    Existing ties are resolved first by moving the fewest rows possible: in
--    each tie the earliest Scene (created_at, id) keeps its position and the
--    others go to the end of that Unplaced list, in (position, created_at, id)
--    order. That position-only fix-up runs with scene_version_trigger and
--    trg_scene_updated disabled: no Scene's version or updated_at changes, so
--    no queued offline save is turned into a version conflict by it.
--    Every writer of Unplaced positions (insert_unplaced_scene_checked,
--    move_scene, delete_chapter) already appends under the account lock.
--
-- 4. Deleting a Scene keeps the fact that writing happened.
--    writing_sessions_scene_id_fkey is re-created ON DELETE SET NULL (was
--    CASCADE), and the BEFORE DELETE trigger scenes_detach_writing_sessions
--    turns each of the Scene's writing-history rows into Project-level
--    history: scene_id null, project_id kept (filled from the Scene's Project
--    if it was null), user, date and words unchanged. When that user already
--    has a Project-level row for that Project and day (one is allowed per
--    writing_sessions_project_unique), the words are added to it instead and
--    the Scene's row is removed. Daily totals, Today's Words, writing days,
--    streaks and all-time words are therefore unchanged by a Scene deletion.
--    No title or prose is copied anywhere.
--    Deleting a whole Project still removes its writing history (the
--    Project's rows go through writing_sessions_project_id_fkey, as before;
--    the trigger removes the Scene-keyed ones in the same statement).
--
-- For the Rune 2.0 database only: it requires 021. Safe to apply before the
-- app deploy that uses Groups: the previous app never writes chapters.group_id
-- or chapter positions (updateChapter is only ever called with a title), and
-- create_chapter_checked keeps its signature and result.
-- Rollback (only while no Group exists and no Chapter has a group_id):
--   drop trigger scenes_detach_writing_sessions on public.scenes;
--   drop function public.detach_scene_writing_sessions();
--   alter table public.writing_sessions drop constraint writing_sessions_scene_id_fkey;
--   alter table public.writing_sessions add constraint writing_sessions_scene_id_fkey
--     foreign key (scene_id) references public.scenes(id) on delete cascade;
--   alter table public.scenes drop constraint scenes_unplaced_position_excl;
--   drop function public.move_chapter(uuid, uuid, integer);
--   drop function public.move_manuscript_group(uuid, uuid, integer);
--   drop function public.delete_manuscript_group(uuid);
--   drop function public.create_manuscript_group(uuid, uuid, text);
--   drop function public.place_in_manuscript_structure(uuid, uuid, text, uuid, integer);
--   drop trigger chapters_check_sibling_position on public.chapters;
--   drop trigger chapters_protect_placement on public.chapters;
--   alter table public.chapters drop constraint chapters_sibling_position_key;
--   alter table public.chapters drop constraint chapters_group_same_manuscript_fkey;
--   alter table public.chapters drop column group_id;
--   alter table public.chapters add constraint chapters_manuscript_id_position_key
--     unique (manuscript_id, position) deferrable initially immediate;
--   drop table public.manuscript_groups;
--   drop function public.check_structure_sibling_position();
--   drop function public.protect_structure_placement();
--   drop function public.forbid_manuscript_group_cycle();
--   drop function public.next_structure_position(uuid, uuid);
--   re-run the create_chapter_checked block from 019 and the
--   duplicate_project_checked block from 015 (then: alter function
--   public.duplicate_project_checked(uuid) security definer);
--   delete from public.schema_migrations where version = '022';
--   (Unplaced positions fixed up by section 3 keep their new values.)
-- Apply as ONE script (psql -1, or the SQL editor).

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 022 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '022') then
    raise exception 'Migration 022 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '021') then
    raise exception 'Migration 022 requires migration 021 (project lifecycle hardening). Nothing was changed.';
  end if;
  -- The SECURITY DEFINER functions and triggers below run as their owner (the
  -- role applying this), which must own the manuscript tables, or they would
  -- be subject to RLS. Section 3 also disables two triggers on scenes, which
  -- only the owner may do.
  if (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.chapters'::regclass) <> current_user
     or (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.scenes'::regclass) <> current_user
     or (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.writing_sessions'::regclass) <> current_user then
    raise exception 'Migration 022 must be applied by the owner of public.chapters, public.scenes and public.writing_sessions (%, not %). Nothing was changed.',
      (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.chapters'::regclass), current_user;
  end if;
end
$$;

-- ── 1. Manuscript Groups ────────────────────────────────────────────────────

create table public.manuscript_groups (
  id              uuid        default gen_random_uuid() not null,
  manuscript_id   uuid        not null,
  parent_group_id uuid,                                  -- null = directly under the Manuscript
  title           text,                                  -- null = untitled
  position        integer     not null,
  created_at      timestamptz default now()             not null,
  updated_at      timestamptz default now()             not null
);

alter table public.manuscript_groups add constraint manuscript_groups_pkey primary key (id);
-- Target of the composite foreign keys below (a child must share its parent's Manuscript).
alter table public.manuscript_groups add constraint manuscript_groups_id_manuscript_id_key unique (id, manuscript_id);
alter table public.manuscript_groups add constraint manuscript_groups_manuscript_id_fkey
  foreign key (manuscript_id) references public.manuscripts(id) on delete cascade;
-- MATCH SIMPLE: a null parent (top level) is not checked. NO ACTION: a Group
-- that still holds a Group cannot be deleted.
alter table public.manuscript_groups add constraint manuscript_groups_parent_same_manuscript_fkey
  foreign key (parent_group_id, manuscript_id) references public.manuscript_groups(id, manuscript_id);
alter table public.manuscript_groups add constraint manuscript_groups_not_own_parent
  check (parent_group_id <> id);
alter table public.manuscript_groups add constraint manuscript_groups_title_not_blank
  check (title is null or btrim(title) <> '');
alter table public.manuscript_groups add constraint manuscript_groups_sibling_position_key
  unique nulls not distinct (manuscript_id, parent_group_id, position) deferrable initially immediate;

alter table public.chapters add column group_id uuid;               -- null = directly under the Manuscript
-- MATCH SIMPLE: a null group_id (top level) is not checked. NO ACTION: a
-- Group that still holds a Chapter cannot be deleted.
alter table public.chapters add constraint chapters_group_same_manuscript_fkey
  foreign key (group_id, manuscript_id) references public.manuscript_groups(id, manuscript_id);

-- ── 2. One ordering model: (manuscript, parent, position) ───────────────────

alter table public.chapters drop constraint chapters_manuscript_id_position_key;
alter table public.chapters
  add constraint chapters_sibling_position_key
  unique nulls not distinct (manuscript_id, group_id, position) deferrable initially immediate;

-- A Group and a Chapter with the same parent never share a position. (Two
-- Groups, or two Chapters, are covered by the unique constraints above.)
-- AFTER ROW, so it sees the statement's final state.
create function public.check_structure_sibling_position()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if tg_table_name = 'chapters' then
    if exists (select 1 from public.manuscript_groups g
                where g.manuscript_id = new.manuscript_id
                  and g.parent_group_id is not distinct from new.group_id
                  and g.position = new.position) then
      raise exception 'Chapter % shares position % with a Group of the same parent', new.id, new.position
        using errcode = 'unique_violation';
    end if;
  else
    if exists (select 1 from public.chapters c
                where c.manuscript_id = new.manuscript_id
                  and c.group_id is not distinct from new.parent_group_id
                  and c.position = new.position) then
      raise exception 'Group % shares position % with a Chapter of the same parent', new.id, new.position
        using errcode = 'unique_violation';
    end if;
  end if;
  return null;
end;
$function$;

-- Placement changes only through the structure functions (SECURITY DEFINER,
-- run as the table owner), never by a writer's direct UPDATE.
create function public.protect_structure_placement()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  -- Nested, not AND-ed: each table's record has only its own columns.
  if tg_table_name = 'chapters' then
    if new.group_id is distinct from old.group_id or new.position is distinct from old.position then
      raise exception 'A Chapter''s place in the manuscript changes only through move_chapter'
        using errcode = '42501';
    end if;
  elsif new.parent_group_id is distinct from old.parent_group_id or new.position is distinct from old.position then
    raise exception 'A Group''s place in the manuscript changes only through move_manuscript_group'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

-- A Group never ends up inside itself: walk up from the new parent.
create function public.forbid_manuscript_group_cycle()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.parent_group_id is not null and exists (
       with recursive up(id) as (
         select new.parent_group_id
         union
         select g.parent_group_id
           from public.manuscript_groups g
           join up on g.id = up.id
          where g.parent_group_id is not null)
       select 1 from up where up.id = new.id) then
    raise exception 'A Group cannot be placed inside itself or one of its own Groups'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

revoke execute on function public.check_structure_sibling_position() from public, anon;
revoke execute on function public.protect_structure_placement() from public, anon;
revoke execute on function public.forbid_manuscript_group_cycle() from public, anon;

create trigger manuscript_groups_forbid_manuscript_reassignment before update of manuscript_id on public.manuscript_groups
  for each row execute function public.forbid_manuscript_reassignment();
create trigger manuscript_groups_forbid_cycle before insert or update of parent_group_id on public.manuscript_groups
  for each row execute function public.forbid_manuscript_group_cycle();
create trigger manuscript_groups_protect_placement before update of parent_group_id, position on public.manuscript_groups
  for each row execute function public.protect_structure_placement();
create trigger manuscript_groups_check_sibling_position after insert or update of parent_group_id, position on public.manuscript_groups
  for each row execute function public.check_structure_sibling_position();
create trigger chapters_protect_placement before update of group_id, position on public.chapters
  for each row execute function public.protect_structure_placement();
create trigger chapters_check_sibling_position after insert or update of group_id, position on public.chapters
  for each row execute function public.check_structure_sibling_position();

-- The position after the last child of a parent (null = the Manuscript's top
-- level), Groups and Chapters together; 1 when it has none. Internal.
create function public.next_structure_position(p_manuscript_id uuid, p_parent_group_id uuid)
 returns integer
 language sql
 stable
 set search_path to ''
as $function$
  select coalesce(max(s.position), 0) + 1
    from (select g.position from public.manuscript_groups g
           where g.manuscript_id = p_manuscript_id and g.parent_group_id is not distinct from p_parent_group_id
          union all
          select c.position from public.chapters c
           where c.manuscript_id = p_manuscript_id and c.group_id is not distinct from p_parent_group_id) s;
$function$;

-- Puts one Group or Chapter at p_index (0-based; null = last) among the
-- children of p_parent_group_id (null = top level) and numbers those children
-- 1..n in order. Only rows whose parent or position changes are written, in
-- two steps (first above every current position, then down to 1..n) so no
-- intermediate state ever shares a position. Internal: callers have taken the
-- account lock and validated ownership, the Manuscript and the destination.
-- Returns whether anything changed.
create function public.place_in_manuscript_structure(p_manuscript_id uuid, p_parent_group_id uuid, p_kind text, p_id uuid, p_index integer)
 returns boolean
 language plpgsql
 set search_path to ''
as $function$
declare
  v_kinds text[];
  v_ids uuid[];
  v_n int;
  v_i int;
  v_base int;
  v_changed int := 0;
  v_rows int;
begin
  select coalesce(array_agg(s.kind order by s.position, s.kind desc, s.id), '{}'),
         coalesce(array_agg(s.id order by s.position, s.kind desc, s.id), '{}')
    into v_kinds, v_ids
    from (select 'group'::text as kind, g.id, g.position from public.manuscript_groups g
           where g.manuscript_id = p_manuscript_id and g.parent_group_id is not distinct from p_parent_group_id
             and not (p_kind = 'group' and g.id = p_id)
          union all
          select 'chapter'::text, c.id, c.position from public.chapters c
           where c.manuscript_id = p_manuscript_id and c.group_id is not distinct from p_parent_group_id
             and not (p_kind = 'chapter' and c.id = p_id)) s;

  v_n := coalesce(array_length(v_ids, 1), 0);
  v_i := least(greatest(coalesce(p_index, v_n), 0), v_n);
  v_kinds := v_kinds[1:v_i] || p_kind || v_kinds[v_i + 1:v_n];
  v_ids := v_ids[1:v_i] || p_id || v_ids[v_i + 1:v_n];

  -- Above every position the destination or the moving item holds.
  select greatest(coalesce(max(s.position), 0), 0) + v_n + 2 into v_base
    from (select g.position from public.manuscript_groups g where g.id = any(v_ids)
          union all
          select c.position from public.chapters c where c.id = any(v_ids)) s;

  update public.manuscript_groups g
     set parent_group_id = p_parent_group_id, position = v_base + o.ord::int
    from unnest(v_kinds, v_ids) with ordinality as o(kind, id, ord)
   where o.kind = 'group' and g.id = o.id
     and (g.position <> o.ord or g.parent_group_id is distinct from p_parent_group_id);
  get diagnostics v_rows = row_count;
  v_changed := v_changed + v_rows;

  update public.chapters c
     set group_id = p_parent_group_id, position = v_base + o.ord::int
    from unnest(v_kinds, v_ids) with ordinality as o(kind, id, ord)
   where o.kind = 'chapter' and c.id = o.id
     and (c.position <> o.ord or c.group_id is distinct from p_parent_group_id);
  get diagnostics v_rows = row_count;
  v_changed := v_changed + v_rows;

  if v_changed = 0 then
    return false;
  end if;

  update public.manuscript_groups g
     set position = g.position - v_base
   where g.id = any(v_ids) and g.position > v_base;
  update public.chapters c
     set position = c.position - v_base
   where c.id = any(v_ids) and c.position > v_base;

  return true;
end;
$function$;

revoke execute on function public.next_structure_position(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.place_in_manuscript_structure(uuid, uuid, text, uuid, integer) from public, anon, authenticated;

create function public.create_manuscript_group(p_manuscript_id uuid, p_parent_group_id uuid, p_title text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_group public.manuscript_groups%rowtype;
begin
  perform public.lock_account_word_budget();

  -- SECURITY DEFINER: ownership is checked here, not by RLS.
  if not exists (
    select 1 from public.manuscripts m
      join public.projects p on p.id = m.project_id
     where m.id = p_manuscript_id and p.user_id = auth.uid()) then
    return jsonb_build_object('status', 'error', 'error', 'Manuscript not found');
  end if;

  if p_parent_group_id is not null and not exists (
    select 1 from public.manuscript_groups g
     where g.id = p_parent_group_id and g.manuscript_id = p_manuscript_id) then
    return jsonb_build_object('status', 'error', 'error', 'Group not found');
  end if;

  insert into public.manuscript_groups (manuscript_id, parent_group_id, title, position)
  values (p_manuscript_id, p_parent_group_id, v_title,
          public.next_structure_position(p_manuscript_id, p_parent_group_id))
  returning * into v_group;

  return jsonb_build_object('status', 'ok', 'group', to_jsonb(v_group));
end;
$function$;

create function public.delete_manuscript_group(p_group_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_group public.manuscript_groups%rowtype;
begin
  perform public.lock_account_word_budget();

  select g.* into v_group
    from public.manuscript_groups g
    join public.manuscripts m on m.id = g.manuscript_id
    join public.projects p on p.id = m.project_id
   where g.id = p_group_id and p.user_id = auth.uid()
     for update of g;
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Group not found');
  end if;

  if exists (select 1 from public.manuscript_groups g where g.parent_group_id = p_group_id)
     or exists (select 1 from public.chapters c where c.group_id = p_group_id) then
    return jsonb_build_object('status', 'error', 'error', 'Only an empty Group can be deleted');
  end if;

  delete from public.manuscript_groups g where g.id = p_group_id;
  return jsonb_build_object('status', 'ok');
end;
$function$;

create function public.move_manuscript_group(p_group_id uuid, p_parent_group_id uuid, p_index integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_group public.manuscript_groups%rowtype;
  v_parent_manuscript_id uuid;
begin
  perform public.lock_account_word_budget();

  select g.* into v_group
    from public.manuscript_groups g
    join public.manuscripts m on m.id = g.manuscript_id
    join public.projects p on p.id = m.project_id
   where g.id = p_group_id and p.user_id = auth.uid();
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Group not found');
  end if;

  if p_parent_group_id is not null then
    select g.manuscript_id into v_parent_manuscript_id
      from public.manuscript_groups g
      join public.manuscripts m on m.id = g.manuscript_id
      join public.projects p on p.id = m.project_id
     where g.id = p_parent_group_id and p.user_id = auth.uid();
    if not found then
      return jsonb_build_object('status', 'error', 'error', 'Group not found');
    end if;
    if v_parent_manuscript_id <> v_group.manuscript_id then
      return jsonb_build_object('status', 'error', 'error', 'A Group can only move within its own manuscript');
    end if;
    if exists (
         with recursive up(id) as (
           select p_parent_group_id
           union
           select g.parent_group_id from public.manuscript_groups g join up on g.id = up.id
            where g.parent_group_id is not null)
         select 1 from up where up.id = p_group_id) then
      return jsonb_build_object('status', 'error', 'error', 'A Group cannot move inside itself');
    end if;
  end if;

  return jsonb_build_object('status', 'ok', 'moved',
    public.place_in_manuscript_structure(v_group.manuscript_id, p_parent_group_id, 'group', p_group_id, p_index));
end;
$function$;

create function public.move_chapter(p_chapter_id uuid, p_parent_group_id uuid, p_index integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_chapter public.chapters%rowtype;
  v_parent_manuscript_id uuid;
begin
  perform public.lock_account_word_budget();

  select c.* into v_chapter
    from public.chapters c
    join public.manuscripts m on m.id = c.manuscript_id
    join public.projects p on p.id = m.project_id
   where c.id = p_chapter_id and p.user_id = auth.uid();
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Chapter not found');
  end if;

  if p_parent_group_id is not null then
    select g.manuscript_id into v_parent_manuscript_id
      from public.manuscript_groups g
      join public.manuscripts m on m.id = g.manuscript_id
      join public.projects p on p.id = m.project_id
     where g.id = p_parent_group_id and p.user_id = auth.uid();
    if not found then
      return jsonb_build_object('status', 'error', 'error', 'Group not found');
    end if;
    if v_parent_manuscript_id <> v_chapter.manuscript_id then
      return jsonb_build_object('status', 'error', 'error', 'A Chapter can only move within its own manuscript');
    end if;
  end if;

  return jsonb_build_object('status', 'ok', 'moved',
    public.place_in_manuscript_structure(v_chapter.manuscript_id, p_parent_group_id, 'chapter', p_chapter_id, p_index));
end;
$function$;

revoke execute on function public.create_manuscript_group(uuid, uuid, text) from public, anon;
revoke execute on function public.delete_manuscript_group(uuid) from public, anon;
revoke execute on function public.move_manuscript_group(uuid, uuid, integer) from public, anon;
revoke execute on function public.move_chapter(uuid, uuid, integer) from public, anon;

-- Same as 019, except the position: after the last top-level child, Group or Chapter.
create or replace function public.create_chapter_checked(p_manuscript_id uuid, p_title text, p_scene_title text, p_scene_content jsonb, p_scene_word_count integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_limit int;
  v_new_total int;
  v_chapter public.chapters%rowtype;
  v_scene_id uuid;
begin
  perform public.lock_account_word_budget();

  if not exists (
    select 1 from public.manuscripts m
      join public.projects p on p.id = m.project_id
     where m.id = p_manuscript_id and p.user_id = auth.uid()) then
    return jsonb_build_object('status', 'error', 'error', 'Manuscript not found');
  end if;

  if p_scene_word_count > 0 then
    v_limit := public.free_word_limit_for_caller();
    if v_limit is not null then
      v_new_total := public.account_word_total(null, p_scene_word_count);
      if v_new_total > v_limit then
        return jsonb_build_object('status', 'word_limit_blocked', 'limit', v_limit);
      end if;
    end if;
  end if;

  insert into public.chapters (manuscript_id, title, position)
  values (p_manuscript_id, p_title, public.next_structure_position(p_manuscript_id, null))
  returning * into v_chapter;

  insert into public.scenes (manuscript_id, chapter_id, title, content, word_count, position)
  values (p_manuscript_id, v_chapter.id, p_scene_title, p_scene_content, p_scene_word_count, 0)
  returning id into v_scene_id;

  return jsonb_build_object('status', 'ok', 'chapter', to_jsonb(v_chapter), 'scene_id', v_scene_id);
end;
$function$;

-- Same contract as before (015; SECURITY DEFINER since 019). Also copies the
-- Groups: each keeps its title, parent and position, and each Chapter its
-- Group and position, so the copy reads in the same order.
create or replace function public.duplicate_project_checked(p_project_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_source public.projects%rowtype;
  v_source_manuscript_id uuid;
  v_source_chapter record;
  v_new_project public.projects%rowtype;
  v_new_manuscript_id uuid;
  v_new_chapter_id uuid;
  v_group_map jsonb;
  v_new_title text;
  v_used_numbers int[];
  v_draft_num int;
  v_source_total int;
  v_placed_total int;
  v_account_total int;
  v_limit int;
begin
  perform public.lock_account_word_budget();

  select * into v_source
    from public.projects
   where id = p_project_id and user_id = auth.uid();

  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Project not found');
  end if;

  select m.id into v_source_manuscript_id
    from public.manuscripts m
   where m.project_id = p_project_id;

  select coalesce(sum(s.word_count), 0),
         coalesce(sum(s.word_count) filter (where s.chapter_id is not null), 0)
    into v_source_total, v_placed_total
    from public.scenes s
   where s.manuscript_id = v_source_manuscript_id;

  if v_source_total > 0 then
    v_limit := public.free_word_limit_for_caller();
    if v_limit is not null then
      v_account_total := public.account_word_total();
      if v_account_total + v_source_total > v_limit then
        return jsonb_build_object('status', 'word_limit_blocked', 'limit', v_limit);
      end if;
    end if;
  end if;

  -- Unique "— Draft N" title: smallest unused number starting at 2 (gap-filling).
  select array_agg((regexp_match(p.title, '— Draft (\d+)$'))[1]::int)
    into v_used_numbers
  from public.projects p
  where p.user_id = auth.uid()
    and p.title ilike v_source.title || ' — Draft%'
    and regexp_match(p.title, '— Draft (\d+)$') is not null;

  v_draft_num := 2;
  while v_used_numbers is not null and v_draft_num = any(v_used_numbers) loop
    v_draft_num := v_draft_num + 1;
  end loop;

  v_new_title := v_source.title || ' — Draft ' || v_draft_num;

  insert into public.projects (user_id, title, description, cover_color, word_count)
  values (auth.uid(), v_new_title, v_source.description, v_source.cover_color, v_placed_total)
  returning * into v_new_project;

  -- Created by trg_project_manuscript.
  select m.id into v_new_manuscript_id
    from public.manuscripts m
   where m.project_id = v_new_project.id;

  -- Every Group in one statement (a parent's foreign key is checked at its end).
  select coalesce(jsonb_object_agg(g.id, gen_random_uuid()), '{}'::jsonb) into v_group_map
    from public.manuscript_groups g
   where g.manuscript_id = v_source_manuscript_id;

  insert into public.manuscript_groups (id, manuscript_id, parent_group_id, title, position)
  select (v_group_map ->> g.id::text)::uuid, v_new_manuscript_id,
         (v_group_map ->> g.parent_group_id::text)::uuid, g.title, g.position
    from public.manuscript_groups g
   where g.manuscript_id = v_source_manuscript_id;

  for v_source_chapter in
    select * from public.chapters where manuscript_id = v_source_manuscript_id order by position
  loop
    insert into public.chapters (manuscript_id, group_id, title, position)
    values (v_new_manuscript_id, (v_group_map ->> v_source_chapter.group_id::text)::uuid,
            v_source_chapter.title, v_source_chapter.position)
    returning id into v_new_chapter_id;

    insert into public.scenes (manuscript_id, chapter_id, title, content, word_count, position)
    select v_new_manuscript_id, v_new_chapter_id, s.title, s.content, s.word_count, s.position
      from public.scenes s
     where s.chapter_id = v_source_chapter.id
     order by s.position;
  end loop;

  insert into public.scenes (manuscript_id, chapter_id, title, content, word_count, position)
  select v_new_manuscript_id, null, s.title, s.content, s.word_count, s.position
    from public.scenes s
   where s.manuscript_id = v_source_manuscript_id and s.chapter_id is null
   order by s.position;

  return jsonb_build_object('status', 'ok', 'project', to_jsonb(v_new_project));
end;
$function$;

-- RLS: read and rename your own Groups. No INSERT or DELETE for clients.
alter table public.manuscript_groups enable row level security;

create policy "manuscript_groups: select own" on public.manuscript_groups
  as permissive for select to authenticated
  using (exists (select 1 from public.manuscripts m join public.projects p on p.id = m.project_id
                 where m.id = manuscript_groups.manuscript_id and p.user_id = (select auth.uid())));
create policy "manuscript_groups: update own" on public.manuscript_groups
  as permissive for update to authenticated
  using (exists (select 1 from public.manuscripts m join public.projects p on p.id = m.project_id
                 where m.id = manuscript_groups.manuscript_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from public.manuscripts m join public.projects p on p.id = m.project_id
                      where m.id = manuscript_groups.manuscript_id and p.user_id = (select auth.uid())));

revoke insert, delete on public.manuscript_groups from anon, authenticated;

-- ── 3. Unplaced Scenes: one Scene per position in each Manuscript ──────────

-- Position-only fix-up of existing ties: no version or updated_at change.
alter table public.scenes disable trigger scene_version_trigger;
alter table public.scenes disable trigger trg_scene_updated;

update public.scenes s
   set position = x.new_position
  from (select r.id,
               e.max_position + row_number() over (partition by r.manuscript_id order by r.position, r.created_at, r.id) as new_position
          from (select sc.id, sc.manuscript_id, sc.position, sc.created_at,
                       row_number() over (partition by sc.manuscript_id, sc.position order by sc.created_at, sc.id) as nth
                  from public.scenes sc where sc.chapter_id is null) r
          join (select sc.manuscript_id, max(sc.position) as max_position
                  from public.scenes sc where sc.chapter_id is null group by sc.manuscript_id) e
            on e.manuscript_id = r.manuscript_id
         where r.nth > 1) x
 where s.id = x.id;

alter table public.scenes enable trigger scene_version_trigger;
alter table public.scenes enable trigger trg_scene_updated;

alter table public.scenes
  add constraint scenes_unplaced_position_excl
  exclude using btree (manuscript_id with =, position with =) where (chapter_id is null)
  deferrable initially immediate;

-- ── 4. Deleting a Scene keeps its writing history ──────────────────────────

alter table public.writing_sessions drop constraint writing_sessions_scene_id_fkey;
-- The trigger below has already detached every row; SET NULL is the backstop.
alter table public.writing_sessions add constraint writing_sessions_scene_id_fkey
  foreign key (scene_id) references public.scenes(id) on delete set null;

-- SECURITY DEFINER: a Scene's history is detached whoever's rows they are
-- (as the foreign key action would), regardless of RLS.
create function public.detach_scene_writing_sessions()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_project_id uuid;
  r public.writing_sessions%rowtype;
  v_bucket_id uuid;
begin
  select m.project_id into v_project_id
    from public.manuscripts m where m.id = old.manuscript_id;
  if v_project_id is null then
    -- The Project is being deleted: its writing history goes with it.
    delete from public.writing_sessions ws where ws.scene_id = old.id;
    return old;
  end if;

  for r in select * from public.writing_sessions ws where ws.scene_id = old.id for update loop
    select ws.id into v_bucket_id
      from public.writing_sessions ws
     where ws.user_id = r.user_id and ws.session_date = r.session_date
       and ws.scene_id is null and ws.project_id = coalesce(r.project_id, v_project_id)
       for update;
    if found then
      update public.writing_sessions ws set words_added = ws.words_added + r.words_added where ws.id = v_bucket_id;
      delete from public.writing_sessions ws where ws.id = r.id;
    else
      update public.writing_sessions ws
         set scene_id = null, project_id = coalesce(r.project_id, v_project_id)
       where ws.id = r.id;
    end if;
  end loop;
  return old;
end;
$function$;

revoke execute on function public.detach_scene_writing_sessions() from public, anon;

create trigger scenes_detach_writing_sessions before delete on public.scenes
  for each row execute function public.detach_scene_writing_sessions();

insert into public.schema_migrations (version, name, applied_at, note)
values ('022', '022_manuscript_groups.sql', now(),
        'Rune 2.0 Manuscript Groups (recursive, no prose) and one sibling ordering model for Groups + Chapters (create/delete/move RPCs, cycle-proof); unique Unplaced Scene order; deleting a Scene keeps its writing history (scene_id set null, merged into Project-level history)');
