"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { ICON } from "./icons";
import type { CanvasTargetType } from "@/lib/types";
import { PLACEABLE_SEARCH_KINDS, PLACEMENT_BY_SEARCH_KIND } from "@/lib/rune2/canvas";
import { SEARCH_KIND_LABEL, searchObjects, searchProject, type SearchObject } from "@/lib/rune2/projectSearch";
import { useRune2Selection } from "./Rune2Selection";

// "Add to canvas": find an existing Scene, Chapter, Page, Entry or Canvas of
// this Project and place it. Project Search's own matching and ranking
// (lib/rune2/projectSearch.ts) narrowed to what a Canvas can show, by current
// titles, with a quiet word on where each lives — never a form, never a
// second index. It only chooses among canonical objects; placing one never
// creates, renames or copies anything.

// What can be placed is one rule (lib/rune2/canvas.ts), shared with the navigator's drags and the surface's drop.
const KINDS = PLACEABLE_SEARCH_KINDS;
const PLACEMENT = PLACEMENT_BY_SEARCH_KIND;
const SHOWN = 60;

export type InsertChoice = { type: CanvasTargetType; id: string; title: string };

export function CanvasInsert({
  canvasId,
  onChoose,
  onClose,
}: {
  /** The Canvas itself is never offered (a Canvas never links to itself). */
  canvasId: string;
  onChoose: (choice: InsertChoice) => void;
  onClose: () => void;
}) {
  const { index } = useRune2Selection();
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  // Close on a press outside.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [onClose]);

  const objects = useMemo(
    () => searchObjects(index).filter((o) => KINDS.includes(o.kind) && o.id !== canvasId),
    [index, canvasId]
  );
  const matches: SearchObject[] = query.trim()
    ? searchProject(objects, query, { kinds: KINDS, exclude: new Set([canvasId]) })
    : objects;
  const shown = matches.slice(0, SHOWN);
  const at = Math.min(active, Math.max(shown.length - 1, 0));

  const choose = (o: SearchObject) => {
    const type = PLACEMENT[o.kind];
    if (type) onChoose({ type, id: o.id, title: o.title });
  };

  return (
    <div ref={ref} className="r2-popover r2-canvas-insert" role="dialog" aria-label="Add to canvas">
      <div className="r2-canvas-insert-field">
        <Search {...ICON} aria-hidden />
        <input
          autoFocus
          className="r2-field r2-prop-picker-input"
          placeholder="Add a scene, chapter, page, entry or canvas…"
          aria-label="Find something to add to this canvas"
          aria-controls={listId}
          aria-activedescendant={shown.length ? `${listId}-${at}` : undefined}
          maxLength={200}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, Math.max(shown.length - 1, 0)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (shown[at]) choose(shown[at]);
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
      <ul id={listId} role="listbox" className="r2-prop-picker-list r2-canvas-insert-list">
        {shown.map((o, i) => (
          <li
            key={o.id}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === at}
            data-active={i === at || undefined}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => choose(o)}
            onPointerEnter={() => setActive(i)}
          >
            <span className="r2-object-picker-title">{o.title}</span>
            <span className="r2-object-picker-hint">
              {SEARCH_KIND_LABEL[o.kind]} · {o.context}
            </span>
          </li>
        ))}
      </ul>
      {shown.length === 0 && (
        <p className="r2-prop-picker-empty">{objects.length === 0 ? "Nothing to add yet." : "Nothing matches."}</p>
      )}
    </div>
  );
}
