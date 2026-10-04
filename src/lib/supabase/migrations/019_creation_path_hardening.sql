-- ── Migration 019: manuscript-creation path hardening ───────────────────────
--
-- Rune 2.0 Phase 1, Task 6C. Three changes:
--
-- 1. create_chapter_checked(p_manuscript_id, p_title, p_scene_title,
--    p_scene_content, p_scene_word_count) — NEW. Creates a Chapter at the end
--    of the Manuscript and its first Scene (position 0) in ONE transaction.
--    Until now createChapter inserted the Chapter, then the Scene, in two
--    requests: a failed second request left an empty, Scene-less Chapter.
--      1. lock_account_word_budget() — the per-account advisory lock every
--         Scene creation, save and move takes, so the Chapter's "last
--         position + 1" is read and written with no other Chapter creation
--         for the account in between, and the free-limit check below cannot
--         interleave with another creation or save.
--      2. validation: the Manuscript must be the caller's. Refusals return
--         before a single write: { status: 'error', error: 'Manuscript not found' }.
--      3. the free-limit check, identical to insert_scene_checked's
--         (account_word_total with the new Scene's words against
--         free_word_limit_for_caller()); an empty first Scene is never blocked.
--      4. the Chapter insert (position: last + 1, or 1 in an empty
--         Manuscript — the existing convention), then the Scene insert.
--    Any error rolls both back: there is never a Chapter without its Scene.
--    Returns { status: 'ok', chapter: <the Chapter row>, scene_id }
--          | { status: 'word_limit_blocked', limit } | { status: 'error', error }.
--
-- 2. Direct Scene inserts are closed to clients. INSERT on public.scenes is
--    revoked from anon and authenticated, and the "scenes: insert own"
--    policy is dropped (with RLS on and no insert policy, a re-granted
--    privilege would still insert nothing). A Scene can now only be created
--    through the approved functions, which enforce ownership, position and
--    the free limit:
--      insert_scene_checked, insert_unplaced_scene_checked,
--      create_chapter_checked, duplicate_project_checked.
--    Those four are therefore SECURITY DEFINER (owned by the table owner, who
--    is not subject to RLS), so every ownership check in them is explicit —
--    against projects.user_id = auth.uid() — instead of relying on RLS:
--      * insert_scene_checked and insert_unplaced_scene_checked: new bodies,
--        same signatures, same results; the Chapter / Manuscript lookup now
--        joins to the caller's projects.
--      * duplicate_project_checked: body unchanged — it already selects the
--        source project by user_id = auth.uid(), and every later read follows
--        from that row — only SECURITY DEFINER is set.
--    Every one of them calls lock_account_word_budget() first, which raises
--    'Not authenticated' when auth.uid() is null. EXECUTE is revoked from
--    PUBLIC and anon on all four. Read, update and delete on scenes are
--    unchanged (RLS, per writer).
--
-- 3. scenes_chapter_id_position_key: UNIQUE (chapter_id, position)
--    DEFERRABLE INITIALLY IMMEDIATE. Two placed Scenes of one Chapter can no
--    longer share a position, whatever writes them. Unplaced Scenes
--    (chapter_id null) are not covered: NULLs are distinct. Deferrable so the
--    check runs at the END of each statement, not per row: reorder_chapter_
--    scenes renumbers a Chapter 0..n-1 in one UPDATE, which swaps positions
--    mid-statement. It replaces the plain index scenes_chapter_id_position_idx
--    (same columns, same order).
--    It refuses to apply over existing ties (see the preflight below).
--
-- For the Rune 2.0 database only: it requires 018. Apply it together with the
-- app deploy that calls create_chapter_checked: the previous app inserts a
-- Chapter's first Scene directly, which this migration refuses.
-- Rollback:
--   drop function public.create_chapter_checked(uuid, text, text, jsonb, integer);
--   alter table public.scenes drop constraint scenes_chapter_id_position_key;
--   create index scenes_chapter_id_position_idx on public.scenes (chapter_id, position);
--   grant insert on public.scenes to anon, authenticated;
--   re-create the "scenes: insert own" policy from 015_rune2_manuscript_foundation.sql;
--   alter function public.duplicate_project_checked(uuid) security invoker;
--   grant execute on function public.duplicate_project_checked(uuid) to anon;
--   re-run the insert_scene_checked block from 018 and the
--   insert_unplaced_scene_checked block from 016 (both SECURITY INVOKER);
--   delete from public.schema_migrations where version = '019';
-- Apply as ONE script (psql -1, or the SQL editor).

do $$
declare
  v_ties int;
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 019 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '019') then
    raise exception 'Migration 019 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '018') then
    raise exception 'Migration 019 requires migration 018 (atomic Scene creation). Nothing was changed.';
  end if;
  -- The SECURITY DEFINER functions below run as their owner (the role
  -- applying this). It must own the manuscript tables, or they would be
  -- subject to RLS — and with no insert policy, create nothing.
  if (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.scenes'::regclass) <> current_user
     or (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.chapters'::regclass) <> current_user then
    raise exception 'Migration 019 must be applied by the owner of public.scenes and public.chapters (%, not %). Nothing was changed.',
      (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.scenes'::regclass), current_user;
  end if;
  select count(*) into v_ties from (
    select 1 from public.scenes where chapter_id is not null
     group by chapter_id, position having count(*) > 1) t;
  if v_ties > 0 then
    raise exception 'Migration 019: % Chapter position(s) are shared by more than one Scene; renumber them first. Nothing was changed.', v_ties;
  end if;
end
$$;

-- ── 1. Chapter + first Scene, atomically ───────────────────────────────────

create function public.create_chapter_checked(p_manuscript_id uuid, p_title text, p_scene_title text, p_scene_content jsonb, p_scene_word_count integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_limit int;
  v_new_total int;
  v_position int;
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

  select coalesce(max(c.position) + 1, 1) into v_position
    from public.chapters c
   where c.manuscript_id = p_manuscript_id;

  insert into public.chapters (manuscript_id, title, position)
  values (p_manuscript_id, p_title, v_position)
  returning * into v_chapter;

  insert into public.scenes (manuscript_id, chapter_id, title, content, word_count, position)
  values (p_manuscript_id, v_chapter.id, p_scene_title, p_scene_content, p_scene_word_count, 0)
  returning id into v_scene_id;

  return jsonb_build_object('status', 'ok', 'chapter', to_jsonb(v_chapter), 'scene_id', v_scene_id);
end;
$function$;

revoke execute on function public.create_chapter_checked(uuid, text, text, jsonb, integer) from public, anon;

-- ── 2. Scene creation only through the approved functions ───────────────────

create or replace function public.insert_scene_checked(p_chapter_id uuid, p_title text, p_content jsonb, p_word_count integer, p_position integer)
 returns jsonb
 language plpgsql
 security definer
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

  -- SECURITY DEFINER: ownership is checked here, not by RLS.
  select c.manuscript_id into v_manuscript_id
    from public.chapters c
    join public.manuscripts m on m.id = c.manuscript_id
    join public.projects p on p.id = m.project_id
   where c.id = p_chapter_id and p.user_id = auth.uid();
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

create or replace function public.insert_unplaced_scene_checked(p_manuscript_id uuid, p_title text, p_content jsonb, p_word_count integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_limit int;
  v_new_total int;
  v_position int;
  v_new public.scenes%rowtype;
begin
  perform public.lock_account_word_budget();

  -- SECURITY DEFINER: ownership is checked here, not by RLS.
  if not exists (
    select 1 from public.manuscripts m
      join public.projects p on p.id = m.project_id
     where m.id = p_manuscript_id and p.user_id = auth.uid()) then
    return jsonb_build_object('status', 'error', 'error', 'Manuscript not found');
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

  select coalesce(max(s.position) + 1, 0) into v_position
    from public.scenes s
   where s.manuscript_id = p_manuscript_id and s.chapter_id is null;

  insert into public.scenes (manuscript_id, chapter_id, title, content, word_count, position)
  values (p_manuscript_id, null, p_title, p_content, p_word_count, v_position)
  returning * into v_new;

  return jsonb_build_object('status', 'ok', 'id', v_new.id);
end;
$function$;

-- Body unchanged: the source project is selected by user_id = auth.uid().
alter function public.duplicate_project_checked(uuid) security definer;
revoke execute on function public.duplicate_project_checked(uuid) from public, anon;

revoke insert on public.scenes from anon, authenticated;
drop policy "scenes: insert own" on public.scenes;

-- ── 3. One placed Scene per Chapter position ────────────────────────────────

drop index public.scenes_chapter_id_position_idx;
alter table public.scenes
  add constraint scenes_chapter_id_position_key unique (chapter_id, position)
  deferrable initially immediate;

insert into public.schema_migrations (version, name, applied_at, note)
values ('019', '019_creation_path_hardening.sql', now(),
        'Rune 2.0 creation hardening: create_chapter_checked (Chapter + first Scene atomically); Scene INSERT only through the SECURITY DEFINER creation RPCs; unique deferrable (chapter_id, position)');
