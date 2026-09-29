"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidateProjectTotals } from "@/lib/projectWordCount";
import {
  getManuscriptIdForProject,
  getProjectIdForManuscript,
  getUnplacedScenes as queryUnplacedScenes,
} from "@/lib/manuscriptQueries";
import { recordAnalyticsEvent } from "@/lib/actions/analytics";
import type { PlacedScene, Scene, UnplacedScene } from "@/lib/types";

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// Rune 2.0 has no free-word limit (migration 037): the "checked" RPCs below
// keep their names, signatures and result shapes for stale clients and queued
// offline saves, but never block writing. Only a database from before 037 can
// still answer 'word_limit_blocked'; the save path keeps that answer (the
// offline queue keeps the prose and retries), and creation treats it as a
// failure that changed nothing.

type SaveSceneCheckedResult =
  | { status: "ok"; updated_at: string; version: number }
  | { status: "word_limit_blocked"; limit: number }
  | { status: "version_mismatch" }
  | { status: "error"; error: string };

/** A Chapter's placed Scenes, in order. */
export async function getScenes(
  chapterId: string
): Promise<ActionResult<PlacedScene[]>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("scenes")
    .select("*")
    .eq("chapter_id", chapterId)
    .order("position", { ascending: true });

  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as PlacedScene[], error: null };
}

type CreateSceneResult<T> = { data: T; error: null } | { data: null; error: string };

type InsertSceneCheckedResult = { status: "ok"; id: string } | { status: "error"; error: string };

/**
 * Maps an insert_scene_checked / insert_unplaced_scene_checked result to the
 * new Scene row.
 */
async function readInsertedScene<T extends Scene>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  rpc: { data: unknown; error: { message: string } | null }
): Promise<CreateSceneResult<T>> {
  if (rpc.error) return { data: null, error: rpc.error.message };
  const result = rpc.data as InsertSceneCheckedResult;
  if (result.status !== "ok") return { data: null, error: result.error ?? "Couldn’t create the scene" };

  const { data, error } = await supabase.from("scenes").select("*").eq("id", result.id).single();
  if (error) return { data: null, error: error.message };
  return { data: data as T, error: null };
}

/** null = unnamed (blank; scenes.title is NOT NULL). A blank string keeps the old "Untitled". */
function storedSceneTitle(title: string | null): string {
  return title === null ? "" : title.trim() || "Untitled";
}

/**
 * Creates an empty Scene at the end of a Chapter, through insert_scene_checked
 * in one database call: it refuses a Chapter the writer cannot see or that is
 * in Trash ("Chapter not found"), and picks the position
 * itself under the per-account lock that move_scene also takes (migration
 * 018), so simultaneous creations and moves into the Chapter never tie. Its
 * Manuscript is the Chapter's.
 *
 * A null title creates an unnamed Scene (stored blank): Rune 2.0 labels it by
 * its current position ("Scene 2") without storing that label. A blank string
 * still stores "Untitled", as before, for existing callers.
 */
export async function createScene(
  chapterId: string,
  title: string | null
): Promise<CreateSceneResult<PlacedScene>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const rpc = await supabase.rpc("insert_scene_checked", {
    p_chapter_id: chapterId,
    p_title: storedSceneTitle(title),
    p_content: null,
    p_word_count: 0,
    // The database picks the position (018). null, not a guess: against a
    // pre-018 function it fails the NOT NULL check instead of risking a tie.
    p_position: null,
  });
  return readInsertedScene<PlacedScene>(supabase, rpc);
}

/**
 * Creates an empty Scene directly in the Project's Unplaced Scenes, at the end
 * of that list, through insert_unplaced_scene_checked. Its words never enter
 * the ordered manuscript total or export until it is placed. A null title
 * creates an unnamed Scene, as for createScene.
 */
export async function createUnplacedScene(
  projectId: string,
  title: string | null
): Promise<CreateSceneResult<UnplacedScene>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const manuscriptId = await getManuscriptIdForProject(supabase, projectId);
  if (!manuscriptId) return { data: null, error: "Project not found" };

  const rpc = await supabase.rpc("insert_unplaced_scene_checked", {
    p_manuscript_id: manuscriptId,
    p_title: storedSceneTitle(title),
    p_content: null,
    p_word_count: 0,
  });
  return readInsertedScene<UnplacedScene>(supabase, rpc);
}

/**
 * Puts a Chapter's placed Scenes in the given order (positions 0..n-1), in one
 * atomic database call (reorder_chapter_scenes). `stale` means the list no
 * longer matches the Chapter — a Scene moved in or out meanwhile — and nothing
 * changed; the caller should reload the Chapter.
 */
export async function reorderScenes(
  chapterId: string,
  orderedSceneIds: string[]
): Promise<{ error: string | null; stale?: true }> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Not authenticated" };

  const { data, error } = await supabase.rpc("reorder_chapter_scenes", {
    p_chapter_id: chapterId,
    p_scene_ids: orderedSceneIds,
  });
  if (error) return { error: error.message };

  const result = data as { status: "ok" | "stale" | "error"; error?: string };
  if (result.status === "stale") {
    return { error: "This chapter changed — reload to see its scenes", stale: true };
  }
  if (result.status !== "ok") return { error: result.error ?? "Couldn't reorder scenes" };
  return { error: null };
}

/**
 * One Scene — placed or Unplaced — with its content, for an editor opening it
 * by id (the Rune 2.0 writing surface). RLS limits it to the writer's own
 * Scenes; a Scene that doesn't exist or isn't visible returns an error.
 */
export async function getScene(sceneId: string): Promise<ActionResult<Scene>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase.from("scenes").select("*").eq("id", sceneId).maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: "Scene not found" };
  return { data: data as Scene, error: null };
}

/** The Project's Unplaced Scenes, in Unplaced order. */
export async function getUnplacedScenes(
  projectId: string
): Promise<ActionResult<UnplacedScene[]>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await queryUnplacedScenes(supabase, projectId);
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// ── Placement ─────────────────────────────────────────────────────────────────
//
// Every move goes through move_scene (migration 017): one transaction under
// the per-account lock, so two simultaneous moves can never tie on a position
// and a refused or failed move changes nothing. It changes only chapter_id and
// position on the SAME row: the Scene ID, its content, its writing history and
// any queued offline save (keyed by Scene ID) are untouched. It refuses a
// Chapter of another Manuscript. The database recomputes the ordered
// manuscript total (projects.word_count) in the same transaction (020).
//
// The row update bumps version/updated_at (increment_scene_version). The
// editor's autosave treats that as a metadata-only change: its conflict check
// is content-scoped (word_count), and a version_mismatch simply retries.

/**
 * Moves a Scene to the end of a Chapter (chapterId) or of its Manuscript's
 * Unplaced Scenes (null), atomically, and returns the moved row.
 */
async function moveScene<T extends Scene>(
  sceneId: string,
  chapterId: string | null
): Promise<ActionResult<T>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const rpc = await supabase.rpc("move_scene", {
    p_scene_id: sceneId,
    p_chapter_id: chapterId,
  });
  if (rpc.error) return { data: null, error: rpc.error.message };
  const result = rpc.data as { status: "ok"; moved: boolean } | { status: "error"; error: string };
  if (result.status !== "ok") return { data: null, error: result.error };

  const { data, error } = await supabase.from("scenes").select("*").eq("id", sceneId).single();
  if (error) return { data: null, error: error.message };

  if (result.moved) {
    const projectId = await getProjectIdForManuscript(supabase, data.manuscript_id);
    if (projectId) revalidateProjectTotals(projectId);
  }
  return { data: data as T, error: null };
}

/**
 * Moves a Scene out of narrative order into its Manuscript's Unplaced Scenes,
 * at the end of that list. Its words leave the ordered manuscript total and
 * export; it stays active manuscript prose (Unplaced is not Trash).
 */
export async function moveSceneToUnplaced(
  sceneId: string
): Promise<ActionResult<UnplacedScene>> {
  return moveScene<UnplacedScene>(sceneId, null);
}

/**
 * Places a Scene at the end of a Chapter of its own Manuscript — an Unplaced
 * Scene, or a placed Scene from another Chapter. A Chapter of any other
 * Manuscript (even the writer's own other project) is refused.
 */
export async function moveSceneToChapter(
  sceneId: string,
  chapterId: string
): Promise<ActionResult<PlacedScene>> {
  return moveScene<PlacedScene>(sceneId, chapterId);
}

/**
 * Puts a Scene at `index` (0-based; null = last) among a Chapter's Scenes
 * (chapterId) or among the Unplaced Scenes (null) — a reorder in place, a move
 * between Chapters, or into or out of Unplaced Scenes — through place_scene
 * (migration 037): one statement under the per-account lock, the destination
 * renumbered 0..n-1. The same Scene row moves: its id, prose, history,
 * properties, references and writing history are untouched, and no words are
 * counted as written. A Chapter in Trash, or of another Manuscript, is refused.
 */
export async function placeScene(
  sceneId: string,
  chapterId: string | null,
  index: number | null
): Promise<{ error: string | null; moved?: boolean }> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Not authenticated" };

  const { data, error } = await supabase.rpc("place_scene", {
    p_scene_id: sceneId,
    p_chapter_id: chapterId,
    p_index: index,
  });
  if (error) return { error: error.message };
  const result = data as
    | { status: "ok"; moved: boolean; chapter_changed: boolean }
    | { status: "error"; error: string };
  if (result.status !== "ok") return { error: result.error };

  if (result.chapter_changed) {
    const { data: scene } = await supabase.from("scenes").select("manuscript_id").eq("id", sceneId).maybeSingle();
    const projectId = scene ? await getProjectIdForManuscript(supabase, scene.manuscript_id) : null;
    if (projectId) revalidateProjectTotals(projectId);
  }
  return { error: null, moved: result.moved };
}

export async function renameScene(
  id: string,
  title: string
): Promise<ActionResult<Scene>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("scenes")
    .update({
      title: title.trim() || "Untitled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as Scene, error: null };
}

// A Scene is never deleted here. "Move to Trash" (actions/workspaceTrash.ts)
// is the only way out of the manuscript, and permanent deletion happens only
// from Trash (migration 037 took clients' direct DELETE away).

/**
 * Version-guarded Scene update for the live editor's autosave path (both the
 * immediate online save and the reconnect/flush-queue path call this),
 * through save_scene_checked(), one atomic database function under the
 * per-account lock. The name is historical: nothing is limit-checked since
 * migration 037.
 *
 * Returns a discriminated union so the caller can handle each case without
 * needing to inspect raw DB error codes.
 */
export async function syncSceneWithLimitCheck(
  id: string,
  content: Record<string, unknown>,
  wordCount: number,
  serverVersion: number,
  savePath: "online" | "offline_sync" = "online"
): Promise<
  | { status: "ok"; updated_at: string; version: number }
  | { status: "word_limit_blocked" }
  | { status: "version_mismatch" }
  | { status: "error"; error: string }
> {
  const { supabase, user } = await getUser();
  if (!user) return { status: "error", error: "Not authenticated" };

  const { data, error } = await supabase.rpc("save_scene_checked", {
    p_scene_id: id,
    p_content: content,
    p_word_count: wordCount,
    p_expected_version: serverVersion,
  });

  // Include the Postgres/PostgREST error code — "42P01: relation ... does not
  // exist" style failures are database-drift signals the client-side log needs
  // to surface verbatim for diagnosis.
  if (error)
    return {
      status: "error",
      error: `${error.code ? error.code + ": " : ""}${error.message}`,
    };

  const result = data as SaveSceneCheckedResult;

  if (result.status === "error") return { status: "error", error: result.error };
  if (result.status === "word_limit_blocked") return { status: "word_limit_blocked" };
  if (result.status === "version_mismatch") return { status: "version_mismatch" };

  // Best-effort — analytics must never block a successful save from returning.
  // This is the authoritative persistence point for the live editor's autosave
  // path (both the immediate online save and the reconnect/flush-queue path
  // both call this function). No "was word_count previously 0" check is
  // needed: the event's dedupe key is scoped once-per-user, so only the very
  // first call that reaches this branch for a given user ever writes a row —
  // every later save is a no-op at the database level.
  try {
    const { error: analyticsError, code } = await recordAnalyticsEvent({
      userId: user.id,
      eventName: "first_save",
    });
    if (analyticsError) {
      // Safe diagnostic context only — never log manuscript content, Scene
      // content, project titles, emails, or auth tokens.
      console.error("[analytics] first_save insert failed:", {
        eventName: "first_save",
        userIdResolved: true,
        savePath,
        code,
        message: analyticsError,
      });
    }
  } catch (err) {
    console.error("[analytics] first_save insert threw:", {
      eventName: "first_save",
      userIdResolved: true,
      savePath,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  return {
    status: "ok",
    updated_at: result.updated_at,
    version: result.version,
  };
}

/**
 * Post-sync maintenance called after syncPendingWrite successfully persists a
 * Scene. Touches the Scene's Chapter updated_at (a placed Scene only) and
 * revalidates the project and profile page caches. The project's ordered
 * manuscript total (projects.word_count) was already updated by the database
 * in the save's own transaction (migration 020).
 */
export async function afterSceneSync(sceneId: string): Promise<void> {
  const { supabase, user } = await getUser();
  if (!user) return;

  const { data: scene } = await supabase
    .from("scenes")
    .select("chapter_id, manuscript_id")
    .eq("id", sceneId)
    .single();

  if (!scene) return;

  if (scene.chapter_id) {
    await supabase
      .from("chapters")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", scene.chapter_id);
  }

  const projectId = await getProjectIdForManuscript(supabase, scene.manuscript_id);
  if (projectId) {
    revalidateProjectTotals(projectId);
  }
}
