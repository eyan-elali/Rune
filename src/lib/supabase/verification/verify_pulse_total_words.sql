-- ═══════════════════════════════════════════════════════════════════════
--  Verification — Pulse "Total Words" correction (all live pages, not
--  just canonical ones)
-- ═══════════════════════════════════════════════════════════════════════
--
-- Run against a DEVELOPMENT/STAGING project only. This file is ground-truth
-- SQL plus the matching UI steps in Pulse itself (searchRecentWriters /
-- getUserDrawerData in src/lib/actions/pulse.ts are plain server actions,
-- not RPCs, so there's nothing to call directly from the SQL editor the
-- way migration 011's functions can be — these checks confirm the data
-- Pulse's queries will read, then ask you to confirm the UI matches it).
--
-- Product rule being verified: any Pulse metric representing total stored
-- words must include every live page a writer owns — canonical and
-- non-canonical — the same definition the free-tier allowance uses (see
-- verify_011_account_word_limit.sql). This is deliberately different from
-- "Words written" (writing_sessions.words_added), which must keep
-- reflecting only genuinely typed, paste-excluded words — untouched by
-- this correction.
--
-- Fill in these placeholders:
--   <TEST_USER_ID>       — a non-internal test account for cases 1-4
--   <INTERNAL_USER_ID>   — an account already present in analytics_excluded_users, for cases 5-6
--   <TEST_CHAPTER_ID>    — a chapter belonging to <TEST_USER_ID>
--   <NONCANON_PAGE_ID>   — a non-canonical page in that chapter, for case 4


-- ═══════════════════════════════════════════════════════════════════════
--  1. 500 canonical + 1,500 non-canonical = 2,000 Total Words
-- ═══════════════════════════════════════════════════════════════════════

-- Ground truth: this is exactly the query getStoredWordTotalsByUser() in
-- src/lib/actions/pulse.ts computes (flattened here into one statement for
-- a single user instead of its batched Map-building form).
select coalesce(sum(p.word_count), 0) as ground_truth_total_words
from public.projects pr
join public.chapters c on c.project_id = pr.id
join public.pages p on p.chapter_id = c.id
where pr.user_id = '<TEST_USER_ID>';

-- Set up (or confirm) a chapter with one canonical 500-word page and one
-- non-canonical 1,500-word page for <TEST_USER_ID>, e.g.:
--   insert into public.pages (chapter_id, title, word_count, position, is_canonical)
--   values
--     ('<TEST_CHAPTER_ID>', 'Canonical', 500, 0, true),
--     ('<TEST_CHAPTER_ID>', 'Draft',     1500, 1, false);
-- Re-run the ground-truth query above — it must include both pages (2,000
-- total for this chapter's contribution), not 500.
--
-- UI check: open Pulse → Recent Writers → find this writer → the "total"
-- figure next to their name, and the "Total words" row in their drawer
-- (click their name), must both match the ground-truth query, not just
-- the canonical page's 500.


-- ═══════════════════════════════════════════════════════════════════════
--  2 & 3. Canonical status changes never move Total Words
-- ═══════════════════════════════════════════════════════════════════════

-- Re-run the ground-truth query from case 1 before and after each of the
-- following, as <TEST_USER_ID> owns the pages (no auth impersonation
-- needed for these reads — postgres sees everything):

-- 2. Switch canonical to the other page in the same chapter:
--   update public.pages set is_canonical = true where id = '<the currently non-canonical page id>';
-- Expect: ground-truth total unchanged.

-- 3. Clear canonical status entirely:
--   update public.pages set is_canonical = false where chapter_id = '<TEST_CHAPTER_ID>' and is_canonical = true;
-- Expect: ground-truth total unchanged.
--
-- UI check after each: reload Pulse's Recent Writers / this writer's
-- drawer — Total Words must read the same both times.


-- ═══════════════════════════════════════════════════════════════════════
--  4. Deleting a non-canonical page reduces Total Words correctly
-- ═══════════════════════════════════════════════════════════════════════

select coalesce(sum(p.word_count), 0) as total_before
from public.projects pr
join public.chapters c on c.project_id = pr.id
join public.pages p on p.chapter_id = c.id
where pr.user_id = '<TEST_USER_ID>';

-- Note <NONCANON_PAGE_ID>'s word_count before deleting:
select word_count from public.pages where id = '<NONCANON_PAGE_ID>';

-- delete from public.pages where id = '<NONCANON_PAGE_ID>';
-- (Undo by re-inserting an equivalent row if this is real test data you
-- want to keep — this delete is not wrapped in a transaction here since
-- Supabase's SQL editor by default runs each statement in its own
-- committed transaction; wrap it in explicit begin/rollback yourself if
-- you want to test this non-destructively.)

select coalesce(sum(p.word_count), 0) as total_after
from public.projects pr
join public.chapters c on c.project_id = pr.id
join public.pages p on p.chapter_id = c.id
where pr.user_id = '<TEST_USER_ID>';
-- Expect: total_before - total_after = the deleted page's word_count exactly.
--
-- UI check: Pulse's Total Words for this writer must drop by the same amount.


-- ═══════════════════════════════════════════════════════════════════════
--  5 & 6. Internal-account exclusion still works, and the toggle restores
--  the full all-pages total (not a partial one)
-- ═══════════════════════════════════════════════════════════════════════

-- Confirm the account is actually excluded:
select * from public.analytics_excluded_users where user_id = '<INTERNAL_USER_ID>';
-- Expect: one row.

-- Ground truth for this account, for comparison against case 6's UI check:
select coalesce(sum(p.word_count), 0) as internal_user_full_all_pages_total
from public.projects pr
join public.chapters c on c.project_id = pr.id
join public.pages p on p.chapter_id = c.id
where pr.user_id = '<INTERNAL_USER_ID>';
--
-- UI check 5: with Pulse's "Include internal accounts" toggle OFF
-- (default), search Recent Writers for this account by name — it must not
-- appear at all, in any range.
--
-- UI check 6: switch the toggle ON (IncludeInternalToggle component) and
-- search again — the account must now appear, and its Total Words must
-- equal internal_user_full_all_pages_total above (the full all-pages sum,
-- not some partial/filtered figure) — confirming inclusion doesn't also
-- accidentally change which pages count, only which users are visible.


-- ═══════════════════════════════════════════════════════════════════════
--  7. Today's Words is unaffected by this correction
-- ═══════════════════════════════════════════════════════════════════════

-- This correction touched getStoredWordTotalsByUser / totalWords only.
-- totalWordsWritten (labeled "Words written" in the drawer, "N written" in
-- Recent Writers) is untouched — still sourced from writing_sessions,
-- which already excludes paste at write time. Confirm no drift:
select coalesce(sum(s.words_added), 0) as ground_truth_words_written
from public.writing_sessions s
where s.user_id = '<TEST_USER_ID>';
--
-- UI check: Pulse's "Words written" figure for this writer must match the
-- query above, and must NOT have changed as a side effect of the Total
-- Words fix — paste/import still must not appear here. If you pasted a
-- large block of text into a page as part of setting up case 1's test
-- data, "Words written" must not have grown from that paste (only "Total
-- Words" should have moved) — this is the same pasted-words-count-toward-
-- storage-but-not-toward-activity rule the editor and account_word_total()
-- already enforce, applied here as a regression check specifically for
-- Pulse's two figures.
