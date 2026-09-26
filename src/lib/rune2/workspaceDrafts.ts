import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { PageDoc } from "./workspacePageSaver";

// The device copy of Workspace Pages: the latest content of every Page opened
// on this device, with whether it has reached the server (`dirty`) and the
// server version it is based on. It is what makes a Page's writing survive a
// refresh, a closed window or a lost connection before its save lands.
//
// Its own IndexedDB database, deliberately apart from the manuscript's
// (lib/offline/db.ts, "rune-offline"): that database's stores and names are
// compatibility contracts for Scene prose and queued offline saves, and a
// Workspace Page must never enter the Scene queue. Keyed by Page id; each
// copy records its writer, so a shared device never shows one writer's copy
// to another. Content is never logged.

const DB_NAME = "rune-workspace";
const STORE = "page_drafts";

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
}

let dbPromise: Promise<IDBPDatabase<RuneWorkspaceDB>> | null = null;

function db(): Promise<IDBPDatabase<RuneWorkspaceDB>> {
  dbPromise ??= openDB<RuneWorkspaceDB>(DB_NAME, 1, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: "id" });
    },
  });
  // A failed open (private mode, storage blocked) is retried next time.
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

/** This writer's device copy of a Page, or null (none, another writer's, or storage unavailable). */
export async function getPageDraft(id: string, userId: string): Promise<StoredPageDraft | null> {
  try {
    const draft = await (await db()).get(STORE, id);
    return draft && draft.userId === userId ? draft : null;
  } catch {
    return null;
  }
}

/** Writes the device copy. Never throws: without storage, the server save still runs. */
export async function putPageDraft(draft: StoredPageDraft): Promise<void> {
  try {
    await (await db()).put(STORE, draft);
  } catch {
    // Storage unavailable.
  }
}
