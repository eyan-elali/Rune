"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { cn } from "@/lib/utils";
import { updatePage, renamePage } from "@/lib/actions/pages";
import { useEditorStore } from "@/store/editorStore";
import type { Page } from "@/lib/types";

interface RuneEditorProps {
  projectId: string;
  chapterId: string;
  currentPage: Page | null;
  onPageUpdated: (pageId: string, updates: Partial<Page>) => void;
  onRenamePage: (pageId: string, title: string) => void;
}

interface ToolbarPos {
  top: number;
  left: number;
}

export default function RuneEditor({
  projectId,
  chapterId,
  currentPage,
  onPageUpdated,
  onRenamePage,
}: RuneEditorProps) {
  const { setIsSaving, setLastSaved } = useEditorStore();
  const [showSaved, setShowSaved] = useState(false);
  const [toolbarPos, setToolbarPos] = useState<ToolbarPos | null>(null);
  const [titleDraft, setTitleDraft] = useState(currentPage?.title ?? "");

  const currentPageRef = useRef<Page | null>(currentPage);
  const onPageUpdatedRef = useRef(onPageUpdated);
  const prevPageIdRef = useRef<string | null>(null);
  const isLoadingRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showSavedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    onPageUpdatedRef.current = onPageUpdated;
  }, [onPageUpdated]);

  useEffect(() => {
    setTitleDraft(currentPage?.title ?? "");
  }, [currentPage?.id, currentPage?.title]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: "Begin your story...",
        emptyEditorClass: "is-editor-empty",
        emptyNodeClass: "is-empty",
        showOnlyWhenEditable: true,
        showOnlyCurrent: true,
      }),
      CharacterCount,
    ],
    content: currentPage?.content ?? null,
    onUpdate({ editor }) {
      if (isLoadingRef.current) return;

      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        const page = currentPageRef.current;
        if (!page) return;

        setIsSaving(true);
        const content = editor.getJSON() as Record<string, unknown>;
        const wordCount =
          (editor.storage.characterCount?.words?.() as number | undefined) ?? 0;

        await updatePage(page.id, content, wordCount);
        onPageUpdatedRef.current(page.id, { word_count: wordCount });
        setIsSaving(false);
        setLastSaved(new Date());

        setShowSaved(true);
        clearTimeout(showSavedTimerRef.current);
        showSavedTimerRef.current = setTimeout(() => setShowSaved(false), 2000);
      }, 1500);
    },
    onSelectionUpdate({ editor }) {
      const { from, to, empty } = editor.state.selection;
      if (empty) {
        setToolbarPos(null);
        return;
      }
      try {
        const startCoords = editor.view.coordsAtPos(from);
        const endCoords = editor.view.coordsAtPos(to);
        setToolbarPos({
          top: startCoords.top - 44,
          left: (startCoords.left + endCoords.left) / 2,
        });
      } catch {
        setToolbarPos(null);
      }
    },
    onBlur() {
      // Small delay so toolbar button clicks register before hiding
      setTimeout(() => setToolbarPos(null), 150);
    },
  });

  // Handle page switching and initial load
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!editor) return;

    const prevPageId = prevPageIdRef.current;
    const newPageId = currentPage?.id ?? null;

    if (prevPageId && prevPageId !== newPageId) {
      clearTimeout(saveTimerRef.current);
      const content = editor.getJSON() as Record<string, unknown>;
      const wordCount =
        (editor.storage.characterCount?.words?.() as number | undefined) ?? 0;
      updatePage(prevPageId, content, wordCount);
    }

    prevPageIdRef.current = newPageId;
    currentPageRef.current = currentPage ?? null;

    isLoadingRef.current = true;
    editor.commands.setContent(currentPage?.content ?? null);
    setTimeout(() => {
      isLoadingRef.current = false;
    }, 0);
  }, [editor, currentPage?.id]); // intentionally omitting currentPage to avoid re-running on word_count updates

  const wordCount =
    (editor?.storage.characterCount?.words?.() as number | undefined) ?? 0;

  async function commitTitle() {
    const page = currentPageRef.current;
    if (!page) return;
    const trimmed = titleDraft.trim() || "Untitled";
    if (trimmed === page.title) {
      setTitleDraft(page.title);
      return;
    }
    setTitleDraft(trimmed);
    onRenamePage(page.id, trimmed);
    await renamePage(page.id, trimmed);
  }

  if (!currentPage) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <p className="text-sm" style={{ color: "var(--color-mist)" }}>
          No page selected
        </p>
      </div>
    );
  }

  return (
    <div
      className="relative flex h-full flex-1 flex-col overflow-hidden"
      style={{ background: "var(--color-vellum)" }}
    >
      {/* Floating format toolbar — appears on text selection */}
      {editor && toolbarPos && (
        <div
          className="pointer-events-auto fixed z-50 flex items-center gap-0.5 rounded-lg px-1.5 py-1"
          style={{
            top: toolbarPos.top,
            left: toolbarPos.left,
            transform: "translateX(-50%)",
            background: "var(--color-sepia)",
            border: "1px solid var(--color-border-strong)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.55)",
          }}
          onMouseDown={(e) => e.preventDefault()} // prevent editor blur
        >
          <FormatButton
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
            label="Bold"
          >
            <span className="font-bold">B</span>
          </FormatButton>
          <FormatButton
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            label="Italic"
          >
            <span className="italic">I</span>
          </FormatButton>
          <div
            className="mx-1 h-3.5 w-px"
            style={{ background: "var(--color-border)" }}
            aria-hidden
          />
          <FormatButton
            active={editor.isActive("heading", { level: 1 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 1 }).run()
            }
            label="Heading 1"
          >
            <span className="text-[10px] font-semibold tracking-tight">H1</span>
          </FormatButton>
          <FormatButton
            active={editor.isActive("heading", { level: 2 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
            label="Heading 2"
          >
            <span className="text-[10px] font-semibold tracking-tight">H2</span>
          </FormatButton>
          <div
            className="mx-1 h-3.5 w-px"
            style={{ background: "var(--color-border)" }}
            aria-hidden
          />
          <FormatButton
            active={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            label="Blockquote"
          >
            <span className="font-serif text-base leading-none">"</span>
          </FormatButton>
        </div>
      )}

      {/* Scrollable writing area */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ background: "var(--color-vellum)" }}
      >
        <div className="mx-auto w-full max-w-[800px] px-6 py-10 pb-16 min-h-[calc(100vh-9rem)]">
        {/* No extra background or shadow needed here now, since the parent is vellum */}
          <input
            id={`page-title-${currentPage.id}`}
            type="text"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                flushSync(() => setTitleDraft(currentPage.title));
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="mb-8 w-full bg-transparent font-rune-serif text-3xl font-normal leading-snug tracking-tight outline-none ring-0 focus:outline-none"
            style={{
              color: "var(--color-ink)",
              borderBottom: "1px solid transparent",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderBottomColor =
                "var(--color-border-strong)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderBottomColor = "transparent";
              void commitTitle();
            }}
            aria-label="Page title"
          />
          {editor ? <EditorContent editor={editor} /> : null}
        </div>
      </div>

      {/* Status bar */}
      <div
        className="flex shrink-0 items-center justify-end gap-4 px-8 py-2"
        style={{
          borderTop: "1px solid var(--color-border)",
          background: "var(--color-sepia)",
        }}
      >
        <span
          className={cn(
            "text-xs transition-opacity duration-500",
            showSaved ? "opacity-100" : "opacity-0"
          )}
          style={{ color: "var(--color-sage)" }}
          aria-live="polite"
        >
          Saved
        </span>
        <span
          className="text-xs tabular-nums"
          style={{ color: "var(--color-mist)" }}
        >
          {wordCount} {wordCount === 1 ? "word" : "words"}
        </span>
      </div>
    </div>
  );
}

function FormatButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded transition-colors duration-100",
        active
          ? "bg-rune-gold/25 text-rune-gold"
          : "text-rune-parchment/60 hover:bg-rune-gold/10 hover:text-rune-parchment"
      )}
    >
      {children}
    </button>
  );
}
