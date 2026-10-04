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
import {
  createRelationshipProperty,
  updateRelationshipProperty,
  type RelationshipPropertyChanges,
} from "@/lib/actions/workspaceReferences";
import {
  createSceneProperty,
  createSceneRelationshipProperty,
  deleteSceneProperty,
  moveSceneProperty,
  setScenePropertyValue,
  updateSceneProperty,
} from "@/lib/actions/sceneProperties";
import {
  indexValues,
  isSceneProperty,
  ownerOf,
  propertiesOf as orderedPropertiesOf,
  valueKey,
} from "@/lib/rune2/collectionProperties";
import type { ProjectWorkspace } from "@/lib/rune2/projectWorkspace";
import type { CollectionPropertyType, PropertyDefinition, PropertyValue, ReferenceObjectType } from "@/lib/types";
import { useReferenceStore } from "./ReferenceStore";
import { useRune2Selection } from "./Rune2Selection";

// The shell's view of Collection properties and Entry values (migration 026),
// shared by the Collection's list and its Entries. The server read
// (loadProjectWorkspace) is the truth; a change shows at once through an
// overlay, is written by its action, and the workspace is re-read. An overlay
// is dropped by the first read after its write settled; a refused write drops
// its overlay at once, so the screen never keeps a value the server refused.
// Property values are small metadata saved per change — not the Entry body,
// which has its own save engine and device copy.
//
// A Relationship's value (028) is its targets' ids, kept by the reference
// store (it is a set of references, not a stored value): `values` shows it
// under the same key as any other value, and `setValue` hands it there, so a
// View, a filter or an editor never needs to know the difference.
//
// Scene properties (032) live here too, under their owner — the Manuscript
// (workspace.manuscriptId) — beside each Collection's: the same overlay, the
// same editors, the same value map (keyed by Scene id). Every call dispatches
// on the property's owner to its own action. A Scene value is written to
// scene_property_values or object_references only — never the Scene's row —
// so it never touches the prose, its save engine or its device copy.

type Layer<T> = { value: T | null; settled: boolean };
/** Changes shown ahead of the server read, by key; null = removed. Shared with ViewStore. */
export type Overlay<T> = ReadonlyMap<string, Layer<T>>;

type PropertyStore = {
  /** Whether Collection properties exist on this database (migration 026 applied). */
  available: boolean;
  /** Whether Scene properties exist on this database (migration 032 applied). */
  sceneAvailable: boolean;
  /** The Manuscript: the owner of Scene properties (null before 032 or when unreadable). */
  manuscriptId: string | null;
  /** A Collection's properties — or, given the Manuscript's id, its Scene properties — in order. */
  propertiesOf: (ownerId: string) => PropertyDefinition[];
  /** Any property by id (a Collection's or the Manuscript's). */
  propertyById: (propertyId: string) => PropertyDefinition | undefined;
  /** Every value by valueKey(itemId, propertyId) — Entries' and Scenes' alike. */
  values: ReadonlyMap<string, PropertyValue>;
  /** Sets an Entry's or a Scene's value. Resolves to an error message, or null once saved. */
  setValue: (itemId: string, propertyId: string, value: PropertyValue | null) => Promise<string | null>;
  createProperty: (ownerId: string, name: string, type: CollectionPropertyType) => Promise<string | null>;
  /** Whether Relationship properties can be made (migration 028 applied). */
  relatable: boolean;
  createRelationship: (
    ownerId: string,
    name: string,
    target: ReferenceObjectType,
    targetCollectionId: string | null,
    many: boolean
  ) => Promise<string | null>;
  updateRelationship: (property: PropertyDefinition, changes: RelationshipPropertyChanges) => Promise<string | null>;
  /** Resolves to the property as saved, or an error. */
  updateProperty: (
    property: PropertyDefinition,
    changes: CollectionPropertyChanges
  ) => Promise<{ error: string; property: null } | { error: null; property: PropertyDefinition }>;
  moveProperty: (property: PropertyDefinition, index: number) => Promise<string | null>;
  deleteProperty: (property: PropertyDefinition, expectedValues: number) => Promise<DeleteCollectionPropertyResult>;
};

const Context = createContext<PropertyStore | null>(null);

export function usePropertyStore(): PropertyStore {
  const store = useContext(Context);
  if (!store) throw new Error("usePropertyStore outside PropertyStoreProvider");
  return store;
}

export function applyOverlay<T>(base: Map<string, T>, overlay: Overlay<T>): Map<string, T> {
  if (overlay.size === 0) return base;
  const next = new Map(base);
  for (const [k, { value }] of overlay) {
    if (value === null) next.delete(k);
    else next.set(k, value);
  }
  return next;
}

/** Overlay edits: show `value` for each key now (settled: false). */
export function put<T>(overlay: Overlay<T>, entries: [string, T | null][]): Overlay<T> {
  const next = new Map(overlay);
  for (const [k, value] of entries) next.set(k, { value, settled: false });
  return next;
}
/** The write for these keys is done: show `value` (if given) until the next read. */
export function settle<T>(overlay: Overlay<T>, keys: string[], value?: T | null): Overlay<T> {
  const next = new Map(overlay);
  for (const k of keys) {
    const layer = next.get(k);
    if (layer) next.set(k, { value: value === undefined ? layer.value : value, settled: true });
  }
  return next;
}
export function drop<T>(overlay: Overlay<T>, keys: string[]): Overlay<T> {
  const next = new Map(overlay);
  keys.forEach((k) => next.delete(k));
  return next;
}
export function withoutSettled<T>(overlay: Overlay<T>): Overlay<T> {
  return new Map([...overlay].filter(([, l]) => !l.settled));
}

export const networkError = { data: null, error: "Network error" } as const;

export function PropertyStoreProvider({ workspace, children }: { workspace: ProjectWorkspace; children: ReactNode }) {
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const references = useReferenceStore();
  const { manuscript } = useRune2Selection();
  const projectId = manuscript.project.id;
  const manuscriptId = workspace.scenePropertied ? workspace.manuscriptId : null;
  const [propertyOverlay, setPropertyOverlay] = useState<Overlay<PropertyDefinition>>(() => new Map());
  const [valueOverlay, setValueOverlay] = useState<Overlay<PropertyValue>>(() => new Map());

  // A fresh read supersedes every overlay whose write has settled.
  const [read, setRead] = useState(workspace);
  if (read !== workspace) {
    setRead(workspace);
    setPropertyOverlay(withoutSettled);
    setValueOverlay(withoutSettled);
  }

  const properties = useMemo(
    () =>
      applyOverlay(
        new Map<string, PropertyDefinition>([...workspace.properties, ...workspace.sceneProperties].map((p) => [p.id, p])),
        propertyOverlay
      ),
    [workspace.properties, workspace.sceneProperties, propertyOverlay]
  );
  const values = useMemo(() => {
    const stored = applyOverlay(indexValues(workspace.values, workspace.sceneValues), valueOverlay);
    if (references.relationValues.size === 0) return stored;
    const all = new Map<string, PropertyValue>(stored);
    for (const [k, ids] of references.relationValues) if (ids.length) all.set(k, ids);
    return all;
  }, [workspace.values, workspace.sceneValues, valueOverlay, references.relationValues]);

  const propertiesOf = useCallback(
    (ownerId: string) => orderedPropertiesOf([...properties.values()], ownerId),
    [properties]
  );
  const propertyById = useCallback((propertyId: string) => properties.get(propertyId), [properties]);
  const isManuscript = useCallback((ownerId: string) => manuscriptId !== null && ownerId === manuscriptId, [manuscriptId]);

  const refresh = useCallback(() => startRefresh(() => router.refresh()), [router]);

  const { setRelationship } = references;
  const setValue = useCallback<PropertyStore["setValue"]>(
    async (itemId, propertyId, value) => {
      const property = properties.get(propertyId);
      if (property?.type === "relationship") {
        const ids = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
        return setRelationship(itemId, propertyId, ids);
      }
      const key = valueKey(itemId, propertyId);
      const empty = value === null || value === "" || value === false || (Array.isArray(value) && value.length === 0);
      setValueOverlay((o) => put(o, [[key, empty ? null : value]]));
      const write = property && isSceneProperty(property) ? setScenePropertyValue : setEntryPropertyValue;
      const r = await write(itemId, propertyId, empty ? null : value).catch(() => networkError);
      setValueOverlay((o) => (r.error !== null ? drop(o, [key]) : settle(o, [key], r.data.value)));
      refresh();
      return r.error;
    },
    [refresh, properties, setRelationship]
  );

  const createProperty = useCallback<PropertyStore["createProperty"]>(
    async (ownerId, name, type) => {
      const r = await (isManuscript(ownerId)
        ? createSceneProperty(projectId, name, type)
        : createCollectionProperty(ownerId, name, type)
      ).catch(() => networkError);
      if (r.error === null) setPropertyOverlay((o) => settle(put(o, [[r.data.id, r.data]]), [r.data.id]));
      refresh();
      return r.error;
    },
    [refresh, isManuscript, projectId]
  );

  const createRelationship = useCallback<PropertyStore["createRelationship"]>(
    async (ownerId, name, target, targetCollectionId, many) => {
      const r = await (isManuscript(ownerId)
        ? createSceneRelationshipProperty(projectId, name, target, targetCollectionId, many)
        : createRelationshipProperty(ownerId, name, target, targetCollectionId, many)
      ).catch(() => networkError);
      if (r.error === null) setPropertyOverlay((o) => settle(put(o, [[r.data.id, r.data]]), [r.data.id]));
      refresh();
      return r.error;
    },
    [refresh, isManuscript, projectId]
  );

  const updateRelationship = useCallback<PropertyStore["updateRelationship"]>(
    async (property, changes) => {
      setPropertyOverlay((o) =>
        put(o, [[property.id, { ...property, ...(changes.many !== undefined && { relation_many: changes.many }) }]])
      );
      const r = isSceneProperty(property)
        ? await updateSceneProperty(property.id, changes)
            .then((x) => (x.error !== null ? x : { data: x.data.property, error: null }))
            .catch(() => networkError)
        : await updateRelationshipProperty(property.id, changes).catch(() => networkError);
      setPropertyOverlay((o) => (r.error !== null ? drop(o, [property.id]) : settle(o, [property.id], r.data)));
      refresh();
      return r.error;
    },
    [refresh]
  );

  const updateProperty = useCallback<PropertyStore["updateProperty"]>(
    async (property, changes) => {
      // Name, type and list visibility show at once; new options wait for their ids.
      const shown: PropertyDefinition = {
        ...property,
        ...(changes.name !== undefined && { name: changes.name.trim() }),
        ...(changes.type !== undefined && { type: changes.type }),
        ...(changes.shown_in_list !== undefined && !isSceneProperty(property) && { shown_in_list: changes.shown_in_list }),
      };
      setPropertyOverlay((o) => put(o, [[property.id, shown]]));
      // A Scene property has no list visibility (that belongs to its Views).
      const sceneChanges = Object.fromEntries(Object.entries(changes).filter(([k]) => k !== "shown_in_list"));
      const r = await (isSceneProperty(property)
        ? updateSceneProperty(property.id, sceneChanges)
        : updateCollectionProperty(property.id, changes)
      ).catch(() => networkError);
      setPropertyOverlay((o) => (r.error !== null ? drop(o, [property.id]) : settle(o, [property.id], r.data.property)));
      refresh();
      return r.error !== null ? { error: r.error, property: null } : { error: null, property: r.data.property };
    },
    [refresh]
  );

  const moveProperty = useCallback<PropertyStore["moveProperty"]>(
    async (property, index) => {
      const order = propertiesOf(ownerOf(property)).filter((p) => p.id !== property.id);
      order.splice(Math.max(0, Math.min(index, order.length)), 0, property);
      const keys = order.map((p) => p.id);
      setPropertyOverlay((o) => put(o, order.map((p, i) => [p.id, { ...p, position: i + 1 }])));
      const r = await (isSceneProperty(property)
        ? moveSceneProperty(property.id, index)
        : moveCollectionProperty(property.id, index)
      ).catch(() => networkError);
      setPropertyOverlay((o) => (r.error !== null ? drop(o, keys) : settle(o, keys)));
      refresh();
      return r.error;
    },
    [refresh, propertiesOf]
  );

  const deleteProperty = useCallback<PropertyStore["deleteProperty"]>(
    async (property, expectedValues) => {
      const r = await (isSceneProperty(property)
        ? deleteSceneProperty(property.id, expectedValues)
        : deleteCollectionProperty(property.id, expectedValues)
      ).catch((): DeleteCollectionPropertyResult => ({ status: "error", error: "Network error" }));
      if (r.status === "deleted") setPropertyOverlay((o) => settle(put(o, [[property.id, null]]), [property.id]));
      refresh();
      return r;
    },
    [refresh]
  );

  const store = useMemo<PropertyStore>(
    () => ({
      available: workspace.propertied,
      sceneAvailable: manuscriptId !== null,
      manuscriptId,
      propertiesOf,
      propertyById,
      values,
      setValue,
      createProperty,
      relatable: references.available,
      createRelationship,
      updateRelationship,
      updateProperty,
      moveProperty,
      deleteProperty,
    }),
    [
      workspace.propertied,
      manuscriptId,
      propertiesOf,
      propertyById,
      values,
      setValue,
      createProperty,
      references.available,
      createRelationship,
      updateRelationship,
      updateProperty,
      moveProperty,
      deleteProperty,
    ]
  );

  return <Context.Provider value={store}>{children}</Context.Provider>;
}
