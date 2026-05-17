-- ═══════════════════════════════════════════════════════════════════
-- Migration 001: Canonical page support
-- Run in Supabase SQL Editor
-- Allows writers to designate one page per chapter as the sole
-- contributor to project word counts, preventing double-counting
-- when they keep scene drafts alongside a final combined page.
-- ═══════════════════════════════════════════════════════════════════

-- 1. Add is_canonical column
alter table public.pages
  add column if not exists is_canonical boolean not null default false;

-- 2. Trigger function: when a page is set canonical, clear all others in the same chapter.
--    Uses AFTER trigger so it can UPDATE sibling rows safely.
--    The WHEN clause (new.is_canonical = true) prevents infinite recursion:
--    the cascade sets siblings to false, which does not satisfy the WHEN guard.
create or replace function public.enforce_single_canonical_page()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.pages
  set is_canonical = false
  where chapter_id = new.chapter_id
    and id <> new.id
    and is_canonical = true;
  return null;
end;
$$;

drop trigger if exists enforce_single_canonical on public.pages;

create trigger enforce_single_canonical
  after update of is_canonical on public.pages
  for each row
  when (new.is_canonical = true)
  execute procedure public.enforce_single_canonical_page();
