"use server";

import { createClient } from "@/lib/supabase/server";
import { levelFromXp } from "@/lib/xp";
import type { Profile } from "@/lib/types";

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };

export async function awardXp(
  userId: string,
  amount: number,
  reason: string
): Promise<ActionResult<Profile>> {
  const supabase = await createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("profiles")
    .select("xp, level")
    .eq("id", userId)
    .single();

  if (fetchError || !existing) {
    return { data: null, error: fetchError?.message ?? "Profile not found" };
  }

  const newXp = (existing.xp ?? 0) + amount;
  const newLevel = levelFromXp(newXp);

  const { data: updated, error: updateError } = await supabase
    .from("profiles")
    .update({ xp: newXp, level: newLevel })
    .eq("id", userId)
    .select()
    .single();

  if (updateError) {
    return { data: null, error: updateError.message };
  }

  await supabase.from("xp_events").insert({ user_id: userId, amount, reason });

  return { data: updated as Profile, error: null };
}
