"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { valueLine } from "@/lib/rune2/collectionProperties";
import { boardLanes, shownProperties, type BoardLane } from "@/lib/rune2/collectionViews";
import {
  axisName,
  axisProperties,
  axisTicks,
  manuscriptLayout,
  packRows,
  propertyPlacements,
  timelineAxis,
  type ManuscriptLayout,
  type PropertyPlacement,
  type Tick,
} from "@/lib/rune2/timelineViews";
import type { PropertyDefinition, SavedView } from "@/lib/types";
import { ItemNumber, useOpenItem, useTitleOf, type ItemPresenter } from "./CollectionViewBodies";
import { OptionNames } from "./PropertyFields";
import { usePropertyStore } from "./PropertyStore";
import { useRune2Selection } from "./Rune2Selection";

// A Timeline View (migration 042): the View's items — a Collection's Entries
// or the Manuscript's Scenes, already arranged (filtered) — along one axis:
//   manuscript position  a header of Group bands over Chapter columns; each
//                        Scene a marker in its Chapter, in manuscript order
//                        (Chapters with none of the View's Scenes collapse
//                        into a narrow gap, so the manuscript keeps its shape);
//   a number or date     ticks along the axis; each item a marker at its
//                        value; items with none listed apart, never placed.
// With lanes (the View's group_by, as a Board's columns), one band of rows
// per lane. Markers that would overlap stack into rows instead of piling.
//
// Read-mostly: a click opens the canonical Scene or Entry as everywhere else;
// nothing here drags, reorders the manuscript or writes a value. The layout
// is worked out from the index and the values on every render, so a moved
// Chapter or Scene, a changed value or a filter simply shows.
//
// The track scrolls sideways when the manuscript (or the values' spread)
// needs more room than the page gives; lane names stay put.

/** A marker's width, and the height of a row of markers. */
const ITEM_WIDTH = 168;
const ROW_HEIGHT = 30;
const ROW_HEIGHT_WITH_META = 44;
/** Sideways room per Scene along the manuscript, and the least a Chapter column takes. */
const MIN_SLOT = 40;
const MAX_SLOT = 120;
const MIN_CHAPTER = 96;
const GAP_WIDTH = 44;
/** Room per distinct value along a property axis. */
const VALUE_SPACING = 64;
const AXIS_PAD = 24;

type LaneLayout = {
  lane: BoardLane | null;
  /** Each marker's left edge and row. */
  markers: { id: string; x: number; row: number }[];
  rows: number;
};

type ColumnBox = { at: number; x: number; width: number };

type Layout = {
  width: number;
  header: { kind: "manuscript"; layout: ManuscriptLayout; columns: ColumnBox[] } | { kind: "property"; ticks: (Tick & { x: number })[] };
  lanes: LaneLayout[];
  /** Vertical hairlines' x positions. */
  rules: number[];
  /** Items with no place on the axis. */
  apart: string[];
};

export function TimelineView({
  ownerId,
  view,
  properties,
  entryIds,
  presenter,
  manuscript,
  onChooseAxis,
}: {
  /** The Collection or Manuscript whose properties the Timeline uses. */
  ownerId: string;
  view: SavedView;
  properties: PropertyDefinition[];
  /** The View's items, arranged (filtered). */
  entryIds: string[];
  presenter: ItemPresenter;
  /** Whether the owner offers manuscript position (the Manuscript). */
  manuscript: boolean;
  onChooseAxis: () => void;
}) {
  const { index } = useRune2Selection();
  const { createProperty } = usePropertyStore();
  const open = useOpenItem(presenter);
  const titleOf = useTitleOf();
  const hintId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  // The room the page gives: the track is at least that wide.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setAvailable(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const axis = timelineAxis(view, properties, manuscript);
  const values = presenter.values;
  const shown = shownProperties(view, properties).filter((p) => p.id !== view.config.group_by);
  const rowHeight = shown.length > 0 ? ROW_HEIGHT_WITH_META : ROW_HEIGHT;
  const board = boardLanes(view, properties, values, entryIds, presenter.laneTargets);

  const layout = useMemo<Layout | null>(() => {
    if (!axis) return null;
    const laneOf = (ids: readonly string[]) => (board ? board.lanes.map((lane) => ({ lane, ids: lane.entryIds.filter((id) => ids.includes(id)) })) : [{ lane: null, ids: [...ids] }]);

    if (axis.kind === "manuscript") {
      const m = manuscriptLayout(index, entryIds);
      const total = m.placed.length;
      const trackRoom = Math.max(0, available - ITEM_WIDTH - AXIS_PAD);
      const gaps = m.columns.filter((c) => c.kind === "gap").length;
      const slot = total > 0 ? Math.min(MAX_SLOT, Math.max(MIN_SLOT, (trackRoom - gaps * GAP_WIDTH) / total)) : MIN_SLOT;
      const columns: ColumnBox[] = [];
      const xOf = new Map<string, number>();
      let x = AXIS_PAD;
      const rules: number[] = [];
      m.columns.forEach((c, at) => {
        const width = c.kind === "gap" ? GAP_WIDTH : Math.max(MIN_CHAPTER, c.sceneIds.length * slot);
        columns.push({ at, x, width });
        rules.push(x);
        if (c.kind === "chapter") {
          const each = width / c.sceneIds.length;
          c.sceneIds.forEach((id, i) => xOf.set(id, x + (i + 0.5) * each));
        }
        x += width;
      });
      const width = Math.max(available, x + ITEM_WIDTH);
      const lanes = laneOf(m.placed).map(({ lane, ids }): LaneLayout => {
        const items = ids.map((id) => ({ id, x: (xOf.get(id) ?? 0) - 9 }));
        const rows = packRows(items, ITEM_WIDTH);
        return { lane, markers: items.map((it) => ({ ...it, row: rows.get(it.id) ?? 0 })), rows: Math.max(1, ...items.map((it) => (rows.get(it.id) ?? 0) + 1)) };
      });
      return { width, header: { kind: "manuscript", layout: m, columns }, lanes, rules, apart: m.unplaced };
    }

    const { placed, missing } = propertyPlacements(axis.property, entryIds, values);
    const distinct = new Set(placed.map((p) => p.at)).size;
    const width = Math.max(available, Math.min(distinct, 400) * VALUE_SPACING + ITEM_WIDTH + AXIS_PAD * 2);
    const usable = width - ITEM_WIDTH - AXIS_PAD * 2;
    let min = Infinity;
    let max = -Infinity;
    for (const p of placed) {
      min = Math.min(min, p.at);
      max = Math.max(max, p.at);
    }
    const scale = (at: number) => (max === min ? AXIS_PAD : AXIS_PAD + ((at - min) / (max - min)) * usable);
    const ticks = axisTicks(axis.property, placed, Math.max(2, Math.floor(usable / 110))).map((t) => ({ ...t, x: scale(t.at) }));
    const byId = new Map(placed.map((p): [string, PropertyPlacement] => [p.id, p]));
    const lanes = laneOf(placed.map((p) => p.id)).map(({ lane, ids }): LaneLayout => {
      const items = ids.map((id) => ({ id, x: scale(byId.get(id)!.at) - 9 }));
      const rows = packRows(items, ITEM_WIDTH);
      return { lane, markers: items.map((it) => ({ ...it, row: rows.get(it.id) ?? 0 })), rows: Math.max(1, ...items.map((it) => (rows.get(it.id) ?? 0) + 1)) };
    });
    return { width, header: { kind: "property", ticks }, lanes, rules: ticks.map((t) => t.x), apart: missing };
  }, [axis, board, index, entryIds, values, available]);

  if (!axis || !layout) {
    return <TimelineSetup ownerId={ownerId} properties={properties} manuscript={manuscript} noun={presenter.noun} onChooseAxis={onChooseAxis} createProperty={createProperty} />;
  }

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const lane = e.currentTarget.closest("[data-timeline-lane]");
    const items = [...(lane?.querySelectorAll<HTMLElement>("[data-timeline-item]") ?? [])];
    const at = items.indexOf(e.currentTarget);
    const next = items[at + (e.key === "ArrowRight" ? 1 : -1)];
    if (next) {
      e.preventDefault();
      next.focus();
      next.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  };

  const marker = (id: string, x: number, row: number, contextOnCard: boolean) => {
    const item = presenter.label(id);
    if (!item) return null;
    const line = [...(contextOnCard && item.context ? [item.context] : []), ...valueLine(shown, values, id, titleOf)];
    const full = [item.number, item.title].filter(Boolean).join(" ") + (line.length ? ` — ${line.join(" · ")}` : "");
    return (
      <button
        key={id}
        type="button"
        className="r2-timeline-item"
        data-timeline-item=""
        data-entry-open=""
        data-unnamed={!item.named || undefined}
        data-meta={line.length > 0 || undefined}
        style={{ left: x, top: row * rowHeight, width: ITEM_WIDTH }}
        title={full}
        aria-describedby={hintId}
        {...open(id)}
        onKeyDown={onKey}
      >
        <span className="r2-timeline-dot" aria-hidden />
        <span className="r2-timeline-item-title">
          <ItemNumber number={item.number} />
          {item.title}
        </span>
        {line.length > 0 && <span className="r2-timeline-item-meta">{line.join(" · ")}</span>}
      </button>
    );
  };

  const headerHeight = layout.header.kind === "manuscript" ? layout.header.layout.depth * 22 + 30 : 26;
  const apartName = axis.kind === "manuscript" ? "Not placed" : `No ${axis.property.name.toLowerCase()}`;
  const laneNamed = board !== null;

  return (
    <>
      <p id={hintId} className="sr-only">
        The left and right arrows move between items in a lane. Items open where they live.
      </p>
      <div className="r2-timeline" data-axis={axis.kind} aria-label={`${view.name}, along ${axisName(axis).toLowerCase()}`} role="group">
        <div ref={scrollRef} className="r2-timeline-scroll">
          <div className="r2-timeline-track" style={{ width: layout.width }}>
            <div className="r2-timeline-rules" aria-hidden style={{ top: headerHeight }}>
              {layout.rules.map((x, i) => (
                <span key={i} className="r2-timeline-rule" style={{ left: x }} />
              ))}
            </div>

            <div className="r2-timeline-axis" style={{ height: headerHeight }}>
              {layout.header.kind === "manuscript" ? (
                <ManuscriptHeader header={layout.header} />
              ) : (
                layout.header.ticks.map((t, i) => (
                  <span key={i} className="r2-timeline-tick" data-major={t.major || undefined} style={{ left: t.x }}>
                    {t.label}
                  </span>
                ))
              )}
            </div>

            {layout.lanes.map((l, i) => (
              <section
                key={l.lane?.optionId ?? `lane-${i}`}
                className="r2-timeline-lane"
                data-timeline-lane=""
                data-empty-lane={l.lane?.optionId === null || undefined}
                aria-label={l.lane?.name ?? undefined}
                style={{ height: l.rows * rowHeight + (laneNamed ? 30 : 12) }}
              >
                {laneNamed && l.lane && (
                  <header className="r2-timeline-lane-head">
                    <span className="r2-timeline-lane-name">
                      {l.lane.optionId === null || board!.property.type === "relationship" ? l.lane.name : <OptionNames property={board!.property} names={[l.lane.name]} />}
                    </span>
                    <span className="r2-timeline-lane-count">{l.lane.entryIds.length}</span>
                  </header>
                )}
                <div className="r2-timeline-rows" style={{ height: l.rows * rowHeight }}>
                  {l.markers.map((m) => marker(m.id, m.x, m.row, axis.kind !== "manuscript"))}
                </div>
              </section>
            ))}
            {entryIds.length > 0 && layout.lanes.every((l) => l.markers.length === 0) && layout.apart.length === 0 && (
              <p className="r2-timeline-empty">No {presenter.noun.toLowerCase()} match this view.</p>
            )}
          </div>
        </div>

        {layout.apart.length > 0 && (
          <div className="r2-timeline-apart" role="group" aria-label={`${apartName}: ${layout.apart.length}`}>
            <span className="r2-timeline-apart-name">
              {apartName} <span className="r2-timeline-lane-count">{layout.apart.length}</span>
            </span>
            <ul className="r2-timeline-apart-list">
              {layout.apart.map((id) => {
                const item = presenter.label(id);
                if (!item) return null;
                return (
                  <li key={id}>
                    <button type="button" className="r2-timeline-chip" data-entry-open="" data-unnamed={!item.named || undefined} title={item.context ?? undefined} {...open(id)}>
                      <ItemNumber number={item.number} />
                      {item.title}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
      {notice && (
        <p role="status" className="r2-doc-note">
          {notice}
        </p>
      )}
    </>
  );
}

/** Group bands over Chapter columns: the manuscript's shape as the axis. */
function ManuscriptHeader({ header }: { header: Extract<Layout["header"], { kind: "manuscript" }> }) {
  const { layout, columns } = header;
  const span = (from: number, to: number) => ({ left: columns[from].x, width: columns[to].x + columns[to].width - columns[from].x });
  return (
    <>
      {layout.groups.map((g) => (
        <span key={g.id} className="r2-timeline-group" data-unnamed={!g.named || undefined} style={{ ...span(g.from, g.to), top: g.depth * 22 }} title={g.title}>
          {g.title}
        </span>
      ))}
      {layout.columns.map((c, at) => {
        const { x: left, width } = columns[at];
        return c.kind === "chapter" ? (
          <span key={c.id} className="r2-timeline-chapter" data-unnamed={!c.named || undefined} style={{ left, width, top: layout.depth * 22 }} title={`${c.ordinal}. ${c.title}`}>
            <span className="r2-timeline-chapter-number">{c.ordinal}</span>
            <span className="r2-timeline-chapter-title">{c.title}</span>
          </span>
        ) : (
          <span
            key={`gap-${c.from}`}
            className="r2-timeline-gap"
            style={{ left, width, top: layout.depth * 22 }}
            title={c.count === 1 ? `Chapter ${c.from}: none of these scenes` : `Chapters ${c.from}–${c.to}: none of these scenes`}
          >
            {c.count === 1 ? c.from : `${c.from}–${c.to}`}
          </span>
        );
      })}
    </>
  );
}

/** A Timeline with no axis yet: what it needs, and the shortest way to it. */
function TimelineSetup({
  ownerId,
  properties,
  manuscript,
  noun,
  onChooseAxis,
  createProperty,
}: {
  ownerId: string;
  properties: PropertyDefinition[];
  manuscript: boolean;
  noun: string;
  onChooseAxis: () => void;
  createProperty: (ownerId: string, name: string, type: "date" | "number") => Promise<string | null>;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const eligible = manuscript || axisProperties(properties).length > 0;
  return (
    <div className="r2-board-setup">
      <p>
        A timeline places {noun.toLowerCase()} along {manuscript ? "the manuscript, or along " : ""}a Date or Number property — a story day, a
        date, an age.
      </p>
      {eligible ? (
        <button type="button" className="r2-button" onClick={onChooseAxis}>
          Choose an axis
        </button>
      ) : (
        <button
          type="button"
          className="r2-button"
          onClick={async () => {
            // The new property becomes this Timeline's axis (the Views' trigger).
            const e = await createProperty(ownerId, properties.some((p) => p.name.toLowerCase() === "date") ? "When" : "Date", "date");
            if (e) setNotice("Couldn’t add the property.");
          }}
        >
          Add a Date property
        </button>
      )}
      {notice && (
        <p role="status" className="r2-doc-note">
          {notice}
        </p>
      )}
    </div>
  );
}
