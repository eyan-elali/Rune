"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Project, Chapter, PlacedScene } from "@/lib/types";
import { calculateChapterWordCount, calculateProjectWordCount } from "@/lib/manuscript";
import { getChaptersWithScenes, getManuscriptIdForProject } from "@/lib/manuscriptQueries";

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function getProjects(): Promise<ActionResult<Project[]>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", user.id)
    .order("is_pinned", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data: data ?? [], error: null };
}

export async function createProject(
  title: string,
  description?: string,
  coverColor?: string
): Promise<ActionResult<Project>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      title: title.trim(),
      description: description?.trim() || null,
      cover_color: coverColor ?? null,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/projects");
  return { data, error: null };
}

export async function updateProject(
  id: string,
  fields: Partial<Pick<Project, "title" | "description" | "cover_color" | "chapter_goal">>
): Promise<ActionResult<Project>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("projects")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  return { data, error: null };
}

type DuplicateProjectCheckedResult =
  | { status: "ok"; project: Project }
  | { status: "word_limit_blocked"; limit: number }
  | { status: "error"; error: string };

/**
 * Duplicates a project — its Manuscript's Chapters and every Scene, placed
 * and Unplaced — subject to the account-wide free-word limit. Delegates the
 * entire operation to duplicate_project_checked(): ownership verification,
 * the word-limit check (counting every copied Scene), and every row copy
 * happen inside that single atomic database call, sharing the same
 * per-account advisory lock as Scene saves/inserts. This closes the earlier
 * check-then-write race, where a concurrent editor save (or another
 * duplication) could read the same "remaining" figure and jointly exceed
 * the account-wide limit — and guarantees no partial duplicate is ever left
 * behind if something fails partway through.
 */
export async function duplicateProject(
  projectId: string
): Promise<ActionResult<Project>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase.rpc("duplicate_project_checked", {
    p_project_id: projectId,
  });

  if (error) return { data: null, error: error.message };

  const result = data as DuplicateProjectCheckedResult;

  if (result.status === "word_limit_blocked") {
    return {
      data: null,
      error: `Duplicating this project would put you over your ${result.limit.toLocaleString()}-word free limit. Upgrade to Scribe to keep writing.`,
    };
  }
  if (result.status === "error") return { data: null, error: result.error };

  revalidatePath("/projects");
  // No XP awarded for duplication — only manual typing earns progression.
  return { data: result.project, error: null };
}

export async function toggleProjectPin(
  id: string,
  isPinned: boolean
): Promise<{ error: string | null }> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("projects")
    .update({ is_pinned: isPinned })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/projects");
  return { error: null };
}

export async function deleteProject(id: string): Promise<{ error: string | null }> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/projects");
  return { error: null };
}

export async function getProjectStats(
  projectId: string
): Promise<{ chapterCount: number; totalWords: number }> {
  const { supabase } = await getUser();

  const { data: chapters } = await getChaptersWithScenes(supabase, projectId);
  return { chapterCount: chapters.length, totalWords: calculateProjectWordCount(chapters) };
}

export async function createProjectWithDraft(
  title: string,
  coverColor?: string
): Promise<ActionResult<{ projectId: string; chapterId: string; scene: PlacedScene; chapter: Chapter; project: Project }>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      title: title.trim(),
      cover_color: coverColor ?? null,
    })
    .select()
    .single();

  if (projectError || !project) {
    return { data: null, error: projectError?.message ?? "Failed to create project" };
  }

  // Created with the Project by the database (trg_project_manuscript).
  const manuscriptId = await getManuscriptIdForProject(supabase, project.id);
  if (!manuscriptId) {
    return { data: null, error: "Failed to create manuscript" };
  }

  const { data: chapter, error: chapterError } = await supabase
    .from("chapters")
    .insert({ manuscript_id: manuscriptId, title: "Chapter 1", position: 1 })
    .select()
    .single();

  if (chapterError || !chapter) {
    return { data: null, error: chapterError?.message ?? "Failed to create chapter" };
  }

  const { data: scene, error: sceneError } = await supabase
    .from("scenes")
    .insert({
      manuscript_id: manuscriptId,
      chapter_id: chapter.id,
      title: "Page 1",
      content: null,
      word_count: 0,
      position: 0,
    })
    .select()
    .single();

  if (sceneError || !scene) {
    return { data: null, error: sceneError?.message ?? "Failed to create scene" };
  }

  revalidatePath("/projects");
  revalidatePath("/dashboard");

  return { data: { projectId: project.id, chapterId: chapter.id, scene, chapter, project }, error: null };
}

export async function getProjectChaptersForDrawer(
  projectId: string
): Promise<{ id: string; title: string; wordCount: number }[]> {
  const { supabase, user } = await getUser();
  if (!user) return [];

  const { data, error } = await getChaptersWithScenes(supabase, projectId);
  if (error) return [];

  return data.map((c) => ({
    id: c.id,
    title: c.title,
    wordCount: calculateChapterWordCount(c),
  }));
}
