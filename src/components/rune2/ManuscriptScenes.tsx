"use client";

import { useMemo, useState } from "react";
import { BookOpen } from "lucide-react";
import { ICON } from "./icons";
import { arrangeItems } from "@/lib/rune2/collectionViews";
import { openableId } from "@/lib/rune2/references";
import {
  MANUSCRIPT_SCOPE,
  sceneNativeProperties,
  sceneNativeValues,
  sceneNumber,
  sceneViewLabel,
  scopedSceneOrder,
  unplacedStart,
  type SceneScope,
} from "@/lib/rune2/sceneViews";
import type { PropertyValue, SavedView } from "@/lib/types";
import { CollectionSchema } from "./CollectionSchema";
import { useLaneTargets } from "./CollectionView";
import { BoardView, ListView, TableView, quickFind, type ItemPresenter } from "./CollectionViewBodies";
import { TimelineView } from "./TimelineView";
import { usePropertyStore } from "./PropertyStore";
import { useRune2Selection } from "./Rune2Selection";
import { AddViewMenu, ViewSwitcher, ViewToolbar, type ToolRequest } from "./ViewControls";
import { useViewStore } from "./ViewStore";

// The manuscript's Scenes seen another way (migration 032): a structured
// surface over the canonical Scenes — never a copy of them — under the
// Manuscript's overview and under each Group's (Milestone 21E.2). The
// primary representation of the manuscript stays its structure in the
// navigator; these are alternate Views of the same Scenes, through the same
// View engine and bodies as a Collection's Entries:
//   List  — every Scene in manuscript order, its number ("31.2"), its Chapter,
//           and a quiet line of the View's properties;
//   Table — a Scene per row, its properties as columns edited in place, its
//           words and placement shown;
//   Board — columns by Status, a select, or a Relationship (POV → Nerai,
//           Alaric…); moving a card sets that value and never moves the Scene.
//   Timeline — Scenes along the manuscript itself (Group bands, Chapter
//           columns, each Scene at its actual place), or along a Date or
//           Number Scene property (042); read-mostly, never a reorder.
//
// SCOPE. Where the surface stands decides which Scenes it may show
// (scopedSceneOrder): the Manuscript's page — every placed Scene in reading
// order, then the Unplaced ones under their own heading; a Group's page —
// only the Scenes in Chapters inside that Group, at any depth, in manuscript
// order, and never an Unplaced Scene. The scope is structural, not a filter:
// it is not in any View's config, the writer cannot remove it, and a View's
// own filters, sort, grouping and search work within it. It is worked out
// from the index on every render, so a Chapter moved between Parts, a Scene
// moved between Chapters, or one in Trash and back, is simply in or out.
//
// One set of saved Views serves every scope (ViewStore): the tabs here are
// the Manuscript's Scene Views, and a View added from a Group's page is the
// Manuscript's too; which View each page is showing is its own, and a Group
// opens in its first List. A View shows Scenes by id, words from the
// manuscript structure, and values beside the prose — never the prose itself,
// so a large manuscript is never loaded to draw it.
//
// The chrome is the Collection's (CollectionView): text tabs on the left, the
// active View's toolbar on the right, and "Read", which opens the View in
// Reading Mode — the same Scenes, in this scope, the View's filters and order,
// read continuously from their canonical text, never copied.

export function ManuscriptScenes({ scope }: { scope: SceneScope }) {
  const { sceneAvailable, manuscriptId } = usePropertyStore();
  const { viewsOf, activeViewOf, scenePanel, setScenePanel } = useViewStore();
  const { openReading, index } = useRune2Selection();
  const [request, setRequest] = useState<ToolRequest | undefined>(undefined);
  const ask = (tool: ToolRequest["tool"]) => setRequest((r) => ({ tool, n: (r?.n ?? 0) + 1 }));
  const [search, setSearch] = useState("");
  // The page whose View choice this is: the Manuscript, or the Group.
  const ownerId = scope.kind === "group" ? scope.groupId : manuscriptId;
  const views = ownerId ? viewsOf(ownerId) : [];
  const view = ownerId ? activeViewOf(ownerId) : null;
  const { properties, sceneIds, arranged, presenter } = useSceneItems(view, scope);

  if (!sceneAvailable || !manuscriptId || !ownerId || !view) return null;

  const found = quickFind(arranged, search, presenter);
  const hiddenCount = sceneIds.length - found.length;
  // The property settings open with the Views on the Manuscript's page only;
  // a Group's page keeps to its Scenes.
  const schemaOpen = scope.kind === "manuscript" && scenePanel === "properties";
  const ownerTitle = scope.kind === "group" ? (index.get(scope.groupId)?.title ?? "this group") : "the manuscript";
  const groupId = scope.kind === "group" ? scope.groupId : undefined;

  return (
    <div className="r2-writing r2-scenes-wrap">
      <section className="r2-doc r2-page r2-collection r2-broad r2-scenes" data-view={view.type} aria-label="Scenes">
        <header className="r2-scenes-head">
          <h2 className="r2-scenes-title">Scenes</h2>
        </header>

        <div className="r2-collection-bar" data-tabs="">
          <ViewSwitcher ownerId={ownerId} views={views} active={view} onEdit={() => ask("settings")}>
            <AddViewMenu ownerId={ownerId} properties={properties} compact />
          </ViewSwitcher>
          <ViewToolbar
            key={view.id}
            view={view}
            views={views}
            properties={properties}
            naturalOrder="Manuscript order"
            itemNoun="scene"
            search={search}
            onSearch={setSearch}
            schemaOpen={schemaOpen}
            onToggleSchema={() => setScenePanel((current) => (current === "properties" ? null : "properties"))}
            schemaLabel="Edit scene properties"
            request={request}
          >
            {found.length > 0 && (
              <button
                type="button"
                className="r2-tool"
                onClick={() => openReading({ kind: "view", viewId: view.id, ...(groupId && { groupId }) })}
                title="Read these scenes one after another, read-only"
              >
                <BookOpen {...ICON} aria-hidden />
                <span className="r2-tool-label">Read</span>
              </button>
            )}
          </ViewToolbar>
        </div>
        {schemaOpen && <CollectionSchema ownerId={manuscriptId} ownerTitle="Scenes" />}

        <div key={view.id} className="r2-collection-body r2-view-enter">
          {hiddenCount > 0 && (
            <p className="r2-view-note">
              Showing {found.length.toLocaleString()} of {sceneIds.length.toLocaleString()} scenes
            </p>
          )}
          {view.type === "table" ? (
            <TableView ownerTitle={ownerTitle} view={view} properties={properties} entryIds={found} total={sceneIds.length} presenter={presenter} />
          ) : view.type === "board" ? (
            <BoardView
              ownerId={manuscriptId}
              view={view}
              properties={properties}
              entryIds={found}
              total={sceneIds.length}
              presenter={presenter}
              onChooseGrouping={() => ask("group")}
            />
          ) : view.type === "timeline" ? (
            <TimelineView
              ownerId={manuscriptId}
              view={view}
              properties={properties}
              entryIds={found}
              total={sceneIds.length}
              presenter={presenter}
              manuscript
              onChooseAxis={() => ask("axis")}
            />
          ) : (
            <ListView ownerTitle={ownerTitle} view={view} properties={properties} entryIds={found} total={sceneIds.length} presenter={presenter} />
          )}
        </div>
      </section>
    </div>
  );
}

/**
 * The Scenes of one scope as a Scene View shows them: the Scene properties
 * and read-only fields, the scope's Scenes in manuscript order arranged by
 * the View, and how the bodies name ("31.2") and open them (a Chapter's only
 * Scene as its Chapter). The Manuscript's page, a Group's page, a View
 * embedded in a Page and Reading Mode all read exactly this. `view` null:
 * nothing arranged. `scope` defaults to the Manuscript's.
 */
export function useSceneItems(view: SavedView | null, scope: SceneScope = MANUSCRIPT_SCOPE) {
  const { index, manuscript } = useRune2Selection();
  const { manuscriptId, propertiesOf, values } = usePropertyStore();
  const laneTargets = useLaneTargets();
  const projectId = manuscript.project.id;
  const groupId = scope.kind === "group" ? scope.groupId : null;

  const order = useMemo(
    () => scopedSceneOrder(index, groupId ? { kind: "group", groupId } : MANUSCRIPT_SCOPE),
    [index, groupId]
  );
  const sceneIds = useMemo(() => [...order.placed, ...order.unplaced], [order]);
  const nativeValues = useMemo(() => sceneNativeValues(index, sceneIds), [index, sceneIds]);
  const allValues = useMemo(() => {
    const merged = new Map<string, PropertyValue>(values);
    for (const [k, v] of nativeValues) merged.set(k, v);
    return merged;
  }, [values, nativeValues]);

  const properties = manuscriptId
    ? [...propertiesOf(manuscriptId), ...sceneNativeProperties(manuscriptId, projectId)]
    : [];
  const arranged = view
    ? arrangeItems(view, {
        entryIds: sceneIds,
        properties,
        values: allValues,
        titleOf: (id) => sceneViewLabel(index, id)?.title ?? "",
      })
    : [];
  const presenter: ItemPresenter = {
    noun: "Scenes",
    titleHeader: "Scene",
    label: (id) => {
      const label = sceneViewLabel(index, id);
      return label && { ...label, number: sceneNumber(index, id) };
    },
    openId: (id) => openableId(index, id),
    values: allValues,
    laneTargets,
    sectionStart: view ? unplacedStart(index, arranged, view.config.sort !== null) : -1,
    sectionTitle: "Unplaced Scenes",
  };
  return { properties, sceneIds, arranged, presenter };
}
