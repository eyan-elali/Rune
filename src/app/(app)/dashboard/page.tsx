import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getPersonalBests, getCombatRecords } from "@/lib/actions/games";
import { getGoals, getWritingStreak, getTodayWords, getWordsByDay } from "@/lib/actions/writingStats";
import { DashboardContent } from "./DashboardContent";
import { canAccessFeature, type SubscriptionTier } from "@/lib/subscription";
import { calculateChapterWordCount } from "@/lib/manuscript";
import type { Project } from "@/lib/types";
import type { WritingGoal } from "@/lib/actions/writingStats";
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
      .select("display_name, xp, level, subscription_tier")
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
      .select("id, title, project_id, updated_at")
      .in("project_id", projects.map((p) => p.id))
      .order("updated_at", { ascending: false })
      .limit(1);

    if (chapters && chapters.length > 0) {
      const chap = chapters[0];
      const proj = projects.find((p) => p.id === chap.project_id);
      if (proj) {
        recentWork = {
          chapterId: chap.id,
          chapterTitle: chap.title,
          projectId: chap.project_id,
          projectTitle: proj.title,
          coverColor: proj.cover_color,
        };
      }
    }
  }

  const subscriptionTier = ((profile as { subscription_tier?: string | null } | null)?.subscription_tier ?? 'free') as SubscriptionTier;
  const canSeeGoals = canAccessFeature(subscriptionTier, 'projectGoals');
  const canSeeStreaks = canAccessFeature(subscriptionTier, 'streaks');

  const [personalBests, combatRecords, goals, writingStreak, todayWords] = await Promise.all([
    getPersonalBests(user!.id),
    getCombatRecords(user!.id),
    canSeeGoals ? getGoals(user!.id) : Promise.resolve([] as WritingGoal[]),
    canSeeStreaks ? getWritingStreak(user!.id) : Promise.resolve({ currentStreak: 0, maxStreak: 0 }),
    getTodayWords(user!.id),
  ]);

  const serializedBests: Record<string, number> = {};
  for (const [k, v] of Object.entries(personalBests)) {
    serializedBests[k] = v;
  }

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
      personalBests={serializedBests}
      combatRecords={combatRecords}
      goals={goals}
      writingStreak={writingStreak}
      subscriptionTier={subscriptionTier}
      todayWords={todayWords}
      progressChapters={progressChapters}
      avgWordsPerDay={avgWordsPerDay}
    />
  );
}
