"use client";

import { useRef, useState } from "react";
import { Plus, Rows3, SlidersHorizontal } from "lucide-react";
import { renameWorkspaceCollection } from "@/lib/actions/workspaceCollections";
import { arrangeEntries } from "@/lib/rune2/collectionViews";
import type { NavEntry } from "@/lib/rune2/navigatorModel";
import { CollectionSchema } from "./CollectionSchema";
import { BoardView, ListView, TableView } from "./CollectionViewBodies";
import { usePropertyStore } from "./PropertyStore";
import { useRune2Selection } from "./Rune2Selection";
import { useNewEntry } from "./useNewEntry";
import { AddViewMenu, ViewOptions, ViewSwitcher, viewSummary } from "./ViewControls";
import { useViewStore } from "./ViewStore";
import { WorkspaceTitle } from "./WorkspaceTitle";

// A Collection in the content area: its title, edited in place, and its one
// set of Entries shown through its active saved View (migration 027) — a
// List (a writer's list of names, the default), a Table or a Board. Every
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
  const { index } = useRune2Selection();
  const { available: propertied, propertiesOf, values } = usePropertyStore();
  const { available: viewable, viewsOf, activeViewOf } = useViewStore();
  const { add, busy, notice } = useNewEntry(entry.id);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const toggle = (p: Exclude<Panel, null>) => setPanel((open) => (open === p ? null : p));

  const properties = propertied ? propertiesOf(entry.id) : [];
  const views = viewsOf(entry.id);
  const view = activeViewOf(entry.id);
  const entryIds = (entry.entryIds ?? []).filter((id) => index.has(id));
  const arranged = arrangeEntries(view, {
    entryIds,
    properties,
    values,
    titleOf: (id) => index.get(id)?.title ?? "",
  });
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
              <ViewSwitcher collectionId={entry.id} views={views} active={view} onEdit={() => setPanel("view")}>
                {viewable && <AddViewMenu collectionId={entry.id} properties={properties} compact />}
              </ViewSwitcher>
            )}
            <div className="r2-collection-tools">
              {viewable && views.length === 1 && (
                <AddViewMenu collectionId={entry.id} properties={properties} compact={false} />
              )}
              {viewable && (
                <button
                  type="button"
                  className="r2-collection-tool"
                  aria-expanded={panel === "view"}
                  onClick={() => toggle("view")}
                  title="Shown properties, sort and filters for this view"
                >
                  <SlidersHorizontal size={13} strokeWidth={1.75} aria-hidden />
                  {summary ? `View · ${summary}` : "View"}
                </button>
              )}
              <button
                type="button"
                className="r2-collection-tool"
                aria-expanded={panel === "properties"}
                onClick={() => toggle("properties")}
              >
                <Rows3 size={13} strokeWidth={1.75} aria-hidden />
                {properties.length === 0
                  ? "Properties"
                  : `${properties.length} ${properties.length === 1 ? "property" : "properties"}`}
              </button>
            </div>
          </div>
        )}
        {propertied && panel === "properties" && (
          <CollectionSchema collectionId={entry.id} collectionTitle={entry.title} />
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
            <TableView collectionTitle={entry.title} view={view} properties={properties} entryIds={arranged} />
          ) : view.type === "board" ? (
            <BoardView
              collectionId={entry.id}
              view={view}
              properties={properties}
              entryIds={arranged}
              onChooseGrouping={() => setPanel("view")}
            />
          ) : (
            <ListView collectionTitle={entry.title} view={view} properties={properties} entryIds={arranged} />
          )}

          {entryIds.length === 0 && view.type !== "board" && <p className="r2-entry-empty">No entries yet.</p>}
          {view.type !== "board" && (
            <button type="button" className="r2-entry-add" disabled={busy} onClick={() => void add()}>
              <Plus size={14} strokeWidth={1.75} aria-hidden />
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
        <Plus size={14} strokeWidth={1.75} aria-hidden />
        Entry
      </button>
    </>
  );
}
