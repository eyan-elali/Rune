"use server";

import { createClient } from "@/lib/supabase/server";
import type { WorkspacePage } from "@/lib/types";

// Workspace Pages (migration 023, table workspace_documents): freeform
// supporting documents that belong to one Project. Deliberately apart from the
// Scene actions: a Page is not manuscript prose, so nothing here touches the
// Scene save path, the free-word allowance, writing credits or XP.
//
// Plain reads and writes under RLS (a writer reaches only their own
// Projects' Pages). The database owns `version` (bumped on every content
// change, never on a rename) and the timestamps. There is no delete yet:
// Rune 2.0 deletion is recoverable (Trash), and Trash does not exist.

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };

/** One content save. `conflict`: the Page changed since `expectedVersion`; nothing was written. */
export type SaveWorkspacePageResult =
  | { status: "ok"; version: number; updated_at: string }
  | { status: "conflict"; version: number }
  | { status: "not_found" }
  | { status: "error"; error: string };

const MAX_TITLE = 200;
/** A generous ceiling on one Page's stored JSON — far beyond any real notes document. */
const MAX_CONTENT_BYTES = 5_000_000;

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Normalises a title: blank = untitled (null); at most 200 characters. */
function pageTitle(title: string | null | undefined): string | null {
  const trimmed = (title ?? "").trim().slice(0, MAX_TITLE).trim();
  return trimmed === "" ? null : trimmed;
}

function isDoc(content: unknown): content is Record<string, unknown> {
  return (
    typeof content === "object" &&
    content !== null &&
    !Array.isArray(content) &&
    (content as { type?: unknown }).type === "doc"
  );
}

/** Creates an empty Page in a Project the writer owns. */
export async function createWorkspacePage(
  projectId: string,
  title: string | null = null
): Promise<ActionResult<WorkspacePage>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("workspace_documents")
    .insert({ project_id: projectId, title: pageTitle(title) })
    .select("*")
    .single();
  // RLS refuses another writer's (or a missing) Project.
  if (error) return { data: null, error: error.message };
  return { data: data as WorkspacePage, error: null };
}

export async function getWorkspacePage(pageId: string): Promise<ActionResult<WorkspacePage>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase.from("workspace_documents").select("*").eq("id", pageId).maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: "Page not found" };
  return { data: data as WorkspacePage, error: null };
}

/**
 * Saves a Page's content if it is still at `expectedVersion` — one statement,
 * so two windows saving from the same version cannot both win. On a mismatch
 * nothing is written and the current version is returned.
 */
export async function saveWorkspacePageContent(
  pageId: string,
  content: Record<string, unknown>,
  expectedVersion: number
): Promise<SaveWorkspacePageResult> {
  const { supabase, user } = await getUser();
  if (!user) return { status: "error", error: "Not authenticated" };
  if (!isDoc(content)) return { status: "error", error: "Invalid content" };
  if (!Number.isInteger(expectedVersion)) return { status: "error", error: "Invalid version" };
  if (JSON.stringify(content).length > MAX_CONTENT_BYTES) return { status: "error", error: "Page is too large" };

  const { data, error } = await supabase
    .from("workspace_documents")
    .update({ content })
    .eq("id", pageId)
    .eq("version", expectedVersion)
    .select("version, updated_at")
    .maybeSingle();
  if (error) return { status: "error", error: error.message };
  if (data) return { status: "ok", version: data.version as number, updated_at: data.updated_at as string };

  const { data: current, error: readError } = await supabase
    .from("workspace_documents")
    .select("version")
    .eq("id", pageId)
    .maybeSingle();
  if (readError) return { status: "error", error: readError.message };
  if (!current) return { status: "not_found" };
  return { status: "conflict", version: current.version as number };
}

/** Renames a Page; blank makes it untitled. Never changes its version or content. */
export async function renameWorkspacePage(
  pageId: string,
  title: string | null
): Promise<ActionResult<{ title: string | null }>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const next = pageTitle(title);
  const { data, error } = await supabase
    .from("workspace_documents")
    .update({ title: next })
    .eq("id", pageId)
    .select("title")
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: "Page not found" };
  return { data: { title: data.title as string | null }, error: null };
}
