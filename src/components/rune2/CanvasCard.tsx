"use client";

import { memo, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { ICON_SM } from "./icons";
import { getCanvasPreview } from "@/lib/actions/workspaceCanvas";
import { ITEM_LABEL, noteText, targetIdOf } from "@/lib/rune2/canvas";
import type { NavEntry } from "@/lib/rune2/navigatorModel";
import type { CanvasItem } from "@/lib/types";

// One placement as the Canvas shows it: a compact preview of a live Rune
// object — enough to know it (its kind, where it lives, its title, a line or
// two of its text) and never an editor — or a Canvas-local note, edited in
// place. Everything a live card says is read from the shell's index at render
// (the current title, the Chapter a Scene is in now, a Page's Folders), so a
// rename or a move elsewhere shows here at once; the text preview is read
// from the object's current content and re-read when that content changes.
// Nothing is copied into the placement but its fallback label.
//
// A card's size is its own (M22B): width and height as stored, whatever its
// object's text does — the preview is cut to the card and fades out. A note
// alone grows while it is first typed into (onNoteGrow → the session, until
// the writer sizes it by hand); past that, its text scrolls.
//
// A card whose object isn't in the index is UNAVAILABLE: in Trash (a
// permanent deletion removes the placement itself, so this never means
// "gone"). It keeps its place, says what it was, and resolves again when the
// object is restored.

export type CardSetEl = (id: string, el: HTMLDivElement | null) => void;

function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

// Previews by object and the version of its content they were taken at, for
// the life of the page: a card remounting (a tab switch) shows at once.
const previews = new Map<string, string>();

function usePreview(type: "scene" | "page" | "entry" | null, id: string | null, contentKey: string): string | null {
  const key = type && id ? `${type}:${id}:${contentKey}` : null;
  const [, rerender] = useState(0);
  useEffect(() => {
    if (!key || previews.has(key)) return;
    let live = true;
    void getCanvasPreview(type!, id!).then((r) => {
      if (!live) return;
      previews.set(key, r.error === null ? r.data.text : "");
      rerender((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, [key, type, id]);
  return key ? (previews.get(key) ?? null) : null;
}

export const CanvasCard = memo(function CanvasCard({
  item,
  target,
  contentKey,
  selected,
  editing,
  setEl,
  onPointerDown,
  onDoubleClick,
  onNoteChange,
  onNoteGrow,
  onNoteDone,
}: {
  item: CanvasItem;
  /** The object this placement shows, from the shell's index — undefined when unavailable; null for a note. */
  target: NavEntry | null | undefined;
  /** Changes when the target's content may have changed (its version or updated_at). */
  contentKey: string;
  selected: boolean;
  editing: boolean;
  setEl: CardSetEl;
  onPointerDown: (item: CanvasItem, e: ReactPointerEvent<HTMLDivElement>) => void;
  onDoubleClick: (item: CanvasItem) => void;
  onNoteChange: (id: string, text: string) => void;
  /** A note's text wants this much height (world units); the session decides whether the note grows. */
  onNoteGrow: (id: string, height: number) => void;
  onNoteDone: (id: string) => void;
}) {
  const type = item.item_type;
  const previewType = type === "scene" || type === "page" || type === "entry" ? type : null;
  const preview = usePreview(target ? previewType : null, targetIdOf(item), contentKey);

  const style = { transform: `translate(${item.x}px, ${item.y}px)`, width: item.width, height: item.height, zIndex: item.z + 1 };
  const common = {
    ref: (el: HTMLDivElement | null) => setEl(item.id, el),
    className: `r2-canvas-card r2-canvas-card--${type}`,
    style,
    "data-item": item.id,
    "data-selected": selected || undefined,
    tabIndex: -1,
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => onPointerDown(item, e),
    onDoubleClick: () => onDoubleClick(item),
  };

  if (type === "note") {
    return (
      <div {...common} data-editing={editing || undefined} role="group" aria-label="Note">
        <NoteBody
          id={item.id}
          text={noteText(item.content)}
          editing={editing}
          onChange={onNoteChange}
          onGrow={onNoteGrow}
          onDone={onNoteDone}
        />
      </div>
    );
  }

  if (!target) {
    return (
      <div {...common} data-unavailable role="group" aria-label={`${ITEM_LABEL[type]} in Trash`}>
        <p className="r2-canvas-card-eyebrow">{ITEM_LABEL[type]}</p>
        <p className="r2-canvas-card-title">{item.label ?? `Untitled ${ITEM_LABEL[type].toLowerCase()}`}</p>
        <p className="r2-canvas-card-meta">In Trash</p>
      </div>
    );
  }

  let eyebrow: ReactNode = ITEM_LABEL[type];
  let meta: string | null = null;
  switch (type) {
    case "scene": {
      const chapter = target.kind === "scene" ? target.path[target.path.length - 1]?.title : null;
      eyebrow = `Scene · ${chapter ?? "Unplaced"}`;
      meta = plural(target.words, "word");
      break;
    }
    case "chapter":
      eyebrow = target.path.length ? `Chapter · ${target.path.map((p) => p.title).join(" / ")}` : "Chapter";
      meta = `${plural(target.childCount, "scene")} · ${plural(target.words, "word")}`;
      break;
    case "page":
      eyebrow = target.path.length ? `Page · ${target.path.map((p) => p.title).join(" / ")}` : "Page";
      break;
    case "entry":
      eyebrow = target.path[target.path.length - 1]?.title ?? "Entry";
      break;
    case "canvas":
      eyebrow = "Canvas";
      break;
  }

  return (
    <div {...common} role="group" aria-label={`${ITEM_LABEL[type]}: ${target.title}`}>
      <p className="r2-canvas-card-eyebrow">{eyebrow}</p>
      <p className="r2-canvas-card-title" data-unnamed={!target.named || undefined}>
        {target.title}
      </p>
      {meta && <p className="r2-canvas-card-meta">{meta}</p>}
      {preview && <p className="r2-canvas-card-preview">{preview}</p>}
      {type === "canvas" && (
        <p className="r2-canvas-card-hint">
          <ArrowUpRight {...ICON_SM} aria-hidden />
          Opens canvas
        </p>
      )}
    </div>
  );
});

/** The note card's padding, top and bottom together (rune2.css .r2-canvas-card--note). */
const NOTE_PADDING = 16;

/**
 * A note's text: a plain textarea filling its card. Read-only until the note
 * is opened for editing (a double-click, Enter); then it takes focus. While
 * editing, the text's height is reported so the note can grow with it.
 * Escape or leaving the note ends the edit (one undo entry).
 */
function NoteBody({
  id,
  text,
  editing,
  onChange,
  onGrow,
  onDone,
}: {
  id: string;
  text: string;
  editing: boolean;
  onChange: (id: string, text: string) => void;
  onGrow: (id: string, height: number) => void;
  onDone: (id: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) return;
    const el = ref.current;
    if (!el) return;
    onGrow(id, el.scrollHeight + NOTE_PADDING);
  }, [text, editing, id, onGrow]);

  useEffect(() => {
    if (!editing) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  return (
    <textarea
      ref={ref}
      className="r2-canvas-note"
      aria-label="Note text"
      placeholder="Note"
      rows={1}
      readOnly={!editing}
      tabIndex={editing ? 0 : -1}
      value={text}
      spellCheck={editing}
      onChange={(e) => onChange(id, e.target.value)}
      onBlur={() => editing && onDone(id)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          e.currentTarget.blur();
        } else if (editing) {
          // Typing never reaches the Canvas's shortcuts (Delete, ⌘Z, arrows).
          e.stopPropagation();
        }
      }}
    />
  );
}
