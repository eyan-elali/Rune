"use server";

import { createClient } from "@/lib/supabase/server";
import { recalculateProjectWordCount } from "@/lib/projectWordCount";
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
 * Account-wide, server-authoritative manuscript word count for the signed-in
 * user — canonical-aware (mirrors calculateProjectWordCount in
 * src/lib/manuscript.ts) and summed across every project they own, backed by
 * the account_word_total() database function (see migration 011). Returns 0
 * for Scribe subscribers without querying pages/chapters at all, since the
 * value is meaningless once the account is unrestricted.
 *
 * This is a display/UX value only — safe to call directly from client
 * components for the editor's remaining-words estimate. The actual limit is
 * enforced server-side, atomically, by save_page_checked/insert_page_checked
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

type SavePageCheckedResult =
  | { status: "ok"; updated_at: string; version: number }
  | { status: "word_limit_blocked"; limit: number }
  | { status: "version_mismatch" }
  | { status: "error"; error: string };

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
 * Server-side word limit check + version-guarded page update for the live
 * editor's autosave path (both the immediate online save and the
 * reconnect/flush-queue path call this). Delegates the check-and-write to
 * save_page_checked() (migration 011), a single atomic database function —
 * the limit check and the page update used to be two separate round trips
 * here, which let two concurrent saves on different pages read the same
 * "remaining" figure and jointly exceed the account-wide limit. The
 * database function closes that race with a per-account advisory lock.
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

  const { data, error } = await supabase.rpc("save_page_checked", {
    p_page_id: id,
    p_content: content,
    p_word_count: wordCount,
    p_expected_version: serverVersion,
  });

  if (error) return { status: "error", error: error.message };

  const result = data as SavePageCheckedResult;

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
    updated_at: result.updated_at,
    version: result.version,
  };
}

/**
 * Post-sync maintenance called after syncPendingWrite successfully persists a
 * page to Supabase. Touches the parent chapter's updated_at and runs the
 * canonical-aware project word count recalculation (which also revalidates
 * the project and profile page caches). This is purely for the *display*
 * total (projects.word_count) — unrelated to the account-wide enforcement
 * above, which is always computed live from pages/chapters, never from this
 * denormalized column.
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
