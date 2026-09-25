"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SceneList } from "./SceneList";
import { ExportButton } from "./ExportButton";
import { EditorTutorial } from "./EditorTutorial";
import { ModeToggle } from "@/components/ui/ModeToggle";
import { GuideButton } from "@/components/ui/GuideButton";
import type { Scene, Chapter, Project } from "@/lib/types";
import type { ChapterWithScenes } from "@/lib/manuscriptQueries";
import {
  createScene,
  createUnplacedScene,
  deleteScene,
  getScenes,
  reorderScenes,
  moveSceneToUnplaced,
  moveSceneToChapter,
} from "@/lib/actions/scenes";
import { cacheScene, cacheChapterMeta, forgetStalePlacements } from "@/lib/offline/db";
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
   * Unplaced view edits, saves and creates Scenes exactly like a Chapter; it
   * only has no reordering (no narrative order) and no Scene export.
   */
  chapter: Chapter | null;
  /** The Chapter's placed Scenes, or the Unplaced Scenes. May be empty. */
  initialScenes: Scene[];
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
  initialScenes,
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
  const [scenes, setScenes] = useState<Scene[]>(initialScenes);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(
    initialScenes.find((p) => p.id === initialSelectedId)?.id ?? initialScenes[0]?.id ?? null
  );
  const scenesRef = useRef(scenes);
  useEffect(() => {
    scenesRef.current = scenes;
  }, [scenes]);
  const [guideTriggerCount, setGuideTriggerCount] = useState(0);
  const setCurrentScene = useEditorStore((s) => s.setCurrentScene);
  const showToast = useToastStore((s) => s.showToast);
  const pathname = usePathname();
  const mode = useModeStore((s) => s.mode);
  const shouldHideFocusUI = mode === "focus" && isManuscriptEditorPath(pathname);

  useEffect(() => {
    if (selectedSceneId) {
      setCurrentScene(projectId, chapterId, selectedSceneId);
    }
  }, [selectedSceneId, projectId, chapterId, setCurrentScene]);

  useEffect(() => {
    void (async () => {
      try {
        if (chapter) await cacheChapterMeta(chapter, project);
        await Promise.all(initialScenes.map((p) => cacheScene(p, projectId)));
        await forgetStalePlacements(projectId, chapterId, initialScenes.map((p) => p.id));
      } catch {
        // best-effort
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentScene = scenes.find((p) => p.id === selectedSceneId) ?? null;

  const handleSelectScene = useCallback((sceneId: string) => {
    setSelectedSceneId(sceneId);
  }, []);

  // Appends a new, empty Scene to this Chapter or to the Unplaced Scenes. Both
  // go through the server's free-limit-checked creation RPCs.
  const handleAddScene = useCallback(async () => {
    const title = `Scene ${scenesRef.current.length + 1}`;
    const { data, error } = chapterId
      ? await createScene(chapterId, title)
      : await createUnplacedScene(projectId, title);
    if (!data || error) {
      showToast("Couldn't add a scene — try again when you're back online.", "error");
      return;
    }
    await cacheScene(data, projectId);
    setScenes((prev) => [...prev, data]);
    setSelectedSceneId(data.id);
  }, [chapterId, projectId, showToast]);

  /**
   * Drops a Scene from this view after it was deleted or moved elsewhere. If it
   * was open, the next Scene opens — the editor's scene switch then flushes the
   * departing Scene's latest content to the offline queue and syncs it by ID,
   * wherever it now lives. Returns how many Scenes remain.
   */
  const removeFromView = useCallback((sceneId: string): number => {
    // Called after an awaited server action: read the list through a ref and
    // update it functionally, so content the editor reported meanwhile
    // (handleSceneUpdated) is never replaced by a stale copy.
    const current = scenesRef.current;
    const index = current.findIndex((p) => p.id === sceneId);
    const remaining = current.filter((p) => p.id !== sceneId);
    setScenes((prev) => prev.filter((p) => p.id !== sceneId));
    setSelectedSceneId((selected) =>
      selected === sceneId
        ? remaining[Math.min(index, remaining.length - 1)]?.id ?? null
        : selected
    );
    return remaining.length;
  }, []);

  // Deleting a Scene is permanent (there is no Trash yet), so it is always
  // confirmed, and the confirmation offers Unplaced Scenes as the way to set
  // a Scene aside without losing it. A Chapter's only Scene may be deleted:
  // the Chapter stays, empty, with its "Add Scene" state.
  const handleDeleteScene = useCallback(
    async (sceneId: string) => {
      const scene = scenesRef.current.find((p) => p.id === sceneId);
      if (!scene) return;
      const words = scene.word_count ?? 0;
      const message =
        `Delete “${scene.title}” permanently?` +
        (words > 0 ? ` Its ${words.toLocaleString()} ${words === 1 ? "word" : "words"} will be lost.` : "") +
        (chapterId && scenesRef.current.length === 1 ? " This chapter will be left empty." : "") +
        (chapterId ? "\n\nTo set it aside without deleting it, move it to Unplaced Scenes instead." : "") +
        "\n\nThis can't be undone.";
      if (!window.confirm(message)) return;
      const { error } = await deleteScene(sceneId);
      if (error) {
        showToast("Couldn't delete this scene — nothing was changed.", "error");
        return;
      }
      removeFromView(sceneId);
      router.refresh();
    },
    [chapterId, removeFromView, router, showToast]
  );

  const handleMoveToUnplaced = useCallback(
    async (sceneId: string) => {
      const { data, error } = await moveSceneToUnplaced(sceneId);
      if (error || !data) {
        showToast("Couldn't move this scene — try again when you're back online.", "error");
        return;
      }
      await cacheScene(data, projectId);
      removeFromView(sceneId);
      showToast(`“${data.title}” moved to Unplaced Scenes`, "success");
      router.refresh();
    },
    [projectId, removeFromView, router, showToast]
  );

  const handleMoveToChapter = useCallback(
    async (sceneId: string, targetChapterId: string) => {
      const { data, error } = await moveSceneToChapter(sceneId, targetChapterId);
      if (error || !data) {
        showToast("Couldn't move this scene — try again when you're back online.", "error");
        return;
      }
      await cacheScene(data, projectId);
      const left = removeFromView(sceneId);
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

  const handleRenameScene = useCallback((sceneId: string, title: string) => {
    setScenes((prev) =>
      prev.map((p) => (p.id === sceneId ? { ...p, title } : p))
    );
  }, []);

  const handleSceneUpdated = useCallback(
    (sceneId: string, updates: Partial<Scene>) => {
      setScenes((prev) =>
        prev.map((p) => (p.id === sceneId ? { ...p, ...updates } : p))
      );
    },
    []
  );

  const handleReorderScenes = useCallback(
    async (orderedSceneIds: string[]) => {
      if (!chapterId) return;
      const previous = scenes;
      const reordered = orderedSceneIds
        .map((id, index) => {
          const scene = previous.find((p) => p.id === id);
          return scene ? { ...scene, position: index } : null;
        })
        .filter((p): p is Scene => p !== null);

      setScenes(reordered);

      const { error, stale } = await reorderScenes(chapterId, orderedSceneIds);
      if (stale) {
        // A Scene moved in or out of this Chapter elsewhere; nothing changed on
        // the server. Take the server's list, keeping the local copy of any
        // Scene still here (it may hold content newer than the fetch).
        const { data: fresh } = await getScenes(chapterId);
        if (fresh) {
          const local = new Map(scenesRef.current.map((p) => [p.id, p]));
          const merged = fresh.map((p) => {
            const mine = local.get(p.id);
            return mine ? { ...mine, position: p.position } : p;
          });
          setScenes(merged);
          setSelectedSceneId((selected) =>
            merged.some((p) => p.id === selected) ? selected : merged[0]?.id ?? null
          );
          await Promise.all(merged.map((p) => cacheScene(p, projectId)));
        } else {
          setScenes(previous);
        }
        showToast("This chapter changed elsewhere — its scenes have been refreshed.", "info");
        return;
      }
      if (error) {
        setScenes(previous);
        showToast(
          "Couldn't reorder scenes — try again when you're back online.",
          "error"
        );
        return;
      }

      // Keep the offline cache's position values in sync so the offline
      // scene list (sorted by position) stays correct.
      await Promise.all(reordered.map((p) => cacheScene(p, projectId)));
    },
    [scenes, chapterId, projectId, showToast]
  );

  return (
    <div className="flex min-h-0 h-full overflow-hidden">
      <EditorTutorial active={showTutorial} forceRun={forceTutorial} replayTrigger={guideTriggerCount} />
      {!shouldHideFocusUI && (
        <SceneList
          scenes={scenes}
          selectedSceneId={selectedSceneId}
          onSelectScene={handleSelectScene}
          onAddScene={handleAddScene}
          onDeleteScene={handleDeleteScene}
          onRenameScene={handleRenameScene}
          onReorderScenes={chapterId ? handleReorderScenes : undefined}
          onMoveToUnplaced={chapterId ? handleMoveToUnplaced : undefined}
          onMoveToChapter={handleMoveToChapter}
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
              {chapter && <ExportButton scene={currentScene} chapter={chapter} project={project} />}
            </div>
          </div>
        )}
        <RuneEditor
          projectId={projectId}
          chapterId={chapterId}
          currentScene={currentScene}
          onSceneUpdated={handleSceneUpdated}
          onRenameScene={handleRenameScene}
          accountWordTotal={accountWordTotal}
          emptyState={
            scenes.length === 0 ? (
              <div className="flex max-w-sm flex-col items-center gap-3 px-6 text-center">
                <p className="font-rune-serif text-lg" style={{ color: "var(--text-primary)" }}>
                  {chapter ? "This chapter has no scenes yet" : "No Unplaced Scenes"}
                </p>
                <p className="text-sm" style={{ color: "var(--color-mist)" }}>
                  {chapter
                    ? "Start a scene here, or move one in from another chapter."
                    : "A scene kept here stays outside your manuscript’s word count and export until you place it in a chapter."}
                </p>
                <button
                  type="button"
                  onClick={handleAddScene}
                  className="mt-1 rounded px-3 py-1.5 text-sm transition-colors duration-100 hover:bg-rune-gold/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rune-gold"
                  style={{ color: "var(--color-gold)" }}
                >
                  {chapter ? "Add Scene" : "New Unplaced Scene"}
                </button>
              </div>
            ) : undefined
          }
        />
      </div>
    </div>
  );
}
