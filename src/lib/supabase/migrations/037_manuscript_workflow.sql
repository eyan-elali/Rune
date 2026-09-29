-- ── Migration 037: manuscript workflow — Chapter Trash, Scene placement, ────
-- ── Milestone lookups, and no free-word limit ─────────────────────────────
--
-- Rune 2.0, pre-Milestone 18 cleanup. Four changes, one script.
--
-- 1. Chapter Trash (architecture §26). A Chapter goes to Trash WITH its active
--    Scenes, as one piece of the manuscript, and comes back the same way.
--    Nothing is copied and nothing is renumbered away: every Chapter and
--    Scene keeps its id, title, prose, words, version, updated_at, history,
--    properties, references and writing history.
--
--    public.chapters — NEW columns:
--      * trashed_at            — null = active; set = in Trash since then.
--      * trashed_from_group_id — the Group it sat in (null: the top level).
--                                No foreign key: the Group may be deleted
--                                meanwhile.
--      * trashed_from_index    — its 0-based place among that parent's
--                                Groups and Chapters when it was trashed.
--    A trashed Chapter is in no Group (group_id null; chapters_trash_check)
--    and holds no sibling slot: chapters_sibling_position_key (UNIQUE NULLS
--    NOT DISTINCT) becomes chapters_sibling_position_excl, the same rule over
--    ACTIVE Chapters only, and check_structure_sibling_position,
--    next_structure_position and place_in_manuscript_structure ignore trashed
--    Chapters. So a Group whose Chapters are all in Trash counts as empty.
--
--    public.scenes — NEW column trashed_with_chapter: the Scene went to Trash
--    with its Chapter (trashed_from_chapter_id). Such a Scene is not a Trash
--    item of its own: it is listed, restored and deleted with its Chapter
--    ('Restore its chapter first'). A Scene trashed on its own before its
--    Chapter stays its own item; restoring it while its Chapter is in Trash
--    puts it in Unplaced Scenes, as when the Chapter is gone.
--
--    Visibility: chapters' select/update policies require an active Chapter,
--    so every reader (the shell, export, pickers, the legacy pages, the
--    INVOKER functions move_scene and reorder_chapter_scenes) sees only
--    active Chapters, and a reference to a trashed Chapter goes dormant
--    (workspace_object_active). insert_scene_checked, move_chapter,
--    duplicate_project_checked and create_manuscript_milestone skip trashed
--    Chapters explicitly (SECURITY DEFINER).
--
--    Restore: the Chapter returns to its Group at its old place (clamped),
--    or — its Group gone — to the end of the manuscript's top level ('top');
--    its Scenes return inside it in their order. Permanent deletion is only
--    from Trash and takes the Chapter and the Scenes trashed with it (their
--    writing history stays, as for any deleted Scene).
--
--    The Trash functions (trash_workspace_object, restore_workspace_object,
--    delete_trashed_workspace_object, workspace_trash_state,
--    list_workspace_trash) accept 'chapter'; every other type as before.
--
-- 2. Permanent deletion only through Trash. Clients lose DELETE on scenes and
--    chapters (privilege and policy): a Scene or Chapter is deleted only by
--    delete_trashed_workspace_object. delete_chapter stays, as the distinct
--    "remove this Chapter, keep its Scenes in Unplaced Scenes" action, now
--    SECURITY DEFINER with an explicit ownership check (same signature and
--    result). It deletes no prose.
--
-- 3. place_scene(p_scene_id, p_chapter_id | null, p_index | null): puts an
--    active Scene at `index` (0-based; null = last) among a Chapter's Scenes
--    or among the Unplaced Scenes — a reorder in place, a move between
--    Chapters, into or out of Unplaced — in ONE update under the per-account
--    lock, renumbering the destination 0..n-1. Same Scene id, prose, words,
--    history, properties, references and writing history; no writing is
--    counted. (A position change bumps the Scene's version, as every move
--    always has; the save path treats that as a metadata change.)
--
--    list_object_milestones(p_type 'scene' | 'chapter', p_id): the named
--    Milestones that hold that Scene or Chapter, newest first, with where it
--    stood in each — for the Inspector. Read-only.
--
-- 4. The free-word limit is retired from Rune 2.0 (no permanent word cap;
--    billing and any trial come later, separately). free_word_limit_for_caller
--    — the one resolver every checked RPC consults — now returns null, the
--    "unrestricted" answer those RPCs already honoured for Scribe writers. So
--    save_scene_checked, insert_scene_checked, insert_unplaced_scene_checked,
--    create_chapter_checked, create_project_checked, import_manuscript_checked,
--    duplicate_project_checked and restore_scene_revision never block writing,
--    creation, import, duplication or restore. Their signatures and result
--    shapes are unchanged — 'word_limit_blocked' simply never occurs — so
--    stale clients and queued offline saves keep working. The two functions
--    redefined here anyway (insert_scene_checked, duplicate_project_checked)
--    drop the dead check. account_word_total stays as an account metric.
--
-- Unchanged: every existing RPC signature; save_scene_checked's body; Scene
-- History and Milestone capture rules (a Milestone never includes a trashed
-- Chapter or Scene); Groups (no Group Trash: only an empty Group can be
-- deleted, as before).
--
-- For the Rune 2.0 database only: it requires 036. Apply BEFORE the app
-- deploy that offers Chapter Trash and Scene placement (the app detects
-- chapters.trashed_at and offers neither without it). The previous app keeps
-- working on it, except that its direct Scene deletion (deleteScene) is now
-- refused with nothing changed.
-- Rollback (only while no Chapter is in Trash — restore or delete them first):
--   restore the previous definitions of the functions below from schema.sql
--   at 036; drop function public.place_scene(uuid, uuid, integer),
--   public.list_object_milestones(text, uuid), public.trash_manuscript_chapter(uuid),
--   public.restore_manuscript_chapter(uuid), public.delete_trashed_manuscript_chapter(uuid);
--   alter table public.chapters drop constraint chapters_sibling_position_excl,
--     add constraint chapters_sibling_position_key unique nulls not distinct (manuscript_id, group_id, position) deferrable;
--   alter table public.chapters drop column trashed_at, drop column trashed_from_group_id, drop column trashed_from_index;
--   alter table public.scenes drop column trashed_with_chapter;
--   restore the chapters/scenes policies and delete grants of 036;
--   delete from public.schema_migrations where version = '037';
-- Apply as ONE script (psql -1, or the SQL editor).

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 037 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '037') then
    raise exception 'Migration 037 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '036') then
    raise exception 'Migration 037 requires migration 036 (Scene History and Milestones). Nothing was changed.';
  end if;
  if (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.chapters'::regclass) <> current_user then
    raise exception 'Migration 037 must be applied by the owner of public.chapters (%, not %). Nothing was changed.',
      (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.chapters'::regclass), current_user;
  end if;
end
$$;

-- ── 4. The free-word limit is retired ───────────────────────────────────────

-- Every checked RPC asks this and enforces only a non-null answer. Null: no
-- limit. Kept (not dropped) so those RPCs keep their bodies and signatures.
create or replace function public.free_word_limit_for_caller()
 returns integer
 language plpgsql
 stable
 set search_path to ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  -- Rune 2.0 has no free-word limit (migration 037).
  return null;
end;
$function$;

-- ── 1. Chapter Trash: columns and constraints ───────────────────────────────

alter table public.chapters add column trashed_at timestamptz;
alter table public.chapters add column trashed_from_group_id uuid;
alter table public.chapters add column trashed_from_index integer;
alter table public.chapters add constraint chapters_trash_check
  check (trashed_at is null or group_id is null);
alter table public.chapters add constraint chapters_trashed_from_check
  check (trashed_at is not null or (trashed_from_group_id is null and trashed_from_index is null));

alter table public.chapters drop constraint chapters_sibling_position_key;
alter table public.chapters add constraint chapters_sibling_position_excl
  exclude using btree (manuscript_id with =,
                       (coalesce(group_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
                       position with =)
  where (trashed_at is null) deferrable;

create index chapters_trashed_idx on public.chapters (manuscript_id, trashed_at) where trashed_at is not null;

alter table public.scenes add column trashed_with_chapter boolean default false not null;
alter table public.scenes add constraint scenes_trashed_with_chapter_check
  check (not trashed_with_chapter or (trashed_at is not null and trashed_from_chapter_id is not null));

-- ── Visibility, and deletion only through Trash ─────────────────────────────

drop policy "chapters: select own" on public.chapters;
create policy "chapters: select own" on public.chapters
  as permissive for select to authenticated
  using (trashed_at is null and exists (select 1 from public.manuscripts m join public.projects p on p.id = m.project_id
                                        where m.id = chapters.manuscript_id and p.user_id = (select auth.uid())));

drop policy "chapters: update own" on public.chapters;
create policy "chapters: update own" on public.chapters
  as permissive for update to authenticated
  using (trashed_at is null and exists (select 1 from public.manuscripts m join public.projects p on p.id = m.project_id
                                        where m.id = chapters.manuscript_id and p.user_id = (select auth.uid())))
  with check (trashed_at is null and exists (select 1 from public.manuscripts m join public.projects p on p.id = m.project_id
                                             where m.id = chapters.manuscript_id and p.user_id = (select auth.uid())));

drop policy "chapters: delete own" on public.chapters;
drop policy "scenes: delete own" on public.scenes;
revoke delete on public.chapters from anon, authenticated;
revoke delete on public.scenes from anon, authenticated;

-- ── Structure helpers: trashed Chapters hold no place ───────────────────────

create or replace function public.check_structure_sibling_position()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if tg_table_name = 'chapters' then
    if new.trashed_at is not null then
      return null;
    end if;
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
                  and c.position = new.position
                  and c.trashed_at is null) then
      raise exception 'Group % shares position % with a Chapter of the same parent', new.id, new.position
        using errcode = 'unique_violation';
    end if;
  end if;
  return null;
end;
$function$;

create or replace function public.next_structure_position(p_manuscript_id uuid, p_parent_group_id uuid)
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
           where c.manuscript_id = p_manuscript_id and c.group_id is not distinct from p_parent_group_id
             and c.trashed_at is null) s;
$function$;

create or replace function public.place_in_manuscript_structure(p_manuscript_id uuid, p_parent_group_id uuid, p_kind text, p_id uuid, p_index integer)
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
             and c.trashed_at is null
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

-- A Chapter in Trash cannot be moved (it has no place until restored).
create or replace function public.move_chapter(p_chapter_id uuid, p_parent_group_id uuid, p_index integer)
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
   where c.id = p_chapter_id and p.user_id = auth.uid() and c.trashed_at is null;
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

-- "Remove this Chapter, keep its Scenes": the Scenes move, in order, to the
-- end of Unplaced Scenes (same rows); the empty Chapter is deleted. Not
-- Trash, and never what "Move to Trash" does. SECURITY DEFINER from 037
-- (clients no longer delete Chapters): ownership is checked here.
create or replace function public.delete_chapter(p_chapter_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_chapter public.chapters%rowtype;
  v_scene_ids uuid[];
  v_base int;
begin
  perform public.lock_account_word_budget();

  select c.* into v_chapter
    from public.chapters c
    join public.manuscripts m on m.id = c.manuscript_id
    join public.projects p on p.id = m.project_id
   where c.id = p_chapter_id and p.user_id = auth.uid() and c.trashed_at is null
     for update of c;
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Chapter not found');
  end if;

  select coalesce(array_agg(s.id order by s.position, s.id), '{}')
    into v_scene_ids
    from (select sc.id, sc.position from public.scenes sc
           where sc.chapter_id = p_chapter_id for update) s;

  select coalesce(max(s.position) + 1, 0) into v_base
    from public.scenes s
   where s.manuscript_id = v_chapter.manuscript_id and s.chapter_id is null and s.trashed_at is null;

  -- Same rows, new placement. scenes_refresh_project_word_count takes their
  -- words out of the ordered total.
  update public.scenes s
     set chapter_id = null, position = v_base + o.ord::int - 1
    from unnest(v_scene_ids) with ordinality as o(id, ord)
   where s.id = o.id;

  delete from public.chapters c where c.id = p_chapter_id;

  return jsonb_build_object('status', 'ok', 'unplaced_scene_ids', to_jsonb(v_scene_ids));
end;
$function$;

-- ── Chapter Trash functions (internal; reached through the Trash functions) ─

create function public.trash_manuscript_chapter(p_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_chapter public.chapters%rowtype;
  v_index integer;
  v_scenes integer;
begin
  perform public.lock_account_word_budget();
  select c.* into v_chapter
    from public.chapters c
    join public.manuscripts m on m.id = c.manuscript_id
    join public.projects p on p.id = m.project_id
   where c.id = p_id and p.user_id = auth.uid()
     for update of c;
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Item not found');
  end if;
  if v_chapter.trashed_at is not null then
    return jsonb_build_object('status', 'error', 'error', 'Already in Trash');
  end if;

  -- Its place among its parent's Groups and Chapters, in the one sibling order.
  select o.ord - 1 into v_index
    from (select s.id, row_number() over (order by s.position, s.kind desc, s.id) as ord
            from (select 'group'::text as kind, g.id, g.position from public.manuscript_groups g
                   where g.manuscript_id = v_chapter.manuscript_id
                     and g.parent_group_id is not distinct from v_chapter.group_id
                  union all
                  select 'chapter'::text, c.id, c.position from public.chapters c
                   where c.manuscript_id = v_chapter.manuscript_id
                     and c.group_id is not distinct from v_chapter.group_id
                     and c.trashed_at is null) s) o
   where o.id = p_id;

  -- Its active Scenes go with it: out of the Chapter (so out of the ordered
  -- total, through scenes_refresh_project_word_count), each keeping its
  -- position, version and updated_at (increment_scene_version skips the
  -- trash transition).
  perform 1 from public.scenes s where s.chapter_id = p_id for update;
  update public.scenes
     set trashed_at = now(), trashed_from_chapter_id = p_id, trashed_with_chapter = true, chapter_id = null
   where chapter_id = p_id;
  get diagnostics v_scenes = row_count;

  update public.chapters
     set trashed_at = now(), trashed_from_group_id = v_chapter.group_id, trashed_from_index = v_index, group_id = null
   where id = p_id;

  return jsonb_build_object('status', 'ok', 'moved', 0, 'scenes', v_scenes);
end;
$function$;

create function public.restore_manuscript_chapter(p_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_chapter public.chapters%rowtype;
  v_parent uuid;
begin
  perform public.lock_account_word_budget();
  select c.* into v_chapter
    from public.chapters c
    join public.manuscripts m on m.id = c.manuscript_id
    join public.projects p on p.id = m.project_id
   where c.id = p_id and p.user_id = auth.uid()
     for update of c;
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Item not found');
  end if;
  if v_chapter.trashed_at is null then
    return jsonb_build_object('status', 'error', 'error', 'Not in Trash');
  end if;

  select g.id into v_parent
    from public.manuscript_groups g
   where g.id = v_chapter.trashed_from_group_id and g.manuscript_id = v_chapter.manuscript_id;

  -- Active again, at the end of its parent; then into its old place.
  update public.chapters
     set trashed_at = null, trashed_from_group_id = null, trashed_from_index = null,
         group_id = v_parent, position = public.next_structure_position(v_chapter.manuscript_id, v_parent)
   where id = p_id;
  if v_parent is not null or v_chapter.trashed_from_group_id is null then
    perform public.place_in_manuscript_structure(v_chapter.manuscript_id, v_parent, 'chapter', p_id,
                                                 v_chapter.trashed_from_index);
  end if;

  -- Its Scenes come back inside it, in their order.
  update public.scenes
     set trashed_at = null, trashed_from_chapter_id = null, trashed_with_chapter = false, chapter_id = p_id
   where trashed_with_chapter and trashed_from_chapter_id = p_id and manuscript_id = v_chapter.manuscript_id;

  return jsonb_build_object('status', 'ok',
    'location', case when v_chapter.trashed_from_group_id is not null and v_parent is null then 'top' else 'original' end);
end;
$function$;

create function public.delete_trashed_manuscript_chapter(p_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_chapter public.chapters%rowtype;
  v_scenes integer;
begin
  perform public.lock_account_word_budget();
  select c.* into v_chapter
    from public.chapters c
    join public.manuscripts m on m.id = c.manuscript_id
    join public.projects p on p.id = m.project_id
   where c.id = p_id and p.user_id = auth.uid()
     for update of c;
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Item not found');
  end if;
  if v_chapter.trashed_at is null then
    return jsonb_build_object('status', 'error', 'error', 'Only an item in Trash can be deleted permanently');
  end if;

  -- Its Scenes' writing history stays (scenes_detach_writing_sessions); their
  -- Scene History goes, except revisions a Milestone uses.
  delete from public.scenes
   where trashed_with_chapter and trashed_from_chapter_id = p_id and manuscript_id = v_chapter.manuscript_id;
  get diagnostics v_scenes = row_count;
  delete from public.chapters where id = p_id;
  return jsonb_build_object('status', 'ok', 'entries', 0, 'properties', 0, 'scenes', v_scenes);
end;
$function$;

-- A Scene that went with its Chapter comes back with it. A Scene trashed on
-- its own returns to its Chapter only while that Chapter is active.
create or replace function public.restore_manuscript_scene(p_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_scene public.scenes%rowtype;
  v_chapter uuid;
  v_position integer;
begin
  perform public.lock_account_word_budget();
  select s.* into v_scene
    from public.scenes s
    join public.manuscripts m on m.id = s.manuscript_id
    join public.projects p on p.id = m.project_id
   where s.id = p_id and p.user_id = auth.uid()
     for update of s;
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Item not found');
  end if;
  if v_scene.trashed_at is null then
    return jsonb_build_object('status', 'error', 'error', 'Not in Trash');
  end if;
  if v_scene.trashed_with_chapter then
    return jsonb_build_object('status', 'error', 'error', 'Restore its chapter first');
  end if;

  select c.id into v_chapter
    from public.chapters c
   where c.id = v_scene.trashed_from_chapter_id and c.manuscript_id = v_scene.manuscript_id
     and c.trashed_at is null
     for update;

  if v_chapter is not null then
    if exists (select 1 from public.scenes s where s.chapter_id = v_chapter and s.position = v_scene.position) then
      select coalesce(max(s.position) + 1, 0) into v_position from public.scenes s where s.chapter_id = v_chapter;
    else
      v_position := v_scene.position;
    end if;
  else
    if exists (select 1 from public.scenes s
                where s.manuscript_id = v_scene.manuscript_id and s.chapter_id is null
                  and s.trashed_at is null and s.position = v_scene.position) then
      select coalesce(max(s.position) + 1, 0) into v_position
        from public.scenes s
       where s.manuscript_id = v_scene.manuscript_id and s.chapter_id is null and s.trashed_at is null;
    else
      v_position := v_scene.position;
    end if;
  end if;

  update public.scenes
     set trashed_at = null, trashed_from_chapter_id = null, chapter_id = v_chapter, position = v_position
   where id = p_id;
  if v_chapter is not null then
    update public.chapters set updated_at = now() where id = v_chapter;
  end if;

  return jsonb_build_object('status', 'ok',
    'location', case when v_scene.trashed_from_chapter_id is not null and v_chapter is null then 'unplaced' else 'original' end);
end;
$function$;

create or replace function public.delete_trashed_manuscript_scene(p_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  perform public.lock_account_word_budget();
  if not exists (select 1 from public.scenes s
                   join public.manuscripts m on m.id = s.manuscript_id
                   join public.projects p on p.id = m.project_id
                  where s.id = p_id and p.user_id = auth.uid()) then
    return jsonb_build_object('status', 'error', 'error', 'Item not found');
  end if;
  if not exists (select 1 from public.scenes s where s.id = p_id and s.trashed_at is not null) then
    return jsonb_build_object('status', 'error', 'error', 'Only an item in Trash can be deleted permanently');
  end if;
  if exists (select 1 from public.scenes s where s.id = p_id and s.trashed_with_chapter) then
    return jsonb_build_object('status', 'error', 'error', 'It is in Trash with its chapter');
  end if;
  delete from public.scenes s where s.id = p_id;
  return jsonb_build_object('status', 'ok', 'entries', 0, 'properties', 0);
end;
$function$;

-- ── The Trash functions accept 'chapter' ────────────────────────────────────

create or replace function public.owned_workspace_object_project(p_type text, p_id uuid)
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
       when 'scene' then (select m.project_id from public.scenes s join public.manuscripts m on m.id = s.manuscript_id where s.id = p_id)
       when 'chapter' then (select m.project_id from public.chapters c join public.manuscripts m on m.id = c.manuscript_id where c.id = p_id)
     end;
$function$;

-- A trashed Chapter is not active: references to it go dormant.
create or replace function public.workspace_object_active(p_type text, p_id uuid)
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
    when 'scene' then exists (select 1 from public.scenes s where s.id = p_id and s.trashed_at is null)
    when 'chapter' then exists (select 1 from public.chapters c where c.id = p_id and c.trashed_at is null)
    else false
  end;
$function$;

create or replace function public.workspace_trash_state(p_type text, p_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
begin
  if p_type is null or p_type not in ('page', 'folder', 'collection', 'entry', 'scene', 'chapter')
     or public.owned_workspace_object_project(p_type, p_id) is null then
    return jsonb_build_object('status', 'ok', 'state', 'missing');
  end if;
  return jsonb_build_object('status', 'ok', 'state',
    case when public.workspace_object_active(p_type, p_id) then 'active' else 'trashed' end);
end;
$function$;

CREATE OR REPLACE FUNCTION public.trash_workspace_object(p_type text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_project_id uuid;
  v_node public.workspace_nodes%rowtype;
  v_from_folder uuid;
  v_child uuid;
  v_at integer;
  v_moved integer := 0;
begin
  -- A Scene (031) follows the manuscript's rules, not the Workspace tree's.
  if p_type = 'scene' then
    return public.trash_manuscript_scene(p_id);
  end if;
  -- A Chapter (037) goes with its Scenes, as one piece of the manuscript.
  if p_type = 'chapter' then
    return public.trash_manuscript_chapter(p_id);
  end if;
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

CREATE OR REPLACE FUNCTION public.restore_workspace_object(p_type text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_project_id uuid;
  v_trashed_at timestamptz;
  v_from_folder uuid;
  v_from_position integer;
  v_parent uuid;
  v_index integer;
  v_node_id uuid;
begin
  -- A Scene (031) follows the manuscript's rules, not the Workspace tree's.
  if p_type = 'scene' then
    return public.restore_manuscript_scene(p_id);
  end if;
  -- A Chapter (037) goes with its Scenes, as one piece of the manuscript.
  if p_type = 'chapter' then
    return public.restore_manuscript_chapter(p_id);
  end if;
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

CREATE OR REPLACE FUNCTION public.delete_trashed_workspace_object(p_type text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- A Chapter (037) goes with its Scenes, as one piece of the manuscript.
  if p_type = 'chapter' then
    return public.delete_trashed_manuscript_chapter(p_id);
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

-- Trashed Chapters are listed (with their Group, Scene count and words); a
-- Scene that went with its Chapter is listed as part of it, not on its own.
create or replace function public.list_workspace_trash(p_project_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
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
               null::uuid as from_chapter_id, null::text as from_chapter_title, null::boolean as from_chapter_active,
               null::uuid as from_group_id, null::text as from_group_title, null::boolean as from_group_active,
               null::integer as scenes, null::integer as words
          from public.workspace_documents d
          left join public.workspace_folders ff on ff.id = d.trashed_from_folder_id
         where d.project_id = p_project_id and d.trashed_at is not null
        union all
        select 'folder', f.id, f.title, f.trashed_at,
               f.trashed_from_folder_id, ff.title, (ff.id is not null and ff.trashed_at is null),
               null, null, null, null, null, null, null, null, null, null, null, null, null
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
               null, null, null, null, null, null, null, null
          from public.workspace_collections c
          left join public.workspace_folders ff on ff.id = c.trashed_from_folder_id
         where c.project_id = p_project_id and c.trashed_at is not null
        union all
        select 'entry', e.id, e.title, e.trashed_at,
               null, null, null,
               c.id, c.title, c.trashed_at is null,
               null, null, null, null, null, null, null, null, null, null
          from public.workspace_collection_entries e
          join public.workspace_collections c on c.id = e.collection_id
         where e.project_id = p_project_id and e.trashed_at is not null
        union all
        select 'scene', s.id, s.title, s.trashed_at,
               null, null, null, null, null, null, null, null,
               s.trashed_from_chapter_id, ch.title, (ch.id is not null and ch.trashed_at is null),
               null, null, null, null, s.word_count
          from public.scenes s
          join public.manuscripts m on m.id = s.manuscript_id
          left join public.chapters ch on ch.id = s.trashed_from_chapter_id and ch.manuscript_id = s.manuscript_id
         where m.project_id = p_project_id and s.trashed_at is not null and not s.trashed_with_chapter
        union all
        select 'chapter', ch.id, ch.title, ch.trashed_at,
               null, null, null, null, null, null, null, null, null, null, null,
               ch.trashed_from_group_id, g.title, g.id is not null,
               (select count(*)::integer from public.scenes s
                 where s.trashed_with_chapter and s.trashed_from_chapter_id = ch.id),
               (select coalesce(sum(s.word_count), 0)::integer from public.scenes s
                 where s.trashed_with_chapter and s.trashed_from_chapter_id = ch.id)
          from public.chapters ch
          join public.manuscripts m on m.id = ch.manuscript_id
          left join public.manuscript_groups g on g.id = ch.trashed_from_group_id and g.manuscript_id = ch.manuscript_id
         where m.project_id = p_project_id and ch.trashed_at is not null
      ) t), '[]'::jsonb));
end;
$function$;

-- ── Redefined to skip trashed Chapters (and, for the two checked RPCs, to ──
-- ── drop the retired free-word check) ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.insert_scene_checked(p_chapter_id uuid, p_title text, p_content jsonb, p_word_count integer, p_position integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_manuscript_id uuid;
  v_position int;
  v_new public.scenes%rowtype;
begin
  perform public.lock_account_word_budget();

  -- SECURITY DEFINER: ownership is checked here, not by RLS.
  select c.manuscript_id into v_manuscript_id
    from public.chapters c
    join public.manuscripts m on m.id = c.manuscript_id
    join public.projects p on p.id = m.project_id
   where c.id = p_chapter_id and p.user_id = auth.uid() and c.trashed_at is null;
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Chapter not found');
  end if;

  -- p_position is ignored (migration 018): always the end of the Chapter.
  select coalesce(max(s.position) + 1, 0) into v_position
    from public.scenes s
   where s.chapter_id = p_chapter_id;

  insert into public.scenes (manuscript_id, chapter_id, title, content, word_count, position)
  values (v_manuscript_id, p_chapter_id, p_title, p_content, p_word_count, v_position)
  returning * into v_new;

  return jsonb_build_object('status', 'ok', 'id', v_new.id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.duplicate_project_checked(p_project_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
   where s.manuscript_id = v_source_manuscript_id and s.trashed_at is null;

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
    select * from public.chapters where manuscript_id = v_source_manuscript_id and trashed_at is null order by position
  loop
    insert into public.chapters (manuscript_id, group_id, title, position)
    values (v_new_manuscript_id, (v_group_map ->> v_source_chapter.group_id::text)::uuid,
            v_source_chapter.title, v_source_chapter.position)
    returning id into v_new_chapter_id;

    insert into public.scenes (manuscript_id, chapter_id, title, content, word_count, position)
    select v_new_manuscript_id, v_new_chapter_id, s.title, s.content, s.word_count, s.position
      from public.scenes s
     where s.chapter_id = v_source_chapter.id and s.trashed_at is null
     order by s.position;
  end loop;

  insert into public.scenes (manuscript_id, chapter_id, title, content, word_count, position)
  select v_new_manuscript_id, null, s.title, s.content, s.word_count, s.position
    from public.scenes s
   where s.manuscript_id = v_source_manuscript_id and s.chapter_id is null and s.trashed_at is null
   order by s.position;

  return jsonb_build_object('status', 'ok', 'project', to_jsonb(v_new_project));
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_manuscript_milestone(p_manuscript_id uuid, p_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
  v_scene public.scenes%rowtype;
  v_latest public.scene_revisions%rowtype;
  v_revision uuid;
  v_count integer := 0;
begin
  perform public.lock_account_word_budget();
  if not exists (select 1 from public.manuscripts m join public.projects p on p.id = m.project_id
                  where m.id = p_manuscript_id and p.user_id = auth.uid()) then
    return jsonb_build_object('status', 'error', 'error', 'Manuscript not found');
  end if;
  if v_name = '' then
    return jsonb_build_object('status', 'error', 'error', 'Give the milestone a name');
  end if;
  if char_length(v_name) > 120 then
    return jsonb_build_object('status', 'error', 'error', 'Keep the name to 120 characters');
  end if;

  insert into public.manuscript_milestones (manuscript_id, name, structure, manuscript_words, unplaced_words, scene_count)
  values (
    p_manuscript_id,
    v_name,
    jsonb_build_object(
      'groups', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'title', g.title,
                                                              'parent_group_id', g.parent_group_id, 'position', g.position)
                                           order by g.position, g.id)
                            from public.manuscript_groups g where g.manuscript_id = p_manuscript_id), '[]'::jsonb),
      'chapters', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title,
                                                                'group_id', c.group_id, 'position', c.position)
                                             order by c.position, c.id)
                              from public.chapters c where c.manuscript_id = p_manuscript_id and c.trashed_at is null), '[]'::jsonb)),
    public.ordered_manuscript_word_total(p_manuscript_id),
    (select coalesce(sum(s.word_count), 0)::int from public.scenes s
      where s.manuscript_id = p_manuscript_id and s.chapter_id is null and s.trashed_at is null),
    0)
  returning id into v_id;

  for v_scene in
    select s.* from public.scenes s
     where s.manuscript_id = p_manuscript_id and s.trashed_at is null
     order by s.chapter_id nulls last, s.position, s.id
  loop
    v_revision := null;
    select r.* into v_latest
      from public.scene_revisions r
     where r.scene_id = v_scene.id
     order by r.created_at desc, r.id desc
     limit 1;
    if found and v_latest.content is not distinct from v_scene.content and v_latest.title = v_scene.title then
      v_revision := v_latest.id;
    else
      insert into public.scene_revisions (manuscript_id, scene_id, title, content, word_count, saved_at, reason)
      values (v_scene.manuscript_id, v_scene.id, v_scene.title, v_scene.content, v_scene.word_count,
              v_scene.updated_at, 'milestone')
      returning id into v_revision;
    end if;
    insert into public.manuscript_milestone_scenes (milestone_id, scene_id, revision_id, chapter_id, position)
    values (v_id, v_scene.id, v_revision, v_scene.chapter_id, v_scene.position);
    v_count := v_count + 1;
  end loop;

  update public.manuscript_milestones set scene_count = v_count where id = v_id;
  return jsonb_build_object('status', 'ok', 'id', v_id);
end;
$function$;

-- ── 3. Scene placement ──────────────────────────────────────────────────────

-- Puts an active Scene at p_index (0-based; null = last) among the active
-- Scenes of p_chapter_id, or of the Manuscript's Unplaced Scenes when
-- p_chapter_id is null, renumbering that list 0..n-1 in one statement (the
-- position rules are checked at its end). Reorders in place, moves between
-- Chapters, and into or out of Unplaced Scenes. Only the Scene's chapter_id
-- and position — and its siblings' positions — change.
create function public.place_scene(p_scene_id uuid, p_chapter_id uuid, p_index integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_scene public.scenes%rowtype;
  v_chapter public.chapters%rowtype;
  v_ids uuid[];
  v_n int;
  v_i int;
  v_rows int;
begin
  perform public.lock_account_word_budget();

  select s.* into v_scene
    from public.scenes s
    join public.manuscripts m on m.id = s.manuscript_id
    join public.projects p on p.id = m.project_id
   where s.id = p_scene_id and p.user_id = auth.uid() and s.trashed_at is null
     for update of s;
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Scene not found');
  end if;

  if p_chapter_id is not null then
    select c.* into v_chapter
      from public.chapters c
      join public.manuscripts m on m.id = c.manuscript_id
      join public.projects p on p.id = m.project_id
     where c.id = p_chapter_id and p.user_id = auth.uid() and c.trashed_at is null;
    if not found then
      return jsonb_build_object('status', 'error', 'error', 'Chapter not found');
    end if;
    if v_chapter.manuscript_id <> v_scene.manuscript_id then
      return jsonb_build_object('status', 'error', 'error', 'A Scene can only move within its own manuscript');
    end if;
  end if;

  select coalesce(array_agg(x.id order by x.position, x.id), '{}') into v_ids
    from (select s.id, s.position from public.scenes s
           where s.id <> p_scene_id
             and s.trashed_at is null
             and (case when p_chapter_id is null
                       then s.manuscript_id = v_scene.manuscript_id and s.chapter_id is null
                       else s.chapter_id = p_chapter_id end)
             for update) x;

  v_n := coalesce(array_length(v_ids, 1), 0);
  v_i := least(greatest(coalesce(p_index, v_n), 0), v_n);
  v_ids := v_ids[1:v_i] || p_scene_id || v_ids[v_i + 1:v_n];

  update public.scenes s
     set chapter_id = p_chapter_id, position = o.ord::int - 1
    from unnest(v_ids) with ordinality as o(id, ord)
   where s.id = o.id
     and (s.position <> o.ord::int - 1 or s.chapter_id is distinct from p_chapter_id);
  get diagnostics v_rows = row_count;

  if v_rows > 0 and p_chapter_id is not null then
    update public.chapters set updated_at = now() where id = p_chapter_id;
  end if;

  return jsonb_build_object('status', 'ok', 'moved', v_rows > 0,
                            'chapter_changed', v_scene.chapter_id is distinct from p_chapter_id);
end;
$function$;

-- ── Milestones that hold a Scene or a Chapter ───────────────────────────────

-- For the Inspector: the named Milestones that include this Scene (with the
-- Chapter it was in then — null: Unplaced — and its words there) or this
-- Chapter (with its title, Scenes and words then), newest first. Read-only.
create function public.list_object_milestones(p_type text, p_id uuid)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare
  v_manuscript_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_type = 'scene' then
    select s.manuscript_id into v_manuscript_id
      from public.scenes s
      join public.manuscripts m on m.id = s.manuscript_id
      join public.projects p on p.id = m.project_id
     where s.id = p_id and p.user_id = auth.uid();
    if not found then
      return jsonb_build_object('status', 'error', 'error', 'Scene not found');
    end if;
    return jsonb_build_object('status', 'ok', 'milestones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', ml.id, 'name', ml.name, 'created_at', ml.created_at,
               'chapter_id', ms.chapter_id,
               'chapter_title', (select c ->> 'title' from jsonb_array_elements(ml.structure -> 'chapters') c
                                  where c ->> 'id' = ms.chapter_id::text limit 1),
               'title', r.title, 'word_count', r.word_count)
             order by ml.created_at desc, ml.id desc)
        from public.manuscript_milestone_scenes ms
        join public.manuscript_milestones ml on ml.id = ms.milestone_id
        join public.scene_revisions r on r.id = ms.revision_id
       where ms.scene_id = p_id and ml.manuscript_id = v_manuscript_id), '[]'::jsonb));
  end if;

  if p_type = 'chapter' then
    select c.manuscript_id into v_manuscript_id
      from public.chapters c
      join public.manuscripts m on m.id = c.manuscript_id
      join public.projects p on p.id = m.project_id
     where c.id = p_id and p.user_id = auth.uid();
    if not found then
      return jsonb_build_object('status', 'error', 'error', 'Chapter not found');
    end if;
    return jsonb_build_object('status', 'ok', 'milestones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', ml.id, 'name', ml.name, 'created_at', ml.created_at,
               'chapter_id', p_id,
               'chapter_title', (select c ->> 'title' from jsonb_array_elements(ml.structure -> 'chapters') c
                                  where c ->> 'id' = p_id::text limit 1),
               'scene_count', (select count(*)::int from public.manuscript_milestone_scenes ms
                                where ms.milestone_id = ml.id and ms.chapter_id = p_id),
               'word_count', (select coalesce(sum(r.word_count), 0)::int
                                from public.manuscript_milestone_scenes ms
                                join public.scene_revisions r on r.id = ms.revision_id
                               where ms.milestone_id = ml.id and ms.chapter_id = p_id))
             order by ml.created_at desc, ml.id desc)
        from public.manuscript_milestones ml
       where ml.manuscript_id = v_manuscript_id
         and ml.structure -> 'chapters' @> jsonb_build_array(jsonb_build_object('id', p_id))), '[]'::jsonb));
  end if;

  return jsonb_build_object('status', 'error', 'error', 'Unknown item type');
end;
$function$;

revoke execute on function public.trash_manuscript_chapter(uuid) from public, anon, authenticated;
revoke execute on function public.restore_manuscript_chapter(uuid) from public, anon, authenticated;
revoke execute on function public.delete_trashed_manuscript_chapter(uuid) from public, anon, authenticated;
revoke execute on function public.place_scene(uuid, uuid, integer) from public, anon;
revoke execute on function public.list_object_milestones(text, uuid) from public, anon;

insert into public.schema_migrations (version, name, applied_at, note)
values ('037', '037_manuscript_workflow.sql', now(), 'Chapter Trash (chapters.trashed_at/trashed_from_group_id/trashed_from_index, scenes.trashed_with_chapter: a Chapter goes to Trash and back with its Scenes; RLS shows active Chapters only; the sibling order covers active Chapters only); permanent Scene/Chapter deletion only through Trash (no client DELETE); delete_chapter SECURITY DEFINER; place_scene (atomic reorder/move of a Scene among a Chapter''s or the Unplaced Scenes); list_object_milestones; free_word_limit_for_caller returns null — Rune 2.0 has no free-word limit (signatures unchanged)');
