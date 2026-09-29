import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type {
  CollectionEntrySummary,
  CollectionProperty,
  EntryPropertyValue,
  ObjectReferenceRow,
  SceneProperty,
  ScenePropertyValue,
  SceneView,
  WorkspaceCollectionSummary,
  WorkspaceCollectionView,
  WorkspaceFolderSummary,
  WorkspaceNode,
  WorkspacePageSummary,
} from "@/lib/types";
import { toReference, type Reference } from "./references";
import { buildWorkspaceTree, type WorkspaceTreeNode } from "./workspaceTree";

// The Rune 2.0 shell's view of one Project's Workspace: its Pages, Folders and
// Collections, the tree that places them (migrations 024–025), each
// Collection's Entries, its property definitions and the Entries' values
// (026), its saved Views (027), and the Project's references between Entries,
// Pages and Scenes (028) — Relationship values and generic links, from which
// every backlink is derived. Also the Manuscript's Scene properties, the
// Scenes' values and the saved Scene Views (032): metadata beside the prose,
// read here with the rest of the connection layer. Titles, dates, property
// values, View configuration and reference ids only — never a Page's, an
// Entry's or a Scene's rich-text content, which its editor loads by id.
//
// Only ACTIVE objects: from migration 030, RLS hides everything in Trash (and
// every reference with an end in Trash), so none of it is read here. The
// Trash itself is listed on demand (listWorkspaceTrash).

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
  /** Every Collection's saved Views (any order; see viewsOf in lib/rune2/collectionViews). */
  views: WorkspaceCollectionView[];
  /**
   * Whether saved Views can be read (migration 027). When not, each
   * Collection shows its List (from shown_in_list) and no View is offered.
   */
  viewable: boolean;
  /** Every reference of the Project (Relationship values and generic links), any order. */
  references: Reference[];
  /**
   * Whether references can be read (migration 028). When not, no Relationship
   * property, link or backlink is shown or offered.
   */
  referable: boolean;
  /**
   * Whether the Workspace has a Trash (migration 030). When not, nothing is
   * offered to be trashed, and nothing can be deleted but an empty Folder or
   * Collection (as before).
   */
  trashable: boolean;
  /** Whether manuscript Scenes can go to Trash too (migration 031). */
  sceneTrashable: boolean;
  /** The Project's Manuscript (the owner of its Scene properties and Scene Views), or null if unreadable. */
  manuscriptId: string | null;
  /** The Manuscript's Scene property definitions (any order; see propertiesOf). */
  sceneProperties: SceneProperty[];
  /** Every Scene's stored property values (a Relationship's are references). */
  sceneValues: ScenePropertyValue[];
  /** The Manuscript's saved Scene Views (any order; see viewsOf). */
  sceneViews: SceneView[];
  /**
   * Whether Scene properties and Scene Views can be read (migration 032). When
   * not, no Scene property or Scene View is shown or offered, and the
   * manuscript works exactly as before.
   */
  scenePropertied: boolean;
};

/** Cached per request so the shell layout and its pages share one read. */
export const loadProjectWorkspace = cache(async (projectId: string): Promise<ProjectWorkspace> => {
  const supabase = await createClient();
  const [
    pagesRead,
    foldersRead,
    nodesRead,
    collectionsRead,
    entriesRead,
    propertiesRead,
    valuesRead,
    viewsRead,
    referencesRead,
    trashRead,
    sceneTrashRead,
    manuscriptRead,
    scenePropertiesRead,
    sceneValuesRead,
    sceneViewsRead,
  ] = await Promise.all([
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
    // Every column: the relation_* columns exist only from 028.
    supabase
      .from("workspace_collection_properties")
      .select("*")
      .eq("project_id", projectId)
      .order("position", { ascending: true }),
    supabase.from("workspace_entry_values").select("entry_id, property_id, value").eq("project_id", projectId),
    supabase
      .from("workspace_collection_views")
      .select("id, collection_id, project_id, name, type, position, config, created_at, updated_at")
      .eq("project_id", projectId)
      .order("position", { ascending: true }),
    supabase.from("object_references").select("*").eq("project_id", projectId),
    // No rows: only whether the column exists (migration 030).
    supabase.from("workspace_folders").select("trashed_at").eq("project_id", projectId).limit(0),
    // Likewise for Scene Trash (migration 031).
    supabase.from("scenes").select("trashed_at").limit(0),
    supabase.from("manuscripts").select("id").eq("project_id", projectId).maybeSingle(),
    supabase
      .from("scene_property_definitions")
      .select("*")
      .eq("project_id", projectId)
      .order("position", { ascending: true }),
    supabase.from("scene_property_values").select("scene_id, property_id, value").eq("project_id", projectId),
    supabase
      .from("scene_views")
      .select("id, manuscript_id, project_id, name, type, position, config, created_at, updated_at")
      .eq("project_id", projectId)
      .order("position", { ascending: true }),
  ]);
  // Scene metadata is optional to everything else: without it (before 032),
  // the manuscript and the Workspace work exactly as before.
  const manuscriptId = (manuscriptRead.data?.id as string | undefined) ?? null;
  const sceneError = scenePropertiesRead.error ?? sceneValuesRead.error ?? sceneViewsRead.error;
  if (sceneError) console.error(`[rune2] Could not load scene properties: ${sceneError.message}`);
  const scenes =
    sceneError || !manuscriptId
      ? { manuscriptId, sceneProperties: [], sceneValues: [], sceneViews: [], scenePropertied: false }
      : {
          manuscriptId,
          sceneProperties: (scenePropertiesRead.data ?? []) as SceneProperty[],
          sceneValues: (sceneValuesRead.data ?? []) as ScenePropertyValue[],
          sceneViews: (sceneViewsRead.data ?? []) as SceneView[],
          scenePropertied: true,
        };
  const trashable = !trashRead.error;
  const sceneTrashable = trashable && !sceneTrashRead.error;
  const noProperties = {
    properties: [],
    values: [],
    propertied: false,
    views: [],
    viewable: false,
    references: [],
    referable: false,
  };
  const empty = {
    folders: [],
    collections: [],
    entries: [],
    organizable: false,
    collectable: false,
    trashable: false,
    sceneTrashable,
    ...noProperties,
    ...scenes,
  };
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
  // Views are optional to properties: without them (before 027), each
  // Collection shows its List as in Milestone 9.
  const viewsError = propertiesError ? null : viewsRead.error;
  if (viewsError) console.error(`[rune2] Could not load collection views: ${viewsError.message}`);
  // References are optional to everything else: without them (before 028),
  // the Workspace works as in Milestone 10.
  const referencesError = propertiesError ? null : referencesRead.error;
  if (referencesError) console.error(`[rune2] Could not load references: ${referencesError.message}`);
  const properties = propertiesError
    ? noProperties
    : {
        properties: ((propertiesRead.data ?? []) as Partial<CollectionProperty>[]).map(withRelationDefaults),
        values: (valuesRead.data ?? []) as EntryPropertyValue[],
        propertied: true,
        views: viewsError ? [] : ((viewsRead.data ?? []) as WorkspaceCollectionView[]),
        viewable: !viewsError,
        references: referencesError ? [] : ((referencesRead.data ?? []) as ObjectReferenceRow[]).map(toReference),
        referable: !referencesError,
      };
  return {
    pages,
    folders,
    collections,
    entries,
    tree: buildWorkspaceTree(nodes, pages, folders, collections),
    organizable: true,
    collectable: !collectionsError,
    trashable,
    sceneTrashable,
    ...properties,
    ...scenes,
  };
});

/** A property as read before migration 028 has no relation_* columns: it points nowhere. */
function withRelationDefaults(p: Partial<CollectionProperty>): CollectionProperty {
  return {
    ...(p as CollectionProperty),
    relation_target: p.relation_target ?? null,
    relation_collection_id: p.relation_collection_id ?? null,
    relation_many: p.relation_many ?? false,
  };
}
