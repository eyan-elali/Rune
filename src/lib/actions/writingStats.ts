"use server";

import { createClient } from "@/lib/supabase/server";
import type { Project } from "@/lib/types";
import { recordAnalyticsEvent } from "@/lib/actions/analytics";
import { computeStreaks } from "@/lib/streaks";
import { calculateProjectWordCount } from "@/lib/manuscript";
import {
  getChaptersWithScenesByProject,
  getManuscriptIdForProject,
} from "@/lib/manuscriptQueries";

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };

/** PostgREST's or Postgres's "no such function": the database predates migration 057. */
function isMissingFunction(error: { code?: string; message?: string }): boolean {
  return error.code === "42883" || error.code === "PGRST202" || /could not find the function|does not exist/i.test(error.message ?? "");
}

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// ── Writing Sessions ──────────────────────────────────────────────────────────

// Fires second_writing_day / third_writing_day once a user has written on
// that many distinct local calendar days — same distinct-session_date
// definition getWritingStreak() already uses, just counting all-time distinct
// days instead of a consecutive run. recordAnalyticsEvent's dedupe index
// makes this safe to re-check on every call; exact equality means it stops
// querying entirely once a user has passed their third writing day. Never
// throws — a failure here must not affect the writing-credit write above it.
// Each event carries that day as its local_date (the launch funnel's D1/D7
// read it when a deleted Project took its writing history with it).
async function checkWritingDayMilestones(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<void> {
  try {
    const { data } = await supabase
      .from("writing_sessions")
      .select("session_date")
      .eq("user_id", userId)
      .gt("words_added", 0);

    const days = Array.from(new Set((data ?? []).map((r) => r.session_date as string))).sort();
    const distinctDays = days.length;

    if (distinctDays === 2) {
      await recordAnalyticsEvent({ userId, eventName: "second_writing_day", localDate: days[1] });
    } else if (distinctDays === 3) {
      await recordAnalyticsEvent({ userId, eventName: "third_writing_day", localDate: days[2] });
    }
  } catch {
    // Analytics must never interrupt writing.
  }
}

// ACTIVATION (lib/launchMetrics.ts): the writer's first credited typed words
// in a Project — recorded once per account, after the credit has landed. The
// editor credits typed words only (never paste, import, restore or a move), so
// this is real writing by construction. The fixed dedupe key makes every
// retry, offline replay, second tab or reconnect a no-op at the database; the
// event carries no Project id (a deleted Project must not take the account's
// activation with it) and no words. Never throws.
async function recordActivation(userId: string, localDate: string): Promise<void> {
  try {
    await recordAnalyticsEvent({ userId, eventName: "first_words_written", localDate });
  } catch {
    // Analytics must never interrupt writing.
  }
}

export async function recordWordsWritten(
  projectId: string | null,
  wordsAdded: number,
  sceneId: string | null = null,
  // sessionDate must be a YYYY-MM-DD local-calendar date supplied by the client.
  // Falls back to UTC date only when called outside a browser context.
  sessionDate?: string,
  // The credit's id, chosen by the device (one per save cycle). With it the
  // credit is atomic and idempotent (migration 057): sent twice — a retried
  // action, a replayed offline queue — it lands once.
  creditId?: string
): Promise<void> {
  if (wordsAdded <= 0) return;

  const { supabase, user } = await getUser();
  if (!user) return;

  const date = sessionDate ?? new Date().toISOString().slice(0, 10);

  // The one write: receipt + insert … on conflict do update, in the database.
  if (creditId) {
    const { error } = await supabase.rpc("credit_writing_words", {
      p_credit_id: creditId,
      p_project_id: projectId,
      p_scene_id: sceneId,
      p_session_date: date,
      p_words: wordsAdded,
    });
    if (!error) {
      if (projectId) await recordActivation(user.id, date);
      await checkWritingDayMilestones(supabase, user.id);
      return;
    }
    // Only a database without 057 falls through to the previous path; any
    // other refusal (a bad argument, not signed in) is final — never
    // credited twice by a second route.
    if (!isMissingFunction(error)) return;
  }

  // Manual upsert — match by scene_id when provided, otherwise by project_id
  const baseQuery = supabase
    .from("writing_sessions")
    .select("id, words_added")
    .eq("user_id", user.id)
    .eq("session_date", date);

  // Project-level and account-level rows have no Scene: never match a Scene's row.
  const { data: existing } = await (
    sceneId !== null
      ? baseQuery.eq("scene_id", sceneId)
      : projectId
      ? baseQuery.eq("project_id", projectId).is("scene_id", null)
      : baseQuery.is("project_id", null).is("scene_id", null)
  ).maybeSingle();

  let credited = false;
  if (existing) {
    const { error: updateError } = await supabase
      .from("writing_sessions")
      .update({ words_added: existing.words_added + wordsAdded })
      .eq("id", existing.id);
    credited = !updateError;
  } else {
    const { error: insertError } = await supabase.from("writing_sessions").insert({
      user_id: user.id,
      project_id: projectId,
      scene_id: sceneId,
      session_date: date,
      words_added: wordsAdded,
    });
    // The Scene was deleted before this credit arrived (e.g. queued offline).
    // The writing still happened: record it as Project-level history, as the
    // database does with a deleted Scene's own history (migration 022).
    if (insertError?.code === "23503" && sceneId !== null) {
      await recordWordsWritten(projectId, wordsAdded, null, date);
      return;
    }
    credited = !insertError;
  }

  if (credited && projectId) await recordActivation(user.id, date);
  await checkWritingDayMilestones(supabase, user.id);
}

export async function getWordsByDay(
  userId: string,
  days: number
): Promise<{ date: string; words: number }[]> {
  const supabase = await createClient();

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (days - 1));
  const sinceStr = since.toISOString().slice(0, 10);

  const { data } = await supabase
    .from("writing_sessions")
    .select("session_date, words_added")
    .eq("user_id", userId)
    .gte("session_date", sinceStr)
    .order("session_date", { ascending: true });

  // Aggregate by date (multiple projects on the same day)
  const byDate = new Map<string, number>();
  for (const row of data ?? []) {
    const prev = byDate.get(row.session_date) ?? 0;
    byDate.set(row.session_date, prev + (row.words_added ?? 0));
  }

  // Build a full array for all N days (zeroes for missing days)
  const result: { date: string; words: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - (days - 1 - i));
    const dateStr = d.toISOString().slice(0, 10);
    result.push({ date: dateStr, words: byDate.get(dateStr) ?? 0 });
  }

  return result;
}

// ── Writing Streak ─────────────────────────────────────────────────────────────

export async function getWritingStreak(
  userId: string,
  localDate?: string
): Promise<{ currentStreak: number; maxStreak: number }> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("writing_sessions")
    .select("session_date")
    .eq("user_id", userId)
    .gt("words_added", 0)
    .order("session_date", { ascending: true });

  if (!data || data.length === 0) return { currentStreak: 0, maxStreak: 0 };

  const uniqueDates = [...new Set(data.map((r) => r.session_date as string))].sort();
  return computeStreaks(uniqueDates, localDate);
}

// ── Contribution History ───────────────────────────────────────────────────────

export async function getContributionHistory(
  userId: string
): Promise<{ date: string; count: number }[]> {
  const supabase = await createClient();

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 179);
  const sinceStr = since.toISOString().slice(0, 10);

  const { data } = await supabase
    .from("writing_sessions")
    .select("session_date, words_added")
    .eq("user_id", userId)
    .gte("session_date", sinceStr)
    .order("session_date", { ascending: true });

  const byDate = new Map<string, number>();
  for (const row of data ?? []) {
    byDate.set(
      row.session_date,
      (byDate.get(row.session_date) ?? 0) + (row.words_added ?? 0)
    );
  }

  return Array.from(byDate.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ── Chapter Progress ───────────────────────────────────────────────────────────

export async function getChapterProgress(
  projectId: string
): Promise<{ completed: number; total: number }> {
  const supabase = await createClient();

  const manuscriptId = await getManuscriptIdForProject(supabase, projectId);
  const { data } = manuscriptId
    ? await supabase
        .from("chapters")
        .select("id, is_completed")
        .eq("manuscript_id", manuscriptId)
    : { data: [] };

  const chapters = (data ?? []) as { id: string; is_completed: boolean }[];
  return {
    total: chapters.length,
    completed: chapters.filter((c) => c.is_completed).length,
  };
}

// ── Writing Goals ─────────────────────────────────────────────────────────────

export interface WritingGoal {
  id: string;
  user_id: string;
  project_id: string | null;
  project_title?: string | null;
  type: "daily_global" | "daily_project" | "project_total";
  target_words: number;
  current_words: number;
  created_at: string;
}

export async function getGoals(userId: string): Promise<WritingGoal[]> {
  const supabase = await createClient();

  const { data: goals } = await supabase
    .from("writing_goals")
    .select("*, projects(title)")
    .eq("user_id", userId)
    .eq("type", "project_total")
    .order("created_at", { ascending: true });

  if (!goals) return [];

  const projectIds = goals
    .filter((g) => g.project_id)
    .map((g) => g.project_id as string);

  const projectWordCounts: Record<string, number> = {};

  if (projectIds.length > 0) {
    const { data: chaptersByProject } = await getChaptersWithScenesByProject(supabase, projectIds);
    for (const projectId of projectIds) {
      projectWordCounts[projectId] = calculateProjectWordCount(chaptersByProject[projectId] ?? []);
    }
  }

  return goals.map((g) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const projectData = g.projects as any;
    const projectTitle = Array.isArray(projectData)
      ? (projectData[0]?.title ?? null)
      : (projectData?.title ?? null);

    return {
      id: g.id,
      user_id: g.user_id,
      project_id: g.project_id ?? null,
      project_title: projectTitle,
      type: g.type as "daily_global" | "daily_project" | "project_total",
      target_words: g.target_words,
      current_words: g.project_id ? (projectWordCounts[g.project_id] ?? 0) : 0,
      created_at: g.created_at,
    };
  });
}

export async function createGoal(
  type: "daily_global" | "daily_project" | "project_total",
  targetWords: number,
  projectId?: string
): Promise<ActionResult<WritingGoal>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  // Enforce: max 1 daily goal total per user (daily_global OR daily_project)
  if (type === "daily_global" || type === "daily_project") {
    const { count } = await supabase
      .from("writing_goals")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .in("type", ["daily_global", "daily_project"]);
    if ((count ?? 0) > 0) {
      return { data: null, error: "You already have a daily writing goal." };
    }
  }

  // Enforce: max 1 project_total goal per project (not per user)
  if (type === "project_total" && projectId) {
    const { count } = await supabase
      .from("writing_goals")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("type", "project_total")
      .eq("project_id", projectId);
    if ((count ?? 0) > 0) {
      return { data: null, error: "This manuscript already has a goal." };
    }
  }

  const { data, error } = await supabase
    .from("writing_goals")
    .insert({
      user_id: user.id,
      type,
      target_words: targetWords,
      project_id: projectId ?? null,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  return {
    data: {
      ...data,
      project_id: data.project_id ?? null,
      project_title: null,
      type: data.type as "daily_global" | "daily_project" | "project_total",
      current_words: 0,
    },
    error: null,
  };
}

export async function deleteGoal(
  id: string
): Promise<{ error: string | null }> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("writing_goals")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  return { error: null };
}

export async function updateGoal(
  id: string,
  targetWords: number
): Promise<{ error: string | null }> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("writing_goals")
    .update({ target_words: targetWords })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  return { error: null };
}

export async function transferGameWordsToProject(
  projectId: string,
  words: number,
  localDate?: string
): Promise<void> {
  const { supabase, user } = await getUser();
  if (!user) throw new Error("Not authenticated");

  const today = localDate ?? new Date().toISOString().slice(0, 10);

  try {
    // 1. Subtract from the anonymous game bucket (project_id IS NULL), clamp to 0
    const { data: gameBucket, error: fetchError } = await supabase
      .from("writing_sessions")
      .select("id, words_added")
      .eq("user_id", user.id)
      .eq("session_date", today)
      .is("project_id", null)
      .maybeSingle();

    if (fetchError) throw new Error(`Failed to fetch game bucket: ${fetchError.message}`);

    if (gameBucket) {
      const reduced = Math.max(0, gameBucket.words_added - words);
      const { error: subtractError } = await supabase
        .from("writing_sessions")
        .update({ words_added: reduced })
        .eq("id", gameBucket.id);

      if (subtractError) throw new Error(`Failed to subtract from game bucket: ${subtractError.message}`);
    }

    // 2. Upsert words into the project bucket
    const { data: projectBucket, error: fetchProjectError } = await supabase
      .from("writing_sessions")
      .select("id, words_added")
      .eq("user_id", user.id)
      .eq("session_date", today)
      .eq("project_id", projectId)
      .maybeSingle();

    if (fetchProjectError) throw new Error(`Failed to fetch project bucket: ${fetchProjectError.message}`);

    if (projectBucket) {
      const { error: addError } = await supabase
        .from("writing_sessions")
        .update({ words_added: projectBucket.words_added + words })
        .eq("id", projectBucket.id);

      if (addError) throw new Error(`Failed to add to project bucket: ${addError.message}`);
    } else {
      const { error: insertError } = await supabase
        .from("writing_sessions")
        .insert({
          user_id: user.id,
          project_id: projectId,
          session_date: today,
          words_added: words,
        });

      if (insertError) throw new Error(`Failed to create project session: ${insertError.message}`);
    }
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error("Failed to transfer game words to project");
  }
}

export async function getTodayWords(userId: string, localDate?: string): Promise<number> {
  const supabase = await createClient();
  const today = localDate ?? new Date().toISOString().slice(0, 10);

  const { data } = await supabase
    .from("writing_sessions")
    .select("words_added")
    .eq("user_id", userId)
    .eq("session_date", today);

  return (data ?? []).reduce((sum, row) => sum + (row.words_added ?? 0), 0);
}

export async function getUserProjects(): Promise<Project[]> {
  const { supabase, user } = await getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("projects")
    .select("id, title, word_count, cover_color, user_id, description, created_at, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  return (data ?? []) as Project[];
}
