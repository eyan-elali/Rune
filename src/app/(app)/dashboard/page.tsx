import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getGoals, getWritingStreak, getTodayWords, getWordsByDay } from "@/lib/actions/writingStats";
import { DashboardContent } from "./DashboardContent";
import type { SubscriptionTier } from "@/lib/subscription";
import { calculateChapterWordCount } from "@/lib/manuscript";
import { getChaptersWithScenes, getProjectIdsByManuscript } from "@/lib/manuscriptQueries";
import type { Project, ProjectNote, UserPreferences } from "@/lib/types";
import type { RecentSceneCard, RecentWork, DrawerChapter } from "@/components/dashboard/types";

export const metadata: Metadata = {
  title: "Dashboard — Rune",
  description: "Your writing dashboard. Projects, recent work, and game stats.",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string }>;
}) {
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
    // Forward `registered=1` so RegistrationTracker (rendered on
    // /onboarding) still fires the CompleteRegistration pixel for a
    // brand-new signup whose pending Scribe intent detoured them through
    // /auth/continue before they had any projects yet.
    const { registered } = await searchParams;
    redirect(registered === "1" ? "/onboarding?registered=1" : "/onboarding");
  }

  const totalWords = projects.reduce((sum, p) => sum + (p.word_count ?? 0), 0);

  let recentSceneCards: RecentSceneCard[] = [];
  let recentWork: RecentWork | null = null;

  if (projects.length > 0) {
    const { data: projectIdByManuscript } = await getProjectIdsByManuscript(
      supabase,
      projects.map((p) => p.id)
    );
    const manuscriptIds = [...projectIdByManuscript.keys()];

    type ChapterRow = { id: string; title: string; manuscript_id: string; updated_at: string };
    const { data: rawChapters } = manuscriptIds.length > 0
      ? await supabase
          .from("chapters")
          .select("id, title, manuscript_id, updated_at")
          .in("manuscript_id", manuscriptIds)
      : { data: [] };
    const chapters = (rawChapters ?? []) as ChapterRow[];
    const chapterById = new Map(chapters.map((c) => [c.id, c]));
    const projectOf = (chapter: ChapterRow) =>
      projects.find((p) => p.id === projectIdByManuscript.get(chapter.manuscript_id));

    // The two most recently edited placed Scenes (Unplaced Scenes have no
    // Chapter to open them in).
    if (chapters.length > 0) {
      const { data: recentScenes } = await supabase
        .from("scenes")
        .select("id, title, word_count, chapter_id")
        .in("chapter_id", chapters.map((c) => c.id))
        .order("updated_at", { ascending: false })
        .limit(2);

      for (const row of recentScenes ?? []) {
        const chapter = chapterById.get(row.chapter_id as string);
        const project = chapter ? projectOf(chapter) : undefined;
        if (!chapter || !project) continue;
        recentSceneCards.push({
          sceneId: row.id,
          sceneTitle: (row as { title?: string }).title ?? "Untitled Scene",
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          projectId: project.id,
          projectTitle: project.title,
          wordCount: row.word_count ?? 0,
        });
      }
    }

    // The most recently updated Chapter.
    const { data: latestChapters } = manuscriptIds.length > 0
      ? await supabase
          .from("chapters")
          .select("id, title, manuscript_id, updated_at")
          .in("manuscript_id", manuscriptIds)
          .order("updated_at", { ascending: false })
          .limit(1)
      : { data: [] };
    const latestChapter = (latestChapters ?? [])[0] as ChapterRow | undefined;
    const latestProject = latestChapter ? projectOf(latestChapter) : undefined;
    if (latestChapter && latestProject) {
      const { data: scenes } = await supabase
        .from("scenes")
        .select("word_count")
        .eq("chapter_id", latestChapter.id);
      recentWork = {
        chapterId: latestChapter.id,
        chapterTitle: latestChapter.title,
        projectId: latestProject.id,
        projectTitle: latestProject.title,
        coverColor: latestProject.cover_color,
        chapterWordCount: calculateChapterWordCount({ scenes: scenes ?? [] }),
      };
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
      getChaptersWithScenes(supabase, recentWork?.projectId ?? projects[0].id),
      getWordsByDay(user!.id, 30),
    ]);

    if (!chapsResult.error) {
      progressChapters = chapsResult.data.map((c) => ({
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
      recentSceneCards={recentSceneCards}
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
