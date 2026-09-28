"use server";

import { createClient } from "@/lib/supabase/server";
import type { CollectionEntry, WorkspaceCollection } from "@/lib/types";
import { normalizeTitle, renameVersioned, saveVersionedContent, type SaveContentResult } from "@/lib/rune2/versionedContent";

// Workspace Collections and their Entries (migration 025). A Collection is a
// Workspace object: it belongs to its Project and has one place in the
// Workspace tree, created with it (create_workspace_collection) and moved like
// any other item (moveWorkspaceNode). An Entry belongs to exactly one
// Collection for life and is not a tree item: its Collection lists it.
//
// An Entry's body is saved exactly as a Workspace Page's is (the shared
// versioned-content rules in lib/rune2/versionedContent.ts): a conditional
// update on the database-owned `version`, bumped by content changes only.
// Nothing here touches the manuscript, the Scene save path, the free-word
// allowance, writing credits or XP.
//
// Deletion is recoverable: a Collection (with its Entries) or a single Entry
// goes to Trash (actions/workspaceTrash.ts, migration 030).
// deleteWorkspaceCollection — an EMPTY Collection only, destroyed at once —
// remains for the shell before 030.

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };
type RpcResult<T> = ({ status: "ok" } & T) | { status: "error"; error: string };

/** One Entry content save. `conflict`: changed since `expectedVersion`; nothing was written. */
export type SaveCollectionEntryResult = SaveContentResult;

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// ── Collections ─────────────────────────────────────────────────────────────

/**
 * Creates an empty Collection at the end of `parentNodeId` (a Folder's
 * Workspace node; null = the Workspace's top level). The Collection and its
 * place in the tree are created together.
 */
export async function createWorkspaceCollection(
  projectId: string,
  title: string | null = null,
  parentNodeId: string | null = null
): Promise<ActionResult<{ collection: WorkspaceCollection; nodeId: string }>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase.rpc("create_workspace_collection", {
    p_project_id: projectId,
    p_parent_node_id: parentNodeId,
    p_title: normalizeTitle(title),
  });
  if (error) return { data: null, error: error.message };
  const result = data as RpcResult<{ collection: WorkspaceCollection; node_id: string }>;
  if (result.status !== "ok") return { data: null, error: result.error };
  return { data: { collection: result.collection, nodeId: result.node_id }, error: null };
}

/** Renames a Collection; blank makes it untitled. Its Entries are untouched. */
export async function renameWorkspaceCollection(
  collectionId: string,
  title: string | null
): Promise<ActionResult<{ title: string | null }>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("workspace_collections")
    .update({ title: normalizeTitle(title) })
    .eq("id", collectionId)
    .select("title")
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: "Collection not found" };
  return { data: { title: data.title as string | null }, error: null };
}

/** Deletes an EMPTY Collection. One holding any Entry is refused, and nothing changes. */
export async function deleteWorkspaceCollection(collectionId: string): Promise<ActionResult<null>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase.rpc("delete_workspace_collection", { p_collection_id: collectionId });
  if (error) return { data: null, error: error.message };
  const result = data as RpcResult<object>;
  if (result.status !== "ok") return { data: null, error: result.error };
  return { data: null, error: null };
}

// ── Entries ─────────────────────────────────────────────────────────────────

/** Creates an empty Entry at the end of a Collection the writer owns. */
export async function createCollectionEntry(
  collectionId: string,
  title: string | null = null
): Promise<ActionResult<CollectionEntry>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  // Read under RLS: another writer's (or a missing) Collection is not found.
  const { data: collection, error: readError } = await supabase
    .from("workspace_collections")
    .select("id, project_id")
    .eq("id", collectionId)
    .maybeSingle();
  if (readError) return { data: null, error: readError.message };
  if (!collection) return { data: null, error: "Collection not found" };

  // The composite foreign key keeps project_id the Collection's own.
  const { data, error } = await supabase
    .from("workspace_collection_entries")
    .insert({ collection_id: collection.id, project_id: collection.project_id, title: normalizeTitle(title) })
    .select("*")
    .single();
  if (error) return { data: null, error: error.message };
  return { data: data as CollectionEntry, error: null };
}

export async function getCollectionEntry(entryId: string): Promise<ActionResult<CollectionEntry>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase.from("workspace_collection_entries").select("*").eq("id", entryId).maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: "Entry not found" };
  return { data: data as CollectionEntry, error: null };
}

/**
 * Saves an Entry's body if it is still at `expectedVersion` (one statement);
 * on a mismatch nothing is written and the current version is returned.
 */
export async function saveCollectionEntryContent(
  entryId: string,
  content: Record<string, unknown>,
  expectedVersion: number
): Promise<SaveCollectionEntryResult> {
  const { supabase, user } = await getUser();
  if (!user) return { status: "error", error: "Not authenticated" };
  return saveVersionedContent(supabase, "workspace_collection_entries", entryId, content, expectedVersion, "Entry is too large");
}

/** Renames an Entry; blank makes it untitled. Never changes its version or content. */
export async function renameCollectionEntry(
  entryId: string,
  title: string | null
): Promise<ActionResult<{ title: string | null }>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const r = await renameVersioned(supabase, "workspace_collection_entries", entryId, title);
  if (r.error !== null) return { data: null, error: r.error };
  if (!r.data) return { data: null, error: "Entry not found" };
  return { data: r.data, error: null };
}
