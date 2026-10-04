"use client";

import { createContext, useCallback, useContext, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { addObjectReference, removeObjectReference, setEntryRelationship } from "@/lib/actions/workspaceReferences";
import { setSceneRelationship } from "@/lib/actions/sceneProperties";
import type { ProjectWorkspace } from "@/lib/rune2/projectWorkspace";
import {
  backlinksOf as deriveBacklinks,
  genericListKey,
  inlineListKey,
  listKey,
  pendingMentions,
  referenceTypeOf,
  relatedOf as orderedRelatedOf,
  relationListKey,
  relationshipValues,
  toReference,
  type Backlink,
  type ObjectRef,
  type Reference,
} from "@/lib/rune2/references";
import { sameTargets, type InlineTarget } from "@/lib/rune2/workspaceDocument";
import type { ReferenceObjectType } from "@/lib/types";
import { drop, networkError, put, settle, withoutSettled, type Overlay } from "./PropertyStore";
import { useRune2Selection } from "./Rune2Selection";

// The shell's view of references between objects (migration 028): each
// Entry's Relationship values and each object's generic links, and — derived
// from exactly those rows — every object's backlinks. As with properties and
// Views, the server read is the truth, a change shows at once through an
// overlay, is written by its action, and the workspace is re-read; a refused
// write drops its overlay at once.
//
// A change always replaces one whole list — one Entry's or Scene's value for
// one Relationship (a Scene's, 032), or one object's generic links — so the overlay is keyed by
// list, and every derived view (values, links, backlinks) reads the same
// effective rows. Nothing here reads or writes any object's content: a Scene
// linked here keeps its prose, version and words exactly as they were.
//
// Mentions (inline references in a Page's or Entry's text, 035) are never
// written from here: the database derives them from the document on every
// save. The editor only tells the store what its text mentions now
// (showMentions), so backlinks follow the writing at once — offline too —
// and, once that text is saved (mentionsSaved), the workspace is re-read and
// the server's derived rows take over.

type ReferenceStore = {
  /** Whether references exist on this database (migration 028 applied). */
  available: boolean;
  /** Every Relationship value by valueKey(sourceId, propertyId): target ids in order. */
  relationValues: ReadonlyMap<string, string[]>;
  /** Sets one Entry's or Scene's whole Relationship value. Resolves to an error message, or null. */
  setRelationship: (sourceId: string, propertyId: string, targetIds: string[]) => Promise<string | null>;
  /** An object's generic links, in order. */
  relatedOf: (sourceId: string) => Reference[];
  /**
   * Where an object is referenced from — Relationship values, links and
   * mentions alike. Several ids: one object as the writer sees it (a Chapter
   * and its only Scene).
   */
  backlinksOf: (targetIds: string | readonly string[]) => Backlink[];
  /** What a document's text mentions now, shown ahead of its save. */
  showMentions: (source: ObjectRef, targets: InlineTarget[]) => void;
  /**
   * A document's text — with mentions changed since it was last saved — was
   * saved: the workspace is re-read, and its mentions are the server's.
   */
  mentionsSaved: (sourceId: string) => void;
  addReference: (source: ObjectRef, target: ObjectRef) => Promise<string | null>;
  removeReference: (reference: Reference) => Promise<string | null>;
};

const Context = createContext<ReferenceStore | null>(null);

export function useReferenceStore(): ReferenceStore {
  const store = useContext(Context);
  if (!store) throw new Error("useReferenceStore outside ReferenceStoreProvider");
  return store;
}

/** A reference shown ahead of the server's id. */
const PENDING = "pending:";
export function isPendingReference(reference: Reference): boolean {
  return reference.id.startsWith(PENDING);
}

export function ReferenceStoreProvider({ workspace, children }: { workspace: ProjectWorkspace; children: ReactNode }) {
  const router = useRouter();
  const { index } = useRune2Selection();
  const [, startRefresh] = useTransition();
  const [overlay, setOverlay] = useState<Overlay<Reference[]>>(() => new Map());

  // A fresh read supersedes every overlay whose write has settled.
  const [read, setRead] = useState(workspace);
  if (read !== workspace) {
    setRead(workspace);
    setOverlay(withoutSettled);
  }

  /** The server's rows with every overlaid list replaced by its overlay. */
  const references = useMemo(() => {
    if (overlay.size === 0) return workspace.references;
    const kept = workspace.references.filter((r) => !overlay.has(listKey(r)));
    for (const { value } of overlay.values()) if (value) kept.push(...value);
    return kept;
  }, [workspace.references, overlay]);

  const relationValues = useMemo(() => relationshipValues(references), [references]);
  const relatedOf = useCallback((sourceId: string) => orderedRelatedOf(references, sourceId), [references]);
  const backlinksOf = useCallback(
    (targetIds: string | readonly string[]) => deriveBacklinks(references, targetIds, (id) => index.get(id)?.title ?? ""),
    [references, index]
  );

  const refresh = useCallback(() => startRefresh(() => router.refresh()), [router]);

  const typeOf = useCallback(
    (id: string): ReferenceObjectType | null => {
      const entry = index.get(id);
      return entry ? referenceTypeOf(entry) : null;
    },
    [index]
  );

  const setRelationship = useCallback<ReferenceStore["setRelationship"]>(
    async (sourceId, propertyId, targetIds) => {
      const key = relationListKey(sourceId, propertyId);
      const source: ObjectRef = { type: typeOf(sourceId) === "scene" ? "scene" : "entry", id: sourceId };
      const shown = (ids: string[]): Reference[] =>
        ids.flatMap((id, at) => {
          const type = typeOf(id);
          return type
            ? [{ id: `${PENDING}${key}:${id}`, source, target: { type, id }, origin: "link" as const, propertyId, position: at + 1 }]
            : [];
        });
      setOverlay((o) => put(o, [[key, shown(targetIds)]]));
      const write = source.type === "scene" ? setSceneRelationship : setEntryRelationship;
      const r = await write(sourceId, propertyId, targetIds).catch(() => networkError);
      setOverlay((o) => (r.error !== null ? drop(o, [key]) : settle(o, [key], shown(r.data.targets))));
      refresh();
      return r.error;
    },
    [refresh, typeOf]
  );

  const addReference = useCallback<ReferenceStore["addReference"]>(
    async (source, target) => {
      const key = genericListKey(source.id);
      const current = orderedRelatedOf(references, source.id);
      if (current.some((r) => r.target.id === target.id)) return null;
      const pending: Reference = {
        id: `${PENDING}${key}:${target.id}`,
        source,
        target,
        origin: "link",
        propertyId: null,
        position: (current[current.length - 1]?.position ?? 0) + 1,
      };
      setOverlay((o) => put(o, [[key, [...current, pending]]]));
      const r = await addObjectReference(source.type, source.id, target.type, target.id).catch(() => networkError);
      setOverlay((o) => {
        if (r.error !== null) return drop(o, [key]);
        const saved = toReference(r.data);
        const list = (o.get(key)?.value ?? []).map((x) => (x.id === pending.id ? saved : x));
        return settle(o, [key], list);
      });
      refresh();
      return r.error;
    },
    [refresh, references]
  );

  const removeReference = useCallback<ReferenceStore["removeReference"]>(
    async (reference) => {
      if (isPendingReference(reference) || reference.propertyId !== null) return null;
      const key = genericListKey(reference.source.id);
      const rest = orderedRelatedOf(references, reference.source.id).filter((r) => r.id !== reference.id);
      setOverlay((o) => put(o, [[key, rest]]));
      const r = await removeObjectReference(reference.id).catch(() => networkError);
      setOverlay((o) => (r.error !== null ? drop(o, [key]) : settle(o, [key])));
      refresh();
      return r.error;
    },
    [refresh, references]
  );

  // Only the text changes a document's mentions: shown from it at once, and
  // replaced by the server's derived rows on the first read after its save.
  const showMentions = useCallback<ReferenceStore["showMentions"]>(
    (source, targets) => {
      const key = inlineListKey(source.id);
      setOverlay((o) => {
        const shown = o.get(key);
        const current = shown ? (shown.value ?? []) : references.filter((r) => listKey(r) === key);
        if (sameTargets(current.map((r) => r.target), targets)) return o;
        return put(o, [[key, pendingMentions(source, targets, PENDING)]]);
      });
    },
    [references]
  );

  const mentionsSaved = useCallback<ReferenceStore["mentionsSaved"]>(
    (sourceId) => {
      setOverlay((o) => settle(o, [inlineListKey(sourceId)]));
      refresh();
    },
    [refresh]
  );

  const store = useMemo<ReferenceStore>(
    () => ({
      available: workspace.referable,
      relationValues,
      setRelationship,
      relatedOf,
      backlinksOf,
      showMentions,
      mentionsSaved,
      addReference,
      removeReference,
    }),
    [
      workspace.referable,
      relationValues,
      setRelationship,
      relatedOf,
      backlinksOf,
      showMentions,
      mentionsSaved,
      addReference,
      removeReference,
    ]
  );

  return <Context.Provider value={store}>{children}</Context.Provider>;
}
