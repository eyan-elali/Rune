import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { calculateProjectWordCount, sumSceneWords } from "@/lib/manuscript";
import {
  getChaptersWithScenes,
  getManuscriptGroups,
  getUnplacedSceneSummaries,
  type ChapterWithScenes,
  type UnplacedSceneSummary,
} from "@/lib/manuscriptQueries";
import { buildManuscriptOutline, type OutlineNode } from "@/lib/manuscriptStructure";
import type { ManuscriptGroup } from "@/lib/types";

// The Rune 2.0 shell's view of one Project's Manuscript. A thin composition of
// the Phase 1 reads (lib/manuscriptQueries.ts), ordering (lib/manuscriptStructure.ts)
// and counting rules (lib/manuscript.ts) — no queries or rules of its own.
// Structure and word counts only: never prose.

export type ManuscriptOutlineNode = OutlineNode<ManuscriptGroup, ChapterWithScenes>;

export type ProjectManuscript = {
  project: { id: string; title: string };
  outline: ManuscriptOutlineNode[];
  groupCount: number;
  chapterCount: number;
  placedSceneCount: number;
  unplaced: UnplacedSceneSummary[];
  /** The ordered manuscript total: placed Scenes only. */
  manuscriptWords: number;
  /** Kept apart from the manuscript total, never added to it. */
  unplacedWords: number;
};

/**
 * The Project's Manuscript structure, or null when the Project doesn't exist
 * or isn't visible to the caller. Cached per request so the shell layout and
 * its pages share one read.
 */
export const loadProjectManuscript = cache(
  async (projectId: string): Promise<ProjectManuscript | null> => {
    const supabase = await createClient();

    const [{ data: project }, chapters, groups, unplaced] = await Promise.all([
      supabase.from("projects").select("id, title").eq("id", projectId).maybeSingle(),
      getChaptersWithScenes(supabase, projectId),
      getManuscriptGroups(supabase, projectId),
      getUnplacedSceneSummaries(supabase, projectId),
    ]);

    if (!project) return null;
    const error = chapters.error ?? groups.error ?? unplaced.error;
    if (error) throw new Error(`Could not load the manuscript: ${error.message}`);

    return {
      project: project as { id: string; title: string },
      outline: buildManuscriptOutline(groups.data, chapters.data),
      groupCount: groups.data.length,
      chapterCount: chapters.data.length,
      placedSceneCount: chapters.data.reduce((n, c) => n + c.scenes.length, 0),
      unplaced: unplaced.data,
      manuscriptWords: calculateProjectWordCount(chapters.data),
      unplacedWords: sumSceneWords(unplaced.data),
    };
  }
);

/** The Project the writer most recently worked in — the Dashboard's "current" Project. */
export async function getMostRecentProjectId(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("id")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}
