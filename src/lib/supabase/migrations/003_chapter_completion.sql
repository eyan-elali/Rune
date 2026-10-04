-- HISTORICAL — DO NOT RE-RUN. Already applied to production and contained in the
-- production baseline (src/lib/supabase/schema.sql, generated 2026-09-24). Kept for
-- history only; recorded as applied in public.schema_migrations by migration 013.
-- Re-running historical migrations can regress production. See README.md here.

-- Migration: add is_completed flag to chapters
-- Run this in the Supabase SQL editor before testing chapter completion UI.

ALTER TABLE chapters ADD COLUMN IF NOT EXISTS is_completed boolean DEFAULT false;
