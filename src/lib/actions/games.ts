"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recalculateProjectWordCount } from "@/lib/projectWordCount";

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };

type SavePageCheckedResult =
  | { status: "ok"; updated_at: string; version: number }
  | { status: "word_limit_blocked"; limit: number }
  | { status: "version_mismatch" }
  | { status: "error"; error: string };

type InsertPageCheckedResult =
  | { status: "ok"; id: string }
  | { status: "word_limit_blocked"; limit: number }
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
 * Creates a new "Sprint" page from an Arena session and saves it, subject to
 * the account-wide free-word limit. Delegates the check-and-insert to
 * insert_page_checked() (migration 011) — a single atomic database function,
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
  const { data: chapter, error: chapterError } = await supabase
    .from("chapters")
    .select("id")
    .eq("id", chapterId)
    .eq("project_id", projectId)
    .single();

  if (chapterError || !chapter) {
    return { data: null, error: "Chapter not found in this project" };
  }

  // Find next position
  const { data: existing } = await supabase
    .from("pages")
    .select("position")
    .eq("chapter_id", chapterId)
    .order("position", { ascending: false })
    .limit(1);

  const position = existing && existing.length > 0 ? existing[0].position + 1 : 0;

  const now = new Date();
  const title = `Sprint: ${now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })} ${now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;

  const content = htmlToTiptapDoc(html);

  const { data, error } = await supabase.rpc("insert_page_checked", {
    p_chapter_id: chapterId,
    p_title: title,
    p_content: content,
    p_word_count: wordCount,
    p_position: position,
  });

  if (error) return { data: null, error: error.message };

  const result = data as InsertPageCheckedResult;

  if (result.status === "word_limit_blocked") {
    return {
      data: null,
      error: `This would put you over your ${result.limit.toLocaleString()}-word free limit. Upgrade to Scribe to keep writing.`,
    };
  }
  if (result.status === "error") return { data: null, error: result.error };

  // Canonical-aware recalculation — the new sprint page may not be the
  // canonical page for its chapter, in which case it must not count toward
  // the project total any more than any other non-canonical draft would.
  await recalculateProjectWordCount(supabase, projectId);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/chapters/${chapterId}`);

  return { data: { id: result.id }, error: null };
}

/**
 * Appends an Arena session's words onto an existing page, subject to the
 * account-wide free-word limit. Delegates the check-and-update to
 * save_page_checked() (migration 011) — the same atomic function the
 * editor's autosave path uses, so this can't race a concurrent editor save
 * (or another Arena save) and jointly exceed the limit.
 */
export async function appendToExistingPage(
  pageId: string,
  html: string,
  additionalWordCount: number
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data: page, error: fetchError } = await supabase
    .from("pages")
    .select("id, content, word_count, chapter_id")
    .eq("id", pageId)
    .single();

  if (fetchError || !page) return { data: null, error: "Page not found" };

  const newWordCount = (page.word_count ?? 0) + additionalWordCount;

  const newDoc = htmlToTiptapDoc(html);
  const existingNodes =
    (page.content as { type: string; content?: unknown[] } | null)?.content ?? [];
  const newNodes = (newDoc.content as unknown[]) ?? [];

  const mergedContent = {
    type: "doc",
    content: [...existingNodes, { type: "horizontalRule" }, ...newNodes],
  };

  const { data, error } = await supabase.rpc("save_page_checked", {
    p_page_id: pageId,
    p_content: mergedContent,
    p_word_count: newWordCount,
    p_expected_version: null,
  });

  if (error) return { data: null, error: error.message };

  const result = data as SavePageCheckedResult;

  if (result.status === "word_limit_blocked") {
    return {
      data: null,
      error: `This would put you over your ${result.limit.toLocaleString()}-word free limit. Upgrade to Scribe to keep writing.`,
    };
  }
  if (result.status === "version_mismatch") {
    return { data: null, error: "This page changed elsewhere. Please try again." };
  }
  if (result.status === "error") return { data: null, error: result.error };

  const { data: chapter } = await supabase
    .from("chapters")
    .select("project_id")
    .eq("id", page.chapter_id)
    .single();

  if (chapter) {
    // Canonical-aware recalculation — appending to a non-canonical page must
    // not count toward the project total any more than any other
    // non-canonical draft would.
    await recalculateProjectWordCount(supabase, chapter.project_id);

    revalidatePath(`/projects/${chapter.project_id}`);
    revalidatePath(`/projects/${chapter.project_id}/chapters/${page.chapter_id}`);
  }

  return { data: { id: pageId }, error: null };
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
