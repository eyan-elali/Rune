import { ANCHOR_CONTEXT, ANCHOR_TEXT_MAX, type NoteAnchor } from "@/lib/rune2/noteAnchors";

// The reading surface's side of anchors (noteAnchors.ts): the plain text of a
// rendered Scene (ProseSnapshot), measured exactly as proseText measures the
// stored document — text nodes in order, a line break after each paragraph,
// heading and code block and for each <br> — so an offset taken here is an
// offset there, and back. DOM only, no React, nothing written anywhere.

type Segment = { node: Text; start: number };

/** A line-ending block, as proseText counts them. */
const LINE_TAGS = new Set(["P", "H1", "H2", "H3", "PRE"]);

/** The plain text of a rendered Scene, and where each text node sits in it. */
export function readPlain(root: Element): { text: string; segments: Segment[] } {
  let text = "";
  const segments: Segment[] = [];
  const walk = (el: Node) => {
    if (el.nodeType === Node.TEXT_NODE) {
      segments.push({ node: el as Text, start: text.length });
      text += (el as Text).data;
      return;
    }
    if (el.nodeType !== Node.ELEMENT_NODE) return;
    const tag = (el as Element).tagName;
    if (tag === "BR") {
      text += "\n";
      return;
    }
    for (const child of Array.from(el.childNodes)) walk(child);
    if (LINE_TAGS.has(tag)) text += "\n";
  };
  walk(root);
  return { text, segments };
}

/** A DOM Range over the plain-text offsets `from`–`to` of `root`, or null when they fall outside its text. */
export function rangeFor(root: Element, segments: Segment[], from: number, to: number): Range | null {
  const at = (offset: number, end: boolean): [Text, number] | null => {
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i];
      const length = seg.node.data.length;
      // An end offset at a node's end belongs to that node; a start offset at it belongs to the next.
      if (offset > seg.start && offset <= seg.start + length) return [seg.node, offset - seg.start];
      if (offset === seg.start && (!end || length === 0)) return [seg.node, 0];
    }
    return null;
  };
  const start = at(from, false);
  const finish = at(to, true);
  if (!start || !finish) return null;
  const range = root.ownerDocument.createRange();
  range.setStart(start[0], start[1]);
  range.setEnd(finish[0], finish[1]);
  return range;
}

/**
 * The plain-text offsets of a selection inside `root`, trimmed to the text
 * with a word in it; null when the selection is empty, spans outside the
 * root, or is too long to anchor.
 */
export function selectionOffsets(root: Element, segments: Segment[], text: string, range: Range): { from: number; to: number } | null {
  const offsetOf = (container: Node, offset: number, end: boolean): number | null => {
    if (container.nodeType === Node.TEXT_NODE) {
      const seg = segments.find((s) => s.node === container);
      return seg ? seg.start + offset : null;
    }
    // A boundary between elements: the start of the next text node inside (or the end of the last before it).
    const children = Array.from(container.childNodes);
    const probe = (node: Node | undefined): Text | null => {
      if (!node) return null;
      if (node.nodeType === Node.TEXT_NODE) return node as Text;
      const walker = node.ownerDocument!.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      return walker.nextNode() as Text | null;
    };
    const after = probe(children[offset]);
    if (after) {
      const seg = segments.find((s) => s.node === after);
      return seg ? seg.start : null;
    }
    if (end) return text.length;
    return null;
  };
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const from = offsetOf(range.startContainer, range.startOffset, false);
  const to = offsetOf(range.endContainer, range.endOffset, true);
  if (from === null || to === null || to <= from) return null;
  if (to - from > ANCHOR_TEXT_MAX + 2 * ANCHOR_CONTEXT) return null;
  return { from, to };
}

/** The passage's rectangles, relative to `relativeTo`'s top-left (the reading column). */
export function rangeBox(range: Range, relativeTo: Element): { top: number; bottom: number } | null {
  const rects = Array.from(range.getClientRects());
  if (rects.length === 0) return null;
  const base = relativeTo.getBoundingClientRect();
  const top = Math.min(...rects.map((r) => r.top)) - base.top;
  const bottom = Math.max(...rects.map((r) => r.bottom)) - base.top;
  return { top, bottom };
}

/** Whether the browser can paint a highlight without touching the DOM (the CSS Custom Highlight API). */
export function canHighlight(): boolean {
  return typeof CSS !== "undefined" && "highlights" in CSS && typeof (globalThis as { Highlight?: unknown }).Highlight === "function";
}

export const HIGHLIGHT_NAME = "r2-anchor";

/** Paints `range` as the active passage (or clears it, for null). Never a mark in the document. */
export function setActiveHighlight(range: Range | null) {
  if (!canHighlight()) return;
  const highlights = (CSS as unknown as { highlights: Map<string, unknown> & { delete(name: string): boolean; set(name: string, h: unknown): void } }).highlights;
  if (!range) {
    highlights.delete(HIGHLIGHT_NAME);
    return;
  }
  const HighlightCtor = (globalThis as unknown as { Highlight: new (...ranges: Range[]) => unknown }).Highlight;
  highlights.set(HIGHLIGHT_NAME, new HighlightCtor(range));
}

export type { NoteAnchor };
