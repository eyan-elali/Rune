"use client";

import { EditorContent, useEditorState } from "@tiptap/react";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSceneEditor, type DisplaySyncStatus } from "@/components/editor/useSceneEditor";
import { SyncConflictModal } from "@/components/editor/SyncConflictModal";
import { createCheckoutSession } from "@/lib/actions/billing";
import { useNetworkStore } from "@/store/networkStore";
import type { Scene } from "@/lib/types";

// The Rune 2.0 writing surface: Rune's trusted editor engine (useSceneEditor —
// the same saving, offline queue, sync, conflict and word-count behaviour as
// the legacy editor) under a new, quiet presentation. One Scene per editor
// instance; the host switches Scenes through `currentScene` and this instance
// stays mounted, so a departing Scene is always flushed by its own id.
// No toolbar: formatting is by keyboard (⌘B, ⌘I) and Markdown shortcuts.

export type Rune2EditorProps = {
  projectId: string;
  /** The open Scene, or null while none is (loading, or nothing editable selected). */
  currentScene: Scene | null;
  onSceneUpdated: (sceneId: string, updates: Partial<Scene>) => void;
  /** Heading and context rendered above the prose; null renders nothing at all. */
  header: ReactNode | null;
  /** Rendered in place of the prose while no Scene is open. */
  placeholder?: ReactNode;
};

const STATUS_LABEL: Record<Exclude<DisplaySyncStatus, "conflict">, string> = {
  synced: "Saved",
  online_dirty: "Saving…",
  syncing: "Saving…",
  offline_dirty: "Saved on this device",
};

function getPromotekitReferral(): string {
  if (typeof window === "undefined") return "";
  const referral = (window as Window & { promotekit_referral?: unknown }).promotekit_referral;
  return typeof referral === "string" ? referral : "";
}

export default function Rune2Editor({
  projectId,
  currentScene,
  onSceneUpdated,
  header,
  placeholder,
}: Rune2EditorProps) {
  const {
    editor,
    syncStatus,
    wordLimit,
    wordLimitModalOpen,
    setWordLimitModalOpen,
    conflictModalOpen,
    setConflictModalOpen,
    resolveConflictKeptLocal,
    resolveConflictKeptServer,
  } = useSceneEditor({ projectId, currentScene, onSceneUpdated, placeholder: "Start writing" });
  const isOnline = useNetworkStore((s) => s.isOnline);
  const words = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      (e?.storage.characterCount?.words?.() as number | undefined) ?? 0,
  });

  useRefreshAfterSave(syncStatus);

  // A newly opened Scene starts at its top, not at the last Scene's scroll.
  const rootRef = useRef<HTMLDivElement>(null);
  const openSceneId = currentScene?.id ?? null;
  useEffect(() => {
    if (openSceneId) rootRef.current?.closest("main")?.scrollTo({ top: 0 });
  }, [openSceneId]);

  if (header === null) return null;

  const statusLabel =
    syncStatus === "conflict" ? null : !isOnline && syncStatus === "synced" ? "Offline" : STATUS_LABEL[syncStatus];

  return (
    <div className="r2-writing" ref={rootRef}>
      <article
        className="r2-doc"
        // Clicking the empty page below the prose continues writing at the end.
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && editor && currentScene) {
            e.preventDefault();
            editor.commands.focus("end");
          }
        }}
      >
        {header}
        {currentScene && editor ? (
          <EditorContent editor={editor} className="r2-prose" />
        ) : (
          placeholder ?? null
        )}
      </article>

      {currentScene && (
        <div className="r2-doc-status" aria-live="polite">
          <span className="tabular-nums">
            {words.toLocaleString()} {words === 1 ? "word" : "words"}
          </span>
          <span aria-hidden>·</span>
          {syncStatus === "conflict" ? (
            <button
              type="button"
              className="r2-doc-status-alert"
              onClick={() => setConflictModalOpen(true)}
            >
              Changed elsewhere — review
            </button>
          ) : (
            <span data-tone={syncStatus === "offline_dirty" || !isOnline ? "offline" : undefined}>
              {statusLabel}
            </span>
          )}
        </div>
      )}

      {conflictModalOpen && currentScene && (
        <SyncConflictModal
          sceneId={currentScene.id}
          onKeepLocal={resolveConflictKeptLocal}
          onKeepServer={resolveConflictKeptServer}
          onClose={() => setConflictModalOpen(false)}
        />
      )}

      {wordLimitModalOpen && (
        <WordLimitDialog
          projectId={projectId}
          wordLimit={wordLimit}
          onClose={() => setWordLimitModalOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * Re-reads the manuscript (navigator word counts) once saving has settled —
 * after a save confirms and the writer has paused, never per keystroke. The
 * editor itself is unaffected: it is keyed to the Scene id, not the data.
 */
function useRefreshAfterSave(syncStatus: DisplaySyncStatus) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (syncStatus !== "synced") {
      if (syncStatus !== "conflict") dirtyRef.current = true;
      return;
    }
    if (!dirtyRef.current) return;
    const timer = setTimeout(() => {
      dirtyRef.current = false;
      startTransition(() => router.refresh());
    }, 1500);
    return () => clearTimeout(timer);
  }, [syncStatus, router]);
}

/**
 * The free-word allowance notice (legacy pricing, still enforced — CLAUDE.md
 * §8). The engine opens it when its input guards or the server block growth;
 * the manuscript stays readable, editable downward, and exportable.
 */
function WordLimitDialog({
  projectId,
  wordLimit,
  onClose,
}: {
  projectId: string;
  wordLimit: number;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="r2-dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="r2-dialog" role="dialog" aria-modal="true" aria-labelledby="r2-word-limit-title">
        <h2 id="r2-word-limit-title">You’ve reached your free words</h2>
        <p>
          You’ve written your {wordLimit.toLocaleString()} free words. Your manuscript is safe, and
          you can export it anytime. Continue with Scribe to keep writing without limits.
        </p>
        <div className="r2-dialog-actions">
          <button type="button" className="r2-button" onClick={onClose}>
            Not now
          </button>
          <a className="r2-button" href={`/projects/${projectId}`}>
            Export manuscript
          </a>
          <button
            type="button"
            className="r2-button r2-button--primary"
            disabled={pending}
            autoFocus
            onClick={() => {
              setPending(true);
              void createCheckoutSession("scribe", "monthly", getPromotekitReferral()).then(({ url }) => {
                if (url) window.location.href = url;
                else setPending(false);
              });
            }}
          >
            {pending ? "Opening…" : "Continue with Scribe"}
          </button>
        </div>
      </div>
    </div>
  );
}
