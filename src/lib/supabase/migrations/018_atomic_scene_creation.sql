-- ── Migration 018: atomic placed-Scene creation ─────────────────────────────
--
-- Rune 2.0 Phase 1, Task 6B. One function body changes; its contract does not.
--
--   * insert_scene_checked(p_chapter_id, p_title, p_content, p_word_count,
--     p_position) now chooses the new Scene's position itself: the end of the
--     Chapter, read and written under the per-account advisory lock. Same
--     signature, same grants, same return shape ('ok' with the new id |
--     'word_limit_blocked' | 'error').
--
-- The position used to come from the caller, which read the Chapter's last
-- position in a separate request. Two creations, or a creation and a
-- move_scene into the same Chapter, could both read the same last position
-- and tie. Now, in one transaction:
--
--   1. lock_account_word_budget() — the per-account advisory lock that
--      move_scene, insert_unplaced_scene_checked and save_scene_checked take.
--      Every placed creation and every move for the account serializes on it,
--      so "last position + 1" is read and written with no other creation or
--      move in between. (A Chapter belongs to one account, so the per-account
--      lock covers every append to it.)
--   2. validation: the Chapter must be visible to the caller (RLS: SECURITY
--      INVOKER), which also means its Manuscript is the caller's. The new
--      Scene's Manuscript is the Chapter's (and the composite foreign key
--      (chapter_id, manuscript_id) holds it there). Refusals return before
--      any write: { status: 'error', error: 'Chapter not found' } — until now
--      another writer's Chapter surfaced as a raised RLS error (42501).
--   3. the free-limit check, unchanged (account_word_total with the new
--      Scene's words against free_word_limit_for_caller()).
--   4. the insert, at the end of the Chapter.
--
-- p_position is still accepted — deployed clients and queued callers send it
-- — but it is IGNORED: every caller meant "the end of the Chapter", and a
-- precomputed position is exactly the value that could tie. Onboarding's
-- position 0 in its new, empty Chapter is still 0.
--
-- Lock order is the same as move_scene and save_scene_checked (advisory lock
-- first), so none of them can deadlock with this. A reorder_chapter_scenes
-- running meanwhile assigns 0..n-1 to the rows it locked; the new Scene
-- appends after the highest existing position, which a reorder can never
-- reach, and a reorder that then sees n+1 Scenes returns 'stale'.
--
-- For the Rune 2.0 database only: it requires 017.
-- Rollback (restores the 015 body, where the caller's p_position is used):
--   re-run the `create function public.insert_scene_checked` block from
--   015_rune2_manuscript_foundation.sql as `create or replace function`, then
--   delete from public.schema_migrations where version = '018';
-- Apply as ONE script (psql -1, or the SQL editor).

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 018 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '018') then
    raise exception 'Migration 018 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '017') then
    raise exception 'Migration 018 requires migration 017 (atomic Scene move). Nothing was changed.';
  end if;
end
$$;

create or replace function public.insert_scene_checked(p_chapter_id uuid, p_title text, p_content jsonb, p_word_count integer, p_position integer)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare
  v_manuscript_id uuid;
  v_limit int;
  v_new_total int;
  v_position int;
  v_new public.scenes%rowtype;
begin
  perform public.lock_account_word_budget();

  -- RLS: another writer's Chapter is invisible.
  select c.manuscript_id into v_manuscript_id
    from public.chapters c where c.id = p_chapter_id;
  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Chapter not found');
  end if;

  if p_word_count > 0 then
    v_limit := public.free_word_limit_for_caller();
    if v_limit is not null then
      v_new_total := public.account_word_total(null, p_word_count);
      if v_new_total > v_limit then
        return jsonb_build_object('status', 'word_limit_blocked', 'limit', v_limit);
      end if;
    end if;
  end if;

  -- p_position is ignored (see the header): always the end of the Chapter.
  select coalesce(max(s.position) + 1, 0) into v_position
    from public.scenes s
   where s.chapter_id = p_chapter_id;

  insert into public.scenes (manuscript_id, chapter_id, title, content, word_count, position)
  values (v_manuscript_id, p_chapter_id, p_title, p_content, p_word_count, v_position)
  returning * into v_new;

  return jsonb_build_object('status', 'ok', 'id', v_new.id);
end;
$function$;

insert into public.schema_migrations (version, name, applied_at, note)
values ('018', '018_atomic_scene_creation.sql', now(),
        'Rune 2.0 atomic placed-Scene creation: insert_scene_checked validates the Chapter and appends under the per-account lock (p_position accepted, ignored)');
