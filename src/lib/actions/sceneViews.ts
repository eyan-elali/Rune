"use server";

import { createClient } from "@/lib/supabase/server";
import type { CollectionViewConfig, CollectionViewType, SceneView } from "@/lib/types";

// Saved Scene Views (migration 032): a Manuscript's List, Table and Board
// Views over its Scenes. Configuration only — which properties show, sort,
// filters, a Board's grouping — never a Scene, a value or any prose, so
// nothing here can change writing or the manuscript's order. Every write is
// one SECURITY DEFINER function that checks ownership and checks the config
// against the Manuscript's own Scene properties (and the read-only fields
// "words" and "placement"). A Manuscript may have no saved View; its Scenes
// then show in manuscript order.

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };
type RpcResult<T> = ({ status: "ok" } & T) | { status: "error"; error: string };

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Adds a Scene View at the end. `config` null: the type's defaults. Blank name: "List", "Table" or "Board". */
export async function createSceneView(
  projectId: string,
  name: string | null,
  type: CollectionViewType,
  config: CollectionViewConfig | null = null
): Promise<ActionResult<SceneView>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase.rpc("create_scene_view", {
    p_project_id: projectId,
    p_name: name,
    p_type: type,
    p_config: config,
  });
  if (error) return { data: null, error: error.message };
  const result = data as RpcResult<{ view: SceneView }>;
  if (result.status !== "ok") return { data: null, error: result.error };
  return { data: result.view, error: null };
}

/** What can change about a Scene View. `config` replaces the whole configuration. */
export type SceneViewChanges = {
  name?: string;
  type?: CollectionViewType;
  config?: CollectionViewConfig;
};

export async function updateSceneView(viewId: string, changes: SceneViewChanges): Promise<ActionResult<SceneView>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase.rpc("update_scene_view", {
    p_view_id: viewId,
    p_changes: changes,
  });
  if (error) return { data: null, error: error.message };
  const result = data as RpcResult<{ view: SceneView }>;
  if (result.status !== "ok") return { data: null, error: result.error };
  return { data: result.view, error: null };
}

/** Moves a Scene View to `index` (0-based) among the Manuscript's. */
export async function moveSceneView(viewId: string, index: number): Promise<ActionResult<SceneView>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase.rpc("move_scene_view", {
    p_view_id: viewId,
    p_index: index,
  });
  if (error) return { data: null, error: error.message };
  const result = data as RpcResult<{ view: SceneView }>;
  if (result.status !== "ok") return { data: null, error: result.error };
  return { data: result.view, error: null };
}

/** Deletes a Scene View — its configuration only. */
export async function deleteSceneView(viewId: string): Promise<ActionResult<null>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase.rpc("delete_scene_view", { p_view_id: viewId });
  if (error) return { data: null, error: error.message };
  const result = data as RpcResult<object>;
  if (result.status !== "ok") return { data: null, error: result.error };
  return { data: null, error: null };
}
