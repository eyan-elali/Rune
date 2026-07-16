"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import { isHistoryTransaction } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { cn, getLocalDateString } from "@/lib/utils";
import { renamePage } from "@/lib/actions/pages";
import { recordWordsWritten } from "@/lib/actions/writingStats";
import { writeToPendingQueue, syncPendingWrite } from "@/lib/offline/syncEngine";
import { getOfflineDB, getPendingWrite, storeOfflineWritingCredit, getCachedServerUpdatedAt } from "@/lib/offline/db";
import { SyncConflictModal } from "./SyncConflictModal";
import { useNetworkStore } from "@/store/networkStore";
import { awardProjectXp } from "@/lib/actions/xp";
import { xpRewardForWords } from "@/lib/xp";
import { unlockToastMessage } from "@/lib/unlockables";
import { useEditorStore } from "@/store/editorStore";
import { useModeStore } from "@/store/modeStore";
import { useProfileStore } from "@/store/profileStore";
import { useToastStore } from "@/store/toastStore";
import { WORD_LIMITS } from "@/lib/pricing";
import { createCheckoutSession } from "@/lib/actions/billing";
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

// Mirrors @tiptap/extensions CharacterCount's default wordCounter exactly (split on
// literal " " after textBetween, drop empty tokens). The eligibility ledger below
// diffs word counts across transactions, so it must use the identical algorithm —
// any drift here (e.g. a regex-based approximation) lets pasted words that this
// count over/under-reports slip past the paste exclusion as "typed."
function countWords(doc: ProseMirrorNode): number {
  const text = doc.textBetween(0, doc.content.size, " ", " ")
  return text.split(" ").filter((word) => word !== "").length
}

interface RuneEditorProps {
  projectId: string;
  chapterId: string;
  currentPage: Page | null;
  onPageUpdated: (pageId: string, updates: Partial<Page>) => void;
  onRenamePage: (pageId: string, title: string) => void;
  projectWordCount?: number;
}

interface ToolbarPos {
  top: number;
  left: number;
}

function getPromotekitReferral(): string {
  if (typeof window === 'undefined') return ''
  const referral = (window as Window & { promotekit_referral?: unknown }).promotekit_referral
  return typeof referral === 'string' ? referral : ''
}

export default function RuneEditor({
  projectId,
  chapterId,
  currentPage,
  onPageUpdated,
  onRenamePage,
  projectWordCount = 0,
}: RuneEditorProps) {
  const { setIsSaving, setLastSaved } = useEditorStore();
  const showToast = useToastStore((s) => s.showToast);
  const rawPrefs = useProfileStore((s) => s.profile?.preferences);
  const setStoredProfile = useProfileStore((s) => s.setProfile);
  const setPendingLevelUp = useProfileStore((s) => s.setPendingLevelUp);
  const userId = useProfileStore((s) => s.profile?.id);
  const subscriptionTier = useProfileStore((s) => s.subscriptionTier);
  const pricingCohort = useProfileStore((s) => s.pricingCohort);
  // Client-side value is UX-only — the server (updatePage/syncPageWithLimitCheck)
  // always re-derives tier + cohort independently and is the actual authority.
  const wordLimit =
    subscriptionTier === "scribe" ? Infinity : WORD_LIMITS[pricingCohort ?? "starter_2k"];
  const isFocusMode = useModeStore((s) => s.mode === "focus");
  const isOnline = useNetworkStore((s) => s.isOnline);
  const prefs = (rawPrefs ?? {}) as Partial<UserPreferences>;
  const fontSize = prefs.fontSize ?? 18;
  const lineHeight = prefs.lineHeight ?? 1.9;
  const wideEditor = prefs.wideEditor ?? false;
  const autoSaveDelayRef = useRef(prefs.autoSaveDelay ?? 1500);
  const isFocusModeRef = useRef(isFocusMode);

  const [syncStatus, setSyncStatus] = useState<DisplaySyncStatus>('synced');
  const syncStatusRef = useRef<DisplaySyncStatus>('synced');
  function setSyncStatusAndRef(s: DisplaySyncStatus) {
    syncStatusRef.current = s;
    setSyncStatus(s);
  }
  const [showingLocalDraft, setShowingLocalDraft] = useState(false);
  const [isSyncingNow, setIsSyncingNow] = useState(false);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [wordLimitModalOpen, setWordLimitModalOpen] = useState(false);
  const [upgradePending, setUpgradePending] = useState(false);
  const [toolbarPos, setToolbarPos] = useState<ToolbarPos | null>(null);
  const [titleDraft, setTitleDraft] = useState(currentPage?.title ?? "");
  const [xpFlash, setXpFlash] = useState<{ id: number; amount: number } | null>(null);
  const xpFlashTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const projectWordCountRef = useRef(projectWordCount);



  const currentPageRef = useRef<Page | null>(currentPage);
  const onPageUpdatedRef = useRef(onPageUpdated);
  const prevPageIdRef = useRef<string | null>(null);
  const isLoadingRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastSavedWordCountRef = useRef<number>(currentPage?.word_count ?? 0);
  // Net word-count delta contributed by transactions classified as directly typed
  // (see onTransaction below). Paste, drop, and undo/redo never add to this — so
  // it can't retroactively "absorb" pasted words on a later save or keystroke.
  // Consumed (reduced) only when a save successfully credits XP/writing-stats.
  const pendingEligibleWordsRef = useRef(0);
  const wordLimitBlockedRef = useRef(false);
  // Tracks live editor word count between saves so handleTextInput / handleKeyDown
  // can gate input before a character appears, not just at the next debounce cycle.
  const currentWordCountRef = useRef<number>(currentPage?.word_count ?? 0);
  const sessionId = useRef(crypto.randomUUID());
  const isOnlineRef = useRef(isOnline);
  const prevIsOnlineRef = useRef(isOnline);
  const userIdRef = useRef(userId);
  const projectIdRef = useRef(projectId);
  const subscriptionTierRef = useRef(subscriptionTier);
  const wordLimitRef = useRef(wordLimit);

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
  useEffect(() => { subscriptionTierRef.current = subscriptionTier; }, [subscriptionTier]);
  useEffect(() => { wordLimitRef.current = wordLimit; }, [wordLimit]);
  useEffect(() => { projectWordCountRef.current = projectWordCount; }, [projectWordCount]);


  useEffect(() => {
    onPageUpdatedRef.current = onPageUpdated;
  }, [onPageUpdated]);

  useEffect(() => {
    setTitleDraft(currentPage?.title ?? "");
  }, [currentPage?.id, currentPage?.title]);

  useEffect(() => {
    const pageId = currentPage?.id;
    if (!pageId) { setSyncStatusAndRef('synced'); return; }

    const wasOffline = !prevIsOnlineRef.current;
    prevIsOnlineRef.current = isOnline;

    if (isOnline && wasOffline) {
      void (async () => {
        const dbStatus = await readDbSyncStatus(pageId);
        if (dbStatus === 'pending' || dbStatus === 'failed') {
          setSyncStatusAndRef('syncing');
          await syncPendingWrite(pageId);
          const afterStatus = await readDbSyncStatus(pageId);
          setSyncStatusAndRef(mapDisplayStatus(afterStatus, true));
        } else if (dbStatus === 'syncing') {
          setSyncStatusAndRef('syncing');
        } else {
          setSyncStatusAndRef(mapDisplayStatus(dbStatus, true));
        }
      })();
    } else {
      void readDbSyncStatus(pageId).then((dbStatus) => {
        setSyncStatusAndRef(mapDisplayStatus(dbStatus, isOnline));
      });
    }
  }, [isOnline, currentPage?.id]);

  useEffect(() => {
    function handleSyncQueueUpdated() {
      const pageId = currentPageRef.current?.id;
      if (!pageId) return;
      void readDbSyncStatus(pageId).then((dbStatus) => {
        setSyncStatusAndRef(mapDisplayStatus(dbStatus, isOnlineRef.current));
      });
    }
    window.addEventListener('rune-sync-queue-updated', handleSyncQueueUpdated);
    return () => window.removeEventListener('rune-sync-queue-updated', handleSyncQueueUpdated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show the word-limit modal when the offline sync engine blocks a write that
  // would push a free-tier project over 15k words.
  useEffect(() => {
    function handleWordLimitBlocked() {
      setWordLimitModalOpen(true);
    }
    window.addEventListener('rune-word-limit-blocked', handleWordLimitBlocked);
    return () => window.removeEventListener('rune-word-limit-blocked', handleWordLimitBlocked);
  }, []);

  const handleSave = useCallback(async (content: Record<string, unknown>, wordCount: number, creditableWords: number) => {
    const page = currentPageRef.current;
    const uid = userIdRef.current;
    if (!page || !uid) return;

    const delta = wordCount - lastSavedWordCountRef.current;

    // Free-tier word limit check — only block growth, never block edits/deletions
    if (subscriptionTierRef.current === 'free' && delta > 0) {
      const otherPageWords = projectWordCountRef.current - (lastSavedWordCountRef.current);
      if (otherPageWords + wordCount > wordLimitRef.current) {
        wordLimitBlockedRef.current = true;
        setWordLimitModalOpen(true);
        setIsSaving(false);
        return;
      }
    }
    // Save is proceeding — clear any previous limit block
    wordLimitBlockedRef.current = false;

    try {
      await writeToPendingQueue(page.id, uid, content, wordCount);
    } catch (err) {
      console.error('[offline] handleSave: IDB write failed — data may not be persisted locally:', err);
    }

    setIsSaving(true);
    onPageUpdatedRef.current(page.id, { content, word_count: wordCount });

    // Always advance to the actual current total — including on deletions/undo —
    // so this baseline never goes stale. A baseline that only moved on growth
    // let a later increase (e.g. a redo restoring deleted content) be measured
    // against a too-low remembered total and misread as fresh growth.
    lastSavedWordCountRef.current = wordCount;

    if (creditableWords > 0) {
      if (isOnlineRef.current) {
        void recordWordsWritten(projectIdRef.current, creditableWords, page.id, getLocalDateString())
          .catch(err => console.error('[offline] recordWordsWritten failed:', err));
      } else {
        // Queue a writing credit to be applied once we reconnect.
        void storeOfflineWritingCredit(projectIdRef.current, page.id, creditableWords)
          .catch(err => console.error('[offline] storeOfflineWritingCredit failed:', err));
      }
    }

    if (isOnlineRef.current) {
      const preCheckStatus = await readDbSyncStatus(page.id);
      if (preCheckStatus === 'conflict') {
        setSyncStatusAndRef('conflict');
        setIsSaving(false);
        return;
      }
      setSyncStatusAndRef('syncing');
      await syncPendingWrite(page.id);
      setLastSaved(new Date());
    }

    setIsSaving(false);
    void readDbSyncStatus(page.id).then((dbStatus) => {
      setSyncStatusAndRef(mapDisplayStatus(dbStatus, isOnlineRef.current));
      // Once nothing is left pending in IDB, this page is fully synced — clear
      // any lingering "Showing latest local draft" banner from a prior recovery.
      // Previously this only cleared via the explicit "Sync now" button, so a
      // normal autosave that resolved the same condition left a stale prompt
      // telling the user to sync content that had already synced.
      if (!dbStatus) setShowingLocalDraft(false);
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
    autofocus: "start",
    editorProps: {
      // ── Free-tier word-limit input guards ───────────────────────────────────
      // These run BEFORE ProseMirror applies the transaction, so the character
      // never appears in the editor at all. Returning `true` from any handler
      // signals to ProseMirror "I handled this — skip default behaviour."
      //
      // Helper: true when the current project total is at or above the limit
      // for free users. Uses refs so all handlers always read live values.

      handleTextInput: (_view, _from, _to, _text) => {
        if (subscriptionTierRef.current !== 'free') return false;
        const otherPageWords =
          projectWordCountRef.current - lastSavedWordCountRef.current;
        if (otherPageWords + currentWordCountRef.current >= wordLimitRef.current) {
          setWordLimitModalOpen(true);
          return true; // block the insertion
        }
        return false;
      },

      handleKeyDown: (_view, event) => {
        // Only intercept Enter — everything else (arrows, backspace, delete,
        // Ctrl/Cmd shortcuts) must continue to work normally.
        if (event.key !== 'Enter') return false;
        if (subscriptionTierRef.current !== 'free') return false;
        const otherPageWords =
          projectWordCountRef.current - lastSavedWordCountRef.current;
        if (otherPageWords + currentWordCountRef.current >= wordLimitRef.current) {
          setWordLimitModalOpen(true);
          return true; // block the new paragraph
        }
        return false;
      },

      handlePaste: (_view) => {
        // At the limit, block paste before any content reaches the document.
        if (subscriptionTierRef.current === 'free') {
          const otherPageWords =
            projectWordCountRef.current - lastSavedWordCountRef.current;
          if (otherPageWords + currentWordCountRef.current >= wordLimitRef.current) {
            setWordLimitModalOpen(true);
            return true; // block paste
          }
        }
        // Under limit (or Scribe): let the paste through. Pasted words still count
        // toward the manuscript word total; XP/writing-stats eligibility is
        // classified below in onTransaction from ProseMirror's own paste metadata
        // rather than estimated here from raw clipboard text.
        return false;
      },

    },
    onTransaction({ transaction }) {
      // Programmatic content loads (page switch, hydration, sync reconciliation,
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

      // Keep the live word count ref in sync so editorProps handlers always have
      // a fresh value without computing it inside every keypress handler.
      currentWordCountRef.current =
        (editor.storage.characterCount?.words?.() as number | undefined) ?? 0;

      // Per-keystroke IDB write (best-effort). Skipped for free users when the
      // current word count would push the project over the limit — prevents
      // over-limit content from reaching the offline queue and syncing to the
      // server after a "Maybe Later" dismissal or on reconnect.
      const pageNow = currentPageRef.current;
      const uidNow = userIdRef.current;
      if (pageNow && uidNow) {
        const contentNow = editor.getJSON() as Record<string, unknown>;
        const wcNow = (editor.storage.characterCount?.words?.() as number | undefined) ?? 0;

        const isOverLimit =
          subscriptionTierRef.current === 'free' &&
          wcNow > lastSavedWordCountRef.current &&
          projectWordCountRef.current - lastSavedWordCountRef.current + wcNow > wordLimitRef.current;

        if (!isOverLimit) {
          try {
            void writeToPendingQueue(pageNow.id, uidNow, contentNow, wcNow);
          } catch (err) {
            console.error('[offline] onUpdate: per-keystroke IDB write failed:', err);
          }
        }

        if (syncStatusRef.current !== 'conflict') {
          setSyncStatusAndRef(isOnlineRef.current ? 'online_dirty' : 'offline_dirty');
        }
      }

      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        if (isLoadingRef.current) return;
        const page = currentPageRef.current;
        if (!page) return;
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
        // cycle (never awarded when the page's total didn't actually grow), same
        // invariant the previous per-cycle deduction preserved.
        const rawDelta = wordCount - lastSavedWordCountRef.current;
        const eligibleWords = pendingEligibleWordsRef.current;
        const creditableWords = rawDelta > 0 ? Math.min(eligibleWords, rawDelta) : 0;

        await handleSaveRef.current(content, wordCount, creditableWords);

        // Only consume the ledger and award XP when the save was not blocked by
        // the word limit — a blocked cycle leaves it fully intact for retry.
        if (!wordLimitBlockedRef.current) {
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
    currentWordCountRef.current = currentPage?.word_count ?? 0;
    pendingEligibleWordsRef.current = 0;
    wordLimitBlockedRef.current = false;

    isLoadingRef.current = true;
    editor.commands.setContent(currentPage?.content ?? null);
    lastSavedWordCountRef.current =
      (editor.storage.characterCount?.words?.() as number | undefined) ??
      currentPage?.word_count ??
      0;
    setShowingLocalDraft(false);

    const pageIdForDraftCheck = newPageId;
    const propServerUpdatedAt = currentPage?.updated_at;

    if (pageIdForDraftCheck) {
      void (async () => {
        try {
          const pending = await getPendingWrite(pageIdForDraftCheck);
          if (currentPageRef.current?.id !== pageIdForDraftCheck) return;
          if (pending) {
            // Prefer the IDB page_cache baseline over the `currentPage.updated_at`
            // prop. The prop is a snapshot from whenever this Page object was last
            // merged into EditorShell's state, and handlePageUpdated() never
            // refreshes updated_at after a background sync — so comparing a fresh
            // IDB localUpdatedAt against that stale prop produces false "showing
            // local draft" prompts for a page that has already synced cleanly.
            // page_cache.serverUpdatedAt is written by the sync engine on every
            // confirmed save and is always current.
            const serverUpdatedAt =
              (await getCachedServerUpdatedAt(pageIdForDraftCheck)) ?? propServerUpdatedAt;
            if (serverUpdatedAt) {
              const serverMs = new Date(serverUpdatedAt).getTime();
              if (pending.localUpdatedAt > serverMs) {
                editor.commands.setContent(pending.content);
                lastSavedWordCountRef.current = pending.wordCount;
                setShowingLocalDraft(true);
              }
            }
          }
        } catch {
          // best-effort
        } finally {
          if (currentPageRef.current?.id === pageIdForDraftCheck) {
            isLoadingRef.current = false;
          }
        }
      })();
    } else {
      setTimeout(() => {
        isLoadingRef.current = false;
      }, 0);
    }
  }, [editor, currentPage?.id]);

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
        const page = currentPageRef.current;
        const uid = userIdRef.current;
        if (editor && !editor.isDestroyed && page && uid) {
          const content = editor.getJSON() as Record<string, unknown>;
          const wordCount =
            (editor.storage.characterCount?.words?.() as number | undefined) ?? 0;
          void writeToPendingQueue(page.id, uid, content, wordCount).then(() => {
            if (isOnlineRef.current) void syncPendingWrite(page.id);
          });
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  const wordCount =
    (editor?.storage.characterCount?.words?.() as number | undefined) ?? 0;

  async function handleSyncNow() {
    const pageId = currentPageRef.current?.id;
    if (!pageId || isSyncingNow) return;
    if (syncStatusRef.current === 'conflict') {
      setConflictModalOpen(true);
      return;
    }
    setIsSyncingNow(true);
    try {
      await syncPendingWrite(pageId);
      const pending = await getPendingWrite(pageId);
      if (!pending) {
        setShowingLocalDraft(false);
        setLastSaved(new Date());
        setSyncStatusAndRef('synced');
      } else {
        const dbStatus = await readDbSyncStatus(pageId);
        setSyncStatusAndRef(mapDisplayStatus(dbStatus, isOnlineRef.current));
      }
    } catch {
      // silent
    } finally {
      setIsSyncingNow(false);
    }
  }

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
    if (!isOnlineRef.current) {
      showToast("Title saved locally — will sync when reconnected", "info");
      return;
    }
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
              aria-label="Page title"
            />
          </div>

          {editor ? <EditorContent editor={editor} /> : null}
        </div>
      </div>

      {/* Sync status + local draft notice — hidden during onboarding */}
      <div
        className="fixed bottom-[4.5rem] right-7 z-40 md:bottom-[5rem] md:right-9 flex flex-col items-end gap-1"
        style={{
          fontSize: "11px",
          fontFamily: "var(--font-sans)",
          letterSpacing: "0.04em",
          ...uiChromeFadeStyle,
        }}
      >
        {showingLocalDraft ? (
          <span style={{ color: "var(--color-mist)", opacity: 0.8, fontStyle: "italic" }}>
            Showing latest local draft
            {isOnline && (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={() => void handleSyncNow()}
                  disabled={isSyncingNow}
                  aria-label="Sync local draft to server"
                  style={{
                    background: "none",
                    border: "none",
                    cursor: isSyncingNow ? "default" : "pointer",
                    padding: 0,
                    font: "inherit",
                    letterSpacing: "inherit",
                    fontStyle: "normal",
                    color: isSyncingNow ? "var(--color-mist)" : "var(--color-gold)",
                    opacity: isSyncingNow ? 0.5 : 1,
                  }}
                >
                  {isSyncingNow ? "Syncing…" : "Sync now"}
                </button>
              </>
            )}
          </span>
        ) : (
          <>
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
          </>
        )}
      </div>

      {/* Sync conflict resolution modal */}
      {conflictModalOpen && currentPage && (
        <SyncConflictModal
          pageId={currentPage.id}
          onKeepLocal={() => {
            setConflictModalOpen(false);
            setShowingLocalDraft(false);
            setLastSaved(new Date());
            setSyncStatusAndRef('synced');
            showToast("Local draft kept", "success");
          }}
          onKeepServer={(serverContent, serverWordCount) => {
            setConflictModalOpen(false);
            setShowingLocalDraft(false);
            setLastSaved(new Date());
            setSyncStatusAndRef('synced');
            isLoadingRef.current = true;
            editor?.commands.setContent(serverContent);
            clearTimeout(saveTimerRef.current);
            isLoadingRef.current = false;
            lastSavedWordCountRef.current = serverWordCount;
            // Discard any pending eligible words from the local edits being
            // replaced — they no longer exist in the kept (server) content.
            pendingEligibleWordsRef.current = 0;
            onPageUpdatedRef.current(currentPage.id, {
              content: serverContent,
              word_count: serverWordCount,
            });
            showToast("Server version kept", "info");
          }}
          onClose={() => setConflictModalOpen(false)}
        />
      )}

      {/* Free-tier word limit modal */}
      {wordLimitModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="word-limit-heading"
        >
          <div
            className="relative w-full max-w-md rounded-xl px-8 py-10 text-center shadow-2xl"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--color-border-strong)' }}
          >
            <div
              className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full"
              style={{ background: 'color-mix(in srgb, var(--color-gold) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-gold) 35%, transparent)' }}
              aria-hidden
            >
              <span className="text-2xl">✦</span>
            </div>
            <h2
              id="word-limit-heading"
              className="mb-3 font-rune-serif text-2xl"
              style={{ color: 'var(--text-primary)' }}
            >
              You&rsquo;ve reached {wordLimit.toLocaleString()} words.
            </h2>
            <p
              className="mb-2 text-sm leading-relaxed"
              style={{ color: 'var(--color-mist)' }}
            >
              Upgrade to Scribe to continue writing this manuscript with unlimited words.
            </p>
            <p
              className="mb-8 text-sm leading-relaxed"
              style={{ color: 'var(--color-mist)' }}
            >
              Your manuscript is always yours, and you can export it anytime.
            </p>
            <div className="flex flex-col gap-3">
              <button
                type="button"
                disabled={upgradePending}
                onClick={() => {
                  setUpgradePending(true);
                  void createCheckoutSession('scribe', 'monthly', getPromotekitReferral()).then(({ url }) => {
                    if (url) window.location.href = url;
                    else setUpgradePending(false);
                  });
                }}
                className="w-full rounded-lg px-5 py-3 text-sm font-medium transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rune-gold"
                style={{ background: 'var(--color-gold)', color: 'var(--color-ink)' }}
              >
                {upgradePending ? 'Loading…' : 'Upgrade to Scribe'}
              </button>
              <a
                href={`/projects/${projectId}`}
                className="w-full rounded-lg border px-5 py-3 text-sm font-medium transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rune-gold"
                style={{ borderColor: 'var(--color-border-strong)', color: 'var(--text-primary)' }}
              >
                Export Manuscript
              </a>
              <button
                type="button"
                onClick={() => setWordLimitModalOpen(false)}
                className="w-full px-5 py-2 text-sm transition-opacity hover:opacity-70 focus-visible:outline-none"
                style={{ color: 'var(--color-mist)' }}
              >
                Maybe Later
              </button>
            </div>
          </div>
        </div>
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
