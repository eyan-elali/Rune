"use server";

import { createClient } from "@/lib/supabase/server";
import { recalculateProjectWordCount } from "@/lib/projectWordCount";
import { resolveFreeWordLimit, type PricingCohort } from "@/lib/pricing";
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

/**
 * Canonical, server-authoritative free-tier word-limit check, shared by every
 * write path that can add words to a project's stored manuscript (editor
 * saves, offline sync, Arena "Save to Project", onboarding's first page).
 * Scribe subscribers (subscription_tier === 'scribe', the app's sole
 * canonical "is paid" test — see canAccessFeature in src/lib/subscription.ts)
 * are always unrestricted. Free users are limited per-project according to
 * their pricing_cohort (legacy_15k vs starter_2k, resolved from
 * user_pricing_entitlements — a missing row defensively defaults to the
 * tighter starter_2k rather than the more generous legacy_15k).
 *
 * excludePageId should be null when the page doesn't exist yet (a brand new
 * page being created), or the id of the page being replaced/appended to so
 * its own prior word count isn't double-counted.
 */
export async function checkFreeWordLimit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  projectId: string,
  excludePageId: string | null,
  candidateWordCount: number
): Promise<{ blocked: boolean; limit: number }> {
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", userId)
    .single();

  if ((profileRow?.subscription_tier ?? "free") !== "free") {
    return { blocked: false, limit: Infinity };
  }

  const { data: entitlement } = await supabase
    .from("user_pricing_entitlements")
    .select("pricing_cohort")
    .eq("user_id", userId)
    .maybeSingle();

  const cohort = (entitlement?.pricing_cohort as PricingCohort | undefined) ?? "starter_2k";
  const limit = resolveFreeWordLimit(cohort);

  const { data: projectChapters } = await supabase
    .from("chapters")
    .select("id")
    .eq("project_id", projectId);

  const chapterIds = (projectChapters ?? []).map((c: { id: string }) => c.id);
  if (chapterIds.length === 0) {
    return { blocked: candidateWordCount > limit, limit };
  }

  const { data: allPages } = await supabase
    .from("pages")
    .select("id, word_count")
    .in("chapter_id", chapterIds);

  const totalExcludingCurrent = (allPages ?? [])
    .filter((p: { id: string }) => p.id !== excludePageId)
    .reduce((s: number, p: { word_count: number }) => s + (p.word_count ?? 0), 0);

  return { blocked: totalExcludingCurrent + candidateWordCount > limit, limit };
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
        const { blocked } = await checkFreeWordLimit(
          supabase,
          user.id,
          chapter.project_id,
          id,
          wordCount
        );

        if (blocked) {
          return {
            data: null,
            error: "FREE_WORD_LIMIT_REACHED",
          };
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

export async function reorderPages(
  chapterId: string,
  orderedPageIds: string[]
): Promise<{ error: string | null }> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Not authenticated" };

  const results = await Promise.all(
    orderedPageIds.map((id, index) =>
      supabase
        .from("pages")
        .update({ position: index, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("chapter_id", chapterId) // guard against cross-chapter drift
    )
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) return { error: failed.error.message };

  return { error: null };
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
        const { blocked } = await checkFreeWordLimit(
          supabase,
          user.id,
          chapter.project_id,
          id,
          wordCount
        );

        if (blocked) {
          return { status: "word_limit_blocked" };
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
    const { error: analyticsError, code } = await recordAnalyticsEvent({
      userId: user.id,
      eventName: "first_save",
    });
    if (analyticsError) {
      // Safe diagnostic context only — never log manuscript content, page
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
