"use client";

import { EditorContent, useEditorState } from "@tiptap/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
  type RefObject,
} from "react";
import { useRouter } from "next/navigation";
import { useSceneEditor, type DisplaySyncStatus } from "@/components/editor/useSceneEditor";
import { SyncConflictModal } from "@/components/editor/SyncConflictModal";
import { createCheckoutSession } from "@/lib/actions/billing";
import { useNetworkStore } from "@/store/networkStore";
import type { Scene } from "@/lib/types";

// The Rune 2.0 writing surface: Rune's trusted editor engine (useSceneEditor —
// the same saving, offline queue, sync, conflict and word-count behaviour as
// the legacy editor) under a new, quiet presentation.
//
// The surface shows one or more Scenes in order — a focused Scene, or a whole
// Chapter read as one continuous piece of prose. Every Scene has its own
// editor instance (architecture §7: one Scene per editor instance), created
// for that Scene and bound to it for its whole life: an instance never
// switches Scenes, so nothing typed in one Scene can be saved under another.
// Blocks are keyed by Scene id, so a Scene that stays on screen between views
// (Chapter → one of its Scenes, or a Chapter gaining a second Scene) keeps
// its live editor; a Scene that leaves is flushed by the engine's unmount
// path and hands its last content back to the host.
//
// Deliberately not continuous across Scene boundaries (yet): a selection
// cannot span two Scenes, Backspace at a Scene's start does not merge it
// into the one before, arrow keys stop at a Scene's edge, and undo is per
// Scene. No toolbar: formatting is by keyboard (⌘B, ⌘I) and Markdown shortcuts.

export type SurfaceScene = {
  id: string;
  /** Null while the Scene is loading (or failed to load). */
  scene: Scene | null;
  failed: boolean;
  /** Boundary label (see WritingScene.mark). */
  mark: string | null;
};

export type Rune2EditorProps = {
  projectId: string;
  /** Changes when the writer opens something else: the surface returns to its top. */
  viewKey: string | null;
  scenes: SurfaceScene[];
  /** Draw Scene boundaries (a Chapter whose Scene structure is visible). */
  marks: boolean;
  onSceneUpdated: (sceneId: string, updates: Partial<Scene>) => void;
  onRetry: (sceneId: string) => void;
  /** A boundary label was chosen: open that Scene on its own. */
  onOpenScene: (sceneId: string) => void;
  /** A Scene whose prose should take focus once its editor is ready. */
  focusSceneId: string | null;
  onFocusHandled: () => void;
  /** Heading and context rendered above the prose; null renders nothing at all. */
  header: ReactNode | null;
  /** Rendered in place of the prose when there are no Scenes. */
  placeholder?: ReactNode;
};

type BlockState = { words: number; syncStatus: DisplaySyncStatus; wordLimit: number | null };
type BlockHandle = { focusEnd: () => void; openConflict: () => void; closeWordLimit: () => void };

const STATUS_LABEL: Record<Exclude<DisplaySyncStatus, "conflict">, string> = {
  synced: "Saved",
  online_dirty: "Saving…",
  syncing: "Saving…",
  offline_dirty: "Saved on this device",
};

// The surface shows one save state for all its Scenes: the one most in need
// of the writer's attention.
const STATUS_RANK: Record<DisplaySyncStatus, number> = {
  synced: 0,
  online_dirty: 1,
  syncing: 2,
  offline_dirty: 3,
  conflict: 4,
};

function getPromotekitReferral(): string {
  if (typeof window === "undefined") return "";
  const referral = (window as Window & { promotekit_referral?: unknown }).promotekit_referral;
  return typeof referral === "string" ? referral : "";
}

export default function Rune2Editor({
  projectId,
  viewKey,
  scenes,
  marks,
  onSceneUpdated,
  onRetry,
  onOpenScene,
  focusSceneId,
  onFocusHandled,
  header,
  placeholder,
}: Rune2EditorProps) {
  const isOnline = useNetworkStore((s) => s.isOnline);
  const handles = useRef(new Map<string, BlockHandle>());
  const [blocks, setBlocks] = useState<Record<string, BlockState>>({});

  const report = useCallback((sceneId: string, state: BlockState | null) => {
    setBlocks((prev) => {
      const current = prev[sceneId];
      if (state === null) {
        if (!current) return prev;
        const next = { ...prev };
        delete next[sceneId];
        return next;
      }
      if (
        current &&
        current.words === state.words &&
        current.syncStatus === state.syncStatus &&
        current.wordLimit === state.wordLimit
      ) {
        return prev;
      }
      return { ...prev, [sceneId]: state };
    });
  }, []);

  const shown = scenes.map((s) => blocks[s.id]).filter((b): b is BlockState => b !== undefined);
  const syncStatus = shown.reduce<DisplaySyncStatus>(
    (worst, b) => (STATUS_RANK[b.syncStatus] > STATUS_RANK[worst] ? b.syncStatus : worst),
    "synced"
  );
  // Every Scene shown counts: live words for an open Scene, its last known
  // count while it loads.
  const words = scenes.reduce((n, s) => n + (blocks[s.id]?.words ?? s.scene?.word_count ?? 0), 0);
  const wordLimit = shown.find((b) => b.wordLimit !== null)?.wordLimit ?? null;

  useRefreshAfterSave(syncStatus);

  // Opening something else starts at its top, not at the last view's scroll.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (viewKey) rootRef.current?.closest("main")?.scrollTo({ top: 0 });
  }, [viewKey]);

  if (header === null) return null;

  const statusLabel =
    syncStatus === "conflict" ? null : !isOnline && syncStatus === "synced" ? "Offline" : STATUS_LABEL[syncStatus];
  const lastSceneId = scenes.length > 0 ? scenes[scenes.length - 1].id : null;

  return (
    <div className="r2-writing" ref={rootRef}>
      <article
        className="r2-doc"
        data-marks={marks || undefined}
        // Clicking the empty page below the prose continues writing at the end.
        onMouseDown={(e) => {
          const handle = lastSceneId ? handles.current.get(lastSceneId) : undefined;
          if (e.target === e.currentTarget && handle) {
            e.preventDefault();
            handle.focusEnd();
          }
        }}
      >
        {header}
        {scenes.length > 0 ? (
          <div className="r2-scenes">
            {scenes.map((item) =>
              item.scene ? (
                <SceneBlock
                  key={item.id}
                  projectId={projectId}
                  scene={item.scene}
                  mark={marks ? item.mark : undefined}
                  onSceneUpdated={onSceneUpdated}
                  onReport={report}
                  handles={handles}
                  focusRequested={focusSceneId === item.id}
                  onFocusHandled={onFocusHandled}
                  onOpenScene={onOpenScene}
                />
              ) : (
                <section key={`pending:${item.id}`} className="r2-scene" data-state="pending">
                  {marks && <SceneMark label={item.mark} />}
                  {item.failed && (
                    <div className="r2-doc-empty" role="alert">
                      <p>This scene couldn’t be opened.</p>
                      <button type="button" className="r2-button" onClick={() => onRetry(item.id)}>
                        Try again
                      </button>
                    </div>
                  )}
                </section>
              )
            )}
          </div>
        ) : (
          placeholder ?? null
        )}
      </article>

      {shown.length > 0 && (
        <div className="r2-doc-status" aria-live="polite">
          <span className="tabular-nums">
            {words.toLocaleString()} {words === 1 ? "word" : "words"}
          </span>
          <span aria-hidden>·</span>
          {syncStatus === "conflict" ? (
            <button
              type="button"
              className="r2-doc-status-alert"
              onClick={() => {
                const conflicted = scenes.find((s) => blocks[s.id]?.syncStatus === "conflict");
                if (conflicted) handles.current.get(conflicted.id)?.openConflict();
              }}
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

      {wordLimit !== null && (
        <WordLimitDialog
          projectId={projectId}
          wordLimit={wordLimit}
          onClose={() => handles.current.forEach((h) => h.closeWordLimit())}
        />
      )}
    </div>
  );
}

/**
 * One Scene's editor: its own engine instance, created for this Scene and
 * never switched to another. Reports its live words and save state to the
 * surface, which shows one status line and one word-limit notice for all.
 */
function SceneBlock({
  projectId,
  scene,
  mark,
  onSceneUpdated,
  onReport,
  handles,
  focusRequested,
  onFocusHandled,
  onOpenScene,
}: {
  projectId: string;
  scene: Scene;
  /** undefined: no boundary (the Scene is the whole surface, or a hidden-Scene Chapter). */
  mark: string | null | undefined;
  onSceneUpdated: (sceneId: string, updates: Partial<Scene>) => void;
  onReport: (sceneId: string, state: BlockState | null) => void;
  handles: RefObject<Map<string, BlockHandle>>;
  focusRequested: boolean;
  onFocusHandled: () => void;
  onOpenScene: (sceneId: string) => void;
}) {
  const sceneId = scene.id;
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
  } = useSceneEditor({
    projectId,
    currentScene: scene,
    onSceneUpdated,
    placeholder: "Start writing",
    // Several editors share the surface; none takes focus on its own.
    autofocus: false,
  });
  const words = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      (e?.storage.characterCount?.words?.() as number | undefined) ?? 0,
  });

  useEffect(() => {
    onReport(sceneId, { words, syncStatus, wordLimit: wordLimitModalOpen ? wordLimit : null });
  }, [onReport, sceneId, words, syncStatus, wordLimitModalOpen, wordLimit]);
  useEffect(() => () => onReport(sceneId, null), [onReport, sceneId]);

  useEffect(() => {
    const map = handles.current;
    map.set(sceneId, {
      focusEnd: () => editor?.commands.focus("end"),
      openConflict: () => setConflictModalOpen(true),
      closeWordLimit: () => setWordLimitModalOpen(false),
    });
    return () => {
      map.delete(sceneId);
    };
  }, [handles, sceneId, editor, setConflictModalOpen, setWordLimitModalOpen]);

  // Leaving the surface: the engine's unmount path has already queued and
  // synced any unsaved tail by this Scene's id; hand the host the content
  // this editor last held, so reopening the Scene starts from it. (The
  // engine's own saves already report through onSceneUpdated; its unmount
  // flush does not.) TipTap destroys the editor a tick after unmount, so it
  // is still readable here — and an already-destroyed one is never read,
  // since its emptied storage would report zero words.
  const onSceneUpdatedRef = useRef(onSceneUpdated);
  useEffect(() => {
    onSceneUpdatedRef.current = onSceneUpdated;
  }, [onSceneUpdated]);
  useEffect(() => {
    if (!editor) return;
    return () => {
      if (editor.isDestroyed) return;
      const count = editor.storage.characterCount?.words?.() as number | undefined;
      if (typeof count !== "number") return;
      onSceneUpdatedRef.current(sceneId, { content: editor.getJSON(), word_count: count });
    };
  }, [editor, sceneId]);

  // A Scene just added to this Chapter: bring it into view and start writing.
  const rootRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!focusRequested || !editor) return;
    editor.chain().focus("start", { scrollIntoView: false }).run();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rootRef.current?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    onFocusHandled();
  }, [focusRequested, editor, onFocusHandled]);

  return (
    <section ref={rootRef} className="r2-scene" data-scene-id={sceneId}>
      {mark !== undefined && <SceneMark label={mark} onOpen={() => onOpenScene(sceneId)} />}
      {editor && <EditorContent editor={editor} className="r2-prose" />}

      {conflictModalOpen && (
        <SyncConflictModal
          sceneId={sceneId}
          onKeepLocal={resolveConflictKeptLocal}
          onKeepServer={resolveConflictKeptServer}
          onClose={() => setConflictModalOpen(false)}
        />
      )}
    </section>
  );
}

/**
 * The boundary above a Scene in a Chapter that shows its Scenes: a hairline
 * and, for a named Scene, its title — quiet until the Scene is hovered or
 * being written in. The title opens the Scene on its own. Never part of the
 * prose, and never exported.
 */
function SceneMark({ label, onOpen }: { label: string | null; onOpen?: () => void }) {
  return (
    <div className="r2-scene-mark">
      {label !== null &&
        (onOpen ? (
          <button type="button" onClick={onOpen} title="Open this scene on its own">
            {label}
          </button>
        ) : (
          <span>{label}</span>
        ))}
    </div>
  );
}

/**
 * Re-reads the manuscript (navigator word counts) once saving has settled —
 * after a save confirms and the writer has paused, never per keystroke. The
 * editors themselves are unaffected: they are keyed to Scene ids, not data.
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
