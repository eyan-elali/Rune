"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, useEffect } from "react";
import { usePathname } from "next/navigation";
import { PageList } from "./PageList";
import type { Page } from "@/lib/types";
import {
  createPage,
  deletePage,
  setCanonicalPage,
  clearCanonicalPage,
} from "@/lib/actions/pages";
import { useEditorStore } from "@/store/editorStore";
import { useModeStore } from "@/store/modeStore";

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
}

export function EditorShell({
  projectId,
  chapterId,
  initialPages,
}: EditorShellProps) {
  const [pages, setPages] = useState<Page[]>(initialPages);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(
    initialPages[0]?.id ?? null
  );
  const setCurrentPage = useEditorStore((s) => s.setCurrentPage);
  const pathname = usePathname();
  const mode = useModeStore((s) => s.mode);
  const shouldHideUI = mode === "focus" && pathname.includes("/chapters/");

  useEffect(() => {
    if (selectedPageId) {
      setCurrentPage(projectId, chapterId, selectedPageId);
    }
  }, [selectedPageId, projectId, chapterId, setCurrentPage]);

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
      setPages((prev) => [...prev, data]);
      setSelectedPageId(data.id);
    }
  }, [chapterId, pages.length]);

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
      // Optimistic update
      setPages((prev) =>
        prev.map((p) => ({ ...p, is_canonical: p.id === pageId }))
      );
      await setCanonicalPage(pageId, chapterId);
    },
    [chapterId]
  );

  const handleClearCanonical = useCallback(async () => {
    // Optimistic update
    setPages((prev) => prev.map((p) => ({ ...p, is_canonical: false })));
    await clearCanonicalPage(chapterId);
  }, [chapterId]);

  return (
    <div className="flex min-h-0 h-full overflow-hidden">
      {!shouldHideUI && (
        <PageList
          pages={pages}
          selectedPageId={selectedPageId}
          onSelectPage={handleSelectPage}
          onAddPage={handleAddPage}
          onDeletePage={handleDeletePage}
          onRenamePage={handleRenamePage}
          onSetCanonical={handleSetCanonical}
          onClearCanonical={handleClearCanonical}
        />
      )}
      <div className="flex min-w-0 flex-1 overflow-hidden">
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
