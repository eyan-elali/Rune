import { computeStreaks } from "@/lib/streaks";
import { dailyGoalOn, type DailyGoalHistory } from "./preferences";

// Writing activity, pure: the rules the Today's Words, Writing Streak and
// Writing Activity widgets read by (components/rune2/Widgets.tsx), over the
// per-day credit ledger (public.writing_sessions). No React, no storage, no
// XP, no Level, no unlockable, no Arena: a writing day is a writing day.
//
// THE SEMANTICS
// ─────────────
// Today's Words = the words the writer deliberately typed today, in this
// Project. The editor credits them at each save (useSceneEditor): typed
// text counts; pasted, dropped, undone/redone, imported, restored-from-
// history and converted prose never does; moving prose between Scenes or
// Chapters moves no credit; words deleted later do not take back credit
// already earned; a save cycle is credited at most the Scene's net growth
// that cycle. A writing-activity measure, not net manuscript growth.
//
// THE WRITING DAY
// ───────────────
// A credit's day is the LOCAL calendar date of the device at the moment the
// words were credited (the save), written with the credit and never
// re-derived by the server. Words typed after midnight belong to the new
// day; a credit queued offline keeps the date it was written and lands on
// that day whenever it reaches the server; a device whose timezone changes
// keeps every earlier day as it was recorded. Every read here takes
// `today` from the device the same way (lib/utils getLocalDateString), and
// day arithmetic is over date strings alone (UTC noon anchors), so no
// server clock, DST shift or timezone can move a day.
//
// A STREAK is consecutive local calendar days with at least one credited
// word, across every Project (showing up is the thing; which book is not).
// It runs to today, or to yesterday if today has no words yet. No goal is
// needed, and a missed day simply starts the count again.

export type ActivityDay = { date: string; words: number };

/** Adds `n` days to a YYYY-MM-DD date string (UTC noon anchored: DST-proof). */
export function shiftDay(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday, for a YYYY-MM-DD string. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay() + 6) % 7;
}

/** `count` consecutive days ending on `today`, oldest first. */
export function daysEnding(today: string, count: number): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(shiftDay(today, -i));
  return out;
}

/** The ledger's rows summed by day over `dates`, zero where nothing was written. */
export function dailyTotals(rows: readonly { date: string; words: number }[], dates: readonly string[]): ActivityDay[] {
  const byDate = new Map<string, number>();
  for (const r of rows) byDate.set(r.date, (byDate.get(r.date) ?? 0) + Math.max(0, r.words));
  return dates.map((date) => ({ date, words: byDate.get(date) ?? 0 }));
}

export type Streak = { current: number; best: number };

/** The streak from the distinct days written on (any order), anchored on the device's today. */
export function writingStreak(writingDates: readonly string[], today: string): Streak {
  const dates = [...new Set(writingDates)].sort();
  const r = computeStreaks(dates, today);
  return { current: r.currentStreak, best: r.maxStreak };
}

// ── The activity calendar ───────────────────────────────────────────────────
// Weeks are columns, Monday to Sunday down each; the last column is the week
// holding today (its days after today are not shown). ACTIVITY_WEEKS columns.

export const ACTIVITY_WEEKS = 16;

/**
 * A day against the Daily Writing Goal that applied on it: null where none
 * applied (before the writer set one, or while it was off). `hit` is words
 * at or over the target. A day under its goal is still a writing day.
 */
export type DayGoal = { target: number; hit: boolean } | null;

export function dayGoal(words: number, history: DailyGoalHistory, date: string): DayGoal {
  const target = dailyGoalOn(history, date);
  return target === null ? null : { target, hit: words >= target };
}

/** Progress against a daily target: the share for a ring (capped at the whole), a percent, words to go. */
export function dailyGoalProgress(words: number, target: number): { share: number; percent: number; remaining: number; reached: boolean } {
  const share = target > 0 ? Math.max(0, Math.min(1, words / target)) : 0;
  return { share, percent: target > 0 ? Math.floor((words / target) * 100) : 0, remaining: Math.max(0, target - words), reached: target > 0 && words >= target };
}

export type ActivityCell = ActivityDay & { level: ActivityLevel; weekday: number; goal: DayGoal };
export type ActivityWeek = { cells: ActivityCell[]; /** The month that begins in this week, if one does. */ month: string | null };

/** The first day shown: the Monday that starts the window of ACTIVITY_WEEKS weeks ending with today's week. */
export function activityStart(today: string, weeks = ACTIVITY_WEEKS): string {
  const monday = shiftDay(today, -weekdayOf(today));
  return shiftDay(monday, -7 * (weeks - 1));
}

export type ActivityLevel = 0 | 1 | 2 | 3 | 4;

/**
 * The scale a day's words are read against: the writer's own habit, not a
 * fixed number. The 90th percentile of their writing days in the window
 * (so one freak day does not flatten the rest), never below a floor that
 * keeps a sparse beginning readable: 250 words.
 */
export const ACTIVITY_FLOOR = 250;

export function activityScale(days: readonly ActivityDay[]): number {
  const written = days.map((d) => d.words).filter((w) => w > 0).sort((a, b) => a - b);
  if (written.length === 0) return ACTIVITY_FLOOR;
  const p90 = written[Math.min(written.length - 1, Math.floor(written.length * 0.9))];
  return Math.max(ACTIVITY_FLOOR, p90);
}

/** none / low / medium / high / very high, by share of the writer's scale. */
export function activityLevel(words: number, scale: number): ActivityLevel {
  if (words <= 0) return 0;
  const share = words / scale;
  if (share <= 0.25) return 1;
  if (share <= 0.5) return 2;
  if (share <= 0.8) return 3;
  return 4;
}

/** The calendar: the window's days as weeks of cells, each with its level. */
export function activityCalendar(
  days: readonly ActivityDay[],
  today: string,
  weeks = ACTIVITY_WEEKS,
  goals: DailyGoalHistory = []
): ActivityWeek[] {
  const start = activityStart(today, weeks);
  const byDate = new Map(days.map((d) => [d.date, d.words]));
  const scale = activityScale(days.filter((d) => d.date >= start && d.date <= today));
  const out: ActivityWeek[] = [];
  for (let w = 0; w < weeks; w++) {
    const cells: ActivityCell[] = [];
    let month: string | null = null;
    for (let i = 0; i < 7; i++) {
      const date = shiftDay(start, w * 7 + i);
      if (date > today) break;
      if (date.endsWith("-01") || (w === 0 && i === 0)) month = date.slice(0, 7);
      const words = byDate.get(date) ?? 0;
      cells.push({ date, words, level: activityLevel(words, scale), weekday: i, goal: dayGoal(words, goals, date) });
    }
    out.push({ cells, month });
  }
  return out;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 12", for a day's label; "Oct" for a month. */
export function shortDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}
export function shortMonth(yearMonth: string): string {
  return MONTHS[Number(yearMonth.slice(5, 7)) - 1];
}
