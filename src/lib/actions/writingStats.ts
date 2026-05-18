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
  wordsAdded: number,
  pageId: string | null = null
): Promise<void> {
  if (wordsAdded <= 0) return;

  const { supabase, user } = await getUser();
  if (!user) return;

  const today = new Date().toISOString().slice(0, 10);

  // When a pageId is specified, skip the RPC and go straight to a page-keyed upsert.
  // The RPC doesn't know about page_id, so letting it run would update the wrong row.
  if (pageId === null) {
    const { error } = await supabase.rpc("increment_writing_session", {
      p_user_id: user.id,
      p_project_id: projectId,
      p_session_date: today,
      p_words: wordsAdded,
    });
    if (!error) return;
  }

  // Manual upsert — match by page_id when provided, otherwise by project_id
  const baseQuery = supabase
    .from("writing_sessions")
    .select("id, words_added")
    .eq("user_id", user.id)
    .eq("session_date", today);

  const { data: existing } = await (
    pageId !== null
      ? baseQuery.eq("page_id", pageId)
      : projectId
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
      page_id: pageId,
      session_date: today,
      words_added: wordsAdded,
    });
  }
}

export async function getWordsToday(userId: string): Promise<number> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("writing_sessions")
    .select("words_added, page_id, pages:pages!writing_sessions_page_id_fkey(is_canonical)")
    .eq("user_id", userId)
    .eq("session_date", today);

  if (error) {
    console.error("Failed to fetch today's writing sessions:", error);
  }

  return (data ?? []).reduce((sum, session) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pagesData = session.pages as any;
    const isCanonical = Array.isArray(pagesData) ? pagesData[0]?.is_canonical : pagesData?.is_canonical;
    if (session.page_id !== null && isCanonical === false) return sum;
    return sum + (session.words_added ?? 0);
  }, 0);
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
  const { data: todaySessions, error: todaySessionsError } = await supabase
    .from("writing_sessions")
    .select("project_id, words_added, page_id, pages:pages!writing_sessions_page_id_fkey(is_canonical)")
    .eq("user_id", userId)
    .eq("session_date", today);

  if (todaySessionsError) {
    console.error("Failed to fetch today's writing sessions for goals:", todaySessionsError);
  }

  // Global total — exclude sessions for non-canonical pages
  const wordsTodayGlobal = (todaySessions ?? []).reduce((sum, session) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pagesData = session.pages as any;
    const isCanonical = Array.isArray(pagesData) ? pagesData[0]?.is_canonical : pagesData?.is_canonical;
    if (session.page_id !== null && isCanonical === false) return sum;
    return sum + (session.words_added ?? 0);
  }, 0);

  // Per-project sums for daily_project goals — same canonical filter
  const wordsTodayByProject = new Map<string, number>();
  for (const session of todaySessions ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pagesData = session.pages as any;
    const isCanonical = Array.isArray(pagesData) ? pagesData[0]?.is_canonical : pagesData?.is_canonical;
    if (session.page_id !== null && isCanonical === false) continue;
    if (session.project_id) {
      wordsTodayByProject.set(
        session.project_id,
        (wordsTodayByProject.get(session.project_id) ?? 0) + (session.words_added ?? 0)
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

export async function transferGameWordsToProject(
  projectId: string,
  words: number
): Promise<void> {
  const { supabase, user } = await getUser();
  if (!user) throw new Error("Not authenticated");

  const today = new Date().toISOString().slice(0, 10);

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
