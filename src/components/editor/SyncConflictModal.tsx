"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getOfflineDB, plainTextOfContent, SCENE_CACHE_STORE } from "@/lib/offline/db";
import { forceWriteLocalContent } from "@/lib/offline/syncEngine";
import { acceptServerState } from "@/lib/offline/tabBaseline";
import { useModalFocus } from "@/components/rune2/useModalFocus";

// The Scene conflict: the writer's words on this device and a different
// version saved elsewhere (another window or device) since the one they were
// based on. syncEngine decides it is one (never this tab's own save); this
// dialog only explains it and lets the writer choose. Nothing is lost until
// they do: their words stay queued on this device, the other version stays
// on the server.

interface LocalDraftInfo {
  content: Record<string, unknown>;
  wordCount: number;
  localUpdatedAt: number;
}

interface ServerVersionInfo {
  content: Record<string, unknown>;
  wordCount: number;
  updatedAt: string;
  version?: number;
}

interface SyncConflictModalProps {
  sceneId: string;
  /** Called only after the server confirmed it now holds the local draft. */
  onKeepLocal: () => void;
  onKeepServer: (serverContent: Record<string, unknown>, serverWordCount: number) => void;
  onClose: () => void;
}

// Accurate failure descriptions per category — a word-limit rejection or an
// expired session must never be reported as "check your internet."
const KEEP_LOCAL_ERROR_MESSAGES: Record<string, string> = {
  auth: "You’ve been signed out. Your words are safe on this device — sign in again, then try once more.",
  not_found:
    "This scene no longer exists. Your words are safe on this device — copy them into another scene.",
  network: "Sutura couldn’t reach the server. Your words are safe on this device — try again when you’re connected.",
  server: "That didn’t save. Your words are safe on this device — try again in a moment.",
};

const EXCERPT_CHARS = 180;
const EXCERPT_LEAD = 60;

function flatText(content: Record<string, unknown> | undefined): string {
  return plainTextOfContent(content).replace(/\s+/g, " ").trim();
}

/**
 * A passage of each version, enough to tell them apart: two versions of a
 * Scene usually share their opening, so both passages start a little before
 * the first place they differ. Shown, never logged.
 */
function excerpts(a: Record<string, unknown> | undefined, b: Record<string, unknown> | undefined): [string, string] {
  const ta = flatText(a);
  const tb = flatText(b);
  let at = 0;
  while (at < ta.length && at < tb.length && ta[at] === tb[at]) at += 1;
  // Back to a word boundary a little before the difference.
  let start = Math.max(0, at - EXCERPT_LEAD);
  if (start > 0) {
    const space = ta.lastIndexOf(" ", start);
    start = space > 0 ? space + 1 : 0;
  }
  const cut = (t: string) => {
    if (!t) return "Empty";
    const body = t.slice(start, start + EXCERPT_CHARS).trimEnd();
    if (!body) return "…(ends here)";
    return `${start > 0 ? "…" : ""}${body}${start + EXCERPT_CHARS < t.length ? "…" : ""}`;
  };
  return [cut(ta), cut(tb)];
}

function pluralWords(n: number) {
  return n === 1 ? "word" : "words";
}

function formatTime(ts: number | string) {
  const d = new Date(ts);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function SyncConflictModal({
  sceneId,
  onKeepLocal,
  onKeepServer,
  onClose,
}: SyncConflictModalProps) {
  const [localDraft, setLocalDraft] = useState<LocalDraftInfo | null>(null);
  const [serverVersion, setServerVersion] = useState<ServerVersionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<"local" | "server" | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalFocus(containerRef);

  useEffect(() => {
    async function loadVersions() {
      try {
        const db = await getOfflineDB();
        const pending = await db.get("pending_writes", sceneId);
        if (pending) {
          setLocalDraft({
            content: pending.content,
            wordCount: pending.wordCount,
            localUpdatedAt: pending.localUpdatedAt,
          });
        }

        const supabase = createClient();
        // Plain list select, not .single() — zero rows (scene deleted /
        // inaccessible) must be distinguishable from a query error instead of
        // both collapsing into PGRST116's generic coercion message.
        const { data: rows, error } = await supabase
          .from("scenes")
          .select("content, word_count, updated_at, version")
          .eq("id", sceneId);

        if (error) {
          setLoadError("Sutura couldn’t load the other version just now. Your words are safe on this device.");
          return;
        }
        if (!rows || rows.length === 0) {
          setLoadError("This scene no longer exists. Your words are safe on this device.");
          return;
        }
        const data = rows[0];

        setServerVersion({
          content: (data.content ?? {}) as Record<string, unknown>,
          wordCount: (data.word_count as number) ?? 0,
          updatedAt: data.updated_at as string,
          version: data.version as number | undefined,
        });
      } catch {
        setLoadError("Sutura couldn’t load the other version just now. Your words are safe on this device.");
      } finally {
        setLoading(false);
      }
    }

    void loadVersions();
  }, [sceneId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !resolving) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, resolving]);

  async function handleKeepLocal() {
    if (resolving) return;
    setResolveError(null);
    setResolving("local");
    try {
      const result = await forceWriteLocalContent(sceneId);
      // Only a database from before migration 037 can still answer this.
      if (result.status === "word_limit_blocked") {
        setResolveError(KEEP_LOCAL_ERROR_MESSAGES.server);
        setResolving(null);
        return;
      }
      if (result.status !== "ok") {
        setResolveError(
          KEEP_LOCAL_ERROR_MESSAGES[result.category] ?? KEEP_LOCAL_ERROR_MESSAGES.server
        );
        setResolving(null);
        return;
      }
      onKeepLocal();
    } catch {
      setResolveError(KEEP_LOCAL_ERROR_MESSAGES.server);
      setResolving(null);
    }
  }

  async function handleKeepServer() {
    if (resolving || !serverVersion) return;
    setResolveError(null);
    setResolving("server");
    try {
      const db = await getOfflineDB();
      await db.delete("pending_writes", sceneId);

      // Always write the actual fetched server content into cache — even when no
      // prior cache entry exists, so offline navigation reflects the chosen version.
      const existingCache = await db.get(SCENE_CACHE_STORE, sceneId);
      await db.put(SCENE_CACHE_STORE, {
        ...(existingCache ?? {}),
        id: sceneId,
        content: serverVersion.content,
        wordCount: serverVersion.wordCount,
        serverUpdatedAt: serverVersion.updatedAt,
        serverVersion: serverVersion.version,
        serverWordCount: serverVersion.wordCount,
        serverContent: serverVersion.content,
        cachedAt: Date.now(),
      });
      // This tab now knows (and shows) the server's version.
      acceptServerState(sceneId, serverVersion.wordCount, serverVersion.version);

      onKeepServer(serverVersion.content, serverVersion.wordCount);
    } catch {
      setResolveError("That didn’t work. Nothing was changed — try again.");
      setResolving(null);
    }
  }

  async function copyLocal() {
    if (!localDraft) return;
    try {
      await navigator.clipboard.writeText(plainTextOfContent(localDraft.content));
      setCopied(true);
    } catch {
      setResolveError("Couldn’t copy. Select the text in the editor and copy it instead.");
    }
  }

  return (
    <div className="r2-dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !resolving && onClose()}>
      <div
        ref={containerRef}
        className="r2-dialog r2-conflict"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId}>This scene was also changed elsewhere</h2>
        <p>
          While your latest words here were waiting to save, a different version was saved from
          another window or device. Both are kept until you choose which one this scene should hold.
        </p>

        {loading ? (
          <p className="r2-conflict-loading" role="status">
            Loading both versions…
          </p>
        ) : loadError ? (
          <>
            <p role="alert">{loadError}</p>
            <div className="r2-dialog-actions">
              <button type="button" className="r2-button" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <ConflictVersions local={localDraft} server={serverVersion} />

            <p className="r2-conflict-note">
              Using the other version replaces yours here.{" "}
              <button type="button" className="r2-conflict-copy" onClick={() => void copyLocal()} disabled={!localDraft}>
                {copied ? "Your version is copied" : "Copy your version first"}
              </button>
            </p>

            {resolveError && (
              <p role="alert" className="r2-conflict-error">
                {resolveError}
              </p>
            )}

            <div className="r2-dialog-actions">
              <button type="button" className="r2-button r2-button--quiet" disabled={resolving !== null} onClick={onClose}>
                Decide later
              </button>
              <button
                type="button"
                className="r2-button"
                onClick={() => void handleKeepServer()}
                disabled={resolving !== null || !serverVersion}
              >
                {resolving === "server" ? "Switching…" : "Use the other version"}
              </button>
              <button
                type="button"
                className="r2-button r2-button--primary"
                onClick={() => void handleKeepLocal()}
                disabled={resolving !== null}
              >
                {resolving === "local" ? "Saving…" : "Keep yours"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ConflictVersions({ local, server }: { local: LocalDraftInfo | null; server: ServerVersionInfo | null }) {
  const [mine, theirs] = excerpts(local?.content, server?.content);
  return (
    <div className="r2-conflict-versions">
      <section className="r2-conflict-version" aria-label="Your version on this device">
        <h3 className="r2-label">Yours, on this device</h3>
        <p className="r2-conflict-meta">
          {(local?.wordCount ?? 0).toLocaleString()} {pluralWords(local?.wordCount ?? 0)}
          {local && <> · edited {formatTime(local.localUpdatedAt)}</>}
        </p>
        <p className="r2-conflict-excerpt">{mine}</p>
      </section>
      <section className="r2-conflict-version" aria-label="The version saved elsewhere">
        <h3 className="r2-label">Saved elsewhere</h3>
        <p className="r2-conflict-meta">
          {(server?.wordCount ?? 0).toLocaleString()} {pluralWords(server?.wordCount ?? 0)}
          {server && <> · saved {formatTime(server.updatedAt)}</>}
        </p>
        <p className="r2-conflict-excerpt">{theirs}</p>
      </section>
    </div>
  );
}
