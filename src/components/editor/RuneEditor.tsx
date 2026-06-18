"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { cn } from "@/lib/utils";
import { renamePage } from "@/lib/actions/pages";
import { recordWordsWritten } from "@/lib/actions/writingStats";
import { writeToPendingQueue, syncPendingWrite } from "@/lib/offline/syncEngine";
import { getOfflineDB } from "@/lib/offline/db";
import { useNetworkStore } from "@/store/networkStore";
import { awardProjectXp } from "@/lib/actions/xp";
import { xpRewardForWords } from "@/lib/xp";
import { useEditorStore } from "@/store/editorStore";
import { useModeStore } from "@/store/modeStore";
import { useProfileStore } from "@/store/profileStore";
import { useToastStore } from "@/store/toastStore";
import type { Page, UserPreferences } from "@/lib/types";

type DisplaySyncStatus = 'synced' | 'online_dirty' | 'offline_dirty' | 'syncing' | 'conflict'

async function readDbSyncStatus(pageId: string): Promise<string | null> {
  try {
    const db = await getOfflineDB()
    const pending = await db.get('pending_writes', pageId)
    return pending?.syncStatus ?? null
  } catch {
    return null
  }
}

function mapDisplayStatus(dbStatus: string | null, online: boolean): DisplaySyncStatus {
  if (!dbStatus) return 'synced'
  if (!online) return 'offline_dirty'
  if (dbStatus === 'conflict') return 'conflict'
  if (dbStatus === 'syncing') return 'syncing'
  return 'online_dirty'
}

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
  const showToast = useToastStore((s) => s.showToast);
  const rawPrefs = useProfileStore((s) => s.profile?.preferences);
  const setStoredProfile = useProfileStore((s) => s.setProfile);
  const setPendingLevelUp = useProfileStore((s) => s.setPendingLevelUp);
  const userId = useProfileStore((s) => s.profile?.id);
  const isFocusMode = useModeStore((s) => s.mode === "focus");
  const isOnline = useNetworkStore((s) => s.isOnline);
  const prefs = (rawPrefs ?? {}) as Partial<UserPreferences>;
  const fontSize = prefs.fontSize ?? 18;
  const lineHeight = prefs.lineHeight ?? 1.9;
  const wideEditor = prefs.wideEditor ?? false;
  const autoSaveDelayRef = useRef(prefs.autoSaveDelay ?? 1500);
  const isFocusModeRef = useRef(isFocusMode);

  const [syncStatus, setSyncStatus] = useState<DisplaySyncStatus>('synced');
  const [toolbarPos, setToolbarPos] = useState<ToolbarPos | null>(null);
  const [titleDraft, setTitleDraft] = useState(currentPage?.title ?? "");
  const [sessionInvalidated, setSessionInvalidated] = useState(false);
  // Ephemeral XP flash — text-only HUD pulse under the word count pill.
  // `id` retriggers the CSS animation on each increment via React key.
  const [xpFlash, setXpFlash] = useState<{ id: number; amount: number } | null>(null);
  const xpFlashTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const currentPageRef = useRef<Page | null>(currentPage);
  const onPageUpdatedRef = useRef(onPageUpdated);
  const prevPageIdRef = useRef<string | null>(null);
  const isLoadingRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
const lastSavedWordCountRef = useRef<number>(currentPage?.word_count ?? 0);
  const pastedWordsRef = useRef(0);
  const sessionInvalidatedRef = useRef(false);
  // One UUID per editor mount; persists for the lifetime of this component instance.
  const sessionId = useRef(crypto.randomUUID());
  // Tracks the last word count at which XP was awarded; advances forward only.
  const lastAwardedWordCountRef = useRef<number>(currentPage?.word_count ?? 0);
  // Refs kept in sync with props/store values so async closures always read latest.
  const isOnlineRef = useRef(isOnline);
  const prevIsOnlineRef = useRef(isOnline); // tracks prior value to detect reconnect transitions
  const userIdRef = useRef(userId);
  const projectIdRef = useRef(projectId);

  // Keep preference refs in sync without recreating the editor
  useEffect(() => {
    const delay = prefs.autoSaveDelay ?? 1500;
    autoSaveDelayRef.current = delay === 0 ? 100 : delay;
  }, [prefs.autoSaveDelay]);

  // Mirror focus-mode flag into a ref so the autosave heartbeat (which
  // runs inside the editor closure) reads the live value without forcing
  // the editor to re-instantiate.
  useEffect(() => {
    isFocusModeRef.current = isFocusMode;
    if (isFocusMode) {
      // Wipe any visible XP text the moment focus mode activates.
      clearTimeout(xpFlashTimerRef.current);
      setXpFlash(null);
    }
  }, [isFocusMode]);

  useEffect(() => { isOnlineRef.current = isOnline; }, [isOnline]);
  useEffect(() => { userIdRef.current = userId; }, [userId]);
  useEffect(() => { projectIdRef.current = projectId; }, [projectId]);

  useEffect(() => {
    onPageUpdatedRef.current = onPageUpdated;
  }, [onPageUpdated]);

  useEffect(() => {
    setTitleDraft(currentPage?.title ?? "");
  }, [currentPage?.id, currentPage?.title]);

  useEffect(() => {
    const pageId = currentPage?.id;
    if (!pageId) { setSyncStatus('synced'); return; }

    const wasOffline = !prevIsOnlineRef.current;
    prevIsOnlineRef.current = isOnline;

    if (isOnline && wasOffline) {
      // Reconnect path: show 'syncing' immediately, then resolve to final state
      void (async () => {
        const dbStatus = await readDbSyncStatus(pageId);
        if (dbStatus === 'pending' || dbStatus === 'failed') {
          setSyncStatus('syncing');
          await syncPendingWrite(pageId);
        }
        const finalStatus = await readDbSyncStatus(pageId);
        setSyncStatus(mapDisplayStatus(finalStatus, true));
      })();
    } else {
      void readDbSyncStatus(pageId).then((dbStatus) => {
        setSyncStatus(mapDisplayStatus(dbStatus, isOnline));
      });
    }
  }, [isOnline, currentPage?.id]);

  const handleSave = useCallback(async (content: Record<string, unknown>, wordCount: number) => {
    const page = currentPageRef.current;
    const uid = userIdRef.current;
    if (!page || !uid) return;

    const delta = wordCount - lastSavedWordCountRef.current;

    // Write to IndexedDB — survives network loss and tab close.
    // Explicit catch here surfaces structured-clone errors and transaction locks
    // that writeToPendingQueue's internal handler would otherwise swallow silently.
    try {
      await writeToPendingQueue(page.id, uid, content, wordCount);
    } catch (err) {
      console.error('[offline] handleSave: IDB write failed — data may not be persisted locally:', err);
    }

    setIsSaving(true);
    onPageUpdatedRef.current(page.id, { content, word_count: wordCount });

    if (delta > 0) {
      const pastedDeduction = Math.min(pastedWordsRef.current, delta);
      pastedWordsRef.current = Math.max(0, pastedWordsRef.current - pastedDeduction);
      lastSavedWordCountRef.current = wordCount;
      const adjustedDelta = delta - pastedDeduction;
      // Guard: recordWordsWritten makes live DB mutations — skip when offline
      // so a failed tracking call never breaks the primary save stack.
      if (adjustedDelta > 0 && isOnlineRef.current) {
        void recordWordsWritten(projectIdRef.current, adjustedDelta, page.id)
          .catch(err => console.error('[offline] recordWordsWritten failed:', err));
      }
    }

    if (isOnlineRef.current) {
      setSyncStatus('syncing');
      await syncPendingWrite(page.id);
      setLastSaved(new Date());
    }

    setIsSaving(false);
    void readDbSyncStatus(page.id).then((dbStatus) => {
      setSyncStatus(mapDisplayStatus(dbStatus, isOnlineRef.current));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveRef = useRef(handleSave);
  useEffect(() => { handleSaveRef.current = handleSave; }, [handleSave]);

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
    editorProps: {
      handlePaste: (_view, event) => {
        const text = event.clipboardData?.getData("text/plain") ?? "";
        const wc = text.split(/\s+/).filter((t) => t.length >= 2).length;
        if (wc > 0) {
          pastedWordsRef.current += wc;
          if (!sessionInvalidatedRef.current) {
            sessionInvalidatedRef.current = true;
            setSessionInvalidated(true);
          }
        }
        return false; // allow normal paste insertion — content is preserved
      },
    },
    onUpdate({ editor }) {
      if (isLoadingRef.current) return;

      // Per-keystroke: write to IndexedDB immediately, zero lag, no debounce.
      // This is the data-safety layer — the user's words are captured on every stroke.
      const pageNow = currentPageRef.current;
      const uidNow = userIdRef.current;
      if (pageNow && uidNow) {
        const contentNow = editor.getJSON() as Record<string, unknown>;
        const wcNow = (editor.storage.characterCount?.words?.() as number | undefined) ?? 0;
        try {
          void writeToPendingQueue(pageNow.id, uidNow, contentNow, wcNow);
        } catch (err) {
          console.error('[offline] onUpdate: per-keystroke IDB write failed:', err);
        }
        setSyncStatus(isOnlineRef.current ? 'online_dirty' : 'offline_dirty');
      }

      // Debounced cloud push — fires only after the user pauses writing.
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        if (isLoadingRef.current) return;
        const page = currentPageRef.current;
        if (!page) return;

        const content = editor.getJSON() as Record<string, unknown>;
        const wordCount =
          (editor.storage.characterCount?.words?.() as number | undefined) ?? 0;

        await handleSaveRef.current(content, wordCount);

        // XP heartbeat — fire after every save, additions only.
        // Math/server pipeline always runs; HUD pulse suppressed in focus mode.
        const wordsThisIncrement = wordCount - lastAwardedWordCountRef.current;
        if (wordsThisIncrement > 0 && !sessionInvalidatedRef.current) {
          const xpGain = xpRewardForWords(wordsThisIncrement);
          lastAwardedWordCountRef.current = wordCount;
          void awardProjectXp(xpGain, { mode: "project" }, sessionId.current).then((result) => {
            if (result.data) {
              setStoredProfile(result.data);
              if (result.data.leveledUp) {
                setPendingLevelUp({ newLevel: result.data.newLevel, newUnlockables: result.data.newUnlockables });
              }
              if (!isFocusModeRef.current) {
                setXpFlash({ id: Date.now(), amount: xpGain });
                clearTimeout(xpFlashTimerRef.current);
                xpFlashTimerRef.current = setTimeout(() => setXpFlash(null), 2200);
              }
            }
          });
        }
      }, Math.max(autoSaveDelayRef.current, 2500));
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
      const uid = userIdRef.current;
      if (uid) {
        void (async () => {
          await writeToPendingQueue(prevPageId, uid, content, wordCount);
          onPageUpdatedRef.current(prevPageId, { content, word_count: wordCount });
          if (isOnlineRef.current) {
            void syncPendingWrite(prevPageId);
          }
        })();
      }
    }

    prevPageIdRef.current = newPageId;
    currentPageRef.current = currentPage ?? null;
    lastSavedWordCountRef.current = currentPage?.word_count ?? 0;
    lastAwardedWordCountRef.current = currentPage?.word_count ?? 0;
    pastedWordsRef.current = 0;
    sessionInvalidatedRef.current = false;
    setSessionInvalidated(false);

    isLoadingRef.current = true;
    editor.commands.setContent(currentPage?.content ?? null);
    lastSavedWordCountRef.current =
      (editor.storage.characterCount?.words?.() as number | undefined) ??
      currentPage?.word_count ??
      0;
    lastAwardedWordCountRef.current = lastSavedWordCountRef.current;
    setTimeout(() => {
      isLoadingRef.current = false;
    }, 0);
  }, [editor, currentPage?.id]); // intentionally omitting currentPage to avoid re-running on word_count updates

  // Trailing XP sync on unmount — catches words saved but not yet awarded
  useEffect(() => {
    return () => {
      const remaining = lastSavedWordCountRef.current - lastAwardedWordCountRef.current;
      if (remaining > 0 && !sessionInvalidatedRef.current) {
        void awardProjectXp(xpRewardForWords(remaining), { mode: "project" }, sessionId.current);
      }
      clearTimeout(xpFlashTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            "mx-auto w-full px-6 pt-24 pb-16 min-h-[calc(100vh-9rem)]",
            wideEditor ? "max-w-5xl" : "max-w-2xl"
          )}
        >
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
            className={cn(
              "mb-10 w-full bg-transparent font-serif outline-none ring-0 focus:outline-none",
              // 1. Size: 4xl is the 'tiny bit bigger' step up from 3xl
              "text-3xl",
              // 2. Weight: font-medium (500) gives it that 'thick' feel you wanted
              "font-bold tracking-tight"
            )}          
            style={{
              color: "var(--editor-text)",
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


{/* Sync status indicator */}
<div
  className="fixed bottom-[4.5rem] right-7 z-40 md:bottom-[5rem] md:right-9"
  style={{ fontSize: "11px", fontFamily: "var(--font-sans)", letterSpacing: "0.04em" }}
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
      onClick={() => showToast("Conflict: your draft and the server diverged. Resolve before syncing.", "error")}
      aria-label="Sync conflict — click for details"
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

{/* Floating Word Count Pill + text-only XP flash anchor */}
<div className="fixed bottom-6 right-6 md:bottom-8 md:right-8 z-50 flex flex-col items-end gap-1.5">
  <div
    className={cn(
      "flex items-center rounded-full shadow-xl transition-all duration-300",
      "px-3 py-1.5 text-[10px] tracking-tight", // Laptop/Mobile defaults
      "2xl:px-4 2xl:py-1.5 2xl:text-[11px] 2xl:tracking-widest" // Big monitor upgrades
    )}
    aria-label={`${wordCount} ${wordCount === 1 ? "word" : "words"}${sessionInvalidated ? " — paste detected" : ""}`}
    style={{
      background: "var(--surface-card)",
      color: "var(--text-primary)",
      border: "1px solid rgba(201, 168, 76, 0.4)"
    }}
  >
    {wordCount} <span className="ml-1 opacity-80">{wordCount === 1 ? "word" : "words"}</span>
  </div>

  {/* Text-only XP HUD — no container, no border, fades in/out beneath the pill */}
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
  ); // This closes the return (
} // This closes the RuneEditor function

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
