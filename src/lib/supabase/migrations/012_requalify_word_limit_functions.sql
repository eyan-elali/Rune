-- ── Migration 012: Re-assert canonical word-limit functions (July 2026 incident) ──
--
-- WHY THIS MIGRATION EXISTS
--
-- Production runtime evidence (July 18, 2026) showed every editor save failing
-- inside the save path with:
--
--     relation "projects" does not exist
--
-- All of these functions run with `set search_path = ''`, so any UNQUALIFIED
-- table reference (e.g. `from projects` instead of `from public.projects`)
-- raises exactly that error at runtime. A mechanical scan of this repository —
-- current tree AND every historical version of every .sql file on every
-- branch — found zero unqualified relation references inside any
-- restricted-search_path function body. Therefore the broken body deployed in
-- production was never committed here: it was applied out-of-band (hand-pasted
-- in the SQL editor while repairing the earlier migration-011 incident, from a
-- draft that used unqualified names).
--
-- Because the error names "projects" (Postgres reports the first unresolvable
-- relation in parse order), and because the failure occurs only on word-count
-- GROWTH (the limit-check branch — non-growth saves skip it), the drifted body
-- is in the account-total/limit helper chain, most plausibly a variant of
-- account_word_total whose first unqualified reference is `projects`. The
-- harness (tools/sync-harness/sqldrift.mjs) reconstructs this drift in real
-- Postgres and reproduces the exact message; unqualified references in
-- free_word_limit_for_caller or save_page_checked itself produce "profiles" /
-- "pages" instead, so the observed message localizes the fault.
--
-- THE FIX
--
-- Rather than patching one function blind, this migration idempotently
-- re-creates every function originally defined by migration 011 from the
-- canonical, fully-schema-qualified definitions, so the deployed bodies are
-- guaranteed to match this repository no matter what was hand-applied:
--
--   • identical signatures (CREATE OR REPLACE cannot change a signature),
--   • SECURITY INVOKER (Postgres default; none of these were ever DEFINER),
--   • `set search_path = ''` retained — the fix is qualifying every
--     reference, NOT loosening the search path,
--   • RLS/ownership behavior unchanged (auth.uid() + existing policies),
--   • word-limit enforcement and both cohorts (legacy_15k / starter_2k)
--     unchanged,
--   • EXECUTE grants re-asserted after each replacement,
--   • the stale 3-argument account_word_total draft overload dropped
--     defensively (same as migration 011 already did),
--   • nothing unrelated dropped or modified.
--
-- Safe to run repeatedly. Apply in the Supabase SQL editor as one script.
-- After applying, re-run src/lib/supabase/verification/verify_011_account_word_limit.sql
-- Section A, and the read-only body scan at the bottom of this file.

-- ── lock_account_word_budget ────────────────────────────────────────────
create or replace function public.lock_account_word_budget()
returns void
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  perform pg_advisory_xact_lock(('x' || substr(md5(auth.uid()::text), 1, 16))::bit(64)::bigint);
end;
$$;

revoke execute on function public.lock_account_word_budget() from public;
grant execute on function public.lock_account_word_budget() to authenticated;

-- ── account_word_total ──────────────────────────────────────────────────
-- Drop the stale 3-arg draft overload first if a hand-applied version left it
-- behind — CREATE OR REPLACE below only replaces the exact 2-arg signature.
drop function if exists public.account_word_total(uuid, uuid, int);

create or replace function public.account_word_total(
  p_candidate_page_id    uuid default null,
  p_candidate_word_count int  default null
) returns int
language plpgsql
stable
set search_path = ''
as $$
declare
  v_total int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  with existing_pages as (
    select
      p.id as page_id,
      case
        when p_candidate_page_id is not null and p.id = p_candidate_page_id
        then p_candidate_word_count
        else p.word_count
      end as word_count
    from public.chapters c
    join public.projects pr on pr.id = c.project_id
    join public.pages p on p.chapter_id = c.id
    where pr.user_id = auth.uid()
  ),
  new_page as (
    -- Synthetic row for a brand-new page not yet inserted anywhere.
    select p_candidate_word_count as word_count
    where p_candidate_page_id is null
      and p_candidate_word_count is not null
  )
  select coalesce(sum(word_count), 0)
  into v_total
  from (
    select word_count from existing_pages
    union all
    select word_count from new_page
  ) all_words;

  return v_total;
end;
$$;

revoke execute on function public.account_word_total(uuid, int) from public;
grant execute on function public.account_word_total(uuid, int) to authenticated;

-- ── free_word_limit_for_caller ──────────────────────────────────────────
create or replace function public.free_word_limit_for_caller()
returns int
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tier text;
  v_cohort text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select subscription_tier into v_tier from public.profiles where id = auth.uid();
  if coalesce(v_tier, 'free') <> 'free' then
    return null;
  end if;

  select coalesce(pricing_cohort, 'starter_2k') into v_cohort
    from public.user_pricing_entitlements where user_id = auth.uid();

  return case coalesce(v_cohort, 'starter_2k')
    when 'legacy_15k' then 15000
    else 2000
  end;
end;
$$;

revoke execute on function public.free_word_limit_for_caller() from public;
grant execute on function public.free_word_limit_for_caller() to authenticated;

-- ── save_page_checked ───────────────────────────────────────────────────
create or replace function public.save_page_checked(
  p_page_id uuid,
  p_content jsonb,
  p_word_count int,
  p_expected_version int default null
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_old_word_count int;
  v_limit int;
  v_new_total int;
  v_updated public.pages%rowtype;
begin
  perform public.lock_account_word_budget();

  select p.word_count
    into v_old_word_count
    from public.pages p
    where p.id = p_page_id;

  if not found then
    return jsonb_build_object('status', 'error', 'error', 'Page not found');
  end if;

  -- Only enforce when words are being added — never block edits/deletions.
  if p_word_count > v_old_word_count then
    v_limit := public.free_word_limit_for_caller();
    if v_limit is not null then
      v_new_total := public.account_word_total(p_page_id, p_word_count);
      if v_new_total > v_limit then
        return jsonb_build_object('status', 'word_limit_blocked', 'limit', v_limit);
      end if;
    end if;
  end if;

  if p_expected_version is not null then
    update public.pages
       set content = p_content, word_count = p_word_count
     where id = p_page_id and version = p_expected_version
     returning * into v_updated;

    if not found then
      return jsonb_build_object('status', 'version_mismatch');
    end if;
  else
    update public.pages
       set content = p_content, word_count = p_word_count
     where id = p_page_id
     returning * into v_updated;

    if not found then
      return jsonb_build_object('status', 'error', 'error', 'Page not found');
    end if;
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'updated_at', v_updated.updated_at,
    'version', v_updated.version
  );
end;
$$;

revoke execute on function public.save_page_checked(uuid, jsonb, int, int) from public;
grant execute on function public.save_page_checked(uuid, jsonb, int, int) to authenticated;

-- ── insert_page_checked ─────────────────────────────────────────────────
create or replace function public.insert_page_checked(
  p_chapter_id uuid,
  p_title text,
  p_content jsonb,
  p_word_count int,
  p_position int
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_limit int;
  v_new_total int;
  v_new public.pages%rowtype;
begin
  perform public.lock_account_word_budget();

  if p_word_count > 0 then
    v_limit := public.free_word_limit_for_caller();
    if v_limit is not null then
      v_new_total := public.account_word_total(null, p_word_count);
      if v_new_total > v_limit then
        return jsonb_build_object('status', 'word_limit_blocked', 'limit', v_limit);
      end if;
    end if;
  end if;

  insert into public.pages (chapter_id, title, content, word_count, position, is_canonical)
  values (p_chapter_id, p_title, p_content, p_word_count, p_position, false)
  returning * into v_new;

  return jsonb_build_object('status', 'ok', 'id', v_new.id);
end;
$$;

revoke execute on function public.insert_page_checked(uuid, text, jsonb, int, int) from public;
grant execute on function public.insert_page_checked(uuid, text, jsonb, int, int) to authenticated;

-- ── duplicate_project_checked ───────────────────────────────────────────
create or replace function public.duplicate_project_checked(
  p_project_id uuid
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_source public.projects%rowtype;
  v_source_chapter record;
  v_source_page record;
  v_new_project public.projects%rowtype;
  v_new_chapter_id uuid;
  v_new_title text;
  v_used_numbers int[];
  v_draft_num int;
  v_source_total int;
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

  select coalesce(sum(p.word_count), 0)
    into v_source_total
  from public.chapters c
  join public.pages p on p.chapter_id = c.id
  where c.project_id = p_project_id;

  if v_source_total > 0 then
    v_limit := public.free_word_limit_for_caller();
    if v_limit is not null then
      v_account_total := public.account_word_total();
      if v_account_total + v_source_total > v_limit then
        return jsonb_build_object('status', 'word_limit_blocked', 'limit', v_limit);
      end if;
    end if;
  end if;

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
  values (auth.uid(), v_new_title, v_source.description, v_source.cover_color, v_source_total)
  returning * into v_new_project;

  for v_source_chapter in
    select * from public.chapters where project_id = p_project_id order by position
  loop
    insert into public.chapters (project_id, title, position)
    values (v_new_project.id, v_source_chapter.title, v_source_chapter.position)
    returning id into v_new_chapter_id;

    for v_source_page in
      select * from public.pages where chapter_id = v_source_chapter.id order by position
    loop
      insert into public.pages (chapter_id, title, content, word_count, position, is_canonical)
      values (
        v_new_chapter_id,
        v_source_page.title,
        v_source_page.content,
        v_source_page.word_count,
        v_source_page.position,
        v_source_page.is_canonical
      );
    end loop;
  end loop;

  return jsonb_build_object('status', 'ok', 'project', to_jsonb(v_new_project));
end;
$$;

revoke execute on function public.duplicate_project_checked(uuid) from public;
grant execute on function public.duplicate_project_checked(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- Post-apply verification (read-only — run after the statements above):
--
-- 1. No function with a restricted search_path may reference an unqualified
--    application relation. This scans EVERY public-schema function body:
--
--    select p.proname,
--           pg_get_function_identity_arguments(p.oid) as args
--    from pg_proc p
--    join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proconfig is not null
--      and exists (select 1 from unnest(p.proconfig) cfg
--                  where cfg = 'search_path=' or cfg = 'search_path=""')
--      and p.prosrc ~* '(from|join|update|insert\s+into|delete\s+from)\s+(projects|pages|chapters|profiles|user_pricing_entitlements|writing_sessions|game_sessions|xp_events)[^.\w]';
--
--    Expected result: zero rows.
--
-- 2. Exactly one account_word_total overload:
--
--    select p.proname, pg_get_function_identity_arguments(p.oid)
--    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'account_word_total';
--
--    Expected: one row — (p_candidate_page_id uuid, p_candidate_word_count integer).
-- ═══════════════════════════════════════════════════════════════════════
