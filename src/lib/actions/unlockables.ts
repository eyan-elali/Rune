"use server";

import { createClient } from "@/lib/supabase/server";
import { UNLOCKABLES } from "@/lib/unlockables";
import { getWritingStreak } from "@/lib/actions/writingStats";
import { recordAnalyticsEvent } from "@/lib/actions/analytics";
import type { AnalyticsEventName } from "@/lib/analyticsEvents";

const WORD_MILESTONES: { threshold: number; eventName: AnalyticsEventName }[] = [
  { threshold: 100, eventName: "reached_100_words" },
  { threshold: 500, eventName: "reached_500_words" },
  { threshold: 2000, eventName: "reached_2000_words" },
  { threshold: 5000, eventName: "reached_5000_words" },
  { threshold: 10000, eventName: "reached_10000_words" },
  { threshold: 15000, eventName: "reached_15000_words" },
];

export type UserUnlockable = {
  unlockable_id: string;
  unlocked_at: string;
};

export async function getUserUnlockables(userId: string): Promise<UserUnlockable[]> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user || user.id !== userId) {
    console.error("getUserUnlockables auth mismatch:", {
      requestedUserId: userId,
      authUserId: user?.id,
      error: userError,
    });
    return [];
  }

  const { data, error } = await supabase
    .from("user_unlockables")
    .select("unlockable_id, unlocked_at")
    .eq("user_id", user.id)
    .order("unlocked_at", { ascending: true });

  if (error) {
    console.error("getUserUnlockables read error:", error);
    return [];
  }

  return (data ?? []) as UserUnlockable[];
}

export async function checkAndGrantUnlockables(userId: string): Promise<string[]> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user || user.id !== userId) {
    console.error("checkAndGrantUnlockables auth mismatch:", {
      requestedUserId: userId,
      authUserId: user?.id,
      error: userError,
    });
    return [];
  }

  // Fetch everything needed in parallel
  const [
    { data: profile },
    { data: projects },
    { data: battleSessions },
    { data: raceSessions },
    { data: alreadyUnlocked },
    { data: writingSessions },
    { maxStreak },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("level, xp, subscription_tier")
      .eq("id", user.id)
      .single(),
    supabase.from("projects").select("word_count").eq("user_id", user.id),
    supabase
      .from("game_sessions")
      .select("meta")
      .eq("user_id", user.id)
      .eq("mode", "battle")
      .eq("completed", true),
    supabase
      .from("game_sessions")
      .select("duration_seconds")
      .eq("user_id", user.id)
      .eq("mode", "race")
      .eq("completed", true),
    supabase
      .from("user_unlockables")
      .select("unlockable_id")
      .eq("user_id", user.id),
    // Real words typed — paste/import deductions already applied at write time
    // (see recordWordsWritten / storeOfflineWritingCredit), unlike projects.word_count
    // which counts pasted content toward the manuscript total.
    supabase.from("writing_sessions").select("words_added").eq("user_id", user.id),
    getWritingStreak(user.id),
  ]);

  const currentLevel = profile?.level ?? 1;
  const xp = (profile as { xp?: number | null } | null)?.xp ?? 0;
  const subscriptionTier = (profile as { subscription_tier?: string | null } | null)?.subscription_tier ?? 'free';

  const totalWords = (projects ?? []).reduce(
    (sum, p) => sum + (p.word_count ?? 0),
    0
  );
  const totalWordsWritten = (writingSessions ?? []).reduce(
    (sum, s) => sum + (s.words_added ?? 0),
    0
  );

  // Fire-once word-count milestones for analytics. Reuses the same real-word
  // total (writing_sessions.words_added) used for the words_written unlockable
  // check above — never projects.word_count, which includes pasted content.
  // recordAnalyticsEvent's dedupe index makes repeat attempts a no-op, so this
  // can safely re-check on every call (including reconciliation after offline
  // sync) without ever emitting a duplicate event. Failures never affect
  // unlockable granting below.
  await Promise.allSettled(
    WORD_MILESTONES.filter((m) => totalWordsWritten >= m.threshold).map((m) =>
      recordAnalyticsEvent({ userId: user.id, eventName: m.eventName })
    )
  );

  const battleWins = (battleSessions ?? []).filter((s) => {
    const meta = s.meta as { outcome?: string } | null;
    return meta?.outcome === "victory";
  }).length;
  const hasThirtyMinRace = (raceSessions ?? []).some(
    (s) => (s.duration_seconds ?? 0) >= 1800
  );

  const unlockedIds = new Set(
    (alreadyUnlocked ?? []).map((u: { unlockable_id: string }) => u.unlockable_id)
  );

  const toGrant: string[] = [];

  for (const unlockable of UNLOCKABLES) {
    if (unlockable.requirement === null) continue;
    if (unlockedIds.has(unlockable.id)) continue;

    // Free users cannot earn scribe-tier cosmetics
    if (unlockable.tier === 'scribe' && subscriptionTier !== 'scribe') continue;

    const { type, value } = unlockable.requirement;
    let qualifies = false;

    if (type === 'level') qualifies = currentLevel >= Number(value);
    else if (type === 'words') qualifies = totalWords >= Number(value);
    else if (type === 'words_written') qualifies = totalWordsWritten >= Number(value);
    else if (type === 'battles_won') qualifies = battleWins >= Number(value);
    else if (type === 'race_30min') qualifies = hasThirtyMinRace;
    else if (type === 'xp') qualifies = xp >= Number(value);
    // Best-ever streak, not the current one — a streak avatar earned once
    // should not require the streak to still be active at check time.
    else if (type === 'streak') qualifies = maxStreak >= Number(value);
    else if (type === 'theme_unlocked') qualifies = unlockedIds.has(value as string);

    if (qualifies) toGrant.push(unlockable.id);
  }

  if (toGrant.length === 0) return [];

  const rows = toGrant.map((unlockable_id) => ({
    user_id: user.id,
    unlockable_id,
  }));
  const { error } = await supabase.from("user_unlockables").insert(rows);

  if (error) {
    console.error("checkAndGrantUnlockables insert error:", {
      rows,
      error,
    });
    return [];
  }

  return toGrant;
}
