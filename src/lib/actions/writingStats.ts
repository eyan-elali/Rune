"use server";

import { createClient } from "@/lib/supabase/server";
import type { Project } from "@/lib/types";

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// ── Writing Sessions ──────────────────────────────────────────────────────────

export async function recordWordsWritten(
  projectId: string | null,
  wordsAdded: number
): Promise<{ error: string | null }> {
  if (wordsAdded <= 0) return { error: null };

  const { supabase, user } = await getUser();
  if (!user) return { error: "Not authenticated" };

  const today = new Date().toISOString().slice(0, 10);

  // Upsert — add to words_added for today's row
  const { error } = await supabase.rpc("increment_writing_session", {
    p_user_id: user.id,
    p_project_id: projectId,
    p_session_date: today,
    p_words: wordsAdded,
  });

  // If the RPC doesn't exist yet (pre-migration), fall back to manual upsert
  if (error) {
    const baseQuery = supabase
      .from("writing_sessions")
      .select("id, words_added")
      .eq("user_id", user.id)
      .eq("session_date", today);

    const { data: existing } = await (projectId
      ? baseQuery.eq("project_id", projectId)
      : baseQuery.is("project_id", null)
    ).maybeSingle();

    if (existing) {
      await supabase
        .from("writing_sessions")
        .update({ words_added: existing.words_added + wordsAdded })
        .eq("id", existing.id);
    } else {
      await supabase.from("writing_sessions").insert({
        user_id: user.id,
        project_id: projectId,
        session_date: today,
        words_added: wordsAdded,
      });
    }
  }

  return { error: null };
}

export async function getWordsToday(userId: string): Promise<number> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data } = await supabase
    .from("writing_sessions")
    .select("words_added")
    .eq("user_id", userId)
    .eq("session_date", today);

  return (data ?? []).reduce((sum, r) => sum + (r.words_added ?? 0), 0);
}

export async function getWordsByDay(
  userId: string,
  days: number
): Promise<{ date: string; words: number }[]> {
  const supabase = await createClient();

  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
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
    d.setDate(d.getDate() - (days - 1 - i));
    const dateStr = d.toISOString().slice(0, 10);
    result.push({ date: dateStr, words: byDate.get(dateStr) ?? 0 });
  }

  return result;
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
  const today = new Date().toISOString().slice(0, 10);

  const { data: goals } = await supabase
    .from("writing_goals")
    .select("*, projects(title)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (!goals) return [];

  // Fetch all today's sessions once — used for daily_global and daily_project
  const { data: todaySessions } = await supabase
    .from("writing_sessions")
    .select("project_id, words_added")
    .eq("user_id", userId)
    .eq("session_date", today);

  // Global total (all sessions today including null-project game sessions)
  const wordsTodayGlobal = (todaySessions ?? []).reduce(
    (sum, r) => sum + (r.words_added ?? 0),
    0
  );

  // Per-project sums for daily_project goals
  const wordsTodayByProject = new Map<string, number>();
  for (const row of todaySessions ?? []) {
    if (row.project_id) {
      wordsTodayByProject.set(
        row.project_id,
        (wordsTodayByProject.get(row.project_id) ?? 0) + (row.words_added ?? 0)
      );
    }
  }

  // Compute canonical word counts for project_total goals
  const projectIds = goals
    .filter((g) => g.type === "project_total" && g.project_id)
    .map((g) => g.project_id as string);

  const projectWordCounts: Record<string, number> = {};

  if (projectIds.length > 0) {
    const { data: chapters } = await supabase
      .from("chapters")
      .select("id, project_id")
      .in("project_id", projectIds);

    if (chapters && chapters.length > 0) {
      const chapterIds = chapters.map((c) => c.id);

      const { data: pages } = await supabase
        .from("pages")
        .select("id, chapter_id, word_count, is_canonical, position")
        .in("chapter_id", chapterIds)
        .order("position", { ascending: true });

      for (const projectId of projectIds) {
        const projectChapterIds = chapters
          .filter((c) => c.project_id === projectId)
          .map((c) => c.id);

        let total = 0;
        for (const chapterId of projectChapterIds) {
          const chapterPages = (pages ?? []).filter(
            (p) => p.chapter_id === chapterId
          );
          const canonicalPage = chapterPages.find((p) => p.is_canonical);
          if (canonicalPage) {
            total += canonicalPage.word_count ?? 0;
          } else {
            total += chapterPages.reduce(
              (sum, p) => sum + (p.word_count ?? 0),
              0
            );
          }
        }
        projectWordCounts[projectId] = total;
      }
    }
  }

  return goals.map((g) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const projectData = g.projects as any;
    const projectTitle = Array.isArray(projectData)
      ? (projectData[0]?.title ?? null)
      : (projectData?.title ?? null);

    let current_words = 0;
    if (g.type === "daily_global") {
      current_words = wordsTodayGlobal;
    } else if (g.type === "daily_project" && g.project_id) {
      current_words = wordsTodayByProject.get(g.project_id) ?? 0;
    } else if (g.type === "project_total" && g.project_id) {
      current_words = projectWordCounts[g.project_id] ?? 0;
    }

    return {
      id: g.id,
      user_id: g.user_id,
      project_id: g.project_id ?? null,
      project_title: projectTitle,
      type: g.type as "daily_global" | "daily_project" | "project_total",
      target_words: g.target_words,
      current_words,
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

  // Enforce: max 1 project_total goal per user
  if (type === "project_total") {
    const { count } = await supabase
      .from("writing_goals")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("type", "project_total");
    if ((count ?? 0) > 0) {
      return { data: null, error: "You already have a manuscript goal." };
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
