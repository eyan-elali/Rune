"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, useEffect } from "react";
import { PageList } from "./PageList";
import type { Page } from "@/lib/types";
import { createPage, deletePage } from "@/lib/actions/pages";
import { useEditorStore } from "@/store/editorStore";

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

  const handleRenamePage = useCallback(
    (pageId: string, title: string) => {
      setPages((prev) =>
        prev.map((p) => (p.id === pageId ? { ...p, title } : p))
      );
    },
    []
  );

  const handlePageUpdated = useCallback(
    (pageId: string, updates: Partial<Page>) => {
      setPages((prev) =>
        prev.map((p) => (p.id === pageId ? { ...p, ...updates } : p))
      );
    },
    []
  );

  return (
    <div className="flex h-full overflow-hidden">
      <PageList
        pages={pages}
        selectedPageId={selectedPageId}
        onSelectPage={handleSelectPage}
        onAddPage={handleAddPage}
        onDeletePage={handleDeletePage}
        onRenamePage={handleRenamePage}
      />
      <div className="flex flex-1 overflow-hidden">
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
