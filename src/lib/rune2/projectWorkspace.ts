import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type {
  CollectionEntrySummary,
  CollectionProperty,
  EntryPropertyValue,
  WorkspaceCollectionSummary,
  WorkspaceFolderSummary,
  WorkspaceNode,
  WorkspacePageSummary,
} from "@/lib/types";
import { buildWorkspaceTree, type WorkspaceTreeNode } from "./workspaceTree";

// The Rune 2.0 shell's view of one Project's Workspace: its Pages, Folders and
// Collections, the tree that places them (migrations 024–025), each
// Collection's Entries, and its property definitions and the Entries' values
// (026). Titles, dates and property values only — never a Page's or an
// Entry's rich-text content, which its editor loads by id.

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
  /** Every Collection's property definitions (any order; see propertiesOf). */
  properties: CollectionProperty[];
  /** Every Entry's stored property values. */
  values: EntryPropertyValue[];
  /**
   * Whether properties can be read (migration 026). When not, Collections
   * work exactly as before and no property is shown or offered.
   */
  propertied: boolean;
};

/** Cached per request so the shell layout and its pages share one read. */
export const loadProjectWorkspace = cache(async (projectId: string): Promise<ProjectWorkspace> => {
  const supabase = await createClient();
  const [pagesRead, foldersRead, nodesRead, collectionsRead, entriesRead, propertiesRead, valuesRead] = await Promise.all([
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
    supabase
      .from("workspace_collection_properties")
      .select("id, collection_id, project_id, name, type, options, position, shown_in_list, created_at, updated_at")
      .eq("project_id", projectId)
      .order("position", { ascending: true }),
    supabase.from("workspace_entry_values").select("entry_id, property_id, value").eq("project_id", projectId),
  ]);
  const noProperties = { properties: [], values: [], propertied: false };
  const empty = { folders: [], collections: [], entries: [], organizable: false, collectable: false, ...noProperties };
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
  // Properties are optional to Collections: without them (before 026), a
  // Collection is a list of Entries, as in Milestone 8.
  const propertiesError = collectionsError ?? propertiesRead.error ?? valuesRead.error;
  if (propertiesError && !collectionsError) console.error(`[rune2] Could not load collection properties: ${propertiesError.message}`);
  const properties = propertiesError
    ? noProperties
    : {
        properties: (propertiesRead.data ?? []) as CollectionProperty[],
        values: (valuesRead.data ?? []) as EntryPropertyValue[],
        propertied: true,
      };
  return {
    pages,
    folders,
    collections,
    entries,
    tree: buildWorkspaceTree(nodes, pages, folders, collections),
    organizable: true,
    collectable: !collectionsError,
    ...properties,
  };
});
