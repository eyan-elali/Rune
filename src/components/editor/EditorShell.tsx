"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PageList } from "./PageList";
import { ExportButton } from "./ExportButton";
import { EditorTutorial } from "./EditorTutorial";
import { ModeToggle } from "@/components/ui/ModeToggle";
import { GuideButton } from "@/components/ui/GuideButton";
import type { Scene, Chapter, Project } from "@/lib/types";
import type { ChapterWithScenes } from "@/lib/manuscriptQueries";
import {
  createScene,
  deleteScene,
  reorderScenes,
  moveSceneToUnplaced,
  moveSceneToChapter,
} from "@/lib/actions/scenes";
import { cachePage, cacheChapterMeta, forgetStalePlacements } from "@/lib/offline/db";
import { useEditorStore } from "@/store/editorStore";
import { isManuscriptEditorPath } from "@/lib/utils";
import { useModeStore } from "@/store/modeStore";
import { useToastStore } from "@/store/toastStore";

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
  /**
   * The Chapter being edited, or null for the Project's Unplaced Scenes. The
   * Unplaced view edits and saves Scenes exactly like a Chapter; it only has
   * no adding, reordering or page export.
   */
  chapter: Chapter | null;
  /** The Chapter's placed Scenes, or the Unplaced Scenes (shown to the writer as pages). */
  initialPages: Scene[];
  /** Scene to open first; defaults to the first one. */
  initialSelectedId?: string;
  project: Project;
  allChapters: ChapterWithScenes[];
  /** How many Unplaced Scenes the Project has — the sidebar only mentions them when there are some. */
  unplacedCount?: number;
  showTutorial?: boolean;
  forceTutorial?: boolean;
  /** Account-wide manuscript word total at page load — see getAccountWordTotal. */
  accountWordTotal?: number;
}

export function EditorShell({
  projectId,
  chapter,
  initialPages,
  initialSelectedId,
  project,
  allChapters,
  unplacedCount = 0,
  showTutorial = false,
  forceTutorial = false,
  accountWordTotal = 0,
}: EditorShellProps) {
  const chapterId = chapter?.id ?? null;
  const router = useRouter();
  const [pages, setPages] = useState<Scene[]>(initialPages);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(
    initialPages.find((p) => p.id === initialSelectedId)?.id ?? initialPages[0]?.id ?? null
  );
  const pagesRef = useRef(pages);
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);
  const [guideTriggerCount, setGuideTriggerCount] = useState(0);
  const setCurrentPage = useEditorStore((s) => s.setCurrentPage);
  const showToast = useToastStore((s) => s.showToast);
  const pathname = usePathname();
  const mode = useModeStore((s) => s.mode);
  const shouldHideFocusUI = mode === "focus" && isManuscriptEditorPath(pathname);

  useEffect(() => {
    if (selectedPageId) {
      setCurrentPage(projectId, chapterId, selectedPageId);
    }
  }, [selectedPageId, projectId, chapterId, setCurrentPage]);

  useEffect(() => {
    void (async () => {
      try {
        if (chapter) await cacheChapterMeta(chapter, project);
        await Promise.all(initialPages.map((p) => cachePage(p, projectId)));
        await forgetStalePlacements(projectId, chapterId, initialPages.map((p) => p.id));
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
    if (!chapterId) return;
    const { data, error } = await createScene(
      chapterId,
      `Page ${pages.length + 1}`
    );
    if (data && !error) {
      await cachePage(data, projectId);
      setPages((prev) => [...prev, data]);
      setSelectedPageId(data.id);
    }
  }, [chapterId, pages.length, projectId]);

  /**
   * Drops a Scene from this view after it was deleted or moved elsewhere. If it
   * was open, the next Scene opens — the editor's page switch then flushes the
   * departing Scene's latest content to the offline queue and syncs it by ID,
   * wherever it now lives. Returns how many Scenes remain.
   */
  const removeFromView = useCallback((pageId: string): number => {
    // Called after an awaited server action: read the list through a ref and
    // update it functionally, so content the editor reported meanwhile
    // (handlePageUpdated) is never replaced by a stale copy.
    const current = pagesRef.current;
    const index = current.findIndex((p) => p.id === pageId);
    const remaining = current.filter((p) => p.id !== pageId);
    setPages((prev) => prev.filter((p) => p.id !== pageId));
    setSelectedPageId((selected) =>
      selected === pageId
        ? remaining[Math.min(index, remaining.length - 1)]?.id ?? null
        : selected
    );
    return remaining.length;
  }, []);

  const handleDeletePage = useCallback(
    async (pageId: string) => {
      const { error } = await deleteScene(pageId);
      if (!error) {
        const left = removeFromView(pageId);
        if (left === 0 && !chapterId) router.push(`/projects/${projectId}`);
      }
    },
    [removeFromView, chapterId, projectId, router]
  );

  const handleMoveToUnplaced = useCallback(
    async (pageId: string) => {
      const { data, error } = await moveSceneToUnplaced(pageId);
      if (error || !data) {
        showToast("Couldn't move this page — try again when you're back online.", "error");
        return;
      }
      await cachePage(data, projectId);
      removeFromView(pageId);
      showToast(`“${data.title}” moved to Unplaced Scenes`, "success");
      router.refresh();
    },
    [projectId, removeFromView, router, showToast]
  );

  const handleMoveToChapter = useCallback(
    async (pageId: string, targetChapterId: string) => {
      const { data, error } = await moveSceneToChapter(pageId, targetChapterId);
      if (error || !data) {
        showToast("Couldn't move this page — try again when you're back online.", "error");
        return;
      }
      await cachePage(data, projectId);
      const left = removeFromView(pageId);
      const target = allChapters.find((c) => c.id === targetChapterId);
      showToast(`“${data.title}” moved to ${target?.title ?? "its chapter"}`, "success");
      if (left === 0 && !chapterId) {
        router.push(`/projects/${projectId}/chapters/${targetChapterId}`);
      } else {
        router.refresh();
      }
    },
    [allChapters, chapterId, projectId, removeFromView, router, showToast]
  );

  const handleRenamePage = useCallback((pageId: string, title: string) => {
    setPages((prev) =>
      prev.map((p) => (p.id === pageId ? { ...p, title } : p))
    );
  }, []);

  const handlePageUpdated = useCallback(
    (pageId: string, updates: Partial<Scene>) => {
      setPages((prev) =>
        prev.map((p) => (p.id === pageId ? { ...p, ...updates } : p))
      );
    },
    []
  );

  const handleReorderPages = useCallback(
    async (orderedPageIds: string[]) => {
      if (!chapterId) return;
      const previous = pages;
      const reordered = orderedPageIds
        .map((id, index) => {
          const page = previous.find((p) => p.id === id);
          return page ? { ...page, position: index } : null;
        })
        .filter((p): p is Scene => p !== null);

      setPages(reordered);

      const { error } = await reorderScenes(chapterId, orderedPageIds);
      if (error) {
        setPages(previous);
        showToast(
          "Couldn't reorder pages — try again when you're back online.",
          "error"
        );
        return;
      }

      // Keep the offline cache's position values in sync so the offline
      // page list (sorted by position) stays correct.
      await Promise.all(reordered.map((p) => cachePage(p, projectId)));
    },
    [pages, chapterId, projectId, showToast]
  );

  return (
    <div className="flex min-h-0 h-full overflow-hidden">
      <EditorTutorial active={showTutorial} forceRun={forceTutorial} replayTrigger={guideTriggerCount} />
      {!shouldHideFocusUI && (
        <PageList
          pages={pages}
          selectedPageId={selectedPageId}
          onSelectPage={handleSelectPage}
          onAddPage={chapterId ? handleAddPage : undefined}
          onDeletePage={handleDeletePage}
          onRenamePage={handleRenamePage}
          onReorderPages={chapterId ? handleReorderPages : undefined}
          onMoveToUnplaced={chapterId ? handleMoveToUnplaced : undefined}
          onMoveToChapter={chapterId ? undefined : handleMoveToChapter}
          allChapters={allChapters}
          currentChapterId={chapterId}
          unplacedCount={unplacedCount}
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
            <div className="flex items-center gap-2">
              <GuideButton onClick={() => setGuideTriggerCount((c) => c + 1)} />
              {chapter && <ExportButton page={currentPage} chapter={chapter} project={project} />}
            </div>
          </div>
        )}
        <RuneEditor
          projectId={projectId}
          chapterId={chapterId}
          currentPage={currentPage}
          onPageUpdated={handlePageUpdated}
          onRenamePage={handleRenamePage}
          accountWordTotal={accountWordTotal}
        />
      </div>
    </div>
  );
}
