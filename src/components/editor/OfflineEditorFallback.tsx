"use client";

import { useEffect, useState } from "react";
import {
  getCachedScenesForChapter,
  getCachedChapterMeta,
  getCachedUnplacedScenes,
  getCachedProject,
} from "@/lib/offline/db";
import { EditorShell } from "./EditorShell";
import { OfflinePageMessage } from "@/components/ui/OfflinePageMessage";
import type { Chapter, Project, Scene } from "@/lib/types";

interface OfflineEditorFallbackProps {
  projectId: string;
  /** The Chapter to rebuild from the offline cache, or null for the Project's Unplaced Scenes. */
  chapterId: string | null;
}

type LoadState = "loading" | "found" | "not_found";

export function OfflineEditorFallback({
  projectId,
  chapterId,
}: OfflineEditorFallbackProps) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        if (chapterId === null) {
          const [cachedScenes, cachedProject] = await Promise.all([
            getCachedUnplacedScenes(projectId),
            getCachedProject(projectId),
          ]);
          if (cachedScenes.length > 0 && cachedProject) {
            setScenes(cachedScenes);
            setProject(cachedProject);
            setLoadState("found");
          } else {
            setLoadState("not_found");
          }
          return;
        }

        const [cachedScenes, meta] = await Promise.all([
          getCachedScenesForChapter(chapterId),
          getCachedChapterMeta(chapterId),
        ]);

        if (cachedScenes.length > 0 && meta) {
          setScenes(cachedScenes);
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
  }, [projectId, chapterId]);

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

  if (loadState === "not_found" || !project || (chapterId !== null && !chapter)) {
    return <OfflinePageMessage />;
  }

  return (
    <EditorShell
      projectId={projectId}
      initialScenes={scenes}
      chapter={chapter}
      project={project}
      allChapters={[]}
    />
  );
}
