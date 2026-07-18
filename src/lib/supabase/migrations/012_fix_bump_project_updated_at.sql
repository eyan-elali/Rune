-- ── Migration 012: Fix bump_project_updated_at trigger function (July 2026 incident) ──
--
-- ROOT CAUSE (confirmed by inspecting the live production catalog, July 18 2026)
--
-- Every editor save was failing inside public.save_page_checked() with:
--
--     relation "projects" does not exist
--
-- save_page_checked runs with `set search_path = ''`. Its own body and every
-- word-limit helper it calls (lock_account_word_budget, account_word_total,
-- free_word_limit_for_caller) were inspected directly in production and are
-- fully schema-qualified, matching migration 011 exactly. They were NOT the
-- fault.
--
-- The fault is a trigger function that exists only in production — it was
-- never committed to this repository: public.bump_project_updated_at(),
-- attached to public.pages as
--
--     CREATE TRIGGER trg_page_updated
--     AFTER UPDATE ON pages
--     FOR EACH ROW
--     EXECUTE FUNCTION bump_project_updated_at();
--
-- Its deployed body referenced `projects` and `chapters` UNQUALIFIED and
-- pinned no search_path of its own, so it inherits the calling context's
-- active search path. When the pages UPDATE happens inside save_page_checked
-- (search_path = ''), the unqualified names cannot resolve, the trigger
-- raises `relation "projects" does not exist`, and the ENTIRE save
-- transaction rolls back — the RPC reached Postgres, yet the server page
-- stayed at 0 words. Plain table updates issued under a normal search path
-- (e.g. direct PostgREST writes) did not fail, which is why only the checked
-- save path broke.
--
-- THE FIX
--
-- Replace only this one function with a schema-qualified body pinned to
-- `search_path = ''`. Same trigger-function signature, same behavior (bump
-- the parent project's updated_at whenever one of its pages is updated),
-- same SECURITY INVOKER semantics (RLS on projects/chapters still applies to
-- the caller). The existing trg_page_updated trigger keeps pointing at the
-- replaced function — it is intentionally NOT dropped or recreated.
--
-- Safe to run repeatedly. Apply in the Supabase SQL editor as one script,
-- then run the read-only verification at the bottom of this file.

create or replace function public.bump_project_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.projects
  set updated_at = now()
  where id = (
    select c.project_id
    from public.chapters c
    where c.id = new.chapter_id
  );

  return new;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- Post-apply verification (read-only — run after the statement above):
--
-- 1. The deployed body is now fully qualified and pins search_path:
--
--    select pg_get_functiondef('public.bump_project_updated_at()'::regprocedure);
--
--    Expected: body references public.projects / public.chapters and the
--    header contains `SET search_path TO ''`.
--
-- 2. The trigger is still attached (this migration must not have touched it):
--
--    select tgname from pg_trigger
--    where tgrelid = 'public.pages'::regclass and not tgisinternal;
--
--    Expected: trg_page_updated present, alongside page_version_trigger and
--    enforce_single_canonical.
--
-- 3. Bounded scan — no other trigger function attached to pages, chapters,
--    or projects references an unqualified application table:
--
--    select c.relname as table_name,
--           t.tgname  as trigger_name,
--           p.proname as function_name,
--           coalesce(array_to_string(p.proconfig, ','), '(no pinned search_path)') as config,
--           p.prosrc ~* '(from|join|update|insert\s+into|delete\s+from)\s+(projects|pages|chapters|profiles|user_pricing_entitlements|writing_sessions|game_sessions|xp_events)[^.\w]'
--             as has_unqualified_ref
--    from pg_trigger t
--    join pg_class c on c.oid = t.tgrelid
--    join pg_proc  p on p.oid = t.tgfoid
--    where not t.tgisinternal
--      and c.relnamespace = 'public'::regnamespace
--      and c.relname in ('pages', 'chapters', 'projects');
--
--    Expected: has_unqualified_ref = false on every row.
-- ═══════════════════════════════════════════════════════════════════════
