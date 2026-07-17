-- ── Migration 011: Account-wide free-word-limit enforcement, made atomic ──
--
-- Rune's free-tier word limit moved from a per-project allowance to a single
-- account-wide allowance (2,000 starter / 15,000 legacy words across every
-- project a free user owns, since free users are no longer capped at one
-- project). This migration closes three correctness/security gaps:
--
-- 1. The limit check and the page write (or project duplication) were
--    separate round trips. Two concurrent writes on the same account —
--    different pages, different tabs/devices, or a save racing a
--    duplication — could each read the same "remaining" figure and jointly
--    exceed the limit. lock_account_word_budget() + account_word_total()
--    make check-and-write atomic per account for every content-adding path.
--
-- 2. The account-wide total counts every live page a free user stores —
--    canonical AND non-canonical — not just each chapter's canonical page.
--    This is a deliberate product decision, distinct from how the
--    manuscript's *official* total is displayed elsewhere in the app:
--
--      • Billing/allowance usage (this migration): every stored page counts,
--        full stop. A 500-word canonical page plus a 1,500-word alternate
--        draft in the same chapter uses 2,000 words of the account's
--        allowance — canonical status has no bearing on how much of the
--        free tier a writer has consumed, because both pages are real
--        content Rune is storing for them.
--
--      • Manuscript/project display total (projects.word_count,
--        recalculateProjectWordCount in src/lib/projectWordCount.ts,
--        calculateChapterWordCount/calculateProjectWordCount in
--        src/lib/manuscript.ts — all unchanged by this migration): for each
--        chapter, count only its canonical page if one is set, otherwise
--        every page in it. This is what the project page, profile page,
--        dashboard, and export treat as "the manuscript," and stays exactly
--        as it was — canonical pages remain how a writer marks which draft
--        is the official one for organization/progress/export purposes.
--
--    These are two intentionally different numbers for two different
--    questions ("how much of my free words have I used" vs. "how long is my
--    manuscript"), not a bug to reconcile.
--
-- 3. Every function here is SECURITY INVOKER (Postgres's default — no
--    SECURITY DEFINER anywhere in this file) and reads auth.uid() itself
--    rather than trusting a caller-supplied user/project id for entitlement
--    or ownership decisions, so the existing "projects/chapters/pages: *
--    own" RLS policies do the real enforcement — the same model this repo
--    already uses everywhere else (see migration 009's comments). Each
--    function explicitly rejects a null auth.uid() (an unauthenticated
--    caller) rather than silently computing a meaningless answer, every
--    table/function reference is schema-qualified, and search_path is
--    pinned to '' so name resolution can't be hijacked by an object in a
--    schema earlier in some other search_path. EXECUTE is revoked from
--    PUBLIC and granted only to `authenticated` for every function below —
--    this repo's established convention of RLS-only access control covers
--    table reads/writes, but a function's ability to even be *called* is a
--    separate privilege that isn't implied by RLS, so it's set explicitly
--    here rather than left at Postgres's default (EXECUTE granted to
--    PUBLIC on every newly created function).

-- ── lock_account_word_budget ────────────────────────────────────────────
-- Shared entry point for every function below that adds words to an
-- account. Rejects unauthenticated callers, then acquires a per-account
-- transaction-scoped advisory lock so only one word-limit-affecting write
-- for this account runs its check-then-write critical section at a time —
-- released automatically when the calling function's transaction ends.
--
-- The lock key is derived from the first 64 bits of md5(auth.uid()::text)
-- rather than hashtext(...)::bigint (a 32-bit hash): a 32-bit key space
-- makes an accidental collision between two unrelated users' lock keys a
-- real possibility at scale (birthday-bound ~77k concurrently-active
-- distinct users), which would needlessly serialize their unrelated writes
-- against each other. A 64-bit hash makes that collision astronomically
-- unlikely while still requiring no new table/column.
--
-- Every caller of this function must use this exact expression — the whole
-- point is that they all lock on the *same* key for the *same* account, so
-- e.g. an editor save and a concurrent project duplication actually
-- serialize against each other instead of each locking a key of their own.
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
-- Live (never cached/stale) count of every stored word across every
-- project auth.uid() owns — every page, canonical or not. This is the
-- account-wide *usage* figure the free-tier allowance is measured against;
-- see the migration header above for why it deliberately does not use
-- canonical-page logic the way the manuscript display total does.
--
-- Accepts an optional single-page substitution so callers can ask "what
-- would my total be if this page had N words instead" (existing page: pass
-- its id) or "...if a new page with N words existed" (new page: leave
-- p_candidate_page_id null, pass just the word count). Called with no
-- arguments, it's just "my current total" — safe to call directly from the
-- client for display/UX purposes, subject to the same auth.uid()-scoped
-- RLS as every other read in this app.
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

-- A prior draft of this migration (never applied to any database) shipped
-- account_word_total with a 3-argument, canonical-aware signature. Drop it
-- defensively in case that draft was ever run against a dev/staging
-- sandbox — CREATE OR REPLACE above only replaces a function with the
-- exact same argument list, so a stale 3-arg overload would otherwise be
-- left behind alongside the corrected 2-arg version.
drop function if exists public.account_word_total(uuid, uuid, int);

revoke execute on function public.account_word_total(uuid, int) from public;
grant execute on function public.account_word_total(uuid, int) to authenticated;

-- ── free_word_limit_for_caller ──────────────────────────────────────────
-- Resolves auth.uid()'s free-tier word limit, or null if unrestricted
-- (Scribe). Mirrors resolveFreeWordLimit/WORD_LIMITS in src/lib/pricing.ts —
-- Postgres functions can't import a TS module, so these two numbers and the
-- two cohort names are kept in sync by hand between the two files.
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
-- Atomically checks the account-wide free-word limit and saves an existing
-- page's content — replaces the separate check-then-update calls that used
-- to live in updatePage/syncPageWithLimitCheck (src/lib/actions/pages.ts).
-- lock_account_word_budget() serializes every word-limit-affecting write
-- for one account, so only one such check+write runs at a time no matter
-- which page, tab, or device it comes from, or whether it's a page save or
-- a project duplication — the lock is transaction-scoped and releases
-- automatically when this function returns.
--
-- Ownership is enforced by RLS (SECURITY INVOKER, no elevated privilege):
-- the initial select is scoped by "pages: select own" to rows this caller
-- owns, so a page belonging to someone else is indistinguishable from a
-- missing one below — this function never accepts or trusts a client-
-- supplied user id for that decision.
--
-- p_expected_version: pass the caller's last-known version for optimistic
-- concurrency (returns 'version_mismatch' if the row moved under it); pass
-- null to skip the version check entirely — the "local content always wins"
-- conflict-resolution path (forceWriteLocalContent in syncEngine.ts), which
-- previously had no word-limit protection at all.
--
-- Priority when both a word-limit violation and a version mismatch would
-- apply: the word-limit check runs first (matching the pre-atomic
-- behavior), since "you're out of free words" is the more fundamental,
-- user-actionable problem — a stale version can simply be retried once the
-- allowance itself is resolved.
--
-- Whether this page is canonical has no effect on any of the above — the
-- account-wide total this function enforces against counts every page,
-- canonical or not (see account_word_total above).
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
  -- A page that's already over the allowance (legacy data, a prior
  -- inconsistency) is never trapped: shrinking or net-neutral edits always
  -- pass, only further growth is blocked.
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
-- Same atomic protection as save_page_checked, for creating a brand-new
-- page (Arena "Save to Project" new sprint page, onboarding's first page).
-- New pages are always inserted non-canonical, matching every existing
-- insert path in the app — though as with save_page_checked, canonical
-- status has no bearing on the word-limit check either way: a new
-- non-canonical page's words count toward the allowance exactly the same
-- as a canonical one's would. Ownership of the target chapter is enforced
-- by RLS's "pages: insert own" WITH CHECK policy on the insert itself.
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
-- Atomically checks the account-wide free-word limit and duplicates a
-- project — chapters, pages (content, word_count, is_canonical, position),
-- and the same descriptive fields the prior client-side implementation
-- copied (title, description, cover_color). Everything below runs inside
-- this single function call, so it is one Postgres transaction: if any
-- step fails, the whole duplication rolls back and nothing partial is left
-- behind. Never copies billing, analytics, XP, or writing-activity rows,
-- and never awards XP or Today's Words for the copied content — this
-- function only touches projects/chapters/pages.
--
-- The word-limit check counts every page being duplicated, canonical or
-- not — is_canonical is still copied faithfully onto each duplicated page
-- (it's how the new project's own manuscript organization is preserved),
-- it just has no bearing on how much of the account-wide allowance the
-- duplication consumes.
--
-- Ownership of the source project is checked explicitly (user_id =
-- auth.uid()) rather than relying solely on RLS for this specific read,
-- since a "not found" result here is the function's primary defense against
-- duplicating someone else's manuscript — RLS still independently enforces
-- the same boundary underneath.
--
-- Shares lock_account_word_budget() with save_page_checked/
-- insert_page_checked, so a save and a duplication for the same account
-- can never both read the same "remaining" figure and jointly exceed the
-- allowance — whichever acquires the advisory lock first computes the
-- authoritative total, commits or rejects, and only then does the other
-- proceed with a now-current total.
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

  -- Every page in the source project, canonical or not — the same
  -- all-pages definition account_word_total() uses, see the migration
  -- header above for why. Computed directly here since the source project
  -- already exists and needs no substitution.
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

  -- Unique "— Draft N" title: smallest unused number starting at 2,
  -- preserving the exact gap-filling behavior of the prior JS
  -- implementation (not simply max+1). regexp_match() (singular) is a
  -- plain scalar function returning text[] or null — not a set-returning
  -- function, so it's called directly rather than via a LATERAL join.
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
