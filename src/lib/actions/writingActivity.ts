"use server";

import { createClient } from "@/lib/supabase/server";
import { ACTIVITY_WEEKS, activityStart } from "@/lib/rune2/writingActivity";

// The writing-activity read for the Widgets board (lib/rune2/writingActivity.ts
// has the rules). One request, three answers, all for the signed-in writer:
//
//   todayProject   words credited today in the given Project
//   days           every (date, words) row in the activity window — across
//                  every Project — for the calendar
//   writingDates   every distinct local day with credited words, all time,
//                  for the streak
//
// `today` is the device's local calendar date (the caller supplies it; the
// server's clock never decides a writing day). Reads writing_sessions only:
// nothing here knows XP, levels, unlockables, Arena or Pulse.

export type WritingActivityRead = {
  todayProject: number;
  days: { date: string; words: number }[];
  writingDates: string[];
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function readWritingActivity(
  projectId: string,
  today: string
): Promise<{ data: WritingActivityRead; error: null } | { data: null; error: string }> {
  if (!DATE_RE.test(today)) return { data: null, error: "A local date is needed." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not signed in." };

  const start = activityStart(today, ACTIVITY_WEEKS);
  const [todayRows, windowRows, allDays] = await Promise.all([
    supabase.from("writing_sessions").select("words_added").eq("user_id", user.id).eq("project_id", projectId).eq("session_date", today),
    supabase
      .from("writing_sessions")
      .select("session_date, words_added")
      .eq("user_id", user.id)
      .gte("session_date", start)
      .lte("session_date", today),
    supabase.from("writing_sessions").select("session_date").eq("user_id", user.id).gt("words_added", 0),
  ]);
  const error = todayRows.error ?? windowRows.error ?? allDays.error;
  if (error) return { data: null, error: error.message };

  return {
    data: {
      todayProject: (todayRows.data ?? []).reduce((n, r) => n + ((r.words_added as number) ?? 0), 0),
      days: (windowRows.data ?? []).map((r) => ({ date: r.session_date as string, words: (r.words_added as number) ?? 0 })),
      writingDates: [...new Set((allDays.data ?? []).map((r) => r.session_date as string))].sort(),
    },
    error: null,
  };
}
