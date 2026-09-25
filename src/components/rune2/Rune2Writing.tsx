"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createScene, getScene } from "@/lib/actions/scenes";
import { cacheScene, getCachedScene } from "@/lib/offline/db";
import type { WritingTarget } from "@/lib/rune2/writingTarget";
import type { Scene } from "@/lib/types";

// Hosts the Rune 2.0 writing surface for the current WritingTarget. It opens
// Scenes by id and hands the editor one at a time; the editor instance stays
// mounted for the whole shell, so every Scene switch goes through the engine's
// own switch path (flush the departing Scene by its id, then load the next).
//
// Opened Scenes are kept here, and kept current from the editor's own reports
// (onSceneUpdated) — the same model as the legacy EditorShell — so returning
// to a Scene shows what was last typed, not an older server read. The engine
// then prefers any unsynced local draft over this copy.

const Rune2Editor = dynamic(() => import("./Rune2Editor"), { ssr: false });

type LoadState = { id: string; failed: boolean } | null;

export function Rune2Writing({ projectId, target }: { projectId: string; target: WritingTarget | null }) {
  const router = useRouter();
  const [scenes, setScenes] = useState<Record<string, Scene>>({});
  const [load, setLoad] = useState<LoadState>(null);
  const [creating, startCreating] = useTransition();
  const [createFailed, setCreateFailed] = useState(false);

  const sceneId = target?.kind === "scene" ? target.sceneId : null;
  // Null until this exact Scene is loaded: the editor never shows (or accepts
  // typing into) anything but the Scene the writer asked for.
  const currentScene = sceneId ? scenes[sceneId] ?? null : null;

  const fetchScene = useCallback(
    async (id: string) => {
      setLoad({ id, failed: false });
      let scene: Scene | null = null;
      try {
        const result = await getScene(id);
        if (result.data) {
          scene = result.data;
          // Primes the offline cache and the confirmed-server baseline the
          // engine's conflict check reads — as EditorShell does on load.
          await cacheScene(scene, projectId);
        }
      } catch {
        // Offline or unreachable: fall through to the device's copy.
      }
      scene ??= await getCachedScene(id);
      if (!scene) {
        setLoad({ id, failed: true });
        return;
      }
      const loaded = scene;
      // Never replace a copy the editor has already updated.
      setScenes((prev) => (prev[id] ? prev : { ...prev, [id]: loaded }));
      setLoad((prev) => (prev?.id === id ? null : prev));
    },
    [projectId]
  );

  useEffect(() => {
    if (!sceneId || scenes[sceneId]) return;
    let stale = false;
    queueMicrotask(() => {
      if (!stale) void fetchScene(sceneId);
    });
    return () => {
      stale = true;
    };
    // Only a change of Scene starts a load; `scenes` changes on every save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneId, fetchScene]);

  const handleSceneUpdated = useCallback((id: string, updates: Partial<Scene>) => {
    setScenes((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...updates } } : prev));
  }, []);

  function startChapter(chapterId: string) {
    setCreateFailed(false);
    startCreating(async () => {
      const result = await createScene(chapterId, "Scene 1");
      if (result.error !== null) {
        setCreateFailed(true);
        return;
      }
      await cacheScene(result.data, projectId);
      setScenes((prev) => ({ ...prev, [result.data.id]: result.data }));
      // The Chapter's new Scene appears once the manuscript is re-read.
      router.refresh();
    });
  }

  const failed = sceneId !== null && load?.id === sceneId && load.failed;

  const header = target ? (
    <header className="r2-doc-head">
      {target.kind === "scene" && target.eyebrow && <p className="r2-doc-eyebrow">{target.eyebrow}</p>}
      <h1 className="r2-doc-title">{target.title}</h1>
      {target.kind === "scene" && target.note && <p className="r2-doc-note">{target.note}</p>}
    </header>
  ) : null;

  let placeholder = null;
  if (target?.kind === "emptyChapter") {
    placeholder = (
      <div className="r2-doc-empty">
        <p>This chapter has no scenes.</p>
        <button
          type="button"
          className="r2-button"
          disabled={creating}
          onClick={() => startChapter(target.chapterId)}
        >
          {creating ? "Starting…" : "Start writing"}
        </button>
        {createFailed && <p role="alert">Couldn’t start the chapter. Nothing was changed — try again.</p>}
      </div>
    );
  } else if (failed && sceneId) {
    placeholder = (
      <div className="r2-doc-empty" role="alert">
        <p>This scene couldn’t be opened.</p>
        <button type="button" className="r2-button" onClick={() => void fetchScene(sceneId)}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <Rune2Editor
      projectId={projectId}
      currentScene={currentScene}
      onSceneUpdated={handleSceneUpdated}
      header={header}
      placeholder={placeholder}
    />
  );
}
