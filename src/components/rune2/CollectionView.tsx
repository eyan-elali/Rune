"use client";

import { useRef, useState } from "react";
import { Plus, Rows3, SlidersHorizontal } from "lucide-react";
import { ICON } from "./icons";
import { renameWorkspaceCollection } from "@/lib/actions/workspaceCollections";
import { arrangeEntries, type LaneTargets } from "@/lib/rune2/collectionViews";
import type { NavEntry } from "@/lib/rune2/navigatorModel";
import type { SavedView } from "@/lib/types";
import { CollectionSchema } from "./CollectionSchema";
import { BoardView, ListView, TableView, type ItemPresenter } from "./CollectionViewBodies";
import { TimelineView } from "./TimelineView";
import { usePropertyStore } from "./PropertyStore";
import { useRune2Selection } from "./Rune2Selection";
import { useNewEntry } from "./useNewEntry";
import { AddViewMenu, ViewOptions, ViewSwitcher, viewSummary } from "./ViewControls";
import { useViewStore } from "./ViewStore";
import { WorkspaceTitle } from "./WorkspaceTitle";

// A Collection in the content area: its title, edited in place, and its one
// set of Entries shown through its active saved View (migration 027) — a
// List (a writer's list of names, the default), a Table, a Board or a
// Timeline (042: along a Date or Number property). Every
// View reads the same Entries and values, so an edit anywhere is everywhere.
//
// Progressive disclosure: a Collection with only its default List looks as it
// did in Milestone 9 — the list, "New entry", and a quiet tool row. Once there
// is a second View, the Views become a local tab row ("List  Table  By Status
// +") — representations of this one Collection, not working-set tabs; Table
// and Board are offered from "Add view" / `+`, not upfront. View settings
// ("View", or double-click a tab) and property settings ("Properties") each
// open inline above the Entries, one at a time.
//
// A click opens an Entry in the active tab (the Entry's own line back to its
// Collection returns here); ⌘/Ctrl-click or a middle click opens it in a tab
// of its own. Views never join the working-set tabs: the Collection is the
// object that is open, and its View is remembered for the session.

type Panel = "view" | "properties" | null;

export function CollectionView({ entry }: { entry: NavEntry }) {
  const { available: propertied } = usePropertyStore();
  const { available: viewable, viewsOf, activeViewOf } = useViewStore();
  const { add, busy, notice } = useNewEntry(entry.id);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const toggle = (p: Exclude<Panel, null>) => setPanel((open) => (open === p ? null : p));

  const views = viewsOf(entry.id);
  const view = activeViewOf(entry.id);
  const { properties, entryIds, arranged, presenter } = useCollectionItems(entry, view);
  const hiddenCount = entryIds.length - arranged.length;
  const summary = viewable ? viewSummary(view, properties) : "";

  return (
    <div className="r2-writing">
      <div className="r2-doc r2-page r2-collection" data-wide={view.type !== "list" || undefined}>
        <WorkspaceTitle
          entry={entry}
          rename={renameWorkspaceCollection}
          noun="collection"
          placeholder="Untitled collection"
          // Out of the title: to the first Entry, or to "New entry".
          onLeave={() => bodyRef.current?.querySelector<HTMLElement>("button, input, textarea")?.focus()}
        />

        {propertied && (
          <div className="r2-collection-bar" data-tabs={views.length > 1 || undefined}>
            {views.length > 1 && (
              <ViewSwitcher ownerId={entry.id} views={views} active={view} onEdit={() => setPanel("view")}>
                {viewable && <AddViewMenu ownerId={entry.id} properties={properties} compact />}
              </ViewSwitcher>
            )}
            <div className="r2-collection-tools">
              {viewable && views.length === 1 && (
                <AddViewMenu ownerId={entry.id} properties={properties} compact={false} />
              )}
              {viewable && (
                <button
                  type="button"
                  className="r2-collection-tool"
                  aria-expanded={panel === "view"}
                  onClick={() => toggle("view")}
                  title="Shown properties, sort and filters for this view"
                >
                  <SlidersHorizontal {...ICON} aria-hidden />
                  {summary ? `View · ${summary}` : "View"}
                </button>
              )}
              <button
                type="button"
                className="r2-collection-tool"
                aria-expanded={panel === "properties"}
                onClick={() => toggle("properties")}
              >
                <Rows3 {...ICON} aria-hidden />
                {properties.length === 0
                  ? "Properties"
                  : `${properties.length} ${properties.length === 1 ? "property" : "properties"}`}
              </button>
            </div>
          </div>
        )}
        {propertied && panel === "properties" && (
          <CollectionSchema ownerId={entry.id} ownerTitle={entry.title} />
        )}
        {viewable && panel === "view" && (
          <ViewOptions
            // A fresh form per View, so a half-typed name never carries over.
            key={view.id}
            view={view}
            views={views}
            properties={properties}
            onDeleted={() => setPanel(null)}
          />
        )}

        <div ref={bodyRef} className="r2-collection-body">
          {hiddenCount > 0 && (
            <p className="r2-view-note">
              Showing {arranged.length.toLocaleString()} of {entryIds.length.toLocaleString()} entries
            </p>
          )}
          {view.type === "table" ? (
            <TableView ownerTitle={entry.title} view={view} properties={properties} entryIds={arranged} presenter={presenter} />
          ) : view.type === "board" ? (
            <BoardView
              ownerId={entry.id}
              addToCollection={entry.id}
              view={view}
              properties={properties}
              entryIds={arranged}
              presenter={presenter}
              onChooseGrouping={() => setPanel("view")}
            />
          ) : view.type === "timeline" ? (
            <TimelineView
              ownerId={entry.id}
              view={view}
              properties={properties}
              entryIds={arranged}
              presenter={presenter}
              manuscript={false}
              onChooseAxis={() => setPanel("view")}
            />
          ) : (
            <ListView ownerTitle={entry.title} view={view} properties={properties} entryIds={arranged} presenter={presenter} />
          )}

          {entryIds.length === 0 && view.type !== "board" && <p className="r2-entry-empty">No entries yet.</p>}
          {view.type !== "board" && (
            <button type="button" className="r2-entry-add" disabled={busy} onClick={() => void add()}>
              <Plus {...ICON} aria-hidden />
              New entry
            </button>
          )}
          {notice && (
            <p role="status" className="r2-doc-note">
              {notice}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * A Collection's Entries as one of its Views shows them: the Collection's
 * properties, its Entries arranged by the View (filtered, sorted), and how
 * the View bodies name and open them. The Collection's own page and a View
 * embedded in a Page read exactly this — one arrangement, never a copy.
 */
export function useCollectionItems(collection: NavEntry, view: SavedView) {
  const { index } = useRune2Selection();
  const { available: propertied, propertiesOf, values } = usePropertyStore();
  const laneTargets = useLaneTargets();
  const properties = propertied ? propertiesOf(collection.id) : [];
  const entryIds = (collection.entryIds ?? []).filter((id) => index.has(id));
  const arranged = arrangeEntries(view, {
    entryIds,
    properties,
    values,
    titleOf: (id) => index.get(id)?.title ?? "",
  });
  const presenter: ItemPresenter = {
    noun: "Entries",
    titleHeader: "Name",
    label: (id) => {
      const e = index.get(id);
      return e ? { title: e.title, named: e.named } : null;
    },
    openId: (id) => id,
    values,
    laneTargets,
  };
  return { properties, entryIds, arranged, presenter };
}

/**
 * A Board grouped by a Relationship has a lane per Entry of the Collection it
 * points to: those Entries, in that Collection's order, by current title.
 */
export function useLaneTargets(): LaneTargets {
  const { index } = useRune2Selection();
  return (property) => {
    const collection = property.relation_collection_id ? index.get(property.relation_collection_id) : undefined;
    return (collection?.entryIds ?? []).flatMap((id) => {
      const e = index.get(id);
      return e ? [{ id, name: e.title }] : [];
    });
  };
}

/** "+ Entry" in the context bar while an Entry is open: another Entry in the same Collection. */
export function NewEntryAction({ collectionId }: { collectionId: string }) {
  const { index } = useRune2Selection();
  const { add, busy, notice } = useNewEntry(collectionId);
  return (
    <>
      {notice && (
        <span role="status" className="r2-contextbar-notice">
          {notice}
        </span>
      )}
      <button
        type="button"
        className="r2-action"
        disabled={busy}
        onClick={() => void add()}
        title={`Add an entry to ${index.get(collectionId)?.title ?? "this collection"}`}
      >
        <Plus {...ICON} aria-hidden />
        Entry
      </button>
    </>
  );
}
