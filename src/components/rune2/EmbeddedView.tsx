"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import { Columns3, GitCommitHorizontal, List, Table2, X } from "lucide-react";
import { ICON, ICON_SM } from "./icons";
import { boardLanes, isSceneView, viewOwner } from "@/lib/rune2/collectionViews";
import { viewScope } from "@/lib/rune2/sceneViews";
import { timelineAxis } from "@/lib/rune2/timelineViews";
import type { ViewEmbedKind } from "@/lib/rune2/workspaceDocument";
import type { NavEntry } from "@/lib/rune2/navigatorModel";
import type { CollectionViewType, PropertyDefinition, SavedView, SceneView, WorkspaceCollectionView } from "@/lib/types";
import { useCollectionItems } from "./CollectionView";
import { BoardView, ListView, TableView, type ItemPresenter } from "./CollectionViewBodies";
import { useSceneItems } from "./ManuscriptScenes";
import { TimelineView } from "./TimelineView";
import { usePropertyStore } from "./PropertyStore";
import { useRune2Selection } from "./Rune2Selection";
import { useViewStore } from "./ViewStore";

// A saved View shown inside a Workspace Page or Entry body: a live
// representation of that one View — a Collection's (027) or the Manuscript's
// Scene View (032) — by its id alone. It reads the same Entries or Scenes,
// the same values and the same configuration as the View's own page, through
// the same arrangement and bodies (useCollectionItems / useSceneItems and
// CollectionViewBodies), so a change to the View anywhere shows here at once
// and nothing is ever copied into the document. Manuscript order, Unplaced
// Scenes apart, and Trash (a trashed Entry or Scene isn't in the index) all
// come with it.
//
// Restrained: a quiet heading (the View's name, its Collection or
// "Scenes", "Open"), then the first few items; "Show all" for the rest.
// Items open as they do everywhere. The View's settings stay on its own page:
// "Open" goes there, on this View.

/** Items shown before "Show all". */
const FIRST_ITEMS = 8;

const VIEW_ICON: Record<CollectionViewType, typeof List> = { list: List, table: Table2, board: Columns3, timeline: GitCommitHorizontal };

export function EmbeddedView({
  viewId,
  kind,
  onRemove,
}: {
  viewId: string | null;
  kind: ViewEmbedKind;
  /** Removes the embed from the document (never the View). Absent when read-only. */
  onRemove?: () => void;
}) {
  const { viewById } = useViewStore();
  const { index } = useRune2Selection();
  const { manuscriptId } = usePropertyStore();
  const view = viewId ? viewById(viewId) : null;

  // A Group's View whose Group is gone (deleted, so its Views are too) is not available.
  if (
    view &&
    isSceneView(view) &&
    kind === "scene" &&
    view.manuscript_id === manuscriptId &&
    (!view.group_id || index.get(view.group_id)?.kind === "group")
  ) {
    return <SceneEmbed view={view} onRemove={onRemove} />;
  }
  const collection = view && !isSceneView(view) ? index.get(view.collection_id) : undefined;
  if (view && !isSceneView(view) && kind === "collection" && collection?.kind === "workspaceCollection") {
    return <CollectionEmbed view={view} collection={collection} onRemove={onRemove} />;
  }
  return (
    <div className="r2-embed-frame" data-missing="">
      <div className="r2-embed-head">
        <span className="r2-embed-name">{kind === "scene" ? "Scene view" : "Collection view"}</span>
        <span className="r2-embed-owner">Not available — deleted, or in Trash</span>
        <RemoveButton onRemove={onRemove} />
      </div>
    </div>
  );
}

function CollectionEmbed({
  view,
  collection,
  onRemove,
}: {
  view: WorkspaceCollectionView;
  collection: NavEntry;
  onRemove?: () => void;
}) {
  const { select, openInNewTab } = useRune2Selection();
  const { setActiveView } = useViewStore();
  const { properties, entryIds, arranged, presenter } = useCollectionItems(collection, view);
  const open = (e: MouseEvent) => {
    setActiveView(collection.id, view.id);
    if (e.metaKey || e.ctrlKey) openInNewTab(collection.id);
    else select(collection.id);
  };
  return (
    <EmbedFrame
      view={view}
      owner={collection.title}
      ownerTitle={collection.title}
      properties={properties}
      total={entryIds.length}
      arranged={arranged}
      presenter={presenter}
      empty={entryIds.length === 0 ? "No entries yet." : "No entries match this view."}
      onOpen={open}
      onRemove={onRemove}
    />
  );
}

function SceneEmbed({ view, onRemove }: { view: SceneView; onRemove?: () => void }) {
  const { select, openInNewTab, index } = useRune2Selection();
  const { setActiveView, openScenes } = useViewStore();
  // A Group's View shows that Group's Scenes and opens on the Group's page (044).
  const scope = viewScope(view);
  const group = view.group_id ? index.get(view.group_id) : undefined;
  const { properties, sceneIds, arranged, presenter } = useSceneItems(view, scope);
  const open = (e: MouseEvent) => {
    setActiveView(viewOwner(view), view.id);
    openScenes();
    const target = view.group_id ?? null;
    if (e.metaKey || e.ctrlKey) openInNewTab(target);
    else select(target);
  };
  const ownerTitle = group ? group.title : "the manuscript";
  return (
    <EmbedFrame
      view={view}
      owner={group ? group.title : "Scenes"}
      ownerTitle={ownerTitle}
      properties={properties}
      total={sceneIds.length}
      arranged={arranged}
      presenter={presenter}
      empty={sceneIds.length === 0 ? "No scenes yet." : "No scenes match this view."}
      onOpen={open}
      onRemove={onRemove}
    />
  );
}

function EmbedFrame({
  view,
  owner,
  ownerTitle,
  properties,
  total,
  arranged,
  presenter,
  empty,
  onOpen,
  onRemove,
}: {
  view: SavedView;
  owner: string;
  ownerTitle: string;
  properties: PropertyDefinition[];
  total: number;
  arranged: string[];
  presenter: ItemPresenter;
  empty: string;
  onOpen: (e: MouseEvent) => void;
  onRemove?: () => void;
}) {
  const [all, setAll] = useState(false);
  const Icon = VIEW_ICON[view.type];
  const board = view.type === "board";
  const timeline = view.type === "timeline";
  // Lane targets and Board moves are the Manuscript's for any Scene Base.
  const ownerId = isSceneView(view) ? view.manuscript_id : view.collection_id;
  // A Board or Timeline shows every item (they scroll); a List or Table its first few.
  const shown = board || timeline || all ? arranged : arranged.slice(0, FIRST_ITEMS);
  const more = arranged.length - shown.length;
  const grouped = board && boardLanes(view, properties, presenter.values, arranged, presenter.laneTargets) !== null;
  const axis = timeline && timelineAxis(view, properties, isSceneView(view)) !== null;

  let body: ReactNode;
  if (arranged.length === 0) body = <p className="r2-embed-empty">{empty}</p>;
  else if (board && !grouped) body = <p className="r2-embed-empty">This board isn’t grouped yet — open it to choose how.</p>;
  else if (timeline && !axis) body = <p className="r2-embed-empty">This timeline has no axis yet — open it to choose one.</p>;
  else if (timeline)
    body = (
      <TimelineView
        ownerId={ownerId}
        view={view}
        properties={properties}
        entryIds={shown}
        presenter={presenter}
        manuscript={isSceneView(view)}
        onChooseAxis={() => undefined}
      />
    );
  else if (view.type === "table")
    body = <TableView ownerTitle={ownerTitle} view={view} properties={properties} entryIds={shown} presenter={presenter} />;
  else if (board)
    body = (
      <BoardView
        ownerId={ownerId}
        view={view}
        properties={properties}
        entryIds={shown}
        presenter={presenter}
        onChooseGrouping={() => undefined}
      />
    );
  else body = <ListView ownerTitle={ownerTitle} view={view} properties={properties} entryIds={shown} presenter={presenter} />;

  return (
    <div className="r2-embed-frame" data-type={view.type}>
      <div className="r2-embed-head">
        <Icon {...ICON} aria-hidden className="r2-embed-icon" />
        <span className="r2-embed-name">{view.name}</span>
        <span className="r2-embed-owner">{owner}</span>
        {total !== arranged.length && (
          <span className="r2-embed-count">
            {arranged.length.toLocaleString()} of {total.toLocaleString()}
          </span>
        )}
        <button type="button" className="r2-embed-open" onClick={onOpen} title={`Open this view in ${owner}`}>
          Open
        </button>
        <RemoveButton onRemove={onRemove} />
      </div>
      <div className="r2-embed-body" data-embed-body="">
        {body}
        {more > 0 && (
          <button type="button" className="r2-embed-more" onClick={() => setAll(true)}>
            Show all {arranged.length.toLocaleString()}
          </button>
        )}
      </div>
    </div>
  );
}

function RemoveButton({ onRemove }: { onRemove?: () => void }) {
  if (!onRemove) return null;
  return (
    <button
      type="button"
      className="r2-icon-button r2-embed-remove"
      aria-label="Remove from this page"
      title="Remove from this page (the view itself is kept)"
      onClick={onRemove}
    >
      <X {...ICON_SM} aria-hidden />
    </button>
  );
}
