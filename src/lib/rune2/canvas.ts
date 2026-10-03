import type { CanvasItem, CanvasItemType, CanvasTargetType } from "@/lib/types";
import type { NavEntry, NavKind } from "./navigatorModel";
import type { SearchKind } from "./projectSearch";

// Rune Canvas (Milestone 22A) — the pure rules of a spatial thinking surface:
// world and screen coordinates, pan and zoom, what a marquee selects, how a
// placement is sized and named, what a note's text is, and when the writer is
// quietly warned that something is already on the Canvas. No I/O, no DOM, so
// the surface and the tests share one set of rules.
//
// A Canvas shows PLACEMENTS of the book's real pieces (lib/types.ts
// CanvasItem). A placement is Canvas-local: moving, selecting or deleting one
// changes nothing of the Scene, Chapter, Page, Entry or Canvas it shows.

// ── Coordinates ─────────────────────────────────────────────────────────────

/**
 * The view of the world: screen = world · scale + (tx, ty). A world point
 * (x, y) appears at (x·scale + tx, y·scale + ty) on the surface.
 */
export type Viewport = { tx: number; ty: number; scale: number };

export const SCALE_MIN = 0.1;
export const SCALE_MAX = 4;
export const DEFAULT_VIEWPORT: Viewport = { tx: 0, ty: 0, scale: 1 };

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale));
}

export function toWorld(vp: Viewport, screen: Point): Point {
  return { x: (screen.x - vp.tx) / vp.scale, y: (screen.y - vp.ty) / vp.scale };
}

export function toScreen(vp: Viewport, world: Point): Point {
  return { x: world.x * vp.scale + vp.tx, y: world.y * vp.scale + vp.ty };
}

export function panBy(vp: Viewport, dx: number, dy: number): Viewport {
  return { ...vp, tx: vp.tx + dx, ty: vp.ty + dy };
}

/**
 * Zooms by `factor` keeping the world point under the screen point `at`
 * exactly where it is — the pointer stays over what it was over.
 */
export function zoomAt(vp: Viewport, factor: number, at: Point): Viewport {
  const scale = clampScale(vp.scale * factor);
  if (scale === vp.scale) return vp;
  const ratio = scale / vp.scale;
  return { scale, tx: at.x - (at.x - vp.tx) * ratio, ty: at.y - (at.y - vp.ty) * ratio };
}

/** The view that shows `rect` (world) centred in a surface of `size` (screen), at `scale`. */
export function centerOn(rect: Rect, size: { width: number; height: number }, scale: number): Viewport {
  const s = clampScale(scale);
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  return { scale: s, tx: size.width / 2 - cx * s, ty: size.height / 2 - cy * s };
}

/** The smallest rect holding every rect, or null for none. */
export function boundsOf(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const r of rects) {
    x1 = Math.min(x1, r.x);
    y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x + r.width);
    y2 = Math.max(y2, r.y + r.height);
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/**
 * A view that shows everything on the Canvas with some room around it, at a
 * scale no larger than 1 (an empty Canvas: the origin at the top-left corner,
 * a breath in). The first view of a Canvas this device hasn't seen.
 */
export function fitAll(rects: readonly Rect[], size: { width: number; height: number }, padding = 64): Viewport {
  const bounds = boundsOf(rects);
  if (!bounds) return { scale: 1, tx: padding, ty: padding };
  const scale = clampScale(
    Math.min(1, (size.width - 2 * padding) / Math.max(bounds.width, 1), (size.height - 2 * padding) / Math.max(bounds.height, 1))
  );
  return centerOn(bounds, size, scale);
}

/** Whether two rects overlap (touching edges don't count). */
export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** The rect between two corners, whichever way it was dragged. */
export function rectFrom(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

/** Whether `inner` lies wholly within `outer`. */
export function contains(outer: Rect, inner: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
}

/**
 * Marquee selection: the ids of every card the marquee touches — and of
 * every Section it encloses whole (a Section is large: brushing its corner
 * while gathering the cards in it must not take the whole region along).
 */
export function marqueeSelection(items: readonly { id: string; rect: Rect; whole?: boolean }[], marquee: Rect): string[] {
  return items.filter((i) => (i.whole ? contains(marquee, i.rect) : intersects(i.rect, marquee))).map((i) => i.id);
}

/**
 * The view that shows `rect` with room around it, zoomed in no further than
 * `maxScale` — zoom to fit, zoom to selection.
 */
export function fitRect(rect: Rect, size: { width: number; height: number }, padding = 64, maxScale = 1): Viewport {
  const scale = clampScale(
    Math.min(maxScale, (size.width - 2 * padding) / Math.max(rect.width, 1), (size.height - 2 * padding) / Math.max(rect.height, 1))
  );
  return centerOn(rect, size, scale);
}

/**
 * The view that makes `rect` obvious without disorienting: if it fits on
 * screen at the current zoom, only pan it to the centre; otherwise zoom out
 * just enough to hold it (and never in past actual size).
 */
export function focusView(vp: Viewport, rect: Rect, size: { width: number; height: number }, padding = 64): Viewport {
  const fits = rect.width * vp.scale <= size.width - 2 * padding && rect.height * vp.scale <= size.height - 2 * padding;
  if (fits) return centerOn(rect, size, vp.scale);
  return fitRect(rect, size, padding, Math.max(1, vp.scale));
}

/** Whether `rect` (world) is at least partly on screen in `vp`. */
export function isInView(vp: Viewport, rect: Rect, size: { width: number; height: number }): boolean {
  const screen = { x: rect.x * vp.scale + vp.tx, y: rect.y * vp.scale + vp.ty, width: rect.width * vp.scale, height: rect.height * vp.scale };
  return intersects(screen, { x: 0, y: 0, width: size.width, height: size.height });
}

export function itemRect(item: Pick<CanvasItem, "x" | "y" | "width" | "height">): Rect {
  return { x: item.x, y: item.y, width: item.width, height: item.height };
}

/** Rounds a stored coordinate: the database keeps finite numbers; a pixel of precision is plenty. */
export function roundCoord(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Placements ──────────────────────────────────────────────────────────────

export type Size = { width: number; height: number };

/**
 * The size a new placement of each kind takes. Width and height are the
 * card's size, kept as stored (M22B): a card never grows because its Scene
 * or Page gained text — the preview is cut to the card. A note alone grows
 * while it is first typed into (see NOTE_AUTO_MAX_HEIGHT), until it is
 * resized by hand.
 */
export const DEFAULT_SIZE: Record<CanvasItemType, Size> = {
  scene: { width: 248, height: 132 },
  chapter: { width: 248, height: 96 },
  page: { width: 248, height: 132 },
  entry: { width: 232, height: 112 },
  canvas: { width: 208, height: 72 },
  note: { width: 220, height: 64 },
  section: { width: 640, height: 420 },
};

/** The smallest and largest a card of each kind may be made. */
export const MIN_SIZE: Record<CanvasItemType, Size> = {
  scene: { width: 160, height: 56 },
  chapter: { width: 160, height: 56 },
  page: { width: 160, height: 56 },
  entry: { width: 160, height: 56 },
  canvas: { width: 160, height: 48 },
  note: { width: 120, height: 40 },
  section: { width: 200, height: 120 },
};
export const MAX_SIZE: Record<CanvasItemType, Size> = {
  scene: { width: 720, height: 720 },
  chapter: { width: 720, height: 720 },
  page: { width: 720, height: 720 },
  entry: { width: 720, height: 720 },
  canvas: { width: 720, height: 360 },
  note: { width: 960, height: 1600 },
  section: { width: 8000, height: 8000 },
};

/** How tall a note grows on its own while being typed into; past this it scrolls. */
export const NOTE_AUTO_MAX_HEIGHT = 480;

/** A size kept within its kind's bounds, whole pixels. */
export function clampSize(type: CanvasItemType, size: Size): Size {
  const min = MIN_SIZE[type];
  const max = MAX_SIZE[type];
  return {
    width: Math.round(Math.min(max.width, Math.max(min.width, size.width))),
    height: Math.round(Math.min(max.height, Math.max(min.height, size.height))),
  };
}

export const ITEM_LABEL: Record<CanvasItemType, string> = {
  scene: "Scene",
  chapter: "Chapter",
  page: "Page",
  entry: "Entry",
  canvas: "Canvas",
  note: "Note",
  section: "Section",
};

export function isSection(item: Pick<CanvasItem, "item_type">): boolean {
  return item.item_type === "section";
}

/** A placement's Section, as stored (absent on a pre-046 read: none). */
export function sectionOf(item: Pick<CanvasItem, "section_id">): string | null {
  return item.section_id ?? null;
}

/** The ids of a Section's members. */
export function membersOf(items: Iterable<CanvasItem>, sectionId: string): string[] {
  const out: string[] = [];
  for (const i of items) if (sectionOf(i) === sectionId) out.push(i.id);
  return out;
}

/**
 * The Section a card dropped at `rect` belongs in: the topmost Section whose
 * region holds the card's centre, or null. Membership is explicit — this
 * decides it when a drag ends, never on every render.
 */
export function sectionAt(items: Iterable<CanvasItem>, rect: Rect): string | null {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  let best: CanvasItem | null = null;
  for (const i of items) {
    if (!isSection(i)) continue;
    if (cx < i.x || cy < i.y || cx > i.x + i.width || cy > i.y + i.height) continue;
    if (!best || byStacking(best, i) < 0) best = i;
  }
  return best?.id ?? null;
}

/**
 * `ids` and, for every Section among them, its members: what moves when
 * those are moved (a Section carries what it holds).
 */
export function withMembers(items: Iterable<CanvasItem>, ids: Iterable<string>): string[] {
  const set = new Set(ids);
  const list = [...items];
  for (const id of [...set]) {
    const item = list.find((i) => i.id === id);
    if (item && isSection(item)) for (const m of membersOf(list, id)) set.add(m);
  }
  return [...set];
}

/** The placement type of an object in the shell's index, or null if it can't be placed on a Canvas. */
export function placementTypeOf(entry: Pick<NavEntry, "kind">): CanvasTargetType | null {
  switch (entry.kind) {
    case "scene":
    case "unplacedScene":
      return "scene";
    case "chapter":
      return "chapter";
    case "workspacePage":
      return "page";
    case "collectionEntry":
      return "entry";
    case "workspaceCanvas":
      return "canvas";
    default:
      return null;
  }
}

/** The navigator kinds a Canvas can show (a Group and a Folder are structure, not pieces). Derived from placementTypeOf: one rule. */
export const PLACEABLE_KINDS: readonly NavKind[] = (
  ["scene", "unplacedScene", "chapter", "workspacePage", "collectionEntry", "workspaceCanvas", "group", "workspaceFolder", "workspaceCollection"] as const
).filter((kind) => placementTypeOf({ kind }) !== null);

/** The Project Search kinds a Canvas can place, and the placement each makes — the same rule, for "Add to canvas". */
export const PLACEMENT_BY_SEARCH_KIND: Readonly<Partial<Record<SearchKind, CanvasTargetType>>> = {
  scene: "scene",
  chapter: "chapter",
  page: "page",
  entry: "entry",
  canvas: "canvas",
};
export const PLACEABLE_SEARCH_KINDS: readonly SearchKind[] = Object.keys(PLACEMENT_BY_SEARCH_KIND) as SearchKind[];

/**
 * Drag metadata. Every navigator row carries the object (`CANVAS_DRAG_OBJECT`:
 * {id}); a row a Canvas can show ALSO carries `CANVAS_DRAG_PLACEABLE`, whose
 * presence a Canvas can read while the drag is over it (browsers hide the
 * data until the drop, but not the types) — so an unsupported object (a
 * Folder, a Collection, a Group) is never offered a drop.
 */
export const CANVAS_DRAG_OBJECT = "application/x-rune-object";
export const CANVAS_DRAG_PLACEABLE = "application/x-rune-canvas-placeable";

/** The types a navigator row sets when a drag starts (the data of each is the object's id as JSON). */
export function canvasDragTypes(entry: Pick<NavEntry, "kind">): string[] {
  return placementTypeOf(entry) ? [CANVAS_DRAG_OBJECT, CANVAS_DRAG_PLACEABLE] : [CANVAS_DRAG_OBJECT];
}

/** Whether a drag over a Canvas carries something it can place. */
export function isPlaceableDrag(types: readonly string[]): boolean {
  return types.includes(CANVAS_DRAG_PLACEABLE);
}

/** The canonical object a live placement shows, or null for a note. */
export function targetIdOf(item: Pick<CanvasItem, "item_type" | "scene_id" | "chapter_id" | "document_id" | "entry_id" | "target_canvas_id">): string | null {
  switch (item.item_type) {
    case "scene":
      return item.scene_id;
    case "chapter":
      return item.chapter_id;
    case "page":
      return item.document_id;
    case "entry":
      return item.entry_id;
    case "canvas":
      return item.target_canvas_id;
    default:
      return null;
  }
}

/** Every placement of `targetId` on the Canvas, in stacking order (lowest first). */
export function placementsOf(items: Iterable<CanvasItem>, targetId: string): CanvasItem[] {
  const out: CanvasItem[] = [];
  for (const i of items) if (targetIdOf(i) === targetId) out.push(i);
  return out.sort(byStacking);
}

export function byStacking(a: Pick<CanvasItem, "z" | "created_at" | "id">, b: Pick<CanvasItem, "z" | "created_at" | "id">): number {
  return a.z - b.z || String(a.created_at).localeCompare(String(b.created_at)) || a.id.localeCompare(b.id);
}

/** A z above every item's: what a selected or new item takes to come to the front. */
export function nextZ(items: Iterable<Pick<CanvasItem, "z">>): number {
  let max = 0;
  for (const i of items) max = Math.max(max, i.z);
  return max + 1;
}

/**
 * The quiet warning when the writer adds an object that is already on this
 * Canvas: "This Scene is already on this Canvas." The writer may go to the
 * existing placement, or add another; both keep pointing at the same object.
 */
export function duplicateNotice(type: CanvasTargetType): string {
  return `This ${ITEM_LABEL[type]} is already on this Canvas.`;
}

// ── Notes ───────────────────────────────────────────────────────────────────

export const NOTE_TEXT_MAX = 20_000;

type Doc = Record<string, unknown>;

/**
 * A note's text as its stored document: one paragraph per line (an empty
 * line is an empty paragraph). TipTap JSON, so a note can later become a
 * Workspace Page or an Unplaced Scene (M22C) without reinterpretation.
 */
export function noteDoc(text: string): Doc {
  const lines = text.slice(0, NOTE_TEXT_MAX).split("\n");
  return {
    type: "doc",
    content: lines.map((line) => (line === "" ? { type: "paragraph" } : { type: "paragraph", content: [{ type: "text", text: line }] })),
  };
}

/** The text of a note's document: its paragraphs, one per line. */
export function noteText(doc: unknown): string {
  const content = (doc as { content?: unknown } | null)?.content;
  if (!Array.isArray(content)) return "";
  return content.map((block) => blockText(block)).join("\n");
}

function blockText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (n.type === "text") return n.text ?? "";
  if (n.type === "hardBreak") return "\n";
  return (n.content ?? []).map(blockText).join("");
}

/**
 * A restrained preview of a rich-text document: its text, in reading order,
 * paragraphs parted by a space, cut to `max` characters at a word. Empty when
 * there is no text. Shown on a card, never stored.
 */
export function previewText(doc: unknown, max = 240): string {
  const walk = (node: unknown, out: string[]) => {
    if (!node || typeof node !== "object") return;
    const n = node as { type?: string; text?: string; content?: unknown[] };
    if (n.type === "text") {
      if (n.text) out.push(n.text);
      return;
    }
    if (Array.isArray(n.content)) {
      const inner: string[] = [];
      for (const child of n.content) walk(child, inner);
      // A block's text is one run; blocks are parted by a space.
      const run = inner.join("").replace(/\s+/g, " ").trim();
      if (run) out.push(run);
    }
  };
  const top: string[] = [];
  const content = (doc as { content?: unknown[] } | null)?.content;
  if (Array.isArray(content)) for (const block of content) walk(block, top);
  const text = top.join(" ");
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).trimEnd()}…`;
}

// ── Selection ───────────────────────────────────────────────────────────────

/** A click on an item: plain selects it alone; Shift / ⌘ toggles it within the selection. */
export function selectOnClick(selected: ReadonlySet<string>, id: string, extend: boolean): Set<string> {
  if (!extend) return selected.size === 1 && selected.has(id) ? new Set(selected) : new Set([id]);
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

// ── Viewport memory (per device, per Canvas) ────────────────────────────────

/** Where this device last looked on a Canvas. Presentation only: never Canvas content. */
export function viewportStorageKey(canvasId: string): string {
  return `rune2:canvas-viewport:${canvasId}`;
}

export function parseViewport(raw: string | null): Viewport | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Viewport>;
    if (typeof v.tx !== "number" || typeof v.ty !== "number" || typeof v.scale !== "number") return null;
    if (![v.tx, v.ty, v.scale].every(Number.isFinite)) return null;
    return { tx: v.tx, ty: v.ty, scale: clampScale(v.scale) };
  } catch {
    return null;
  }
}
