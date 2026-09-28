import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { PageDoc } from "./workspacePageSaver";

// The device copy of Workspace documents — Pages and Collection Entries: the
// latest content of every one opened on this device, with whether it has
// reached the server (`dirty`) and the server version it is based on. It is
// what makes their writing survive a refresh, a closed window or a lost
// connection before a save lands.
//
// Its own IndexedDB database, deliberately apart from the manuscript's
// (lib/offline/db.ts, "rune-offline"): that database's stores and names are
// compatibility contracts for Scene prose and queued offline saves, and no
// Workspace document must ever enter the Scene queue. One store per kind of
// object (Pages and Entries are different objects, whatever their ids), keyed
// by id; each copy records its writer, so a shared device never shows one
// writer's copy to another. Content is never logged.

const DB_NAME = "rune-workspace";

/** Which kind of Workspace document a draft belongs to. */
export type DraftKind = "page" | "entry";
const STORES = { page: "page_drafts", entry: "entry_drafts" } as const;

export type StoredPageDraft = {
  id: string;
  userId: string;
  projectId: string;
  content: PageDoc;
  baseVersion: number;
  dirty: boolean;
  savedAt: number;
};

interface RuneWorkspaceDB extends DBSchema {
  page_drafts: { key: string; value: StoredPageDraft };
  /** Collection Entries (version 2). */
  entry_drafts: { key: string; value: StoredPageDraft };
}

let dbPromise: Promise<IDBPDatabase<RuneWorkspaceDB>> | null = null;

function db(): Promise<IDBPDatabase<RuneWorkspaceDB>> {
  // Version 2 adds entry_drafts; page_drafts and its contents are kept as they are.
  dbPromise ??= openDB<RuneWorkspaceDB>(DB_NAME, 2, {
    upgrade(database) {
      for (const store of Object.values(STORES)) {
        if (!database.objectStoreNames.contains(store)) database.createObjectStore(store, { keyPath: "id" });
      }
    },
  });
  // A failed open (private mode, storage blocked) is retried next time.
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

/** This writer's device copy of a Page or Entry, or null (none, another writer's, or storage unavailable). */
export async function getPageDraft(id: string, userId: string, kind: DraftKind = "page"): Promise<StoredPageDraft | null> {
  try {
    const draft = await (await db()).get(STORES[kind], id);
    return draft && draft.userId === userId ? draft : null;
  } catch {
    return null;
  }
}

/** Writes the device copy. Never throws: without storage, the server save still runs. */
export async function putPageDraft(draft: StoredPageDraft, kind: DraftKind = "page"): Promise<void> {
  try {
    await (await db()).put(STORES[kind], draft);
  } catch {
    // Storage unavailable.
  }
}

/**
 * Forgets the device copy of a Page or Entry that was permanently deleted
 * (from Trash): there is nothing left for it to be saved to. Never throws.
 */
export async function deletePageDraft(id: string, kind: DraftKind = "page"): Promise<void> {
  try {
    await (await db()).delete(STORES[kind], id);
  } catch {
    // Storage unavailable.
  }
}
