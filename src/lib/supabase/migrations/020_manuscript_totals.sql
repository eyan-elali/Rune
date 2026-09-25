-- ── Migration 020: one authoritative ordered total; Chapter creation closed ──
--
-- Rune 2.0 Phase 1, Task 7. Three changes:
--
-- 1. projects.word_count is maintained by the database.
--    It is the ORDERED MANUSCRIPT TOTAL: every placed Scene (chapter_id not
--    null) of the Project's Manuscript. Unplaced Scenes are excluded. It is
--    not the free-limit account total (account_word_total counts every Scene,
--    placed or Unplaced), and it never replaces it.
--      * ordered_manuscript_word_total(p_manuscript_id) — NEW: the one SQL
--        definition of that rule (SECURITY INVOKER, so a writer only ever sums
--        Scenes they can see).
--      * trigger scenes_refresh_project_word_count — NEW: AFTER INSERT, DELETE
--        or UPDATE OF word_count, chapter_id on scenes, per row. When the row's
--        placed words change (a save of a placed Scene, a move between placed
--        and Unplaced, a placed insert or delete — including the cascade of a
--        Chapter deletion), it recomputes the whole total from the Scenes, never
--        a delta, so a stale value heals on the next change. It locks the
--        Project row FIRST and reads the total in a LATER statement: in READ
--        COMMITTED that statement's snapshot is taken after the lock, so it sees
--        every Scene change committed by whoever held the lock before. Two
--        simultaneous saves on different Scenes therefore cannot leave a stale
--        total (the old app path read the Scenes, then wrote the total, in two
--        requests: a save committed in between was lost from the total until
--        the next save). SECURITY DEFINER, so the cascade of a deletion and the
--        SECURITY DEFINER creation RPCs update the row whatever the caller.
--        A Project being deleted has no Manuscript row left; nothing is written.
--      * move_scene: same signature and result; its own inline recomputation
--        is removed (the trigger now does it, in the same transaction).
--      * backfill: every Project's stored total is set to the rule once.
--    Nothing else writes projects.word_count except duplicate_project_checked,
--    which inserts the copy with the source's ordered total (unchanged; the
--    trigger then recomputes it from the copied Scenes). The app no longer
--    writes it (src/lib/projectWordCount.ts only revalidates caches).
--
-- 2. Direct Chapter inserts are closed to clients. INSERT on public.chapters
--    is revoked from anon and authenticated, and the "chapters: insert own"
--    policy is dropped (as migration 019 did for Scenes). A Chapter can now
--    only be created by create_chapter_checked (a Chapter always with its
--    first Scene, at the end of the Manuscript, under the per-account lock)
--    and duplicate_project_checked, both SECURITY DEFINER with explicit
--    ownership checks. Read, update and delete on chapters are unchanged.
--
-- 3. chapters_manuscript_id_position_key: UNIQUE (manuscript_id, position)
--    DEFERRABLE INITIALLY IMMEDIATE. Two Chapters of one Manuscript can no
--    longer share a position. The app has no Chapter reorder today (Chapters
--    are only appended, renamed and deleted; deletion leaves a harmless gap),
--    so nothing current becomes brittle; deferrable, like
--    scenes_chapter_id_position_key, so a future single-statement renumbering
--    RPC can swap positions. It replaces the plain index
--    chapters_manuscript_id_position_idx (same columns, same order). It
--    refuses to apply over existing ties (see the preflight below; production
--    Rune 1.x has none: chapter_position_tie_groups = 0 in the 2026-09-24
--    snapshot).
--
-- For the Rune 2.0 database only: it requires 019. Safe to apply BEFORE the
-- app deploy that stops writing projects.word_count: the previous app's
-- recalculation writes the same value (it merely races).
-- Rollback:
--   alter table public.chapters drop constraint chapters_manuscript_id_position_key;
--   create index chapters_manuscript_id_position_idx on public.chapters (manuscript_id, position);
--   grant insert on public.chapters to anon, authenticated;
--   re-create the "chapters: insert own" policy from 015_rune2_manuscript_foundation.sql;
--   drop trigger scenes_refresh_project_word_count on public.scenes;
--   drop function public.refresh_project_word_count();
--   re-run the move_scene block from 017;
--   drop function public.ordered_manuscript_word_total(uuid);
--   delete from public.schema_migrations where version = '020';
--   (and redeploy the previous app, which recalculates the total itself)
-- Apply as ONE script (psql -1, or the SQL editor).

do $$
declare
  v_ties int;
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 020 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '020') then
    raise exception 'Migration 020 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '019') then
    raise exception 'Migration 020 requires migration 019 (creation path hardening). Nothing was changed.';
  end if;
  -- The SECURITY DEFINER trigger runs as its owner (the role applying this),
  -- which must own projects, or its update would be subject to RLS.
  if (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.projects'::regclass) <> current_user
     or (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.chapters'::regclass) <> current_user then
    raise exception 'Migration 020 must be applied by the owner of public.projects and public.chapters (%, not %). Nothing was changed.',
      (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.projects'::regclass), current_user;
  end if;
  select count(*) into v_ties from (
    select 1 from public.chapters group by manuscript_id, position having count(*) > 1) t;
  if v_ties > 0 then
    raise exception 'Migration 020: % Manuscript Chapter position(s) are shared by more than one Chapter; renumber them first. Nothing was changed.', v_ties;
  end if;
end
$$;

-- ── 1. The ordered manuscript total, maintained by the database ────────────

create function public.ordered_manuscript_word_total(p_manuscript_id uuid)
 returns integer
 language sql
 stable
 set search_path to ''
as $function$
  select coalesce(sum(s.word_count), 0)::int
    from public.scenes s
   where s.manuscript_id = p_manuscript_id and s.chapter_id is not null;
$function$;

revoke execute on function public.ordered_manuscript_word_total(uuid) from public, anon;

create function public.refresh_project_word_count()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_manuscript_id uuid;
  v_project_id uuid;
  v_total int;
begin
  -- Only a change to this row's placed words can change the ordered total.
  if tg_op = 'INSERT' then
    if new.chapter_id is null or new.word_count = 0 then return null; end if;
    v_manuscript_id := new.manuscript_id;
  elsif tg_op = 'DELETE' then
    if old.chapter_id is null or old.word_count = 0 then return null; end if;
    v_manuscript_id := old.manuscript_id;
  else
    if (case when old.chapter_id is null then 0 else old.word_count end)
       = (case when new.chapter_id is null then 0 else new.word_count end) then
      return null;
    end if;
    v_manuscript_id := new.manuscript_id;
  end if;

  select m.project_id into v_project_id
    from public.manuscripts m where m.id = v_manuscript_id;
  if v_project_id is null then return null; end if; -- the Project is being deleted

  -- Lock first; the total is read by the NEXT statement, whose snapshot then
  -- includes every change committed by the previous lock holder.
  perform 1 from public.projects p where p.id = v_project_id for update;
  v_total := public.ordered_manuscript_word_total(v_manuscript_id);

  update public.projects p
     set word_count = v_total
   where p.id = v_project_id and p.word_count <> v_total;

  return null;
end;
$function$;

revoke execute on function public.refresh_project_word_count() from public, anon;

create trigger scenes_refresh_project_word_count
  after insert or delete or update of word_count, chapter_id on public.scenes
  for each row execute function public.refresh_project_word_count();

-- Same as 017 without its projects.word_count update (the trigger does it).
create or replace function public.move_scene(p_scene_id uuid, p_chapter_id uuid)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare
  v_scene public.scenes%rowtype;
  v_chapter_manuscript_id uuid;
  v_position int;
begin
  perform public.lock_account_word_budget();

  -- RLS: another writer's Scene is invisible.
  select * into v_scene from public.scenes s where s.id = p_scene_id for update;
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Scene not found');
  end if;

  if p_chapter_id is not null then
    -- RLS: another writer's Chapter is invisible.
    select c.manuscript_id into v_chapter_manuscript_id
      from public.chapters c where c.id = p_chapter_id;
    if not found then
      return jsonb_build_object('status', 'error', 'error', 'Chapter not found');
    end if;
    if v_chapter_manuscript_id <> v_scene.manuscript_id then
      return jsonb_build_object('status', 'error', 'error', 'A Scene can only move within its own manuscript');
    end if;
  end if;

  if v_scene.chapter_id is not distinct from p_chapter_id then
    return jsonb_build_object('status', 'ok', 'moved', false);
  end if;

  if p_chapter_id is null then
    select coalesce(max(s.position) + 1, 0) into v_position
      from public.scenes s
     where s.manuscript_id = v_scene.manuscript_id and s.chapter_id is null;
  else
    select coalesce(max(s.position) + 1, 0) into v_position
      from public.scenes s
     where s.chapter_id = p_chapter_id;
  end if;

  -- scenes_refresh_project_word_count recomputes projects.word_count.
  update public.scenes
     set chapter_id = p_chapter_id, position = v_position
   where id = p_scene_id;

  if p_chapter_id is not null then
    update public.chapters set updated_at = now() where id = p_chapter_id;
  end if;

  return jsonb_build_object('status', 'ok', 'moved', true);
end;
$function$;

update public.projects p
   set word_count = public.ordered_manuscript_word_total(m.id)
  from public.manuscripts m
 where m.project_id = p.id
   and p.word_count <> public.ordered_manuscript_word_total(m.id);

-- ── 2. Chapter creation only through the approved functions ─────────────────

revoke insert on public.chapters from anon, authenticated;
drop policy "chapters: insert own" on public.chapters;

-- ── 3. One Chapter per Manuscript position ──────────────────────────────────

drop index public.chapters_manuscript_id_position_idx;
alter table public.chapters
  add constraint chapters_manuscript_id_position_key unique (manuscript_id, position)
  deferrable initially immediate;

insert into public.schema_migrations (version, name, applied_at, note)
values ('020', '020_manuscript_totals.sql', now(),
        'Rune 2.0 manuscript totals: projects.word_count maintained by trigger (ordered placed-Scene total); Chapter INSERT only through the SECURITY DEFINER creation RPCs; unique deferrable (manuscript_id, position)');
