"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { File as PageIcon, FileText, Folder, Frame, Library, Pilcrow, StickyNote, X, type LucideIcon } from "lucide-react";
import { ICON } from "./icons";
import {
  deleteTrashedWorkspaceObject,
  listWorkspaceTrash,
  restoreWorkspaceObject,
  trashWorkspaceObject,
} from "@/lib/actions/workspaceTrash";
import { syncPendingWrite } from "@/lib/offline/syncEngine";
import type { NavEntry } from "@/lib/rune2/navigatorModel";
import { deletionWarning, TRASH_NOUN, trashContext, trashedWhen, trashItemTitle, trashTypeOf } from "@/lib/rune2/trash";
import type { TrashItem, TrashObjectType } from "@/lib/types";
import { useRune2Selection } from "./Rune2Selection";

// The Project's Trash (migrations 030, 031, 037, 045): recoverable deletion of
// Workspace Pages, Folders, Collections, Entries and Canvases, and of
// manuscript Scenes and Chapters (a Chapter with its Scenes). Out of the way until needed: a
// "Move to Trash" in an item's menu, a quiet "Trash" at the foot of the
// navigator, and the Trash surface itself — listing what is there, each item
// restored as the same object or deleted permanently after a confirmation.
//
// The surface (TrashView) is a project-level utility, not an object: it is
// shown in the content column in place of the selection while `trashOpen`
// (Rune2Selection) is set, never as a tab, and closing it shows the same
// selection again, untouched. Restoring from it never changes the working
// set: the restored object reappears in the navigator, to be opened from
// there.
//
// Moving something to Trash first saves whatever of it is still unsaved in
// this window (a Page's or Entry's saver; a Scene's offline queue), so nothing
// typed is left behind, and then takes it out of the working set: its tab —
// and, for a Collection, its Entries' tabs — is removed for good, so a later
// restore from Trash does not bring the tab back. (The navigator's Undo, the
// writer taking back what they just did, opens it again.) A window that still has it open finds out on its next save (the
// saver's "trashed" state): its writing stays on that device and saves once
// the item is restored. Permanent deletion forgets the device copy too.
//
// A Folder is navigation: trashing one keeps its items in the Workspace, in
// its place. A Chapter is manuscript: it goes with its Scenes, as one piece,
// and comes back with them. Trash is never Unplaced Scenes.

/** What a Workspace document's open editor sessions can be asked to do (WorkspacePages). */
export type DocumentSessions = {
  /** Saves now whatever of this document is unsaved in this window. */
  flush: (id: string) => Promise<void>;
  /** The document is back from Trash: its saver may continue. */
  resume: (id: string) => void;
  /** The document is gone for good: stop its saver and forget its device copy. */
  forget: (id: string, kind: "page" | "entry") => void;
};

/** What a Canvas's open sessions can be asked to do (WorkspaceCanvases): the same three things. */
export type CanvasSessionsBinding = {
  flush: (id: string) => Promise<void>;
  resume: (id: string) => void;
  forget: (id: string) => void;
};

type Notice = { text: string; undo?: { type: TrashObjectType; id: string } };

type TrashValue = {
  /** Whether the Workspace has a Trash (migration 030). */
  available: boolean;
  /** Whether Scenes can go to Trash too (migration 031). */
  scenesAvailable: boolean;
  /** Whether Chapters can go to Trash, with their Scenes (migration 037). */
  chaptersAvailable: boolean;
  /** Moves a Workspace item to Trash. A returned string is a failure to show. */
  moveToTrash: (entry: NavEntry) => Promise<string | null>;
  notice: Notice | null;
  dismissNotice: () => void;
  undo: () => void;
  bindDocuments: (sessions: DocumentSessions | null) => void;
  bindCanvases: (sessions: CanvasSessionsBinding | null) => void;
  /** For the Trash surface: the open document sessions, and a re-read of the Project. */
  documents: React.RefObject<DocumentSessions | null>;
  canvases: React.RefObject<CanvasSessionsBinding | null>;
  refresh: () => void;
};

const TrashContext = createContext<TrashValue | null>(null);

export function TrashProvider({ children }: { children: ReactNode }) {
  const { workspace, selectWhenPresent, dropTabs } = useRune2Selection();
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const [notice, setNotice] = useState<Notice | null>(null);
  const documents = useRef<DocumentSessions | null>(null);
  const canvases = useRef<CanvasSessionsBinding | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(timer);
  }, [notice]);

  const refresh = useCallback(() => startRefresh(() => router.refresh()), [router]);

  const moveToTrash = useCallback(
    async (entry: NavEntry) => {
      const type = trashTypeOf(entry);
      if (!type) return "That can’t be moved to Trash.";
      // Whatever is unsaved in this window reaches the server first. A Scene's
      // writing is in its offline queue: sync it (a failure leaves it queued,
      // and it saves once the Scene is restored).
      const unsaved =
        type === "collection"
          ? (entry.entryIds ?? [])
          : type === "folder"
            ? []
            : type === "chapter"
              ? (entry.sceneIds ?? [])
              : [entry.id];
      if (type === "scene" || type === "chapter") {
        await Promise.all(unsaved.map((id) => syncPendingWrite(id).catch(() => undefined)));
      } else if (type === "canvas") {
        await canvases.current?.flush(entry.id);
      } else {
        await Promise.all(unsaved.map((id) => documents.current?.flush(id)));
      }
      const r = await trashWorkspaceObject(type, entry.id);
      if (r.error !== null) return "Couldn’t move that to Trash. Nothing was changed.";
      dropTabs(type === "chapter" ? [entry.id, ...unsaved] : unsaved);
      const scenes = entry.sceneIds?.length ?? 0;
      setNotice({
        text:
          type === "folder" && r.data.moved > 0
            ? `“${entry.title}” moved to Trash. ${r.data.moved === 1 ? "Its item stays" : "Its items stay"} in the Workspace.`
            : type === "chapter" && scenes > 0
              ? `“${entry.title}” moved to Trash with its ${scenes === 1 ? "scene" : `${scenes} scenes`}.`
              : `“${entry.title}” moved to Trash.`,
        undo: { type, id: entry.id },
      });
      refresh();
      return null;
    },
    [refresh, dropTabs]
  );

  // Undo is the writer taking back what they just did, so the object opens again.
  const undo = useCallback(() => {
    const target = notice?.undo;
    setNotice(null);
    if (!target) return;
    void restoreWorkspaceObject(target.type, target.id).then((r) => {
      if (r.error !== null) {
        setNotice({ text: "Couldn’t restore it. It is still in Trash." });
        return;
      }
      documents.current?.resume(target.id);
      canvases.current?.resume(target.id);
      if (target.type !== "folder") selectWhenPresent(target.id);
      refresh();
    });
  }, [notice, refresh, selectWhenPresent]);

  const bindDocuments = useCallback((sessions: DocumentSessions | null) => {
    documents.current = sessions;
  }, []);
  const bindCanvases = useCallback((sessions: CanvasSessionsBinding | null) => {
    canvases.current = sessions;
  }, []);
  const dismissNotice = useCallback(() => setNotice(null), []);

  const value = useMemo<TrashValue>(
    () => ({
      available: workspace.trashable,
      scenesAvailable: workspace.sceneTrashable,
      chaptersAvailable: workspace.chapterTrashable,
      moveToTrash,
      notice,
      dismissNotice,
      undo,
      bindDocuments,
      bindCanvases,
      documents,
      canvases,
      refresh,
    }),
    [
      workspace.trashable,
      workspace.sceneTrashable,
      workspace.chapterTrashable,
      moveToTrash,
      notice,
      dismissNotice,
      undo,
      bindDocuments,
      bindCanvases,
      refresh,
    ]
  );

  return <TrashContext.Provider value={value}>{children}</TrashContext.Provider>;
}

export function useTrash(): TrashValue {
  const value = useContext(TrashContext);
  if (!value) throw new Error("useTrash must be used inside TrashProvider");
  return value;
}

// ── The Trash surface ───────────────────────────────────────────────────────

// As in the navigator.
const TYPE_ICON: Record<TrashObjectType, LucideIcon> = {
  page: PageIcon,
  folder: Folder,
  collection: Library,
  entry: StickyNote,
  scene: Pilcrow,
  chapter: FileText,
  canvas: Frame,
};

type Listing = { state: "loading" } | { state: "failed" } | { state: "ready"; items: TrashItem[] };

/**
 * The Project's Trash, in the content column: its own bar (the Project, then
 * "Trash", and a way back) and the list. Escape or "Close" returns to the
 * selection that was showing; focus goes back where it was.
 */
export function TrashView() {
  const { manuscript, workspace, setTrashOpen } = useRune2Selection();
  const { documents, canvases, refresh } = useTrash();
  const projectId = manuscript.project.id;
  const [listing, setListing] = useState<Listing>({ state: "loading" });
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  // Where focus was when Trash opened (the navigator's "Trash", usually).
  const [returnFocus] = useState(() => document.activeElement);
  const heading = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async () => {
    const r = await listWorkspaceTrash(projectId);
    setListing(r.error === null ? { state: "ready", items: r.data } : { state: "failed" });
  }, [projectId]);

  // Read on opening, and again whenever the Project is re-read — so an item
  // moved to Trash from the navigator while this is open appears here.
  useEffect(() => {
    let live = true;
    void listWorkspaceTrash(projectId).then((r) => {
      if (live) setListing(r.error === null ? { state: "ready", items: r.data } : { state: "failed" });
    });
    return () => {
      live = false;
    };
  }, [projectId, workspace]);

  useEffect(() => {
    heading.current?.focus();
  }, []);

  const close = () => {
    const el = returnFocus;
    setTrashOpen(false);
    if (el instanceof HTMLElement && el.isConnected) requestAnimationFrame(() => el.focus());
  };

  async function restore(item: TrashItem) {
    setBusy(item.id);
    setStatus(null);
    const r = await restoreWorkspaceObject(item.type, item.id);
    setBusy(null);
    if (r.error !== null) {
      setStatus(
        r.error === "Restore its collection first"
          ? `Restore “${trashItemTitle({ type: "collection", title: item.collection_title })}” first — the entry belongs to it.`
          : `Couldn’t restore “${trashItemTitle(item)}”.`
      );
      return;
    }
    documents.current?.resume(item.id);
    if (item.type === "canvas") canvases.current?.resume(item.id);
    const title = trashItemTitle(item);
    setStatus(
      item.type === "chapter"
        ? r.data.location === "top"
          ? `“${title}” is back, at the end of the manuscript — its group is gone.`
          : `“${title}” is back in the manuscript${(item.scenes ?? 0) > 0 ? ", with its scenes" : ""}.`
        : r.data.location === "top"
          ? `“${title}” is back, at the top of the Workspace — its folder is gone.`
          : r.data.location === "unplaced"
            ? `“${title}” is back, in Unplaced Scenes — its chapter isn’t in the manuscript.`
            : item.type === "scene"
              ? `“${title}” is back in the manuscript.`
              : `“${title}” is back in the Workspace.`
    );
    refresh();
    await load();
  }

  async function destroy(item: TrashItem) {
    setBusy(item.id);
    setStatus(null);
    const r = await deleteTrashedWorkspaceObject(item.type, item.id);
    setBusy(null);
    setConfirming(null);
    if (r.error !== null) {
      setStatus(`Couldn’t delete “${trashItemTitle(item)}”. It is still in Trash.`);
      return;
    }
    if (item.type === "page" || item.type === "entry") documents.current?.forget(item.id, item.type);
    if (item.type === "canvas") canvases.current?.forget(item.id);
    setStatus(`“${trashItemTitle(item)}” was deleted permanently.`);
    refresh();
    await load();
  }

  const items = listing.state === "ready" ? listing.items : [];
  const q = filter.trim().toLowerCase();
  const shown = q ? items.filter((i) => trashItemTitle(i).toLowerCase().includes(q)) : items;

  return (
    <section
      className="r2-trash"
      aria-labelledby="r2-trash-title"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          if (confirming) setConfirming(null);
          else close();
        }
      }}
    >
      <header className="r2-contextbar">
        <nav aria-label="Breadcrumb">
          <ol>
            <li className="r2-crumb-project">{manuscript.project.title}</li>
            <li>
              <span aria-hidden className="r2-crumb-sep">/</span>
              <span aria-current="page" className="r2-crumb-current">Trash</span>
            </li>
          </ol>
        </nav>
        <div className="r2-contextbar-actions">
          <button type="button" className="r2-action" onClick={close} title="Back to what you were working on (Esc)">
            <X {...ICON} aria-hidden />
            Close
          </button>
        </div>
      </header>

      <div className="r2-trash-scroll">
        <div className="r2-trash-column">
          <h1 id="r2-trash-title" ref={heading} tabIndex={-1} className="r2-trash-heading">
            Trash
          </h1>
          <p className="r2-trash-lede">Restore anything here as it was, or delete it permanently.</p>

          {items.length > 6 && (
            <div className="r2-trash-filter">
              <input
                type="search"
                className="r2-field r2-field--sm"
                aria-label="Filter Trash"
                placeholder="Filter"
                value={filter}
                maxLength={200}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
          )}

          {listing.state === "loading" && (
            <p className="r2-trash-empty" aria-busy>
              Loading…
            </p>
          )}
          {listing.state === "failed" && <p className="r2-trash-empty">Trash couldn’t be opened just now.</p>}
          {listing.state === "ready" && items.length === 0 && <p className="r2-trash-empty">Trash is empty.</p>}
          {listing.state === "ready" && items.length > 0 && shown.length === 0 && (
            <p className="r2-trash-empty">Nothing in Trash matches “{filter.trim()}”.</p>
          )}

          {shown.length > 0 && (
            <ul className="r2-trash-list" aria-label="Items in Trash">
              {shown.map((item) => {
                const Icon = TYPE_ICON[item.type];
                const blocked = item.type === "entry" && !item.collection_active;
                return (
                  <li key={`${item.type}:${item.id}`} data-confirming={confirming === item.id || undefined}>
                    <div className="r2-trash-item">
                      <Icon {...ICON} aria-hidden className="r2-trash-icon" />
                      <span className="r2-trash-text">
                        <span className="r2-trash-title">{trashItemTitle(item)}</span>
                        <span className="r2-trash-meta">
                          {TRASH_NOUN[item.type]} · {trashContext(item)} · {trashedWhen(item.trashed_at)}
                        </span>
                      </span>
                      {confirming !== item.id && (
                        <span className="r2-trash-actions">
                          <button
                            type="button"
                            className="r2-button r2-button--quiet r2-button--sm r2-trash-action"
                            disabled={busy !== null || blocked}
                            title={blocked ? "Restore its collection first" : undefined}
                            onClick={() => void restore(item)}
                          >
                            Restore
                          </button>
                          <button
                            type="button"
                            className="r2-button r2-button--quiet r2-button--sm r2-trash-action"
                            data-tone="danger"
                            disabled={busy !== null}
                            onClick={() => setConfirming(item.id)}
                          >
                            Delete…
                          </button>
                        </span>
                      )}
                    </div>
                    {confirming === item.id && (
                      <div className="r2-trash-confirm" role="alertdialog" aria-label="Delete permanently">
                        <p>{deletionWarning(item)}</p>
                        <div>
                          <button
                            type="button"
                            className="r2-button r2-button--danger"
                            disabled={busy !== null}
                            onClick={() => void destroy(item)}
                          >
                            Delete permanently
                          </button>
                          <button type="button" className="r2-button" autoFocus onClick={() => setConfirming(null)}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {status && (
            <p role="status" className="r2-trash-status">
              {status}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
