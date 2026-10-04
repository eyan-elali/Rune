-- ── Migration 017: atomic Scene movement ────────────────────────────────────
--
-- Rune 2.0 Phase 1, Task 6. One new RPC; nothing existing changes.
--
--   * move_scene(p_scene_id, p_chapter_id) moves a Scene to the end of a
--     Chapter of its own Manuscript (p_chapter_id), or to the end of its
--     Manuscript's Unplaced Scenes (p_chapter_id null). Chapter → Chapter,
--     Chapter → Unplaced and Unplaced → Chapter are the same operation.
--
-- The move used to be several PostgREST calls from the server action (read
-- the destination's last position, update the Scene, touch the Chapter,
-- recalculate the total), so two simultaneous moves into one list could both
-- read the same last position and tie. Here, in one transaction:
--
--   1. lock_account_word_budget() — the per-account advisory lock that
--      insert_scene_checked, insert_unplaced_scene_checked and
--      save_scene_checked already take. Every move and every Unplaced
--      creation for the account serializes on it, so the destination's
--      "last position + 1" is read and written with no other move or
--      Unplaced insert in between. (A Manuscript belongs to one account, so
--      the per-account lock covers every list a move can touch.)
--   2. the Scene row is locked (FOR UPDATE) before it is validated.
--   3. validation: the Scene and the Chapter must be visible to the caller
--      (RLS: SECURITY INVOKER), and the Chapter must belong to the Scene's
--      Manuscript. Any refusal returns before a single write.
--   4. the Scene row's chapter_id and position change — same row, same ID,
--      content and writing history untouched; the version trigger bumps its
--      version as before. The destination Chapter's updated_at is touched.
--   5. projects.word_count is recomputed from the placed Scenes (the ordered
--      manuscript total; Unplaced Scenes excluded), in the same transaction.
--
-- Any error rolls the whole move back. Moving a Scene to where it already is
-- writes nothing ('moved': false).
--
-- Lock order is the same as save_scene_checked (advisory lock, then the Scene
-- row), so a move and a save cannot deadlock. reorder_chapter_scenes locks a
-- Chapter's Scene rows: a move out of that Chapter waits for it (or makes it
-- return 'stale'), and a move in appends after the highest existing
-- position, which a reorder (positions 0..n-1) can never reach.
--
-- Return shape: { status: 'ok', moved: bool } | { status: 'error', error }.
--
-- For the Rune 2.0 database only: it requires 016.
-- Rollback:
--   drop function public.move_scene(uuid, uuid);
--   delete from public.schema_migrations where version = '017';
-- Apply as ONE script (psql -1, or the SQL editor).

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 017 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '017') then
    raise exception 'Migration 017 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '016') then
    raise exception 'Migration 017 requires migration 016 (Scene structure RPCs). Nothing was changed.';
  end if;
end
$$;

create function public.move_scene(p_scene_id uuid, p_chapter_id uuid)
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

  update public.scenes
     set chapter_id = p_chapter_id, position = v_position
   where id = p_scene_id;

  if p_chapter_id is not null then
    update public.chapters set updated_at = now() where id = p_chapter_id;
  end if;

  update public.projects p
     set word_count = (
       select coalesce(sum(s.word_count), 0)::int
         from public.scenes s
        where s.manuscript_id = v_scene.manuscript_id and s.chapter_id is not null)
    from public.manuscripts m
   where m.id = v_scene.manuscript_id and p.id = m.project_id;

  return jsonb_build_object('status', 'ok', 'moved', true);
end;
$function$;

revoke execute on function public.move_scene(uuid, uuid) from public, anon;

insert into public.schema_migrations (version, name, applied_at, note)
values ('017', '017_atomic_scene_move.sql', now(),
        'Rune 2.0 atomic Scene move: move_scene (Chapter/Unplaced, one transaction under the per-account lock, recomputes the ordered total)');
