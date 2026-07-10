"use server";

import { createClient } from "@/lib/supabase/server";
import { recalculateProjectWordCount } from "@/lib/projectWordCount";
import { FREE_WORD_LIMIT } from "@/lib/subscription";
import { recordAnalyticsEvent } from "@/lib/actions/analytics";
import type { Page } from "@/lib/types";

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
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

    if (currentPage && wordCount > (currentPage.word_count ?? 0)) {
      // Only enforce limit when words are being added (not on edits or deletions)
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

          if (totalExcludingCurrent + wordCount > FREE_WORD_LIMIT) {
            return {
              data: null,
              error: "FREE_WORD_LIMIT_REACHED",
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
  }

  return { error: null };
}

/**
 * Server-side word limit check + version-guarded page update for the offline
 * sync path. Called instead of a raw Supabase update so that free-tier limits
 * are enforced even when the save originates from the offline queue.
 *
 * Returns a discriminated union so the caller can handle each case without
 * needing to inspect raw DB error codes.
 */
export async function syncPageWithLimitCheck(
  id: string,
  content: Record<string, unknown>,
  wordCount: number,
  serverVersion: number
): Promise<
  | { status: "ok"; updated_at: string; version: number }
  | { status: "word_limit_blocked" }
  | { status: "version_mismatch" }
  | { status: "error"; error: string }
> {
  const { supabase, user } = await getUser();
  if (!user) return { status: "error", error: "Not authenticated" };

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

    if (currentPage && wordCount > (currentPage.word_count ?? 0)) {
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

        const chapterIds = (projectChapters ?? []).map(
          (c: { id: string }) => c.id
        );

        if (chapterIds.length > 0) {
          const { data: allPages } = await supabase
            .from("pages")
            .select("id, word_count")
            .in("chapter_id", chapterIds);

          const totalExcludingCurrent = (allPages ?? [])
            .filter((p: { id: string }) => p.id !== id)
            .reduce(
              (s: number, p: { word_count: number }) =>
                s + (p.word_count ?? 0),
              0
            );

          if (totalExcludingCurrent + wordCount > FREE_WORD_LIMIT) {
            return { status: "word_limit_blocked" };
          }
        }
      }
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from("pages")
    .update({
      content,
      word_count: wordCount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("version", serverVersion)
    .select("id, updated_at, version");

  if (updateError) return { status: "error", error: updateError.message };
  if (!updated || updated.length === 0) return { status: "version_mismatch" };

  // Best-effort — analytics must never block a successful save from returning.
  // This is the authoritative persistence point for the live editor's autosave
  // path (both the immediate online save and the reconnect/flush-queue path
  // both call this function). No "was word_count previously 0" check is
  // needed: the event's dedupe key is scoped once-per-user, so only the very
  // first call that reaches this branch for a given user ever writes a row —
  // every later save is a no-op at the database level.
  try {
    const { error: analyticsError } = await recordAnalyticsEvent({
      userId: user.id,
      eventName: "first_save",
    });
    if (analyticsError) {
      console.error("[pages] recordAnalyticsEvent(first_save) failed:", analyticsError);
    }
  } catch (err) {
    console.error("[pages] first_save analytics threw:", err);
  }

  return {
    status: "ok",
    updated_at: (updated[0].updated_at as string) ?? new Date().toISOString(),
    version: updated[0].version as number,
  };
}

/**
 * Post-sync maintenance called after syncPendingWrite successfully persists a
 * page to Supabase. Mirrors what updatePage() does server-side: touches the
 * parent chapter's updated_at and runs the canonical-aware project word count
 * recalculation (which also revalidates the project and profile page caches).
 */
export async function afterPageSync(pageId: string): Promise<void> {
  const { supabase, user } = await getUser();
  if (!user) return;

  const { data: page } = await supabase
    .from("pages")
    .select("chapter_id")
    .eq("id", pageId)
    .single();

  if (!page) return;

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
  }
}
