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
