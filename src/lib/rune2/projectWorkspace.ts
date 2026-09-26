import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { WorkspaceFolderSummary, WorkspaceNode, WorkspacePageSummary } from "@/lib/types";
import { buildWorkspaceTree, type WorkspaceTreeNode } from "./workspaceTree";

// The Rune 2.0 shell's view of one Project's Workspace: its Pages and Folders,
// and the tree that places them (migration 024). Titles and dates only —
// never a Page's content, which its editor loads by id.

export type ProjectWorkspace = {
  pages: WorkspacePageSummary[];
  folders: WorkspaceFolderSummary[];
  tree: WorkspaceTreeNode[];
  /**
   * Whether the tree could be read. When it can't (e.g. before migration 024
   * is applied), every Page is shown flat and nothing can be organised.
   */
  organizable: boolean;
};

/** Cached per request so the shell layout and its pages share one read. */
export const loadProjectWorkspace = cache(async (projectId: string): Promise<ProjectWorkspace> => {
  const supabase = await createClient();
  const [pagesRead, foldersRead, nodesRead] = await Promise.all([
    supabase
      .from("workspace_documents")
      .select("id, title, created_at, updated_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    supabase.from("workspace_folders").select("id, title").eq("project_id", projectId),
    supabase
      .from("workspace_nodes")
      .select("id, target_type, document_id, folder_id, parent_node_id, position")
      .eq("project_id", projectId),
  ]);
  // The Workspace must never keep the writer from the Manuscript: if it can't
  // be read (e.g. before migration 023 is applied), the shell opens without it.
  if (pagesRead.error) {
    console.error(`[rune2] Could not load the workspace: ${pagesRead.error.message}`);
    return { pages: [], folders: [], tree: [], organizable: false };
  }
  const pages = (pagesRead.data ?? []) as WorkspacePageSummary[];
  if (foldersRead.error || nodesRead.error) {
    console.error(`[rune2] Could not load the workspace tree: ${(foldersRead.error ?? nodesRead.error)!.message}`);
    return { pages, folders: [], tree: buildWorkspaceTree([], pages, []), organizable: false };
  }
  const folders = (foldersRead.data ?? []) as WorkspaceFolderSummary[];
  const nodes = (nodesRead.data ?? []) as WorkspaceNode[];
  return { pages, folders, tree: buildWorkspaceTree(nodes, pages, folders), organizable: true };
});
