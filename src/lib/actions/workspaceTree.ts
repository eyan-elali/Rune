"use server";

import { createClient } from "@/lib/supabase/server";
import type { WorkspaceFolder } from "@/lib/types";

// The Workspace tree (migration 024): Folders, and where Pages and Folders sit.
// The tree is navigation only — a Page or Folder belongs to its Project
// wherever its node is — so nothing here ever touches a Page's id, title,
// content or version, and nothing touches the manuscript.
//
// Creation, moves and Folder deletion are single database functions under a
// per-Project lock. Renaming a Folder is a plain update under RLS, as renaming
// a Page is. Positions: a node is put at `index` (0-based) among the
// destination's children; null = last. Reordering is a move within the same
// parent. Only a Folder holds other items, and only an empty Folder can be
// deleted: there is no Trash yet, so nothing that holds anything is ever
// destroyed.

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };
type RpcResult<T> = ({ status: "ok" } & T) | { status: "error"; error: string };

const MAX_TITLE = 200;

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Normalises a Folder title: blank = untitled (null); at most 200 characters. */
function folderTitle(title: string | null | undefined): string | null {
  const trimmed = (title ?? "").trim().slice(0, MAX_TITLE).trim();
  return trimmed === "" ? null : trimmed;
}

/** Creates a Folder at the end of `parentNodeId` (a Folder's node; null = top level). */
export async function createWorkspaceFolder(
  projectId: string,
  title: string | null = null,
  parentNodeId: string | null = null
): Promise<ActionResult<{ folder: WorkspaceFolder; nodeId: string }>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase.rpc("create_workspace_folder", {
    p_project_id: projectId,
    p_parent_node_id: parentNodeId,
    p_title: folderTitle(title),
  });
  if (error) return { data: null, error: error.message };
  const result = data as RpcResult<{ folder: WorkspaceFolder; node_id: string }>;
  if (result.status !== "ok") return { data: null, error: result.error };
  return { data: { folder: result.folder, nodeId: result.node_id }, error: null };
}

/** Renames a Folder; blank makes it untitled. Its contents are untouched. */
export async function renameWorkspaceFolder(
  folderId: string,
  title: string | null
): Promise<ActionResult<{ title: string | null }>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("workspace_folders")
    .update({ title: folderTitle(title) })
    .eq("id", folderId)
    .select("title")
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: "Folder not found" };
  return { data: { title: data.title as string | null }, error: null };
}

/**
 * Moves a Page's or Folder's node to `index` among the children of
 * `parentNodeId` (a Folder's node; null = top level). `moved`: whether
 * anything changed.
 */
export async function moveWorkspaceNode(
  nodeId: string,
  parentNodeId: string | null,
  index: number | null = null
): Promise<ActionResult<{ moved: boolean }>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };
  if (index !== null && (!Number.isInteger(index) || index < 0)) return { data: null, error: "Invalid position" };

  const { data, error } = await supabase.rpc("move_workspace_node", {
    p_node_id: nodeId,
    p_parent_node_id: parentNodeId,
    p_index: index,
  });
  if (error) return { data: null, error: error.message };
  const result = data as RpcResult<{ moved: boolean }>;
  if (result.status !== "ok") return { data: null, error: result.error };
  return { data: { moved: result.moved }, error: null };
}

/** Deletes an EMPTY Folder. A Folder holding anything is refused, and nothing changes. */
export async function deleteWorkspaceFolder(folderId: string): Promise<ActionResult<null>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase.rpc("delete_workspace_folder", { p_folder_id: folderId });
  if (error) return { data: null, error: error.message };
  const result = data as RpcResult<object>;
  if (result.status !== "ok") return { data: null, error: result.error };
  return { data: null, error: null };
}
