-- ── Migration 011: Account-wide free-word-limit enforcement, made atomic ──
--
-- Rune's free-tier word limit moved from a per-project allowance to a single
-- account-wide allowance (2,000 starter / 15,000 legacy words across every
-- project a free user owns, since free users are no longer capped at one
-- project). That change surfaced two correctness gaps this migration closes:
--
-- 1. The limit check and the page write were two separate round trips (a
--    server action would SELECT the current total, decide, then UPDATE).
--    Two concurrent saves — different pages, different tabs/devices, same
--    account — could each read the same "remaining" figure and jointly
--    exceed the limit. account_word_total() + pg_advisory_xact_lock below
--    make check-and-write atomic per account.
--
-- 2. The account-wide total was being computed as a raw sum of every page's
--    word_count, which double-counts non-canonical draft pages that the rest
--    of the product (project totals, profile stats, Pulse, export) never
--    treats as part of "the manuscript." account_word_total() is canonical-
--    aware — for each chapter, count only its canonical page if one is set,
--    otherwise sum every page in it — exactly mirroring
--    calculateChapterWordCount/calculateProjectWordCount in
--    src/lib/manuscript.ts, just summed across every project the caller
--    owns instead of one.
--
-- No explicit GRANT/REVOKE statements are added, matching this repo's
-- existing convention (schema.sql, migrations 001-010): access control is
-- RLS-only. Every function below is SECURITY INVOKER (the default — no
-- SECURITY DEFINER anywhere in this file) and reads auth.uid() internally
-- rather than trusting a caller-supplied user id, so the existing
-- "projects/chapters/pages: * own" policies do the real ownership
-- enforcement automatically, the same way every other query in this app
-- already relies on them.

-- ── account_word_total ──────────────────────────────────────────────────
-- Canonical-aware, live (never cached/stale) word count across every
-- project auth.uid() owns. Accepts an optional single-page substitution so
-- callers can ask "what would my total be if this page had N words instead"
-- (existing page: pass its id) or "...if a new page with N words existed in
-- this chapter" (new page: leave p_candidate_page_id null, pass the target
-- chapter). Called with no arguments, it's just "my current total" — safe
-- to call directly from the client for display/UX purposes.
create or replace function public.account_word_total(
  p_candidate_chapter_id uuid default null,
  p_candidate_page_id    uuid default null,
  p_candidate_word_count int  default null
) returns int
language sql
stable
as $$
  with existing_pages as (
    select
      c.id as chapter_id,
      p.id as page_id,
      case
        when p_candidate_page_id is not null and p.id = p_candidate_page_id
        then p_candidate_word_count
        else p.word_count
      end as word_count,
      p.is_canonical
    from public.chapters c
    join public.projects pr on pr.id = c.project_id
    join public.pages p on p.chapter_id = c.id
    where pr.user_id = auth.uid()
  ),
  new_page as (
    -- Synthetic row for a brand-new page not yet inserted anywhere.
    select
      p_candidate_chapter_id as chapter_id,
      null::uuid as page_id,
      p_candidate_word_count as word_count,
      false as is_canonical
    where p_candidate_page_id is null
      and p_candidate_chapter_id is not null
      and p_candidate_word_count is not null
  ),
  all_pages as (
    select * from existing_pages
    union all
    select * from new_page
  ),
  chapter_totals as (
    select
      chapter_id,
      bool_or(is_canonical) as has_canonical,
      max(word_count) filter (where is_canonical) as canonical_words,
      sum(word_count) as all_words
    from all_pages
    group by chapter_id
  )
  select coalesce(sum(
    case when has_canonical then coalesce(canonical_words, 0) else coalesce(all_words, 0) end
  ), 0)::int
  from chapter_totals;
$$;

-- ── free_word_limit_for_caller ──────────────────────────────────────────
-- Resolves auth.uid()'s free-tier word limit, or null if unrestricted
-- (Scribe). Mirrors resolveFreeWordLimit/WORD_LIMITS in src/lib/pricing.ts —
-- Postgres functions can't import a TS module, so these two numbers and the
-- two cohort names are kept in sync by hand between the two files.
create or replace function public.free_word_limit_for_caller()
returns int
language plpgsql
stable
as $$
declare
  v_tier text;
  v_cohort text;
begin
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

-- ── save_page_checked ───────────────────────────────────────────────────
-- Atomically checks the account-wide free-word limit and saves an existing
-- page's content — replaces the separate check-then-update calls that used
-- to live in updatePage/syncPageWithLimitCheck (src/lib/actions/pages.ts).
-- pg_advisory_xact_lock serializes every word-limit-affecting write for one
-- account, so only one such check+write runs at a time no matter which
-- page, tab, or device it comes from — the lock is transaction-scoped and
-- releases automatically when this function returns.
--
-- p_expected_version: pass the caller's last-known version for optimistic
-- concurrency (returns 'version_mismatch' if the row moved under it); pass
-- null to skip the version check entirely — the "local content always wins"
-- conflict-resolution path (forceWriteLocalContent in syncEngine.ts), which
-- previously had no word-limit protection at all.
create or replace function public.save_page_checked(
  p_page_id uuid,
  p_content jsonb,
  p_word_count int,
  p_expected_version int default null
) returns jsonb
language plpgsql
as $$
declare
  v_chapter_id uuid;
  v_old_word_count int;
  v_limit int;
  v_new_total int;
  v_updated public.pages%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text)::bigint);

  select p.chapter_id, p.word_count
    into v_chapter_id, v_old_word_count
    from public.pages p
    where p.id = p_page_id;

  if v_chapter_id is null then
    -- RLS already scopes the select above to pages this caller owns, so a
    -- page belonging to someone else looks identical to a missing one here.
    return jsonb_build_object('status', 'error', 'error', 'Page not found');
  end if;

  -- Only enforce when words are being added — never block edits/deletions.
  if p_word_count > v_old_word_count then
    v_limit := public.free_word_limit_for_caller();
    if v_limit is not null then
      v_new_total := public.account_word_total(v_chapter_id, p_page_id, p_word_count);
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

-- ── insert_page_checked ─────────────────────────────────────────────────
-- Same atomic protection as save_page_checked, for creating a brand-new
-- page (Arena "Save to Project" new sprint page, onboarding's first page).
-- New pages are always inserted non-canonical, matching every existing
-- insert path in the app.
create or replace function public.insert_page_checked(
  p_chapter_id uuid,
  p_title text,
  p_content jsonb,
  p_word_count int,
  p_position int
) returns jsonb
language plpgsql
as $$
declare
  v_limit int;
  v_new_total int;
  v_new public.pages%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text)::bigint);

  if p_word_count > 0 then
    v_limit := public.free_word_limit_for_caller();
    if v_limit is not null then
      v_new_total := public.account_word_total(p_chapter_id, null, p_word_count);
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
