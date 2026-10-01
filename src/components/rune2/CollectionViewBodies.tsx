"use client";

import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { Plus } from "lucide-react";
import { formatValue, isChoiceType, valueKey, valueLine } from "@/lib/rune2/collectionProperties";
import {
  boardLanes,
  boardMoveValue,
  clampColumnWidth,
  columnWidth,
  COLUMN_MAX_WIDTH,
  COLUMN_MIN_WIDTH,
  groupableProperties,
  isNative,
  shownProperties,
  type BoardLane,
  type LaneTargets,
  TITLE_COLUMN,
  withColumnWidth,
} from "@/lib/rune2/collectionViews";
import { describeObject } from "@/lib/rune2/references";
import type { PropertyDefinition, PropertyValue, SavedView } from "@/lib/types";
import { OptionNames, PropertyValueEditor } from "./PropertyFields";
import { usePropertyStore } from "./PropertyStore";
import { useRune2Selection } from "./Rune2Selection";
import { useNewEntry } from "./useNewEntry";
import { useViewStore } from "./ViewStore";

// The ways a saved View shows its items (a Timeline is in TimelineView.tsx) — a Collection's Entries
// (migration 027) or a Manuscript's Scenes (032), through one set of bodies.
// Each is given the items already arranged (filtered, sorted) by the View,
// an ItemPresenter saying how its owner names and opens an item, and reads
// and writes the one set of values in the property store — there is nothing
// view-specific to keep in step.
//
//   List  — the writer's list of names; under each, one muted line of the
//           View's shown properties. Never columns.
//   Table — a row per item: its name, then the shown properties as columns,
//           each value edited in place with the item's own editors (a
//           read-only field — a Scene's words or placement — is only shown).
//           Every column has a width (saved with the View, else its type's
//           default) and can be dragged wider or narrower; long values
//           wrap or truncate inside it.
//   Board — a lane per option of a select or status property, or per Entry a
//           Relationship points to (and one for none); moving a card between
//           lanes sets that value — only that value.

/** How a View's owner presents its items. */
export type ItemPresenter = {
  /** Plural noun for labels: "Entries", "Scenes". */
  noun: string;
  /** The Table's first column: "Name", "Scene". */
  titleHeader: string;
  /**
   * An item's name as shown, and quiet context: `number` before it (a Scene's
   * "31.2"), `context` after it (its Chapter, "Unplaced"). null: not shown.
   */
  label: (id: string) => { title: string; named: boolean; number?: string | null; context?: string | null } | null;
  /** The object an item opens as (a Chapter's only Scene opens as its Chapter). */
  openId: (id: string) => string;
  /** Every value by valueKey — stored ones and the owner's read-only fields. */
  values: ReadonlyMap<string, PropertyValue>;
  /** Lanes for a Board grouped by a Relationship: the target Collection's Entries. */
  laneTargets: LaneTargets;
  /** Where the arranged items start a separate section (-1: none), and its heading. */
  sectionStart?: number;
  sectionTitle?: string;
};

/** Open an item: here, or (⌘/Ctrl-click, middle click) in a tab of its own. */
export function useOpenItem(presenter: ItemPresenter) {
  const { select, openInNewTab } = useRune2Selection();
  return (id: string) => {
    const target = presenter.openId(id);
    return {
      onClick: (e: MouseEvent) => (e.metaKey || e.ctrlKey ? openInNewTab(target) : select(target)),
      onAuxClick: (e: MouseEvent) => {
        if (e.button === 1) {
          e.preventDefault();
          openInNewTab(target);
        }
      },
    };
  };
}

/** A Relationship target's current title, for a value line ("Drelareth"); undefined when gone. */
export function useTitleOf() {
  const { index } = useRune2Selection();
  return (id: string) => describeObject(index, id)?.title;
}

/** Up/Down from one row's button to the next row's. */
function moveBetweenRows(e: KeyboardEvent<HTMLElement>, rowSelector: string) {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  const row = e.currentTarget.closest(rowSelector);
  let next = e.key === "ArrowDown" ? row?.nextElementSibling : row?.previousElementSibling;
  // Skip a section heading row.
  while (next && !next.querySelector("[data-entry-open]")) {
    next = e.key === "ArrowDown" ? next.nextElementSibling : next.previousElementSibling;
  }
  const target = next?.querySelector<HTMLElement>("[data-entry-open]");
  if (target) {
    e.preventDefault();
    target.focus();
  }
}

type BodyProps = {
  view: SavedView;
  properties: PropertyDefinition[];
  /** The View's items, arranged. */
  entryIds: string[];
  presenter: ItemPresenter;
};

/** The quiet number before a name ("31.2"), when the owner has one. */
export function ItemNumber({ number }: { number?: string | null }) {
  if (!number) return null;
  return <span className="r2-item-number">{number}</span>;
}

// ── List ────────────────────────────────────────────────────────────────────

export function ListView({ ownerTitle, view, properties, entryIds, presenter }: BodyProps & { ownerTitle: string }) {
  const open = useOpenItem(presenter);
  const titleOf = useTitleOf();
  const shown = shownProperties(view, properties);
  if (entryIds.length === 0) return null;
  return (
    <ul className="r2-entry-list" aria-label={`${presenter.noun} in ${ownerTitle}`}>
      {entryIds.map((id, at) => {
        const item = presenter.label(id);
        if (!item) return null;
        const line = [
          ...(item.context ? [item.context] : []),
          ...valueLine(shown, presenter.values, id, titleOf),
        ];
        return (
          <Fragment key={id}>
            {at === presenter.sectionStart && at >= 0 && (
              <li className="r2-entry-section" aria-hidden>
                {presenter.sectionTitle}
              </li>
            )}
            <li>
              <button
                type="button"
                className="r2-entry-row"
                data-entry-open=""
                data-unnamed={!item.named || undefined}
                {...open(id)}
                onKeyDown={(ev) => moveBetweenRows(ev, "li")}
              >
                <span className="r2-entry-row-title">
                  <ItemNumber number={item.number} />
                  {item.title}
                </span>
                {line.length > 0 && <span className="r2-entry-row-meta">{line.join(" · ")}</span>}
              </button>
            </li>
          </Fragment>
        );
      })}
    </ul>
  );
}

// ── Table ───────────────────────────────────────────────────────────────────

export function TableView({ ownerTitle, view, properties, entryIds, presenter }: BodyProps & { ownerTitle: string }) {
  const { setValue } = usePropertyStore();
  const { updateView } = useViewStore();
  const open = useOpenItem(presenter);
  const titleOf = useTitleOf();
  const tableId = useId();
  const [notice, setNotice] = useState<string | null>(null);
  // A column being resized: its live width, until the View saves it.
  const [resizing, setResizing] = useState<{ key: string; width: number } | null>(null);
  const shown = shownProperties(view, properties);
  const sort = view.config.sort;
  const widthOf = (key: string, field: PropertyDefinition | typeof TITLE_COLUMN) =>
    resizing?.key === key ? resizing.width : columnWidth(view, field);
  const columns = [
    { key: TITLE_COLUMN, width: widthOf(TITLE_COLUMN, TITLE_COLUMN), name: presenter.titleHeader },
    ...shown.map((p) => ({ key: p.id, width: widthOf(p.id, p), name: p.name })),
  ];
  const tableWidth = columns.reduce((sum, c) => sum + c.width, 0);

  async function saveWidth(key: string, width: number | null) {
    const current = view.config.widths?.[key];
    const done = () => setResizing((r) => (r?.key === key ? null : r));
    if (width === null ? current === undefined : current === clampColumnWidth(width)) return done();
    const error = await updateView(view, { config: withColumnWidth(view.config, key, width) });
    done();
    if (error) setNotice("The column width couldn’t be saved.");
  }

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  if (entryIds.length === 0) return null;
  const colId = (propertyId: string) => `${tableId}-c-${propertyId}`;
  const rowId = (entryId: string) => `${tableId}-r-${entryId}`;
  const sortMark = (by: string) =>
    sort?.by === by ? <span className="r2-table-sort">{sort.direction === "asc" ? "↑" : "↓"}</span> : null;

  return (
    <>
      <div className="r2-table-wrap">
        <table className="r2-table" aria-label={`${view.name} — ${ownerTitle}`} style={{ width: tableWidth }}>
          <colgroup>
            {columns.map((c) => (
              <col key={c.key} style={{ width: c.width }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col" id={colId("title")} className="r2-table-title-col">
                <span className="r2-table-head">
                  {presenter.titleHeader}
                  {sortMark("title")}
                </span>
                <ColumnResizer
                  name={columns[0].name}
                  width={columns[0].width}
                  onResize={(width) => setResizing({ key: TITLE_COLUMN, width })}
                  onCommit={(width) => void saveWidth(TITLE_COLUMN, width)}
                />
              </th>
              {shown.map((p, i) => (
                <th key={p.id} scope="col" id={colId(p.id)} data-type={p.type} data-native={isNative(p) || undefined}>
                  <span className="r2-table-head">
                    {p.name}
                    {sortMark(p.id)}
                  </span>
                  <ColumnResizer
                    name={p.name}
                    width={columns[i + 1].width}
                    onResize={(width) => setResizing({ key: p.id, width })}
                    onCommit={(width) => void saveWidth(p.id, width)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entryIds.map((id, at) => {
              const item = presenter.label(id);
              if (!item) return null;
              return (
                <Fragment key={id}>
                  {at === presenter.sectionStart && at >= 0 && (
                    <tr className="r2-table-section" aria-hidden>
                      <td colSpan={shown.length + 1}>{presenter.sectionTitle}</td>
                    </tr>
                  )}
                  <tr>
                    <th scope="row" id={rowId(id)} className="r2-table-title">
                      <button
                        type="button"
                        data-entry-open=""
                        data-unnamed={!item.named || undefined}
                        title={item.context ?? undefined}
                        {...open(id)}
                        onKeyDown={(ev) => moveBetweenRows(ev, "tr")}
                      >
                        <ItemNumber number={item.number} />
                        {item.title}
                      </button>
                    </th>
                    {shown.map((p) =>
                      isNative(p) ? (
                        <td key={p.id} data-type={p.type} data-native="" className="r2-prop-value">
                          <span className="r2-prop-static">{formatValue(p, presenter.values.get(valueKey(id, p.id)), titleOf) ?? "—"}</span>
                        </td>
                      ) : (
                        <td key={p.id} data-type={p.type} className="r2-prop-value">
                          <PropertyValueEditor
                            property={p}
                            value={presenter.values.get(valueKey(id, p.id))}
                            labelId={`${colId(p.id)} ${rowId(id)}`}
                            floating
                            ownerId={id}
                            onSave={async (next) => {
                              const error = await setValue(id, p.id, next);
                              if (error) setNotice(`“${p.name}” couldn’t be saved.`);
                            }}
                          />
                        </td>
                      )
                    )}
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {notice && (
        <p role="status" className="r2-doc-note">
          {notice}
        </p>
      )}
    </>
  );
}

/**
 * The border at a column header's right edge: drag it, or focus it and use
 * ← / → (Shift: in larger steps); double-click (or Delete) returns the column
 * to its default width. While dragging only the screen changes; the width is
 * saved with the View when the drag ends (or shortly after the last key).
 */
function ColumnResizer({
  name,
  width,
  onResize,
  onCommit,
}: {
  name: string;
  width: number;
  onResize: (width: number) => void;
  /** null: back to the default width. */
  onCommit: (width: number | null) => void;
}) {
  const drag = useRef<{ x: number; width: number; last: number } | null>(null);
  const keyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const keyWidth = useRef<number | null>(null);

  useEffect(() => () => clearTimeout(keyTimer.current), []);

  function flushKeys() {
    clearTimeout(keyTimer.current);
    if (keyWidth.current !== null) onCommit(keyWidth.current);
    keyWidth.current = null;
  }

  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize the ${name} column`}
      aria-valuemin={COLUMN_MIN_WIDTH}
      aria-valuemax={COLUMN_MAX_WIDTH}
      aria-valuenow={width}
      tabIndex={0}
      className="r2-col-resize"
      onPointerDown={(e: PointerEvent<HTMLSpanElement>) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, width, last: width };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const next = clampColumnWidth(drag.current.width + e.clientX - drag.current.x);
        if (next !== drag.current.last) {
          drag.current.last = next;
          onResize(next);
        }
      }}
      onPointerUp={(e) => {
        if (!drag.current) return;
        e.currentTarget.releasePointerCapture(e.pointerId);
        const { width: from, last } = drag.current;
        drag.current = null;
        if (last !== from) onCommit(last);
      }}
      onPointerCancel={() => {
        if (!drag.current) return;
        drag.current = null;
        onCommit(width);
      }}
      onDoubleClick={() => onCommit(null)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 48 : 16;
        let next: number | null = null;
        if (e.key === "ArrowLeft") next = clampColumnWidth((keyWidth.current ?? width) - step);
        else if (e.key === "ArrowRight") next = clampColumnWidth((keyWidth.current ?? width) + step);
        else if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          keyWidth.current = null;
          onCommit(null);
          return;
        } else return;
        e.preventDefault();
        keyWidth.current = next;
        onResize(next);
        clearTimeout(keyTimer.current);
        keyTimer.current = setTimeout(flushKeys, 500);
      }}
      onBlur={flushKeys}
    />
  );
}

// ── Board ───────────────────────────────────────────────────────────────────

const DRAG_TYPE = "application/x-rune-entry";

export function BoardView({
  ownerId,
  addToCollection,
  view,
  properties,
  entryIds,
  presenter,
  onChooseGrouping,
}: BodyProps & {
  /** The Collection or Manuscript whose properties the Board groups by. */
  ownerId: string;
  /** A Collection: each lane can add a new Entry there. (A Scene is never created from a View.) */
  addToCollection?: string;
  onChooseGrouping: () => void;
}) {
  const { setValue, createProperty, updateProperty } = usePropertyStore();
  const open = useOpenItem(presenter);
  const titleOf = useTitleOf();
  const hintId = useId();
  const { add, busy, notice: addNotice } = useNewEntry(addToCollection ?? "");
  const [notice, setNotice] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [newLane, setNewLane] = useState<string | null>(null);
  const values = presenter.values;

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const board = boardLanes(view, properties, values, entryIds, presenter.laneTargets);

  if (!board) {
    const groupable = groupableProperties(properties);
    return (
      <div className="r2-board-setup">
        <p>A board sorts {presenter.noun.toLowerCase()} into columns by a Status, a Select, or a Relationship to a collection.</p>
        {groupable.length > 0 ? (
          <button type="button" className="r2-button" onClick={onChooseGrouping}>
            Choose a property
          </button>
        ) : (
          <button
            type="button"
            className="r2-button"
            onClick={async () => {
              // The new property becomes this Board's grouping (the Views' trigger).
              const e = await createProperty(
                ownerId,
                properties.some((p) => p.name.toLowerCase() === "status") ? "Stage" : "Status",
                "status"
              );
              if (e) setNotice("Couldn’t add the property.");
            }}
          >
            Add a Status property
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

  const { property, lanes } = board;
  const cardProperties = shownProperties(view, properties).filter((p) => p.id !== property.id);
  const laneKey = (lane: BoardLane) => lane.optionId ?? "";

  /**
   * Moves an item from one lane to another: sets (or, for the empty lane,
   * clears) the grouped value — nothing else about the item changes, and a
   * Scene keeps its place in the manuscript.
   */
  const move = async (itemId: string, from: string | null, lane: BoardLane) => {
    const next = boardMoveValue(property, values.get(valueKey(itemId, property.id)), from, lane.optionId);
    if (next === undefined) return;
    const error = await setValue(itemId, property.id, next);
    if (error) setNotice(`“${presenter.label(itemId)?.title ?? "That item"}” couldn’t be moved.`);
  };

  const focusCard = (itemId: string, laneId: string | null) =>
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(`[data-board-entry="${CSS.escape(itemId)}"][data-board-lane="${CSS.escape(laneId ?? "")}"]`)
        ?.focus()
    );

  const onCardKey = (e: KeyboardEvent<HTMLButtonElement>, itemId: string, at: number) => {
    if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      const target = lanes[at + (e.key === "ArrowLeft" ? -1 : 1)];
      if (!target) return;
      e.preventDefault();
      void move(itemId, lanes[at].optionId, target);
      focusCard(itemId, target.optionId);
      return;
    }
    moveBetweenRows(e, "li");
  };

  const addLane = async () => {
    const name = (newLane ?? "").trim();
    setNewLane(null);
    if (!name) return;
    const r = await updateProperty(property, { options: [...property.options, { name }] });
    if (r.error !== null) setNotice("Couldn’t add that column.");
  };

  return (
    <>
      <p id={hintId} className="sr-only">
        Alt and the left or right arrow move a card to the next column.
      </p>
      <div className="r2-board" aria-label={`${view.name}, by ${property.name}`} role="group">
        {lanes.map((lane, at) => (
          <section
            key={laneKey(lane)}
            className="r2-lane"
            aria-label={lane.name}
            data-empty-lane={lane.optionId === null || undefined}
            data-over={over === laneKey(lane) || undefined}
            onDragOver={(e: DragEvent) => {
              if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (over !== laneKey(lane)) setOver(laneKey(lane));
            }}
            onDragLeave={(e: DragEvent) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver((o) => (o === laneKey(lane) ? null : o));
            }}
            onDrop={(e: DragEvent) => {
              const raw = e.dataTransfer.getData(DRAG_TYPE);
              setOver(null);
              if (!raw) return;
              e.preventDefault();
              const { id, from } = JSON.parse(raw) as { id: string; from: string | null };
              void move(id, from, lane);
            }}
          >
            <header className="r2-lane-head">
              {lane.optionId === null || property.type === "relationship" ? (
                <span className="r2-lane-name">{lane.name}</span>
              ) : (
                <span className="r2-lane-name">
                  <OptionNames property={property} names={[lane.name]} />
                </span>
              )}
              <span className="r2-lane-count">{lane.entryIds.length}</span>
            </header>
            <ul className="r2-lane-cards">
              {lane.entryIds.map((id) => {
                const item = presenter.label(id);
                if (!item) return null;
                const line = [
                  ...(item.context ? [item.context] : []),
                  ...valueLine(cardProperties, values, id, titleOf),
                ];
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className="r2-card"
                      data-entry-open=""
                      data-board-entry={id}
                      data-board-lane={lane.optionId ?? ""}
                      data-unnamed={!item.named || undefined}
                      aria-describedby={hintId}
                      draggable
                      onDragStart={(ev) => {
                        ev.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ id, from: lane.optionId }));
                        ev.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => setOver(null)}
                      {...open(id)}
                      onKeyDown={(ev) => onCardKey(ev, id, at)}
                    >
                      <span className="r2-card-title">
                        <ItemNumber number={item.number} />
                        {item.title}
                      </span>
                      {line.length > 0 && <span className="r2-card-meta">{line.join(" · ")}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
            {addToCollection && (
              <button
                type="button"
                className="r2-lane-add"
                disabled={busy}
                aria-label={`New entry in ${lane.name}`}
                onClick={() =>
                  void add(
                    lane.optionId === null
                      ? undefined
                      : { propertyId: property.id, value: property.type === "relationship" ? [lane.optionId] : lane.optionId }
                  )
                }
              >
                <Plus size={13} strokeWidth={1.75} aria-hidden />
                New
              </button>
            )}
          </section>
        ))}
        {isChoiceType(property.type) && (
          <div className="r2-lane r2-lane--new">
            {newLane === null ? (
              <button type="button" className="r2-lane-add" onClick={() => setNewLane("")}>
                <Plus size={13} strokeWidth={1.75} aria-hidden />
                Add a column
              </button>
            ) : (
              <input
                autoFocus
                className="r2-lane-input"
                aria-label={`New ${property.name} option`}
                placeholder={`New ${property.type === "status" ? "status" : "option"}…`}
                maxLength={100}
                value={newLane}
                onChange={(e) => setNewLane(e.target.value)}
                onBlur={() => void addLane()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  else if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    setNewLane(null);
                  }
                }}
              />
            )}
          </div>
        )}
      </div>
      {(notice || addNotice) && (
        <p role="status" className="r2-doc-note">
          {notice ?? addNotice}
        </p>
      )}
    </>
  );
}
