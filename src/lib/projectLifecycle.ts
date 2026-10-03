import type { AttachmentStorage } from "@/lib/attachments/server";

// Permanent Project deletion (Beta Completion A, migration 049) on the
// server. A Project is deleted only from Trash, by delete_trashed_project,
// which deletes every row the Project owns in one transaction and records,
// in the same transaction, the object-storage keys of its attachments
// (project_storage_purges). The bytes live outside the database, so they are
// removed here afterwards: remove the bytes, then delete the purge record. A
// purge that cannot be finished stays recorded and is retried by
// sweepProjectStoragePurges — the record is what keeps bytes from being
// orphaned. Nothing here logs file names or content.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

type Purge = { id: string; storage_bucket: string; storage_keys: string[] };

/** Storage removes at most this many keys per call. */
const REMOVE_BATCH = 500;

async function carryOut(supabase: SupabaseLike, storage: AttachmentStorage, purge: Purge): Promise<boolean> {
  try {
    for (let i = 0; i < purge.storage_keys.length; i += REMOVE_BATCH) {
      await storage.remove(purge.storage_keys.slice(i, i + REMOVE_BATCH));
    }
  } catch {
    return false; // the record stays: tried again by the next sweep
  }
  const { error } = await supabase.from("project_storage_purges").delete().eq("id", purge.id);
  return !error;
}

export type PermanentDeleteResult =
  | { error: null; /** Purges whose bytes could not be removed yet (recorded; retried later). */ pendingPurges: number }
  | { error: string };

/** Deletes a Project in Trash, everything it owns, and its attachment bytes. */
export async function deleteTrashedProject(
  supabase: SupabaseLike,
  storage: AttachmentStorage,
  projectId: string
): Promise<PermanentDeleteResult> {
  const { data, error } = await supabase.rpc("delete_trashed_project", { p_project_id: projectId });
  if (error) return { error: error.message };
  const result = data as { status: "ok"; purges: Purge[] } | { status: "error"; error: string } | null;
  if (!result) return { error: "The project couldn’t be deleted." };
  if (result.status !== "ok") return { error: result.error };

  let pending = 0;
  for (const purge of result.purges ?? []) {
    if (!(await carryOut(supabase, storage, purge))) pending++;
  }
  return { error: null, pendingPurges: pending };
}

/** Retries the signed-in writer's unfinished purges. Quiet: never fails its caller. */
export async function sweepProjectStoragePurges(
  supabase: SupabaseLike,
  storage: AttachmentStorage
): Promise<{ completed: number; remaining: number }> {
  const { data, error } = await supabase
    .from("project_storage_purges")
    .select("id, storage_bucket, storage_keys")
    .order("created_at", { ascending: true })
    .limit(50);
  if (error || !data) return { completed: 0, remaining: 0 };
  let completed = 0;
  for (const purge of data as Purge[]) {
    if (await carryOut(supabase, storage, purge)) completed++;
  }
  return { completed, remaining: (data as Purge[]).length - completed };
}
