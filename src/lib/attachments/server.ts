import type { WorkspaceAttachment } from "@/lib/types";
import { ATTACHMENT_BUCKET, ATTACHMENT_GRACE_HOURS, cleanFileName, imageUploadProblem, storageKeyFor } from "@/lib/rune2/attachments";
import { carryOutStoragePurge, type StoragePurge } from "@/lib/projectLifecycle";

// Project attachments on the server (Milestone 22C, migration 047): storing
// an upload's bytes, registering them as the Project's attachment, serving
// them back to their owner, and sweeping what nothing references any more.
//
// Two authorities, deliberately apart:
//   * the DATABASE row (workspace_attachments) is read and written as the
//     signed-in writer — the row is registered through an owner-checked
//     function and read under RLS, so a writer can only ever reach their own
//     Project's attachments;
//   * the BYTES live in a private bucket the browser never addresses. The
//     server reads and writes them through `AttachmentStorage` (in
//     production: the platform's object storage with the service role —
//     storage.ts), always after the row check above.
// The storage boundary is an interface so the whole flow is tested against a
// real database with an in-memory store.
//
// Lifecycle: bytes are stored first, then the row; a registration that fails
// removes the bytes again (never a stray object). Deletion is the reverse
// and only for rows nothing references, after the grace period: the ROW
// first — delete_workspace_attachments (migration 050) deletes, under the
// Project's Workspace lock, only the rows still unreferenced and records
// their storage keys as a purge in the same transaction — then the bytes,
// and then the purge record. Bytes are never removed while a row references
// them, and a row never outlives its bytes: a purge whose bytes cannot be
// removed stays recorded and is retried by sweepProjectStoragePurges.
// Nothing here is reachable from a Canvas placement's deletion.

export type StoredBytes = { bytes: Uint8Array; contentType: string };

export interface AttachmentStorage {
  upload(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  download(key: string): Promise<StoredBytes | null>;
  remove(keys: readonly string[]): Promise<void>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export type ImageUpload = {
  projectId: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  width: number;
  height: number;
  /** A browser-sized derivative of a large image, made by the client. */
  display?: { bytes: Uint8Array; mimeType: string; width: number; height: number } | null;
};

export type StoreResult = { data: WorkspaceAttachment; error: null } | { data: null; error: string; status: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Stores an image upload as an attachment of the writer's Project: the
 * original (and its display derivative), then the row. The id is made here
 * so the storage key carries it.
 */
export async function storeImageAttachment(
  supabase: SupabaseLike,
  storage: AttachmentStorage,
  upload: ImageUpload,
  newId: () => string = () => globalThis.crypto.randomUUID()
): Promise<StoreResult> {
  if (!UUID.test(upload.projectId)) return { data: null, error: "Project not found", status: 404 };
  const problem = imageUploadProblem({ type: upload.mimeType, size: upload.bytes.byteLength });
  if (problem) return { data: null, error: problem, status: 415 };
  if (!(upload.width > 0 && upload.height > 0)) return { data: null, error: "That image couldn’t be read.", status: 422 };
  const display = upload.display ?? null;
  if (display && !(display.width > 0 && display.height > 0 && display.bytes.byteLength > 0)) {
    return { data: null, error: "That image couldn’t be read.", status: 422 };
  }

  const id = newId();
  const key = storageKeyFor(upload.projectId, id, "original", upload.mimeType);
  const displayKey = display ? storageKeyFor(upload.projectId, id, "display", display.mimeType) : null;
  const stored: string[] = [];
  try {
    await storage.upload(key, upload.bytes, upload.mimeType);
    stored.push(key);
    if (display && displayKey) {
      await storage.upload(displayKey, display.bytes, display.mimeType);
      stored.push(displayKey);
    }
  } catch (e) {
    await storage.remove(stored).catch(() => undefined);
    return { data: null, error: e instanceof Error ? e.message : "The image couldn’t be stored.", status: 502 };
  }

  const { data, error } = await supabase.rpc("create_workspace_attachment", {
    p_id: id,
    p_project_id: upload.projectId,
    p_kind: "image",
    p_file_name: cleanFileName(upload.fileName),
    p_mime_type: upload.mimeType,
    p_byte_size: upload.bytes.byteLength,
    p_width: Math.round(upload.width),
    p_height: Math.round(upload.height),
    p_storage_bucket: ATTACHMENT_BUCKET,
    p_storage_key: key,
    p_display_key: displayKey,
    p_display_width: display ? Math.round(display.width) : null,
    p_display_height: display ? Math.round(display.height) : null,
  });
  const result = data as { status: "ok"; attachment: WorkspaceAttachment } | { status: "error"; error: string } | null;
  if (error || !result || result.status !== "ok") {
    // No row: the bytes must not stay behind.
    await storage.remove(stored).catch(() => undefined);
    const message = error?.message ?? (result && result.status === "error" ? result.error : "The image couldn’t be registered.");
    const missing = /create_workspace_attachment|does not exist|PGRST202|schema cache/i.test(message);
    return {
      data: null,
      error: missing ? "Images need a database update that isn’t in place yet." : message,
      status: missing ? 501 : /not found/i.test(message) ? 404 : 422,
    };
  }
  return { data: result.attachment, error: null };
}

/**
 * An attachment's bytes for the signed-in writer — the row under RLS first
 * (so another writer's id is simply not found), then the bytes. `variant`
 * "display" falls back to the original when there is no derivative.
 */
export async function readAttachment(
  supabase: SupabaseLike,
  storage: AttachmentStorage,
  id: string,
  variant: "original" | "display"
): Promise<(StoredBytes & { fileName: string; attachment: WorkspaceAttachment }) | null> {
  if (!UUID.test(id)) return null;
  const { data, error } = await supabase.from("workspace_attachments").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  const a = data as WorkspaceAttachment;
  const key = variant === "display" && a.display_key ? a.display_key : a.storage_key;
  const stored = await storage.download(key);
  if (!stored) return null;
  return { ...stored, contentType: stored.contentType || a.mime_type, fileName: a.file_name, attachment: a };
}

/**
 * Removes what nothing references any more: the Project's attachments
 * without a placement anywhere, older than the grace period — the rows first
 * (only those still unreferenced, each recording a purge of its bytes in the
 * same transaction), then the bytes of each purge, then the purge record.
 * Returns how many rows went. Quiet on a database without 047 (nothing to
 * sweep); on one with 047 but without 050 the delete returns no `purges`, so
 * the bytes of the deleted ids are removed directly, as before.
 */
export async function sweepUnreferencedAttachments(
  supabase: SupabaseLike,
  storage: AttachmentStorage,
  projectId: string,
  graceHours = ATTACHMENT_GRACE_HOURS
): Promise<{ removed: number }> {
  if (!UUID.test(projectId)) return { removed: 0 };
  const { data, error } = await supabase.rpc("list_unreferenced_attachments", { p_project_id: projectId, p_older_than: `${graceHours} hours` });
  if (error || data?.status !== "ok") return { removed: 0 };
  const rows = (data.attachments ?? []) as WorkspaceAttachment[];
  if (rows.length === 0) return { removed: 0 };

  const del = await supabase.rpc("delete_workspace_attachments", { p_project_id: projectId, p_ids: rows.map((a) => a.id) });
  const result = del.data as { status: "ok"; deleted?: string[]; purges?: StoragePurge[] } | { status: "error" } | null;
  if (del.error || !result || result.status !== "ok") return { removed: 0 };
  const deleted = result.deleted ?? [];
  if (deleted.length === 0) return { removed: 0 };

  if (Array.isArray(result.purges)) {
    // 050: each deleted row's bytes are owed as a recorded purge — removed
    // here, or left recorded for the purge sweep.
    for (const purge of result.purges) await carryOutStoragePurge(supabase, storage, purge);
  } else {
    // 047 without 050: the rows are gone and nothing recorded their bytes;
    // remove them now (a removal that fails leaves nothing to retry — the
    // pre-050 order's own limitation, until 050 is applied).
    const gone = new Set(deleted);
    for (const a of rows) {
      if (!gone.has(a.id)) continue;
      try {
        await storage.remove([a.storage_key, ...(a.display_key ? [a.display_key] : [])]);
      } catch {
        // Nothing recorded to retry: see above.
      }
    }
  }
  return { removed: deleted.length };
}

/** An in-memory store: the tests', and a fallback nothing in production uses. */
export class MemoryAttachmentStorage implements AttachmentStorage {
  readonly objects = new Map<string, StoredBytes>();
  async upload(key: string, bytes: Uint8Array, contentType: string) {
    this.objects.set(key, { bytes, contentType });
  }
  async download(key: string) {
    return this.objects.get(key) ?? null;
  }
  async remove(keys: readonly string[]) {
    for (const k of keys) this.objects.delete(k);
  }
}
