"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowRight,
  LayoutGrid,
  Link,
  Maximize,
  Minus,
  Plus,
  Redo2,
  Scan,
  Search,
  SquareDashed,
  Undo2,
  X,
} from "lucide-react";
import { ICON } from "./icons";
import { Tooltip } from "./Tooltip";
import { renameWorkspaceCanvas } from "@/lib/actions/workspaceCanvas";
import {
  boundsOf,
  DEFAULT_SIZE,
  duplicateNotice,
  fitAll,
  fitRect,
  focusView,
  isInView,
  isPlaceableDrag,
  isSection,
  itemRect,
  marqueeSelection,
  MAX_SIZE,
  MIN_SIZE,
  panBy,
  parseViewport,
  placementsOf,
  placementTypeOf,
  rectFrom,
  selectOnClick,
  targetIdOf,
  toWorld,
  viewportStorageKey,
  zoomAt,
  CANVAS_DRAG_OBJECT,
  type Point,
  type Rect,
  type Viewport,
} from "@/lib/rune2/canvas";
import { align, distribute, snapEdge, snapRect, tidy, type AlignMode, type DistributeMode, type Guide } from "@/lib/rune2/canvasArrange";
import type { FindResult } from "@/lib/rune2/canvasFind";
import type { CanvasClip, CanvasSession, CanvasSaveStatus } from "@/lib/rune2/canvasSession";
import type { NavEntry } from "@/lib/rune2/navigatorModel";
import { openableId } from "@/lib/rune2/references";
import type { CanvasItem, CanvasTargetType } from "@/lib/types";
import { useNetworkStore } from "@/store/networkStore";
import { CanvasCard, type CardSetEl } from "./CanvasCard";
import { CanvasConnections, endpoints, type ConnectionLine } from "./CanvasConnections";
import { CanvasFind } from "./CanvasFind";
import { CanvasInsert, type InsertChoice } from "./CanvasInsert";
import { CanvasSection, SECTION_HEAD } from "./CanvasSection";
import { DocStatus } from "./DocStatus";
import { NavigatorMenu, type NavigatorMenuItem } from "./NavigatorMenu";
import { useRune2Selection } from "./Rune2Selection";
import { WorkspaceTitle } from "./WorkspaceTitle";

// The Canvas surface (Milestone 22A; Sections, connections, sizing,
// arrangement, Find and navigation at scale in 22B): an unbounded plane the
// writer pans and zooms, holding compact live cards of the book's pieces,
// Canvas-local notes, quiet Sections that gather them, and lines between
// them. Its transform is its own — the content column never scrolls under
// it. Interaction:
//
//   drag the background        marquee selection (Shift / ⌘: add to it)
//   wheel / two fingers        pan;  ⌘ or Ctrl + wheel, pinch: zoom at the pointer
//   middle button, Space+drag  pan
//   click a card               select (Shift / ⌘ toggles);  drag moves the selection
//                              — a Section's title strip does the same, and its cards come along;
//                              guides appear as edges and centres line up, and the card settles on them
//   handles on a selected card resize it (its size is then its own); the dot at its right edge
//                              drags a connection to another card
//   double-click a card        open the object (a Scene, Page… in the working set; a Canvas opens)
//   double-click empty space   a new note, ready to type
//   double-click a Section's title / a connection   rename / label it
//   Enter                      open the selected card / edit the selected note / rename the Section
//   Delete / Backspace         remove the selected placements or connection — only those
//   Escape                     leave the note / clear the selection / close what's open
//   ⌘Z, ⇧⌘Z, ⌘Y               undo, redo — this Canvas's own history
//   ⌘A                         select all;  arrows nudge (Shift: by ten)
//   ⌘C, ⌘X, ⌘V, ⌘D             copy, cut, paste, duplicate — placements, never the objects
//   ⇧1, ⇧2                     show everything, show the selection
//   ⌘F  or  Find               find something on this Canvas and go to it
//   S                          a Section around the selection (or at the centre)
//   "/"  or  Add               find something of the Project to place
//   drop a navigator row       place it where it was dropped (only what a Canvas can show is offered a drop)
//
// Where this device last looked on a Canvas is remembered on the device
// (localStorage) — presentation only, never Canvas content, which is the
// session's (lib/rune2/canvasSession.ts) and saved as it changes.

const STATUS_LABEL: Record<CanvasSaveStatus, string> = {
  saved: "Saved",
  pending: "Saving…",
  saving: "Saving…",
  retrying: "Saved on this device",
  trashed: "In Trash",
  unavailable: "Unavailable",
};

type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

type Gesture =
  | { kind: "pan"; pointerId: number; last: Point }
  | {
      kind: "drag";
      pointerId: number;
      origin: Point;
      ids: string[];
      direct: Set<string>;
      from: Map<string, Point>;
      bounds: Rect;
      applied: Point;
      moved: boolean;
    }
  | { kind: "marquee"; pointerId: number; start: Point; base: Set<string>; sectionUnder: string | null }
  | { kind: "resize"; pointerId: number; id: string; handle: Handle; origin: Point; from: Rect }
  | { kind: "connect"; pointerId: number; sourceId: string };

type PendingPlacement = { type: CanvasTargetType; targetId: string; label: string; at: Point };
type Notice = { text: string; existing: string[]; pending: PendingPlacement };

const DRAG_THRESHOLD = 3;
const ZOOM_STEP = 1.2;
const SNAP_PX = 6;
const NUDGE = 1;
const NUDGE_LARGE = 10;
const FAR_SCALE = 0.45;
const PASTE_OFFSET = 24;

/** What ⌘C took, for this window: pasted onto this Canvas or another of the Project, each paste a little further along. */
class CanvasClipboard {
  private held: { clip: CanvasClip; canvasId: string; pastes: number } | null = null;
  take(clip: CanvasClip, canvasId: string) {
    this.held = { clip, canvasId, pastes: 0 };
  }
  /** The clip and how many times it has been pasted since (this one included), or null when empty. */
  next(): { clip: CanvasClip; canvasId: string; pastes: number } | null {
    if (!this.held || this.held.clip.items.length === 0) return null;
    this.held.pastes += 1;
    return this.held;
  }
}
const clipboard = new CanvasClipboard();

export default function CanvasSurface({ entry, session }: { entry: NavEntry; session: CanvasSession }) {
  const { index, workspace, select, openInNewTab, canvasFocus, requestCanvasFocus } = useRune2Selection();
  const isOnline = useNetworkStore((s) => s.isOnline);
  useSyncExternalStore(session.subscribe, session.getRevision, session.getRevision);
  const items = session.items;
  const connections = session.connections;

  const root = useRef<HTMLDivElement>(null);
  const cardEls = useRef(new Map<string, HTMLDivElement>());
  const setEl = useCallback<CardSetEl>((id, el) => {
    if (el) cardEls.current.set(id, el);
    else cardEls.current.delete(id);
  }, []);

  // ── Viewport ──────────────────────────────────────────────────────────────
  const [vp, setVpState] = useState<Viewport | null>(null);
  const vpRef = useRef<Viewport | null>(null);
  const setVp = useCallback((next: Viewport | ((v: Viewport) => Viewport)) => {
    const value = typeof next === "function" ? next(vpRef.current ?? { tx: 0, ty: 0, scale: 1 }) : next;
    vpRef.current = value;
    setVpState(value);
  }, []);
  const [animating, setAnimating] = useState(false);

  const size = () => {
    const r = root.current?.getBoundingClientRect();
    return { width: r?.width ?? 800, height: r?.height ?? 600 };
  };
  /** Every item's rect in world units — its stored geometry (a card's size is its own). Sections are selected only whole. */
  const rects = useCallback((): { id: string; rect: Rect; whole?: boolean }[] => {
    return session.items.map((i) => ({ id: i.id, rect: itemRect(i), whole: isSection(i) || undefined }));
  }, [session]);
  const rectsOf = (ids: Iterable<string>): Rect[] => {
    const out: Rect[] = [];
    for (const id of ids) {
      const item = session.get(id);
      if (item) out.push(itemRect(item));
    }
    return out;
  };

  // The first view: where this device last looked, else everything in view.
  useLayoutEffect(() => {
    let stored: Viewport | null = null;
    try {
      stored = parseViewport(localStorage.getItem(viewportStorageKey(entry.id)));
    } catch {
      // Storage unavailable.
    }
    setVp(stored ?? fitAll(rects().map((r) => r.rect), size()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.id]);

  // Remember the view, a moment after it settles.
  useEffect(() => {
    if (!vp) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(viewportStorageKey(entry.id), JSON.stringify(vp));
      } catch {
        // Storage unavailable.
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [vp, entry.id]);

  const screenPoint = (e: { clientX: number; clientY: number }): Point => {
    const r = root.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const worldPoint = (e: { clientX: number; clientY: number }): Point => toWorld(vpRef.current!, screenPoint(e));
  const viewCenter = (): Point => {
    const s = size();
    return toWorld(vpRef.current!, { x: s.width / 2, y: s.height / 2 });
  };

  // Wheel: pan, or zoom at the pointer with ⌘/Ctrl (a pinch arrives as Ctrl+wheel).
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!vpRef.current) return;
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.01));
        setVp((v) => zoomAt(v, factor, screenPoint(e)));
      } else {
        const k = e.deltaMode === 1 ? 16 : 1;
        setVp((v) => panBy(v, -e.deltaX * k, -e.deltaY * k));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animateTo = (next: Viewport) => {
    setAnimating(true);
    setVp(next);
  };
  const zoomBy = (factor: number) => {
    const s = size();
    setVp((v) => zoomAt(v, factor, { x: s.width / 2, y: s.height / 2 }));
  };
  /** Zoom to fit: everything on the board. */
  const fit = () => animateTo(fitAll(rects().map((r) => r.rect), size()));
  /** Zoom to selection: what is selected, no closer than actual size. */
  const fitSelection = (ids: Iterable<string>) => {
    const bounds = boundsOf(rectsOf(ids));
    if (bounds) animateTo(fitRect(bounds, size(), 64, 1));
  };
  /** Focus: bring items into view — a pan when they fit, a zoom out when they don't — and select them. */
  const focusItems = (ids: string[]) => {
    const bounds = boundsOf(rectsOf(ids));
    if (!bounds) return;
    animateTo(focusView(vpRef.current!, bounds, size()));
    setSelected(new Set(ids));
    setSelectedConnection(null);
  };
  useEffect(() => {
    if (!animating) return;
    const timer = setTimeout(() => setAnimating(false), 320);
    return () => clearTimeout(timer);
  }, [animating]);

  // ── Selection and gestures ────────────────────────────────────────────────
  const [selectedRaw, setSelected] = useState<Set<string>>(() => new Set());
  const selected = useMemo(() => {
    const live = new Set([...selectedRaw].filter((id) => session.has(id)));
    return live.size === selectedRaw.size ? selectedRaw : live;
  }, [selectedRaw, session, items]); // eslint-disable-line react-hooks/exhaustive-deps
  const [selectedConnectionRaw, setSelectedConnection] = useState<string | null>(null);
  const selectedConnection = selectedConnectionRaw && session.getConnection(selectedConnectionRaw) ? selectedConnectionRaw : null;
  const [editing, setEditing] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [draftLine, setDraftLine] = useState<{ from: Point; to: Point } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [insert, setInsert] = useState<{ at: Point | null } | null>(null);
  const [find, setFind] = useState(false);
  const [arrangeAt, setArrangeAt] = useState<Point | null>(null);
  const [dropping, setDropping] = useState(false);
  const gesture = useRef<Gesture | null>(null);
  const spaceHeld = useRef(false);
  const [dragging, setDragging] = useState(false);
  const arrangeButton = useRef<HTMLButtonElement>(null);

  const clearTransient = () => {
    setNotice(null);
    setInsert(null);
    setFind(false);
    setArrangeAt(null);
  };
  const selectItems = (ids: Set<string>) => {
    setSelected(ids);
    if (ids.size > 0) setSelectedConnection(null);
  };

  // A placement asked for from elsewhere (Project Search found a note here): bring it into view once the view exists.
  useEffect(() => {
    if (!vp || !canvasFocus || canvasFocus.canvasId !== entry.id) return;
    if (session.has(canvasFocus.itemId)) focusItems([canvasFocus.itemId]);
    requestCanvasFocus(null);
    root.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vp, canvasFocus, entry.id]);

  /** The rects a drag or resize may settle against: everything else on screen (and a little beyond). */
  const snapCandidates = (excluding: ReadonlySet<string>): Rect[] => {
    const v = vpRef.current!;
    const s = size();
    const wide = { width: s.width * 1.5, height: s.height * 1.5 };
    const out: Rect[] = [];
    for (const item of session.items) {
      if (excluding.has(item.id)) continue;
      const r = itemRect(item);
      if (isInView(v, r, wide)) out.push(r);
    }
    return out;
  };

  const onCardPointerDown = (item: CanvasItem, e: ReactPointerEvent<HTMLDivElement>) => {
    if (editing === item.id) return; // typing in the note: its own text selection
    if (e.button !== 0) return;
    e.stopPropagation();
    if (editing) setEditing(null);
    if (renaming) setRenaming(null);
    clearTransient();
    root.current?.focus({ preventScroll: true });
    const extend = e.shiftKey || e.metaKey || e.ctrlKey;
    const next = selected.has(item.id) && !extend ? selected : selectOnClick(selected, item.id, extend);
    selectItems(next);
    if (extend && !next.has(item.id)) return;
    session.bringToFront([item.id]);
    const direct = new Set(next);
    const ids = session.withMembers(direct);
    const from = new Map(ids.map((id) => [id, { x: session.get(id)!.x, y: session.get(id)!.y }]));
    const bounds = boundsOf(rectsOf(ids))!;
    root.current?.setPointerCapture(e.pointerId);
    gesture.current = { kind: "drag", pointerId: e.pointerId, origin: worldPoint(e), ids, direct, from, bounds, applied: { x: 0, y: 0 }, moved: false };
  };

  const onHandlePointerDown = (id: string, handle: Handle, e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const item = session.get(id);
    if (!item) return;
    clearTransient();
    root.current?.focus({ preventScroll: true });
    root.current?.setPointerCapture(e.pointerId);
    gesture.current = { kind: "resize", pointerId: e.pointerId, id, handle, origin: worldPoint(e), from: itemRect(item) };
    setDragging(true);
  };

  const onConnectPointerDown = (id: string, e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    clearTransient();
    root.current?.focus({ preventScroll: true });
    root.current?.setPointerCapture(e.pointerId);
    gesture.current = { kind: "connect", pointerId: e.pointerId, sourceId: id };
  };

  const onConnectionPointerDown = (id: string, e: ReactPointerEvent<SVGElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    if (editing) setEditing(null);
    clearTransient();
    root.current?.focus({ preventScroll: true });
    setSelected(new Set());
    setSelectedConnection(id);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // Cards handle their own presses (a note being typed into lets this through: its own text selection).
    if ((e.target as Element).closest(".r2-canvas-ui, .r2-canvas-card, .r2-canvas-section-head, .r2-canvas-handle")) return;
    if (!vpRef.current) return;
    if (editing) setEditing(null);
    if (renaming) setRenaming(null);
    clearTransient();
    root.current?.focus({ preventScroll: true });
    const pan = e.button === 1 || (e.button === 0 && (spaceHeld.current || e.altKey));
    if (pan) {
      e.preventDefault();
      root.current?.setPointerCapture(e.pointerId);
      gesture.current = { kind: "pan", pointerId: e.pointerId, last: screenPoint(e) };
      return;
    }
    if (e.button !== 0) return;
    const extend = e.shiftKey || e.metaKey || e.ctrlKey;
    if (!extend) {
      setSelected(new Set());
      setSelectedConnection(null);
    }
    const sectionUnder = (e.target as Element).closest<HTMLElement>("[data-section]")?.dataset.item ?? null;
    root.current?.setPointerCapture(e.pointerId);
    gesture.current = { kind: "marquee", pointerId: e.pointerId, start: screenPoint(e), base: extend ? selected : new Set(), sectionUnder };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    if (g.kind === "pan") {
      const p = screenPoint(e);
      setVp((v) => panBy(v, p.x - g.last.x, p.y - g.last.y));
      g.last = p;
    } else if (g.kind === "drag") {
      const p = worldPoint(e);
      const scale = vpRef.current!.scale;
      let dx = p.x - g.origin.x;
      let dy = p.y - g.origin.y;
      if (!g.moved) {
        if (Math.hypot(dx * scale, dy * scale) < DRAG_THRESHOLD) return;
        g.moved = true;
        setDragging(true);
      }
      // Settle on nearby edges and centres — gently, and only for the group's bounds.
      const moving = { ...g.bounds, x: g.bounds.x + dx, y: g.bounds.y + dy };
      const snap = snapRect(moving, snapCandidates(new Set(g.ids)), SNAP_PX / scale);
      dx += snap.dx;
      dy += snap.dy;
      setGuides(snap.guides);
      session.moveLive(g.ids, dx - g.applied.x, dy - g.applied.y);
      g.applied = { x: dx, y: dy };
    } else if (g.kind === "resize") {
      const item = session.get(g.id);
      if (!item) return;
      const p = worldPoint(e);
      const scale = vpRef.current!.scale;
      const dx = p.x - g.origin.x;
      const dy = p.y - g.origin.y;
      const f = g.from;
      const h = g.handle;
      let x = f.x;
      let y = f.y;
      let width = f.width;
      let height = f.height;
      if (h.includes("e")) width = f.width + dx;
      if (h.includes("s")) height = f.height + dy;
      if (h.includes("w")) {
        x = f.x + dx;
        width = f.width - dx;
      }
      if (h.includes("n")) {
        y = f.y + dy;
        height = f.height - dy;
      }
      const min = MIN_SIZE[item.item_type];
      const max = MAX_SIZE[item.item_type];
      width = Math.min(max.width, Math.max(min.width, width));
      height = Math.min(max.height, Math.max(min.height, height));
      if (h.includes("w")) x = f.x + f.width - width;
      if (h.includes("n")) y = f.y + f.height - height;
      // The moving edge settles on a neighbour's edge or centre.
      const others = snapCandidates(new Set([g.id]));
      const threshold = SNAP_PX / scale;
      const next: Guide[] = [];
      if (h.includes("e") || h.includes("w")) {
        const edge = h.includes("e") ? x + width : x;
        const s = snapEdge(edge, "x", others, threshold, [y, y + height]);
        if (s) {
          if (h.includes("e")) width = Math.min(max.width, Math.max(min.width, width + s.delta));
          else {
            const w = Math.min(max.width, Math.max(min.width, width - s.delta));
            x = f.x + f.width - w;
            width = w;
          }
          next.push(s.guide);
        }
      }
      if (h.includes("s") || h.includes("n")) {
        const edge = h.includes("s") ? y + height : y;
        const s = snapEdge(edge, "y", others, threshold, [x, x + width]);
        if (s) {
          if (h.includes("s")) height = Math.min(max.height, Math.max(min.height, height + s.delta));
          else {
            const hh = Math.min(max.height, Math.max(min.height, height - s.delta));
            y = f.y + f.height - hh;
            height = hh;
          }
          next.push(s.guide);
        }
      }
      setGuides(next);
      session.resizeLive(g.id, { x, y, width, height });
    } else if (g.kind === "connect") {
      const source = session.get(g.sourceId);
      if (!source) return;
      const p = worldPoint(e);
      const r = itemRect(source);
      const c = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      setDraftLine({ from: endpoints(r, { x: p.x, y: p.y, width: 0, height: 0 }).from ?? c, to: p });
    } else {
      const now = screenPoint(e);
      const box = rectFrom(g.start, now);
      setMarquee(box);
      const world = rectFrom(toWorld(vpRef.current!, g.start), toWorld(vpRef.current!, now));
      selectItems(new Set([...g.base, ...marqueeSelection(rects(), world)]));
    }
  };

  const endGesture = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    gesture.current = null;
    if (root.current?.hasPointerCapture(e.pointerId)) root.current.releasePointerCapture(e.pointerId);
    setGuides([]);
    if (g.kind === "drag") {
      setDragging(false);
      if (g.moved) session.commitMove(g.from, g.direct);
    } else if (g.kind === "resize") {
      setDragging(false);
      session.commitResize(g.id, g.from);
    } else if (g.kind === "connect") {
      setDraftLine(null);
      if (e.type === "pointerup") {
        const under = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-item]:not([data-section])");
        const targetId = under?.dataset.item;
        if (targetId && targetId !== g.sourceId) {
          const id = session.connect(g.sourceId, targetId);
          if (id) {
            setSelected(new Set());
            setSelectedConnection(id);
          }
        }
      }
    } else if (g.kind === "marquee") {
      // A click (no box) on a Section's open ground selects the Section.
      if (!marquee && g.sectionUnder && e.type === "pointerup") selectItems(new Set(g.base).add(g.sectionUnder));
      setMarquee(null);
    }
  };

  // ── Placing ───────────────────────────────────────────────────────────────
  const addNow = (p: PendingPlacement) => {
    const id = session.addPlacement(p.type, p.targetId, p.label, p.at, DEFAULT_SIZE[p.type]);
    selectItems(new Set([id]));
    setNotice(null);
  };
  /** Places an object — or, if it is already here, asks: go to it, or add another. */
  const place = (type: CanvasTargetType, targetId: string, label: string, at: Point) => {
    if (type === "canvas" && targetId === entry.id) return;
    const pending = { type, targetId, label, at };
    const existing = placementsOf(session.items, targetId);
    if (existing.length > 0) {
      setNotice({ text: duplicateNotice(type), existing: existing.map((i) => i.id), pending });
      return;
    }
    addNow(pending);
  };
  const chooseInsert = (choice: InsertChoice) => {
    const at = insert?.at ?? viewCenter();
    const size = DEFAULT_SIZE[choice.type];
    setInsert(null);
    place(choice.type, choice.id, choice.title, { x: at.x - size.width / 2, y: at.y - size.height / 2 });
    root.current?.focus({ preventScroll: true });
  };

  const newNote = (at: Point) => {
    const id = session.createNote(at, DEFAULT_SIZE.note);
    selectItems(new Set([id]));
    setEditing(id);
  };

  /** A Section around the selection (with a margin), or one of the default size at the centre of the view. */
  const newSection = () => {
    const bounds = boundsOf(rectsOf(selected));
    const margin = 32;
    const rect: Rect = bounds
      ? { x: bounds.x - margin, y: bounds.y - margin - SECTION_HEAD, width: bounds.width + 2 * margin, height: bounds.height + 2 * margin + SECTION_HEAD }
      : (() => {
          const c = viewCenter();
          const s = DEFAULT_SIZE.section;
          return { x: c.x - s.width / 2, y: c.y - s.height / 2, width: s.width, height: s.height };
        })();
    const id = session.createSection(rect);
    selectItems(new Set([id]));
    setRenaming(id);
  };

  const openItem = (item: CanvasItem, newTab = false) => {
    if (item.item_type === "note") {
      selectItems(new Set([item.id]));
      setEditing(item.id);
      return;
    }
    if (isSection(item)) {
      selectItems(new Set([item.id]));
      setRenaming(item.id);
      return;
    }
    const targetId = targetIdOf(item);
    if (!targetId || !index.has(targetId)) return;
    const id = openableId(index, targetId);
    if (newTab) openInNewTab(id);
    else select(id);
  };

  // Drops from the navigator (ProjectNavigator marks its rows with the object,
  // and with whether a Canvas can show it — lib/rune2/canvas.ts decides both).
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!isPlaceableDrag(e.dataTransfer.types)) {
      // Not something a Canvas shows: no drop, no highlight — the browser shows "not allowed".
      if (dropping) setDropping(false);
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!dropping) setDropping(true);
  };
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!root.current?.contains(e.relatedTarget as Node | null)) setDropping(false);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    setDropping(false);
    if (!isPlaceableDrag(e.dataTransfer.types)) return;
    const raw = e.dataTransfer.getData(CANVAS_DRAG_OBJECT);
    if (!raw) return;
    e.preventDefault();
    try {
      const { id } = JSON.parse(raw) as { id: string };
      const target = index.get(id);
      const type = target && placementTypeOf(target);
      if (!target || !type) return;
      const at = worldPoint(e);
      const size = DEFAULT_SIZE[type];
      place(type, id, target.title, { x: at.x - size.width / 2, y: at.y - size.height / 2 });
    } catch {
      // Not ours.
    }
  };

  // ── Arranging ─────────────────────────────────────────────────────────────
  const positioned = (ids: Iterable<string>) => {
    const out: { id: string; rect: Rect }[] = [];
    for (const id of ids) {
      const item = session.get(id);
      if (item) out.push({ id, rect: itemRect(item) });
    }
    return out;
  };
  const doAlign = (mode: AlignMode) => session.arrange(align(positioned(selected), mode));
  const doDistribute = (mode: DistributeMode) => session.arrange(distribute(positioned(selected), mode));
  const doTidy = () => session.arrange(tidy(positioned(selected)));
  const nudge = (dx: number, dy: number) => {
    const to = new Map<string, Point>();
    for (const id of selected) {
      const item = session.get(id);
      if (item) to.set(id, { x: item.x + dx, y: item.y + dy });
    }
    session.arrange(to);
  };
  const connectSelection = () => {
    const [a, b] = [...selected];
    if (!a || !b) return;
    const id = session.connect(a, b);
    if (id) {
      setSelected(new Set());
      setSelectedConnection(id);
    }
  };
  const twoCards = selected.size === 2 && [...selected].every((id) => !isSection(session.get(id)!));

  const arrangeItems = (): NavigatorMenuItem[] => {
    const many = selected.size >= 2;
    const three = selected.size >= 3;
    const items: NavigatorMenuItem[] = [
      { label: "Align left", icon: AlignStartVertical, onSelect: () => doAlign("left"), section: "Align" },
      { label: "Align centre", icon: AlignCenterVertical, onSelect: () => doAlign("centerX") },
      { label: "Align right", icon: AlignEndVertical, onSelect: () => doAlign("right") },
      { label: "Align top", icon: AlignStartHorizontal, onSelect: () => doAlign("top"), separator: true },
      { label: "Align middle", icon: AlignCenterHorizontal, onSelect: () => doAlign("centerY") },
      { label: "Align bottom", icon: AlignEndHorizontal, onSelect: () => doAlign("bottom") },
    ];
    if (three) {
      items.push(
        { label: "Distribute horizontally", icon: AlignHorizontalDistributeCenter, onSelect: () => doDistribute("horizontal"), section: "Distribute" },
        { label: "Distribute vertically", icon: AlignVerticalDistributeCenter, onSelect: () => doDistribute("vertical") }
      );
    }
    if (many) items.push({ label: "Tidy", icon: LayoutGrid, onSelect: doTidy, separator: true });
    if (twoCards) items.push({ label: "Connect", icon: Link, onSelect: connectSelection, separator: true });
    return items;
  };

  // ── Clipboard ─────────────────────────────────────────────────────────────
  const copy = () => {
    if (selected.size === 0) return;
    clipboard.take(session.clip([...selected]), entry.id);
  };
  const paste = () => {
    const held = clipboard.next();
    if (!held) return;
    let offset: Point;
    if (held.canvasId === entry.id) offset = { x: PASTE_OFFSET * held.pastes, y: PASTE_OFFSET * held.pastes };
    else {
      // From another Canvas: laid down around the centre of this view.
      const b = boundsOf(held.clip.items.map(itemRect))!;
      const c = viewCenter();
      offset = { x: c.x - (b.x + b.width / 2), y: c.y - (b.y + b.height / 2) };
    }
    const ids = session.paste(held.clip, offset);
    if (ids.length) selectItems(new Set(ids));
  };
  const duplicate = () => {
    if (selected.size === 0) return;
    const ids = session.duplicate([...selected]);
    if (ids.length) selectItems(new Set(ids));
  };

  // ── Keyboard ──────────────────────────────────────────────────────────────
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest("textarea, input, [contenteditable]")) return;
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    if (e.key === " ") {
      spaceHeld.current = true;
      e.preventDefault();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (insert || notice || find || arrangeAt) clearTransient();
      else if (editing) setEditing(null);
      else if (renaming) setRenaming(null);
      else if (selectedConnection) setSelectedConnection(null);
      else setSelected(new Set());
      return;
    }
    if (mod && key === "z") {
      e.preventDefault();
      if (e.shiftKey) session.redo();
      else session.undo();
      return;
    }
    if (mod && key === "y") {
      e.preventDefault();
      session.redo();
      return;
    }
    if (mod && key === "a") {
      e.preventDefault();
      selectItems(new Set(items.map((i) => i.id)));
      return;
    }
    if (mod && key === "c") {
      e.preventDefault();
      copy();
      return;
    }
    if (mod && key === "x") {
      e.preventDefault();
      copy();
      if (selected.size) {
        session.remove([...selected]);
        setSelected(new Set());
      }
      return;
    }
    if (mod && key === "v") {
      e.preventDefault();
      paste();
      return;
    }
    if (mod && key === "d") {
      e.preventDefault();
      duplicate();
      return;
    }
    if (mod && key === "f") {
      e.preventDefault();
      setFind(true);
      setInsert(null);
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      if (selectedConnection) {
        session.removeConnections([selectedConnection]);
        setSelectedConnection(null);
      } else if (selected.size > 0) {
        session.remove([...selected]);
        setSelected(new Set());
      }
      return;
    }
    if (e.key === "Enter") {
      if (selected.size !== 1) return;
      e.preventDefault();
      const item = session.get([...selected][0]);
      if (item) openItem(item, mod);
      return;
    }
    if (e.key === "F2" && selected.size === 1) {
      const item = session.get([...selected][0]);
      if (item && isSection(item)) {
        e.preventDefault();
        setRenaming(item.id);
      }
      return;
    }
    if (e.key === "/" && !mod) {
      e.preventDefault();
      setInsert({ at: null });
      setFind(false);
      return;
    }
    if (!mod && !e.altKey && key === "s") {
      e.preventDefault();
      newSection();
      return;
    }
    if (e.shiftKey && !mod && (e.key === "1" || e.key === "!")) {
      e.preventDefault();
      fit();
      return;
    }
    if (e.shiftKey && !mod && (e.key === "2" || e.key === "@")) {
      e.preventDefault();
      if (selected.size) fitSelection(selected);
      return;
    }
    if (mod && (e.key === "=" || e.key === "+")) {
      e.preventDefault();
      zoomBy(ZOOM_STEP);
      return;
    }
    if (mod && e.key === "-") {
      e.preventDefault();
      zoomBy(1 / ZOOM_STEP);
      return;
    }
    if (mod && e.key === "0") {
      e.preventDefault();
      const s = size();
      setVp((v) => zoomAt(v, 1 / v.scale, { x: s.width / 2, y: s.height / 2 }));
      return;
    }
    if (e.key.startsWith("Arrow") && selected.size > 0 && !mod) {
      e.preventDefault();
      const step = e.shiftKey ? NUDGE_LARGE : NUDGE;
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      nudge(dx, dy);
    }
  };
  const onKeyUp = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === " ") spaceHeld.current = false;
  };

  // ── Find ──────────────────────────────────────────────────────────────────
  const onFindFocus = (r: FindResult) => {
    if (r.kind === "connection" && r.endpoints) {
      const bounds = boundsOf(rectsOf(r.endpoints));
      if (bounds) animateTo(focusView(vpRef.current!, bounds, size()));
      setSelected(new Set());
      setSelectedConnection(r.id);
      return;
    }
    focusItems([r.id]);
  };

  // ── Status ────────────────────────────────────────────────────────────────
  const status = session.status;
  const conflicts = session.conflicts;
  const notes = items.filter((i) => i.item_type === "note").length;
  const sections = items.filter(isSection).length;
  const placements = items.length - notes - sections;
  const counts = [
    placements > 0 ? plural(placements, "card") : null,
    notes > 0 ? plural(notes, "note") : null,
    sections > 0 ? plural(sections, "section") : null,
    connections.length > 0 ? plural(connections.length, "connection") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // What a card's text preview is keyed by: the object's content version.
  const contentKey = (item: CanvasItem): string => {
    const id = targetIdOf(item);
    if (!id) return "";
    const target = index.get(id);
    if (target?.version !== undefined) return String(target.version);
    const page = workspace.pages.find((p) => p.id === id);
    if (page) return page.updated_at;
    const e = workspace.entries.find((x) => x.id === id);
    return e?.updated_at ?? "";
  };

  // The lines, from each card's edge to the other's, following the cards as they move.
  const lines: ConnectionLine[] = [];
  for (const c of connections) {
    const a = session.get(c.source_item_id);
    const b = session.get(c.target_item_id);
    if (!a || !b) continue;
    const { from, to } = endpoints(itemRect(a), itemRect(b));
    lines.push({ connection: c, from, to });
  }
  const sectionCounts = new Map<string, number>();
  for (const i of items) if (i.section_id) sectionCounts.set(i.section_id, (sectionCounts.get(i.section_id) ?? 0) + 1);

  const soleSelected = selected.size === 1 ? session.get([...selected][0]) : undefined;
  const showHandles = soleSelected && editing !== soleSelected.id && renaming !== soleSelected.id && !dragging;
  const scale = vp?.scale ?? 1;
  const connection = selectedConnection ? session.getConnection(selectedConnection) : undefined;

  return (
    <div
      ref={root}
      className="r2-canvas"
      tabIndex={0}
      role="application"
      aria-label={`${entry.title} canvas`}
      data-dragging={dragging || undefined}
      data-dropping={dropping || undefined}
      // The dot grid moves with the world: 24 world units apart, from the origin.
      style={
        vp
          ? { backgroundSize: `${24 * vp.scale}px ${24 * vp.scale}px`, backgroundPosition: `${vp.tx}px ${vp.ty}px` }
          : undefined
      }
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
      onLostPointerCapture={endGesture}
      onDoubleClick={(e) => {
        if ((e.target as Element).closest(".r2-canvas-card, .r2-canvas-ui, .r2-canvas-section-head, .r2-canvas-handle, .r2-canvas-lines")) return;
        newNote(worldPoint(e));
      }}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={() => {
        spaceHeld.current = false;
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {vp && (
        <div
          className="r2-canvas-world"
          data-animating={animating || undefined}
          data-zoom={vp.scale < FAR_SCALE ? "far" : undefined}
          style={{ transform: `translate(${vp.tx}px, ${vp.ty}px) scale(${vp.scale})` }}
        >
          {/* Sections: their own layer, beneath everything. */}
          {items.map((item) =>
            isSection(item) ? (
              <CanvasSection
                key={item.id}
                item={item}
                selected={selected.has(item.id)}
                renaming={renaming === item.id}
                count={sectionCounts.get(item.id) ?? 0}
                onPointerDown={onCardPointerDown}
                onHeadDoubleClick={(it) => {
                  selectItems(new Set([it.id]));
                  setRenaming(it.id);
                }}
                onRename={(id, title) => {
                  setRenaming((cur) => (cur === id ? null : cur));
                  if (title !== null) session.setSectionTitle(id, title);
                  root.current?.focus({ preventScroll: true });
                }}
              />
            ) : null
          )}

          <CanvasConnections
            lines={lines}
            selected={selectedConnection}
            draft={draftLine}
            onPointerDown={onConnectionPointerDown}
            onDoubleClick={(id) => {
              setSelectedConnection(id);
              requestAnimationFrame(() => root.current?.querySelector<HTMLInputElement>(".r2-canvas-connection-label")?.focus());
            }}
          />

          {items.map((item) => {
            if (isSection(item)) return null;
            const targetId = targetIdOf(item);
            return (
              <CanvasCard
                key={item.id}
                item={item}
                target={item.item_type === "note" ? null : targetId ? index.get(targetId) : undefined}
                contentKey={contentKey(item)}
                selected={selected.has(item.id)}
                editing={editing === item.id}
                setEl={setEl}
                onPointerDown={onCardPointerDown}
                onDoubleClick={(it) => openItem(it)}
                onNoteChange={(id, text) => session.setNoteText(id, text)}
                onNoteGrow={(id, height) => session.autoGrowNote(id, height)}
                onNoteDone={(id) => {
                  session.endNoteEdit(id);
                  setEditing((cur) => (cur === id ? null : cur));
                }}
              />
            );
          })}

          {/* Guides: the edges and centres a drag or resize has settled on. */}
          {guides.length > 0 && (
            <svg className="r2-canvas-guides" aria-hidden>
              {guides.map((g, i) =>
                g.axis === "x" ? (
                  <line key={i} x1={g.at} y1={g.from - 12} x2={g.at} y2={g.to + 12} />
                ) : (
                  <line key={i} x1={g.from - 12} y1={g.at} x2={g.to + 12} y2={g.at} />
                )
              )}
            </svg>
          )}

          {/* Handles on the one selected item: resize at its edges and corners; connect from the dot at its right. */}
          {showHandles && soleSelected && (
            <div
              className="r2-canvas-handles"
              style={{ transform: `translate(${soleSelected.x}px, ${soleSelected.y}px)`, width: soleSelected.width, height: soleSelected.height, zIndex: soleSelected.z + 2 }}
              aria-hidden
            >
              {HANDLES.map((h) => (
                <div
                  key={h}
                  className="r2-canvas-handle"
                  data-handle={h}
                  style={{ transform: `translate(-50%, -50%) scale(${1 / scale})` }}
                  onPointerDown={(e) => onHandlePointerDown(soleSelected.id, h, e)}
                />
              ))}
              {!isSection(soleSelected) && (
                <div
                  className="r2-canvas-handle r2-canvas-handle--connect"
                  title="Drag to another card to connect"
                  style={{ transform: `translate(-50%, -50%) scale(${1 / scale})` }}
                  onPointerDown={(e) => onConnectPointerDown(soleSelected.id, e)}
                />
              )}
            </div>
          )}
        </div>
      )}

      {marquee && (
        <div
          className="r2-canvas-marquee"
          style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }}
          aria-hidden
        />
      )}

      {/* The title, in the Workspace's voice, over the surface's top-left. */}
      <div className="r2-canvas-ui r2-canvas-head r2-page">
        <WorkspaceTitle
          entry={entry}
          rename={renameWorkspaceCanvas}
          noun="canvas"
          eyebrow="Canvas"
          onLeave={() => root.current?.focus({ preventScroll: true })}
        />
      </div>

      {/* Quiet tools: add, section, arrange, find, undo/redo, zoom. */}
      <div className="r2-canvas-ui r2-canvas-tools" role="toolbar" aria-label="Canvas tools">
        <Tooltip label={<>Add to canvas <kbd>/</kbd></>}>
          <button
            type="button"
            className="r2-action"
            aria-haspopup="dialog"
            aria-expanded={insert !== null}
            onClick={() => {
              setFind(false);
              setInsert((cur) => (cur ? null : { at: null }));
            }}
          >
            <Plus {...ICON} aria-hidden />
            Add
          </button>
        </Tooltip>
        <span className="r2-canvas-tools-group">
          <Tooltip label={<>{selected.size ? "Section around the selection" : "New section"} <kbd>S</kbd></>}>
            <button type="button" className="r2-icon-button" aria-label="New section" onClick={newSection}>
              <SquareDashed {...ICON} aria-hidden />
            </button>
          </Tooltip>
          <Tooltip label="Arrange the selection">
            <button
              ref={arrangeButton}
              type="button"
              className="r2-icon-button"
              aria-label="Arrange"
              aria-haspopup="menu"
              aria-expanded={arrangeAt !== null}
              disabled={selected.size < 2}
              onClick={() => {
                const r = arrangeButton.current?.getBoundingClientRect();
                setArrangeAt(arrangeAt ? null : r ? { x: r.right - 220, y: r.bottom + 6 } : { x: 0, y: 0 });
              }}
            >
              <AlignStartVertical {...ICON} aria-hidden />
            </button>
          </Tooltip>
          <Tooltip label={<>Find on canvas <kbd>⌘F</kbd></>}>
            <button
              type="button"
              className="r2-icon-button"
              aria-label="Find on canvas"
              aria-haspopup="dialog"
              aria-expanded={find}
              onClick={() => {
                setInsert(null);
                setFind((f) => !f);
              }}
            >
              <Search {...ICON} aria-hidden />
            </button>
          </Tooltip>
        </span>
        <span className="r2-canvas-tools-group">
          <Tooltip label={<>Undo <kbd>⌘Z</kbd></>}>
            <button type="button" className="r2-icon-button" aria-label="Undo" disabled={!session.canUndo} onClick={() => session.undo()}>
              <Undo2 {...ICON} aria-hidden />
            </button>
          </Tooltip>
          <Tooltip label={<>Redo <kbd>⇧⌘Z</kbd></>}>
            <button type="button" className="r2-icon-button" aria-label="Redo" disabled={!session.canRedo} onClick={() => session.redo()}>
              <Redo2 {...ICON} aria-hidden />
            </button>
          </Tooltip>
        </span>
        <span className="r2-canvas-tools-group">
          <Tooltip label="Zoom out">
            <button type="button" className="r2-icon-button" aria-label="Zoom out" onClick={() => zoomBy(1 / ZOOM_STEP)}>
              <Minus {...ICON} aria-hidden />
            </button>
          </Tooltip>
          <Tooltip label="Actual size">
            <button
              type="button"
              className="r2-canvas-zoom"
              aria-label="Zoom level; actual size"
              onClick={() => {
                const s = size();
                setVp((v) => zoomAt(v, 1 / v.scale, { x: s.width / 2, y: s.height / 2 }));
              }}
            >
              {vp ? `${Math.round(vp.scale * 100)}%` : "100%"}
            </button>
          </Tooltip>
          <Tooltip label="Zoom in">
            <button type="button" className="r2-icon-button" aria-label="Zoom in" onClick={() => zoomBy(ZOOM_STEP)}>
              <Plus {...ICON} aria-hidden />
            </button>
          </Tooltip>
          <Tooltip label={<>Show the selection <kbd>⇧2</kbd></>}>
            <button type="button" className="r2-icon-button" aria-label="Show the selection" disabled={selected.size === 0} onClick={() => fitSelection(selected)}>
              <Scan {...ICON} aria-hidden />
            </button>
          </Tooltip>
          <Tooltip label={<>Show everything <kbd>⇧1</kbd></>}>
            <button type="button" className="r2-icon-button" aria-label="Show everything" onClick={fit}>
              <Maximize {...ICON} aria-hidden />
            </button>
          </Tooltip>
        </span>
        {insert && <CanvasInsert canvasId={entry.id} onChoose={chooseInsert} onClose={() => setInsert(null)} />}
        {find && (
          <CanvasFind
            items={items}
            connections={connections}
            index={index}
            onFocus={onFindFocus}
            onClose={() => {
              setFind(false);
              root.current?.focus({ preventScroll: true });
            }}
          />
        )}
      </div>
      {arrangeAt && <NavigatorMenu label="Arrange the selection" at={arrangeAt} items={arrangeItems()} onClose={() => setArrangeAt(null)} />}

      {items.length === 0 && !insert && (
        <p className="r2-canvas-ui r2-canvas-empty">Double-click anywhere for a note, or add a scene, chapter, page or entry.</p>
      )}

      {notice && (
        <div className="r2-canvas-ui r2-canvas-notice" role="status">
          <span>{notice.text}</span>
          <button
            type="button"
            className="r2-button r2-button--quiet r2-button--sm"
            onClick={() => {
              focusItems(notice.existing);
              setNotice(null);
            }}
          >
            Go to existing
          </button>
          <button type="button" className="r2-button r2-button--quiet r2-button--sm" onClick={() => addNow(notice.pending)}>
            Add another
          </button>
          <button type="button" className="r2-icon-button" aria-label="Dismiss" onClick={() => setNotice(null)}>
            <X {...ICON} aria-hidden />
          </button>
        </div>
      )}

      {/* The selected connection: its label, whether it points, and its removal. */}
      {connection && !notice && (
        <div className="r2-canvas-ui r2-canvas-notice r2-canvas-connection" role="group" aria-label="Connection">
          <input
            key={connection.id}
            className="r2-field r2-canvas-connection-label"
            aria-label="Connection label"
            placeholder="Label"
            maxLength={200}
            defaultValue={connection.label ?? ""}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" || e.key === "Escape") {
                e.preventDefault();
                if (e.key === "Escape") e.currentTarget.value = connection.label ?? "";
                e.currentTarget.blur();
                root.current?.focus({ preventScroll: true });
              }
            }}
            onBlur={(e) => session.setConnection(connection.id, { label: e.currentTarget.value })}
          />
          <Tooltip label={connection.directed ? "Arrow: on" : "Arrow: off"}>
            <button
              type="button"
              className="r2-icon-button"
              aria-label="Arrow"
              aria-pressed={connection.directed}
              onClick={() => session.setConnection(connection.id, { directed: !connection.directed })}
            >
              <ArrowRight {...ICON} aria-hidden />
            </button>
          </Tooltip>
          <button
            type="button"
            className="r2-button r2-button--quiet r2-button--sm"
            onClick={() => {
              session.removeConnections([connection.id]);
              setSelectedConnection(null);
              root.current?.focus({ preventScroll: true });
            }}
          >
            Remove
          </button>
          <button type="button" className="r2-icon-button" aria-label="Done" onClick={() => setSelectedConnection(null)}>
            <X {...ICON} aria-hidden />
          </button>
        </div>
      )}

      {conflicts.size > 0 && (
        <div className="r2-canvas-ui r2-canvas-notice" role="status" data-tone="warning">
          <span>{conflicts.size === 1 ? "A note changed elsewhere." : `${conflicts.size} notes changed elsewhere.`} Showing the other version.</span>
          <button
            type="button"
            className="r2-button r2-button--quiet r2-button--sm"
            onClick={() => {
              for (const id of conflicts.keys()) session.keepMine(id);
            }}
          >
            Keep mine
          </button>
          <button
            type="button"
            className="r2-button r2-button--quiet r2-button--sm"
            onClick={() => {
              for (const id of conflicts.keys()) session.acceptServer(id);
            }}
          >
            Keep theirs
          </button>
        </div>
      )}

      <DocStatus>
        {counts && <span>{counts}</span>}
        {!isOnline && (status === "pending" || status === "saving" || status === "retrying") ? (
          <span data-tone="offline">Offline · saved on this device</span>
        ) : (
          <span>{STATUS_LABEL[status]}</span>
        )}
      </DocStatus>
    </div>
  );
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}
