"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useSyncExternalStore } from "react";
import { getWorkspaceCanvas, writeCanvasItems } from "@/lib/actions/workspaceCanvas";
import { CanvasSession, type CanvasChange, type CanvasDraft } from "@/lib/rune2/canvasSession";
import { deleteCanvasDraft, getCanvasDraft, putCanvasDraft } from "@/lib/rune2/workspaceDrafts";
import { toPlainDocument } from "@/lib/rune2/workspaceDocument";
import { useNetworkStore } from "@/store/networkStore";
import { useProfileStore } from "@/store/profileStore";
import { useRune2Selection } from "./Rune2Selection";
import { useTrash } from "./WorkspaceTrash";

// Hosts the Project's Canvases in the content area. Always mounted beside the
// writing surface and the Workspace documents, so a Canvas opened in this
// Project keeps its session — its items as this window last arranged them,
// its unsaved changes, its undo history — while the writer moves between
// tabs: reopening it reattaches to that session instead of re-reading the
// server while its own last save may still be landing. The surface itself
// (CanvasSurface) mounts only while a Canvas is shown.
//
// Opening a Canvas: the server's copy and this device's unsaved changes are
// read together and reconciled (CanvasSession.applyDraft) — a note typed just
// before a refresh is never lost. Leaving the Project, hiding the window and
// reconnecting all flush every open Canvas.
//
// Trash: before a Canvas is trashed from this window its unsaved changes are
// saved (flush); one trashed elsewhere stops saving ("trashed") and keeps its
// changes on this device; opening it again after a restore resumes it. A
// permanently deleted one is forgotten, device copy included.

const CanvasSurface = dynamic(() => import("./CanvasSurface"), { ssr: false });

export type CanvasOpening = { state: "failed" } | { state: "ready"; session: CanvasSession };

class CanvasSessions {
  private openings = new Map<string, CanvasOpening>();
  private snapshot: ReadonlyMap<string, CanvasOpening> = new Map();
  private loading = new Set<string>();
  private listeners = new Set<() => void>();

  constructor(private readonly projectId: string) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;

  private set(id: string, opening: CanvasOpening | null) {
    if (opening) this.openings.set(id, opening);
    else this.openings.delete(id);
    this.snapshot = new Map(this.openings);
    this.listeners.forEach((l) => l());
  }

  private sessions(): CanvasSession[] {
    return [...this.openings.values()].flatMap((o) => (o.state === "ready" ? [o.session] : []));
  }

  private session(id: string): CanvasSession | null {
    const opened = this.openings.get(id);
    return opened?.state === "ready" ? opened.session : null;
  }

  async open(id: string, userId: string) {
    const opened = this.openings.get(id);
    // Selectable again, so active again: a session stopped by Trash continues.
    if (opened?.state === "ready" && (opened.session.status === "trashed" || opened.session.status === "unavailable")) {
      void opened.session.resume();
    }
    if (opened?.state === "ready" || this.loading.has(id)) return;
    this.loading.add(id);
    const [server, draft] = await Promise.all([
      getWorkspaceCanvas(id).then(
        (r) => r.data,
        () => null
      ),
      getCanvasDraft(id, userId),
    ]);
    this.loading.delete(id);
    if (!server) {
      this.set(id, { state: "failed" });
      return;
    }
    const projectId = this.projectId;
    const session = new CanvasSession({
      canvasId: id,
      projectId,
      items: server.items,
      connections: server.connections,
      // Plain JSON across the wire: a note's document may carry objects
      // without a prototype, which a server action would drop.
      write: (changes: CanvasChange[]) => writeCanvasItems(id, toPlainDocument(changes)),
      persist: (d: CanvasDraft) => void putCanvasDraft({ ...d, userId, projectId, savedAt: Date.now() }),
    });
    if (draft) session.applyDraft(draft);
    this.set(id, { state: "ready", session });
  }

  /** Saves now whatever of one Canvas is unsaved (nothing if it isn't open here). */
  flush = async (id: string) => {
    await this.session(id)?.flush();
  };

  /** One Canvas is back from Trash: its session continues. */
  resume = (id: string) => {
    void this.session(id)?.resume();
  };

  /** One Canvas was deleted permanently: stop its session and forget it, device copy included. */
  forget = (id: string) => {
    this.session(id)?.dispose();
    if (this.openings.has(id)) this.set(id, null);
    void deleteCanvasDraft(id);
  };

  reset(id: string) {
    if (this.openings.get(id)?.state === "failed") this.set(id, null);
  }

  flushAll() {
    this.sessions().forEach((s) => void s.flush());
  }

  retryWaiting() {
    this.sessions().forEach((s) => {
      if (s.status === "retrying") void s.flush();
    });
  }

  close() {
    this.sessions().forEach((s) => void s.flush().finally(() => s.dispose()));
    this.openings.clear();
    this.snapshot = new Map();
  }
}

export function WorkspaceCanvases() {
  const { manuscript, selected } = useRune2Selection();
  const userId = useProfileStore((s) => s.profile?.id);
  const isOnline = useNetworkStore((s) => s.isOnline);
  const { bindCanvases } = useTrash();
  const [store] = useState(() => new CanvasSessions(manuscript.project.id));
  const openings = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  useEffect(() => {
    bindCanvases({ flush: store.flush, resume: store.resume, forget: store.forget });
    return () => bindCanvases(null);
  }, [store, bindCanvases]);

  const canvasId = selected?.kind === "workspaceCanvas" ? selected.id : null;

  useEffect(() => {
    if (canvasId && userId) void store.open(canvasId, userId);
  }, [canvasId, userId, store]);

  useEffect(() => {
    if (isOnline) store.retryWaiting();
  }, [isOnline, store]);

  useEffect(() => {
    const flushAll = () => store.flushAll();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushAll();
    };
    window.addEventListener("pagehide", flushAll);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flushAll);
      document.removeEventListener("visibilitychange", onVisibility);
      store.close();
    };
  }, [store]);

  if (!canvasId || !selected) return null;
  const opened = openings.get(canvasId);

  if (opened?.state === "failed") {
    return (
      <div className="r2-canvas r2-canvas--empty">
        <div className="r2-doc-empty" role="alert">
          <p>This canvas couldn’t be opened.</p>
          <button
            type="button"
            className="r2-button"
            onClick={() => {
              store.reset(canvasId);
              if (userId) void store.open(canvasId, userId);
            }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
  if (opened?.state !== "ready") return <div className="r2-canvas r2-canvas--empty" aria-busy />;

  return <CanvasSurface key={canvasId} entry={selected} session={opened.session} />;
}
