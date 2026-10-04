"use client";

import { memo, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ArrowUpRight, ImageOff } from "lucide-react";
import { ICON_SM } from "./icons";
import { getCanvasPreview } from "@/lib/actions/workspaceCanvas";
import { attachmentUrl, cardVariant } from "@/lib/rune2/attachments";
import { ITEM_LABEL, noteText, noteTitle, targetIdOf } from "@/lib/rune2/canvas";
import type { NavEntry } from "@/lib/rune2/navigatorModel";
import type { CanvasItem, WorkspaceAttachment } from "@/lib/types";

// One placement as the Canvas shows it: a compact preview of a live Rune
// object — enough to know it (its kind, where it lives, its title, a line or
// two of its text) and never an editor — a Canvas-local note, edited in
// place, or an image (M22C: one of the Project's attachments, framed, never
// edited here). Everything a live card says is read from the shell's index at
// render (the current title, the Chapter a Scene is in now, a Page's
// Folders), so a rename or a move elsewhere shows here at once; the text
// preview is read from the object's current content and re-read when that
// content changes. Nothing is copied into the placement but its fallback
// label.
//
// A card's size is its own (M22B): width and height as stored, whatever its
// object's text does — the preview is cut to the card and fades out. A note
// alone grows while it is first typed into (onNoteGrow → the session, until
// the writer sizes it by hand); past that, its text scrolls. An image fills
// its card (the surface keeps the card's proportions as it is resized).
//
// A card whose object isn't in the index is UNAVAILABLE: in Trash (a
// permanent deletion removes the placement itself, so this never means
// "gone"). It keeps its place, says what it was, and resolves again when the
// object is restored. A STRANDED card is one this server refused to save
// (M22C): still here, still the writer's, waiting for a reloaded Rune.

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

export type CardMenuRequest = (item: CanvasItem, at: { x: number; y: number }) => void;

export const CanvasCard = memo(function CanvasCard({
  item,
  target,
  attachment,
  contentKey,
  selected,
  editing,
  stranded,
  setEl,
  onPointerDown,
  onDoubleClick,
  onMenu,
  onNoteChange,
  onNoteGrow,
  onNoteDone,
}: {
  item: CanvasItem;
  /** The object this placement shows, from the shell's index — undefined when unavailable; null for a note or an image. */
  target: NavEntry | null | undefined;
  /** An image's attachment (undefined when unknown or gone). */
  attachment?: WorkspaceAttachment;
  /** Changes when the target's content may have changed (its version or updated_at). */
  contentKey: string;
  selected: boolean;
  editing: boolean;
  /** This server refused to save it; it waits for a reloaded Rune. */
  stranded?: boolean;
  setEl: CardSetEl;
  onPointerDown: (item: CanvasItem, e: ReactPointerEvent<HTMLDivElement>) => void;
  onDoubleClick: (item: CanvasItem) => void;
  /** A right-click (or the keyboard's menu) on the card. */
  onMenu: CardMenuRequest;
  onNoteChange: (id: string, text: string) => void;
  /** A note's text wants this much height (world units); the session decides whether the note grows. */
  onNoteGrow: (id: string, height: number) => void;
  /** The edit ended; `refocus`: the writer left by the keyboard, so the board should take focus back. */
  onNoteDone: (id: string, refocus: boolean) => void;
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
    "data-stranded": stranded || undefined,
    tabIndex: -1,
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => onPointerDown(item, e),
    onDoubleClick: () => onDoubleClick(item),
    onContextMenu: (e: ReactMouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      onMenu(item, { x: e.clientX, y: e.clientY });
    },
  };
  const strandedTag = stranded ? <p className="r2-canvas-card-stranded">Not saved</p> : null;

  if (type === "note") {
    const text = noteText(item.content);
    const name = noteTitle(text, 60);
    return (
      <div {...common} data-editing={editing || undefined} role="group" aria-label={name ? `Note: ${name}` : "Empty note"}>
        {strandedTag}
        <NoteBody id={item.id} text={text} editing={editing} onChange={onNoteChange} onGrow={onNoteGrow} onDone={onNoteDone} />
      </div>
    );
  }

  if (type === "image") {
    const name = item.label ?? attachment?.file_name ?? "Image";
    return (
      <div {...common} role="group" aria-label={`Image: ${name}`}>
        {strandedTag}
        {attachment ? <ImageBody attachment={attachment} alt={name} /> : <ImageFallback name={name} />}
      </div>
    );
  }

  if (!target) {
    return (
      <div {...common} data-unavailable role="group" aria-label={`${ITEM_LABEL[type]} in Trash: ${item.label ?? `Untitled ${ITEM_LABEL[type].toLowerCase()}`}`}>
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
      {strandedTag}
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

/**
 * An image's picture: the display derivative when there is one (a large
 * original is never decoded for a card), filling the card, lazily. If the
 * bytes can't be fetched (swept, or offline before ever seen), it says so
 * quietly in place of the picture.
 */
function ImageBody({ attachment, alt }: { attachment: WorkspaceAttachment; alt: string }) {
  const [failed, setFailed] = useState(false);
  const src = attachmentUrl(attachment.id, cardVariant(attachment));
  if (failed) return <ImageFallback name={alt} />;
  return (
    // Not next/image: the bytes are served under the writer's own session (the optimizer has none), and the card shows a display-sized derivative already.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="r2-canvas-image"
      src={src}
      alt={alt}
      width={attachment.display_width ?? attachment.width ?? undefined}
      height={attachment.display_height ?? attachment.height ?? undefined}
      draggable={false}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

function ImageFallback({ name }: { name: string }) {
  return (
    <div className="r2-canvas-image-missing">
      <ImageOff {...ICON_SM} aria-hidden />
      <span>
        <span className="r2-canvas-card-title">{name}</span>
        <span className="r2-canvas-card-meta">Image unavailable</span>
      </span>
    </div>
  );
}

/** The note card's padding, top and bottom together (rune2.css .r2-canvas-card--note). */
const NOTE_PADDING = 16;

/**
 * A note's text: a plain textarea filling its card. Read-only until the note
 * is opened for editing (a double-click, Enter); then it takes focus with the
 * caret at the end. While editing, the text's height is reported so the note
 * can grow with it, and every press inside it is the textarea's own — a
 * drag selects text, never moves the card. Escape or leaving the note ends
 * the edit (one undo entry); Escape hands focus back to the board.
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
  onDone: (id: string, refocus: boolean) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // Whether the edit ended by the keyboard (Escape), so the blur that follows hands focus to the board.
  const leaving = useRef(false);

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
    leaving.current = false;
    el.focus({ preventScroll: true });
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
      // Checked only while editing, and then as the writer chose (inherited from the shell).
      spellCheck={editing ? undefined : false}
      onChange={(e) => onChange(id, e.target.value)}
      onBlur={() => {
        if (!editing) return;
        const byKeyboard = leaving.current;
        leaving.current = false;
        onDone(id, byKeyboard);
      }}
      onPointerDown={(e) => {
        // The textarea's own press: a caret, a text selection — never the board's drag.
        if (editing) e.stopPropagation();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          leaving.current = true;
          e.currentTarget.blur();
        } else if (editing) {
          // Typing never reaches the Canvas's shortcuts (Delete, ⌘Z, arrows).
          e.stopPropagation();
        }
      }}
    />
  );
}
