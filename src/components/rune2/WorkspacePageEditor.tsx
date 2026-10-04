"use client";

import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getWorkspacePage, renameWorkspacePage } from "@/lib/actions/workspacePages";
import { getCollectionEntry, renameCollectionEntry } from "@/lib/actions/workspaceCollections";
import { restoreWorkspaceObject } from "@/lib/actions/workspaceTrash";
import type { NavEntry } from "@/lib/rune2/navigatorModel";
import { openableId, type ObjectRef } from "@/lib/rune2/references";
import { holdsUnknownContent, inlineReferences, sameTargets, type InlineTarget } from "@/lib/rune2/workspaceDocument";
import type { PageSaveStatus } from "@/lib/rune2/workspacePageSaver";
import { useNetworkStore } from "@/store/networkStore";
import { DocStatus } from "./DocStatus";
import { EntryProperties } from "./PropertyFields";
import { useReferenceStore } from "./ReferenceStore";
import { useRune2Selection } from "./Rune2Selection";
import { WorkspaceCommandMenus } from "./WorkspaceCommandMenus";
import { TriggerBridge, type ActiveTrigger } from "@/lib/rune2/workspaceEditorCommands";
import { workspaceEditorExtensions } from "./WorkspaceEditorKit";
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
// No toolbar: Markdown shortcuts (#, -, 1., >) and ⌘B / ⌘I; "/" for a short
// menu of blocks, "@" to reference an Entry, Page, Scene or Chapter
// (WorkspaceCommandMenus). ⌘S saves now. Pages and Entries share every one of
// these — one editor, one schema (lib/rune2/workspaceEditorSchema.ts).
// No AI features of any kind.
//
// References and embeds are canonical ids in the document's own JSON, saved
// by its PageSaver exactly like its text (and kept on the device the same
// way). The database derives the document's mentions from that JSON on every
// save (migration 035); meanwhile this editor tells the reference store what
// the text mentions now, so backlinks follow the writing at once.
//
// A document holding something this editor doesn't know (written by a newer
// Rune) is shown read-only rather than risk saving it without that part.

// One vocabulary with the manuscript and Canvas surfaces: "Saved" only once
// the server confirmed it; "Saved on this device" whenever the writing is
// durable here but not yet there (offline, or a failed save being retried).
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
  const { index, select, openInNewTab } = useRune2Selection();
  const { showMentions, mentionsSaved } = useReferenceStore();
  const [source] = useState<ObjectRef>(() => ({ type: session.kind === "entry" ? "entry" : "page", id: pageId }));
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

  // The "/" and "@" menus, reached through a bridge so the editor is built once.
  const [trigger, setTrigger] = useState<ActiveTrigger | null>(null);
  const [handlers] = useState(() => new TriggerBridge());
  useEffect(() => {
    handlers.bind({
      onTrigger: (next) =>
        setTrigger((current) =>
          current?.char === next?.char && current?.from === next?.from && current?.query === next?.query && current?.to === next?.to
            ? current
            : next
        ),
      onOpenReference: (id, newTab) => (newTab ? openInNewTab : select)(openableId(index, id)),
    });
  });

  // What the text mentions: shown to the reference store as it changes, and
  // settled once the text holding the change is saved.
  const mentions = useRef<InlineTarget[] | null>(null);
  const mentionsChanged = useRef(false);
  const trackMentions = (content: JSONContent) => {
    const targets = inlineReferences(content, source);
    if (mentions.current && sameTargets(mentions.current, targets)) return;
    mentions.current = targets;
    mentionsChanged.current = true;
    showMentions(source, targets);
  };
  const track = useRef(trackMentions);
  useEffect(() => {
    track.current = trackMentions;
  });

  const [unreadable, setUnreadable] = useState(false);
  const editor = useEditor({
    // One quiet line, as an empty Chapter shows: the "/" and "@" menus are
    // found by use, not announced.
    extensions: workspaceEditorExtensions(handlers, "Start writing, or type / for headings, lists and references…"),
    content: saver.content,
    immediatelyRender: false,
    autofocus: false,
    // Content this schema can't hold (a node or mark from a newer Rune) is
    // never silently dropped and saved. Anything else loads as it always has.
    enableContentCheck: true,
    onContentError: ({ error }) => {
      if (holdsUnknownContent(error)) setUnreadable(true);
    },
    editorProps: { attributes: { "aria-label": `${entry.title} — ${doc.noun}` } },
    onUpdate: ({ editor: e }) => {
      const json = e.getJSON();
      saver.change(json);
      track.current(json);
    },
  });

  useEffect(() => {
    if (unreadable) editor?.setEditable(false);
  }, [editor, unreadable]);

  // Opening: what the document mentions now. Unsaved writing from this device
  // (a draft not yet on the server) shows its mentions at once.
  useEffect(() => {
    if (mentions.current !== null) return;
    mentions.current = inlineReferences(saver.content, source);
    if (saver.status !== "saved") {
      mentionsChanged.current = true;
      showMentions(source, mentions.current);
    }
  }, [saver, source, showMentions]);

  useEffect(() => {
    if (status === "saved" && mentionsChanged.current) {
      mentionsChanged.current = false;
      mentionsSaved(source.id);
    }
  }, [status, source, mentionsSaved]);

  // Leaving the Page (another tab, another object): save now. The saver
  // outlives this editor, so reopening the Page continues from it.
  useEffect(
    () => () =>
      void saver.flush().then(() => {
        if (mentionsChanged.current && saver.status === "saved") {
          mentionsChanged.current = false;
          mentionsSaved(source.id);
        }
      }),
    [saver, source, mentionsSaved]
  );

  const [resolving, setResolving] = useState(false);
  async function takeServerCopy() {
    setResolving(true);
    try {
      const r = await doc.read(pageId);
      if (r.data) {
        saver.acceptServer({ content: r.data.content, version: r.data.version });
        editor?.commands.setContent(r.data.content, { emitUpdate: false });
        trackMentions(r.data.content as JSONContent);
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
      : !isOnline
        ? status === "saved"
          ? "Offline"
          : // Nothing is being sent while offline: the writing waits on this device.
            "Saved on this device"
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
        <WorkspaceTitle
          entry={entry}
          rename={doc.rename}
          noun={doc.noun}
          // The same eyebrow a Chapter carries ("Chapter 4"), so the title stands
          // where a Chapter's does: a Page is named as a Page, an Entry by its
          // Collection — which is also the way back.
          eyebrow={session.kind === "entry" ? <EntryCollection entry={entry} /> : "Page"}
          onLeave={() => editor?.commands.focus("start")}
        />
        {session.kind === "entry" && entry.path.length > 0 && (
          <EntryProperties entryId={entry.id} collectionId={entry.path[entry.path.length - 1].id} />
        )}
        {editor && <EditorContent editor={editor} className="r2-page-body" />}
        {editor && !unreadable && (
          <WorkspaceCommandMenus editor={editor} trigger={trigger} handlers={handlers} selfId={pageId} />
        )}
      </article>

      <DocStatus announce={!unreadable && (status === "retrying" || !isOnline) ? statusLabel : null}>
        {unreadable ? (
          <span className="r2-page-conflict" role="alert">
            This {doc.noun} holds something this version of Sutura can’t show, so it’s read-only here. Reload to edit it.
          </span>
        ) : status === "conflict" ? (
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
      </DocStatus>
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
