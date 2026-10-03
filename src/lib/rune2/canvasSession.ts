import type { CanvasConnection, CanvasItem, CanvasItemType, CanvasTargetType, WorkspaceAttachment } from "@/lib/types";
import {
  attachmentIdOf,
  byStacking,
  clampSize,
  isSection,
  membersOf,
  nextZ,
  NOTE_AUTO_MAX_HEIGHT,
  noteDoc,
  noteText,
  roundCoord,
  sectionAt,
  sectionOf,
  withMembers,
  type Rect,
} from "./canvas";

// The save engine of one Canvas (Milestone 22A; Sections, connections,
// sizes and arrangement in 22B) — deliberately NOT the manuscript's and not
// the Workspace Page's either: a Canvas is many small rows (placements,
// Sections, notes and connections) that change together (a multi-move, a
// Section carrying its members), so its unit of saving is a BATCH to one
// Canvas (write_canvas_items), not one document. What it shares with those
// engines is the discipline:
//
//   * the session holds the Canvas's truth for this window (`items`,
//     `connections`); every change is applied here first, then written to
//     the device (`persist`) and saved after a pause (debounced) — one batch
//     in flight at a time; a change made during a save is saved next, never
//     dropped, never marked clean by the older save;
//   * every update is conditional on the version it is based on. A stale
//     window never overwrites a newer arrangement or a newer note silently:
//     the server answers 'conflict' with the current row, and the session
//     adopts it (for geometry, membership, a label: the other window moved
//     it, so be it) — a note whose text differed is kept as a conflict the
//     writer resolves (keepMine / acceptServer);
//   * every create carries its id, so a batch retried after a lost reply never
//     duplicates a placement or a connection; a delete of a row already gone
//     is fine;
//   * a failed batch (offline, server error) keeps the changes dirty on the
//     device and retries with backoff, and on flush() (reconnect, leaving).
//     The batch is one transaction on the server: a Section's move with its
//     members lands whole or not at all — never half.
//
// Undo and redo are this session's alone: a stack of inverse changes to
// PLACEMENTS, Sections and connections — never to the Scene, Page, Entry or
// Chapter a placement shows, which no command here can reach. A move, a
// resize, an alignment of many cards, a Section's deletion with its members
// let go, a paste of a mixed selection: each is one entry.
//
// Pure TypeScript with injectable timers, so it is tested deterministically.

export type CanvasChange =
  | {
      op: "create";
      id: string;
      item_type: CanvasItemType;
      target_id: string | null;
      label: string | null;
      content: Record<string, unknown> | null;
      x: number;
      y: number;
      width: number;
      height: number;
      z: number;
      section_id: string | null;
      manual_size: boolean;
    }
  | {
      op: "update";
      id: string;
      expected_version: number;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      z?: number;
      content?: Record<string, unknown>;
      label?: string | null;
      section_id?: string | null;
      manual_size?: boolean;
    }
  | { op: "delete"; id: string }
  | { kind: "connection"; op: "create"; id: string; source_id: string; target_id: string; directed: boolean; label: string | null }
  | { kind: "connection"; op: "update"; id: string; expected_version: number; directed?: boolean; label?: string | null }
  | { kind: "connection"; op: "delete"; id: string };

export type CanvasWriteResult =
  | { id: string; status: "ok"; version?: number }
  | { id: string; status: "conflict"; version: number; item: CanvasItem | CanvasConnection }
  | { id: string; status: "missing" }
  | { id: string; status: "error"; error: string };

/** One batch's outcome: per-change results, or a failure of the whole call (nothing written). */
export type CanvasWriteOutcome =
  | { status: "ok"; results: CanvasWriteResult[] }
  | { status: "trashed" }
  | { status: "not_found" }
  | { status: "error"; error: string };

export type CanvasSaveStatus =
  /** Everything is on the server. */
  | "saved"
  /** Changed; a save is scheduled. */
  | "pending"
  | "saving"
  /** The last save failed; kept on this device and retried. */
  | "retrying"
  /** The Canvas was moved to Trash (here or elsewhere): not saving until resumed. */
  | "trashed"
  /** The Canvas no longer exists or isn't reachable by this writer. */
  | "unavailable"
  /**
   * The server doesn't understand this client's saves at all (the Canvas
   * function is missing or older than this client): nothing is retried,
   * every change stays on this device, and the writer is asked to reload.
   */
  | "unsupported";

type ItemField = "x" | "y" | "width" | "height" | "z" | "content" | "label" | "section_id" | "manual_size";
type ConnectionField = "directed" | "label";
type Field = ItemField | ConnectionField;
type Kind = "item" | "connection";
const GEOMETRY: readonly ItemField[] = ["x", "y", "width", "height", "z"];

/** What of one row is not yet on the server. */
type Dirty = { kind: Kind; op: "create" | "update" | "delete"; fields: Set<Field>; seq: number };

/** This device's copy of what the server doesn't have yet: full rows for creates and updates. */
export type CanvasDraft = {
  canvasId: string;
  entries: {
    id: string;
    /** Absent on a draft written before 22B: an item. */
    kind?: Kind;
    op: "create" | "update" | "delete";
    fields: Field[];
    item: CanvasItem | CanvasConnection | null;
  }[];
};

/** A note whose text was changed here and elsewhere: the writer chooses. */
export type NoteConflict = { mine: string; theirs: CanvasItem };

/**
 * Whether a server answer means "this server doesn't support that" — a
 * client newer than the database (an item type, an op or a kind the
 * function doesn't know) or a database without the function at all —
 * rather than "that change is invalid". Such a change is never valid later
 * on THIS server, and never invalid in itself: it is kept, not dropped.
 */
export function isUnsupportedError(message: string | null | undefined): boolean {
  if (!message) return false;
  return /unknown (item type|op|kind)/i.test(message) || /could not find the function|does not exist|PGRST202|schema cache/i.test(message);
}

/** A placement whose content is the writer's own (never re-derivable from a canonical object). */
function isAuthored(item: Pick<CanvasItem, "item_type"> | undefined): boolean {
  return item?.item_type === "note" || item?.item_type === "image";
}

/** What ⌘C takes: rows as they were, to be laid down again (here or on another Canvas) as new rows. */
export type CanvasClip = { items: CanvasItem[]; connections: CanvasConnection[] };

/** One undo entry, with the ids of the rows it touches (so history about a row that was converted away can be dropped). */
type Command = { undo: () => void; redo: () => void; ids: readonly string[] };

export type CanvasSessionOptions = {
  canvasId: string;
  projectId: string;
  items: CanvasItem[];
  connections?: CanvasConnection[];
  /** The attachments the Canvas's image placements show (047). */
  attachments?: WorkspaceAttachment[];
  write: (changes: CanvasChange[]) => Promise<CanvasWriteOutcome>;
  /** Writes the device copy. Must not throw. */
  persist?: (draft: CanvasDraft) => void;
  /** Called after every change the surface should show (items, selection-relevant state, status). */
  onChange?: () => void;
  onStatus?: (status: CanvasSaveStatus) => void;
  /** Debounce after the last change, ms. */
  delay?: number;
  retryDelays?: number[];
  timers?: {
    set: (fn: () => void, ms: number) => unknown;
    clear: (handle: unknown) => void;
  };
  now?: () => string;
  newId?: () => string;
};

const UNDO_MAX = 200;

export class CanvasSession {
  readonly canvasId: string;
  readonly projectId: string;
  private _items = new Map<string, CanvasItem>();
  private _connections = new Map<string, CanvasConnection>();
  private _attachments = new Map<string, WorkspaceAttachment>();
  private dirty = new Map<string, Dirty>();
  /**
   * Changes this server refused as unsupported (or authored content it
   * refused for any reason): kept here and on the device, shown, never
   * retried by this session — a reloaded (newer) client replays them from
   * the device draft.
   */
  private _stranded = new Map<string, Dirty>();
  private inFlight: Map<string, number> | null = null;
  private _status: CanvasSaveStatus = "saved";
  private _conflicts = new Map<string, NoteConflict>();
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private seq = 0;
  private failures = 0;
  private timer: unknown = null;
  private running: Promise<void> | null = null;
  private disposed = false;
  /** Bumped on every visible change; the surface reads it as its snapshot. */
  private _revision = 0;
  private listeners = new Set<() => void>();
  private readonly opts: Required<Pick<CanvasSessionOptions, "delay" | "retryDelays" | "timers" | "now" | "newId">> & CanvasSessionOptions;
  // A note being typed into: its text before this edit, for one undo entry per edit.
  private noteEdits = new Map<string, string>();

  constructor(options: CanvasSessionOptions) {
    this.opts = {
      delay: 400,
      retryDelays: [2_000, 5_000, 15_000, 30_000],
      timers: {
        set: (fn, ms) => setTimeout(fn, ms),
        clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      },
      now: () => new Date().toISOString(),
      newId: () => globalThis.crypto.randomUUID(),
      ...options,
    };
    this.canvasId = options.canvasId;
    this.projectId = options.projectId;
    for (const item of options.items) this._items.set(item.id, item);
    for (const c of options.connections ?? []) this._connections.set(c.id, c);
    for (const a of options.attachments ?? []) this._attachments.set(a.id, a);
  }

  // ── Reading ───────────────────────────────────────────────────────────────

  /** Notified after every visible change (items, status, conflicts). */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  /** The snapshot a React store reads: a number that changes with every visible change. */
  getRevision = (): number => this._revision;

  get revision(): number {
    return this._revision;
  }
  get status(): CanvasSaveStatus {
    return this._status;
  }
  get dirtyCount(): number {
    return this.dirty.size;
  }
  /** Every item, lowest first in stacking order. */
  get items(): CanvasItem[] {
    return [...this._items.values()].sort(byStacking);
  }
  get(id: string): CanvasItem | undefined {
    return this._items.get(id);
  }
  has(id: string): boolean {
    return this._items.has(id);
  }
  /** Every connection, in creation order. */
  get connections(): CanvasConnection[] {
    return [...this._connections.values()].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id.localeCompare(b.id));
  }
  getConnection(id: string): CanvasConnection | undefined {
    return this._connections.get(id);
  }
  /** The ids of a Section's members. */
  membersOf(sectionId: string): string[] {
    return membersOf(this._items.values(), sectionId);
  }
  /** `ids` with the members of every Section among them: what moves together. */
  withMembers(ids: Iterable<string>): string[] {
    return withMembers(this._items.values(), ids);
  }
  get conflicts(): ReadonlyMap<string, NoteConflict> {
    return this._conflicts;
  }
  /** The rows this server refused as unsupported (kept, never retried here). */
  get stranded(): ReadonlySet<string> {
    return new Set(this._stranded.keys());
  }
  getAttachment(id: string): WorkspaceAttachment | undefined {
    return this._attachments.get(id);
  }
  /** Every attachment the session knows (the Canvas's images, and ones uploaded here). */
  get attachments(): WorkspaceAttachment[] {
    return [...this._attachments.values()];
  }
  /** An attachment uploaded in this window: known to the session before its placement is made. */
  addAttachment(a: WorkspaceAttachment): void {
    this._attachments.set(a.id, a);
  }
  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  // ── Opening with a device draft ──────────────────────────────────────────

  /**
   * Unsaved changes kept on this device (an earlier window closed before its
   * save landed) are laid over what the server has: a create the server
   * lacks is created; an update whose base version the server still has is
   * applied (otherwise the server's row stands, and a note's unsaved text
   * becomes a conflict); a delete is deleted. Then saved.
   */
  applyDraft(draft: CanvasDraft): void {
    if (draft.canvasId !== this.canvasId) return;
    for (const e of draft.entries) {
      const kind: Kind = e.kind ?? "item";
      const rows = kind === "item" ? this._items : this._connections;
      const server = rows.get(e.id);
      if (e.op === "delete") {
        if (server) {
          rows.delete(e.id);
          this.dirty.set(e.id, { kind, op: "delete", fields: new Set(), seq: ++this.seq });
        }
        continue;
      }
      if (!e.item) continue;
      if (e.op === "create") {
        if (!server) {
          (rows as Map<string, CanvasItem | CanvasConnection>).set(e.id, e.item);
          this.dirty.set(e.id, { kind, op: "create", fields: new Set(), seq: ++this.seq });
        }
        continue;
      }
      if (!server) continue; // gone meanwhile: nothing to update
      if (server.version === e.item.version) {
        (rows as Map<string, CanvasItem | CanvasConnection>).set(e.id, { ...server, ...pick(e.item, e.fields) });
        this.dirty.set(e.id, { kind, op: "update", fields: new Set(e.fields), seq: ++this.seq });
      } else if (kind === "item" && e.fields.includes("content") && (server as CanvasItem).item_type === "note") {
        const mine = noteText((e.item as CanvasItem).content);
        if (mine !== noteText((server as CanvasItem).content)) this._conflicts.set(e.id, { mine, theirs: server as CanvasItem });
      }
    }
    if (this.dirty.size > 0) {
      this.persist();
      this.setStatus("pending");
      this.schedule(0);
    }
    this.bump();
  }

  // ── Creating ──────────────────────────────────────────────────────────────

  /** A new Canvas-local note at a world point. Returns its id. */
  createNote(at: { x: number; y: number }, size: { width: number; height: number }, text = ""): string {
    const item = this.blank("note", at, size);
    item.content = noteDoc(text);
    item.section_id = sectionAt(this._items.values(), item);
    this.run({
      ids: [item.id],
      redo: () => this.create(item),
      undo: () => this.remove([item.id]),
    });
    return item.id;
  }

  /**
   * A placement of a Project attachment (an image) at a world point, at a
   * size (the image's own proportions, fit — lib/rune2/canvas.ts
   * imagePlacementSize). The attachment is referenced, never copied: a second
   * placement of the same one shows the same bytes. Returns the placement's id.
   */
  addImage(attachment: WorkspaceAttachment, at: { x: number; y: number }, size: { width: number; height: number }): string {
    this._attachments.set(attachment.id, attachment);
    const item = this.blank("image", at, clampSize("image", size));
    item.attachment_id = attachment.id;
    item.label = attachment.file_name.slice(0, 200);
    item.section_id = sectionAt(this._items.values(), item);
    this.run({
      ids: [item.id],
      redo: () => this.create(item),
      undo: () => this.remove([item.id]),
    });
    return item.id;
  }

  /** A placement of a canonical object at a world point. Returns its id. The target is never touched. */
  addPlacement(
    type: CanvasTargetType,
    targetId: string,
    label: string | null,
    at: { x: number; y: number },
    size: { width: number; height: number }
  ): string {
    const item = this.blank(type, at, size);
    item.label = label ? label.slice(0, 200) : null;
    switch (type) {
      case "scene":
        item.scene_id = targetId;
        break;
      case "chapter":
        item.chapter_id = targetId;
        break;
      case "page":
        item.document_id = targetId;
        break;
      case "entry":
        item.entry_id = targetId;
        break;
      case "canvas":
        item.target_canvas_id = targetId;
        break;
    }
    item.section_id = sectionAt(this._items.values(), item);
    this.run({
      ids: [item.id],
      redo: () => this.create(item),
      undo: () => this.remove([item.id]),
    });
    return item.id;
  }

  /**
   * A new Section at a world rect. Cards whose centre it holds become its
   * members at once (one undo entry with the Section itself). Returns its id.
   */
  createSection(rect: Rect, title: string | null = null): string {
    const item = this.blank("section", rect, clampSize("section", rect));
    item.label = title ? title.trim().slice(0, 200) || null : null;
    item.z = 0;
    const gathered = [...this._items.values()].filter((i) => !isSection(i) && sectionAt([item], i) === item.id);
    const before = new Map(gathered.map((i) => [i.id, sectionOf(i)]));
    this.run({
      ids: [item.id, ...before.keys()],
      redo: () => {
        this.create(item);
        for (const id of before.keys()) this.setMembership(id, item.id);
      },
      undo: () => {
        for (const [id, prev] of before) this.setMembership(id, prev);
        this.delete(item.id);
      },
    });
    return item.id;
  }

  /** Renames a Section (blank: untitled). One undo entry. */
  setSectionTitle(id: string, title: string | null): void {
    const item = this._items.get(id);
    if (!item || !isSection(item)) return;
    const next = title ? title.trim().slice(0, 200) || null : null;
    const prev = item.label;
    if (next === prev) return;
    const set = (label: string | null) => {
      const it = this._items.get(id);
      if (!it) return;
      this._items.set(id, { ...it, label });
      this.markDirty(id, ["label"]);
    };
    this.run({ ids: [id], redo: () => set(next), undo: () => set(prev) });
  }

  // ── Moving and sizing ─────────────────────────────────────────────────────

  /**
   * Moves items while a drag is under way: shown at once, not yet an undo
   * entry and not yet saved. `commitMove` ends the drag. Pass the ids with
   * their Sections' members (withMembers) so a Section carries what it holds.
   */
  moveLive(ids: readonly string[], dx: number, dy: number): void {
    for (const id of ids) {
      const item = this._items.get(id);
      if (item) this._items.set(id, { ...item, x: roundCoord(item.x + dx), y: roundCoord(item.y + dy) });
    }
    this.bump();
  }

  /**
   * The drag is over: the items are where moveLive left them. One undo entry
   * for the whole move (every item back to `from`), with membership settled
   * — a card dragged into a Section joins it, one dragged out leaves it —
   * for the cards dragged THEMSELVES (`direct`; default: all of `from`). A
   * card carried along by its Section keeps its membership wherever it lands.
   */
  commitMove(from: ReadonlyMap<string, { x: number; y: number }>, direct?: ReadonlySet<string>): void {
    const to = new Map<string, { x: number; y: number }>();
    for (const [id] of from) {
      const item = this._items.get(id);
      if (item) to.set(id, { x: item.x, y: item.y });
    }
    const moved = [...to].some(([id, p]) => {
      const f = from.get(id)!;
      return f.x !== p.x || f.y !== p.y;
    });
    if (!moved) return;
    const memberBefore = new Map<string, string | null>();
    const memberAfter = new Map<string, string | null>();
    for (const id of to.keys()) {
      const item = this._items.get(id);
      if (!item || isSection(item)) continue;
      // Carried along by its Section (not dragged itself): keeps its membership.
      if (direct && !direct.has(id)) continue;
      const current = sectionOf(item);
      const next = sectionAt(this._items.values(), item);
      if (next !== current) {
        memberBefore.set(id, current);
        memberAfter.set(id, next);
      }
    }
    const place = (where: ReadonlyMap<string, { x: number; y: number }>, members: ReadonlyMap<string, string | null>) => {
      for (const [id, p] of where) {
        const item = this._items.get(id);
        if (!item) continue;
        this._items.set(id, { ...item, x: p.x, y: p.y });
        this.markDirty(id, ["x", "y"]);
      }
      for (const [id, section] of members) this.setMembership(id, section);
    };
    // Already where it should be; the entry records both ends.
    this.push({ ids: [...to.keys()], redo: () => place(to, memberAfter), undo: () => place(from, memberBefore) });
    place(to, memberAfter);
    this.afterChange();
  }

  /** Resizes an item while a drag is under way (the rect may move its origin: a left or top handle). */
  resizeLive(id: string, rect: Rect): void {
    const item = this._items.get(id);
    if (!item) return;
    const size = clampSize(item.item_type, rect);
    this._items.set(id, { ...item, x: roundCoord(rect.x), y: roundCoord(rect.y), width: size.width, height: size.height });
    this.bump();
  }

  /**
   * The resize is over. One undo entry; the size is now the writer's
   * (manual_size), so a note stops growing on its own. A Section's members
   * are untouched: membership is explicit, and a member left outside a
   * shrunken Section stays its member (it still travels with it) until it is
   * dragged out.
   */
  commitResize(id: string, from: Rect): void {
    const item = this._items.get(id);
    if (!item) return;
    const to: Rect = { x: item.x, y: item.y, width: item.width, height: item.height };
    const manualBefore = item.manual_size ?? false;
    if (to.x === from.x && to.y === from.y && to.width === from.width && to.height === from.height) return;
    const apply = (rect: Rect, manual: boolean) => {
      const it = this._items.get(id);
      if (!it) return;
      this._items.set(id, { ...it, ...rect, manual_size: manual });
      this.markDirty(id, ["x", "y", "width", "height", "manual_size"]);
    };
    this.push({ ids: [id], redo: () => apply(to, true), undo: () => apply(from, manualBefore) });
    apply(to, true);
    this.afterChange();
  }

  /**
   * A note being typed into grows to fit its text — until the writer has
   * sized it by hand, and never past NOTE_AUTO_MAX_HEIGHT (then it scrolls).
   * Part of the typing, not an undo entry of its own.
   */
  autoGrowNote(id: string, height: number): void {
    const item = this._items.get(id);
    if (!item || item.item_type !== "note" || item.manual_size) return;
    const next = Math.min(NOTE_AUTO_MAX_HEIGHT, Math.ceil(height));
    if (next <= item.height) return;
    this._items.set(id, { ...item, height: next });
    this.markDirty(id, ["height"]);
    this.afterChange();
  }

  /**
   * Puts items where an arrangement (align, distribute, tidy, a nudge)
   * says, as one undo entry. A Section among them carries its members by
   * the same offset. Membership is unchanged: arranging is housekeeping,
   * not a drag into or out of a Section.
   */
  arrange(to: ReadonlyMap<string, { x: number; y: number }>): void {
    const full = new Map<string, { x: number; y: number }>();
    for (const [id, p] of to) {
      const item = this._items.get(id);
      if (!item) continue;
      full.set(id, { x: roundCoord(p.x), y: roundCoord(p.y) });
      if (!isSection(item)) continue;
      const dx = p.x - item.x;
      const dy = p.y - item.y;
      for (const m of this.membersOf(id)) {
        if (to.has(m)) continue;
        const member = this._items.get(m)!;
        full.set(m, { x: roundCoord(member.x + dx), y: roundCoord(member.y + dy) });
      }
    }
    const from = new Map<string, { x: number; y: number }>();
    for (const [id, p] of [...full]) {
      const item = this._items.get(id)!;
      // Only what actually moves is written.
      if (item.x === p.x && item.y === p.y) full.delete(id);
      else from.set(id, { x: item.x, y: item.y });
    }
    if (full.size === 0) return;
    const place = (where: ReadonlyMap<string, { x: number; y: number }>) => {
      for (const [id, p] of where) {
        const item = this._items.get(id);
        if (!item) continue;
        this._items.set(id, { ...item, x: p.x, y: p.y });
        this.markDirty(id, ["x", "y"]);
      }
    };
    this.run({ ids: [...full.keys()], redo: () => place(full), undo: () => place(from) });
  }

  /** Brings cards to the front: a z above every other card's. Saved, not an undo entry (a selection's side effect). Sections keep their own layer. */
  bringToFront(ids: readonly string[]): void {
    const wanted = new Set(ids.filter((id) => this._items.has(id) && !isSection(this._items.get(id)!)));
    if (wanted.size === 0) return;
    // Already the topmost run: nothing to write.
    const sorted = this.items.filter((i) => !isSection(i));
    if (sorted.slice(-wanted.size).every((i) => wanted.has(i.id))) return;
    let z = nextZ(this._items.values());
    for (const item of sorted) {
      if (!wanted.has(item.id)) continue;
      this._items.set(item.id, { ...item, z: z++ });
      this.markDirty(item.id, ["z"]);
    }
    this.afterChange();
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  /**
   * A note's text as the writer types it: shown at once and saved after a
   * pause. The first change of an edit remembers the text before it;
   * `endNoteEdit` turns the whole edit into one undo entry.
   */
  setNoteText(id: string, text: string): void {
    const item = this._items.get(id);
    if (!item || item.item_type !== "note") return;
    const current = noteText(item.content);
    if (current === text) return;
    if (!this.noteEdits.has(id)) this.noteEdits.set(id, current);
    this._items.set(id, { ...item, content: noteDoc(text) });
    this.markDirty(id, ["content"]);
    this.afterChange();
  }

  /** The writer left the note (blur, Escape, a pause): its edit becomes one undo entry. */
  endNoteEdit(id: string): void {
    const before = this.noteEdits.get(id);
    if (before === undefined) return;
    this.noteEdits.delete(id);
    const item = this._items.get(id);
    if (!item) return;
    const after = noteText(item.content);
    if (before === after) return;
    const set = (text: string) => {
      const it = this._items.get(id);
      if (!it) return;
      this._items.set(id, { ...it, content: noteDoc(text) });
      this.markDirty(id, ["content"]);
    };
    // Already applied: push the entry without running it again.
    this.push({ ids: [id], redo: () => set(after), undo: () => set(before) });
  }

  // ── Connections ───────────────────────────────────────────────────────────

  /**
   * Connects two placements of this Canvas (never a Section, never an item
   * to itself). Returns the connection's id — or, when the two are already
   * connected, that connection's id and nothing new.
   */
  connect(sourceId: string, targetId: string, options: { directed?: boolean; label?: string | null } = {}): string | null {
    const a = this._items.get(sourceId);
    const b = this._items.get(targetId);
    if (!a || !b || sourceId === targetId || isSection(a) || isSection(b)) return null;
    const existing = this.connectionBetween(sourceId, targetId);
    if (existing) return existing.id;
    const now = this.opts.now();
    const c: CanvasConnection = {
      id: this.opts.newId(),
      canvas_id: this.canvasId,
      project_id: this.projectId,
      source_item_id: sourceId,
      target_item_id: targetId,
      directed: options.directed ?? false,
      label: options.label?.trim().slice(0, 200) || null,
      version: 0,
      created_at: now,
      updated_at: now,
    };
    this.run({
      ids: [c.id, sourceId, targetId],
      redo: () => this.createConnection(c),
      undo: () => this.deleteConnection(c.id),
    });
    return c.id;
  }

  /** The connection between two placements, either way round, or undefined. */
  connectionBetween(a: string, b: string): CanvasConnection | undefined {
    for (const c of this._connections.values()) {
      if ((c.source_item_id === a && c.target_item_id === b) || (c.source_item_id === b && c.target_item_id === a)) return c;
    }
    return undefined;
  }

  /** The connections touching any of `ids`. */
  connectionsOf(ids: Iterable<string>): CanvasConnection[] {
    const set = new Set(ids);
    return [...this._connections.values()].filter((c) => set.has(c.source_item_id) || set.has(c.target_item_id));
  }

  /** Changes a connection's direction and/or label. One undo entry. */
  setConnection(id: string, change: { directed?: boolean; label?: string | null }): void {
    const c = this._connections.get(id);
    if (!c) return;
    const next = {
      directed: change.directed ?? c.directed,
      label: change.label === undefined ? c.label : change.label?.trim().slice(0, 200) || null,
    };
    if (next.directed === c.directed && next.label === c.label) return;
    const prev = { directed: c.directed, label: c.label };
    const fields: ConnectionField[] = [];
    if (next.directed !== c.directed) fields.push("directed");
    if (next.label !== c.label) fields.push("label");
    const set = (v: { directed: boolean; label: string | null }) => {
      const cur = this._connections.get(id);
      if (!cur) return;
      this._connections.set(id, { ...cur, ...v });
      this.markDirty(id, fields, "connection");
    };
    this.run({ ids: [id], redo: () => set(next), undo: () => set(prev) });
  }

  /** Removes connections — only connections. */
  removeConnections(ids: readonly string[]): void {
    const removed = ids.map((id) => this._connections.get(id)).filter((c): c is CanvasConnection => Boolean(c));
    if (removed.length === 0) return;
    this.run({
      ids: removed.flatMap((c) => [c.id, c.source_item_id, c.target_item_id]),
      redo: () => {
        for (const c of removed) this.deleteConnection(c.id);
      },
      undo: () => {
        for (const c of removed) this.createConnection(c);
      },
    });
  }

  // ── Removing ──────────────────────────────────────────────────────────────

  /**
   * Removes placements, notes and Sections. The objects they showed are
   * untouched. A removed Section's members stay where they are, now
   * unsectioned; a removed placement's connections go with it. Undo brings
   * all of it back.
   */
  remove(ids: readonly string[]): void {
    const removed = ids.map((id) => this._items.get(id)).filter((i): i is CanvasItem => Boolean(i));
    if (removed.length === 0) return;
    const gone = new Set(removed.map((i) => i.id));
    const connections = this.connectionsOf(gone);
    // Members of removed Sections that are not removed themselves: let go.
    const released = new Map<string, string>();
    for (const s of removed) {
      if (!isSection(s)) continue;
      for (const m of this.membersOf(s.id)) if (!gone.has(m)) released.set(m, s.id);
    }
    this.run({
      ids: [...gone, ...released.keys(), ...connections.map((c) => c.id)],
      redo: () => {
        for (const c of connections) this.deleteConnection(c.id);
        for (const m of released.keys()) this.setMembership(m, null);
        for (const item of removed) this.delete(item.id);
      },
      undo: () => {
        for (const item of removed) this.create(item);
        for (const [m, s] of released) this.setMembership(m, s);
        for (const c of connections) this.createConnection(c);
      },
    });
  }

  // ── Copying ───────────────────────────────────────────────────────────────

  /**
   * What ⌘C takes of a selection: the rows themselves (with their Sections'
   * members, and the connections among all of those), to lay down again.
   */
  clip(ids: readonly string[]): CanvasClip {
    const all = new Set(this.withMembers(ids));
    const items = this.items.filter((i) => all.has(i.id));
    const connections = this.connections.filter((c) => all.has(c.source_item_id) && all.has(c.target_item_id));
    return { items, connections };
  }

  /**
   * Lays a clip down as NEW rows at an offset, as one undo entry: a note is a
   * second, independent note with the same text; a live card is another
   * placement of the same object (never a copy of the object); a Section is
   * a new Section holding copies of its members; connections are reproduced
   * only between copied items. A placement of this very Canvas is skipped
   * (a Canvas never links to itself). Returns the ids of the new rows that
   * correspond to `ids` (the ones the writer selected), or all when none given.
   */
  paste(clip: CanvasClip, offset: { x: number; y: number }, ids?: readonly string[]): string[] {
    const map = new Map<string, string>();
    const now = this.opts.now();
    let z = nextZ(this._items.values());
    const items: CanvasItem[] = [];
    const ordered = [...clip.items].sort((a, b) => Number(isSection(b)) - Number(isSection(a)) || byStacking(a, b));
    for (const src of ordered) {
      if (src.item_type === "canvas" && src.target_canvas_id === this.canvasId) continue;
      const id = this.opts.newId();
      map.set(src.id, id);
      items.push({
        ...src,
        id,
        canvas_id: this.canvasId,
        project_id: this.projectId,
        x: roundCoord(src.x + offset.x),
        y: roundCoord(src.y + offset.y),
        z: isSection(src) ? src.z : z++,
        section_id: null, // settled below
        version: 0,
        created_at: now,
        updated_at: now,
      });
    }
    for (const item of items) {
      if (isSection(item)) continue;
      const srcSection = sectionOf(clip.items.find((s) => map.get(s.id) === item.id)!);
      const copied = srcSection ? map.get(srcSection) : undefined;
      item.section_id = copied ?? sectionAt([...this._items.values(), ...items], item);
    }
    const connections: CanvasConnection[] = [];
    for (const c of clip.connections) {
      const s = map.get(c.source_item_id);
      const t = map.get(c.target_item_id);
      if (!s || !t) continue;
      connections.push({ ...c, id: this.opts.newId(), canvas_id: this.canvasId, project_id: this.projectId, source_item_id: s, target_item_id: t, version: 0, created_at: now, updated_at: now });
    }
    if (items.length === 0) return [];
    this.run({
      ids: [...items.map((i) => i.id), ...connections.map((c) => c.id)],
      redo: () => {
        for (const item of items) this.create(item);
        for (const c of connections) this.createConnection(c);
      },
      undo: () => {
        for (const c of connections) this.deleteConnection(c.id);
        for (const item of items) this.delete(item.id);
      },
    });
    const wanted = ids ? ids.map((id) => map.get(id)).filter((x): x is string => Boolean(x)) : items.map((i) => i.id);
    return wanted;
  }

  /** ⌘D: the selection laid down again a little offset. Returns the new ids. */
  duplicate(ids: readonly string[], offset = { x: 24, y: 24 }): string[] {
    return this.paste(this.clip(ids), offset, ids);
  }

  // ── History ───────────────────────────────────────────────────────────────

  undo(): void {
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    cmd.undo();
    this.redoStack.push(cmd);
    this.afterChange();
  }

  redo(): void {
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    cmd.redo();
    this.undoStack.push(cmd);
    this.afterChange();
  }

  /** Resolves a note conflict by saving this window's text over the server's current version. */
  keepMine(id: string): void {
    const c = this._conflicts.get(id);
    if (!c) return;
    this._conflicts.delete(id);
    const item = this._items.get(id) ?? c.theirs;
    this._items.set(id, { ...item, version: c.theirs.version, content: noteDoc(c.mine) });
    this.markDirty(id, ["content"]);
    this.afterChange();
  }

  /** Resolves a note conflict with the server's text (already shown). */
  acceptServer(id: string): void {
    if (!this._conflicts.delete(id)) return;
    this.bump();
  }

  // ── Promotion: a note becomes a Page or a Scene ───────────────────────────

  /**
   * Whether a note is ready to be converted: it exists, is a note, has
   * reached the server (a conversion is server-side, of the saved row), has
   * no unresolved conflict and isn't stranded. The surface flushes first.
   */
  canConvert(id: string): boolean {
    const item = this._items.get(id);
    if (!item || item.item_type !== "note") return false;
    if (item.version === 0 || this.dirty.has(id) || this._conflicts.has(id) || this._stranded.has(id)) return false;
    return !this.halted();
  }

  /** The text a conversion carries: the note's document as this window shows it. */
  noteContentOf(id: string): Record<string, unknown> | null {
    const item = this._items.get(id);
    return item?.item_type === "note" ? (item.content ?? noteDoc("")) : null;
  }

  /**
   * The server converted a note (convert_canvas_note): the note is gone,
   * replaced by a live placement of the new Page or Scene with the
   * connections re-made. Applied as the server's truth — nothing dirty,
   * nothing to undo: a conversion is not undoable (undoing it would mean
   * deleting a canonical Page or Scene, which no Canvas command may do).
   * History entries that touched the note are dropped; the rest stays.
   */
  applyConversion(noteId: string, item: CanvasItem, connections: CanvasConnection[]): void {
    this._items.delete(noteId);
    this.dirty.delete(noteId);
    this._stranded.delete(noteId);
    this._conflicts.delete(noteId);
    this.noteEdits.delete(noteId);
    for (const c of this.connectionsOf([noteId])) {
      this._connections.delete(c.id);
      this.dirty.delete(c.id);
    }
    this._items.set(item.id, item);
    for (const c of connections) {
      this._connections.set(c.id, c);
      this.dirty.delete(c.id);
    }
    this.forgetHistoryOf([noteId]);
    this.persist();
    this.bump();
  }

  /** Drops every undo and redo entry that touches any of `ids`. */
  forgetHistoryOf(ids: readonly string[]): void {
    const set = new Set(ids);
    const keep = (cmd: Command) => !cmd.ids.some((id) => set.has(id));
    this.undoStack = this.undoStack.filter(keep);
    this.redoStack = this.redoStack.filter(keep);
  }

  // ── Saving ────────────────────────────────────────────────────────────────

  /** Saves now whatever is unsaved; resolves once it is on the server, or once a save fails or the Canvas is gone. */
  async flush(): Promise<void> {
    this.clearTimer();
    for (;;) {
      if (this.running) {
        await this.running;
        continue;
      }
      if (this.dirty.size === 0 || this.halted() || this.disposed) return;
      const failuresBefore = this.failures;
      await this.save();
      if (this.failures > failuresBefore) return;
    }
  }

  /** Saving can continue (back from Trash): whatever is unsaved is saved now. */
  async resume(): Promise<void> {
    if (this._status !== "trashed" && this._status !== "unavailable") return;
    this.failures = 0;
    this.setStatus(this.dirty.size > 0 ? "pending" : "saved");
    await this.flush();
  }

  /** Stops timers; unsaved changes stay on the device. */
  dispose(): void {
    this.disposed = true;
    this.clearTimer();
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private blank(type: CanvasItemType, at: { x: number; y: number }, size: { width: number; height: number }): CanvasItem {
    const now = this.opts.now();
    return {
      id: this.opts.newId(),
      canvas_id: this.canvasId,
      project_id: this.projectId,
      item_type: type,
      scene_id: null,
      chapter_id: null,
      document_id: null,
      entry_id: null,
      target_canvas_id: null,
      label: null,
      content: null,
      x: roundCoord(at.x),
      y: roundCoord(at.y),
      width: size.width,
      height: size.height,
      z: nextZ(this._items.values()),
      section_id: null,
      manual_size: false,
      version: 0,
      created_at: now,
      updated_at: now,
    };
  }

  private setMembership(id: string, section: string | null) {
    const item = this._items.get(id);
    if (!item || isSection(item) || sectionOf(item) === section) return;
    if (section && !this._items.has(section)) return;
    this._items.set(id, { ...item, section_id: section });
    this.markDirty(id, ["section_id"]);
  }

  private create(item: CanvasItem) {
    // A member whose Section is gone (deleted elsewhere, say) is simply unsectioned.
    const section = sectionOf(item);
    this._items.set(item.id, section && !this._items.has(section) ? { ...item, section_id: null } : item);
    const d = this.dirty.get(item.id);
    // A delete not yet sent cancels out against the create: the row is back as it was... unless
    // the row never reached the server (version 0), which must still be created.
    if (d?.op === "delete" && item.version > 0 && !this.inFlight?.has(item.id)) {
      this.dirty.delete(item.id);
      return;
    }
    this.dirty.set(item.id, { kind: "item", op: "create", fields: new Set(), seq: ++this.seq });
  }

  private delete(id: string) {
    // A stranded row the writer removes is simply gone: it never reached the server.
    const wasStranded = this._stranded.delete(id);
    if (!this._items.delete(id)) return;
    if (wasStranded) {
      for (const m of this.membersOf(id)) this._items.set(m, { ...this._items.get(m)!, section_id: null });
      for (const c of this.connectionsOf([id])) this.deleteConnection(c.id);
      this.dirty.delete(id);
      return;
    }
    // What the server does on delete (SET NULL, CASCADE), done here too, so the window agrees with it.
    for (const m of this.membersOf(id)) this._items.set(m, { ...this._items.get(m)!, section_id: null });
    for (const c of this.connectionsOf([id])) this.deleteConnection(c.id);
    const d = this.dirty.get(id);
    // A create that never left this window simply never happens.
    if (d?.op === "create" && !this.inFlight?.has(id)) {
      this.dirty.delete(id);
      return;
    }
    this.dirty.set(id, { kind: "item", op: "delete", fields: new Set(), seq: ++this.seq });
  }

  private createConnection(c: CanvasConnection) {
    if (!this._items.has(c.source_item_id) || !this._items.has(c.target_item_id)) return;
    this._connections.set(c.id, c);
    const d = this.dirty.get(c.id);
    if (d?.op === "delete" && c.version > 0 && !this.inFlight?.has(c.id)) {
      this.dirty.delete(c.id);
      return;
    }
    this.dirty.set(c.id, { kind: "connection", op: "create", fields: new Set(), seq: ++this.seq });
  }

  private deleteConnection(id: string) {
    if (!this._connections.delete(id)) return;
    const d = this.dirty.get(id);
    if (d?.op === "create" && !this.inFlight?.has(id)) {
      this.dirty.delete(id);
      return;
    }
    this.dirty.set(id, { kind: "connection", op: "delete", fields: new Set(), seq: ++this.seq });
  }

  private markDirty(id: string, fields: readonly Field[], kind: Kind = "item") {
    // A stranded row changes only here: the row itself holds the change, the
    // draft carries it, and this server is never asked again.
    if (this._stranded.has(id)) return;
    const d = this.dirty.get(id);
    if (d?.op === "create" && !this.inFlight?.has(id)) {
      d.seq = ++this.seq; // the create carries the whole row
      return;
    }
    if (d?.op === "update") {
      for (const f of fields) d.fields.add(f);
      d.seq = ++this.seq;
      return;
    }
    if (d?.op === "create") {
      // Sent, not yet acknowledged: the fields go in a following update.
      this.dirty.set(id, { kind, op: "update", fields: new Set(fields), seq: ++this.seq });
      return;
    }
    this.dirty.set(id, { kind, op: "update", fields: new Set(fields), seq: ++this.seq });
  }

  private run(cmd: Command) {
    cmd.redo();
    this.push(cmd);
    this.afterChange();
  }

  private push(cmd: Command) {
    this.undoStack.push(cmd);
    if (this.undoStack.length > UNDO_MAX) this.undoStack.shift();
    this.redoStack = [];
  }

  private afterChange() {
    this.persist();
    this.bump();
    if (this.dirty.size === 0) {
      if (this._status === "pending") this.setStatus("saved");
      return;
    }
    if (this.halted() || this.disposed) return;
    if (this._status === "saved") this.setStatus("pending");
    if (this._status === "pending") this.schedule(this.opts.delay);
  }

  private bump() {
    this._revision += 1;
    this.opts.onChange?.();
    this.listeners.forEach((l) => l());
  }

  private halted(): boolean {
    return this._status === "trashed" || this._status === "unavailable" || this._status === "unsupported";
  }

  private rowOf(kind: Kind, id: string): CanvasItem | CanvasConnection | undefined {
    return kind === "item" ? this._items.get(id) : this._connections.get(id);
  }

  private persist() {
    const entries: CanvasDraft["entries"] = [];
    // What is unsaved, and what this server refused as unsupported (a newer
    // client replays both from the draft).
    for (const [id, d] of [...this._stranded, ...this.dirty]) {
      entries.push({ id, kind: d.kind, op: d.op, fields: [...d.fields], item: d.op === "delete" ? null : (this.rowOf(d.kind, id) ?? null) });
    }
    try {
      this.opts.persist?.({ canvasId: this.canvasId, entries });
    } catch {
      // The device copy is a convenience; the server save still runs.
    }
  }

  private setStatus(status: CanvasSaveStatus) {
    if (this._status === status) return;
    this._status = status;
    this.opts.onStatus?.(status);
    this.bump();
  }

  private clearTimer() {
    if (this.timer !== null) {
      this.opts.timers.clear(this.timer);
      this.timer = null;
    }
  }

  private schedule(ms: number) {
    this.clearTimer();
    this.timer = this.opts.timers.set(() => {
      this.timer = null;
      void this.save();
    }, ms);
  }

  private save(): Promise<void> {
    if (this.running) return this.running;
    if (this.dirty.size === 0 || this.halted() || this.disposed) {
      if (this.dirty.size === 0 && !this.halted()) this.setStatus("saved");
      return Promise.resolve();
    }
    this.running = this.attempt().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /**
   * The batch, in an order the server can take in one pass: Sections are
   * created before their members, items before the connections between
   * them, members are updated (let go) before their Section is deleted,
   * and connections are deleted before the items they join.
   */
  private changes(): { changes: CanvasChange[]; sent: Map<string, number> } {
    const sent = new Map<string, number>();
    const rank = (id: string, d: Dirty): number => {
      if (d.op === "create") {
        if (d.kind === "connection") return 2;
        return isSection(this._items.get(id)!) ? 0 : 1;
      }
      if (d.op === "update") return d.kind === "item" ? 3 : 4;
      if (d.kind === "connection") return 5;
      return 6;
    };
    const ordered = [...this.dirty].sort((a, b) => rank(a[0], a[1]) - rank(b[0], b[1]) || a[1].seq - b[1].seq);
    const changes: CanvasChange[] = [];
    for (const [id, d] of ordered) {
      sent.set(id, d.seq);
      if (d.kind === "connection") {
        if (d.op === "delete") {
          changes.push({ kind: "connection", op: "delete", id });
          continue;
        }
        const c = this._connections.get(id);
        if (!c) continue;
        if (d.op === "create") {
          changes.push({ kind: "connection", op: "create", id, source_id: c.source_item_id, target_id: c.target_item_id, directed: c.directed, label: c.label });
          continue;
        }
        const change: CanvasChange = { kind: "connection", op: "update", id, expected_version: c.version };
        for (const f of d.fields) {
          if (f === "directed") change.directed = c.directed;
          else if (f === "label") change.label = c.label;
        }
        changes.push(change);
        continue;
      }
      if (d.op === "delete") {
        changes.push({ op: "delete", id });
        continue;
      }
      const item = this._items.get(id);
      if (!item) continue;
      if (d.op === "create") {
        changes.push({
          op: "create",
          id,
          item_type: item.item_type,
          target_id: targetOf(item),
          label: item.label,
          content: item.content,
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
          z: item.z,
          section_id: sectionOf(item),
          manual_size: item.manual_size ?? false,
        });
        continue;
      }
      const change: CanvasChange = { op: "update", id, expected_version: item.version };
      for (const f of d.fields) {
        if (f === "content") {
          if (item.content) change.content = item.content;
        } else if (f === "section_id") change.section_id = sectionOf(item);
        else if (f === "manual_size") change.manual_size = item.manual_size ?? false;
        else if (f === "label") change.label = item.label;
        else if (f === "directed") continue;
        else change[f] = item[f];
      }
      changes.push(change);
    }
    return { changes, sent };
  }

  private async attempt(): Promise<void> {
    const { changes, sent } = this.changes();
    if (changes.length === 0) {
      this.setStatus("saved");
      return;
    }
    this.inFlight = sent;
    this.setStatus("saving");
    let outcome: CanvasWriteOutcome;
    try {
      outcome = await this.opts.write(changes);
    } catch (e) {
      outcome = { status: "error", error: e instanceof Error ? e.message : "Network error" };
    }
    this.inFlight = null;
    if (this.disposed) return;

    if (outcome.status === "trashed" || outcome.status === "not_found") {
      this.setStatus(outcome.status === "trashed" ? "trashed" : "unavailable");
      return;
    }
    if (outcome.status === "error") {
      if (isUnsupportedError(outcome.error)) {
        // This server can't take this client's saves at all: nothing is
        // retried (it would never succeed) and nothing is dropped — every
        // change stays dirty on the device for the reloaded client.
        this.persist();
        this.setStatus("unsupported");
        return;
      }
      this.failures += 1;
      this.setStatus("retrying");
      const delays = this.opts.retryDelays;
      this.schedule(delays[Math.min(this.failures - 1, delays.length - 1)]);
      return;
    }

    this.failures = 0;
    for (const r of outcome.results) {
      const seq = sent.get(r.id);
      const d = this.dirty.get(r.id);
      // Changed again while the batch was in flight: stays dirty, saved next.
      const stale = d !== undefined && seq !== undefined && d.seq !== seq;
      const kind: Kind = d?.kind ?? (this._connections.has(r.id) ? "connection" : "item");
      const rows = kind === "item" ? this._items : this._connections;
      const row = rows.get(r.id);
      switch (r.status) {
        case "ok":
          if (row && r.version !== undefined) (rows as Map<string, CanvasItem | CanvasConnection>).set(r.id, { ...row, version: r.version });
          if (!stale) this.dirty.delete(r.id);
          else if (d.op === "create") d.op = "update"; // it exists now; what changed since goes as an update
          break;
        case "conflict": {
          // The other window's row stands. Geometry, membership, a label: so
          // be it. A note whose text differed here: kept for the writer to choose.
          if (kind === "item" && (row as CanvasItem | undefined)?.item_type === "note" && d?.fields.has("content")) {
            const mine = noteText((row as CanvasItem).content);
            if (mine !== noteText((r.item as CanvasItem).content)) this._conflicts.set(r.id, { mine, theirs: r.item as CanvasItem });
          }
          if (row) {
            const kept = stale && d ? pick(row, [...d.fields].filter((f) => f !== "content")) : {};
            (rows as Map<string, CanvasItem | CanvasConnection>).set(r.id, { ...r.item, ...kept });
            if (stale && d) d.fields.delete("content");
            else this.dirty.delete(r.id);
          } else this.dirty.delete(r.id);
          break;
        }
        case "missing":
          // Deleted elsewhere: it is gone here too (with what the server would take with it).
          if (kind === "item") this.dropLocal(r.id);
          else this._connections.delete(r.id);
          this.dirty.delete(r.id);
          break;
        case "error": {
          // Unsupported by this server (a placement type it doesn't know),
          // or the writer's own content refused for any reason: kept —
          // shown, on the device, never retried here (never valid on this
          // server), replayed by a newer client. Anything else is invalid
          // (a target gone to Trash before the create landed, say): never
          // valid later, dropped, never retried forever.
          const authored = kind === "item" && isAuthored(row as CanvasItem | undefined);
          const strand = d && !stale && (isUnsupportedError(r.error) || (authored && d.op === "create" && !isUnsupportedError(r.error) && (row as CanvasItem).item_type === "note"));
          if (strand && d) {
            this._stranded.set(r.id, { ...d, fields: new Set(d.fields) });
            this.dirty.delete(r.id);
            break;
          }
          if (d?.op === "create" && !stale) {
            if (kind === "item") this.dropLocal(r.id);
            else this._connections.delete(r.id);
          }
          if (!stale) this.dirty.delete(r.id);
          break;
        }
      }
    }
    this.persist();
    this.bump();
    if (this.dirty.size > 0) {
      this.setStatus("pending");
      this.schedule(this.opts.delay);
    } else this.setStatus("saved");
  }

  /** An item the server no longer has: gone here, its members let go, its connections with it (no save: the server did the same). */
  private dropLocal(id: string) {
    this._stranded.delete(id);
    if (!this._items.delete(id)) return;
    for (const m of this.membersOf(id)) this._items.set(m, { ...this._items.get(m)!, section_id: null });
    for (const c of this.connectionsOf([id])) {
      this._connections.delete(c.id);
      this.dirty.delete(c.id);
    }
  }
}

function targetOf(item: CanvasItem): string | null {
  return item.scene_id ?? item.chapter_id ?? item.document_id ?? item.entry_id ?? item.target_canvas_id ?? attachmentIdOf(item);
}

function pick<T extends object>(row: T, fields: readonly Field[]): Partial<T> {
  const out: Partial<T> = {};
  for (const f of fields) if (f in row) (out as Record<string, unknown>)[f] = (row as Record<string, unknown>)[f];
  return out;
}

export { GEOMETRY as CANVAS_GEOMETRY_FIELDS };
