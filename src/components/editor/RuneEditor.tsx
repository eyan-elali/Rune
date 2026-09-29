"use client";

import { EditorContent } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { cn } from "@/lib/utils";
import { renameScene } from "@/lib/actions/scenes";
import { SyncConflictModal } from "./SyncConflictModal";
import { useSceneEditor } from "./useSceneEditor";
import { useProfileStore } from "@/store/profileStore";
import { useToastStore } from "@/store/toastStore";
import type { Scene, UserPreferences } from "@/lib/types";

interface RuneEditorProps {
  projectId: string;
  /** null while editing an Unplaced Scene. */
  chapterId: string | null;
  currentScene: Scene | null;
  onSceneUpdated: (sceneId: string, updates: Partial<Scene>) => void;
  onRenameScene: (sceneId: string, title: string) => void;
  /**
   * Shown when no Scene is open (an empty Chapter or Unplaced list). The
   * editor stays mounted meanwhile, so a Scene just moved away still flushes.
   */
  emptyState?: React.ReactNode;
}

// The legacy Rune editor surface. The saving, offline and sync engine lives in
// useSceneEditor; this component is only its presentation.
export default function RuneEditor({
  projectId,
  currentScene,
  onSceneUpdated,
  onRenameScene,
  emptyState,
}: RuneEditorProps) {
  const {
    editor,
    wordCount,
    syncStatus,
    isFocusMode,
    xpFlash,
    toolbarPos,
    conflictModalOpen,
    setConflictModalOpen,
    resolveConflictKeptLocal,
    resolveConflictKeptServer,
    currentSceneRef,
    isOnlineRef,
  } = useSceneEditor({ projectId, currentScene, onSceneUpdated });
  const showToast = useToastStore((s) => s.showToast);
  const rawPrefs = useProfileStore((s) => s.profile?.preferences);
  const prefs = (rawPrefs ?? {}) as Partial<UserPreferences>;
  const fontSize = prefs.fontSize ?? 18;
  const lineHeight = prefs.lineHeight ?? 1.9;
  const wideEditor = prefs.wideEditor ?? false;
  const [titleDraft, setTitleDraft] = useState(currentScene?.title ?? "");
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTitleDraft(currentScene?.title ?? "");
  }, [currentScene?.id, currentScene?.title]);

  async function commitTitle() {
    const scene = currentSceneRef.current;
    if (!scene) return;
    const trimmed = titleDraft.trim() || "Untitled";
    if (trimmed === scene.title) {
      setTitleDraft(scene.title);
      return;
    }
    setTitleDraft(trimmed);
    onRenameScene(scene.id, trimmed);
    if (!isOnlineRef.current) {
      showToast("Title saved locally — will sync when reconnected", "info");
      return;
    }
    await renameScene(scene.id, trimmed);
  }

  if (!currentScene) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        {emptyState ?? (
          <p className="text-sm" style={{ color: "var(--color-mist)" }}>
            No scene selected
          </p>
        )}
      </div>
    );
  }

  const uiChromeFadeStyle: React.CSSProperties = {};

  return (
    <div
      className="relative flex h-full flex-1 flex-col overflow-hidden"
      style={{ background: "var(--surface-editor)" }}
    >
      {/* Floating format toolbar — appears on text selection */}
      {editor && toolbarPos && (
        <div
          className="pointer-events-auto fixed z-50 flex items-center gap-0.5 rounded-lg px-1.5 py-1"
          style={{
            top: toolbarPos.top,
            left: toolbarPos.left,
            transform: "translateX(-50%)",
            background: "var(--surface-card)",
            border: "1px solid var(--color-border-strong)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.55)",
          }}
          onMouseDown={(e) => e.preventDefault()}
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
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto"
        style={{
          background: "var(--surface-editor)",
          "--editor-font-size": `${fontSize}px`,
          "--editor-line-height": String(lineHeight),
        } as React.CSSProperties}
      >
        <div
          className={cn(
            "mx-auto w-full px-6 pb-16 pt-24 min-h-[calc(100vh-9rem)]",
            wideEditor ? "max-w-5xl" : "max-w-2xl"
          )}
        >
          <div style={{ marginBottom: "2.5rem" }}>
            <input
              id={`scene-title-${currentScene.id}`}
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
                  flushSync(() => setTitleDraft(currentScene.title));
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="w-full bg-transparent font-serif text-3xl font-bold tracking-tight outline-none ring-0 focus:outline-none"
              style={{
                color: "var(--editor-text)",
                borderBottom: "1px solid transparent",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderBottomColor = "var(--color-border-strong)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderBottomColor = "transparent";
                void commitTitle();
              }}
              aria-label="Scene title"
            />
          </div>

          {editor ? <EditorContent editor={editor} /> : null}
        </div>
      </div>

      {/* Sync status notice — hidden during onboarding */}
      <div
        className="fixed bottom-[4.5rem] right-7 z-40 md:bottom-[5rem] md:right-9 flex flex-col items-end gap-1"
        style={{
          fontSize: "11px",
          fontFamily: "var(--font-sans)",
          letterSpacing: "0.04em",
          ...uiChromeFadeStyle,
        }}
      >
        {syncStatus === 'synced' && (
          <span
            className="pointer-events-none"
            style={{ color: "var(--color-mist)", opacity: 0.6, transition: "opacity 0.4s" }}
          >
            Saved
          </span>
        )}
        {syncStatus === 'online_dirty' && (
          <span
            className="pointer-events-none"
            style={{ color: "var(--color-mist)", opacity: 0.8 }}
          >
            Saving...
          </span>
        )}
        {syncStatus === 'syncing' && (
          <span
            className="pointer-events-none"
            style={{ color: "var(--color-mist)", opacity: 0.8 }}
          >
            Syncing...
          </span>
        )}
        {syncStatus === 'offline_dirty' && (
          <span
            className="pointer-events-none"
            style={{ color: "var(--color-gold)", opacity: 0.9 }}
          >
            Saved locally
          </span>
        )}
        {syncStatus === 'conflict' && (
          <button
            type="button"
            onClick={() => setConflictModalOpen(true)}
            aria-label="Sync conflict — click to resolve"
            style={{
              color: "var(--color-crimson)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              font: "inherit",
              letterSpacing: "inherit",
            }}
          >
            Conflict
          </button>
        )}
      </div>

      {/* Sync conflict resolution modal */}
      {conflictModalOpen && currentScene && (
        <SyncConflictModal
          sceneId={currentScene.id}
          onKeepLocal={resolveConflictKeptLocal}
          onKeepServer={resolveConflictKeptServer}
          onClose={() => setConflictModalOpen(false)}
        />
      )}

      {/* Floating Word Count Pill + XP flash — hidden during onboarding */}
      <div
        className="fixed bottom-6 right-6 md:bottom-8 md:right-8 z-50 flex flex-col items-end gap-1.5"
        style={uiChromeFadeStyle}
      >
        <div
          className={cn(
            "flex items-center rounded-full shadow-xl transition-all duration-300",
            "px-3 py-1.5 text-[10px] tracking-tight",
            "2xl:px-4 2xl:py-1.5 2xl:text-[11px] 2xl:tracking-widest"
          )}
          aria-label={`${wordCount} ${wordCount === 1 ? "word" : "words"}`}
          style={{
            background: "var(--surface-card)",
            color: "var(--text-primary)",
            border: "1px solid color-mix(in srgb, var(--color-gold) 40%, transparent)"
          }}
        >
          {wordCount} <span className="ml-1 opacity-80">{wordCount === 1 ? "word" : "words"}</span>
        </div>

        <div
          className="pointer-events-none h-3 select-none pr-1 text-right font-serif text-[11px] italic tracking-wide"
          aria-live="polite"
          aria-atomic="true"
        >
          {xpFlash && !isFocusMode && (
            <span
              key={xpFlash.id}
              className="rune-xp-flash"
              style={{ color: "var(--color-gold)" }}
            >
              +{xpFlash.amount} XP ✦
            </span>
          )}
        </div>
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
          : "text-rune-text/60 hover:bg-rune-gold/10 hover:text-rune-text"
      )}
    >
      {children}
    </button>
  );
}
