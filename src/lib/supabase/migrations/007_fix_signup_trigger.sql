-- ── Migration 007: Fix new-user signup trigger ────────────────────────────────
--
-- Problem: handle_new_user() only inserts (id, display_name, avatar_url).
-- If any NOT NULL column on profiles lacks a database-level DEFAULT, the
-- trigger INSERT fails and Supabase returns "Database error saving new user".
--
-- This migration:
--   1. Ensures has_written_first_words exists with a safe DEFAULT.
--   2. Ensures subscription_tier has its DEFAULT in place.
--   3. Replaces the trigger function to explicitly set every NOT NULL column,
--      making signup robust regardless of column-default state.
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Guarantee has_written_first_words exists and has a DEFAULT.
-- ADD COLUMN IF NOT EXISTS is a no-op when the column already exists.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS has_written_first_words boolean NOT NULL DEFAULT false;

-- If the column was added previously without a DEFAULT, set it now.
ALTER TABLE public.profiles
  ALTER COLUMN has_written_first_words SET DEFAULT false;

-- Step 2: Guarantee subscription_tier has its DEFAULT (from migration 004).
-- ADD COLUMN IF NOT EXISTS is a no-op when the column already exists.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_tier text NOT NULL DEFAULT 'free';

ALTER TABLE public.profiles
  ALTER COLUMN subscription_tier SET DEFAULT 'free';

-- Step 3: Replace the trigger function to explicitly supply every NOT NULL
-- column value. This makes signup resilient: even if a future column is added
-- without a default, the trigger won't silently rely on one being there.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    display_name,
    avatar_url,
    xp,
    level,
    has_written_first_words,
    subscription_tier
  ) VALUES (
    new.id,
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'avatar_url',
    0,
    1,
    false,
    'free'
  );

  RETURN new;
END;
$$;
