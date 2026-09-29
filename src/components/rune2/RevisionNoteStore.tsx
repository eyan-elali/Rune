"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import {
  createRevisionNote,
  deleteRevisionNote,
  listRevisionNotes,
  updateRevisionNote,
} from "@/lib/actions/revisionNotes";
import { NoteSync, type NoteStorage, type NoteTransport, type ShownNote } from "@/lib/rune2/revisionNoteSync";
import { deleteNoteChange, loadNoteChanges, putNoteChange } from "@/lib/rune2/workspaceDrafts";
import { useProfileStore } from "@/store/profileStore";
import { useRune2Selection } from "./Rune2Selection";

// The Project's Revision Notes (migrations 039, 040), held once for the whole
// shell: the Revision Notes panel (RevisionNotes.tsx), Reading Mode's quick
// add and its margin marks all read the same notes and write through the same
// engine (revisionNoteSync.ts). There is one note system: Reading Mode has no
// notes of its own, and the Inspector shows none.
//
// Unsaved changes are kept on the device (IndexedDB, rune-workspace /
// note_changes) and sent again on reconnecting, on the window regaining focus,
// on a timer, and on the next visit — never dropped because the writer moved
// to another Scene or closed the panel.
//
// The notes are read again whenever the set of live Groups, Chapters and
// Scenes changes — compared with the set the notes were last read for, so a
// restore from Trash (which brings the set back to what it was) reads its
// notes back too — and when the connection returns.

type RevisionNoteStore = {
  /** Whether Revision Notes exist here (migration 040). */
  available: boolean;
  projectId: string;
  /** The Manuscript: the target of Manuscript-wide notes. */
  manuscriptId: string | null;
  sync: NoteSync | null;
  notes: ShownNote[];
  loaded: boolean;
  loadFailed: boolean;
  /** The latest send failed on the network; changes are kept and retried. */
  offline: boolean;
};

const EMPTY: ShownNote[] = [];
const Ctx = createContext<RevisionNoteStore>({
  available: false,
  projectId: "",
  manuscriptId: null,
  sync: null,
  notes: EMPTY,
  loaded: false,
  loadFailed: false,
  offline: false,
});

const storage: NoteStorage = { load: loadNoteChanges, put: putNoteChange, remove: deleteNoteChange };

/**
 * Development only: `window.__runeFailNoteSaves = true` makes every note
 * write fail as if the network were down, to try the failure path by hand.
 * The check is compiled out of production builds.
 */
function simulatedFailure() {
  if (process.env.NODE_ENV !== "production") {
    if ((window as unknown as { __runeFailNoteSaves?: boolean }).__runeFailNoteSaves) {
      throw new Error("Simulated note save failure");
    }
  }
}

const transport: NoteTransport = {
  list: listRevisionNotes,
  create: async (...args) => {
    simulatedFailure();
    return createRevisionNote(...args);
  },
  update: async (...args) => {
    simulatedFailure();
    return updateRevisionNote(...args);
  },
  remove: async (...args) => {
    simulatedFailure();
    return deleteRevisionNote(...args);
  },
};

export function RevisionNoteStoreProvider({ children }: { children: ReactNode }) {
  const { manuscript, workspace, index } = useRune2Selection();
  const projectId = manuscript.project.id;
  const manuscriptId = workspace.manuscriptId;
  const available = workspace.revisionNotable && Boolean(manuscriptId);
  const userId = useProfileStore((s) => s.profile?.id);

  const sync = useMemo(
    () => (available && userId ? new NoteSync({ transport, storage, userId, projectId }) : null),
    [available, userId, projectId],
  );
  useEffect(() => {
    if (!sync) return;
    void sync.start();
    return () => sync.dispose();
  }, [sync]);

  // Read again when the live structure changes (Trash, restore, a new Chapter).
  const structureKey = useMemo(
    () =>
      [...index.values()]
        .filter((e) => e.kind === "group" || e.kind === "chapter" || e.kind === "scene" || e.kind === "unplacedScene")
        .map((e) => e.id)
        .sort()
        .join(","),
    [index],
  );
  useEffect(() => {
    if (!sync) return;
    const timer = setTimeout(() => void sync.structureChanged(structureKey), 250);
    return () => clearTimeout(timer);
  }, [sync, structureKey]);

  // Try again when the connection or the window comes back.
  useEffect(() => {
    if (!sync) return;
    const online = () => void sync.refresh();
    const visible = () => {
      if (document.visibilityState === "visible") void sync.flush();
    };
    window.addEventListener("online", online);
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [sync]);

  const notes = useSyncExternalStore(
    sync?.subscribe ?? noSubscribe,
    sync?.notes ?? emptyNotes,
    emptyNotes,
  );

  const value: RevisionNoteStore = {
    available: available && Boolean(sync),
    projectId,
    manuscriptId,
    sync,
    notes,
    loaded: sync?.loaded ?? false,
    loadFailed: sync?.loadFailed ?? false,
    offline: sync?.offline ?? false,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const noSubscribe = () => () => {};
const emptyNotes = () => EMPTY;

export function useRevisionNotes(): RevisionNoteStore {
  return useContext(Ctx);
}
