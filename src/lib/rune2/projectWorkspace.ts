import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type {
  CollectionEntrySummary,
  WorkspaceCollectionSummary,
  WorkspaceFolderSummary,
  WorkspaceNode,
  WorkspacePageSummary,
} from "@/lib/types";
import { buildWorkspaceTree, type WorkspaceTreeNode } from "./workspaceTree";

// The Rune 2.0 shell's view of one Project's Workspace: its Pages, Folders and
// Collections, the tree that places them (migrations 024–025), and each
// Collection's Entries. Titles and dates only — never a Page's or an Entry's
// content, which its editor loads by id.

export type ProjectWorkspace = {
  pages: WorkspacePageSummary[];
  folders: WorkspaceFolderSummary[];
  collections: WorkspaceCollectionSummary[];
  /** Every Entry of every Collection, in creation order (each Collection's list order). */
  entries: CollectionEntrySummary[];
  tree: WorkspaceTreeNode[];
  /**
   * Whether the tree could be read. When it can't (e.g. before migration 024
   * is applied), every Page is shown flat and nothing can be organised.
   */
  organizable: boolean;
  /** Whether Collections can be read (migration 025). When not, none are shown or offered. */
  collectable: boolean;
};

/** Cached per request so the shell layout and its pages share one read. */
export const loadProjectWorkspace = cache(async (projectId: string): Promise<ProjectWorkspace> => {
  const supabase = await createClient();
  const [pagesRead, foldersRead, nodesRead, collectionsRead, entriesRead] = await Promise.all([
    supabase
      .from("workspace_documents")
      .select("id, title, created_at, updated_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    supabase.from("workspace_folders").select("id, title").eq("project_id", projectId),
    // Every column: collection_id exists only from 025, and a read naming it
    // would fail before then.
    supabase.from("workspace_nodes").select("*").eq("project_id", projectId),
    supabase.from("workspace_collections").select("id, title").eq("project_id", projectId),
    supabase
      .from("workspace_collection_entries")
      .select("id, collection_id, title, created_at, updated_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
  ]);
  const empty = { folders: [], collections: [], entries: [], organizable: false, collectable: false };
  // The Workspace must never keep the writer from the Manuscript: if it can't
  // be read (e.g. before migration 023 is applied), the shell opens without it.
  if (pagesRead.error) {
    console.error(`[rune2] Could not load the workspace: ${pagesRead.error.message}`);
    return { pages: [], tree: [], ...empty };
  }
  const pages = (pagesRead.data ?? []) as WorkspacePageSummary[];
  if (foldersRead.error || nodesRead.error) {
    console.error(`[rune2] Could not load the workspace tree: ${(foldersRead.error ?? nodesRead.error)!.message}`);
    return { pages, tree: buildWorkspaceTree([], pages, []), ...empty };
  }
  const folders = (foldersRead.data ?? []) as WorkspaceFolderSummary[];
  const nodes = (nodesRead.data ?? []) as WorkspaceNode[];
  // Collections are optional to the rest: without them (before 025), Pages
  // and Folders work as before.
  const collectionsError = collectionsRead.error ?? entriesRead.error;
  if (collectionsError) console.error(`[rune2] Could not load collections: ${collectionsError.message}`);
  const collections = collectionsError ? [] : ((collectionsRead.data ?? []) as WorkspaceCollectionSummary[]);
  const entries = collectionsError ? [] : ((entriesRead.data ?? []) as CollectionEntrySummary[]);
  return {
    pages,
    folders,
    collections,
    entries,
    tree: buildWorkspaceTree(nodes, pages, folders, collections),
    organizable: true,
    collectable: !collectionsError,
  };
});
