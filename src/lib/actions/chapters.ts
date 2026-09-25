"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recalculateProjectWordCount } from "@/lib/projectWordCount";
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

export async function createChapter(
  projectId: string,
  title: string,
  position: number
): Promise<ActionResult<Chapter>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const manuscriptId = await getManuscriptIdForProject(supabase, projectId);
  if (!manuscriptId) return { data: null, error: "Project not found" };

  const { data, error } = await supabase
    .from("chapters")
    .insert({ manuscript_id: manuscriptId, title: title.trim(), position })
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  // Every new Chapter starts with one empty placed Scene.
  const { error: sceneError } = await supabase.from("scenes").insert({
    manuscript_id: manuscriptId,
    chapter_id: data.id,
    title: "Scene 1",
    content: null,
    word_count: 0,
    position: 0,
  });

  if (sceneError) return { data: null, error: sceneError.message };

  revalidatePath(`/projects/${projectId}`);
  return { data, error: null };
}

export async function updateChapter(
  id: string,
  fields: Partial<Pick<Chapter, "title" | "position">>,
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

export async function deleteChapter(
  id: string,
  projectId: string
): Promise<{ error: string | null }> {
  const { supabase } = await getUser();

  const { error } = await supabase.from("chapters").delete().eq("id", id);

  if (error) return { error: error.message };

  await recalculateProjectWordCount(supabase, projectId);
  return { error: null };
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
