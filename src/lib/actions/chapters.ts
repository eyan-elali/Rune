"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { revalidateProjectTotals } from "@/lib/projectWordCount";
import {
  getChaptersWithScenes,
  getManuscriptIdForProject,
  type ChapterWithScenes,
} from "@/lib/manuscriptQueries";
import type { Chapter } from "@/lib/types";

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function getChapters(
  projectId: string
): Promise<ActionResult<ChapterWithScenes[]>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await getChaptersWithScenes(supabase, projectId);
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

type CreateChapterCheckedResult =
  | { status: "ok"; chapter: Chapter; scene_id: string }
  | { status: "word_limit_blocked"; limit: number }
  | { status: "error"; error: string };

/**
 * Creates a Chapter at the end of the Project's Manuscript (after its last
 * top-level Group or Chapter) with its first, empty Scene ("Scene 1"),
 * through create_chapter_checked (migrations 019, 022):
 * one database transaction under the per-account lock, which picks the
 * Chapter's position itself. Either both exist afterwards or neither does.
 */
export async function createChapter(
  projectId: string,
  title: string
): Promise<ActionResult<Chapter>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const manuscriptId = await getManuscriptIdForProject(supabase, projectId);
  if (!manuscriptId) return { data: null, error: "Project not found" };

  const { data, error } = await supabase.rpc("create_chapter_checked", {
    p_manuscript_id: manuscriptId,
    p_title: title.trim(),
    p_scene_title: "Scene 1",
    p_scene_content: null,
    p_scene_word_count: 0,
  });
  if (error) return { data: null, error: error.message };

  const result = data as CreateChapterCheckedResult;
  // An empty first Scene is never word-limit blocked; handled for completeness.
  if (result.status === "word_limit_blocked") return { data: null, error: "Word limit reached" };
  if (result.status === "error") return { data: null, error: result.error };

  revalidatePath(`/projects/${projectId}`);
  return { data: result.chapter, error: null };
}

/** Renames a Chapter. Its place in the manuscript changes only through moveChapter (actions/structure.ts). */
export async function updateChapter(
  id: string,
  fields: Partial<Pick<Chapter, "title">>,
  projectId: string
): Promise<ActionResult<Chapter>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("chapters")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return { data, error: null };
}

/**
 * Deletes a Chapter WITHOUT deleting its prose (delete_chapter, migration
 * 021): in one transaction its Scenes move, in order, to the end of the
 * Manuscript's Unplaced Scenes — same Scene IDs, prose and writing history —
 * and the empty Chapter is removed. Their words leave the ordered manuscript
 * total. If anything fails, the Chapter and every Scene are unchanged.
 * Returns the IDs of the Scenes now Unplaced.
 */
export async function deleteChapter(
  id: string,
  projectId: string
): Promise<{ error: string | null; unplacedSceneIds?: string[] }> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Not authenticated" };

  const { data, error } = await supabase.rpc("delete_chapter", { p_chapter_id: id });
  if (error) return { error: error.message };

  const result = data as
    | { status: "ok"; unplaced_scene_ids: string[] }
    | { status: "error"; error: string };
  if (result.status !== "ok") return { error: result.error };

  revalidateProjectTotals(projectId);
  revalidatePath(`/projects/${projectId}/unplaced`);
  return { error: null, unplacedSceneIds: result.unplaced_scene_ids };
}

export async function markChapterComplete(
  chapterId: string,
  isCompleted: boolean,
  projectId: string
): Promise<void> {
  const { supabase } = await getUser();
  const { error } = await supabase
    .from("chapters")
    .update({ is_completed: isCompleted, updated_at: new Date().toISOString() })
    .eq("id", chapterId);

  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}`);
}
