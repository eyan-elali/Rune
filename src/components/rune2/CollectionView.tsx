"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { ICON } from "./icons";
import { renameWorkspaceCollection } from "@/lib/actions/workspaceCollections";
import { arrangeEntries, groupableProperties, type LaneTargets } from "@/lib/rune2/collectionViews";
import type { NavEntry } from "@/lib/rune2/navigatorModel";
import type { SavedView } from "@/lib/types";
import { CollectionSchema } from "./CollectionSchema";
import { BoardView, ListView, TableView, quickFind, type ItemPresenter } from "./CollectionViewBodies";
import { TimelineView } from "./TimelineView";
import { usePropertyStore } from "./PropertyStore";
import { useRune2Selection } from "./Rune2Selection";
import { useNewEntry } from "./useNewEntry";
import { AddViewMenu, ViewSwitcher, ViewToolbar, type ToolRequest } from "./ViewControls";
import { useViewStore } from "./ViewStore";
import { OneTimeHint } from "./Hint";
import { WorkspaceTitle } from "./WorkspaceTitle";

// A Collection in the content area: its title, edited in place, and its one
// set of Entries shown through its active saved View (migration 027) — a
// Table (a new Collection's first View), a List, a Board or a
// Timeline (042: along a Date or Number property). Every
// View reads the same Entries and values, so an edit anywhere is everywhere.
//
// Under the title, one quiet line says what the Collection holds (entries,
// properties, views) — its structure, read rather than explained. Under that,
// one row over a hairline: its Views as text tabs on the left ("List  Table
// By Status  +"), representations of this one Collection, not working-set
// tabs; and on the right the active View's own toolbar (Milestone 21E) —
// Filter, Sort, a Board's columns or a Timeline's axis and lanes, Search,
// what the View shows, and the View's settings — each a small popover, so
// nothing about the View lives anywhere else on the page. The Collection's
// properties are made and configured on the Table itself (its header's
// "+ Add property" and each column's menu); a List, Board or Timeline, which
// has no header, opens the property settings inline on request.
//
// "New entry" makes an Entry in place: the writer names it in its row and
// stays in the View. A click opens an Entry in the active tab (the Entry's own
// line back to its Collection returns here); ⌘/Ctrl-click or a middle click
// opens it in a tab of its own. Views never join the working-set tabs: the Collection is the
// object that is open, and its View is remembered for the session.
//
// Geometry: a Collection is a structured set, not a document, so the whole
// of it — title, bar and View alike — takes the broad surface (r2-broad in
// rune2.css): it starts near the navigator and runs most of the way across,
// whichever View is showing; a Page or an Entry stays a centred column.

function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

export function CollectionView({ entry }: { entry: NavEntry }) {
  const { available: propertied } = usePropertyStore();
  const { available: viewable, viewsOf, activeViewOf } = useViewStore();
  // Made here, an Entry is named in its row and the writer stays in the View.
  const { add, busy, notice } = useNewEntry(entry.id, { inPlace: true });
  const bodyRef = useRef<HTMLDivElement>(null);
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [request, setRequest] = useState<ToolRequest | undefined>(undefined);
  const ask = (tool: ToolRequest["tool"]) => setRequest((r) => ({ tool, n: (r?.n ?? 0) + 1 }));
  const [search, setSearch] = useState("");
  // "Edit properties" from the toolbar: on a Table, the header's own control;
  // elsewhere (no header), the property settings inline under the bar.
  const toggleSchema = () => {
    const header = bodyRef.current?.querySelector<HTMLElement>("[data-add-property]");
    if (header && !schemaOpen) header.click();
    else setSchemaOpen((o) => !o);
  };

  const views = viewsOf(entry.id);
  const view = activeViewOf(entry.id);
  const { properties, entryIds, arranged, presenter } = useCollectionItems(entry, view);
  const found = quickFind(arranged, search, presenter);
  const hiddenCount = entryIds.length - found.length;
  const context = [
    plural(entryIds.length, "entry", "entries"),
    ...(viewable && views.length > 1 ? [plural(views.length, "view")] : []),
  ];

  return (
    <div className="r2-writing">
      <div className="r2-doc r2-page r2-collection r2-broad" data-view={view.type}>
        <WorkspaceTitle
          entry={entry}
          rename={renameWorkspaceCollection}
          noun="collection"
          placeholder="Untitled collection"
          eyebrow="Collection"
          // Out of the title: to the first Entry, or to "New entry".
          onLeave={() => bodyRef.current?.querySelector<HTMLElement>("button, input, textarea")?.focus()}
        >
          <p className="r2-collection-context">
            <span>{context[0]}</span>
            {propertied && properties.length > 0 && <span>{plural(properties.length, "property", "properties")}</span>}
            {context.slice(1).map((fact) => (
              <span key={fact}>{fact}</span>
            ))}
          </p>
        </WorkspaceTitle>

        {/* First use (Beta Completion E): what a Collection is for, once per account. */}
        <OneTimeHint id={view.type === "timeline" ? ["collection", "timeline"] : "collection"} className="r2-collection-hint" />

        {propertied && (
          <div className="r2-collection-bar" data-tabs={viewable || undefined}>
            {viewable && (
              <ViewSwitcher ownerId={entry.id} views={views} active={view} onEdit={() => ask("settings")}>
                <AddViewMenu ownerId={entry.id} properties={properties} compact />
              </ViewSwitcher>
            )}
            {viewable ? (
              <ViewToolbar
                // A fresh toolbar per View, so an open popover never carries over.
                key={view.id}
                view={view}
                views={views}
                properties={properties}
                search={search}
                onSearch={setSearch}
                schemaOpen={schemaOpen}
                onToggleSchema={toggleSchema}
                // On a Table the word opens the header's own "+ Add property" (each
                // column's menu does the rest); elsewhere, the settings inline.
                schemaLabel={view.type === "table" ? "Add a property" : "Edit properties"}
                request={request}
              />
            ) : (
              <div className="r2-toolbar">
                <button type="button" className="r2-tool" aria-expanded={schemaOpen} onClick={toggleSchema}>
                  {properties.length === 0 ? "Properties" : `${properties.length} ${properties.length === 1 ? "property" : "properties"}`}
                </button>
              </div>
            )}
          </div>
        )}
        {propertied && schemaOpen && <CollectionSchema ownerId={entry.id} ownerTitle={entry.title} />}

        {/* A fresh surface per View: it arrives rather than snaps (r2-view-enter). */}
        <div key={view.id} ref={bodyRef} className="r2-collection-body r2-view-enter">
          {hiddenCount > 0 && (
            <p className="r2-view-note">
              Showing {found.length.toLocaleString()} of {entryIds.length.toLocaleString()} entries
            </p>
          )}
          {view.type === "table" ? (
            <TableView ownerTitle={entry.title} addProperty={entry.id} view={view} properties={properties} entryIds={found} total={entryIds.length} presenter={presenter} />
          ) : view.type === "board" ? (
            <BoardView
              ownerId={entry.id}
              addToCollection={entry.id}
              view={view}
              properties={properties}
              entryIds={found}
              total={entryIds.length}
              presenter={presenter}
              onChooseGrouping={() => ask("group")}
            />
          ) : view.type === "timeline" ? (
            <TimelineView
              ownerId={entry.id}
              view={view}
              properties={properties}
              entryIds={found}
              total={entryIds.length}
              presenter={presenter}
              manuscript={false}
              onChooseAxis={() => ask("axis")}
            />
          ) : (
            <ListView ownerTitle={entry.title} view={view} properties={properties} entryIds={found} total={entryIds.length} presenter={presenter} />
          )}

          {/* "New entry" is the whole invitation; a Board's lanes each have their
              own. A Board still waiting for its grouping has no lanes yet. */}
          {(view.type !== "board" ||
            found.length === 0 ||
            !groupableProperties(properties).some((p) => p.id === view.config.group_by)) && (
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
