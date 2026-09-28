"use client";

import { useEffect, useId, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
import { Plus } from "lucide-react";
import { valueKey, valueLine } from "@/lib/rune2/collectionProperties";
import { boardLanes, groupableProperties, shownProperties, type BoardLane } from "@/lib/rune2/collectionViews";
import { describeObject } from "@/lib/rune2/references";
import type { CollectionProperty, PropertyValue, WorkspaceCollectionView } from "@/lib/types";
import { OptionNames, PropertyValueEditor } from "./PropertyFields";
import { usePropertyStore } from "./PropertyStore";
import { useRune2Selection } from "./Rune2Selection";
import { useNewEntry } from "./useNewEntry";

// The three ways a Collection View shows the same Entries (migration 027).
// Each is given the Entries already arranged (filtered, sorted) by the View,
// and reads and writes the one set of values in the property store — there is
// nothing view-specific to keep in step.
//
//   List  — the writer's list of names; under each, one muted line of the
//           View's shown properties. Never columns.
//   Table — a row per Entry: its name, then the shown properties as columns,
//           each value edited in place with the Entry's own editors.
//   Board — a lane per option of a select or status property (and one for
//           none); moving a card between lanes sets that value.

/** Open an Entry: here, or (⌘/Ctrl-click, middle click) in a tab of its own. */
function useOpenEntry() {
  const { select, openInNewTab } = useRune2Selection();
  return (id: string) => ({
    onClick: (e: MouseEvent) => (e.metaKey || e.ctrlKey ? openInNewTab(id) : select(id)),
    onAuxClick: (e: MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        openInNewTab(id);
      }
    },
  });
}

/** A Relationship target's current title, for a value line ("Drelareth"); undefined when gone. */
function useTitleOf() {
  const { index } = useRune2Selection();
  return (id: string) => describeObject(index, id)?.title;
}

/** Up/Down from one row's button to the next row's. */
function moveBetweenRows(e: KeyboardEvent<HTMLElement>, rowSelector: string) {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  const row = e.currentTarget.closest(rowSelector);
  const next = e.key === "ArrowDown" ? row?.nextElementSibling : row?.previousElementSibling;
  const target = next?.querySelector<HTMLElement>("[data-entry-open]");
  if (target) {
    e.preventDefault();
    target.focus();
  }
}

type BodyProps = {
  view: WorkspaceCollectionView;
  properties: CollectionProperty[];
  /** The View's Entries, arranged. */
  entryIds: string[];
};

// ── List ────────────────────────────────────────────────────────────────────

export function ListView({ collectionTitle, view, properties, entryIds }: BodyProps & { collectionTitle: string }) {
  const { index } = useRune2Selection();
  const { values } = usePropertyStore();
  const open = useOpenEntry();
  const titleOf = useTitleOf();
  const shown = shownProperties(view, properties);
  if (entryIds.length === 0) return null;
  return (
    <ul className="r2-entry-list" aria-label={`Entries in ${collectionTitle}`}>
      {entryIds.map((id) => {
        const e = index.get(id);
        if (!e) return null;
        const line = valueLine(shown, values, id, titleOf);
        return (
          <li key={id}>
            <button
              type="button"
              className="r2-entry-row"
              data-entry-open=""
              data-unnamed={!e.named || undefined}
              {...open(id)}
              onKeyDown={(ev) => moveBetweenRows(ev, "li")}
            >
              <span className="r2-entry-row-title">{e.title}</span>
              {line.length > 0 && <span className="r2-entry-row-meta">{line.join(" · ")}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ── Table ───────────────────────────────────────────────────────────────────

export function TableView({ collectionTitle, view, properties, entryIds }: BodyProps & { collectionTitle: string }) {
  const { index } = useRune2Selection();
  const { values, setValue } = usePropertyStore();
  const open = useOpenEntry();
  const tableId = useId();
  const [notice, setNotice] = useState<string | null>(null);
  const shown = shownProperties(view, properties);
  const sort = view.config.sort;

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
        <table className="r2-table" aria-label={`${view.name} — ${collectionTitle}`}>
          <thead>
            <tr>
              <th scope="col" id={colId("title")} className="r2-table-title-col">
                Name{sortMark("title")}
              </th>
              {shown.map((p) => (
                <th key={p.id} scope="col" id={colId(p.id)} data-type={p.type}>
                  {p.name}
                  {sortMark(p.id)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entryIds.map((id) => {
              const e = index.get(id);
              if (!e) return null;
              return (
                <tr key={id}>
                  <th scope="row" id={rowId(id)} className="r2-table-title">
                    <button
                      type="button"
                      data-entry-open=""
                      data-unnamed={!e.named || undefined}
                      {...open(id)}
                      onKeyDown={(ev) => moveBetweenRows(ev, "tr")}
                    >
                      {e.title}
                    </button>
                  </th>
                  {shown.map((p) => (
                    <td key={p.id} data-type={p.type} className="r2-prop-value">
                      <PropertyValueEditor
                        property={p}
                        value={values.get(valueKey(id, p.id))}
                        labelId={`${colId(p.id)} ${rowId(id)}`}
                        floating
                        ownerId={id}
                        onSave={async (next) => {
                          const error = await setValue(id, p.id, next);
                          if (error) setNotice(`“${p.name}” couldn’t be saved.`);
                        }}
                      />
                    </td>
                  ))}
                </tr>
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

// ── Board ───────────────────────────────────────────────────────────────────

const DRAG_TYPE = "application/x-rune-entry";

export function BoardView({
  collectionId,
  view,
  properties,
  entryIds,
  onChooseGrouping,
}: BodyProps & { collectionId: string; onChooseGrouping: () => void }) {
  const { index } = useRune2Selection();
  const { values, setValue, createProperty, updateProperty } = usePropertyStore();
  const open = useOpenEntry();
  const titleOf = useTitleOf();
  const hintId = useId();
  const { add, busy, notice: addNotice } = useNewEntry(collectionId);
  const [notice, setNotice] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [newLane, setNewLane] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const board = boardLanes(view, properties, values, entryIds);

  if (!board) {
    const groupable = groupableProperties(properties);
    return (
      <div className="r2-board-setup">
        <p>A board sorts entries into columns by a Status or Select property.</p>
        {groupable.length > 0 ? (
          <button type="button" className="r2-button" onClick={onChooseGrouping}>
            Choose a property
          </button>
        ) : (
          <button
            type="button"
            className="r2-button"
            onClick={async () => {
              // The new property becomes this Board's grouping (027's trigger).
              const e = await createProperty(collectionId, properties.some((p) => p.name.toLowerCase() === "status") ? "Stage" : "Status", "status");
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

  /** Moves an Entry to a lane: sets (or, for the empty lane, clears) the grouping value. */
  const move = async (entryId: string, lane: BoardLane) => {
    const current = values.get(valueKey(entryId, property.id));
    const inLane = lane.optionId === null ? !lanes.slice(1).some((l) => l.optionId === current) : current === lane.optionId;
    if (inLane) return;
    const error = await setValue(entryId, property.id, lane.optionId as PropertyValue | null);
    if (error) setNotice(`“${index.get(entryId)?.title ?? "The entry"}” couldn’t be moved.`);
  };

  const focusCard = (entryId: string) =>
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`[data-board-entry="${CSS.escape(entryId)}"]`)?.focus()
    );

  const onCardKey = (e: KeyboardEvent<HTMLButtonElement>, entryId: string, at: number) => {
    if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      const target = lanes[at + (e.key === "ArrowLeft" ? -1 : 1)];
      if (!target) return;
      e.preventDefault();
      void move(entryId, target);
      focusCard(entryId);
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
        Alt and the left or right arrow move an entry to the next column.
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
              const id = e.dataTransfer.getData(DRAG_TYPE);
              setOver(null);
              if (!id) return;
              e.preventDefault();
              void move(id, lane);
            }}
          >
            <header className="r2-lane-head">
              {lane.optionId === null ? (
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
                const e = index.get(id);
                if (!e) return null;
                const line = valueLine(cardProperties, values, id, titleOf);
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className="r2-card"
                      data-entry-open=""
                      data-board-entry={id}
                      data-unnamed={!e.named || undefined}
                      aria-describedby={hintId}
                      draggable
                      onDragStart={(ev) => {
                        ev.dataTransfer.setData(DRAG_TYPE, id);
                        ev.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => setOver(null)}
                      {...open(id)}
                      onKeyDown={(ev) => onCardKey(ev, id, at)}
                    >
                      <span className="r2-card-title">{e.title}</span>
                      {line.length > 0 && <span className="r2-card-meta">{line.join(" · ")}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              className="r2-lane-add"
              disabled={busy}
              aria-label={`New entry in ${lane.name}`}
              onClick={() =>
                void add(lane.optionId === null ? undefined : { propertyId: property.id, value: lane.optionId })
              }
            >
              <Plus size={13} strokeWidth={1.75} aria-hidden />
              New
            </button>
          </section>
        ))}
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
      </div>
      {(notice || addNotice) && (
        <p role="status" className="r2-doc-note">
          {notice ?? addNotice}
        </p>
      )}
    </>
  );
}
