"use server";

import { createClient } from "@/lib/supabase/server";

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };

export async function createGameSession(
  mode: string,
  wordsWritten: number,
  durationSeconds: number,
  xpEarned: number
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("game_sessions")
    .insert({
      user_id: user.id,
      mode,
      words_written: wordsWritten,
      duration_seconds: durationSeconds,
      xp_earned: xpEarned,
      completed: true,
    })
    .select("id")
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as { id: string }, error: null };
}

export async function getPersonalBests(
  userId: string
): Promise<Record<number, number>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("game_sessions")
    .select("duration_seconds, words_written")
    .eq("user_id", userId)
    .eq("mode", "race")
    .eq("completed", true);

  if (error || !data) return {};

  const bests: Record<number, number> = {};
  for (const session of data) {
    const dur = session.duration_seconds;
    if (dur === null) continue;
    if (!bests[dur] || session.words_written > bests[dur]) {
      bests[dur] = session.words_written;
    }
  }
  return bests;
}
