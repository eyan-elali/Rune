"use server";

import { createClient } from "@/lib/supabase/server";
import { recalculateProjectWordCount } from "@/lib/projectWordCount";
import { getProjectIdForManuscript } from "@/lib/manuscriptQueries";
import { recordAnalyticsEvent } from "@/lib/actions/analytics";
import type { PlacedScene, Scene } from "@/lib/types";

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/**
 * Account-wide, server-authoritative *stored-word* total for the signed-in
 * user — every Scene they own, placed or Unplaced, summed across every
 * project, backed by the account_word_total() database function. This is
 * deliberately NOT the same figure as a project's displayed manuscript total
 * (projects.word_count / calculateProjectWordCount in src/lib/manuscript.ts,
 * which counts placed Scenes only) — the free-tier allowance is measured
 * against everything Rune is storing for the writer, so moving prose to
 * Unplaced Scenes can never lower it. Returns 0 for Scribe subscribers
 * without querying at all, since the value is meaningless once the account
 * is unrestricted.
 *
 * This is a display/UX value only — safe to call directly from client
 * components for the editor's remaining-words estimate. The actual limit is
 * enforced server-side, atomically, by save_scene_checked/insert_scene_checked
 * (see below) — never by this function or its caller.
 */
export async function getAccountWordTotal(): Promise<number> {
  const { supabase, user } = await getUser();
  if (!user) return 0;

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", user.id)
    .single();

  if ((profileRow?.subscription_tier ?? "free") !== "free") return 0;

  const { data, error } = await supabase.rpc("account_word_total");
  if (error || typeof data !== "number") return 0;
  return data;
}

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

/**
 * Creates an empty Scene at the end of a Chapter. Its Manuscript is derived
 * from the Chapter by the database (scenes_fill_manuscript_id).
 */
export async function createScene(
  chapterId: string,
  title: string
): Promise<ActionResult<PlacedScene>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data: existing } = await supabase
    .from("scenes")
    .select("position")
    .eq("chapter_id", chapterId)
    .order("position", { ascending: false })
    .limit(1);

  const position =
    existing && existing.length > 0 ? existing[0].position + 1 : 0;

  const { data, error } = await supabase
    .from("scenes")
    .insert({
      chapter_id: chapterId,
      title: title.trim() || "Untitled",
      content: null,
      word_count: 0,
      position,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as PlacedScene, error: null };
}

export async function reorderScenes(
  chapterId: string,
  orderedSceneIds: string[]
): Promise<{ error: string | null }> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Not authenticated" };

  const results = await Promise.all(
    orderedSceneIds.map((id, index) =>
      supabase
        .from("scenes")
        .update({ position: index, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("chapter_id", chapterId) // guard against cross-chapter drift
    )
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) return { error: failed.error.message };

  return { error: null };
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

export async function deleteScene(
  id: string
): Promise<{ error: string | null }> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Not authenticated" };

  // Capture the Manuscript before deletion for word count recalculation.
  const { data: scene } = await supabase
    .from("scenes")
    .select("manuscript_id")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("scenes").delete().eq("id", id);
  if (error) return { error: error.message };

  if (scene) {
    const projectId = await getProjectIdForManuscript(supabase, scene.manuscript_id);
    if (projectId) {
      await recalculateProjectWordCount(supabase, projectId);
    }
  }

  return { error: null };
}

/**
 * Server-side word limit check + version-guarded Scene update for the live
 * editor's autosave path (both the immediate online save and the
 * reconnect/flush-queue path call this). Delegates the check-and-write to
 * save_scene_checked(), a single atomic database function — the limit check
 * and the update used to be two separate round trips here, which let two
 * concurrent saves on different Scenes read the same "remaining" figure and
 * jointly exceed the account-wide limit. The database function closes that
 * race with a per-account advisory lock.
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
 * recalculates the project's ordered manuscript total (which also revalidates
 * the project and profile page caches). This is purely for the *display*
 * total (projects.word_count) — unrelated to the account-wide enforcement
 * above, which is always computed live from every Scene, never from this
 * denormalized column.
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
    await recalculateProjectWordCount(supabase, projectId);
  }
}
