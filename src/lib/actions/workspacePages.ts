"use server";

import { createClient } from "@/lib/supabase/server";
import type { WorkspacePage } from "@/lib/types";
import { normalizeTitle, renameVersioned, saveVersionedContent, type SaveContentResult } from "@/lib/rune2/versionedContent";

// Workspace Pages (migration 023, table workspace_documents): freeform
// supporting documents that belong to one Project. Deliberately apart from the
// Scene actions: a Page is not manuscript prose, so nothing here touches the
// Scene save path, writing credits or XP.
//
// Reads, saves and renames are plain statements under RLS (a writer reaches
// only their own Projects' Pages); creation is one database function, so a
// new Page always arrives with its place in the Workspace tree (024). The database owns `version` (bumped on every content
// change, never on a rename) and the timestamps. Deletion is recoverable:
// a Page goes to Trash (actions/workspaceTrash.ts, migration 030), where RLS
// hides it — so a save into a trashed Page matches nothing and reports
// "trashed" (versionedContent.ts).

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };

/** One content save. `conflict`: the Page changed since `expectedVersion`; nothing was written. */
export type SaveWorkspacePageResult = SaveContentResult;

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/**
 * Creates an empty Page in a Project the writer owns, at the end of
 * `parentNodeId` (a Folder's Workspace node; null = the Workspace's top level).
 * The Page and its place in the tree are created together (migration 024).
 */
export async function createWorkspacePage(
  projectId: string,
  title: string | null = null,
  parentNodeId: string | null = null
): Promise<ActionResult<WorkspacePage>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase.rpc("create_workspace_document", {
    p_project_id: projectId,
    p_parent_node_id: parentNodeId,
    p_title: normalizeTitle(title),
  });
  if (error) return { data: null, error: error.message };
  const result = data as { status: "ok"; page: WorkspacePage } | { status: "error"; error: string };
  // Another writer's (or a missing) Project, or a Folder not in this Project.
  if (result.status !== "ok") return { data: null, error: result.error };
  return { data: result.page, error: null };
}

export async function getWorkspacePage(pageId: string): Promise<ActionResult<WorkspacePage>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase.from("workspace_documents").select("*").eq("id", pageId).maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: "Page not found" };
  return { data: data as WorkspacePage, error: null };
}

/**
 * Saves a Page's content if it is still at `expectedVersion` — one statement,
 * so two windows saving from the same version cannot both win. On a mismatch
 * nothing is written and the current version is returned.
 */
export async function saveWorkspacePageContent(
  pageId: string,
  content: Record<string, unknown>,
  expectedVersion: number
): Promise<SaveWorkspacePageResult> {
  const { supabase, user } = await getUser();
  if (!user) return { status: "error", error: "Not authenticated" };
  return saveVersionedContent(supabase, "workspace_documents", pageId, content, expectedVersion, "Page is too large");
}

/** Renames a Page; blank makes it untitled. Never changes its version or content. */
export async function renameWorkspacePage(
  pageId: string,
  title: string | null
): Promise<ActionResult<{ title: string | null }>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const r = await renameVersioned(supabase, "workspace_documents", pageId, title);
  if (r.error !== null) return { data: null, error: r.error };
  if (!r.data) return { data: null, error: "Page not found" };
  return { data: r.data, error: null };
}
