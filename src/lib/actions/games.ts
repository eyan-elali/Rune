"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };

export async function createGameSession(
  mode: string,
  wordsWritten: number,
  durationSeconds: number,
  xpEarned: number,
  enemyType?: string
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
      ...(enemyType != null && enemyType !== ""
        ? { enemy_type: enemyType }
        : {}),
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

export async function getPersonalBests(
  userId: string
): Promise<Record<number, number>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("game_sessions")
    .select("duration_seconds, words_written")
    .eq("user_id", userId)
    .eq("mode", "race")
    .eq("completed", true);

  if (error || !data) return {};

  const bests: Record<number, number> = {};
  for (const session of data) {
    const dur = session.duration_seconds;
    if (dur === null) continue;
    if (!bests[dur] || session.words_written > bests[dur]) {
      bests[dur] = session.words_written;
    }
  }
  return bests;
}
