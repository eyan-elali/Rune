"use client";

import { useMemo } from "react";
import { LayoutList, Rows3, SlidersHorizontal, X } from "lucide-react";
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
import type { PropertyValue } from "@/lib/types";
import { CollectionSchema } from "./CollectionSchema";
import { useLaneTargets } from "./CollectionView";
import { BoardView, ListView, TableView, type ItemPresenter } from "./CollectionViewBodies";
import { usePropertyStore } from "./PropertyStore";
import { useRune2Selection } from "./Rune2Selection";
import { AddViewMenu, ViewOptions, ViewSwitcher, viewSummary } from "./ViewControls";
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
// A View shows Scenes by id, words from the manuscript structure, and values
// beside the prose — never the prose itself, so a large manuscript is never
// loaded to draw it. Manuscript order is placed Scenes in reading order, then
// the Unplaced ones under their own heading; it is derived, never stored.
//
// Progressive disclosure: a writer who has no Scene View sees one quiet line
// ("View scenes as a list, table or board"); nothing else changes, and
// nothing is saved until they change a View.

export function ManuscriptScenes() {
  const { index, manuscript } = useRune2Selection();
  const { sceneAvailable, manuscriptId, propertiesOf, values } = usePropertyStore();
  const { viewsOf, activeViewOf, scenesOpen, scenePanel, openScenes, closeScenes, setScenePanel } = useViewStore();
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

  if (!sceneAvailable || !manuscriptId) return null;

  const views = viewsOf(manuscriptId);
  const saved = views.filter((v) => !isFallbackView(v));
  const open = scenesOpen || saved.length > 0;

  if (!open) {
    return (
      <div className="r2-scenes-invite">
        <button type="button" className="r2-collection-tool" onClick={() => openScenes()}>
          <LayoutList size={13} strokeWidth={1.75} aria-hidden />
          View scenes as a list, table or board
        </button>
      </div>
    );
  }

  const properties = [...propertiesOf(manuscriptId), ...sceneNativeProperties(manuscriptId, projectId)];
  const ownProperties = properties.filter((p) => !("native" in p && p.native));
  const view = activeViewOf(manuscriptId);
  const arranged = arrangeItems(view, {
    entryIds: sceneIds,
    properties,
    values: allValues,
    titleOf: (id) => sceneViewLabel(index, id)?.title ?? "",
  });
  const hiddenCount = sceneIds.length - arranged.length;
  const summary = viewSummary(view, properties);
  const toggle = (p: "view" | "properties") => setScenePanel((current) => (current === p ? null : p));

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
    sectionStart: unplacedStart(index, arranged, view.config.sort !== null),
    sectionTitle: "Unplaced Scenes",
  };

  return (
    <div className="r2-writing r2-scenes-wrap">
      <section
        className="r2-doc r2-page r2-collection r2-scenes"
        data-wide={view.type !== "list" || undefined}
        aria-label="Scenes"
      >
        <header className="r2-scenes-head">
          <h2 className="r2-scenes-title">Scenes</h2>
          {saved.length === 0 && (
            <button type="button" className="r2-icon-button" aria-label="Hide scene views" title="Hide" onClick={closeScenes}>
              <X size={14} strokeWidth={1.75} aria-hidden />
            </button>
          )}
        </header>

        <div className="r2-collection-bar" data-tabs={views.length > 1 || undefined}>
          {views.length > 1 && (
            <ViewSwitcher ownerId={manuscriptId} views={views} active={view} onEdit={() => setScenePanel("view")}>
              <AddViewMenu ownerId={manuscriptId} properties={properties} compact />
            </ViewSwitcher>
          )}
          <div className="r2-collection-tools">
            {views.length === 1 && <AddViewMenu ownerId={manuscriptId} properties={properties} compact={false} />}
            <button
              type="button"
              className="r2-collection-tool"
              aria-expanded={scenePanel === "view"}
              onClick={() => toggle("view")}
              title="Shown properties, sort and filters for this view"
            >
              <SlidersHorizontal size={13} strokeWidth={1.75} aria-hidden />
              {summary ? `View · ${summary}` : "View"}
            </button>
            <button
              type="button"
              className="r2-collection-tool"
              aria-expanded={scenePanel === "properties"}
              onClick={() => toggle("properties")}
            >
              <Rows3 size={13} strokeWidth={1.75} aria-hidden />
              {ownProperties.length === 0
                ? "Scene properties"
                : `${ownProperties.length} scene ${ownProperties.length === 1 ? "property" : "properties"}`}
            </button>
          </div>
        </div>
        {scenePanel === "properties" && <CollectionSchema ownerId={manuscriptId} ownerTitle="Scenes" />}
        {scenePanel === "view" && (
          <ViewOptions
            key={view.id}
            view={view}
            views={views}
            properties={properties}
            naturalOrder="Manuscript order"
            itemNoun="scene"
            onDeleted={() => setScenePanel(null)}
          />
        )}

        <div className="r2-collection-body">
          {hiddenCount > 0 && (
            <p className="r2-view-note">
              Showing {arranged.length.toLocaleString()} of {sceneIds.length.toLocaleString()} scenes
            </p>
          )}
          {view.type === "table" ? (
            <TableView ownerTitle="the manuscript" view={view} properties={properties} entryIds={arranged} presenter={presenter} />
          ) : view.type === "board" ? (
            <BoardView
              ownerId={manuscriptId}
              view={view}
              properties={properties}
              entryIds={arranged}
              presenter={presenter}
              onChooseGrouping={() => setScenePanel("view")}
            />
          ) : (
            <ListView ownerTitle="the manuscript" view={view} properties={properties} entryIds={arranged} presenter={presenter} />
          )}
          {sceneIds.length === 0 && <p className="r2-entry-empty">No scenes yet.</p>}
        </div>
      </section>
    </div>
  );
}
