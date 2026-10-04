-- HISTORICAL — DO NOT RE-RUN. Already applied to production and contained in the
-- production baseline (src/lib/supabase/schema.sql, generated 2026-09-24). Kept for
-- history only; recorded as applied in public.schema_migrations by migration 013.
-- Re-running historical migrations can regress production. See README.md here.
-- Production differs: subscription_events has stripe_event_id (NOT NULL), tier
-- and status, no payload column; profiles.subscription_tier is nullable with a
-- CHECK constraint, and subscription_status defaults to 'inactive'. See schema.sql.

-- ── Stripe billing columns on profiles ──────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id        text,
  ADD COLUMN IF NOT EXISTS subscription_tier         text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS subscription_status       text,
  ADD COLUMN IF NOT EXISTS subscription_price_id     text,
  ADD COLUMN IF NOT EXISTS subscription_period_end   timestamptz;

-- ── subscription_events ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subscription_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type  text        NOT NULL,
  payload     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscription_events: select own"
  ON public.subscription_events FOR SELECT
  USING (auth.uid() = user_id);
