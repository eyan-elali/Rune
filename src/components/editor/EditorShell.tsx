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
import { useProfileStore } from "@/store/profileStore";
// markFirstWordsSaved is called via API route (not server action) to prevent
// Next.js from auto-refreshing /onboarding after the call.

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

  const setProfile = useProfileStore((s) => s.setProfile);
  const profile = useProfileStore((s) => s.profile);

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

  // Called by RuneEditor after detecting the first sentence AND persisting content.
  // Marks has_written_first_words in the DB, then signals parent to show the
  // "Your story has begun." transition and navigate to the real editor.
  const handleFirstSentenceSaved = useCallback(() => {
    if (profile) {
      setProfile({ ...profile, has_written_first_words: true });
    }
    void fetch("/api/onboarding/first-words", { method: "POST" }).then((res) => {
      if (res.ok) {
        onFirstSavePersisted?.();
      }
      // If the API call fails, do nothing — user stays on the writing scene.
    });
  }, [profile, setProfile, onFirstSavePersisted]);


  // Page list and export toolbar are hidden during the onboarding writing scene.
  const renderPageList = !shouldHideFocusUI && !isOnboarding;
  const showExportToolbar = !shouldHideFocusUI && !isOnboarding;

  return (
    <div className="flex min-h-0 h-full overflow-hidden">
      {renderPageList && (
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
      )}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {showExportToolbar && (
          <div
            className="flex shrink-0 items-center justify-end px-4 py-1.5"
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
          onFirstSentenceSaved={isOnboarding ? handleFirstSentenceSaved : undefined}
        />
      </div>
    </div>
  );
}
