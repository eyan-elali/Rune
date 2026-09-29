"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { revalidateProjectTotals } from "@/lib/projectWordCount";
import { getManuscriptIdForProject, getProjectIdForManuscript } from "@/lib/manuscriptQueries";

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };

// Rune 2.0 has no free-word limit (migration 037): these RPCs never block.
type SaveSceneCheckedResult =
  | { status: "ok"; updated_at: string; version: number }
  | { status: "version_mismatch" }
  | { status: "error"; error: string };

type InsertSceneCheckedResult =
  | { status: "ok"; id: string }
  | { status: "error"; error: string };

export async function createGameSession(
  mode: string,
  wordsWritten: number,
  durationSeconds: number,
  xpEarned: number,
  enemyType?: string,
  meta?: Record<string, unknown>
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("game_sessions")
    .insert({
      user_id: user.id,
      mode,
      words_written: wordsWritten,
      duration_seconds: durationSeconds,
      xp_earned: xpEarned,
      completed: true,
      ...(enemyType != null && enemyType !== "" ? { enemy_type: enemyType } : {}),
      ...(meta != null ? { meta } : {}),
    })
    .select("id")
    .single();

  if (error) {
    console.error("❌ SUPABASE INSERT ERROR:", error);
    return { data: null, error: error.message };
  }
  revalidatePath("/profile");
  revalidatePath("/dashboard");
  return { data: data as { id: string }, error: null };
}

// Converts Tiptap getHTML() output to a valid Tiptap JSON document.
// Formatting (bold, italic) is intentionally stripped — text content is preserved.
function htmlToTiptapDoc(html: string): Record<string, unknown> {
  if (!html) return { type: "doc", content: [{ type: "paragraph" }] };

  const plain = html
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();

  const paragraphs = plain
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((text) => ({ type: "paragraph", content: [{ type: "text", text }] }));

  return {
    type: "doc",
    content: paragraphs.length > 0 ? paragraphs : [{ type: "paragraph" }],
  };
}

/**
 * Creates a new "Sprint" Scene at the end of a Chapter from an Arena session,
 * subject to the account-wide free-word limit. Delegates the check-and-insert
 * to insert_scene_checked() — a single atomic database function,
 * so a concurrent editor save (or another Arena save) can't race this and
 * jointly exceed the limit.
 */
export async function appendSprintToProject(
  projectId: string,
  chapterId: string,
  wordCount: number,
  html: string
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { data: null, error: "Not authenticated" };

  // Verify chapter belongs to the project
  const manuscriptId = await getManuscriptIdForProject(supabase, projectId);
  const { data: chapter, error: chapterError } = manuscriptId
    ? await supabase
        .from("chapters")
        .select("id")
        .eq("id", chapterId)
        .eq("manuscript_id", manuscriptId)
        .single()
    : { data: null, error: null };

  if (chapterError || !chapter) {
    return { data: null, error: "Chapter not found in this project" };
  }

  const now = new Date();
  const title = `Sprint: ${now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })} ${now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;

  const content = htmlToTiptapDoc(html);

  const { data, error } = await supabase.rpc("insert_scene_checked", {
    p_chapter_id: chapterId,
    p_title: title,
    p_content: content,
    p_word_count: wordCount,
    // The database appends to the Chapter under the per-account lock (018).
    p_position: null,
  });

  if (error) return { data: null, error: error.message };

  const result = data as InsertSceneCheckedResult;

  if (result.status !== "ok") return { data: null, error: result.error ?? "Couldn’t add the scene" };

  revalidateProjectTotals(projectId);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/chapters/${chapterId}`);

  return { data: { id: result.id }, error: null };
}

/**
 * Appends an Arena session's words onto an existing Scene, subject to the
 * account-wide free-word limit. Delegates the check-and-update to
 * save_scene_checked() — the same atomic function the
 * editor's autosave path uses, so this can't race a concurrent editor save
 * (or another Arena save) and jointly exceed the limit.
 */
export async function appendToExistingScene(
  sceneId: string,
  html: string,
  additionalWordCount: number
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data: scene, error: fetchError } = await supabase
    .from("scenes")
    .select("id, content, word_count, chapter_id, manuscript_id")
    .eq("id", sceneId)
    .single();

  if (fetchError || !scene) return { data: null, error: "Scene not found" };

  const newWordCount = (scene.word_count ?? 0) + additionalWordCount;

  const newDoc = htmlToTiptapDoc(html);
  const existingNodes =
    (scene.content as { type: string; content?: unknown[] } | null)?.content ?? [];
  const newNodes = (newDoc.content as unknown[]) ?? [];

  const mergedContent = {
    type: "doc",
    content: [...existingNodes, { type: "horizontalRule" }, ...newNodes],
  };

  const { data, error } = await supabase.rpc("save_scene_checked", {
    p_scene_id: sceneId,
    p_content: mergedContent,
    p_word_count: newWordCount,
    p_expected_version: null,
  });

  if (error) return { data: null, error: error.message };

  const result = data as SaveSceneCheckedResult;

  if (result.status === "version_mismatch") {
    return { data: null, error: "This scene changed elsewhere. Please try again." };
  }
  if (result.status !== "ok") return { data: null, error: result.error ?? "Couldn’t save the scene" };

  const projectId = await getProjectIdForManuscript(supabase, scene.manuscript_id);

  if (projectId) {
    revalidateProjectTotals(projectId);

    revalidatePath(`/projects/${projectId}`);
    if (scene.chapter_id) {
      revalidatePath(`/projects/${projectId}/chapters/${scene.chapter_id}`);
    }
  }

  return { data: { id: sceneId }, error: null };
}

export type CombatRecord = { wins: number; losses: number };

const COMBAT_ENEMY_IDS = ["blank-page", "writers-block", "deadline"] as const;

function emptyCombatRecords(): Record<string, CombatRecord> {
  return Object.fromEntries(
    COMBAT_ENEMY_IDS.map((id) => [id, { wins: 0, losses: 0 }])
  );
}

export async function getCombatRecords(
  userId: string
): Promise<Record<string, CombatRecord>> {
  const supabase = await createClient();
  const records = emptyCombatRecords();

  const { data, error } = await supabase
    .from("game_sessions")
    .select("enemy_type, meta")
    .eq("user_id", userId)
    .eq("mode", "battle")
    .eq("completed", true);

  if (error || !data) return records;

  for (const session of data) {
    const enemyId = session.enemy_type;
    if (!enemyId || !(enemyId in records)) continue;

    const meta = session.meta as { outcome?: string } | null;
    const outcome = meta?.outcome;
    if (outcome === "victory") records[enemyId].wins += 1;
    else if (outcome === "defeat") records[enemyId].losses += 1;
  }

  return records;
}

export async function getPersonalBests(
  userId: string
): Promise<Record<number, number>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("game_sessions")
    .select("duration_seconds, words_written, meta")
    .eq("user_id", userId)
    .eq("mode", "race")
    .eq("completed", true);

  if (error || !data) return {};

  const bests: Record<number, number> = {};
  for (const session of data) {
    const dur = session.duration_seconds;
    if (dur === null) continue;
    const meta = session.meta as { sprint_words?: number } | null;
    const timedWords =
      typeof meta?.sprint_words === "number"
        ? meta.sprint_words
        : session.words_written;
    if (!bests[dur] || timedWords > bests[dur]) {
      bests[dur] = timedWords;
    }
  }
  return bests;
}
