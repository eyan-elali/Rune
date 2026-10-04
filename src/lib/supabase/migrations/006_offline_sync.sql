-- HISTORICAL — DO NOT RE-RUN. Already applied to production and contained in the
-- production baseline (src/lib/supabase/schema.sql, generated 2026-09-24). Kept for
-- history only; recorded as applied in public.schema_migrations by migration 013.
-- Re-running historical migrations can regress production. See README.md here.

-- Ensure pages table has updated_at with microsecond precision
ALTER TABLE public.pages
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

-- Add version counter for optimistic locking
ALTER TABLE public.pages
  ADD COLUMN IF NOT EXISTS version integer DEFAULT 1 NOT NULL;

-- Trigger to auto-increment version and refresh updated_at on every update
CREATE OR REPLACE FUNCTION public.increment_page_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version = OLD.version + 1;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS page_version_trigger ON public.pages;
CREATE TRIGGER page_version_trigger
  BEFORE UPDATE ON public.pages
  FOR EACH ROW EXECUTE FUNCTION public.increment_page_version();
