"use server";

// Rune 2.0 onboarding's server side (Beta Completion E). The account's one
// journey is recorded in account_onboarding (migration 052) and changes only
// through its owner-scoped functions; the Project it makes comes from the one
// authoritative creation path (create_project_checked) or from Manuscript
// Import (whose route attaches its Project, see api/manuscript-import).
//
// A "new" Project is created with the journey's own request id, so a retry,
// a double click or a refresh mid-request returns the same Project instead of
// creating a second; once attached, asking again renames it at most. Nothing
// here records a title, a file or any words in analytics.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordAnalyticsEvent } from "@/lib/actions/analytics";
import { createProjectChecked, PROJECT_TITLE_MAX } from "@/lib/projectCreation";
import { readOnboardingRow, type OnboardingPath } from "@/lib/onboarding";

type Result<T> = { data: T; error: null } | { data: null; error: string };

async function safeRecord(input: Parameters<typeof recordAnalyticsEvent>[0]) {
  try {
    await recordAnalyticsEvent(input);
  } catch {
    // Analytics never blocks onboarding.
  }
}

async function session() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** The Welcome's Continue: the journey has begun (idempotent). */
export async function beginOnboarding(): Promise<Result<true>> {
  const { supabase, user } = await session();
  if (!user) return { data: null, error: "You’re signed out. Sign in again to continue." };
  const { error } = await supabase.rpc("onboarding_begin");
  if (error) return { data: null, error: "Something went wrong. Please try again." };
  return { data: true, error: null };
}

/** "How are you starting?" — new or import. Unchangeable once a Project exists. */
export async function chooseOnboardingPath(path: OnboardingPath): Promise<Result<OnboardingPath>> {
  if (path !== "new" && path !== "import") return { data: null, error: "Unknown choice." };
  const { supabase, user } = await session();
  if (!user) return { data: null, error: "You’re signed out. Sign in again to continue." };
  const { data, error } = await supabase.rpc("onboarding_choose_path", { p_path: path });
  if (error) return { data: null, error: "Something went wrong. Please try again." };
  const row = readOnboardingRow(data);
  if (row?.path === path && row.project_id === null) {
    await safeRecord({ userId: user.id, eventName: path === "new" ? "onboarding_path_new" : "onboarding_path_import" });
  }
  return { data: row?.path ?? path, error: null };
}

/**
 * "What are you working on?" — the journey's new Project, made once:
 * Project → Manuscript → Chapter 1 → its first Scene, in one transaction.
 */
export async function createOnboardingProject(rawTitle: string): Promise<Result<{ projectId: string; title: string }>> {
  const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
  if (!title) return { data: null, error: "Give it a working title — you can change it anytime." };
  if (title.length > PROJECT_TITLE_MAX) return { data: null, error: `A title can be up to ${PROJECT_TITLE_MAX} characters.` };

  const { supabase, user } = await session();
  if (!user) return { data: null, error: "You’re signed out. Sign in again to continue." };

  const begun = await supabase.rpc("onboarding_choose_path", { p_path: "new" });
  if (begun.error) return { data: null, error: "Something went wrong. Please try again." };
  const { data: stateRow } = await supabase
    .from("account_onboarding")
    .select("path, project_id, request_id, completed_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!stateRow) return { data: null, error: "Something went wrong. Please try again." };

  // Already made (a retry): the same Project, renamed if the writer changed the title.
  if (stateRow.project_id) {
    const { data: existing } = await supabase
      .from("projects")
      .select("id, title")
      .eq("id", stateRow.project_id)
      .maybeSingle();
    if (existing) {
      if (existing.title !== title) {
        const { error } = await supabase.from("projects").update({ title }).eq("id", existing.id);
        if (error) return { data: { projectId: existing.id as string, title: existing.title as string }, error: null };
      }
      return { data: { projectId: existing.id as string, title }, error: null };
    }
  }

  const created = await createProjectChecked(supabase, { title, requestId: stateRow.request_id as string });
  if (created.status !== "ok") {
    return { data: null, error: /closed beta|pen name/i.test(created.error) ? created.error : "Your project couldn’t be created. Please try again." };
  }
  const attached = await supabase.rpc("onboarding_attach_project", { p_project: created.project.id });
  if (attached.error) console.error("[onboarding] attach failed:", attached.error.message);

  if (created.created) {
    await safeRecord({ userId: user.id, eventName: "project_created", projectId: created.project.id, dedupeKey: created.project.id });
  }
  revalidatePath("/projects");
  return { data: { projectId: created.project.id, title: created.project.title }, error: null };
}

/**
 * Arrival's "Open …": the journey is complete (once, for the account) and
 * where its Project opens — for a new Project, Chapter 1's first Scene, ready
 * for writing; for an import, the Manuscript.
 */
export async function completeOnboarding(): Promise<Result<{ href: string }>> {
  const { supabase, user } = await session();
  if (!user) return { data: null, error: "You’re signed out. Sign in again to continue." };

  const { data: before } = await supabase
    .from("account_onboarding")
    .select("path, project_id, completed_at")
    .eq("user_id", user.id)
    .maybeSingle();
  const { data, error } = await supabase.rpc("onboarding_complete");
  if (error) return { data: null, error: "Something went wrong. Please try again." };
  const row = readOnboardingRow(data);

  if (!before?.completed_at) {
    await safeRecord({
      userId: user.id,
      eventName: "onboarding_completed",
      projectId: row?.project_id ?? null,
      metadata: { path: row?.path ?? null },
    });
  }

  const projectId = row?.project_id ?? null;
  if (!projectId) return { data: { href: "/projects" }, error: null };
  const href = `/projects/${projectId}`;
  if (row?.path !== "new") return { data: { href }, error: null };

  const sceneId = await firstSceneOf(supabase, projectId);
  return { data: { href: sceneId ? `${href}?open=${sceneId}` : href }, error: null };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function firstSceneOf(supabase: any, projectId: string): Promise<string | null> {
  const { data: manuscript } = await supabase.from("manuscripts").select("id").eq("project_id", projectId).maybeSingle();
  if (!manuscript) return null;
  const { data: chapter } = await supabase
    .from("chapters")
    .select("id")
    .eq("manuscript_id", manuscript.id)
    .is("group_id", null)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!chapter) return null;
  const { data: scene } = await supabase
    .from("scenes")
    .select("id")
    .eq("chapter_id", chapter.id)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (scene?.id as string | undefined) ?? null;
}

/**
 * A Project's shell opened: recorded once per account (first_project_opened),
 * never again — the analytics write deduplicates. Fire-and-forget from the
 * shell, at most once per page load.
 */
export async function recordProjectOpened(projectId: string): Promise<void> {
  if (typeof projectId !== "string" || !/^[0-9a-f-]{36}$/i.test(projectId)) return;
  const { user } = await session();
  if (!user) return;
  await safeRecord({ userId: user.id, eventName: "first_project_opened", projectId });
}
