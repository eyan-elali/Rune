// Chapter-wide selection (Pre-Beta Trust Audit, C/D): the model behind
// selecting and copying a Chapter as one document when, underneath, each of
// its Scenes is its own editor.
//
// Why a model at all. A browser confines a selection that starts inside an
// editable region to that region (the editing host), and WebKit adjusts even
// programmatic selections so they never cross one. With one editor per Scene
// (architecture §7) there is therefore no native selection that can run from
// Scene 2 into Scene 4. Rune keeps the writer's experience of one continuous
// Chapter another way: ONE Scene — the one the pointer or ⌘A started in —
// holds a real native selection, every other Scene in the range paints the
// same highlight as an inline decoration, and copying serialises the whole
// range in manuscript order from the Scenes' own documents. Nothing here
// touches a document: a Chapter selection is read-only presentation, never a
// merge, a save or an edit. Editing keys collapse it; copying serialises it.
//
// Pure of the DOM: positions are Scene index + ProseMirror position, so the
// range arithmetic and the clipboard text can be tested without a browser.
// The controller that reads pointer and keyboard events lives in
// components/rune2/ChapterSelection.tsx.

import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { DOMSerializer } from "@tiptap/pm/model";

/** A point in the Chapter: which Scene (in shown order) and where in its document. */
export type ScenePoint = { index: number; pos: number };

export type ChapterRange = {
  anchor: ScenePoint;
  head: ScenePoint;
  /** Whether the Chapter's title is part of the selection. */
  title: boolean;
};

export type SceneSpan = { from: number; to: number };

export function comparePoints(a: ScenePoint, b: ScenePoint): number {
  return a.index !== b.index ? a.index - b.index : a.pos - b.pos;
}

/** The range's ends in document order. */
export function orderedEnds(range: ChapterRange): { from: ScenePoint; to: ScenePoint } {
  return comparePoints(range.anchor, range.head) <= 0
    ? { from: range.anchor, to: range.head }
    : { from: range.head, to: range.anchor };
}

export function isCollapsed(range: ChapterRange): boolean {
  return !range.title && comparePoints(range.anchor, range.head) === 0;
}

/** The whole Chapter: its title and every Scene, first character to last. */
export function wholeChapter(sizes: readonly number[]): ChapterRange {
  const last = Math.max(0, sizes.length - 1);
  return { anchor: { index: 0, pos: 0 }, head: { index: last, pos: sizes[last] ?? 0 }, title: true };
}

/**
 * What the range covers in each Scene (by shown index), given each Scene's
 * document size (`doc.content.size`): null for a Scene outside the range, a
 * span clamped to the document otherwise. An inner Scene is covered whole; an
 * empty one yields an empty span, which still counts as "in the selection".
 */
export function sceneSpans(range: ChapterRange, sizes: readonly number[]): (SceneSpan | null)[] {
  const { from, to } = orderedEnds(range);
  return sizes.map((size, i) => {
    if (i < from.index || i > to.index) return null;
    const start = i === from.index ? from.pos : 0;
    const end = i === to.index ? to.pos : size;
    return { from: clamp(start, 0, size), to: clamp(end, 0, size) };
  });
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** How many Scenes the range touches. */
export function spannedScenes(range: ChapterRange): number {
  const { from, to } = orderedEnds(range);
  return to.index - from.index + 1;
}

export type ClipboardPart = { doc: ProseMirrorNode; span: SceneSpan };

/**
 * The selection as plain text: the title (when selected), then each Scene's
 * selected text, with ProseMirror's own block separator inside a Scene and a
 * blank line between Scenes — the whitespace the Chapter shows between them.
 * Empty Scenes add nothing.
 */
export function chapterText(title: string | null, parts: readonly ClipboardPart[]): string {
  const pieces: string[] = [];
  if (title) pieces.push(title);
  for (const { doc, span } of parts) {
    const text = doc.textBetween(span.from, span.to, "\n\n");
    if (text.length > 0) pieces.push(text);
  }
  return pieces.join("\n\n");
}

/**
 * The selection as HTML, serialised from each Scene's document through the
 * editor's own schema (the same serialiser ProseMirror's copy uses), the
 * title as a heading above. `document` is the DOM the fragments are built in.
 */
export function chapterHtml(title: string | null, parts: readonly ClipboardPart[], document: Document): string {
  const container = document.createElement("div");
  if (title) {
    const h1 = document.createElement("h1");
    h1.textContent = title;
    container.appendChild(h1);
  }
  for (const { doc, span } of parts) {
    if (span.to <= span.from) continue;
    const serializer = DOMSerializer.fromSchema(doc.type.schema);
    container.appendChild(serializer.serializeFragment(doc.slice(span.from, span.to).content, { document }));
  }
  return container.innerHTML;
}

/**
 * Which key a keydown is, for a Chapter selection: what to do with it.
 *   select-all   ⌘A / Ctrl+A — select the whole Chapter
 *   copy         ⌘C / Ctrl+C — serialised by the copy event; nothing to do here
 *   collapse     Escape, or an arrow without Shift — back to a caret
 *   swallow      a key that would edit (typing, Backspace, Delete, Enter, Tab):
 *                the selection is not editable; it collapses and the key is dropped
 *   pass         anything else (⌘Z, ⌘B, F-keys…): the selection collapses and the key goes on
 */
export type ChapterKeyAction = "select-all" | "copy" | "collapse" | "swallow" | "pass";

export function chapterKeyAction(
  key: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean },
  isMac: boolean
): ChapterKeyAction {
  const mod = isMac ? key.metaKey : key.ctrlKey;
  const k = key.key.length === 1 ? key.key.toLowerCase() : key.key;
  if (mod && !key.altKey && !key.shiftKey && k === "a") return "select-all";
  if (mod && !key.altKey && !key.shiftKey && (k === "c" || k === "x")) return "copy";
  if (k === "Escape") return "collapse";
  if ((k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" || k === "ArrowDown" || k === "Home" || k === "End") && !key.shiftKey) {
    return "collapse";
  }
  // Another shortcut (⌘Z, ⌘B, Ctrl+A's line-start on a Mac…): not typing.
  if (mod || key.ctrlKey) return "pass";
  if (k === "Backspace" || k === "Delete" || k === "Enter" || k === "Tab" || key.key.length === 1) return "swallow";
  return "pass";
}
