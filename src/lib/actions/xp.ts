"use server";

import { createClient } from "@/lib/supabase/server";
import { levelFromXp, applyMultiplier, type XpContext } from "@/lib/xp";
import { checkAndGrantUnlockables } from "@/lib/actions/unlockables";
import type { Profile } from "@/lib/types";

export type AwardXpData = Profile & {
  leveledUp: boolean;
  newLevel: number;
  newUnlockables: string[];
};

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };

export async function awardXp(
  userId: string,
  amount: number,
  reason: string,
  context: XpContext = { mode: "project" },
  sourceSessionId?: string
): Promise<ActionResult<AwardXpData>> {
  const supabase = await createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("profiles")
    .select("xp, level")
    .eq("id", userId)
    .single();

  if (fetchError || !existing) {
    return { data: null, error: fetchError?.message ?? "Profile not found" };
  }

  const finalAmount = applyMultiplier(amount, context);
  const prevLevel = existing.level ?? 1;
  const newXp = (existing.xp ?? 0) + finalAmount;
  const newLevel = levelFromXp(newXp);
  const leveledUp = newLevel > prevLevel;

  const { data: updated, error: updateError } = await supabase
    .from("profiles")
    .update({ xp: newXp, level: newLevel })
    .eq("id", userId)
    .select()
    .single();

  if (updateError) {
    return { data: null, error: updateError.message };
  }

  await supabase.from("xp_events").insert({
    user_id: userId,
    amount: finalAmount,
    reason,
    source_session_id: sourceSessionId ?? null,
  });

  const newUnlockables = await checkAndGrantUnlockables(userId);

  return {
    data: {
      ...(updated as Profile),
      leveledUp,
      newLevel,
      newUnlockables,
    },
    error: null,
  };
}

// Editor heartbeat variant — resolves the user from the active session so the
// client never has to pass a userId. Allows multiple xp_events under the same
// sourceSessionId (one UUID per editor session, many incremental inserts).
export async function awardProjectXp(
  amount: number,
  context: XpContext = { mode: "project" },
  sourceSessionId: string
): Promise<ActionResult<AwardXpData>> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data: existing, error: fetchError } = await supabase
    .from("profiles")
    .select("xp, level")
    .eq("id", user.id)
    .single();

  if (fetchError || !existing) {
    return { data: null, error: fetchError?.message ?? "Profile not found" };
  }

  const finalAmount = applyMultiplier(amount, context);
  const prevLevel = existing.level ?? 1;
  const newXp = (existing.xp ?? 0) + finalAmount;
  const newLevel = levelFromXp(newXp);
  const leveledUp = newLevel > prevLevel;

  const { data: updated, error: updateError } = await supabase
    .from("profiles")
    .update({ xp: newXp, level: newLevel })
    .eq("id", user.id)
    .select()
    .single();

  if (updateError) {
    return { data: null, error: updateError.message };
  }

  await supabase.from("xp_events").insert({
    user_id: user.id,
    amount: finalAmount,
    reason: "project_writing",
    source_session_id: sourceSessionId,
  });

  const newUnlockables = await checkAndGrantUnlockables(user.id);

  return {
    data: {
      ...(updated as Profile),
      leveledUp,
      newLevel,
      newUnlockables,
    },
    error: null,
  };
}
