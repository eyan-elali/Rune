-- ── Migration 016: Scene creation in Unplaced, atomic Scene reordering ──────
--
-- Rune 2.0 Phase 1, Task 5. Two new RPCs; nothing existing changes.
--
--   * insert_unplaced_scene_checked(p_manuscript_id, p_title, p_content,
--     p_word_count) creates a Scene directly in a Manuscript's Unplaced
--     Scenes. insert_scene_checked cannot: it derives the Manuscript from a
--     Chapter. Same free-limit check as insert_scene_checked (the per-account
--     advisory lock, then account_word_total with the new Scene's words),
--     same return shape ('ok' with the new id | 'word_limit_blocked' |
--     'error'). The position is computed here, under the lock: the end of the
--     Unplaced list. SECURITY INVOKER: RLS on manuscripts/scenes is the
--     ownership check.
--
--   * reorder_chapter_scenes(p_chapter_id, p_scene_ids) gives a Chapter's
--     placed Scenes the positions 0..n-1 in the order given, in one
--     statement. It refuses ('stale') unless p_scene_ids is exactly the
--     Chapter's current Scenes, with no duplicates — so a list made before a
--     Scene moved in or out can never leave a tie or strand a Scene. Only
--     rows whose position changes are written (each write bumps the Scene's
--     version). Scene IDs, content and chapter_id never change.
--
-- insert_scene_checked and save_scene_checked are unchanged (no overloads, no
-- new statuses).
--
-- For the Rune 2.0 database only: it requires 015 (scenes, manuscripts).
-- Rollback:
--   drop function public.reorder_chapter_scenes(uuid, uuid[]);
--   drop function public.insert_unplaced_scene_checked(uuid, text, jsonb, integer);
--   delete from public.schema_migrations where version = '016';
-- Apply as ONE script (psql -1, or the SQL editor).

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 016 requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '016') then
    raise exception 'Migration 016 has already been applied. Nothing was changed.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '015') then
    raise exception 'Migration 016 requires migration 015 (the Rune 2.0 manuscript foundation). Nothing was changed.';
  end if;
end
$$;

create function public.insert_unplaced_scene_checked(p_manuscript_id uuid, p_title text, p_content jsonb, p_word_count integer)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare
  v_limit int;
  v_new_total int;
  v_position int;
  v_new public.scenes%rowtype;
begin
  perform public.lock_account_word_budget();

  -- RLS: another writer's Manuscript is invisible.
  if not exists (select 1 from public.manuscripts m where m.id = p_manuscript_id) then
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

create function public.reorder_chapter_scenes(p_chapter_id uuid, p_scene_ids uuid[])
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare
  v_current uuid[];
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- RLS: another writer's Chapter is invisible.
  if not exists (select 1 from public.chapters c where c.id = p_chapter_id) then
    return jsonb_build_object('status', 'error', 'error', 'Chapter not found');
  end if;

  -- Lock the Chapter's Scenes so a concurrent reorder or move-out waits.
  select coalesce(array_agg(s.id order by s.id), '{}')
    into v_current
    from (select id from public.scenes where chapter_id = p_chapter_id for update) s;

  if coalesce(array_length(p_scene_ids, 1), 0) <> coalesce(array_length(v_current, 1), 0)
     or (select count(distinct x) from unnest(p_scene_ids) x) <> coalesce(array_length(v_current, 1), 0)
     or not (p_scene_ids <@ v_current) then
    return jsonb_build_object('status', 'stale');
  end if;

  update public.scenes s
     set position = o.ord - 1
    from unnest(p_scene_ids) with ordinality as o(id, ord)
   where s.id = o.id
     and s.chapter_id = p_chapter_id
     and s.position is distinct from (o.ord - 1)::int;

  return jsonb_build_object('status', 'ok');
end;
$function$;

revoke execute on function public.insert_unplaced_scene_checked(uuid, text, jsonb, integer) from public, anon;
revoke execute on function public.reorder_chapter_scenes(uuid, uuid[]) from public, anon;

insert into public.schema_migrations (version, name, applied_at, note)
values ('016', '016_scene_structure_rpcs.sql', now(),
        'Rune 2.0 Scene structure: insert_unplaced_scene_checked (free-limit-checked Unplaced creation), reorder_chapter_scenes (atomic, validated Scene reorder)');
