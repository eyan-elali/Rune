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
import { fallbackListView, viewsOf as orderedViewsOf } from "@/lib/rune2/collectionViews";
import type { ProjectWorkspace } from "@/lib/rune2/projectWorkspace";
import type { CollectionViewConfig, CollectionViewType, WorkspaceCollectionView } from "@/lib/types";
import { applyOverlay, drop, networkError, put, settle, usePropertyStore, withoutSettled, type Overlay } from "./PropertyStore";

// The shell's view of saved Collection Views (migration 027). Like the
// property store: the server read is the truth, a change shows at once
// through an overlay, is written by its action, and the workspace is re-read.
// A View is configuration only — nothing here writes an Entry or a value.
//
// Which View a Collection is showing is kept for the session (like the
// working-set tabs); a Collection opens in its first View until the writer
// picks another. Before 027 is applied, each Collection has one unsaved List
// built from shown_in_list, and no View can be created.

type ViewStore = {
  /** Whether saved Views exist on this database (migration 027 applied). */
  available: boolean;
  /** A Collection's Views in order — never empty. */
  viewsOf: (collectionId: string) => WorkspaceCollectionView[];
  /** The View a Collection is showing. */
  activeViewOf: (collectionId: string) => WorkspaceCollectionView;
  setActiveView: (collectionId: string, viewId: string) => void;
  /** Creates a View at the end and shows it. Resolves to an error message, or null. */
  createView: (
    collectionId: string,
    type: CollectionViewType,
    name: string,
    config?: CollectionViewConfig | null
  ) => Promise<string | null>;
  updateView: (view: WorkspaceCollectionView, changes: CollectionViewChanges) => Promise<string | null>;
  moveView: (view: WorkspaceCollectionView, index: number) => Promise<string | null>;
  deleteView: (view: WorkspaceCollectionView) => Promise<string | null>;
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
  const { propertiesOf } = usePropertyStore();
  const [overlay, setOverlay] = useState<Overlay<WorkspaceCollectionView>>(() => new Map());
  const [active, setActive] = useState<ReadonlyMap<string, string>>(() => new Map());

  // A fresh read supersedes every overlay whose write has settled.
  const [read, setRead] = useState(workspace);
  if (read !== workspace) {
    setRead(workspace);
    setOverlay(withoutSettled);
  }

  const available = workspace.viewable;
  const all = useMemo(
    () => [...applyOverlay(new Map(workspace.views.map((v) => [v.id, v])), overlay).values()],
    [workspace.views, overlay]
  );

  const viewsOf = useCallback(
    (collectionId: string) => {
      const saved = available ? orderedViewsOf(all, collectionId) : [];
      return saved.length ? saved : [fallbackListView(collectionId, propertiesOf(collectionId))];
    },
    [all, available, propertiesOf]
  );

  const activeViewOf = useCallback(
    (collectionId: string) => {
      const views = viewsOf(collectionId);
      return views.find((v) => v.id === active.get(collectionId)) ?? views[0];
    },
    [viewsOf, active]
  );

  const setActiveView = useCallback((collectionId: string, viewId: string) => {
    setActive((m) => new Map(m).set(collectionId, viewId));
  }, []);

  const refresh = useCallback(() => startRefresh(() => router.refresh()), [router]);

  const createView = useCallback<ViewStore["createView"]>(
    async (collectionId, type, name, config = null) => {
      const r = await createCollectionView(collectionId, name, type, config).catch(() => networkError);
      if (r.error === null) {
        setOverlay((o) => settle(put(o, [[r.data.id, r.data]]), [r.data.id]));
        setActiveView(collectionId, r.data.id);
      }
      refresh();
      return r.error;
    },
    [refresh, setActiveView]
  );

  const updateView = useCallback<ViewStore["updateView"]>(
    async (view, changes) => {
      const shown: WorkspaceCollectionView = {
        ...view,
        ...(changes.name !== undefined && { name: changes.name.trim() || view.name }),
        ...(changes.type !== undefined && { type: changes.type }),
        ...(changes.config !== undefined && { config: changes.config }),
      };
      setOverlay((o) => put(o, [[view.id, shown]]));
      const r = await updateCollectionView(view.id, changes).catch(() => networkError);
      setOverlay((o) => (r.error !== null ? drop(o, [view.id]) : settle(o, [view.id], r.data)));
      refresh();
      return r.error;
    },
    [refresh]
  );

  const moveView = useCallback<ViewStore["moveView"]>(
    async (view, index) => {
      const order = viewsOf(view.collection_id).filter((v) => v.id !== view.id);
      order.splice(Math.max(0, Math.min(index, order.length)), 0, view);
      const keys = order.map((v) => v.id);
      setOverlay((o) => put(o, order.map((v, i) => [v.id, { ...v, position: i + 1 }])));
      const r = await moveCollectionView(view.id, index).catch(() => networkError);
      setOverlay((o) => (r.error !== null ? drop(o, keys) : settle(o, keys)));
      refresh();
      return r.error;
    },
    [refresh, viewsOf]
  );

  const deleteView = useCallback<ViewStore["deleteView"]>(
    async (view) => {
      const r = await deleteCollectionView(view.id).catch(() => networkError);
      if (r.error === null) setOverlay((o) => settle(put(o, [[view.id, null]]), [view.id]));
      refresh();
      return r.error;
    },
    [refresh]
  );

  const store = useMemo<ViewStore>(
    () => ({ available, viewsOf, activeViewOf, setActiveView, createView, updateView, moveView, deleteView }),
    [available, viewsOf, activeViewOf, setActiveView, createView, updateView, moveView, deleteView]
  );

  return <Context.Provider value={store}>{children}</Context.Provider>;
}
