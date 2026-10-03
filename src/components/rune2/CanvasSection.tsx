"use client";

import { memo, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { CanvasItem } from "@/lib/types";

// A Section (Milestone 22B): a quiet region of the Canvas with a title —
// "Nerai Arc", "Act II Problems" — that holds placements so a large board
// stays legible. It is Canvas-local: a Scene in it is still just a Scene,
// moving a card into it changes nothing of the book. Its title strip is
// what the writer takes hold of (select, drag — its members come along);
// its body is open ground: a press there starts a marquee like the
// background, a click selects the Section. Sections sit in their own layer
// beneath every card.

export const SECTION_HEAD = 34;

export const CanvasSection = memo(function CanvasSection({
  item,
  selected,
  renaming,
  count,
  onPointerDown,
  onHeadDoubleClick,
  onRename,
}: {
  item: CanvasItem;
  selected: boolean;
  /** Whether the title is being edited. */
  renaming: boolean;
  /** How many placements it holds. */
  count: number;
  onPointerDown: (item: CanvasItem, e: ReactPointerEvent<HTMLDivElement>) => void;
  onHeadDoubleClick: (item: CanvasItem) => void;
  /** The rename ends: null keeps the title; a string (blank: untitled) sets it. */
  onRename: (id: string, title: string | null) => void;
}) {
  return (
    <div
      className="r2-canvas-section"
      style={{ transform: `translate(${item.x}px, ${item.y}px)`, width: item.width, height: item.height, zIndex: item.z }}
      data-item={item.id}
      data-section
      data-selected={selected || undefined}
      role="group"
      aria-label={item.label ? `Section: ${item.label}` : "Untitled section"}
    >
      <div
        className="r2-canvas-section-head"
        onPointerDown={(e) => {
          if (renaming) return;
          onPointerDown(item, e);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (!renaming) onHeadDoubleClick(item);
        }}
      >
        {renaming ? (
          <SectionTitleField id={item.id} title={item.label} onDone={onRename} />
        ) : (
          <>
            <span className="r2-canvas-section-title" data-unnamed={!item.label || undefined}>
              {item.label ?? "Untitled section"}
            </span>
            {count > 0 && <span className="r2-canvas-section-count">{count}</span>}
          </>
        )}
      </div>
    </div>
  );
});

function SectionTitleField({ id, title, onDone }: { id: string; title: string | null; onDone: (id: string, title: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(title ?? "");
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    onDone(id, commit ? value : null);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      finish(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      finish(false);
    }
  };
  return (
    <input
      ref={ref}
      className="r2-canvas-section-field"
      aria-label="Section title"
      placeholder="Untitled section"
      maxLength={200}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => finish(true)}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}
