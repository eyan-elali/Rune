"use client";

import { useEditor, type FocusPosition } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import { isHistoryTransaction } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { useCallback, useEffect, useRef, useState } from "react";
import { getLocalDateString } from "@/lib/utils";
import { recordWordsWritten } from "@/lib/actions/writingStats";
import { writeToPendingQueue, syncPendingWrite } from "@/lib/offline/syncEngine";
import { getOfflineDB, getPendingWrite, storeOfflineWritingCredit, SCENE_CACHE_STORE } from "@/lib/offline/db";
import { useNetworkStore } from "@/store/networkStore";
import { awardProjectXp } from "@/lib/actions/xp";
import { xpRewardForWords } from "@/lib/xp";
import { unlockToastMessage } from "@/lib/unlockables";
import { useEditorStore } from "@/store/editorStore";
import { useModeStore } from "@/store/modeStore";
import { useProfileStore } from "@/store/profileStore";
import { useToastStore } from "@/store/toastStore";
import type { Scene, UserPreferences } from "@/lib/types";
import { SCENE_RESTORED_EVENT } from "@/lib/sceneRestoredEvent";

// The manuscript editor's engine, shared by every editor surface (the legacy
// RuneEditor and the Rune 2.0 writing surface): TipTap setup, per-keystroke
// IndexedDB writes, the debounced sync, conflict baselines, the typed-word
// ledger, and the flushes on Scene switch and unmount. (Rune 2.0 has no
// free-word limit — migration 037 — so there are no input guards: writing
// is never blocked.) Moved here verbatim from RuneEditor.tsx — presentation stays with
// each surface. One Scene per editor instance: the caller switches Scenes by
// changing `currentScene`, and the departing Scene is flushed by its own id.
//
// Depends on the profile store (user id, preferences) and the
// network store being hydrated, as the (app) and (rune2) layouts do.

export type DisplaySyncStatus = 'synced' | 'online_dirty' | 'offline_dirty' | 'syncing' | 'conflict'

async function readDbSyncStatus(sceneId: string): Promise<string | null> {
  try {
    const db = await getOfflineDB()
    const pending = await db.get('pending_writes', sceneId)
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

// Mirrors @tiptap/extensions CharacterCount's default wordCounter exactly (split on
// literal " " after textBetween, drop empty tokens). The eligibility ledger below
// diffs word counts across transactions, so it must use the identical algorithm —
// any drift here (e.g. a regex-based approximation) lets pasted words that this
// count over/under-reports slip past the paste exclusion as "typed."
function countWords(doc: ProseMirrorNode): number {
  const text = doc.textBetween(0, doc.content.size, " ", " ")
  return text.split(" ").filter((word) => word !== "").length
}

export interface UseSceneEditorOptions {
  projectId: string;
  currentScene: Scene | null;
  onSceneUpdated: (sceneId: string, updates: Partial<Scene>) => void;
  /** Placeholder shown in an empty Scene. Read once, when the editor is created. */
  placeholder?: string;
  /**
   * Where the editor takes focus when it is created; false leaves focus where
   * it is (several Scene editors on one surface must not compete for it).
   * Read once, when the editor is created.
   */
  autofocus?: FocusPosition;
}

export interface ToolbarPos {
  top: number;
  left: number;
}

export function useSceneEditor({
  projectId,
  currentScene,
  onSceneUpdated,
  placeholder = "Begin your story...",
  autofocus = "start",
}: UseSceneEditorOptions) {
  const { setIsSaving, setLastSaved } = useEditorStore();
  const showToast = useToastStore((s) => s.showToast);
  const rawPrefs = useProfileStore((s) => s.profile?.preferences);
  const setStoredProfile = useProfileStore((s) => s.setProfile);
  const setPendingLevelUp = useProfileStore((s) => s.setPendingLevelUp);
  const userId = useProfileStore((s) => s.profile?.id);
  const isFocusMode = useModeStore((s) => s.mode === "focus");
  const isOnline = useNetworkStore((s) => s.isOnline);
  const prefs = (rawPrefs ?? {}) as Partial<UserPreferences>;
  const autoSaveDelayRef = useRef(prefs.autoSaveDelay ?? 1500);
  const isFocusModeRef = useRef(isFocusMode);

  const [syncStatus, setSyncStatus] = useState<DisplaySyncStatus>('synced');
  const syncStatusRef = useRef<DisplaySyncStatus>('synced');
  function setSyncStatusAndRef(s: DisplaySyncStatus) {
    syncStatusRef.current = s;
    setSyncStatus(s);
  }
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [toolbarPos, setToolbarPos] = useState<ToolbarPos | null>(null);
  const [xpFlash, setXpFlash] = useState<{ id: number; amount: number } | null>(null);
  const xpFlashTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const currentSceneRef = useRef<Scene | null>(currentScene);
  const onSceneUpdatedRef = useRef(onSceneUpdated);
  const prevSceneIdRef = useRef<string | null>(null);
  const isLoadingRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastSavedWordCountRef = useRef<number>(currentScene?.word_count ?? 0);
  // The word count this tab last confirmed the server actually holds for the
  // current scene — set on scene load/switch and advanced only after this
  // tab's own sync is confirmed successful (never optimistically, and never
  // via IndexedDB, which every tab of the browser shares). Passed to
  // syncPendingWrite as the private conflict-detection baseline so a sibling
  // tab's save can't silently erase evidence of divergence the way the
  // shared IndexedDB cache does. See syncEngine.ts for why word_count
  // specifically (not version/updated_at, which unrelated updates also bump).
  const expectedServerWordCountRef = useRef<number>(currentScene?.word_count ?? 0);
  // Net word-count delta contributed by transactions classified as directly typed
  // (see onTransaction below). Paste, drop, and undo/redo never add to this — so
  // it can't retroactively "absorb" pasted words on a later save or keystroke.
  // Consumed (reduced) only when a save successfully credits XP/writing-stats.
  const pendingEligibleWordsRef = useRef(0);
  const sessionId = useRef(crypto.randomUUID());
  const isOnlineRef = useRef(isOnline);
  const prevIsOnlineRef = useRef(isOnline);
  const userIdRef = useRef(userId);
  const projectIdRef = useRef(projectId);

  useEffect(() => {
    const delay = prefs.autoSaveDelay ?? 1500;
    autoSaveDelayRef.current = delay === 0 ? 100 : delay;
  }, [prefs.autoSaveDelay]);

  useEffect(() => {
    isFocusModeRef.current = isFocusMode;
    if (isFocusMode) {
      clearTimeout(xpFlashTimerRef.current);
      setXpFlash(null);
    }
  }, [isFocusMode]);

  useEffect(() => { isOnlineRef.current = isOnline; }, [isOnline]);
  useEffect(() => { userIdRef.current = userId; }, [userId]);
  useEffect(() => { projectIdRef.current = projectId; }, [projectId]);

  useEffect(() => {
    onSceneUpdatedRef.current = onSceneUpdated;
  }, [onSceneUpdated]);

  useEffect(() => {
    const sceneId = currentScene?.id;
    if (!sceneId) { setSyncStatusAndRef('synced'); return; }

    const wasOffline = !prevIsOnlineRef.current;
    prevIsOnlineRef.current = isOnline;

    if (isOnline && wasOffline) {
      void (async () => {
        const dbStatus = await readDbSyncStatus(sceneId);
        if (dbStatus === 'pending' || dbStatus === 'failed') {
          const pendingBefore = await getPendingWrite(sceneId);
          setSyncStatusAndRef('syncing');
          await syncPendingWrite(sceneId, 'online', expectedServerWordCountRef.current);
          const afterStatus = await readDbSyncStatus(sceneId);
          setSyncStatusAndRef(mapDisplayStatus(afterStatus, true));
          if (!afterStatus && pendingBefore) {
            expectedServerWordCountRef.current = pendingBefore.wordCount;
          }
        } else if (dbStatus === 'syncing') {
          setSyncStatusAndRef('syncing');
        } else {
          setSyncStatusAndRef(mapDisplayStatus(dbStatus, true));
        }
      })();
    } else {
      void readDbSyncStatus(sceneId).then((dbStatus) => {
        setSyncStatusAndRef(mapDisplayStatus(dbStatus, isOnline));
      });
    }
  }, [isOnline, currentScene?.id]);

  useEffect(() => {
    function handleSyncQueueUpdated() {
      const sceneId = currentSceneRef.current?.id;
      if (!sceneId) return;
      void readDbSyncStatus(sceneId).then((dbStatus) => {
        setSyncStatusAndRef(mapDisplayStatus(dbStatus, isOnlineRef.current));
      });
    }
    window.addEventListener('rune-sync-queue-updated', handleSyncQueueUpdated);
    return () => window.removeEventListener('rune-sync-queue-updated', handleSyncQueueUpdated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = useCallback(async (content: Record<string, unknown>, wordCount: number, creditableWords: number) => {
    const scene = currentSceneRef.current;
    const uid = userIdRef.current;
    if (!scene || !uid) return;

    try {
      await writeToPendingQueue(scene.id, uid, content, wordCount);
    } catch (err) {
      console.error('[offline] handleSave: IDB write failed — data may not be persisted locally:', err);
    }

    setIsSaving(true);
    onSceneUpdatedRef.current(scene.id, { content, word_count: wordCount });

    // Always advance to the actual current total — including on deletions/undo —
    // so this baseline never goes stale. A baseline that only moved on growth
    // let a later increase (e.g. a redo restoring deleted content) be measured
    // against a too-low remembered total and misread as fresh growth.
    lastSavedWordCountRef.current = wordCount;

    if (creditableWords > 0) {
      if (isOnlineRef.current) {
        void recordWordsWritten(projectIdRef.current, creditableWords, scene.id, getLocalDateString())
          .catch(err => console.error('[offline] recordWordsWritten failed:', err));
      } else {
        // Queue a writing credit to be applied once we reconnect.
        void storeOfflineWritingCredit(projectIdRef.current, scene.id, creditableWords)
          .catch(err => console.error('[offline] storeOfflineWritingCredit failed:', err));
      }
    }

    if (isOnlineRef.current) {
      // No conflict pre-check here: syncPendingWrite re-runs conflict
      // detection on every call, so a stale 'conflict' latch (e.g. one raised
      // against a still-empty server scene) heals itself, while a genuine
      // two-writer conflict is simply re-confirmed and surfaces through the
      // status read below. Skipping the sync on a latched status was what let
      // a single false positive permanently block every future upload.
      setSyncStatusAndRef('syncing');
      await syncPendingWrite(scene.id, 'online', expectedServerWordCountRef.current);
      setLastSaved(new Date());
    }

    setIsSaving(false);
    void readDbSyncStatus(scene.id).then((dbStatus) => {
      setSyncStatusAndRef(mapDisplayStatus(dbStatus, isOnlineRef.current));
      if (!dbStatus) {
        // Confirmed synced — advance this tab's private baseline to what the
        // server now actually holds, so the next save's conflict check
        // compares against reality instead of the pre-edit word count.
        expectedServerWordCountRef.current = wordCount;
      }
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
        placeholder,
        emptyEditorClass: "is-editor-empty",
        emptyNodeClass: "is-empty",
        showOnlyWhenEditable: true,
        showOnlyCurrent: true,
      }),
      CharacterCount,
    ],
    content: currentScene?.content ?? null,
    autofocus,
    onTransaction({ transaction }) {
      // Programmatic content loads (scene switch, hydration, sync reconciliation,
      // conflict resolution) all run with isLoadingRef true — never eligible.
      if (isLoadingRef.current) return;
      if (!transaction.docChanged) return;

      const before = countWords(transaction.before);
      const after = countWords(transaction.doc);
      const delta = after - before;
      if (delta === 0) return;

      if (delta < 0) {
        // Any deletion (regardless of origin) shrinks the eligible pool first —
        // words that no longer exist in the document can't be pending-eligible.
        pendingEligibleWordsRef.current = Math.max(0, pendingEligibleWordsRef.current + delta);
        return;
      }

      // Paste, drag-and-drop, and undo/redo replay all land words in the
      // manuscript but are never eligible for XP. Undo/redo is excluded because
      // ProseMirror's history replay carries no record of whether the words it's
      // restoring were originally typed or pasted — treating all history
      // navigation as ineligible is the only way to guarantee redoing a paste
      // can never grant XP.
      const isPasteOrDrop =
        transaction.getMeta("paste") === true ||
        transaction.getMeta("uiEvent") === "paste" ||
        transaction.getMeta("uiEvent") === "drop";
      const isHistoryNav = isHistoryTransaction(transaction);

      if (!isPasteOrDrop && !isHistoryNav) {
        pendingEligibleWordsRef.current += delta;
      }
    },
    onUpdate({ editor }) {
      if (isLoadingRef.current) return;

      // Per-keystroke IDB write (best-effort).
      const sceneNow = currentSceneRef.current;
      const uidNow = userIdRef.current;
      if (sceneNow && uidNow) {
        const contentNow = editor.getJSON() as Record<string, unknown>;
        const wcNow = (editor.storage.characterCount?.words?.() as number | undefined) ?? 0;

        try {
          void writeToPendingQueue(sceneNow.id, uidNow, contentNow, wcNow);
        } catch (err) {
          console.error('[offline] onUpdate: per-keystroke IDB write failed:', err);
        }

        if (syncStatusRef.current !== 'conflict') {
          setSyncStatusAndRef(isOnlineRef.current ? 'online_dirty' : 'offline_dirty');
        }
      }

      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        if (isLoadingRef.current) return;
        const scene = currentSceneRef.current;
        if (!scene) return;
        // Guard against a debounce timer that outlives the editor (e.g. the
        // component unmounts before the timer fires). Tiptap's destroy() wipes
        // `editor.storage` to `{}`, so reading word count here would silently
        // save word_count: 0 while getJSON() still returns real content —
        // corrupting the stored word count without the user deleting anything.
        if (!editor || editor.isDestroyed) return;

        const content = editor.getJSON() as Record<string, unknown>;
        const wordCount =
          (editor.storage.characterCount?.words?.() as number | undefined) ?? 0;

        // Single snapshot of the eligible-word ledger, shared by writing-stats and
        // XP below — the only number either system uses to represent "how many
        // typed words this cycle." Capped to the manuscript's own net growth this
        // cycle (never awarded when the scene's total didn't actually grow), same
        // invariant the previous per-cycle deduction preserved.
        const rawDelta = wordCount - lastSavedWordCountRef.current;
        const eligibleWords = pendingEligibleWordsRef.current;
        const creditableWords = rawDelta > 0 ? Math.min(eligibleWords, rawDelta) : 0;

        await handleSaveRef.current(content, wordCount, creditableWords);

        pendingEligibleWordsRef.current = Math.max(0, pendingEligibleWordsRef.current - creditableWords);
        if (creditableWords > 0) {
          const xpGain = xpRewardForWords(creditableWords);
          void awardProjectXp(xpGain, { mode: "project" }, sessionId.current).then((result) => {
            if (result.data) {
              setStoredProfile(result.data);
              if (result.data.leveledUp) {
                setPendingLevelUp({ newLevel: result.data.newLevel, newUnlockables: result.data.newUnlockables });
              } else if (result.data.newUnlockables.length > 0) {
                showToast(unlockToastMessage(result.data.newUnlockables), "success");
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
      setTimeout(() => setToolbarPos(null), 150);
    },
  });

  // Handle scene switching and initial load
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!editor) return;

    const prevSceneId = prevSceneIdRef.current;
    const newSceneId = currentScene?.id ?? null;

    if (prevSceneId && prevSceneId !== newSceneId) {
      clearTimeout(saveTimerRef.current);
      const content = editor.getJSON() as Record<string, unknown>;
      const wordCount =
        (editor.storage.characterCount?.words?.() as number | undefined) ?? 0;
      const uid = userIdRef.current;
      // Captured synchronously, before the refs are reassigned below for the
      // new scene — reading them lazily inside the async block below would
      // race the synchronous reset that happens later in this same effect.
      const prevExpectedWordCount = expectedServerWordCountRef.current;
      // Writing credit for typed words whose debounce cycle never fired —
      // without this, switching scenes before the debounce silently dropped
      // the tail of the session from Today's Words. Same ledger math as the
      // debounce path; if the debounce already ran, rawDelta is 0 and nothing
      // is double-credited. (The ledger ref is reset for the new scene just
      // below, so this is also its only consumer for the old scene.)
      const rawDelta = wordCount - lastSavedWordCountRef.current;
      const creditableWords =
        rawDelta > 0 ? Math.min(pendingEligibleWordsRef.current, rawDelta) : 0;
      const prevProjectId = projectIdRef.current;
      if (uid) {
        void (async () => {
          await writeToPendingQueue(prevSceneId, uid, content, wordCount);
          onSceneUpdatedRef.current(prevSceneId, { content, word_count: wordCount });
          if (creditableWords > 0) {
            if (isOnlineRef.current) {
              void recordWordsWritten(prevProjectId, creditableWords, prevSceneId, getLocalDateString())
                .catch(err => console.error('[offline] recordWordsWritten (scene switch) failed:', err));
            } else {
              void storeOfflineWritingCredit(prevProjectId, prevSceneId, creditableWords)
                .catch(err => console.error('[offline] storeOfflineWritingCredit (scene switch) failed:', err));
            }
          }
          if (isOnlineRef.current) {
            void syncPendingWrite(prevSceneId, 'online', prevExpectedWordCount);
          }
        })();
      }
    }

    prevSceneIdRef.current = newSceneId;
    currentSceneRef.current = currentScene ?? null;
    lastSavedWordCountRef.current = currentScene?.word_count ?? 0;
    expectedServerWordCountRef.current = currentScene?.word_count ?? 0;
    pendingEligibleWordsRef.current = 0;

    isLoadingRef.current = true;
    editor.commands.setContent(currentScene?.content ?? null);
    lastSavedWordCountRef.current =
      (editor.storage.characterCount?.words?.() as number | undefined) ??
      currentScene?.word_count ??
      0;

    const sceneIdForDraftCheck = newSceneId;
    // Captured synchronously alongside the reset above — safe to read later
    // inside the async block even if another scene switch reassigns the ref
    // in the meantime.
    let expectedWordCountForDraftCheck = expectedServerWordCountRef.current;

    if (sceneIdForDraftCheck) {
      void (async () => {
        try {
          // Prefer the last CONFIRMED server word count from the offline cache
          // over currentScene.word_count: the scene prop is updated optimistically
          // by every save attempt (onSceneUpdated fires before the server
          // confirms), so after a failed save it can claim words the server
          // never received — and a baseline seeded from it would misread the
          // still-empty server scene as a conflict on the next sync.
          try {
            const idb = await getOfflineDB();
            const cacheEntry = await idb.get(SCENE_CACHE_STORE, sceneIdForDraftCheck);
            if (typeof cacheEntry?.serverWordCount === 'number') {
              expectedWordCountForDraftCheck = cacheEntry.serverWordCount;
              if (currentSceneRef.current?.id === sceneIdForDraftCheck) {
                expectedServerWordCountRef.current = cacheEntry.serverWordCount;
              }
            }
          } catch {
            // best-effort — fall back to the prop-seeded baseline
          }

          const pending = await getPendingWrite(sceneIdForDraftCheck);
          if (currentSceneRef.current?.id !== sceneIdForDraftCheck) return;

          if (pending) {
            // A pending write always means the server hasn't confirmed this
            // content yet — load it so the editor never shows content staler
            // than what's already sitting in the local queue.
            editor.commands.setContent(pending.content);
            lastSavedWordCountRef.current = pending.wordCount;

            // Whether this is a genuine conflict (server independently changed)
            // or just an ordinary unsynced write left behind by a debounce/scene
            // -switch race is syncPendingWrite's call to make — it's the single
            // place that compares against the confirmed server baseline. A real
            // conflict is already surfaced through the normal syncStatus ===
            // 'conflict' indicator below; nothing here should second-guess it or
            // force the user through a separate manual "sync" step for what is,
            // in the single-tab-online case, just autosave finishing its job.
            if (pending.syncStatus !== 'conflict' && isOnlineRef.current) {
              setSyncStatusAndRef('syncing');
              await syncPendingWrite(sceneIdForDraftCheck, 'online', expectedWordCountForDraftCheck);
            }

            if (currentSceneRef.current?.id === sceneIdForDraftCheck) {
              const afterStatus = await readDbSyncStatus(sceneIdForDraftCheck);
              setSyncStatusAndRef(mapDisplayStatus(afterStatus, isOnlineRef.current));
              if (!afterStatus) {
                expectedServerWordCountRef.current = pending.wordCount;
              }
            }
          }
        } catch {
          // best-effort
        } finally {
          if (currentSceneRef.current?.id === sceneIdForDraftCheck) {
            isLoadingRef.current = false;
          }
        }
      })();
    } else {
      setTimeout(() => {
        isLoadingRef.current = false;
      }, 0);
    }
  }, [editor, currentScene?.id]);

  useEffect(() => {
    return () => {
      clearTimeout(xpFlashTimerRef.current);

      // Flush a still-pending debounced save before the editor is destroyed.
      // React runs cleanup functions in reverse declaration order, and useEditor
      // is declared above this effect, so `editor` is still live here — this
      // runs BEFORE Tiptap's own unmount cleanup tears it down. If we didn't
      // clear the timer, it would fire later against a destroyed editor: Tiptap
      // resets `editor.storage` to `{}` on destroy, so `characterCount.words()`
      // would read as 0 while `getJSON()` still returned the real document —
      // silently saving word_count: 0 over real content with no user deletion.
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        const scene = currentSceneRef.current;
        const uid = userIdRef.current;
        if (editor && !editor.isDestroyed && scene && uid) {
          const content = editor.getJSON() as Record<string, unknown>;
          const wordCount =
            (editor.storage.characterCount?.words?.() as number | undefined) ?? 0;
          const expectedWordCountAtUnmount = expectedServerWordCountRef.current;
          // Same tail-of-session credit as the scene-switch flush above:
          // navigating away (e.g. to the dashboard) before the debounce fired
          // must not drop the typed words from Today's Words. rawDelta is 0
          // when the debounce already credited this content — no double count.
          const rawDelta = wordCount - lastSavedWordCountRef.current;
          const creditableWords =
            rawDelta > 0 ? Math.min(pendingEligibleWordsRef.current, rawDelta) : 0;
          if (creditableWords > 0) {
            if (isOnlineRef.current) {
              void recordWordsWritten(projectIdRef.current, creditableWords, scene.id, getLocalDateString())
                .catch(err => console.error('[offline] recordWordsWritten (unmount) failed:', err));
            } else {
              void storeOfflineWritingCredit(projectIdRef.current, scene.id, creditableWords)
                .catch(err => console.error('[offline] storeOfflineWritingCredit (unmount) failed:', err));
            }
            pendingEligibleWordsRef.current = Math.max(0, pendingEligibleWordsRef.current - creditableWords);
          }
          void writeToPendingQueue(scene.id, uid, content, wordCount).then(() => {
            if (isOnlineRef.current) void syncPendingWrite(scene.id, 'online', expectedWordCountAtUnmount);
          });
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  const wordCount =
    (editor?.storage.characterCount?.words?.() as number | undefined) ?? 0;

  /** SyncConflictModal "Keep Local" succeeded: the server now holds keptWordCount. */
  const resolveConflictKeptLocal = useCallback((keptWordCount: number) => {
    setConflictModalOpen(false);
    setLastSaved(new Date());
    setSyncStatusAndRef('synced');
    // forceWriteLocalContent persisted and VERIFIED exactly this word
    // count on the server — advance the private baseline to what the
    // server now actually holds.
    expectedServerWordCountRef.current = keptWordCount;
    showToast("Local draft kept", "success");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** SyncConflictModal "Keep Server": replace the local draft with the server's content. */
  const resolveConflictKeptServer = useCallback(
    (serverContent: Record<string, unknown>, serverWordCount: number) => {
      const scene = currentSceneRef.current;
      setConflictModalOpen(false);
      setLastSaved(new Date());
      setSyncStatusAndRef('synced');
      isLoadingRef.current = true;
      editor?.commands.setContent(serverContent);
      clearTimeout(saveTimerRef.current);
      isLoadingRef.current = false;
      lastSavedWordCountRef.current = serverWordCount;
      expectedServerWordCountRef.current = serverWordCount;
      // Discard any pending eligible words from the local edits being
      // replaced — they no longer exist in the kept (server) content.
      pendingEligibleWordsRef.current = 0;
      if (scene) {
        onSceneUpdatedRef.current(scene.id, {
          content: serverContent,
          word_count: serverWordCount,
        });
      }
      showToast("Server version kept", "info");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor]
  );

  // Scene History restored an earlier text on the server (a new version,
  // saved through save_scene_checked). Show it, as a programmatic load: never
  // typed words, never re-saved, and the confirmed baseline moves to it. If
  // this device holds unsynced text for the Scene, leave everything as it is:
  // the normal conflict check then asks the writer which text to keep.
  useEffect(() => {
    if (!editor) return;
    const onRestored = (event: Event) => {
      const restored = (event as CustomEvent<Scene>).detail;
      if (!restored || currentSceneRef.current?.id !== restored.id) return;
      void (async () => {
        if (await getPendingWrite(restored.id)) return;
        if (editor.isDestroyed || currentSceneRef.current?.id !== restored.id) return;
        clearTimeout(saveTimerRef.current);
        isLoadingRef.current = true;
        editor.commands.setContent(restored.content ?? null);
        isLoadingRef.current = false;
        lastSavedWordCountRef.current = restored.word_count;
        expectedServerWordCountRef.current = restored.word_count;
        pendingEligibleWordsRef.current = 0;
        setSyncStatusAndRef('synced');
        onSceneUpdatedRef.current(restored.id, restored);
      })();
    };
    window.addEventListener(SCENE_RESTORED_EVENT, onRestored);
    return () => window.removeEventListener(SCENE_RESTORED_EVENT, onRestored);
  }, [editor]);

  return {
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
    /** The Scene the engine is currently bound to (updated on switch). */
    currentSceneRef,
    isOnlineRef,
  };
}
