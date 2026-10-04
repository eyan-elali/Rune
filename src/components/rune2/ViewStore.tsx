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
import { MANUSCRIPT_SCOPE, defaultViewFor, sceneFallbackView, type SceneScope } from "@/lib/rune2/sceneViews";
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
// Each Base owns its Views (Milestone 21F, migration 044): the Manuscript's
// page keeps its Scene Views (group_id null) and each Group's page its own
// (group_id), over the same canonical Scenes within that Base's structural
// scope (lib/rune2/sceneViews scopedSceneOrder). Asked for a Group's Views,
// this store answers with that Group's; a View made from a Group's page is
// that Group's; a Base with none shows an unsaved List that its first change
// saves. Which View a Base is showing is kept for the session.
//
// Also kept here for the session: which of the Scene Views' tools is open on
// the Manuscript's page — so the Inspector can open "Scene properties" there.

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
  /** Which tool is open with the Scene Views on the Manuscript's page. */
  scenePanel: ScenePanel;
  /** Opens the Scene Views' tool (the Inspector's way to "Scene properties"). */
  openScenes: (panel?: ScenePanel) => void;
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
  const { manuscript, index } = useRune2Selection();
  const projectId = manuscript.project.id;
  const { propertiesOf, manuscriptId } = usePropertyStore();
  const [overlay, setOverlay] = useState<Overlay<SavedView>>(() => new Map());
  const [active, setActive] = useState<ReadonlyMap<string, string>>(() => new Map());
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

  // A Scene Base: the Manuscript's page, or a Group's (its own Views, 044);
  // anything else is a Collection.
  const isGroup = useCallback((ownerId: string) => index.get(ownerId)?.kind === "group", [index]);
  const sceneScopeOf = useCallback(
    (ownerId: string): SceneScope | null =>
      manuscriptId === null
        ? null
        : ownerId === manuscriptId
          ? MANUSCRIPT_SCOPE
          : isGroup(ownerId)
            ? { kind: "group", groupId: ownerId }
            : null,
    [manuscriptId, isGroup]
  );

  const viewsOf = useCallback(
    (ownerId: string): SavedView[] => {
      const scope = sceneScopeOf(ownerId);
      if (scope !== null && manuscriptId !== null) {
        const saved = orderedViewsOf(all, ownerId);
        return saved.length
          ? saved
          : [sceneFallbackView(manuscriptId, projectId, propertiesOf(manuscriptId) as SceneProperty[], scope)];
      }
      const saved = available ? orderedViewsOf(all, ownerId) : [];
      return saved.length ? saved : [fallbackListView(ownerId, propertiesOf(ownerId) as CollectionProperty[])];
    },
    [all, available, propertiesOf, sceneScopeOf, manuscriptId, projectId]
  );

  const activeViewOf = useCallback(
    (ownerId: string) => {
      const views = viewsOf(ownerId);
      const chosen = active.get(ownerId);
      // Not yet chosen here (or the chosen one deleted): the Base's first View.
      if (chosen !== undefined && views.some((v) => v.id === chosen)) return activeView(views, chosen);
      return defaultViewFor(views, sceneScopeOf(ownerId) ?? MANUSCRIPT_SCOPE);
    },
    [viewsOf, active, sceneScopeOf]
  );

  const byId = useMemo(() => new Map(all.map((v) => [v.id, v])), [all]);
  const viewById = useCallback((viewId: string) => byId.get(viewId) ?? null, [byId]);

  const setActiveView = useCallback((ownerId: string, viewId: string) => {
    setActive((m) => new Map(m).set(ownerId, viewId));
  }, []);

  const refresh = useCallback(() => startRefresh(() => router.refresh()), [router]);

  const createViewWithId = useCallback<ViewStore["createViewWithId"]>(
    async (ownerId, type, name, config = null) => {
      const scope = sceneScopeOf(ownerId);
      const r = await (scope !== null
        ? createSceneView(projectId, name, type, config, scope.kind === "group" ? scope.groupId : null)
        : createCollectionView(ownerId, name, type, config)
      ).catch(() => networkError);
      if (r.error === null) {
        setOverlay((o) => settle(put<SavedView>(o, [[r.data.id, r.data]]), [r.data.id]));
        setActiveView(ownerId, r.data.id);
      }
      refresh();
      return r.error === null ? { id: r.data.id, error: null } : { id: null, error: r.error };
    },
    [refresh, setActiveView, sceneScopeOf, projectId]
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
      // A Base's unsaved List: its first change saves it as that Base's real View.
      if (isSceneView(view) && isFallbackView(view)) {
        return createView(viewOwner(view), shown.type, shown.name, shown.config);
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
    if (panel) setScenePanel(panel);
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
      scenePanel,
      openScenes,
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
      scenePanel,
      openScenes,
    ]
  );

  return <Context.Provider value={store}>{children}</Context.Provider>;
}
