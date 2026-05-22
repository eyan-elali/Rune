CREATE TABLE IF NOT EXISTS public.game_tickets (
  id           uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid  REFERENCES public.profiles(id) ON DELETE CASCADE,
  week_start   date  NOT NULL,
  tickets_used integer DEFAULT 0,
  UNIQUE(user_id, week_start)
);

ALTER TABLE public.game_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own tickets" ON public.game_tickets
  FOR ALL USING (auth.uid() = user_id);

-- Atomic upsert for ticket consumption
CREATE OR REPLACE FUNCTION public.increment_game_ticket(
  p_user_id  uuid,
  p_week_start date
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.game_tickets (user_id, week_start, tickets_used)
  VALUES (p_user_id, p_week_start, 1)
  ON CONFLICT (user_id, week_start)
  DO UPDATE SET tickets_used = game_tickets.tickets_used + 1;
END;
$$;
