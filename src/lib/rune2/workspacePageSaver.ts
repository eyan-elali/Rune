import type { SaveWorkspacePageResult } from "@/lib/actions/workspacePages";

// The save engine of a Workspace Page — deliberately NOT the manuscript's
// (useSceneEditor / the Scene offline queue). A Page is not manuscript prose:
// no word-limit guards, no writing credits, no XP, and none of the Scene
// queue's compatibility contracts. What it shares with the manuscript engine
// is the discipline:
//
//   * every change is written to the device first (`persist`, dirty), then
//     saved to the server after a pause (debounced);
//   * one save in flight at a time; a change made during a save is saved next,
//     never dropped, and never marked clean by the older save's success;
//   * saves are conditional on the version the content is based on, so a
//     change made elsewhere is never silently overwritten — it becomes a
//     conflict the writer resolves (keepMine / acceptServer);
//   * a failed save (offline, server error) keeps the content dirty on the
//     device and retries with backoff, and on `flush()` (reconnect, leaving).
//
// Pure TypeScript with injectable timers, so it is tested deterministically
// (tools/sync-harness/tests/app-workspace-pages.test.mjs). One saver per Page
// for the life of the Project's shell: reopening a Page reattaches to its
// saver, so the saver's version is always this window's own latest.

export type PageDoc = Record<string, unknown>;

export type PageSaveStatus =
  /** Everything is on the server. */
  | "saved"
  /** Changed; a save is scheduled. */
  | "pending"
  | "saving"
  /** The last save failed; kept on this device and retried. */
  | "retrying"
  /** Changed elsewhere since this content's version. Not saving until resolved. */
  | "conflict"
  /** The Page no longer exists or isn't reachable by this writer. Kept on this device. */
  | "unavailable";

export type PageDraft = { content: PageDoc; baseVersion: number; dirty: boolean };

export type PageSaverOptions = {
  content: PageDoc;
  /** The server version `content` is based on. */
  version: number;
  /** Whether `content` is not yet on the server (a recovered draft). */
  dirty?: boolean;
  /** A known conflict at start: the server's current version. */
  conflictVersion?: number | null;
  save: (content: PageDoc, expectedVersion: number) => Promise<SaveWorkspacePageResult>;
  /** Writes the device copy. Must not throw (failures are the caller's to swallow). */
  persist?: (draft: PageDraft) => void;
  onStatus?: (status: PageSaveStatus) => void;
  /** Debounce after the last change, ms. */
  delay?: number;
  /** Backoff after consecutive failures, ms; the last value repeats. */
  retryDelays?: number[];
  timers?: {
    set: (fn: () => void, ms: number) => unknown;
    clear: (handle: unknown) => void;
  };
};

export class PageSaver {
  private _content: PageDoc;
  private _version: number;
  private _status: PageSaveStatus;
  private _dirty: boolean;
  private conflictVersion: number | null;
  private seq = 0;
  private failures = 0;
  private timer: unknown = null;
  private inFlight: Promise<void> | null = null;
  private disposed = false;
  private readonly opts: Required<Pick<PageSaverOptions, "delay" | "retryDelays" | "timers">> & PageSaverOptions;

  constructor(options: PageSaverOptions) {
    this.opts = {
      delay: 800,
      retryDelays: [2_000, 5_000, 15_000, 30_000],
      timers: {
        set: (fn, ms) => setTimeout(fn, ms),
        clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      },
      ...options,
    };
    this._content = options.content;
    this._version = options.version;
    this._dirty = options.dirty ?? false;
    this.conflictVersion = options.conflictVersion ?? null;
    this._status = this.conflictVersion !== null ? "conflict" : this._dirty ? "pending" : "saved";
    if (this._status === "pending") this.schedule(0);
  }

  get content(): PageDoc {
    return this._content;
  }
  get version(): number {
    return this._version;
  }
  get status(): PageSaveStatus {
    return this._status;
  }
  get dirty(): boolean {
    return this._dirty;
  }

  /** The editor's content changed. */
  change(content: PageDoc): void {
    if (this.disposed) return;
    this._content = content;
    this._dirty = true;
    this.seq += 1;
    this.persist();
    if (this._status === "conflict" || this._status === "unavailable") return;
    if (this._status === "saved") this.setStatus("pending");
    // A save in flight schedules the next one when it lands; a retry keeps its
    // backoff; otherwise save after a pause.
    if (this._status === "pending") this.schedule(this.opts.delay);
  }

  /**
   * Saves now whatever is unsaved, and resolves once this window's content is
   * on the server — or once a save fails, conflicts or the Page is gone (the
   * content stays dirty on the device).
   */
  async flush(): Promise<void> {
    this.clearTimer();
    for (;;) {
      if (this.inFlight) {
        await this.inFlight;
        continue;
      }
      if (!this._dirty || this._status === "conflict" || this._status === "unavailable" || this.disposed) return;
      const failuresBefore = this.failures;
      await this.run();
      if (this.failures > failuresBefore) return;
    }
  }

  /** Resolves a conflict by saving this window's content over the server's current version. */
  async keepMine(): Promise<void> {
    if (this._status !== "conflict" || this.conflictVersion === null) return;
    this._version = this.conflictVersion;
    this.conflictVersion = null;
    this._dirty = true;
    this.persist();
    this.setStatus("pending");
    await this.flush();
  }

  /** Resolves a conflict (or replaces the content) with the server's copy. */
  acceptServer(server: { content: PageDoc; version: number }): void {
    this.clearTimer();
    this._content = server.content;
    this._version = server.version;
    this._dirty = false;
    this.conflictVersion = null;
    this.failures = 0;
    this.seq += 1;
    this.persist();
    this.setStatus("saved");
  }

  /** Stops timers. Call after flush(); unsaved content stays on the device. */
  dispose(): void {
    this.disposed = true;
    this.clearTimer();
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private persist() {
    this.opts.persist?.({ content: this._content, baseVersion: this._version, dirty: this._dirty });
  }

  private setStatus(status: PageSaveStatus) {
    if (this._status === status) return;
    this._status = status;
    this.opts.onStatus?.(status);
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
      void this.run();
    }, ms);
  }

  private run(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    if (!this._dirty || this._status === "conflict" || this._status === "unavailable" || this.disposed) {
      return Promise.resolve();
    }
    this.clearTimer();
    this.inFlight = this.attempt().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async attempt(): Promise<void> {
    const sentSeq = this.seq;
    const sent = this._content;
    this.setStatus("saving");

    let result: SaveWorkspacePageResult;
    try {
      result = await this.opts.save(sent, this._version);
    } catch (e) {
      result = { status: "error", error: e instanceof Error ? e.message : "Network error" };
    }

    switch (result.status) {
      case "ok":
        this.failures = 0;
        this._version = result.version;
        if (this.seq === sentSeq) {
          this._dirty = false;
          this.persist();
          this.setStatus("saved");
        } else {
          // Typed during the save: the newer content now sits on the new version.
          this.persist();
          this.setStatus("pending");
          if (!this.disposed) this.schedule(this.opts.delay);
        }
        return;
      case "conflict":
        this.conflictVersion = result.version;
        this.setStatus("conflict");
        return;
      case "not_found":
        this.setStatus("unavailable");
        return;
      case "error": {
        this.failures += 1;
        this.setStatus("retrying");
        const delays = this.opts.retryDelays;
        if (!this.disposed) this.schedule(delays[Math.min(this.failures - 1, delays.length - 1)]);
        return;
      }
    }
  }
}

/** Deep equality of two TipTap documents, ignoring object key order (jsonb reorders keys). */
export function sameDoc(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((x, i) => sameDoc(x, bb[i]));
  }
  const ka = Object.keys(a as object).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b as object).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  return (
    ka.length === kb.length &&
    ka.every((k) => sameDoc((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  );
}

export type PageOpening = {
  content: PageDoc;
  version: number;
  dirty: boolean;
  /** The server's version when the device holds unsaved content based on an older one. */
  conflictVersion: number | null;
};

/**
 * What a Page opens with, from the server's copy and the device's copy (either
 * may be missing: offline, or never opened here). Unsaved writing on the
 * device is never discarded:
 *   - no unsaved draft: the server's copy (or, offline, the device's cache);
 *   - an unsaved draft on the server's current version: the draft, saved next;
 *   - an unsaved draft identical to the server's copy: already saved (a save
 *     that landed just before the window closed);
 *   - an unsaved draft on an older version that differs: the draft, as a
 *     conflict for the writer to resolve.
 * Null: nothing to open.
 */
export function openPage(
  server: { content: PageDoc; version: number } | null,
  draft: PageDraft | null
): PageOpening | null {
  if (!server) {
    return draft ? { content: draft.content, version: draft.baseVersion, dirty: draft.dirty, conflictVersion: null } : null;
  }
  const clean = { content: server.content, version: server.version, dirty: false, conflictVersion: null };
  if (!draft || !draft.dirty) return clean;
  if (sameDoc(draft.content, server.content)) return clean;
  if (draft.baseVersion === server.version) {
    return { content: draft.content, version: server.version, dirty: true, conflictVersion: null };
  }
  return { content: draft.content, version: draft.baseVersion, dirty: true, conflictVersion: server.version };
}
