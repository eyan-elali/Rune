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

  // Prevent double-awarding XP for the same game session
  if (sourceSessionId) {
    const { data: duplicate } = await supabase
      .from("xp_events")
      .select("id")
      .eq("source_session_id", sourceSessionId)
      .maybeSingle();

    if (duplicate) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      return {
        data: {
          ...(profile as Profile),
          leveledUp: false,
          newLevel: (profile as Profile).level,
          newUnlockables: [],
        },
        error: null,
      };
    }
  }

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
