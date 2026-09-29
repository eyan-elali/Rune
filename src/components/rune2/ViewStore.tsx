"use client";

import { createContext, useCallback, useContext, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  createCollectionView,
  deleteCollectionView,
  moveCollectionView,
  updateCollectionView,
  type CollectionViewChanges,
} from "@/lib/actions/workspaceViews";
import { createSceneView, deleteSceneView, moveSceneView, updateSceneView } from "@/lib/actions/sceneViews";
import {
  activeView,
  fallbackListView,
  isFallbackView,
  isSceneView,
  viewOwner,
  viewsOf as orderedViewsOf,
} from "@/lib/rune2/collectionViews";
import type { ProjectWorkspace } from "@/lib/rune2/projectWorkspace";
import { sceneFallbackView } from "@/lib/rune2/sceneViews";
import type { CollectionProperty, CollectionViewConfig, CollectionViewType, SavedView, SceneProperty } from "@/lib/types";
import { applyOverlay, drop, networkError, put, settle, usePropertyStore, withoutSettled, type Overlay } from "./PropertyStore";
import { useRune2Selection } from "./Rune2Selection";

// The shell's view of saved Views — a Collection's (migration 027) and the
// Manuscript's Scene Views (032), through one store: the same engine, the
// same controls. Like the property store: the server read is the truth, a
// change shows at once through an overlay, is written by its owner's action,
// and the workspace is re-read. A View is configuration only — nothing here
// writes an item, a value or any prose, and nothing here changes the
// manuscript's order.
//
// Which View an owner is showing is kept for the session (like the
// working-set tabs); an owner opens in its first View until the writer picks
// another. Before 027 is applied, each Collection has one unsaved List built
// from shown_in_list, and no View can be created. A Manuscript with no saved
// Scene View shows an unsaved List in manuscript order; the first change to
// it saves it (create_scene_view), so a writer who only looks writes nothing.
//
// Also kept here for the session: whether the Manuscript's page shows its
// Scene Views, and which of its tools is open — so the Inspector can open
// "Scene properties" there.

export type ScenePanel = "view" | "properties" | null;

type ViewStore = {
  /** Whether saved Collection Views exist on this database (migration 027 applied). */
  available: boolean;
  /** Whether Scene Views exist on this database (migration 032 applied). */
  sceneAvailable: boolean;
  /** An owner's Views in order — never empty. */
  viewsOf: (ownerId: string) => SavedView[];
  /** The View an owner is showing. */
  activeViewOf: (ownerId: string) => SavedView;
  /**
   * A saved View by id, whoever owns it — what an embed in a Page shows. null
   * when there is none: deleted, never saved, or its Collection in Trash.
   */
  viewById: (viewId: string) => SavedView | null;
  /** Every saved View, Collections' and the Manuscript's, in no particular order. */
  savedViews: SavedView[];
  setActiveView: (ownerId: string, viewId: string) => void;
  /** Creates a View at the end and shows it. Resolves to an error message, or null. */
  createView: (
    ownerId: string,
    type: CollectionViewType,
    name: string,
    config?: CollectionViewConfig | null
  ) => Promise<string | null>;
  /** As createView, resolving to the new View's id. */
  createViewWithId: (
    ownerId: string,
    type: CollectionViewType,
    name: string,
    config?: CollectionViewConfig | null
  ) => Promise<{ id: string; error: null } | { id: null; error: string }>;
  updateView: (view: SavedView, changes: CollectionViewChanges) => Promise<string | null>;
  moveView: (view: SavedView, index: number) => Promise<string | null>;
  deleteView: (view: SavedView) => Promise<string | null>;
  /** Whether the Manuscript's page shows its Scene Views, and which tool is open there. */
  scenesOpen: boolean;
  scenePanel: ScenePanel;
  openScenes: (panel?: ScenePanel) => void;
  closeScenes: () => void;
  setScenePanel: (panel: ScenePanel | ((open: ScenePanel) => ScenePanel)) => void;
};

const Context = createContext<ViewStore | null>(null);

export function useViewStore(): ViewStore {
  const store = useContext(Context);
  if (!store) throw new Error("useViewStore outside ViewStoreProvider");
  return store;
}

export function ViewStoreProvider({ workspace, children }: { workspace: ProjectWorkspace; children: ReactNode }) {
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const { manuscript } = useRune2Selection();
  const projectId = manuscript.project.id;
  const { propertiesOf, manuscriptId } = usePropertyStore();
  const [overlay, setOverlay] = useState<Overlay<SavedView>>(() => new Map());
  const [active, setActive] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [scenesOpen, setScenesOpen] = useState(false);
  const [scenePanel, setScenePanel] = useState<ScenePanel>(null);

  // A fresh read supersedes every overlay whose write has settled.
  const [read, setRead] = useState(workspace);
  if (read !== workspace) {
    setRead(workspace);
    setOverlay(withoutSettled);
  }

  const available = workspace.viewable;
  const sceneAvailable = manuscriptId !== null;
  const all = useMemo(
    () =>
      [
        ...applyOverlay(
          new Map<string, SavedView>([...workspace.views, ...workspace.sceneViews].map((v) => [v.id, v])),
          overlay
        ).values(),
      ],
    [workspace.views, workspace.sceneViews, overlay]
  );

  const isManuscript = useCallback((ownerId: string) => manuscriptId !== null && ownerId === manuscriptId, [manuscriptId]);

  const viewsOf = useCallback(
    (ownerId: string): SavedView[] => {
      if (isManuscript(ownerId)) {
        const saved = orderedViewsOf(all, ownerId);
        return saved.length
          ? saved
          : [sceneFallbackView(ownerId, projectId, propertiesOf(ownerId) as SceneProperty[])];
      }
      const saved = available ? orderedViewsOf(all, ownerId) : [];
      return saved.length ? saved : [fallbackListView(ownerId, propertiesOf(ownerId) as CollectionProperty[])];
    },
    [all, available, propertiesOf, isManuscript, projectId]
  );

  const activeViewOf = useCallback(
    (ownerId: string) => {
      return activeView(viewsOf(ownerId), active.get(ownerId));
    },
    [viewsOf, active]
  );

  const byId = useMemo(() => new Map(all.map((v) => [v.id, v])), [all]);
  const viewById = useCallback((viewId: string) => byId.get(viewId) ?? null, [byId]);

  const setActiveView = useCallback((ownerId: string, viewId: string) => {
    setActive((m) => new Map(m).set(ownerId, viewId));
  }, []);

  const refresh = useCallback(() => startRefresh(() => router.refresh()), [router]);

  const createViewWithId = useCallback<ViewStore["createViewWithId"]>(
    async (ownerId, type, name, config = null) => {
      const r = await (isManuscript(ownerId)
        ? createSceneView(projectId, name, type, config)
        : createCollectionView(ownerId, name, type, config)
      ).catch(() => networkError);
      if (r.error === null) {
        setOverlay((o) => settle(put<SavedView>(o, [[r.data.id, r.data]]), [r.data.id]));
        setActiveView(ownerId, r.data.id);
      }
      refresh();
      return r.error === null ? { id: r.data.id, error: null } : { id: null, error: r.error };
    },
    [refresh, setActiveView, isManuscript, projectId]
  );

  const createView = useCallback<ViewStore["createView"]>(
    async (...args) => (await createViewWithId(...args)).error,
    [createViewWithId]
  );

  const updateView = useCallback<ViewStore["updateView"]>(
    async (view, changes) => {
      const shown: SavedView = {
        ...view,
        ...(changes.name !== undefined && { name: changes.name.trim() || view.name }),
        ...(changes.type !== undefined && { type: changes.type }),
        ...(changes.config !== undefined && { config: changes.config }),
      };
      // The Manuscript's unsaved List: its first change saves it as a real View.
      if (isSceneView(view) && isFallbackView(view)) {
        return createView(view.manuscript_id, shown.type, shown.name, shown.config);
      }
      setOverlay((o) => put(o, [[view.id, shown]]));
      const r = await (isSceneView(view)
        ? updateSceneView(view.id, changes)
        : updateCollectionView(view.id, changes)
      ).catch(() => networkError);
      setOverlay((o) => (r.error !== null ? drop(o, [view.id]) : settle<SavedView>(o, [view.id], r.data)));
      refresh();
      return r.error;
    },
    [refresh, createView]
  );

  const moveView = useCallback<ViewStore["moveView"]>(
    async (view, index) => {
      if (isFallbackView(view)) return null;
      const order = viewsOf(viewOwner(view)).filter((v) => v.id !== view.id);
      order.splice(Math.max(0, Math.min(index, order.length)), 0, view);
      const keys = order.map((v) => v.id);
      setOverlay((o) => put(o, order.map((v, i) => [v.id, { ...v, position: i + 1 }])));
      const r = await (isSceneView(view) ? moveSceneView(view.id, index) : moveCollectionView(view.id, index)).catch(
        () => networkError
      );
      setOverlay((o) => (r.error !== null ? drop(o, keys) : settle(o, keys)));
      refresh();
      return r.error;
    },
    [refresh, viewsOf]
  );

  const deleteView = useCallback<ViewStore["deleteView"]>(
    async (view) => {
      if (isFallbackView(view)) return null;
      const r = await (isSceneView(view) ? deleteSceneView(view.id) : deleteCollectionView(view.id)).catch(
        () => networkError
      );
      if (r.error === null) setOverlay((o) => settle(put(o, [[view.id, null]]), [view.id]));
      refresh();
      return r.error;
    },
    [refresh]
  );

  const openScenes = useCallback((panel: ScenePanel = null) => {
    setScenesOpen(true);
    if (panel) setScenePanel(panel);
  }, []);
  const closeScenes = useCallback(() => {
    setScenesOpen(false);
    setScenePanel(null);
  }, []);

  const store = useMemo<ViewStore>(
    () => ({
      available,
      sceneAvailable,
      viewsOf,
      activeViewOf,
      viewById,
      savedViews: all,
      setActiveView,
      createView,
      createViewWithId,
      updateView,
      moveView,
      deleteView,
      scenesOpen,
      scenePanel,
      openScenes,
      closeScenes,
      setScenePanel,
    }),
    [
      available,
      sceneAvailable,
      viewsOf,
      activeViewOf,
      viewById,
      all,
      setActiveView,
      createView,
      createViewWithId,
      updateView,
      moveView,
      deleteView,
      scenesOpen,
      scenePanel,
      openScenes,
      closeScenes,
    ]
  );

  return <Context.Provider value={store}>{children}</Context.Provider>;
}
