"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { ICON } from "./icons";
import { useFloating } from "./useFloating";
import { findOnCanvas, type FindResult } from "@/lib/rune2/canvasFind";
import type { NavEntry } from "@/lib/rune2/navigatorModel";
import type { CanvasConnection, CanvasItem } from "@/lib/types";

// Find on Canvas (Milestone 22B): a small popover under the tools — type,
// and what the board holds that matches is listed: cards by their current
// title, notes by their text, Sections by their title, connections by their
// label. Arrow keys move through the results and the board follows, so the
// writer sees each one in place; Enter keeps the one in view and closes,
// Escape closes. Answered from the session's own rows, never the server.

const SHOWN = 40;

export function CanvasFind({
  items,
  connections,
  index,
  onFocus,
  onClose,
}: {
  items: CanvasItem[];
  connections: CanvasConnection[];
  index: ReadonlyMap<string, NavEntry>;
  /** Brings a result into view and selects it. */
  onFocus: (result: FindResult) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Under the Canvas toolbar, at its right; whole inside the window at any width or zoom.
  useFloating(ref, { align: "end", gap: 6 });
  const listId = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [onClose]);

  const results = useMemo(() => findOnCanvas(items, connections, index, query).slice(0, SHOWN), [items, connections, index, query]);
  const at = Math.min(active, Math.max(results.length - 1, 0));

  useEffect(() => {
    document.getElementById(`${listId}-${at}`)?.scrollIntoView({ block: "nearest" });
  }, [listId, at, results]);

  const go = (i: number) => {
    setActive(i);
    const r = results[i];
    if (r) onFocus(r);
  };

  return (
    <div ref={ref} className="r2-popover r2-canvas-insert r2-canvas-find" role="dialog" aria-label="Find on canvas">
      <div className="r2-canvas-insert-field">
        <Search {...ICON} aria-hidden />
        <input
          autoFocus
          className="r2-field r2-prop-picker-input"
          placeholder="Find on this canvas…"
          aria-label="Find on this canvas"
          aria-controls={listId}
          aria-activedescendant={results.length ? `${listId}-${at}` : undefined}
          maxLength={200}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              go(Math.min(at + 1, Math.max(results.length - 1, 0)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              go(Math.max(at - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (results[at]) {
                onFocus(results[at]);
                onClose();
              }
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            } else if (e.key === "Tab") {
              onClose();
            }
            e.stopPropagation();
          }}
        />
      </div>
      {results.length > 0 && (
        <ul id={listId} role="listbox" className="r2-prop-picker-list r2-canvas-insert-list">
          {results.map((r, i) => (
            <li
              key={r.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === at}
              data-active={i === at || undefined}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => {
                onFocus(r);
                onClose();
              }}
              onPointerEnter={() => setActive(i)}
            >
              <span className="r2-object-picker-title">{r.text || "Untitled"}</span>
              <span className="r2-object-picker-hint">{r.type}</span>
            </li>
          ))}
        </ul>
      )}
      {query.trim() !== "" && results.length === 0 && <p className="r2-prop-picker-empty">Nothing on this canvas matches.</p>}
    </div>
  );
}
