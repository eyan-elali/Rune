"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { checkFreeWordLimit } from "@/lib/actions/pages";

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };

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

  const { blocked, limit } = await checkFreeWordLimit(
    supabase,
    user.id,
    projectId,
    null,
    wordCount
  );
  if (blocked) {
    return {
      data: null,
      error: `This would put the project over your ${limit.toLocaleString()}-word free limit. Upgrade to Scribe to keep writing.`,
    };
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

  const { data: page, error: pageError } = await supabase
    .from("pages")
    .insert({ chapter_id: chapterId, title, content, word_count: wordCount, position })
    .select("id")
    .single();

  if (pageError) return { data: null, error: pageError.message };

  // Update project word count
  const { data: allChapters } = await supabase
    .from("chapters")
    .select("id")
    .eq("project_id", projectId);

  if (allChapters) {
    const chapterIds = allChapters.map((c) => c.id);
    const { data: allPages } = await supabase
      .from("pages")
      .select("word_count")
      .in("chapter_id", chapterIds);

    const totalWords = allPages?.reduce((sum, p) => sum + (p.word_count ?? 0), 0) ?? 0;
    await supabase.from("projects").update({ word_count: totalWords }).eq("id", projectId);
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/chapters/${chapterId}`);

  return { data: page as { id: string }, error: null };
}

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

  const { data: existingChapter } = await supabase
    .from("chapters")
    .select("project_id")
    .eq("id", page.chapter_id)
    .single();

  const newWordCount = (page.word_count ?? 0) + additionalWordCount;

  if (existingChapter) {
    const { blocked, limit } = await checkFreeWordLimit(
      supabase,
      user.id,
      existingChapter.project_id,
      pageId,
      newWordCount
    );
    if (blocked) {
      return {
        data: null,
        error: `This would put the project over your ${limit.toLocaleString()}-word free limit. Upgrade to Scribe to keep writing.`,
      };
    }
  }

  const newDoc = htmlToTiptapDoc(html);
  const existingNodes =
    (page.content as { type: string; content?: unknown[] } | null)?.content ?? [];
  const newNodes = (newDoc.content as unknown[]) ?? [];

  const mergedContent = {
    type: "doc",
    content: [...existingNodes, { type: "horizontalRule" }, ...newNodes],
  };

  const { data: updated, error: updateError } = await supabase
    .from("pages")
    .update({
      content: mergedContent,
      word_count: newWordCount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", pageId)
    .select("id, chapter_id")
    .single();

  if (updateError) return { data: null, error: updateError.message };

  const { data: chapter } = await supabase
    .from("chapters")
    .select("project_id")
    .eq("id", updated.chapter_id)
    .single();

  if (chapter) {
    const { data: allChapters } = await supabase
      .from("chapters")
      .select("id")
      .eq("project_id", chapter.project_id);

    if (allChapters) {
      const chapterIds = allChapters.map((c: { id: string }) => c.id);
      const { data: allPages } = await supabase
        .from("pages")
        .select("word_count")
        .in("chapter_id", chapterIds);

      const totalWords =
        allPages?.reduce(
          (sum: number, p: { word_count: number }) => sum + (p.word_count ?? 0),
          0
        ) ?? 0;

      await supabase
        .from("projects")
        .update({ word_count: totalWords })
        .eq("id", chapter.project_id);
    }

    revalidatePath(`/projects/${chapter.project_id}`);
    revalidatePath(
      `/projects/${chapter.project_id}/chapters/${updated.chapter_id}`
    );
  }

  return { data: { id: updated.id }, error: null };
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
