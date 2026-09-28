"use server";

import { createClient } from "@/lib/supabase/server";
import type { TrashItem, TrashObjectType } from "@/lib/types";

// The Project's Trash (migrations 030–031): recoverable deletion of Workspace
// Pages, Folders, Collections and Entries, and of manuscript Scenes. Every
// change is one database function, with ownership checked there:
//   * trash   — the object leaves the Workspace or the manuscript (a Page,
//               Folder or Collection leaves the tree; a Folder's items move up
//               into its place; a Scene leaves its Chapter or Unplaced Scenes)
//               but keeps its id, content, version, values, Views and references;
//   * restore — the same object comes back where it was, or at the top of the
//               Workspace if that Folder is gone (a Scene: into its Chapter,
//               or to Unplaced Scenes if that Chapter is gone);
//   * delete  — only from Trash, and irreversible.
// A Scene's version, words and writing history are never changed by Trash;
// only its placement is (a trashed Scene leaves the ordered total).

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };
type RpcResult<T> = ({ status: "ok" } & T) | { status: "error"; error: string };

const TYPES: readonly TrashObjectType[] = ["page", "folder", "collection", "entry", "scene"];

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

async function call<T>(fn: string, args: Record<string, unknown>): Promise<ActionResult<T>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { data: null, error: error.message };
  const result = data as RpcResult<T>;
  if (result.status !== "ok") return { data: null, error: result.error };
  return { data: result, error: null };
}

/** Moves an object to Trash. `moved`: how many items a Folder's trashing moved up into its place. */
export async function trashWorkspaceObject(type: TrashObjectType, id: string): Promise<ActionResult<{ moved: number }>> {
  if (!TYPES.includes(type)) return { data: null, error: "Unknown item type" };
  const r = await call<{ moved: number }>("trash_workspace_object", { p_type: type, p_id: id });
  return r.error !== null ? r : { data: { moved: r.data.moved }, error: null };
}

/**
 * Restores an object from Trash. `location`: "original" (where it was),
 * "top" (its Folder is gone, so the top of the Workspace) or "unplaced" (a
 * Scene whose Chapter is gone). An Entry whose Collection is in Trash is
 * refused: "Restore its collection first".
 */
export async function restoreWorkspaceObject(
  type: TrashObjectType,
  id: string
): Promise<ActionResult<{ location: "original" | "top" | "unplaced" }>> {
  if (!TYPES.includes(type)) return { data: null, error: "Unknown item type" };
  const r = await call<{ location: "original" | "top" | "unplaced" }>("restore_workspace_object", { p_type: type, p_id: id });
  return r.error !== null ? r : { data: { location: r.data.location }, error: null };
}

/** Permanently deletes an object that is in Trash. Irreversible. */
export async function deleteTrashedWorkspaceObject(
  type: TrashObjectType,
  id: string
): Promise<ActionResult<{ entries: number; properties: number }>> {
  if (!TYPES.includes(type)) return { data: null, error: "Unknown item type" };
  const r = await call<{ entries: number; properties: number }>("delete_trashed_workspace_object", { p_type: type, p_id: id });
  return r.error !== null ? r : { data: { entries: r.data.entries, properties: r.data.properties }, error: null };
}

/** The Project's Trash, newest first. Titles and counts only. */
export async function listWorkspaceTrash(projectId: string): Promise<ActionResult<TrashItem[]>> {
  const r = await call<{ items: TrashItem[] }>("list_workspace_trash", { p_project_id: projectId });
  return r.error !== null ? r : { data: r.data.items, error: null };
}
