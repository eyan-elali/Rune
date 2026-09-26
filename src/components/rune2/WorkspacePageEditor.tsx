"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getWorkspacePage, renameWorkspacePage } from "@/lib/actions/workspacePages";
import type { NavEntry } from "@/lib/rune2/navigatorModel";
import type { PageSaveStatus } from "@/lib/rune2/workspacePageSaver";
import { useNetworkStore } from "@/store/networkStore";
import { useRune2Selection } from "./Rune2Selection";
import type { PageSession } from "./WorkspacePages";

// The Workspace Page editor: a title and a rich-text body, for supporting
// material (notes, research, ideas) rather than manuscript prose. It shares
// TipTap and the writing column with the manuscript surface, and nothing of
// the manuscript's engine: saving is the Page's own PageSaver (see
// workspacePageSaver.ts), there are no word counts, and the body is set in
// Rune's interface sans rather than the manuscript serif — denser, with
// paragraph spacing instead of book indents, so notes read as notes.
//
// No toolbar: Markdown shortcuts (#, -, 1., >) and ⌘B / ⌘I. ⌘S saves now.
// No AI features of any kind.

const STATUS_LABEL: Record<Exclude<PageSaveStatus, "conflict" | "unavailable">, string> = {
  saved: "Saved",
  pending: "Saving…",
  saving: "Saving…",
  retrying: "Saved on this device",
};

const TITLE_SAVE_DELAY = 700;

export default function WorkspacePageEditor({ entry, session }: { entry: NavEntry; session: PageSession }) {
  const pageId = entry.id;
  const { saver } = session;
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
    editorProps: { attributes: { "aria-label": `${entry.title} — page` } },
    onUpdate: ({ editor: e }) => saver.change(e.getJSON()),
  });

  // Leaving the Page (another tab, another object): save now. The saver
  // outlives this editor, so reopening the Page continues from it.
  useEffect(() => () => void saver.flush(), [saver]);

  const [resolving, setResolving] = useState(false);
  async function takeServerCopy() {
    setResolving(true);
    try {
      const r = await getWorkspacePage(pageId);
      if (r.data) {
        saver.acceptServer({ content: r.data.content, version: r.data.version });
        editor?.commands.setContent(r.data.content, { emitUpdate: false });
      }
    } finally {
      setResolving(false);
    }
  }

  const statusLabel =
    status === "conflict" || status === "unavailable"
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
        <PageTitle entry={entry} onLeave={() => editor?.commands.focus("start")} />
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
        ) : status === "unavailable" ? (
          <span className="r2-page-conflict" role="alert">
            This page can’t be saved right now. Your writing is kept on this device.
          </span>
        ) : (
          <span data-tone={status === "retrying" || !isOnline ? "offline" : undefined}>{statusLabel}</span>
        )}
      </div>
    </div>
  );
}

/**
 * The Page's title, edited in place. The navigator and tabs follow each
 * keystroke (setRenamedTitle); the title is saved after a pause and when the
 * writer leaves the field. Blank is untitled. Enter or ↓ moves into the body.
 */
function PageTitle({ entry, onLeave }: { entry: NavEntry; onLeave: () => void }) {
  const { setRenamedTitle, focusSceneId, requestSceneFocus } = useRune2Selection();
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const stored = entry.named ? entry.title : "";
  const [value, setValue] = useState(stored);
  const [editing, setEditing] = useState(false);
  const [failed, setFailed] = useState(false);
  const saved = useRef(stored);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ref = useRef<HTMLTextAreaElement>(null);

  // Renamed elsewhere (the navigator) while not being edited here: follow it.
  const [seen, setSeen] = useState(stored);
  if (stored !== seen) {
    setSeen(stored);
    if (!editing) setValue(stored);
  }
  useEffect(() => {
    if (!editing) saved.current = stored;
  }, [stored, editing]);

  // A Page just created: name it first.
  useEffect(() => {
    if (focusSceneId !== entry.id) return;
    ref.current?.focus();
    requestSceneFocus(null);
  }, [focusSceneId, entry.id, requestSceneFocus]);

  // Grow with the title, never scroll inside it.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function save(next: string, refresh: boolean) {
    clearTimeout(timer.current);
    const title = next.trim();
    if (title === saved.current) {
      if (refresh) startRefresh(() => router.refresh());
      return;
    }
    saved.current = title;
    const r = await renameWorkspacePage(entry.id, title || null).catch(() => ({ error: "Network error" }));
    setFailed(Boolean(r.error));
    if (r.error) saved.current = "";
    if (refresh) startRefresh(() => router.refresh());
  }

  return (
    <header className="r2-doc-head r2-page-head">
      <textarea
        ref={ref}
        className="r2-page-title"
        aria-label="Page title"
        placeholder="Untitled"
        rows={1}
        maxLength={200}
        spellCheck
        value={value}
        onFocus={() => setEditing(true)}
        onChange={(e) => {
          const next = e.target.value.replace(/\n/g, " ");
          setValue(next);
          setRenamedTitle(entry.id, next.trim());
          clearTimeout(timer.current);
          timer.current = setTimeout(() => void save(next, false), TITLE_SAVE_DELAY);
        }}
        onBlur={() => {
          setEditing(false);
          void save(value, true);
        }}
        onKeyDown={(e) => {
          const el = e.currentTarget;
          const atEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
          if (e.key === "Enter" || (e.key === "ArrowDown" && atEnd)) {
            e.preventDefault();
            onLeave();
          }
        }}
      />
      {failed && (
        <p className="r2-doc-note" role="status">
          The title couldn’t be saved yet. It will be tried again when you leave the title.
        </p>
      )}
    </header>
  );
}
