-- ═══════════════════════════════════════════════════════════════════════
--  Verification script — migration 011 (account-wide free-word-limit)
-- ═══════════════════════════════════════════════════════════════════════
--
-- Run this in the Supabase SQL editor of a DEVELOPMENT/STAGING project
-- ONLY, after applying src/lib/supabase/migrations/011_account_word_limit.sql
-- there. Never run this against production.
--
-- This is not a migration — it creates nothing permanent by itself.
-- Section A and B are pure reads. Section C performs real inserts/updates
-- but every block is wrapped in its own `begin ... rollback;`, so nothing
-- it does is kept unless you deliberately change a ROLLBACK to COMMIT
-- after inspecting the result. Run each block one at a time (not the
-- whole file at once) so you can read the output between steps.
--
-- Central product rule this migration enforces, and this script verifies
-- throughout: the account-wide free-word allowance counts EVERY live page
-- a writer stores — canonical and non-canonical alike. A 500-word
-- canonical page plus a 1,500-word non-canonical draft in the same chapter
-- uses 2,000 words of the allowance, not 500. Canonical status only ever
-- affects the *manuscript display* total (projects.word_count) shown
-- elsewhere in the app — never this allowance.
--
-- Before Section C, set up real test accounts/content in this staging
-- project (via normal signup / the app's editor) and fill in these
-- placeholders throughout the file:
--
--   <STARTER_USER_ID>       — a pricing_cohort = 'starter_2k' account
--   <LEGACY_USER_ID>        — a pricing_cohort = 'legacy_15k' account
--   <SCRIBE_USER_ID>        — a subscription_tier = 'scribe' account
--   <TEST_PROJECT_ID>       — a project owned by <STARTER_USER_ID> with at least one chapter/page
--   <TEST_CHAPTER_ID>       — a chapter in that project
--   <TEST_PAGE_ID>          — a page in that chapter
--   <OTHER_PAGE_ID_SAME_CHAPTER>  — a second page in <TEST_CHAPTER_ID>, different canonical status than <TEST_PAGE_ID>
--   <NON_CANONICAL_TEST_PAGE_ID>  — a page confirmed non-canonical via B3
--   <MIXED_TEST_PROJECT_ID>       — a project with both a canonical and a non-canonical page, for D5
--   <CANON_PAGE_ID> / <NONCANON_PAGE_ID>  — for the two-session concurrency test D6
--   <SCRIBE_TEST_PAGE_ID>    — a page owned by <SCRIBE_USER_ID>
--   <A_PROJECT_ID_OWNED_BY_LEGACY_USER>  — for the ownership test
--
-- Supabase's SQL editor runs as the `postgres` superuser, which bypasses
-- RLS and has no JWT — so auth.uid() is null there by default, and every
-- function in migration 011 explicitly rejects that. To call these
-- functions (or run raw inserts/updates that must pass RLS the same way
-- the app's authenticated client does) as a specific test user, each
-- Section C/D block starts by faking that user's JWT claims for the
-- current session — the standard Supabase pattern for exercising
-- RLS/auth.uid()-scoped code from the SQL editor:
--
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub": "<STARTER_USER_ID>"}';
--
-- This does not require the user's real password and does not persist
-- past the transaction — it's the safest way to test as a specific user
-- without ever touching real credentials.


-- ═══════════════════════════════════════════════════════════════════════
--  SECTION A — function existence, security mode, search_path, grants
--  (pure catalog reads, no auth impersonation needed, safe to run as-is)
-- ═══════════════════════════════════════════════════════════════════════

-- A1. All six functions exist, with the expected argument signatures.
-- Note account_word_total takes 2 arguments (uuid, int) as of this
-- correction — a 3-argument overload would indicate a stale prior draft.
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as return_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'lock_account_word_budget',
    'account_word_total',
    'free_word_limit_for_caller',
    'save_page_checked',
    'insert_page_checked',
    'duplicate_project_checked'
  )
order by p.proname;
-- Expect: exactly 6 rows, one per function name above.

-- A2. Security mode — every one of these MUST show security_definer = false
-- (SECURITY INVOKER). If any shows true, that function is running with
-- elevated privilege and bypassing RLS — treat that as a critical bug, do
-- not deploy.
select
  p.proname as function_name,
  p.prosecdef as security_definer,
  case when p.prosecdef then 'SECURITY DEFINER ⚠️ unexpected — should be INVOKER' else 'SECURITY INVOKER (expected)' end as assessment
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'lock_account_word_budget', 'account_word_total', 'free_word_limit_for_caller',
    'save_page_checked', 'insert_page_checked', 'duplicate_project_checked'
  )
order by p.proname;

-- A3. search_path — every one of these MUST show search_path=  (empty)
-- in proconfig. A missing/absent entry means the function inherits the
-- caller's search_path, which is the hijack risk this migration closes.
select
  p.proname as function_name,
  p.proconfig as configured_settings,
  case
    when p.proconfig is null then 'NO search_path set ⚠️'
    when 'search_path=' = any(p.proconfig) then 'search_path='''' (expected)'
    else 'search_path set to something else ⚠️ — inspect'
  end as assessment
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'lock_account_word_budget', 'account_word_total', 'free_word_limit_for_caller',
    'save_page_checked', 'insert_page_checked', 'duplicate_project_checked'
  )
order by p.proname;

-- A4. Grants — `authenticated` must have EXECUTE; `anon` and `PUBLIC`
-- must NOT.
select
  p.proname as function_name,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('public', p.oid, 'EXECUTE') as public_role_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'lock_account_word_budget', 'account_word_total', 'free_word_limit_for_caller',
    'save_page_checked', 'insert_page_checked', 'duplicate_project_checked'
  )
order by p.proname;
-- Expect: authenticated_can_execute = true, anon_can_execute = false,
-- public_role_can_execute = false, on every row.

-- A5. pages.version trigger (migration 006) exists and fires BEFORE UPDATE.
select
  tgname as trigger_name,
  pg_get_triggerdef(oid) as definition
from pg_trigger
where tgrelid = 'public.pages'::regclass
  and not tgisinternal;
-- Expect a row for page_version_trigger (BEFORE UPDATE, increments version).
-- Also expect enforce_single_canonical (migration 001, AFTER UPDATE OF
-- is_canonical) if that migration has been applied to this project.


-- ═══════════════════════════════════════════════════════════════════════
--  SECTION B — read-only data checks
--  (ground-truth totals computed directly from tables, no RPC/auth needed)
-- ═══════════════════════════════════════════════════════════════════════

-- B1. Ground-truth account total for a given user, computed independently
-- of account_word_total() — use this to cross-check the RPC result in
-- Section C/D rather than trusting the function to grade itself. This is a
-- flat sum of every page's word_count, deliberately NOT canonical-aware —
-- that would be the wrong ground truth for this specific check. Replace
-- <ANY_USER_ID> and run.
select coalesce(sum(p.word_count), 0) as ground_truth_account_total
from public.projects pr
join public.chapters c on c.project_id = pr.id
join public.pages p on p.chapter_id = c.id
where pr.user_id = '<ANY_USER_ID>';

-- B2. Cohort + resolved limit for the three test accounts (no impersonation
-- needed — this reads profiles/user_pricing_entitlements directly, which
-- `postgres` can see regardless of RLS).
select
  pr.id as user_id,
  pr.subscription_tier,
  upe.pricing_cohort,
  case
    when pr.subscription_tier <> 'free' then null
    else case coalesce(upe.pricing_cohort, 'starter_2k') when 'legacy_15k' then 15000 else 2000 end
  end as expected_limit
from public.profiles pr
left join public.user_pricing_entitlements upe on upe.user_id = pr.id
where pr.id in ('<STARTER_USER_ID>', '<LEGACY_USER_ID>', '<SCRIBE_USER_ID>');
-- Expect: starter -> 2000, legacy -> 15000, scribe -> null (unlimited).

-- B3. Canonical-status spot check — for CONTEXT only. Which page (if any)
-- is canonical in a chapter determines that chapter's contribution to the
-- *manuscript display* total elsewhere in the app (projects.word_count),
-- and nothing else — it must have NO bearing on the account-wide allowance,
-- which always counts every row below regardless of is_canonical. Use this
-- to identify a canonical and a non-canonical page id for the D-series
-- tests below.
select id as page_id, title, word_count, is_canonical
from public.pages
where chapter_id = '<TEST_CHAPTER_ID>'
order by position;


-- ═══════════════════════════════════════════════════════════════════════
--  SECTION C — core atomic-function behavior
--  (each block is self-contained; run one at a time; rolls back by default)
-- ═══════════════════════════════════════════════════════════════════════

-- C1. Unauthenticated caller is rejected (no impersonation set — auth.uid()
-- is null in a fresh SQL editor session).
begin;
  select public.account_word_total();
  -- Expect: an error — "Not authenticated" — not a silently-returned number.
rollback;

-- C2. account_word_total() as an authenticated user matches the Section B1
-- ground truth for the same user.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub": "<STARTER_USER_ID>"}';
  select public.account_word_total() as rpc_total;
  -- Compare this number against B1 run with the same user id substituted.
rollback;

-- C3. Page-save success — a normal, under-limit growth save.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub": "<STARTER_USER_ID>"}';

  select word_count, version from public.pages where id = '<TEST_PAGE_ID>';
  -- Note the current word_count and version, then substitute them below
  -- (p_word_count should be only slightly larger; p_expected_version must
  -- match exactly what the query above just showed).

  select public.save_page_checked(
    '<TEST_PAGE_ID>'::uuid,
    '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"verification test"}]}]}'::jsonb,
    5,   -- p_word_count: replace with current word_count + a small amount
    1    -- p_expected_version: replace with the version just shown
  );
  -- Expect: {"status": "ok", "updated_at": "...", "version": N+1}
rollback; -- change to `commit;` only if you intend to actually keep this test write

-- C4. Stale-version rejection — same call, deliberately wrong version.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub": "<STARTER_USER_ID>"}';

  select public.save_page_checked(
    '<TEST_PAGE_ID>'::uuid,
    '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"stale version test"}]}]}'::jsonb,
    5,
    999999  -- deliberately wrong version
  );
  -- Expect: {"status": "version_mismatch"} — and confirm nothing was
  -- written by re-running the select from C3 after this block.
rollback;

-- C5. Over-limit rejection (canonical page) — pick p_word_count large
-- enough that (current account total + this delta) exceeds the test
-- account's limit from B2.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub": "<STARTER_USER_ID>"}';

  select public.save_page_checked(
    '<TEST_PAGE_ID>'::uuid,
    '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"over limit test"}]}]}'::jsonb,
    50000,  -- deliberately large
    (select version from public.pages where id = '<TEST_PAGE_ID>')
  );
  -- Expect: {"status": "word_limit_blocked", "limit": 2000} (or 15000 for
  -- a legacy test account). Confirm the page's word_count is unchanged
  -- afterward.
rollback;

-- C6. Project-duplication success — under the limit.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub": "<STARTER_USER_ID>"}';

  select public.duplicate_project_checked('<TEST_PROJECT_ID>'::uuid);
  -- Expect: {"status": "ok", "project": {...}}. Inspect the returned
  -- project id, then (still inside this same transaction, before
  -- rollback) confirm chapters/pages were copied:
  --   select count(*) from public.chapters where project_id = '<paste returned id>';
  --   select count(*) from public.pages p join public.chapters c on c.id = p.chapter_id where c.project_id = '<paste returned id>';
rollback; -- rolling back removes the duplicate entirely — nothing is kept

-- C7. Project-duplication rejection leaves no partial rows. Requires a
-- source project whose word count alone would push the account over its
-- limit (e.g. run this against a source project with several thousand
-- words for a starter_2k test account, or temporarily lower the test
-- account's remaining headroom by writing content first).
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub": "<STARTER_USER_ID>"}';

  select count(*) as project_count_before from public.projects where user_id = '<STARTER_USER_ID>';

  select public.duplicate_project_checked('<LARGE_TEST_PROJECT_ID>'::uuid);
  -- Expect: {"status": "word_limit_blocked", "limit": ...}

  select count(*) as project_count_after from public.projects where user_id = '<STARTER_USER_ID>';
  -- Expect: project_count_after = project_count_before — no new project
  -- row was created, confirming the rejection happened before any insert
  -- (not a partial duplicate that then got cleaned up).
rollback;

-- C8. Ownership enforcement — a project belonging to someone else must be
-- reported as not found, never duplicated.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub": "<STARTER_USER_ID>"}';

  select public.duplicate_project_checked('<A_PROJECT_ID_OWNED_BY_LEGACY_USER>'::uuid);
  -- Expect: {"status": "error", "error": "Project not found"}
rollback;


-- ═══════════════════════════════════════════════════════════════════════
--  SECTION D — canonical-status independence
--  (the specific rule this correction enforces: canonical vs. non-canonical
--  must never change how much of the allowance a writer has used)
-- ═══════════════════════════════════════════════════════════════════════

-- D1. 500 canonical words + 1,500 non-canonical words in the same chapter
-- = 2,000 account words, not 500. Builds an isolated chapter so the delta
-- is unambiguous regardless of what else the test account already stores.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub": "<STARTER_USER_ID>"}';

  select public.account_word_total() as total_before;

  with new_project as (
    insert into public.projects (user_id, title) values (auth.uid(), 'D1 verification project')
    returning id
  ), new_chapter as (
    insert into public.chapters (project_id, title, position)
    select id, 'Chapter 1', 1 from new_project
    returning id
  )
  insert into public.pages (chapter_id, title, content, word_count, position, is_canonical)
  select id, 'Canonical (500w)', null, 500, 0, true from new_chapter
  union all
  select id, 'Draft (1,500w)', null, 1500, 1, false from new_chapter;

  select public.account_word_total() as total_after;
  -- Expect: total_after - total_before = 2000 exactly.
rollback; -- discards the verification project entirely

-- D2. Changing which page is canonical must not change account usage.
-- Substitute two real page ids from the SAME chapter with different
-- current canonical status (see B3).
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub": "<STARTER_USER_ID>"}';

  select public.account_word_total() as total_before;

  -- The enforce_single_canonical trigger (migration 001) automatically
  -- clears the sibling's canonical flag, so this one UPDATE "switches"
  -- canonical status within the chapter.
  update public.pages set is_canonical = true where id = '<OTHER_PAGE_ID_SAME_CHAPTER>';

  select public.account_word_total() as total_after;
  -- Expect: total_after = total_before exactly.
rollback;

-- D3. Clearing canonical status entirely must not change account usage.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub": "<STARTER_USER_ID>"}';

  select public.account_word_total() as total_before;

  update public.pages set is_canonical = false
  where id = '<TEST_PAGE_ID>' and is_canonical = true;

  select public.account_word_total() as total_after;
  -- Expect: total_after = total_before exactly.
rollback;

-- D4. Saving a NON-canonical page beyond the allowance is rejected exactly
-- like a canonical one would be (compare against C5's result).
-- <NON_CANONICAL_TEST_PAGE_ID> must be confirmed non-canonical via B3.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub": "<STARTER_USER_ID>"}';

  select public.save_page_checked(
    '<NON_CANONICAL_TEST_PAGE_ID>'::uuid,
    '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"over limit, non-canonical"}]}]}'::jsonb,
    50000,
    (select version from public.pages where id = '<NON_CANONICAL_TEST_PAGE_ID>')
  );
  -- Expect: {"status": "word_limit_blocked", ...} — canonical status must
  -- have made no difference versus C5.
rollback;

-- D5. Duplication's word-limit check counts every copied page — canonical
-- and non-canonical alike. <MIXED_TEST_PROJECT_ID> should contain both.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub": "<STARTER_USER_ID>"}';

  -- Ground truth for the source project alone (flat sum, same definition
  -- as account_word_total()) — compare this to what duplication actually
  -- adds/blocks against below.
  select coalesce(sum(p.word_count), 0) as source_project_all_pages_total
  from public.chapters c
  join public.pages p on p.chapter_id = c.id
  where c.project_id = '<MIXED_TEST_PROJECT_ID>';

  select public.account_word_total() as account_total_before;

  select public.duplicate_project_checked('<MIXED_TEST_PROJECT_ID>'::uuid);
  -- Expect either:
  --  - {"status": "ok", ...}, and account_word_total() afterward equals
  --    account_total_before + source_project_all_pages_total exactly
  --    (i.e. the non-canonical page's words were included); or
  --  - {"status": "word_limit_blocked", ...} if account_total_before +
  --    source_project_all_pages_total exceeds the account's limit.
  select public.account_word_total() as account_total_after;
rollback;

-- D6. Concurrent saves to a canonical page and a non-canonical page in the
-- SAME account cannot jointly exceed the allowance. Requires two separate
-- SQL editor tabs/sessions run in the order below — a single session can't
-- produce real concurrency, and this is the one case this script can only
-- describe rather than run for you.
--
-- Setup: a starter_2k test account currently near its 2,000-word limit
-- (e.g. ~1,900 words used), with a canonical test page (<CANON_PAGE_ID>)
-- and a non-canonical test page (<NONCANON_PAGE_ID>) in different
-- chapters, each currently near-empty.
--
-- Tab 1 — start and leave open (do not commit/rollback yet):
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub": "<STARTER_USER_ID>"}';
--   select public.save_page_checked(
--     '<CANON_PAGE_ID>'::uuid, '{"type":"doc","content":[]}'::jsonb, 75,
--     (select version from public.pages where id = '<CANON_PAGE_ID>')
--   );
--
-- Tab 2 — while Tab 1 is still open, run:
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub": "<STARTER_USER_ID>"}';
--   select public.save_page_checked(
--     '<NONCANON_PAGE_ID>'::uuid, '{"type":"doc","content":[]}'::jsonb, 75,
--     (select version from public.pages where id = '<NONCANON_PAGE_ID>')
--   );
--   -- This BLOCKS until Tab 1 commits or rolls back — the shared
--   -- pg_advisory_xact_lock for this account is what's being verified
--   -- here. If Tab 2 returned immediately instead of waiting, the two
--   -- saves would not be serialized and could jointly exceed the limit
--   -- regardless of which pages (canonical or not) they targeted.
--
-- Back in Tab 1: commit;
-- Tab 2 then proceeds and returns either 'ok' or 'word_limit_blocked'.
-- The assertion: run `select public.account_word_total();` afterward (as
-- the same test user) and confirm it never exceeds the account's limit,
-- regardless of which of the two saves landed.
-- Tab 2: rollback; (or commit, then manually revert the two test pages)

-- D7. Scribe accounts remain unrestricted regardless of stored word count
-- or canonical status.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub": "<SCRIBE_USER_ID>"}';

  select public.free_word_limit_for_caller() as limit_for_scribe;
  -- Expect: null

  select public.save_page_checked(
    '<SCRIBE_TEST_PAGE_ID>'::uuid,
    '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"scribe unlimited test"}]}]}'::jsonb,
    100000,
    (select version from public.pages where id = '<SCRIBE_TEST_PAGE_ID>')
  );
  -- Expect: {"status": "ok", ...} — never blocked, regardless of size or
  -- whether the page is canonical.
rollback;
