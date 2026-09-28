"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { getWorkspacePage, renameWorkspacePage } from "@/lib/actions/workspacePages";
import { getCollectionEntry, renameCollectionEntry } from "@/lib/actions/workspaceCollections";
import { restoreWorkspaceObject } from "@/lib/actions/workspaceTrash";
import type { NavEntry } from "@/lib/rune2/navigatorModel";
import type { PageSaveStatus } from "@/lib/rune2/workspacePageSaver";
import { useNetworkStore } from "@/store/networkStore";
import { EntryProperties } from "./PropertyFields";
import { useRune2Selection } from "./Rune2Selection";
import type { PageSession } from "./WorkspacePages";
import { WorkspaceTitle } from "./WorkspaceTitle";

// The Workspace Page editor: a title and a rich-text body, for supporting
// material (notes, research, ideas) rather than manuscript prose. It shares
// TipTap and the writing column with the manuscript surface, and nothing of
// the manuscript's engine: saving is the Page's own PageSaver (see
// workspacePageSaver.ts), there are no word counts, and the body is set in
// Rune's interface sans rather than the manuscript serif — denser, with
// paragraph spacing instead of book indents, so notes read as notes.
//
// A Collection Entry is edited by the same editor: an Entry is a title and a
// freeform body too. What differs is its identity and actions — its own table,
// rename and read — a quiet line above the title naming its Collection, which
// opens it, and between title and body its Collection's properties
// (EntryProperties): structured facts beside the freeform writing, never in it.
//
// No toolbar: Markdown shortcuts (#, -, 1., >) and ⌘B / ⌘I. ⌘S saves now.
// No AI features of any kind.

const STATUS_LABEL: Record<Exclude<PageSaveStatus, "conflict" | "unavailable" | "trashed">, string> = {
  saved: "Saved",
  pending: "Saving…",
  saving: "Saving…",
  retrying: "Saved on this device",
};

/** What differs between a Page and an Entry, for this editor. */
const DOCUMENT = {
  page: { noun: "page", read: getWorkspacePage, rename: renameWorkspacePage },
  entry: { noun: "entry", read: getCollectionEntry, rename: renameCollectionEntry },
} as const;

export default function WorkspacePageEditor({ entry, session }: { entry: NavEntry; session: PageSession }) {
  const pageId = entry.id;
  const { saver } = session;
  const doc = DOCUMENT[session.kind];
  const isOnline = useNetworkStore((s) => s.isOnline);
  const subscribe = useCallback(
    (listener: () => void) => {
      session.listeners.add(listener);
      return () => {
        session.listeners.delete(listener);
      };
    },
    [session]
  );
  const readStatus = useCallback(() => session.status, [session]);
  const status = useSyncExternalStore(subscribe, readStatus, readStatus);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({
        placeholder: "Write anything…",
        emptyEditorClass: "is-editor-empty",
        emptyNodeClass: "is-empty",
        showOnlyWhenEditable: true,
        showOnlyCurrent: true,
      }),
    ],
    content: saver.content,
    immediatelyRender: false,
    autofocus: false,
    editorProps: { attributes: { "aria-label": `${entry.title} — ${doc.noun}` } },
    onUpdate: ({ editor: e }) => saver.change(e.getJSON()),
  });

  // Leaving the Page (another tab, another object): save now. The saver
  // outlives this editor, so reopening the Page continues from it.
  useEffect(() => () => void saver.flush(), [saver]);

  const [resolving, setResolving] = useState(false);
  async function takeServerCopy() {
    setResolving(true);
    try {
      const r = await doc.read(pageId);
      if (r.data) {
        saver.acceptServer({ content: r.data.content, version: r.data.version });
        editor?.commands.setContent(r.data.content, { emitUpdate: false });
      }
    } finally {
      setResolving(false);
    }
  }

  // Moved to Trash in another window: nothing more is saved until it is back.
  // Restoring it here brings back the same object, and this window's writing
  // (kept on the device meanwhile) saves on the version it is based on.
  const [restoring, setRestoring] = useState<"idle" | "busy" | "failed">("idle");
  async function restoreHere() {
    setRestoring("busy");
    const r = await restoreWorkspaceObject(session.kind, pageId);
    if (r.error !== null) {
      setRestoring("failed");
      return;
    }
    setRestoring("idle");
    await saver.resume();
  }

  const statusLabel =
    status === "conflict" || status === "unavailable" || status === "trashed"
      ? null
      : !isOnline && status === "saved"
        ? "Offline"
        : STATUS_LABEL[status];

  return (
    <div className="r2-writing">
      <article
        className="r2-doc r2-page"
        // Clicking the empty space below the text continues at the end.
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && editor) {
            e.preventDefault();
            editor.commands.focus("end");
          }
        }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
            e.preventDefault();
            void saver.flush();
          }
        }}
      >
        {session.kind === "entry" && <EntryCollection entry={entry} />}
        <WorkspaceTitle entry={entry} rename={doc.rename} noun={doc.noun} onLeave={() => editor?.commands.focus("start")} />
        {session.kind === "entry" && entry.path.length > 0 && (
          <EntryProperties entryId={entry.id} collectionId={entry.path[entry.path.length - 1].id} />
        )}
        {editor && <EditorContent editor={editor} className="r2-page-body" />}
      </article>

      <div className="r2-doc-status" aria-live="polite">
        {status === "conflict" ? (
          <span className="r2-page-conflict" role="alert">
            <span>Changed in another window.</span>
            <button type="button" disabled={resolving} onClick={() => void saver.keepMine()}>
              Keep this version
            </button>
            <span aria-hidden>·</span>
            <button type="button" disabled={resolving} onClick={() => void takeServerCopy()}>
              Use the other
            </button>
          </span>
        ) : status === "trashed" ? (
          <span className="r2-page-conflict" role="alert">
            <span>
              {restoring === "failed"
                ? `This ${doc.noun} couldn’t be restored here — restore it from Trash.`
                : `This ${doc.noun} was moved to Trash. Your writing is kept on this device.`}
            </span>
            {restoring !== "failed" && (
              <button type="button" disabled={restoring === "busy"} onClick={() => void restoreHere()}>
                Restore
              </button>
            )}
          </span>
        ) : status === "unavailable" ? (
          <span className="r2-page-conflict" role="alert">
            This {doc.noun} can’t be saved right now. Your writing is kept on this device.
          </span>
        ) : (
          <span data-tone={status === "retrying" || !isOnline ? "offline" : undefined}>{statusLabel}</span>
        )}
      </div>
    </div>
  );
}

/**
 * An Entry's Collection, above its title: where the Entry lives, and the way
 * back to its list. ⌘/Ctrl-click opens the Collection in a tab of its own.
 */
function EntryCollection({ entry }: { entry: NavEntry }) {
  const { select, openInNewTab } = useRune2Selection();
  const collection = entry.path[entry.path.length - 1];
  if (!collection) return null;
  return (
    <button
      type="button"
      className="r2-entry-collection"
      onClick={(e) => (e.metaKey || e.ctrlKey ? openInNewTab(collection.id) : select(collection.id))}
      title={`Open ${collection.title}`}
    >
      {collection.title}
    </button>
  );
}
