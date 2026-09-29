import type { NoteWriteResult } from "@/lib/actions/revisionNotes";
import type { NoteTargetType, RevisionNote } from "./revisionNotes";

// The Revision Note sync engine: what makes a note the writer typed durable
// before the server has it. Every create, edit and delete is first a PENDING
// change, kept in memory and on the device (storage, below), and shown at
// once; it leaves only when the server has it, or when the writer explicitly
// chooses otherwise in a conflict. So a failed save, a lost connection,
// moving to another Scene, closing the Inspector or reloading never loses a
// note: the pending change is still there and is sent again — on the next
// change, a timer, reconnecting, the window regaining focus, or a reload.
//
// One pending change per note, coalesced (create + edit = create with the new
// text; edit + delete = delete). Sends are one at a time. Every change a send
// was based on carries a revision, so a change made while its send was in
// flight is never cleared by that send's answer.
//
// Never a silent overwrite: an edit or delete says which version it was based
// on, and a newer note elsewhere answers 'conflict' — the change stops and
// waits for the writer to choose ("keep mine" or "use theirs"). An edit of a
// note deleted elsewhere waits too ('missing'). A note whose Chapter or Scene
// is in Trash waits ('unavailable') and is tried again when notes are read
// again (e.g. after a restore).
//
// Separate from the Scene prose save engine (lib/offline): notes never enter
// the Scene queue, and nothing here touches a Scene. Pure apart from its
// injected transport and storage, so the tests run it against the real
// actions and a failing network.

export type PendingState =
  /** Waiting to be sent (or being sent). */
  | "pending"
  /** The note changed elsewhere; `remote` is what is stored. The writer chooses. */
  | "conflict"
  /** Edited here, deleted elsewhere. The writer chooses. */
  | "missing"
  /** Its Chapter or Scene is in Trash or gone; tried again on the next read. */
  | "unavailable"
  /** Refused as invalid (never expected). Kept, with its text, until the writer discards it. */
  | "refused";

export type PendingNote = {
  noteId: string;
  userId: string;
  projectId: string;
  kind: "create" | "update" | "delete";
  targetType: NoteTargetType;
  targetId: string;
  /** The text to save (create/update), or the text last seen (delete). */
  body: string;
  /** The version the change is based on (0 for a create). */
  baseVersion: number;
  /** When the writer made the note (a create) or the change. ISO. */
  queuedAt: string;
  state: PendingState;
  /** On conflict: what the server holds. */
  remote: RevisionNote | null;
  /** Bumped by every local change; a send's answer applies only to the revision it sent. */
  rev: number;
};

export type NoteTransport = {
  list(projectId: string): Promise<{ data: RevisionNote[]; error: null } | { data: null; error: string }>;
  create(id: string, targetType: NoteTargetType, targetId: string, body: string): Promise<NoteWriteResult>;
  update(id: string, body: string, baseVersion: number | null): Promise<NoteWriteResult>;
  remove(id: string, baseVersion: number | null): Promise<NoteWriteResult>;
};

export type NoteStorage = {
  load(userId: string, projectId: string): Promise<PendingNote[]>;
  put(pending: PendingNote): Promise<void>;
  remove(noteId: string): Promise<void>;
};

/** A note as a context shows it: the stored note with any pending change applied. */
export type ShownNote = {
  id: string;
  target_type: NoteTargetType;
  target_id: string;
  body: string;
  version: number;
  created_at: string;
  /** Not on the server yet (or not in this form). */
  pending: PendingState | null;
  /** On conflict: the stored text the writer may take instead. */
  remote: RevisionNote | null;
  /** The pending change is a delete (shown only while it is in conflict). */
  deleting: boolean;
};

const RETRY_MS = [2_000, 5_000, 15_000, 30_000, 60_000];

export type NoteSyncOptions = {
  transport: NoteTransport;
  storage: NoteStorage;
  userId: string;
  projectId: string;
  newId?: () => string;
  now?: () => Date;
  /** Schedules a retry; returns a cancel. Tests pass a manual clock. */
  schedule?: (fn: () => void, ms: number) => () => void;
};

export class NoteSync {
  private server = new Map<string, RevisionNote>();
  private pending = new Map<string, PendingNote>();
  private listeners = new Set<() => void>();
  private snapshot: ShownNote[] = [];
  private flushing: Promise<void> | null = null;
  private again = false;
  private attempts = 0;
  private cancelRetry: (() => void) | null = null;
  /** Writes applied since a read began are newer than that read. */
  private seq = 0;
  private touched = new Map<string, number>();
  private disposed = false;
  private lastQueued = 0;
  private readStructure: string | null = null;
  loaded = false;
  loadFailed = false;
  /** Whether the latest send failed for a reason the network may fix. */
  offline = false;

  constructor(private readonly o: NoteSyncOptions) {}

  // ── Reading ───────────────────────────────────────────────────────────

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  /** Every note this device knows, with pending changes applied (a pending delete hides its note). */
  notes = (): ShownNote[] => this.snapshot;

  pendingChanges(): PendingNote[] {
    return [...this.pending.values()];
  }

  /** Reads the device's pending changes, then the server's notes, then sends what is waiting. */
  async start(): Promise<void> {
    this.disposed = false;
    try {
      const stored = await this.o.storage.load(this.o.userId, this.o.projectId);
      for (const p of stored) {
        // A change made here before storage answered is newer.
        if (!this.pending.has(p.noteId)) this.pending.set(p.noteId, { ...p, state: p.state === "unavailable" ? "pending" : p.state });
      }
    } catch {
      // Storage unavailable: in-memory only.
    }
    this.emit();
    await this.refresh();
  }

  /** Reads the server's notes again (after a restore, a structure change, reconnecting), then sends. */
  async refresh(): Promise<void> {
    const startedAt = this.seq;
    let r;
    try {
      r = await this.o.transport.list(this.o.projectId);
    } catch {
      r = null;
    }
    if (this.disposed) return;
    if (!r || r.error !== null) {
      if (!this.loaded) this.loadFailed = true;
      this.emit();
      return;
    }
    const next = new Map(r.data.map((n) => [n.id, n]));
    // Keep what was written after this read began: the read can't know it.
    for (const [id, at] of this.touched) {
      if (at <= startedAt) continue;
      const mine = this.server.get(id);
      if (mine) next.set(id, mine);
      else next.delete(id);
    }
    this.server = next;
    this.loaded = true;
    this.loadFailed = false;
    // Notes waiting on a trashed target are worth trying again now.
    for (const p of this.pending.values()) if (p.state === "unavailable") p.state = "pending";
    this.emit();
    await this.flush();
  }

  /**
   * The live structure (a key of every active Group, Chapter and Scene id)
   * the notes should be read for. Reads the notes again when it differs from
   * the structure they were last read for — compared with the LAST read, not
   * the first: restoring from Trash brings the structure back to an earlier
   * value, and the restored target's notes must be read back (RLS hid them
   * while it was in Trash). The first call only records the structure.
   */
  async structureChanged(key: string): Promise<void> {
    if (this.readStructure === null) {
      this.readStructure = key;
      return;
    }
    if (key === this.readStructure) return;
    this.readStructure = key;
    await this.refresh();
  }

  // ── Writing ───────────────────────────────────────────────────────────

  /** Adds a note. Blank text adds nothing. Returns the new note's id. */
  create(targetType: NoteTargetType, targetId: string, body: string): string | null {
    if (body.trim() === "") return null;
    const noteId = (this.o.newId ?? (() => crypto.randomUUID()))();
    this.put({
      noteId,
      userId: this.o.userId,
      projectId: this.o.projectId,
      kind: "create",
      targetType,
      targetId,
      body,
      baseVersion: 0,
      queuedAt: this.now(),
      state: "pending",
      remote: null,
      rev: 1,
    });
    void this.flush();
    return noteId;
  }

  /** Changes a note's text. Blank text deletes the note (a blank note is never stored). */
  edit(noteId: string, body: string): void {
    if (body.trim() === "") return this.remove(noteId);
    const current = this.pending.get(noteId);
    if (current) {
      if (current.kind === "delete") return;
      if (current.body === body) return;
      this.put({ ...current, body, rev: current.rev + 1, state: current.state === "pending" ? "pending" : current.state });
    } else {
      const stored = this.server.get(noteId);
      if (!stored || stored.body === body) return;
      this.put(this.change(stored, "update", body));
    }
    void this.flush();
  }

  /** Deletes a note — only that one. */
  remove(noteId: string): void {
    const current = this.pending.get(noteId);
    if (current) {
      if (current.kind === "delete") return;
      // A create that may or may not have landed: delete it regardless of version.
      const base = current.kind === "create" ? -1 : current.baseVersion;
      this.put({ ...current, kind: "delete", baseVersion: base, rev: current.rev + 1, state: "pending", remote: null });
    } else {
      const stored = this.server.get(noteId);
      if (!stored) return;
      this.put(this.change(stored, "delete", stored.body));
    }
    void this.flush();
  }

  /**
   * The writer's choice for a note waiting on them:
   *  - "mine": save this device's version over the stored one (an edit, or a
   *    delete), or — for a note deleted elsewhere — save it again as a new note;
   *  - "theirs": drop this device's change and take what is stored (or, for a
   *    note deleted elsewhere / refused, let it go).
   */
  resolve(noteId: string, choice: "mine" | "theirs"): void {
    const p = this.pending.get(noteId);
    if (!p) return;
    if (choice === "theirs") {
      if (p.remote) this.applyServer(p.remote);
      else if (p.state === "missing") this.applyServer(null, noteId);
      this.drop(noteId);
      this.emit();
      return;
    }
    if (p.state === "conflict" && p.remote) {
      this.put({ ...p, baseVersion: p.remote.version, state: "pending", remote: null, rev: p.rev + 1 });
    } else if (p.state === "missing") {
      this.drop(noteId);
      this.applyServer(null, noteId);
      this.create(p.targetType, p.targetId, p.body);
      return;
    } else {
      this.put({ ...p, state: "pending", rev: p.rev + 1 });
    }
    void this.flush();
  }

  /**
   * Sends every pending change, one at a time, until none is waiting or the
   * network fails (then a retry is scheduled). Concurrent calls share one run.
   */
  flush(): Promise<void> {
    if (this.flushing) {
      this.again = true;
      return this.flushing;
    }
    // Cleared asynchronously (a .finally callback), so never before it is set.
    const run = this.drain().finally(() => {
      this.flushing = null;
    });
    this.flushing = run;
    return run;
  }

  private async drain(): Promise<void> {
    do {
      this.again = false;
      for (const p of [...this.pending.values()].sort((a, b) => a.queuedAt.localeCompare(b.queuedAt))) {
        if (this.disposed) return;
        const live = this.pending.get(p.noteId);
        if (!live || live.state !== "pending") continue;
        if (!(await this.send(live))) {
          this.scheduleRetry();
          return;
        }
      }
    } while (this.again && !this.disposed);
    this.attempts = 0;
  }

  /** Stops sending and retrying (the pending changes stay on the device). start() resumes. */
  dispose() {
    this.disposed = true;
    this.cancelRetry?.();
    this.cancelRetry = null;
  }

  // ── Internals ─────────────────────────────────────────────────────────

  /** Sends one change. false: the network (or server) failed and the change waits. */
  private async send(p: PendingNote): Promise<boolean> {
    let r: NoteWriteResult;
    try {
      r =
        p.kind === "create"
          ? await this.o.transport.create(p.noteId, p.targetType, p.targetId, p.body)
          : p.kind === "update"
            ? await this.o.transport.update(p.noteId, p.body, p.baseVersion)
            : await this.o.transport.remove(p.noteId, p.baseVersion < 0 ? null : p.baseVersion);
    } catch {
      r = { status: "error", error: "network" };
    }
    if (this.disposed) return false;
    const now = this.pending.get(p.noteId);
    const current = now && now.rev === p.rev;

    switch (r.status) {
      case "ok": {
        this.offline = false;
        if (p.kind === "delete") this.applyServer(null, p.noteId);
        else if (r.note) this.applyServer(r.note);
        if (current) this.drop(p.noteId);
        else if (now && r.note && now.kind !== "create") {
          // Changed while in flight: the rest is based on what just landed.
          this.put({ ...now, baseVersion: now.baseVersion < 0 ? -1 : r.note.version });
        } else if (now && r.note && now.kind === "create") {
          // Created with older text, edited meanwhile: the new text is an edit of it.
          this.put({ ...now, kind: "update", baseVersion: r.note.version });
        }
        this.emit();
        return true;
      }
      case "conflict": {
        this.offline = false;
        // Their version already says what mine says: nothing to choose.
        if (p.kind === "update" && r.note.body === p.body) {
          this.applyServer(r.note);
          if (current) this.drop(p.noteId);
          else if (now) this.put({ ...now, baseVersion: r.note.version });
          this.emit();
          return true;
        }
        if (now) this.put({ ...now, state: "conflict", remote: r.note });
        this.emit();
        return true;
      }
      case "missing": {
        this.offline = false;
        if (now) this.put({ ...now, state: "missing", remote: null });
        this.emit();
        return true;
      }
      case "unavailable": {
        this.offline = false;
        if (now) this.put({ ...now, state: "unavailable" });
        this.emit();
        return true;
      }
      case "error": {
        if (["blank", "too_long", "invalid"].includes(r.error)) {
          if (now) this.put({ ...now, state: "refused" });
          this.emit();
          return true;
        }
        // The network or the server: keep it, say so, try again later.
        this.offline = true;
        this.emit();
        return false;
      }
    }
  }

  private change(stored: RevisionNote, kind: "update" | "delete", body: string): PendingNote {
    return {
      noteId: stored.id,
      userId: this.o.userId,
      projectId: this.o.projectId,
      kind,
      targetType: stored.target_type,
      targetId: stored.target_id,
      body,
      baseVersion: stored.version,
      queuedAt: this.now(),
      state: "pending",
      remote: null,
      rev: 1,
    };
  }

  private put(p: PendingNote) {
    this.pending.set(p.noteId, p);
    void this.o.storage.put(p).catch(() => {});
    this.emit();
  }

  private drop(noteId: string) {
    this.pending.delete(noteId);
    void this.o.storage.remove(noteId).catch(() => {});
  }

  private applyServer(note: RevisionNote | null, id = note?.id) {
    if (!id) return;
    if (note) this.server.set(id, note);
    else this.server.delete(id);
    this.touched.set(id, ++this.seq);
  }

  private scheduleRetry() {
    this.cancelRetry?.();
    const ms = RETRY_MS[Math.min(this.attempts, RETRY_MS.length - 1)];
    this.attempts += 1;
    const schedule =
      this.o.schedule ??
      ((fn: () => void, delay: number) => {
        const t = setTimeout(fn, delay);
        return () => clearTimeout(t);
      });
    this.cancelRetry = schedule(() => {
      this.cancelRetry = null;
      void this.flush();
    }, ms);
  }

  /** Strictly increasing, so notes added in one moment keep the order they were written in. */
  private now() {
    const at = Math.max((this.o.now?.() ?? new Date()).getTime(), this.lastQueued + 1);
    this.lastQueued = at;
    return new Date(at).toISOString();
  }

  private emit() {
    this.snapshot = shownNotes(this.server, this.pending);
    for (const fn of this.listeners) fn();
  }
}

/** The stored notes with the pending changes applied: what the writer sees. */
export function shownNotes(
  server: ReadonlyMap<string, RevisionNote>,
  pending: ReadonlyMap<string, PendingNote>,
): ShownNote[] {
  const out: ShownNote[] = [];
  for (const note of server.values()) {
    const p = pending.get(note.id);
    // A delete in progress hides the note; one waiting on the writer shows it.
    if (p?.kind === "delete" && p.state === "pending") continue;
    out.push({
      id: note.id,
      target_type: note.target_type,
      target_id: note.target_id,
      body: p && p.kind !== "delete" ? p.body : note.body,
      version: note.version,
      created_at: note.created_at,
      pending: p ? p.state : null,
      remote: p?.remote ?? null,
      deleting: p?.kind === "delete",
    });
  }
  for (const p of pending.values()) {
    if (server.has(p.noteId)) continue;
    // A create not on the server yet, or an edit of a note this read doesn't have.
    if (p.kind === "delete" && p.state === "pending") continue;
    if (p.kind === "delete" && !p.remote) continue;
    out.push({
      id: p.noteId,
      target_type: p.targetType,
      target_id: p.targetId,
      body: p.kind === "delete" ? (p.remote?.body ?? p.body) : p.body,
      version: p.remote?.version ?? p.baseVersion,
      created_at: p.queuedAt,
      pending: p.state,
      remote: p.remote,
      deleting: p.kind === "delete",
    });
  }
  return out;
}
