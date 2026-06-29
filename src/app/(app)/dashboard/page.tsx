import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getGoals, getWritingStreak, getTodayWords, getWordsByDay } from "@/lib/actions/writingStats";
import { DashboardContent } from "./DashboardContent";
import type { SubscriptionTier } from "@/lib/subscription";
import { calculateChapterWordCount } from "@/lib/manuscript";
import type { Project, ProjectNote, UserPreferences } from "@/lib/types";
import type { RecentPageCard, RecentWork, DrawerChapter } from "@/components/dashboard/types";

export const metadata: Metadata = {
  title: "Dashboard — Rune",
  description: "Your writing dashboard. Projects, recent work, and game stats.",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: rawProjects }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, xp, level, subscription_tier, preferences")
      .eq("id", user!.id)
      .single(),
    supabase
      .from("projects")
      .select("id, title, word_count, cover_color, updated_at")
      .eq("user_id", user!.id)
      .order("updated_at", { ascending: false }),
  ]);

  const displayName =
    profile?.display_name ?? user?.email?.split("@")[0] ?? "Writer";
  const projects = (rawProjects as Project[] | null) ?? [];

  if (projects.length === 0) {
    redirect("/onboarding");
  }

  const totalWords = projects.reduce((sum, p) => sum + (p.word_count ?? 0), 0);

  let recentPageCards: RecentPageCard[] = [];

  if (projects.length > 0) {
    const projectIds = projects.map((p) => p.id);
    const { data: chapters } = await supabase
      .from("chapters")
      .select("id")
      .in("project_id", projectIds);

    const chapterIds = chapters?.map((c) => c.id) ?? [];

    if (chapterIds.length > 0) {
      const { data: recentPages } = await supabase
        .from("pages")
        .select(
          `id, title, word_count, chapters ( id, title, projects ( id, title ) )`
        )
        .in("chapter_id", chapterIds)
        .order("updated_at", { ascending: false })
        .limit(2);

      if (recentPages) {
        for (const row of recentPages) {
          const chapterRaw = row.chapters;
          const chapter = Array.isArray(chapterRaw) ? chapterRaw[0] : chapterRaw;
          if (!chapter) continue;
          const projectRaw = chapter.projects;
          const project = Array.isArray(projectRaw) ? projectRaw[0] : projectRaw;
          if (!project) continue;
          recentPageCards.push({
            pageId: row.id,
            pageTitle: (row as { title?: string }).title ?? "Untitled Page",
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            projectId: project.id,
            projectTitle: project.title,
            wordCount: row.word_count ?? 0,
          });
        }
      }
    }
  }

  let recentWork: RecentWork | null = null;

  if (projects.length > 0) {
    const { data: chapters } = await supabase
      .from("chapters")
      .select("id, title, project_id, updated_at, pages(word_count, is_canonical)")
      .in("project_id", projects.map((p) => p.id))
      .order("updated_at", { ascending: false })
      .limit(1);

    if (chapters && chapters.length > 0) {
      type RawChapterRow = {
        id: string;
        title: string;
        project_id: string;
        updated_at: string;
        pages: { word_count: number; is_canonical: boolean }[];
      };
      const chap = chapters[0] as unknown as RawChapterRow;
      const proj = projects.find((p) => p.id === chap.project_id);
      if (proj) {
        recentWork = {
          chapterId: chap.id,
          chapterTitle: chap.title,
          projectId: chap.project_id,
          projectTitle: proj.title,
          coverColor: proj.cover_color,
          chapterWordCount: calculateChapterWordCount(chap),
        };
      }
    }
  }

  const subscriptionTier = ((profile as { subscription_tier?: string | null } | null)?.subscription_tier ?? 'free') as SubscriptionTier;

  const primaryProjectId = recentWork?.projectId ?? projects[0]?.id ?? null;

  const [goals, writingStreak, todayWords, pinnedNoteResult] = await Promise.all([
    getGoals(user!.id),
    getWritingStreak(user!.id),
    getTodayWords(user!.id),
    primaryProjectId
      ? supabase
          .from("project_notes")
          .select("*")
          .eq("project_id", primaryProjectId)
          .eq("user_id", user!.id)
          .eq("is_pinned", true)
          .eq("is_completed", false)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const pinnedNote = (pinnedNoteResult.data as ProjectNote | null) ?? null;

  const prefs = ((profile as { preferences?: Record<string, unknown> | null } | null)?.preferences ?? {}) as Partial<UserPreferences>;
  const hideArena = prefs.hideArena === true;

  // Fetch progress drawer data (chapter shape + calendar-day writing pace)
  let progressChapters: DrawerChapter[] = [];
  let avgWordsPerDay = 0;

  if (projects.length > 0) {
    const [chapsResult, wordsByDay] = await Promise.all([
      supabase
        .from("chapters")
        .select("id, title, pages(word_count, is_canonical)")
        .eq("project_id", recentWork?.projectId ?? projects[0].id)
        .order("position", { ascending: true }),
      getWordsByDay(user!.id, 30),
    ]);

    if (chapsResult.data) {
      type RawChapterWithPages = {
        id: string;
        title: string;
        pages: { word_count: number; is_canonical: boolean }[];
      };
      const rawChaps = chapsResult.data as unknown as RawChapterWithPages[];
      progressChapters = rawChaps.map((c) => ({
        id: c.id,
        title: c.title,
        wordCount: calculateChapterWordCount(c),
      }));
    }

    // Calendar-day average: total words / 30 days (includes zero-word days)
    const activeDayCount = wordsByDay.filter((d) => d.words > 0).length;
    if (activeDayCount >= 3) {
      const totalWordsInPeriod = wordsByDay.reduce((sum, d) => sum + d.words, 0);
      avgWordsPerDay = Math.round(totalWordsInPeriod / 30);
    }
  }

  return (
    <DashboardContent
      displayName={displayName}
      projects={projects}
      totalWords={totalWords}
      recentWork={recentWork}
      recentPageCards={recentPageCards}
      profile={profile ?? null}
      goals={goals}
      writingStreak={writingStreak}
      subscriptionTier={subscriptionTier}
      todayWords={todayWords}
      progressChapters={progressChapters}
      avgWordsPerDay={avgWordsPerDay}
      pinnedNote={pinnedNote}
      hideArena={hideArena}
    />
  );
}
