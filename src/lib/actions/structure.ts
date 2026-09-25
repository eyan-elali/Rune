"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getManuscriptIdForProject } from "@/lib/manuscriptQueries";
import type { ManuscriptGroup } from "@/lib/types";

// Manuscript structure: Groups, and where Groups and Chapters sit (migration
// 022). Creation, deletion and every move are single database functions under
// the per-account lock; a Group or Chapter keeps its id, and every Scene is
// untouched, whatever moves. Renaming a Group is a plain update under RLS, as
// renaming a Chapter is.
//
// Positions: an item is put at `index` (0-based) among the destination's
// children, Groups and Chapters together; null = last. Reordering is a move
// within the same parent.

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };
type RpcResult<T> = ({ status: "ok" } & T) | { status: "error"; error: string };

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Normalises a Group title: blank = untitled (null). */
function groupTitle(title: string | null | undefined): string | null {
  const trimmed = (title ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

/** Creates a Group after the last child of `parentGroupId` (null = the Manuscript's top level). */
export async function createGroup(
  projectId: string,
  title: string | null,
  parentGroupId: string | null = null
): Promise<ActionResult<ManuscriptGroup>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const manuscriptId = await getManuscriptIdForProject(supabase, projectId);
  if (!manuscriptId) return { data: null, error: "Project not found" };

  const { data, error } = await supabase.rpc("create_manuscript_group", {
    p_manuscript_id: manuscriptId,
    p_parent_group_id: parentGroupId,
    p_title: groupTitle(title),
  });
  if (error) return { data: null, error: error.message };
  const result = data as RpcResult<{ group: ManuscriptGroup }>;
  if (result.status !== "ok") return { data: null, error: result.error };

  revalidatePath(`/projects/${projectId}`);
  return { data: result.group, error: null };
}

/** Renames a Group; a blank title makes it untitled. Its contents are untouched. */
export async function renameGroup(
  groupId: string,
  title: string | null,
  projectId: string
): Promise<ActionResult<ManuscriptGroup>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("manuscript_groups")
    .update({ title: groupTitle(title), updated_at: new Date().toISOString() })
    .eq("id", groupId)
    .select()
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: "Group not found" };

  revalidatePath(`/projects/${projectId}`);
  return { data: data as ManuscriptGroup, error: null };
}

/** Deletes an EMPTY Group. A Group holding a Chapter or a Group is refused, unchanged. */
export async function deleteGroup(
  groupId: string,
  projectId: string
): Promise<{ error: string | null }> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Not authenticated" };

  const { data, error } = await supabase.rpc("delete_manuscript_group", { p_group_id: groupId });
  if (error) return { error: error.message };
  const result = data as RpcResult<object>;
  if (result.status !== "ok") return { error: result.error };

  revalidatePath(`/projects/${projectId}`);
  return { error: null };
}

/**
 * Moves a Group — with everything inside it — to `index` among the children
 * of `parentGroupId` (null = top level). A Group cannot move into itself or
 * one of its own Groups.
 */
export async function moveGroup(
  groupId: string,
  parentGroupId: string | null,
  index: number | null,
  projectId: string
): Promise<{ error: string | null; moved?: boolean }> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Not authenticated" };

  const { data, error } = await supabase.rpc("move_manuscript_group", {
    p_group_id: groupId,
    p_parent_group_id: parentGroupId,
    p_index: index,
  });
  if (error) return { error: error.message };
  const result = data as RpcResult<{ moved: boolean }>;
  if (result.status !== "ok") return { error: result.error };

  revalidatePath(`/projects/${projectId}`);
  return { error: null, moved: result.moved };
}

/** Moves a Chapter — with its Scenes — to `index` among the children of `parentGroupId` (null = top level). */
export async function moveChapter(
  chapterId: string,
  parentGroupId: string | null,
  index: number | null,
  projectId: string
): Promise<{ error: string | null; moved?: boolean }> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Not authenticated" };

  const { data, error } = await supabase.rpc("move_chapter", {
    p_chapter_id: chapterId,
    p_parent_group_id: parentGroupId,
    p_index: index,
  });
  if (error) return { error: error.message };
  const result = data as RpcResult<{ moved: boolean }>;
  if (result.status !== "ok") return { error: result.error };

  revalidatePath(`/projects/${projectId}`);
  return { error: null, moved: result.moved };
}
