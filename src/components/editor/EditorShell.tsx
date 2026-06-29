"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, useEffect } from "react";
import { usePathname } from "next/navigation";
import { PageList } from "./PageList";
import { ExportButton } from "./ExportButton";
import { EditorTutorial } from "./EditorTutorial";
import { ModeToggle } from "@/components/ui/ModeToggle";
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
  showTutorial?: boolean;
  forceTutorial?: boolean;
}

export function EditorShell({
  projectId,
  chapterId,
  initialPages,
  chapter,
  project,
  allChapters,
  showTutorial = false,
  forceTutorial = false,
}: EditorShellProps) {
  const [pages, setPages] = useState<Page[]>(initialPages);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(
    initialPages[0]?.id ?? null
  );
  const setCurrentPage = useEditorStore((s) => s.setCurrentPage);
  const pathname = usePathname();
  const mode = useModeStore((s) => s.mode);
  const shouldHideFocusUI = mode === "focus" && pathname.includes("/chapters/");

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

  return (
    <div className="flex min-h-0 h-full overflow-hidden">
      <EditorTutorial active={showTutorial} forceRun={forceTutorial} />
      {!shouldHideFocusUI && (
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
        {!shouldHideFocusUI && (
          <div
            className="flex shrink-0 items-center justify-between px-4 py-1.5"
            style={{
              borderBottom: "1px solid var(--color-border)",
              background: "var(--surface-editor)",
            }}
          >
            <ModeToggle />
            <ExportButton page={currentPage} chapter={chapter} project={project} />
          </div>
        )}
        <RuneEditor
          projectId={projectId}
          chapterId={chapterId}
          currentPage={currentPage}
          onPageUpdated={handlePageUpdated}
          onRenamePage={handleRenamePage}
        />
      </div>
    </div>
  );
}
