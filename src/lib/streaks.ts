// Pure streak math, shared between the writer-facing writing-streak query
// (src/lib/actions/writingStats.ts) and Pulse's batched per-user streak
// calculation (src/lib/actions/pulse.ts). Lives outside any "use server"
// file — Server Action modules require every export to be an async
// function, which a synchronous pure helper like this can never satisfy.
export function computeStreaks(
  dates: string[],
  localDate?: string
): { currentStreak: number; maxStreak: number } {
  if (dates.length === 0) return { currentStreak: 0, maxStreak: 0 };

  // Use the client-supplied local date when available so the "today" anchor
  // reflects the user's calendar day, not the server's UTC day.
  const todayStr = localDate ?? new Date().toISOString().slice(0, 10);
  const todayMs = new Date(todayStr + "T00:00:00Z").getTime();
  const yesterdayStr = new Date(todayMs - 86400000).toISOString().slice(0, 10);

  // Compute max streak over entire history
  let maxStreak = 1;
  let runLen = 1;
  for (let i = 1; i < dates.length; i++) {
    const diffMs =
      new Date(dates[i] + "T00:00:00Z").getTime() -
      new Date(dates[i - 1] + "T00:00:00Z").getTime();
    if (diffMs === 86400000) {
      runLen++;
      if (runLen > maxStreak) maxStreak = runLen;
    } else {
      runLen = 1;
    }
  }

  // Current streak: consecutive run ending on today or yesterday
  const lastDate = dates[dates.length - 1];
  if (lastDate !== todayStr && lastDate !== yesterdayStr) {
    return { currentStreak: 0, maxStreak };
  }

  let currentStreak = 1;
  for (let i = dates.length - 1; i > 0; i--) {
    const diffMs =
      new Date(dates[i] + "T00:00:00Z").getTime() -
      new Date(dates[i - 1] + "T00:00:00Z").getTime();
    if (diffMs === 86400000) {
      currentStreak++;
    } else {
      break;
    }
  }

  return { currentStreak, maxStreak };
}
