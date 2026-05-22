"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Page } from "@/lib/types";

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// For each chapter: if a canonical page exists use only its word count,
// otherwise sum all pages. This prevents double-counting scene drafts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function recalculateProjectWordCount(supabase: any, projectId: string) {
  const { data: projectChapters } = await supabase
    .from("chapters")
    .select("id")
    .eq("project_id", projectId);

  if (!projectChapters?.length) {
    await supabase
      .from("projects")
      .update({ word_count: 0 })
      .eq("id", projectId);
    return;
  }

  const chapterIds = projectChapters.map((c: { id: string }) => c.id);

  const { data: allPages } = await supabase
    .from("pages")
    .select("chapter_id, word_count, is_canonical")
    .in("chapter_id", chapterIds);

  if (!allPages) return;

  let totalWords = 0;
  for (const chapId of chapterIds) {
    const chapterPages: Array<{
      chapter_id: string;
      word_count: number;
      is_canonical: boolean;
    }> = allPages.filter(
      (p: { chapter_id: string }) => p.chapter_id === chapId
    );
    const canonical = chapterPages.find((p) => p.is_canonical);
    if (canonical) {
      totalWords += canonical.word_count;
    } else {
      totalWords += chapterPages.reduce(
        (sum, p) => sum + (p.word_count ?? 0),
        0
      );
    }
  }

  await supabase
    .from("projects")
    .update({ word_count: totalWords })
    .eq("id", projectId);
}

export async function getPages(
  chapterId: string
): Promise<ActionResult<Page[]>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("pages")
    .select("*")
    .eq("chapter_id", chapterId)
    .order("position", { ascending: true });

  if (error) return { data: null, error: error.message };
  return { data: data ?? [], error: null };
}

export async function createPage(
  chapterId: string,
  title: string
): Promise<ActionResult<Page>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data: existing } = await supabase
    .from("pages")
    .select("position")
    .eq("chapter_id", chapterId)
    .order("position", { ascending: false })
    .limit(1);

  const position =
    existing && existing.length > 0 ? existing[0].position + 1 : 0;

  const { data, error } = await supabase
    .from("pages")
    .insert({
      chapter_id: chapterId,
      title: title.trim() || "Untitled",
      content: null,
      word_count: 0,
      position,
      is_canonical: false,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function updatePage(
  id: string,
  content: Record<string, unknown>,
  wordCount: number
): Promise<ActionResult<Page>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", user.id)
    .single();

  const tier = profileRow?.subscription_tier ?? "free";

  if (tier === "free") {
    const { data: currentPage } = await supabase
      .from("pages")
      .select("chapter_id, word_count")
      .eq("id", id)
      .single();

    if (currentPage) {
      const { data: chapter } = await supabase
        .from("chapters")
        .select("project_id")
        .eq("id", currentPage.chapter_id)
        .single();

      if (chapter) {
        const { data: projectChapters } = await supabase
          .from("chapters")
          .select("id")
          .eq("project_id", chapter.project_id);

        const chapterIds = (projectChapters ?? []).map((c: { id: string }) => c.id);

        if (chapterIds.length > 0) {
          const { data: allPages } = await supabase
            .from("pages")
            .select("id, word_count")
            .in("chapter_id", chapterIds);

          const totalExcludingCurrent = (allPages ?? [])
            .filter((p: { id: string }) => p.id !== id)
            .reduce((s: number, p: { word_count: number }) => s + (p.word_count ?? 0), 0);

          if (totalExcludingCurrent + wordCount > 20000) {
            return {
              data: null,
              error:
                "You've reached the 20,000 word limit. Upgrade to Scribe for unlimited writing.",
            };
          }
        }
      }
    }
  }

  const { data: page, error } = await supabase
    .from("pages")
    .update({
      content,
      word_count: wordCount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  await supabase
    .from("chapters")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", page.chapter_id);

  const { data: chapter } = await supabase
    .from("chapters")
    .select("project_id")
    .eq("id", page.chapter_id)
    .single();

  if (chapter) {
    await recalculateProjectWordCount(supabase, chapter.project_id);
    revalidatePath(`/projects/${chapter.project_id}`);
  }

  return { data: page, error: null };
}

export async function renamePage(
  id: string,
  title: string
): Promise<ActionResult<Page>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("pages")
    .update({
      title: title.trim() || "Untitled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function deletePage(
  id: string
): Promise<{ error: string | null }> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Not authenticated" };

  // Capture chapter/project info before deletion for word count recalculation
  const { data: page } = await supabase
    .from("pages")
    .select("chapter_id")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("pages").delete().eq("id", id);
  if (error) return { error: error.message };

  if (page) {
    const { data: chapter } = await supabase
      .from("chapters")
      .select("project_id")
      .eq("id", page.chapter_id)
      .single();

    if (chapter) {
      await recalculateProjectWordCount(supabase, chapter.project_id);
      revalidatePath(`/projects/${chapter.project_id}`);
    }
  }

  return { error: null };
}

export async function setCanonicalPage(
  pageId: string,
  chapterId: string
): Promise<{ error: string | null }> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Not authenticated" };

  // Clear all canonical flags in the chapter first (the DB trigger also enforces this)
  await supabase
    .from("pages")
    .update({ is_canonical: false })
    .eq("chapter_id", chapterId);

  const { error } = await supabase
    .from("pages")
    .update({ is_canonical: true })
    .eq("id", pageId);

  if (error) return { error: error.message };

  const { data: chapter } = await supabase
    .from("chapters")
    .select("project_id")
    .eq("id", chapterId)
    .single();

  if (chapter) {
    await recalculateProjectWordCount(supabase, chapter.project_id);
    revalidatePath(`/projects/${chapter.project_id}`);
  }

  return { error: null };
}

export async function clearCanonicalPage(
  chapterId: string
): Promise<{ error: string | null }> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("pages")
    .update({ is_canonical: false })
    .eq("chapter_id", chapterId);

  if (error) return { error: error.message };

  const { data: chapter } = await supabase
    .from("chapters")
    .select("project_id")
    .eq("id", chapterId)
    .single();

  if (chapter) {
    await recalculateProjectWordCount(supabase, chapter.project_id);
    revalidatePath(`/projects/${chapter.project_id}`);
  }

  return { error: null };
}
