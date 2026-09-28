"use server";

import { createClient } from "@/lib/supabase/server";
import type { CollectionViewConfig, CollectionViewType, WorkspaceCollectionView } from "@/lib/types";

// Saved Collection Views (migration 027). A View is configuration — which
// properties show and in what order, sort, filters, a Board's grouping —
// never an Entry or a value, so nothing here can change or remove writing.
// Every write is one SECURITY DEFINER function that checks ownership and
// checks the config against the View's own Collection: a View can't name
// another Collection's property. A Collection always keeps at least one View.

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };
type RpcResult<T> = ({ status: "ok" } & T) | { status: "error"; error: string };

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Adds a View at the end of a Collection's Views. `config` null: the type's defaults. Blank name: "List", "Table" or "Board". */
export async function createCollectionView(
  collectionId: string,
  name: string | null,
  type: CollectionViewType,
  config: CollectionViewConfig | null = null
): Promise<ActionResult<WorkspaceCollectionView>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase.rpc("create_workspace_collection_view", {
    p_collection_id: collectionId,
    p_name: name,
    p_type: type,
    p_config: config,
  });
  if (error) return { data: null, error: error.message };
  const result = data as RpcResult<{ view: WorkspaceCollectionView }>;
  if (result.status !== "ok") return { data: null, error: result.error };
  return { data: result.view, error: null };
}

/** What can change about a View. `config` replaces the whole configuration. */
export type CollectionViewChanges = {
  name?: string;
  type?: CollectionViewType;
  config?: CollectionViewConfig;
};

export async function updateCollectionView(
  viewId: string,
  changes: CollectionViewChanges
): Promise<ActionResult<WorkspaceCollectionView>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase.rpc("update_workspace_collection_view", {
    p_view_id: viewId,
    p_changes: changes,
  });
  if (error) return { data: null, error: error.message };
  const result = data as RpcResult<{ view: WorkspaceCollectionView }>;
  if (result.status !== "ok") return { data: null, error: result.error };
  return { data: result.view, error: null };
}

/** Moves a View to `index` (0-based) among its Collection's Views. */
export async function moveCollectionView(viewId: string, index: number): Promise<ActionResult<WorkspaceCollectionView>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase.rpc("move_workspace_collection_view", {
    p_view_id: viewId,
    p_index: index,
  });
  if (error) return { data: null, error: error.message };
  const result = data as RpcResult<{ view: WorkspaceCollectionView }>;
  if (result.status !== "ok") return { data: null, error: result.error };
  return { data: result.view, error: null };
}

/** Deletes a View — its configuration only. A Collection's last View is refused. */
export async function deleteCollectionView(viewId: string): Promise<ActionResult<null>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase.rpc("delete_workspace_collection_view", { p_view_id: viewId });
  if (error) return { data: null, error: error.message };
  const result = data as RpcResult<object>;
  if (result.status !== "ok") return { data: null, error: result.error };
  return { data: null, error: null };
}
