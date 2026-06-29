"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { PageList } from "./PageList";
import { ExportButton } from "./ExportButton";
import type { Page, Chapter, Project } from "@/lib/types";
import {
  createPage,
  deletePage,
  setCanonicalPage,
  clearCanonicalPage,
} from "@/lib/actions/pages";
import { cachePage, cacheChapterMeta } from "@/lib/offline/db";
import { useEditorStore } from "@/store/editorStore";
import { useModeStore } from "@/store/modeStore";
import { useOnboardingStore } from "@/store/onboardingStore";
import { useProfileStore } from "@/store/profileStore";
// markFirstWordsSaved is intentionally called via API route (not server action)
// to prevent Next.js from auto-refreshing /onboarding after the call — see
// /api/onboarding/first-words/route.ts

type ChapterWithStats = Chapter & { pages: { id: string; word_count: number }[] };

const RuneEditor = dynamic(() => import("./RuneEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center">
      <span className="text-sm" style={{ color: "var(--color-mist)" }}>
        Loading editor…
      </span>
    </div>
  ),
});

interface EditorShellProps {
  projectId: string;
  chapterId: string;
  initialPages: Page[];
  chapter: Chapter;
  project: Project;
  allChapters: ChapterWithStats[];
  isOnboarding?: boolean;
  onFirstSavePersisted?: () => void;
}

export function EditorShell({
  projectId,
  chapterId,
  initialPages,
  chapter,
  project,
  allChapters,
  isOnboarding = false,
  onFirstSavePersisted,
}: EditorShellProps) {
  const [pages, setPages] = useState<Page[]>(initialPages);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(
    initialPages[0]?.id ?? null
  );
  const setCurrentPage = useEditorStore((s) => s.setCurrentPage);
  const pathname = usePathname();
  const mode = useModeStore((s) => s.mode);
  const shouldHideFocusUI = mode === "focus" && pathname.includes("/chapters/");

  const { phase, setPhase } = useOnboardingStore();
  const setProfile = useProfileStore((s) => s.setProfile);
  const profile = useProfileStore((s) => s.profile);

  const revealTriggeredRef = useRef(false);

  // Mount/unmount: activate onboarding phase; reset on leave.
  useEffect(() => {
    if (isOnboarding) {
      setPhase("writing");
    }
    return () => {
      setPhase("done");
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedPageId) {
      setCurrentPage(projectId, chapterId, selectedPageId);
    }
  }, [selectedPageId, projectId, chapterId, setCurrentPage]);

  useEffect(() => {
    void (async () => {
      try {
        await cacheChapterMeta(chapter, project);
        await Promise.all(initialPages.map((p) => cachePage(p, projectId)));
      } catch {
        // best-effort
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentPage = pages.find((p) => p.id === selectedPageId) ?? null;

  const handleSelectPage = useCallback((pageId: string) => {
    setSelectedPageId(pageId);
  }, []);

  const handleAddPage = useCallback(async () => {
    const { data, error } = await createPage(
      chapterId,
      `Page ${pages.length + 1}`
    );
    if (data && !error) {
      await cachePage(data, projectId);
      setPages((prev) => [...prev, data]);
      setSelectedPageId(data.id);
    }
  }, [chapterId, pages.length, projectId]);

  const handleDeletePage = useCallback(
    async (pageId: string) => {
      const { error } = await deletePage(pageId);
      if (!error) {
        setPages((prev) => {
          const remaining = prev.filter((p) => p.id !== pageId);
          if (selectedPageId === pageId && remaining.length > 0) {
            setSelectedPageId(remaining[0].id);
          }
          return remaining;
        });
      }
    },
    [selectedPageId]
  );

  const handleRenamePage = useCallback((pageId: string, title: string) => {
    setPages((prev) =>
      prev.map((p) => (p.id === pageId ? { ...p, title } : p))
    );
  }, []);

  const handlePageUpdated = useCallback(
    (pageId: string, updates: Partial<Page>) => {
      setPages((prev) =>
        prev.map((p) => (p.id === pageId ? { ...p, ...updates } : p))
      );
    },
    []
  );

  const handleSetCanonical = useCallback(
    async (pageId: string) => {
      setPages((prev) =>
        prev.map((p) => ({ ...p, is_canonical: p.id === pageId }))
      );
      await setCanonicalPage(pageId, chapterId);
    },
    [chapterId]
  );

  const handleClearCanonical = useCallback(async () => {
    setPages((prev) => prev.map((p) => ({ ...p, is_canonical: false })));
    await clearCanonicalPage(chapterId);
  }, [chapterId]);

  // Called by RuneEditor when first completed word is detected in the editor.
  // Triggers the reveal animation. Fires independently of autosave.
  const handleFirstWordDetected = useCallback(() => {
    if (revealTriggeredRef.current) return;
    revealTriggeredRef.current = true;

    setPhase("revealing");

    // 1000ms: long enough for all reveal animations to complete (panel finishes ~800ms,
    // word-count status finishes ~1000ms).
    setTimeout(() => setPhase("done"), 1000);
  }, [setPhase]);

  // Called by RuneEditor after the first successful autosave with words > 0.
  // Handles DB persistence only. Also triggers reveal as a fallback.
  const handleFirstSave = useCallback(() => {
    // Use a plain fetch (not a server action) so Next.js does NOT auto-refresh
    // /onboarding after the write. Await the write before signalling the parent
    // so the editor route's server component sees has_written_first_words = true
    // when it loads, ensuring isOnboarding = false from the start.
    void fetch("/api/onboarding/first-words", { method: "POST" }).then(() => {
      onFirstSavePersisted?.();
    });
    if (profile) {
      setProfile({ ...profile, has_written_first_words: true });
    }
    // Fallback: reveal if word detection didn't fire (edge case)
    if (!revealTriggeredRef.current) {
      handleFirstWordDetected();
    }
  }, [profile, setProfile, handleFirstWordDetected, onFirstSavePersisted]);


  const isOnboardingWriting = isOnboarding && phase === "writing";
  const isOnboardingRevealing = isOnboarding && phase === "revealing";

  // Page list: absent during onboarding writing phase (not invisible — absent).
  // Fades in during reveal via CSS animation class.
  const renderPageList = !shouldHideFocusUI && !isOnboardingWriting;

  // Export toolbar hidden during onboarding writing; fades in during reveal.
  const showExportToolbar = !shouldHideFocusUI && !isOnboardingWriting;

  return (
    <div className="flex min-h-0 h-full overflow-hidden">
      {renderPageList && (
        <div className={isOnboardingRevealing ? "rune-panel-enter" : undefined}>
          <PageList
            pages={pages}
            selectedPageId={selectedPageId}
            onSelectPage={handleSelectPage}
            onAddPage={handleAddPage}
            onDeletePage={handleDeletePage}
            onRenamePage={handleRenamePage}
            onSetCanonical={handleSetCanonical}
            onClearCanonical={handleClearCanonical}
            allChapters={allChapters}
            currentChapterId={chapterId}
            projectId={projectId}
          />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {showExportToolbar && (
          <div
            className={`flex shrink-0 items-center justify-end px-4 py-1.5${isOnboardingRevealing ? " rune-panel-enter" : ""}`}
            style={{
              borderBottom: "1px solid var(--color-border)",
              background: "var(--surface-editor)",
            }}
          >
            <ExportButton page={currentPage} chapter={chapter} project={project} />
          </div>
        )}
        <RuneEditor
          projectId={projectId}
          chapterId={chapterId}
          currentPage={currentPage}
          onPageUpdated={handlePageUpdated}
          onRenamePage={handleRenamePage}
          isOnboarding={isOnboarding}
          onboardingProjectTitle={isOnboarding ? project.title : undefined}
          onFirstWordDetected={isOnboarding ? handleFirstWordDetected : undefined}
          onFirstSave={isOnboarding ? handleFirstSave : undefined}
        />
      </div>

    </div>
  );
}
