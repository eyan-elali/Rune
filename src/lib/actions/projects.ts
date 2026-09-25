"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Project, Chapter, PlacedScene } from "@/lib/types";
import { calculateChapterWordCount, calculateProjectWordCount } from "@/lib/manuscript";
import { getChaptersWithScenes } from "@/lib/manuscriptQueries";
import { createProjectChecked } from "@/lib/projectCreation";

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

/**
 * Creates a Project with its Manuscript, "Chapter 1" and an empty "Scene 1",
 * atomically (create_project_checked, migration 021). requestId is the
 * client's id for this creation attempt: a retry with the same id returns the
 * Project the first attempt created instead of creating another.
 */
export async function createProject(
  title: string,
  description?: string,
  coverColor?: string,
  requestId?: string
): Promise<ActionResult<Project>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const result = await createProjectChecked(supabase, {
    title,
    description: description?.trim() || null,
    coverColor: coverColor ?? null,
    requestId,
  });
  // An empty first Scene is never word-limit blocked; handled for completeness.
  if (result.status === "word_limit_blocked") return { data: null, error: "Word limit reached" };
  if (result.status === "error") return { data: null, error: result.error };

  revalidatePath("/projects");
  revalidatePath("/dashboard");
  return { data: result.project, error: null };
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

/**
 * The dashboard's "start your story" form: createProject, returning the first
 * Chapter and Scene to open in the editor.
 */
export async function createProjectWithDraft(
  title: string,
  coverColor?: string,
  requestId?: string
): Promise<ActionResult<{ projectId: string; chapterId: string; scene: PlacedScene; chapter: Chapter; project: Project }>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const result = await createProjectChecked(supabase, {
    title,
    coverColor: coverColor ?? null,
    requestId,
  });
  if (result.status === "word_limit_blocked") return { data: null, error: "Word limit reached" };
  if (result.status === "error") return { data: null, error: result.error };

  const { project, chapter, scene_id: sceneId } = result;
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  // Only possible on a retry whose Project has since lost its first Chapter or Scene.
  if (!chapter || !sceneId) return { data: null, error: "This story already exists — open it from your projects." };

  const { data: scene, error: sceneError } = await supabase
    .from("scenes")
    .select("*")
    .eq("id", sceneId)
    .single();
  if (sceneError || !scene) {
    return { data: null, error: sceneError?.message ?? "Failed to load the new scene" };
  }

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
