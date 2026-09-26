"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useSyncExternalStore } from "react";
import { getWorkspacePage, saveWorkspacePageContent } from "@/lib/actions/workspacePages";
import { getPageDraft, putPageDraft } from "@/lib/rune2/workspaceDrafts";
import { openPage, PageSaver, type PageDraft, type PageSaveStatus } from "@/lib/rune2/workspacePageSaver";
import { useNetworkStore } from "@/store/networkStore";
import { useProfileStore } from "@/store/profileStore";
import { useRune2Selection } from "./Rune2Selection";

// Hosts Workspace Pages in the content area. Always mounted beside the
// manuscript writing surface, so the Pages opened in this Project keep their
// save engines (PageSaver) while the writer moves between tabs: reopening a
// Page reattaches to its saver — which knows this window's latest content and
// version — instead of re-reading the server while its own last save may
// still be landing. A Page's editor itself mounts only while it is shown.
//
// Opening a Page: the server's copy and this device's copy are read together
// and reconciled by openPage (unsaved writing on the device is never
// discarded). Leaving the Project, hiding the window and reconnecting all
// flush every Page's unsaved content.

const WorkspacePageEditor = dynamic(() => import("./WorkspacePageEditor"), { ssr: false });

export type PageSession = {
  saver: PageSaver;
  status: PageSaveStatus;
  listeners: Set<() => void>;
};

/** No entry: loading. */
type Opening = { state: "failed" } | { state: "ready"; session: PageSession };

/** The server's copy and this device's, read together and reconciled (null: nothing to open). */
async function readPage(id: string, userId: string) {
  const [server, draft] = await Promise.all([
    getWorkspacePage(id).then(
      (r) => r.data,
      () => null
    ),
    getPageDraft(id, userId),
  ]);
  return openPage(server, draft);
}

/** One Project's opened Pages — an external store the host subscribes to. */
class PageSessions {
  private openings = new Map<string, Opening>();
  private snapshot: ReadonlyMap<string, Opening> = new Map();
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

  private set(id: string, opening: Opening | null) {
    if (opening) this.openings.set(id, opening);
    else this.openings.delete(id);
    this.snapshot = new Map(this.openings);
    this.listeners.forEach((l) => l());
  }

  private sessions(): PageSession[] {
    return [...this.openings.values()].flatMap((o) => (o.state === "ready" ? [o.session] : []));
  }

  async open(id: string, userId: string) {
    if (this.openings.get(id)?.state === "ready" || this.loading.has(id)) return;
    this.loading.add(id);
    const start = await readPage(id, userId);
    this.loading.delete(id);
    if (!start) {
      this.set(id, { state: "failed" });
      return;
    }

    const projectId = this.projectId;
    const persist = (d: PageDraft) => void putPageDraft({ id, userId, projectId, ...d, savedAt: Date.now() });
    const session: PageSession = { saver: null as unknown as PageSaver, status: "saved", listeners: new Set() };
    session.saver = new PageSaver({
      content: start.content,
      version: start.version,
      dirty: start.dirty,
      conflictVersion: start.conflictVersion,
      save: (content, expectedVersion) => saveWorkspacePageContent(id, content, expectedVersion),
      persist,
      onStatus: (status) => {
        session.status = status;
        session.listeners.forEach((l) => l());
      },
    });
    session.status = session.saver.status;
    // Keep this device's copy current with what the Page opened with.
    persist({ content: start.content, baseVersion: start.version, dirty: start.dirty });
    this.set(id, { state: "ready", session });
  }

  /** Forgets a failed opening, so the next open() tries again. */
  reset(id: string) {
    if (this.openings.get(id)?.state === "failed") this.set(id, null);
  }

  flushAll() {
    this.sessions().forEach((s) => void s.saver.flush());
  }

  retryWaiting() {
    this.sessions().forEach((s) => {
      if (s.status === "retrying") void s.saver.flush();
    });
  }

  /** Flushes and stops every saver, and forgets them (a later open() starts afresh). */
  close() {
    this.sessions().forEach((s) => void s.saver.flush().finally(() => s.saver.dispose()));
    this.openings.clear();
    this.snapshot = new Map();
  }
}

export function WorkspacePages() {
  const { manuscript, selected } = useRune2Selection();
  const userId = useProfileStore((s) => s.profile?.id);
  const isOnline = useNetworkStore((s) => s.isOnline);
  // The shell is mounted per Project, so one store serves this Project.
  const [store] = useState(() => new PageSessions(manuscript.project.id));
  const openings = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  const pageId = selected?.kind === "workspacePage" ? selected.id : null;

  useEffect(() => {
    if (pageId && userId) void store.open(pageId, userId);
  }, [pageId, userId, store]);

  // Back online: retry every Page still waiting to save.
  useEffect(() => {
    if (isOnline) store.retryWaiting();
  }, [isOnline, store]);

  // Hiding or leaving the window: save what's unsaved now (the device copy
  // already holds it, whatever happens to these requests). Leaving the
  // Project: flush, then stop every saver.
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

  if (!pageId || !selected) return null;
  const opened = openings.get(pageId);

  if (opened?.state === "failed") {
    return (
      <div className="r2-writing">
        <div className="r2-doc r2-page">
          <div className="r2-doc-empty" role="alert">
            <p>This page couldn’t be opened.</p>
            <button
              type="button"
              className="r2-button"
              onClick={() => {
                store.reset(pageId);
                if (userId) void store.open(pageId, userId);
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (opened?.state !== "ready") return <div className="r2-writing" aria-busy />;

  return <WorkspacePageEditor key={pageId} entry={selected} session={opened.session} />;
}
