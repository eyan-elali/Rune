"use client";

import { useEffect, useState } from "react";
import { getCachedPagesForChapter, getCachedChapterMeta } from "@/lib/offline/db";
import { EditorShell } from "./EditorShell";
import { OfflinePageMessage } from "@/components/ui/OfflinePageMessage";
import type { Chapter, Page, Project } from "@/lib/types";

interface OfflineEditorFallbackProps {
  projectId: string;
  chapterId: string;
}

type LoadState = "loading" | "found" | "not_found";

export function OfflineEditorFallback({
  projectId,
  chapterId,
}: OfflineEditorFallbackProps) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [pages, setPages] = useState<Page[]>([]);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [cachedPages, meta] = await Promise.all([
          getCachedPagesForChapter(chapterId),
          getCachedChapterMeta(chapterId),
        ]);

        if (cachedPages.length > 0 && meta) {
          setPages(cachedPages);
          setChapter(meta.chapter);
          setProject(meta.project);
          setLoadState("found");
        } else {
          setLoadState("not_found");
        }
      } catch {
        setLoadState("not_found");
      }
    })();
  }, [chapterId]);

  if (loadState === "loading") {
    return (
      <div
        className="flex h-full min-h-96 items-center justify-center"
        style={{ background: "var(--bg-primary)" }}
      >
        <span
          style={{
            fontFamily: "var(--font-rune-sans)",
            fontSize: "13px",
            color: "var(--color-mist)",
            opacity: 0.7,
          }}
        >
          Loading from cache…
        </span>
      </div>
    );
  }

  if (loadState === "not_found" || !chapter || !project) {
    return <OfflinePageMessage />;
  }

  return (
    <EditorShell
      projectId={projectId}
      chapterId={chapterId}
      initialPages={pages}
      chapter={chapter}
      project={project}
      allChapters={[]}
    />
  );
}
