import type { AttachmentStorage } from "@/lib/attachments/server";

// Permanent Project deletion (Beta Completion A, migration 049) on the
// server. A Project is deleted only from Trash, by delete_trashed_project,
// which deletes every row the Project owns in one transaction and records,
// in the same transaction, the object-storage keys of its attachments
// (project_storage_purges). The bytes live outside the database, so they are
// removed here afterwards: remove the bytes, then delete the purge record. A
// purge that cannot be finished stays recorded and is retried by
// sweepProjectStoragePurges — the record is what keeps bytes from being
// orphaned. The attachment sweep (attachments/server.ts, migration 050)
// records purges the same way for the rows it deletes, and they are carried
// out and retried here too. Nothing here logs file names or content.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

/** A recorded removal of object-storage bytes (a project_storage_purges row). */
export type StoragePurge = { id: string; storage_bucket: string; storage_keys: string[] };

/** Storage removes at most this many keys per call. */
const REMOVE_BATCH = 500;

/**
 * Carries out one recorded purge: removes its bytes, then deletes its record.
 * False when the bytes could not be removed — the record stays and is retried
 * by sweepProjectStoragePurges. Shared with the attachment sweep
 * (migration 050), which records a purge for every attachment row it deletes.
 */
export async function carryOutStoragePurge(supabase: SupabaseLike, storage: AttachmentStorage, purge: StoragePurge): Promise<boolean> {
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
  const result = data as { status: "ok"; purges: StoragePurge[] } | { status: "error"; error: string } | null;
  if (!result) return { error: "The project couldn’t be deleted." };
  if (result.status !== "ok") return { error: result.error };

  let pending = 0;
  for (const purge of result.purges ?? []) {
    if (!(await carryOutStoragePurge(supabase, storage, purge))) pending++;
  }
  return { error: null, pendingPurges: pending };
}

/**
 * Account deletion (BC-B): the bytes of every attachment the account still
 * holds, and every purge it is owed, are removed BEFORE the auth user is
 * deleted (the database cascade cannot reach object storage). Runs with the
 * service role. Durable first: the live attachments' keys are recorded as
 * purges in the same table a Project deletion uses, so a removal that fails
 * leaves an auditable record under the deleted account's id (nothing else
 * references the keys once the cascade runs) instead of silently orphaned
 * bytes. Each purge then goes bytes-then-record; one that cannot be finished
 * stays recorded. Returns how many were finished and how many remain.
 */
export async function purgeAccountAttachmentBytes(
  admin: SupabaseLike,
  storage: AttachmentStorage,
  userId: string
): Promise<{ completed: number; remaining: number }> {
  const { data: projects, error: projectsError } = await admin.from("projects").select("id").eq("user_id", userId);
  if (projectsError) throw new Error(projectsError.message);
  for (const { id: projectId } of (projects ?? []) as { id: string }[]) {
    const { data: rows, error } = await admin
      .from("workspace_attachments")
      .select("storage_bucket, storage_key, display_key")
      .eq("project_id", projectId);
    if (error) throw new Error(error.message);
    const byBucket = new Map<string, string[]>();
    for (const r of (rows ?? []) as { storage_bucket: string; storage_key: string; display_key: string | null }[]) {
      const keys = byBucket.get(r.storage_bucket) ?? [];
      keys.push(r.storage_key);
      if (r.display_key) keys.push(r.display_key);
      byBucket.set(r.storage_bucket, keys);
    }
    for (const [bucket, keys] of byBucket) {
      const { error: recordError } = await admin
        .from("project_storage_purges")
        .insert({ user_id: userId, project_id: projectId, storage_bucket: bucket, storage_keys: keys });
      if (recordError) throw new Error(recordError.message);
    }
  }
  const { data: purges, error: purgesError } = await admin
    .from("project_storage_purges")
    .select("id, storage_bucket, storage_keys")
    .eq("user_id", userId);
  if (purgesError) throw new Error(purgesError.message);
  let completed = 0;
  for (const purge of (purges ?? []) as StoragePurge[]) {
    if (await carryOutStoragePurge(admin, storage, purge)) completed++;
  }
  return { completed, remaining: ((purges ?? []) as StoragePurge[]).length - completed };
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
  for (const purge of data as StoragePurge[]) {
    if (await carryOutStoragePurge(supabase, storage, purge)) completed++;
  }
  return { completed, remaining: (data as StoragePurge[]).length - completed };
}
