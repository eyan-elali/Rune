import type { SupabaseClient } from "@supabase/supabase-js";

// The persistence rules shared by every Workspace object with a rich-text
// body — a Workspace Page (workspace_documents, 023) and a Collection Entry
// (workspace_collection_entries, 025). Both tables carry a database-owned
// `version` that is bumped on every content change and never by a rename, so
// one conditional update is the whole save. Server-side only (the caller
// passes its own authenticated client; RLS decides what it can reach). Never
// used for manuscript prose: Scenes save through save_scene_checked.

/** One content save. `conflict`: the object changed since `expectedVersion`; nothing was written. */
export type SaveContentResult =
  | { status: "ok"; version: number; updated_at: string }
  | { status: "conflict"; version: number }
  | { status: "not_found" }
  | { status: "error"; error: string };

export type VersionedContentTable = "workspace_documents" | "workspace_collection_entries";

export const MAX_TITLE = 200;
/** A generous ceiling on one object's stored JSON — far beyond any real notes document. */
export const MAX_CONTENT_BYTES = 5_000_000;

/** Normalises a title: blank = untitled (null); at most 200 characters. */
export function normalizeTitle(title: string | null | undefined): string | null {
  const trimmed = (title ?? "").trim().slice(0, MAX_TITLE).trim();
  return trimmed === "" ? null : trimmed;
}

export function isDoc(content: unknown): content is Record<string, unknown> {
  return (
    typeof content === "object" &&
    content !== null &&
    !Array.isArray(content) &&
    (content as { type?: unknown }).type === "doc"
  );
}

/**
 * Saves `content` if the row is still at `expectedVersion` — one statement, so
 * two windows saving from the same version cannot both win. On a mismatch
 * nothing is written and the current version is returned.
 */
export async function saveVersionedContent(
  supabase: SupabaseClient,
  table: VersionedContentTable,
  id: string,
  content: unknown,
  expectedVersion: number,
  tooLarge = "Too large to save"
): Promise<SaveContentResult> {
  if (!isDoc(content)) return { status: "error", error: "Invalid content" };
  if (!Number.isInteger(expectedVersion)) return { status: "error", error: "Invalid version" };
  if (JSON.stringify(content).length > MAX_CONTENT_BYTES) return { status: "error", error: tooLarge };

  const { data, error } = await supabase
    .from(table)
    .update({ content })
    .eq("id", id)
    .eq("version", expectedVersion)
    .select("version, updated_at")
    .maybeSingle();
  if (error) return { status: "error", error: error.message };
  if (data) return { status: "ok", version: data.version as number, updated_at: data.updated_at as string };

  const { data: current, error: readError } = await supabase.from(table).select("version").eq("id", id).maybeSingle();
  if (readError) return { status: "error", error: readError.message };
  if (!current) return { status: "not_found" };
  return { status: "conflict", version: current.version as number };
}

/** Renames a row; blank makes it untitled. Never changes its version or content. Null: not found. */
export async function renameVersioned(
  supabase: SupabaseClient,
  table: VersionedContentTable,
  id: string,
  title: string | null
): Promise<{ data: { title: string | null } | null; error: string | null }> {
  const { data, error } = await supabase
    .from(table)
    .update({ title: normalizeTitle(title) })
    .eq("id", id)
    .select("title")
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data: data ? { title: data.title as string | null } : null, error: null };
}
