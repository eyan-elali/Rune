"use client";

import { useMemo, useState } from "react";
import { BookOpen, LayoutList, X } from "lucide-react";
import { ICON } from "./icons";
import { arrangeItems, isFallbackView } from "@/lib/rune2/collectionViews";
import { openableId } from "@/lib/rune2/references";
import {
  manuscriptSceneOrder,
  sceneNativeProperties,
  sceneNativeValues,
  sceneNumber,
  sceneViewLabel,
  unplacedStart,
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

// The Manuscript's Scenes seen another way (migration 032) — on the
// Manuscript's own page, under its overview. The primary representation of
// the manuscript stays its structure in the navigator; these are alternate
// Views of the same Scenes, through the same View engine and bodies as a
// Collection's Entries:
//   List  — every Scene in manuscript order, its number ("31.2"), its Chapter,
//           and a quiet line of the View's properties;
//   Table — a Scene per row, its properties as columns edited in place, its
//           words and placement shown;
//   Board — columns by Status, a select, or a Relationship (POV → Nerai,
//           Alaric…); moving a card sets that value and never moves the Scene.
//   Timeline — Scenes along the manuscript itself (Group bands, Chapter
//           columns, each Scene at its actual place), or along a Date or
//           Number Scene property (042); read-mostly, never a reorder.
// A View shows Scenes by id, words from the manuscript structure, and values
// beside the prose — never the prose itself, so a large manuscript is never
// loaded to draw it. Manuscript order is placed Scenes in reading order, then
// the Unplaced ones under their own heading; it is derived, never stored.
//
// The Views' chrome is the Collection's (CollectionView): text tabs on the
// left, the active View's toolbar on the right, and "Read", which opens the
// View in Reading Mode — the same Scenes, the View's filters and order, read
// continuously from their canonical text, never copied.
//
// Progressive disclosure: a writer who has no Scene View sees one quiet line
// ("View scenes as a list, table or board"); nothing else changes, and
// nothing is saved until they change a View.

export function ManuscriptScenes() {
  const { sceneAvailable, manuscriptId } = usePropertyStore();
  const { viewsOf, activeViewOf, scenesOpen, scenePanel, openScenes, closeScenes, setScenePanel } = useViewStore();
  const { openReading } = useRune2Selection();
  const [request, setRequest] = useState<ToolRequest | undefined>(undefined);
  const ask = (tool: ToolRequest["tool"]) => setRequest((r) => ({ tool, n: (r?.n ?? 0) + 1 }));
  const [search, setSearch] = useState("");
  const views = manuscriptId ? viewsOf(manuscriptId) : [];
  const saved = views.filter((v) => !isFallbackView(v));
  const open = scenesOpen || saved.length > 0;
  const view = manuscriptId ? activeViewOf(manuscriptId) : null;
  // Arranged only while shown: a closed invitation costs nothing.
  const { properties, sceneIds, arranged, presenter } = useSceneItems(open ? view : null);

  if (!sceneAvailable || !manuscriptId || !view) return null;

  if (!open) {
    return (
      <div className="r2-scenes-invite">
        <button type="button" className="r2-tool" onClick={() => openScenes()}>
          <LayoutList {...ICON} aria-hidden />
          View scenes as a list, table or board
        </button>
      </div>
    );
  }

  const found = quickFind(arranged, search, presenter);
  const hiddenCount = sceneIds.length - found.length;
  const schemaOpen = scenePanel === "properties";
  
  return (
    <div className="r2-writing r2-scenes-wrap">
      <section
        className="r2-doc r2-page r2-collection r2-scenes"
        data-wide={view.type !== "list" || undefined}
        data-view={view.type}
        aria-label="Scenes"
      >
        <header className="r2-scenes-head">
          <h2 className="r2-scenes-title">Scenes</h2>
          {saved.length === 0 && (
            <button type="button" className="r2-icon-button" aria-label="Hide scene views" title="Hide" onClick={closeScenes}>
              <X {...ICON} aria-hidden />
            </button>
          )}
        </header>

        <div className="r2-collection-bar" data-tabs="">
          <ViewSwitcher ownerId={manuscriptId} views={views} active={view} onEdit={() => ask("settings")}>
            <AddViewMenu ownerId={manuscriptId} properties={properties} compact />
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
                onClick={() => openReading({ kind: "view", viewId: view.id })}
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
            <TableView ownerTitle="the manuscript" view={view} properties={properties} entryIds={found} total={sceneIds.length} presenter={presenter} />
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
            <ListView ownerTitle="the manuscript" view={view} properties={properties} entryIds={found} total={sceneIds.length} presenter={presenter} />
          )}
        </div>
      </section>
    </div>
  );
}

/**
 * The Manuscript's Scenes as a Scene View shows them: the Scene properties
 * and read-only fields, every Scene in manuscript order arranged by the View,
 * and how the bodies name ("31.2") and open them (a Chapter's only Scene as
 * its Chapter). The Manuscript's page and a View embedded in a Page read
 * exactly this. `view` null: nothing arranged.
 */
export function useSceneItems(view: SavedView | null) {
  const { index, manuscript } = useRune2Selection();
  const { manuscriptId, propertiesOf, values } = usePropertyStore();
  const laneTargets = useLaneTargets();
  const projectId = manuscript.project.id;

  const order = useMemo(() => manuscriptSceneOrder(index), [index]);
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
