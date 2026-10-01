"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createScene, getScene } from "@/lib/actions/scenes";
import { cacheScene, getCachedScene } from "@/lib/offline/db";
import { SCENE_RESTORED_EVENT } from "@/lib/sceneRestoredEvent";
import type { WritingTarget } from "@/lib/rune2/writingTarget";
import type { Scene } from "@/lib/types";
import type { SurfaceScene } from "./Rune2Editor";
import { useRune2Selection } from "./Rune2Selection";

// Hosts the Rune 2.0 writing surface for the current WritingTarget: loads the
// Scenes it shows, by id, and hands them to the surface, which gives each its
// own editor instance (see Rune2Editor).
//
// Opened Scenes are kept here, and kept current from the editors' own reports
// (onSceneUpdated, and each editor's last content when it leaves the surface)
// — the same model as the legacy EditorShell — so returning to a Scene shows
// what was last typed, not an older server read. The engine then prefers any
// unsynced local draft over this copy.

const Rune2Editor = dynamic(() => import("./Rune2Editor"), { ssr: false });

export function Rune2Writing({ projectId, target }: { projectId: string; target: WritingTarget | null }) {
  const router = useRouter();
  const { selected, focusSceneId, requestSceneFocus } = useRune2Selection();
  const [scenes, setScenes] = useState<Record<string, Scene>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const loading = useRef(new Set<string>());
  const [creating, startCreating] = useTransition();
  const [createFailed, setCreateFailed] = useState(false);

  const fetchScene = useCallback(
    async (id: string) => {
      if (loading.current.has(id)) return;
      loading.current.add(id);
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
      try {
        scene ??= await getCachedScene(id);
      } catch {
        // No device copy either.
      }
      loading.current.delete(id);
      if (!scene) {
        setFailed((prev) => ({ ...prev, [id]: true }));
        return;
      }
      const loaded = scene;
      // Never replace a copy an editor has already updated.
      setScenes((prev) => (prev[id] ? prev : { ...prev, [id]: loaded }));
      setFailed((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    },
    [projectId]
  );

  // Load every shown Scene not yet held (and not already known to fail).
  const shownIds = target?.kind === "scenes" ? target.scenes.map((s) => s.id) : [];
  const missingKey = shownIds.filter((id) => !scenes[id] && !failed[id]).join(",");
  useEffect(() => {
    if (!missingKey) return;
    for (const id of missingKey.split(",")) void fetchScene(id);
  }, [missingKey, fetchScene]);

  const retry = useCallback(
    (id: string) => {
      setFailed((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    },
    []
  );

  const handleSceneUpdated = useCallback((id: string, updates: Partial<Scene>) => {
    setScenes((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...updates } } : prev));
  }, []);

  // A restore from Scene History replaces a held copy, even one an editor
  // updated: the server now holds the restored text as a newer version.
  useEffect(() => {
    const onRestored = (event: Event) => {
      const restored = (event as CustomEvent<Scene>).detail;
      if (restored) handleSceneUpdated(restored.id, restored);
    };
    window.addEventListener(SCENE_RESTORED_EVENT, onRestored);
    return () => window.removeEventListener(SCENE_RESTORED_EVENT, onRestored);
  }, [handleSceneUpdated]);

  const clearFocusRequest = useCallback(() => requestSceneFocus(null), [requestSceneFocus]);

  // An empty Chapter's first Scene is made the moment the writer reaches for
  // the page (a click or a keystroke on the invitation), and takes focus once
  // its editor appears — so beginning a Chapter is simply beginning to write.
  function startChapter(chapterId: string) {
    if (creating) return;
    setCreateFailed(false);
    startCreating(async () => {
      const result = await createScene(chapterId, null);
      if (result.error !== null) {
        setCreateFailed(true);
        return;
      }
      await cacheScene(result.data, projectId);
      setScenes((prev) => ({ ...prev, [result.data.id]: result.data }));
      requestSceneFocus(result.data.id);
      // The Chapter's new Scene appears once the manuscript is re-read.
      router.refresh();
    });
  }

  const surfaceScenes: SurfaceScene[] =
    target?.kind === "scenes"
      ? target.scenes.map((s) => ({
          id: s.id,
          scene: scenes[s.id] ?? null,
          failed: failed[s.id] === true,
          mark: s.mark,
        }))
      : [];

  const header = target ? (
    <header className="r2-doc-head">
      {target.kind === "scenes" && target.eyebrow && <p className="r2-doc-eyebrow">{target.eyebrow}</p>}
      <h1 className="r2-doc-title">{target.title}</h1>
    </header>
  ) : null;

  // An empty Chapter: the title, and under it the quiet beginning of the
  // prose — the same "Start writing" an empty Scene shows, in the manuscript's
  // own type, where the first line will be. No card, no explanation.
  const placeholder =
    target?.kind === "emptyChapter" ? (
      <div className="r2-doc-begin">
        <button
          type="button"
          className="r2-doc-begin-line"
          aria-label="Start writing this chapter"
          aria-busy={creating || undefined}
          onClick={() => startChapter(target.chapterId)}
          onKeyDown={(e) => {
            // A first keystroke begins the Chapter too; the Scene takes focus as it appears.
            if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) startChapter(target.chapterId);
          }}
        >
          {creating ? "Starting…" : "Start writing"}
        </button>
        {createFailed && (
          <p role="alert" className="r2-doc-note">
            Couldn’t start the chapter. Nothing was changed — try again.
          </p>
        )}
      </div>
    ) : null;

  return (
    <Rune2Editor
      projectId={projectId}
      viewKey={selected?.id ?? null}
      scenes={surfaceScenes}
      marks={target?.kind === "scenes" && target.marks}
      onSceneUpdated={handleSceneUpdated}
      onRetry={retry}
      focusSceneId={focusSceneId}
      onFocusHandled={clearFocusRequest}
      header={header}
      placeholder={placeholder}
    />
  );
}
