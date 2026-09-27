"use client";

import { createContext, useCallback, useContext, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  createCollectionProperty,
  deleteCollectionProperty,
  moveCollectionProperty,
  setEntryPropertyValue,
  updateCollectionProperty,
  type CollectionPropertyChanges,
  type DeleteCollectionPropertyResult,
} from "@/lib/actions/workspaceProperties";
import { indexValues, propertiesOf as orderedPropertiesOf, valueKey } from "@/lib/rune2/collectionProperties";
import type { ProjectWorkspace } from "@/lib/rune2/projectWorkspace";
import type { CollectionProperty, CollectionPropertyType, PropertyValue } from "@/lib/types";

// The shell's view of Collection properties and Entry values (migration 026),
// shared by the Collection's list and its Entries. The server read
// (loadProjectWorkspace) is the truth; a change shows at once through an
// overlay, is written by its action, and the workspace is re-read. An overlay
// is dropped by the first read after its write settled; a refused write drops
// its overlay at once, so the screen never keeps a value the server refused.
// Property values are small metadata saved per change — not the Entry body,
// which has its own save engine and device copy.

type Layer<T> = { value: T | null; settled: boolean };
type Overlay<T> = ReadonlyMap<string, Layer<T>>;

type PropertyStore = {
  /** Whether properties exist on this database (migration 026 applied). */
  available: boolean;
  propertiesOf: (collectionId: string) => CollectionProperty[];
  /** Every value by valueKey(entryId, propertyId). */
  values: ReadonlyMap<string, PropertyValue>;
  /** Resolves to an error message, or null once saved. */
  setValue: (entryId: string, propertyId: string, value: PropertyValue | null) => Promise<string | null>;
  createProperty: (collectionId: string, name: string, type: CollectionPropertyType) => Promise<string | null>;
  /** Resolves to the property as saved, or an error. */
  updateProperty: (
    property: CollectionProperty,
    changes: CollectionPropertyChanges
  ) => Promise<{ error: string; property: null } | { error: null; property: CollectionProperty }>;
  moveProperty: (property: CollectionProperty, index: number) => Promise<string | null>;
  deleteProperty: (property: CollectionProperty, expectedValues: number) => Promise<DeleteCollectionPropertyResult>;
};

const Context = createContext<PropertyStore | null>(null);

export function usePropertyStore(): PropertyStore {
  const store = useContext(Context);
  if (!store) throw new Error("usePropertyStore outside PropertyStoreProvider");
  return store;
}

function applyOverlay<T>(base: Map<string, T>, overlay: Overlay<T>): Map<string, T> {
  if (overlay.size === 0) return base;
  const next = new Map(base);
  for (const [k, { value }] of overlay) {
    if (value === null) next.delete(k);
    else next.set(k, value);
  }
  return next;
}

/** Overlay edits: show `value` for each key now (settled: false). */
function put<T>(overlay: Overlay<T>, entries: [string, T | null][]): Overlay<T> {
  const next = new Map(overlay);
  for (const [k, value] of entries) next.set(k, { value, settled: false });
  return next;
}
/** The write for these keys is done: show `value` (if given) until the next read. */
function settle<T>(overlay: Overlay<T>, keys: string[], value?: T | null): Overlay<T> {
  const next = new Map(overlay);
  for (const k of keys) {
    const layer = next.get(k);
    if (layer) next.set(k, { value: value === undefined ? layer.value : value, settled: true });
  }
  return next;
}
function drop<T>(overlay: Overlay<T>, keys: string[]): Overlay<T> {
  const next = new Map(overlay);
  keys.forEach((k) => next.delete(k));
  return next;
}
function withoutSettled<T>(overlay: Overlay<T>): Overlay<T> {
  return new Map([...overlay].filter(([, l]) => !l.settled));
}

const networkError = { data: null, error: "Network error" } as const;

export function PropertyStoreProvider({ workspace, children }: { workspace: ProjectWorkspace; children: ReactNode }) {
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const [propertyOverlay, setPropertyOverlay] = useState<Overlay<CollectionProperty>>(() => new Map());
  const [valueOverlay, setValueOverlay] = useState<Overlay<PropertyValue>>(() => new Map());

  // A fresh read supersedes every overlay whose write has settled.
  const [read, setRead] = useState(workspace);
  if (read !== workspace) {
    setRead(workspace);
    setPropertyOverlay(withoutSettled);
    setValueOverlay(withoutSettled);
  }

  const properties = useMemo(
    () => applyOverlay(new Map(workspace.properties.map((p) => [p.id, p])), propertyOverlay),
    [workspace.properties, propertyOverlay]
  );
  const values = useMemo(() => applyOverlay(indexValues(workspace.values), valueOverlay), [workspace.values, valueOverlay]);

  const propertiesOf = useCallback(
    (collectionId: string) => orderedPropertiesOf([...properties.values()], collectionId),
    [properties]
  );

  const refresh = useCallback(() => startRefresh(() => router.refresh()), [router]);

  const setValue = useCallback<PropertyStore["setValue"]>(
    async (entryId, propertyId, value) => {
      const key = valueKey(entryId, propertyId);
      const empty = value === null || value === "" || value === false || (Array.isArray(value) && value.length === 0);
      setValueOverlay((o) => put(o, [[key, empty ? null : value]]));
      const r = await setEntryPropertyValue(entryId, propertyId, empty ? null : value).catch(() => networkError);
      setValueOverlay((o) => (r.error !== null ? drop(o, [key]) : settle(o, [key], r.data.value)));
      refresh();
      return r.error;
    },
    [refresh]
  );

  const createProperty = useCallback<PropertyStore["createProperty"]>(
    async (collectionId, name, type) => {
      const r = await createCollectionProperty(collectionId, name, type).catch(() => networkError);
      if (r.error === null) setPropertyOverlay((o) => settle(put(o, [[r.data.id, r.data]]), [r.data.id]));
      refresh();
      return r.error;
    },
    [refresh]
  );

  const updateProperty = useCallback<PropertyStore["updateProperty"]>(
    async (property, changes) => {
      // Name, type and list visibility show at once; new options wait for their ids.
      const shown: CollectionProperty = {
        ...property,
        ...(changes.name !== undefined && { name: changes.name.trim() }),
        ...(changes.type !== undefined && { type: changes.type }),
        ...(changes.shown_in_list !== undefined && { shown_in_list: changes.shown_in_list }),
      };
      setPropertyOverlay((o) => put(o, [[property.id, shown]]));
      const r = await updateCollectionProperty(property.id, changes).catch(() => networkError);
      setPropertyOverlay((o) => (r.error !== null ? drop(o, [property.id]) : settle(o, [property.id], r.data.property)));
      refresh();
      return r.error !== null ? { error: r.error, property: null } : { error: null, property: r.data.property };
    },
    [refresh]
  );

  const moveProperty = useCallback<PropertyStore["moveProperty"]>(
    async (property, index) => {
      const order = propertiesOf(property.collection_id).filter((p) => p.id !== property.id);
      order.splice(Math.max(0, Math.min(index, order.length)), 0, property);
      const keys = order.map((p) => p.id);
      setPropertyOverlay((o) => put(o, order.map((p, i) => [p.id, { ...p, position: i + 1 }])));
      const r = await moveCollectionProperty(property.id, index).catch(() => networkError);
      setPropertyOverlay((o) => (r.error !== null ? drop(o, keys) : settle(o, keys)));
      refresh();
      return r.error;
    },
    [refresh, propertiesOf]
  );

  const deleteProperty = useCallback<PropertyStore["deleteProperty"]>(
    async (property, expectedValues) => {
      const r = await deleteCollectionProperty(property.id, expectedValues).catch(
        (): DeleteCollectionPropertyResult => ({ status: "error", error: "Network error" })
      );
      if (r.status === "deleted") setPropertyOverlay((o) => settle(put(o, [[property.id, null]]), [property.id]));
      refresh();
      return r;
    },
    [refresh]
  );

  const store = useMemo<PropertyStore>(
    () => ({
      available: workspace.propertied,
      propertiesOf,
      values,
      setValue,
      createProperty,
      updateProperty,
      moveProperty,
      deleteProperty,
    }),
    [workspace.propertied, propertiesOf, values, setValue, createProperty, updateProperty, moveProperty, deleteProperty]
  );

  return <Context.Provider value={store}>{children}</Context.Provider>;
}
