"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Project, Chapter, PlacedScene } from "@/lib/types";
import { calculateChapterWordCount, calculateProjectWordCount } from "@/lib/manuscript";
import { getChaptersWithScenes } from "@/lib/manuscriptQueries";
import { createProjectChecked, PROJECT_TITLE_MAX } from "@/lib/projectCreation";
import { deleteTrashedProject as deleteTrashedProjectWithStorage, sweepProjectStoragePurges } from "@/lib/projectLifecycle";
import { supabaseAttachmentStorage } from "@/lib/attachments/storage";

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** The writer's active Projects (never those in Trash), most recently worked in first. */
export async function getProjects(): Promise<ActionResult<Project[]>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", user.id)
    .is("trashed_at", null)
    .order("updated_at", { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data: data ?? [], error: null };
}

/** The writer's Projects in Trash, most recently trashed first. */
export async function getTrashedProjects(): Promise<ActionResult<Project[]>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", user.id)
    .not("trashed_at", "is", null)
    .order("trashed_at", { ascending: false });

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
  if (result.status !== "ok") return { data: null, error: result.error ?? "Couldn’t create the project" };

  revalidatePath("/projects");
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

/** Renames a Project. The title is trimmed and required. */
export async function renameProject(id: string, title: string): Promise<ActionResult<Project>> {
  const trimmed = title.trim();
  if (!trimmed) return { data: null, error: "A project needs a title." };
  if (trimmed.length > PROJECT_TITLE_MAX) return { data: null, error: `A title can be up to ${PROJECT_TITLE_MAX} characters.` };
  return updateProject(id, { title: trimmed });
}

type ProjectLifecycleResult = { status: "ok"; project: Project } | { status: "error"; error: string };

async function lifecycle(fn: "trash_project" | "restore_project", id: string): Promise<ActionResult<Project>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase.rpc(fn, { p_project_id: id });
  if (error) return { data: null, error: error.message };
  const result = data as ProjectLifecycleResult | null;
  if (!result) return { data: null, error: "Nothing changed. Try again." };
  if (result.status !== "ok") return { data: null, error: result.error };

  revalidatePath("/projects");
  revalidatePath("/projects/trash");
  return { data: result.project, error: null };
}

/** Moves a Project to Trash: it leaves the Projects list, keeping everything it holds. */
export async function trashProject(id: string): Promise<ActionResult<Project>> {
  return lifecycle("trash_project", id);
}

/** Brings a Project back from Trash, exactly as it was. */
export async function restoreProject(id: string): Promise<ActionResult<Project>> {
  return lifecycle("restore_project", id);
}

/**
 * Permanently deletes a Project that is in Trash — every row it owns, and
 * its attachments' bytes in storage (lib/projectLifecycle.ts). An active
 * Project is refused.
 */
export async function deleteTrashedProject(id: string): Promise<{ error: string | null }> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Not authenticated" };

  const storage = supabaseAttachmentStorage();
  const result = await deleteTrashedProjectWithStorage(supabase, storage, id);
  if (result.error !== null) return { error: result.error };
  // Anything an earlier deletion could not finish removing.
  await sweepProjectStoragePurges(supabase, storage).catch(() => undefined);

  revalidatePath("/projects");
  revalidatePath("/projects/trash");
  return { error: null };
}

type DuplicateProjectCheckedResult =
  | { status: "ok"; project: Project }
  | { status: "error"; error: string };

/**
 * Duplicates a project — its Manuscript's Groups, active Chapters and every
 * active Scene, placed and Unplaced (never its Trash) — through
 * duplicate_project_checked(): ownership verification and every row copy
 * happen inside that single atomic database call, under the same per-account
 * lock as Scene saves, so no partial duplicate is ever left behind.
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

  if (result.status !== "ok") return { data: null, error: result.error ?? "Couldn’t duplicate the project" };

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
  if (result.status !== "ok") return { data: null, error: result.error ?? "Couldn’t create the project" };

  const { project, chapter, scene_id: sceneId } = result;
  revalidatePath("/projects");
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
