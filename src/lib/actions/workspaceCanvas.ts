"use server";

import { createClient } from "@/lib/supabase/server";
import type { CanvasConnection, CanvasItem, WorkspaceAttachment, WorkspaceCanvas } from "@/lib/types";
import { attachmentIdOf, previewText } from "@/lib/rune2/canvas";
import type { CanvasChange, CanvasWriteOutcome, CanvasWriteResult } from "@/lib/rune2/canvasSession";
import { normalizeTitle } from "@/lib/rune2/versionedContent";

// Workspace Canvases (migration 045): a Canvas is a Workspace object — it
// belongs to its Project, has one place in the Workspace tree (created with
// it, moved like any other item by moveWorkspaceNode) and goes to Trash like
// a Page (actions/workspaceTrash.ts). Its items are placements of the book's
// real pieces and Canvas-local notes: every write to them is one batch to one
// Canvas (write_canvas_items), versioned and idempotent, so a stale window
// never silently overwrites a newer arrangement and a retried batch never
// duplicates a placement. Sections (placements of type 'section' with
// explicit membership) and connections between placements (migration 046)
// travel in the same batch. Nothing here touches the manuscript, the Scene save
// path, writing credits, Pages or Entries: a Canvas shows them, it never
// changes them.

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };
type RpcResult<T> = ({ status: "ok" } & T) | { status: "error"; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A generous ceiling on one batch's JSON. */
const MAX_BATCH_BYTES = 2_000_000;

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/**
 * Creates an empty Canvas at the end of `parentNodeId` (a Folder's Workspace
 * node; null = the Workspace's top level). The Canvas and its place in the
 * tree are created together.
 */
export async function createWorkspaceCanvas(
  projectId: string,
  title: string | null = null,
  parentNodeId: string | null = null
): Promise<ActionResult<{ canvas: WorkspaceCanvas; nodeId: string }>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase.rpc("create_workspace_canvas", {
    p_project_id: projectId,
    p_parent_node_id: parentNodeId,
    p_title: normalizeTitle(title),
  });
  if (error) return { data: null, error: error.message };
  const result = data as RpcResult<{ canvas: WorkspaceCanvas; node_id: string }>;
  if (result.status !== "ok") return { data: null, error: result.error };
  return { data: { canvas: result.canvas, nodeId: result.node_id }, error: null };
}

/** Renames a Canvas; blank makes it untitled. Its items are untouched. */
export async function renameWorkspaceCanvas(
  canvasId: string,
  title: string | null
): Promise<ActionResult<{ title: string | null }>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("workspace_canvases")
    .update({ title: normalizeTitle(title) })
    .eq("id", canvasId)
    .select("title")
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: "Canvas not found" };
  return { data: { title: data.title as string | null }, error: null };
}

/**
 * A Canvas, every placement on it, every connection between them and the
 * attachments its images show (RLS: the writer's own, active Canvases only).
 * Before migration 046 there are no connections, before 047 no attachments:
 * empty lists, and the Canvas still opens.
 */
export async function getWorkspaceCanvas(
  canvasId: string
): Promise<ActionResult<{ canvas: WorkspaceCanvas; items: CanvasItem[]; connections: CanvasConnection[]; attachments: WorkspaceAttachment[] }>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };
  if (!UUID.test(canvasId)) return { data: null, error: "Canvas not found" };

  const [canvasRead, itemsRead, connectionsRead] = await Promise.all([
    supabase.from("workspace_canvases").select("*").eq("id", canvasId).maybeSingle(),
    supabase.from("workspace_canvas_items").select("*").eq("canvas_id", canvasId),
    supabase.from("workspace_canvas_connections").select("*").eq("canvas_id", canvasId),
  ]);
  if (canvasRead.error) return { data: null, error: canvasRead.error.message };
  if (!canvasRead.data) return { data: null, error: "Canvas not found" };
  if (itemsRead.error) return { data: null, error: itemsRead.error.message };
  if (connectionsRead.error) console.error(`[rune2] Could not load canvas connections: ${connectionsRead.error.message}`);
  const items = (itemsRead.data ?? []) as CanvasItem[];
  const attachmentIds = [...new Set(items.map(attachmentIdOf).filter((id): id is string => Boolean(id)))];
  let attachments: WorkspaceAttachment[] = [];
  if (attachmentIds.length > 0) {
    const read = await supabase.from("workspace_attachments").select("*").in("id", attachmentIds);
    if (read.error) console.error(`[rune2] Could not load canvas attachments: ${read.error.message}`);
    else attachments = (read.data ?? []) as WorkspaceAttachment[];
  }
  return {
    data: {
      canvas: canvasRead.data as WorkspaceCanvas,
      items,
      connections: connectionsRead.error ? [] : ((connectionsRead.data ?? []) as CanvasConnection[]),
      attachments,
    },
    error: null,
  };
}

export type ConvertCanvasNoteResult =
  | { status: "ok"; target: "page" | "scene"; objectId: string; item: CanvasItem; connections: CanvasConnection[] }
  | { status: "unsupported" }
  | { status: "error"; error: string };

/**
 * A Canvas note becomes a Workspace Page or an Unplaced Scene
 * (convert_canvas_note, migration 048): one transaction that creates the
 * object from the note's text, deletes the note placement and makes a live
 * placement of the new object with the same geometry and connections.
 * `content` is the note's document as the window shows it; `wordCount` the
 * editor's count of it (a Scene's stored count). `newItemId` is the
 * client's, so a retry after a lost reply is answered with the placement
 * already made. No writing session, no Today words: a promotion isn't
 * writing. "unsupported": the database lacks 048 — nothing changed.
 */
export async function convertCanvasNote(
  itemId: string,
  target: "page" | "scene",
  newItemId: string,
  title: string | null,
  content: Record<string, unknown>,
  wordCount: number
): Promise<ConvertCanvasNoteResult> {
  const { supabase, user } = await getUser();
  if (!user) return { status: "error", error: "Not authenticated" };
  if (!UUID.test(itemId) || !UUID.test(newItemId)) return { status: "error", error: "Note not found" };
  if (target !== "page" && target !== "scene") return { status: "error", error: "Unknown target" };
  const { data, error } = await supabase.rpc("convert_canvas_note", {
    p_item_id: itemId,
    p_target: target,
    p_new_item_id: newItemId,
    p_title: normalizeTitle(title),
    p_content: content,
    p_word_count: Math.max(0, Math.round(wordCount)),
  });
  if (error) {
    if (/convert_canvas_note|does not exist|PGRST202|schema cache/i.test(error.message)) return { status: "unsupported" };
    return { status: "error", error: error.message };
  }
  const result = data as
    | { status: "ok"; target: "page" | "scene"; object_id: string; item: CanvasItem; connections: CanvasConnection[] }
    | { status: "error"; error: string };
  if (result.status !== "ok") return { status: "error", error: result.error };
  return { status: "ok", target: result.target, objectId: result.object_id, item: result.item, connections: result.connections ?? [] };
}

/**
 * One batch of changes to one Canvas's items (see lib/rune2/canvasSession.ts
 * for the shapes). Per-change results; a Canvas in Trash or not the writer's
 * fails the whole batch with nothing written.
 */
export async function writeCanvasItems(canvasId: string, changes: CanvasChange[]): Promise<CanvasWriteOutcome> {
  const { supabase, user } = await getUser();
  if (!user) return { status: "error", error: "Not authenticated" };
  if (!UUID.test(canvasId)) return { status: "not_found" };
  if (!Array.isArray(changes)) return { status: "error", error: "Invalid changes" };
  if (changes.length === 0) return { status: "ok", results: [] };
  if (JSON.stringify(changes).length > MAX_BATCH_BYTES) return { status: "error", error: "Too much to save at once" };

  const { data, error } = await supabase.rpc("write_canvas_items", { p_canvas_id: canvasId, p_changes: changes });
  if (error) return { status: "error", error: error.message };
  const result = data as RpcResult<{ results: CanvasWriteResult[] }>;
  if (result.status !== "ok") {
    if (result.error === "This canvas is in Trash") return { status: "trashed" };
    if (result.error === "Canvas not found") {
      // Hidden by RLS: in Trash (trashed elsewhere), or gone.
      const { data: state } = await supabase.rpc("workspace_trash_state", { p_type: "canvas", p_id: canvasId });
      return (state as { state?: string } | null)?.state === "trashed" ? { status: "trashed" } : { status: "not_found" };
    }
    return { status: "error", error: result.error };
  }
  return { status: "ok", results: result.results };
}

/**
 * A restrained text preview of a Scene's, Page's or Entry's current content
 * for its Canvas card — read under the writer's own RLS, cut short, never
 * stored. Empty when the object has no text or isn't reachable.
 */
export async function getCanvasPreview(
  type: "scene" | "page" | "entry",
  id: string
): Promise<ActionResult<{ text: string }>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };
  if (!UUID.test(id)) return { data: { text: "" }, error: null };
  const table = type === "scene" ? "scenes" : type === "page" ? "workspace_documents" : "workspace_collection_entries";
  const { data, error } = await supabase.from(table).select("content").eq("id", id).maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data: { text: data ? previewText(data.content) : "" }, error: null };
}
