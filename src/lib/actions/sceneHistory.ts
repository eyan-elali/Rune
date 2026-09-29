"use server";

import { createClient } from "@/lib/supabase/server";
import type { SceneHistory, SceneRevision } from "@/lib/rune2/history";
import type { Scene } from "@/lib/types";

// Scene History (migration 036): earlier texts of one Scene, kept by the
// database on the save path. Reading never changes anything; restoring is a
// new save of the old text through save_scene_checked (version guard,
// allowance, word counts), after the text it replaces is kept. No revision is
// ever rewound or deleted, and nothing here writes writing history.

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };
type RpcResult<T> = ({ status: "ok" } & T) | { status: "error"; error: string };

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

/** An active Scene's current state and its earlier texts, newest first (no content). */
export async function listSceneHistory(sceneId: string): Promise<ActionResult<SceneHistory>> {
  const r = await call<SceneHistory>("list_scene_history", { p_scene_id: sceneId });
  return r.error !== null ? r : { data: { scene: r.data.scene, revisions: r.data.revisions }, error: null };
}

/** One earlier text, for a read-only preview. */
export async function getSceneRevision(revisionId: string): Promise<ActionResult<SceneRevision>> {
  const r = await call<{ revision: SceneRevision }>("get_scene_revision", { p_revision_id: revisionId });
  return r.error !== null ? r : { data: r.data.revision, error: null };
}

export type RestoreSceneRevisionResult =
  /** The Scene now holds the earlier text, as a new version. */
  | { status: "ok"; scene: Scene }
  /** The Scene already holds exactly this text; nothing was written. */
  | { status: "unchanged" }
  /** The Scene changed since its history was read; nothing was written. */
  | { status: "version_mismatch" }
  | { status: "word_limit_blocked" }
  | { status: "error"; error: string };

/**
 * Makes an earlier text the Scene's current text. `expectedVersion` is the
 * Scene version the writer's History view was read at: any save in between
 * refuses the restore rather than overwrite it.
 */
export async function restoreSceneRevision(
  revisionId: string,
  expectedVersion: number
): Promise<RestoreSceneRevisionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { status: "error", error: "Not authenticated" };

  const { data, error } = await supabase.rpc("restore_scene_revision", {
    p_revision_id: revisionId,
    p_expected_version: expectedVersion,
  });
  if (error) return { status: "error", error: error.message };
  const result = data as
    | { status: "ok"; scene_id: string }
    | { status: "unchanged" | "version_mismatch" | "word_limit_blocked" }
    | { status: "error"; error: string };
  if (result.status === "error") return { status: "error", error: result.error };
  if (result.status !== "ok") return { status: result.status };

  // The whole Scene as the server now holds it, for the editor and the
  // device's confirmed baseline.
  const { data: scene, error: readError } = await supabase.from("scenes").select("*").eq("id", result.scene_id).maybeSingle();
  if (readError || !scene) return { status: "error", error: readError?.message ?? "Scene not found" };
  return { status: "ok", scene: scene as Scene };
}

