import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Dashboard — Rune",
  description: "Your writing dashboard. Projects, recent work, and game stats.",
};
import { getPersonalBests, getCombatRecords } from "@/lib/actions/games";
import { DashboardContent } from "./DashboardContent";
import type { Project } from "@/lib/types";

type RecentPageCard = {
  pageId: string;
  chapterId: string;
  chapterTitle: string;
  projectId: string;
  projectTitle: string;
  wordCount: number;
};

type RecentWork = {
  chapterId: string;
  chapterTitle: string;
  projectId: string;
  projectTitle: string;
  coverColor: string | null;
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: rawProjects }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, xp, level")
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
          `id, word_count, chapters ( id, title, projects ( id, title ) )`
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

  const [personalBests, combatRecords] = await Promise.all([
    getPersonalBests(user!.id),
    getCombatRecords(user!.id),
  ]);
  const serializedBests: Record<string, number> = {};
  for (const [k, v] of Object.entries(personalBests)) {
    serializedBests[k] = v;
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
    />
  );
}
