import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { plainTextOfContent } from "@/lib/offline/db";
import type { CanvasDraft } from "./canvasSession";
import { noteText } from "./canvas";
import type { PendingNote } from "./revisionNoteSync";
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
//
// Version 3 adds note_changes: Revision Notes (039) the writer created, edited
// or deleted on this device that the server doesn't have yet
// (revisionNoteSync.ts), keyed by note id. A note leaves it only once saved,
// or when the writer chooses to let their version go.
//
// Version 4 adds canvas_changes: one Canvas's unsaved placement changes
// (canvasSession.ts — creates, moves, note text, deletes the server doesn't
// have yet), keyed by Canvas id. Laid over the server's Canvas when it next
// opens on this device, then saved; empty once everything is on the server.

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
  /**
   * The object is gone for good (deleted from Trash elsewhere, or no longer
   * this writer's), so this unsaved writing can never reach it: kept here
   * for the writer to copy or discard (Settings → This device). Cleared by
   * the next ordinary write of the draft (the saver persisting again).
   */
  unavailable?: boolean;
};

interface RuneWorkspaceDB extends DBSchema {
  page_drafts: { key: string; value: StoredPageDraft };
  /** Collection Entries (version 2). */
  entry_drafts: { key: string; value: StoredPageDraft };
  /** Revision Note changes not yet on the server (version 3). */
  note_changes: { key: string; value: PendingNote };
  /** A Canvas's changes not yet on the server (version 4). */
  canvas_changes: { key: string; value: StoredCanvasDraft };
}

export type StoredCanvasDraft = CanvasDraft & { userId: string; projectId: string; savedAt: number; unavailable?: boolean };

let dbPromise: Promise<IDBPDatabase<RuneWorkspaceDB>> | null = null;

function db(): Promise<IDBPDatabase<RuneWorkspaceDB>> {
  // Version 2 adds entry_drafts, version 3 note_changes, version 4
  // canvas_changes; existing stores and their contents are kept as they are.
  dbPromise ??= openDB<RuneWorkspaceDB>(DB_NAME, 4, {
    upgrade(database) {
      for (const store of Object.values(STORES)) {
        if (!database.objectStoreNames.contains(store)) database.createObjectStore(store, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains("note_changes")) {
        database.createObjectStore("note_changes", { keyPath: "noteId" });
      }
      if (!database.objectStoreNames.contains("canvas_changes")) {
        database.createObjectStore("canvas_changes", { keyPath: "canvasId" });
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

// ── Revision Note changes ─────────────────────────────────────────────────

/** This writer's unsaved Revision Note changes for a Project. Throws when storage is unavailable. */
export async function loadNoteChanges(userId: string, projectId: string): Promise<PendingNote[]> {
  const all = await (await db()).getAll("note_changes");
  return all.filter((p) => p.userId === userId && p.projectId === projectId);
}

/** Keeps one unsaved note change on the device. */
export async function putNoteChange(pending: PendingNote): Promise<void> {
  await (await db()).put("note_changes", pending);
}

/** Forgets a note change the server now has (or the writer let go). */
export async function deleteNoteChange(noteId: string): Promise<void> {
  await (await db()).delete("note_changes", noteId);
}

// ── Canvas changes ────────────────────────────────────────────────────────

/** This writer's unsaved changes to one Canvas, or null (none, another writer's, or storage unavailable). */
export async function getCanvasDraft(canvasId: string, userId: string): Promise<StoredCanvasDraft | null> {
  try {
    const draft = await (await db()).get("canvas_changes", canvasId);
    return draft && draft.userId === userId ? draft : null;
  } catch {
    return null;
  }
}

/** Writes the device copy of a Canvas's unsaved changes; an empty draft clears it. Never throws. */
export async function putCanvasDraft(draft: StoredCanvasDraft): Promise<void> {
  try {
    const store = await db();
    if (draft.entries.length === 0) await store.delete("canvas_changes", draft.canvasId);
    else await store.put("canvas_changes", draft);
  } catch {
    // Storage unavailable.
  }
}

/** Forgets a Canvas's device copy (it was permanently deleted). Never throws. */
export async function deleteCanvasDraft(canvasId: string): Promise<void> {
  try {
    await (await db()).delete("canvas_changes", canvasId);
  } catch {
    // Storage unavailable.
  }
}

// ── Unsent work on this device ────────────────────────────────────────────
//
// Everything of one writer's that this device holds and the server does not
// yet: unsaved Page and Entry drafts, Revision Note changes, and Canvas
// changes. Read by the logout warning (which must be truthful about every
// kind of unsent writing, not only the manuscript's queue) and by Settings.

export type UnsentWorkspaceWork = { documents: number; notes: number; canvases: number };

export async function countUnsentWorkspaceWork(userId: string): Promise<UnsentWorkspaceWork> {
  try {
    const store = await db();
    const [pages, entries, notes, canvases] = await Promise.all([
      store.getAll(STORES.page),
      store.getAll(STORES.entry),
      store.getAll("note_changes"),
      store.getAll("canvas_changes"),
    ]);
    const mine = <T extends { userId: string }>(rows: T[]) => rows.filter((r) => r.userId === userId);
    return {
      documents: mine([...pages, ...entries]).filter((d) => d.dirty).length,
      notes: mine(notes).length,
      canvases: mine(canvases).filter((c) => c.entries.length > 0).length,
    };
  } catch {
    return { documents: 0, notes: 0, canvases: 0 };
  }
}

// ── Stranded drafts ───────────────────────────────────────────────────────
//
// A draft whose object is gone for good: the saver reported it unavailable
// (not in Trash — permanently deleted elsewhere, or no longer the writer's),
// so nothing will ever save it. Marked here so Settings can offer its text,
// the way a retired Scene draft is offered (lib/offline/db.ts). The writer
// decides; nothing is discarded on their behalf.

export type StrandedDraft = {
  kind: DraftKind | "canvas";
  id: string;
  projectId: string;
  savedAt: number;
  /** A short measure of what is held: words of a document, notes of a Canvas. */
  words: number;
  notes: number;
};

/** Marks a Page's or Entry's draft as unsaveable for good. Only a dirty draft is worth keeping. Never throws. */
export async function markPageDraftUnavailable(id: string, kind: DraftKind): Promise<void> {
  try {
    const store = await db();
    const draft = await store.get(STORES[kind], id);
    if (!draft || !draft.dirty) return;
    await store.put(STORES[kind], { ...draft, unavailable: true });
  } catch {
    // Storage unavailable.
  }
}

/** Marks a Canvas's draft as unsaveable for good. Never throws. */
export async function markCanvasDraftUnavailable(canvasId: string): Promise<void> {
  try {
    const store = await db();
    const draft = await store.get("canvas_changes", canvasId);
    if (!draft || draft.entries.length === 0) return;
    await store.put("canvas_changes", { ...draft, unavailable: true });
  } catch {
    // Storage unavailable.
  }
}

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w !== "").length;
}

/** The note texts a Canvas draft holds (its creates and text edits — never a note only moved), the writer's own words on it. */
function canvasDraftNotes(draft: CanvasDraft): string[] {
  return draft.entries
    .filter((e) => (e.op === "create" || (e.op === "update" && e.fields.includes("content"))) && e.item && (e.item as { item_type?: string }).item_type === "note")
    .map((e) => noteText((e.item as { content?: unknown }).content).trim())
    .filter((t) => t !== "");
}

/** This writer's stranded drafts, newest first. */
export async function listStrandedDrafts(userId: string): Promise<StrandedDraft[]> {
  try {
    const store = await db();
    const out: StrandedDraft[] = [];
    for (const kind of ["page", "entry"] as const) {
      for (const d of await store.getAll(STORES[kind])) {
        if (d.userId !== userId || !d.unavailable || !d.dirty) continue;
        out.push({ kind, id: d.id, projectId: d.projectId, savedAt: d.savedAt, words: countWords(plainTextOfContent(d.content)), notes: 0 });
      }
    }
    for (const c of await store.getAll("canvas_changes")) {
      if (c.userId !== userId || !c.unavailable) continue;
      const notes = canvasDraftNotes(c);
      // A Canvas draft without any note text holds only geometry: nothing of the writer's words to offer.
      if (notes.length === 0) continue;
      out.push({ kind: "canvas", id: c.canvasId, projectId: c.projectId, savedAt: c.savedAt, words: countWords(notes.join(" ")), notes: notes.length });
    }
    return out.sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

/** The plain text of one stranded draft (null when there is no such draft). */
export async function getStrandedDraftText(kind: StrandedDraft["kind"], id: string, userId: string): Promise<string | null> {
  try {
    const store = await db();
    if (kind === "canvas") {
      const c = await store.get("canvas_changes", id);
      return c && c.userId === userId ? canvasDraftNotes(c).join("\n\n") : null;
    }
    const d = await store.get(STORES[kind], id);
    return d && d.userId === userId ? plainTextOfContent(d.content) : null;
  } catch {
    return null;
  }
}

/** Discards one stranded draft. Only a draft marked unavailable can be discarded this way. */
export async function discardStrandedDraft(kind: StrandedDraft["kind"], id: string, userId: string): Promise<boolean> {
  try {
    const store = await db();
    if (kind === "canvas") {
      const c = await store.get("canvas_changes", id);
      if (!c || c.userId !== userId || !c.unavailable) return false;
      await store.delete("canvas_changes", id);
      return true;
    }
    const d = await store.get(STORES[kind], id);
    if (!d || d.userId !== userId || !d.unavailable) return false;
    await store.delete(STORES[kind], id);
    return true;
  } catch {
    return false;
  }
}
