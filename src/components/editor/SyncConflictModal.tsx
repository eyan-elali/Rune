"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getOfflineDB } from "@/lib/offline/db";
import { forceWriteLocalContent } from "@/lib/offline/syncEngine";

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
  pageId: string;
  /** Called only after the server confirmed it now holds the local draft. */
  onKeepLocal: (keptWordCount: number) => void;
  onKeepServer: (serverContent: Record<string, unknown>, serverWordCount: number) => void;
  onClose: () => void;
}

// Accurate failure descriptions per category — a word-limit rejection or an
// expired session must never be reported as "check your internet."
const KEEP_LOCAL_ERROR_MESSAGES: Record<string, string> = {
  auth: "Your session has expired. Your draft is safe on this device — sign in again, then retry.",
  not_found:
    "This page no longer exists on the server. Your draft is safe on this device — copy it into another page or contact support.",
  network: "Could not reach the server. Your draft is safe on this device — check your connection and try again.",
  server:
    "The server rejected the save. Your draft is safe on this device — please try again.",
};

function pluralWords(n: number) {
  return n === 1 ? "word" : "words";
}

function formatTime(ts: number | string) {
  const d = typeof ts === "number" ? new Date(ts) : new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function SyncConflictModal({
  pageId,
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
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadVersions() {
      try {
        const db = await getOfflineDB();
        const pending = await db.get("pending_writes", pageId);
        if (pending) {
          setLocalDraft({
            content: pending.content,
            wordCount: pending.wordCount,
            localUpdatedAt: pending.localUpdatedAt,
          });
        }

        const supabase = createClient();
        // Plain list select, not .single() — zero rows (page deleted /
        // inaccessible) must be distinguishable from a query error instead of
        // both collapsing into PGRST116's generic coercion message.
        const { data: rows, error } = await supabase
          .from("pages")
          .select("content, word_count, updated_at, version")
          .eq("id", pageId);

        if (error) {
          setLoadError("Could not load the server version.");
          return;
        }
        if (!rows || rows.length === 0) {
          setLoadError(
            "This page no longer exists on the server. Your local draft is safe on this device."
          );
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
        setLoadError("Failed to load conflict data.");
      } finally {
        setLoading(false);
      }
    }

    void loadVersions();
  }, [pageId]);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  async function handleKeepLocal() {
    if (resolving) return;
    setResolveError(null);
    setResolving("local");
    try {
      const result = await forceWriteLocalContent(pageId);
      if (result.status === "word_limit_blocked") {
        setResolveError(
          "This would put you over your free-word limit. Your draft is safe — continue with Scribe to save it, or export it."
        );
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
      onKeepLocal(result.wordCount);
    } catch {
      setResolveError("An unexpected error occurred. Please try again.");
      setResolving(null);
    }
  }

  async function handleKeepServer() {
    if (resolving || !serverVersion) return;
    setResolveError(null);
    setResolving("server");
    try {
      const db = await getOfflineDB();
      await db.delete("pending_writes", pageId);

      // Always write the actual fetched server content into cache — even when no
      // prior cache entry exists, so offline navigation reflects the chosen version.
      const existingCache = await db.get("page_cache", pageId);
      await db.put("page_cache", {
        ...(existingCache ?? {}),
        id: pageId,
        content: serverVersion.content,
        wordCount: serverVersion.wordCount,
        serverUpdatedAt: serverVersion.updatedAt,
        serverVersion: serverVersion.version,
        serverWordCount: serverVersion.wordCount,
        serverContent: serverVersion.content,
        cachedAt: Date.now(),
      });

      onKeepServer(serverVersion.content, serverVersion.wordCount);
    } catch {
      setResolveError("An unexpected error occurred. Please try again.");
      setResolving(null);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sync Conflict"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10, 8, 6, 0.88)", backdropFilter: "blur(6px)" }}
      onKeyDown={(e) => { if (e.key === "Escape" && !resolving) onClose(); }}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className="w-full max-w-lg rounded-2xl px-8 pt-8 pb-7 outline-none"
        style={{
          background: "var(--surface-card)",
          border: "1px solid var(--color-border-strong)",
          boxShadow: "0 32px 80px rgba(0, 0, 0, 0.65), 0 0 0 1px color-mix(in srgb, var(--color-gold) 8%, transparent)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Badge */}
        <div className="mb-5 flex items-center gap-2">
          <div
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
            style={{
              background: "color-mix(in srgb, var(--color-crimson) 15%, transparent)",
              border: "1px solid color-mix(in srgb, var(--color-crimson) 30%, transparent)",
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--color-crimson)" }}
              aria-hidden
            />
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: "var(--color-crimson)" }}
            >
              Sync Conflict
            </span>
          </div>
        </div>

        {/* Heading */}
        <p
          className="mb-1.5 font-rune-serif text-[1.15rem] leading-snug"
          style={{ color: "var(--text-primary)" }}
        >
          This page was changed elsewhere while you had an unsynced local draft.
        </p>
        <p className="mb-7 text-sm" style={{ color: "var(--color-mist)" }}>
          Choose which version to keep.
        </p>

        {/* Divider */}
        <div
          className="mb-6 h-px"
          style={{ background: "var(--color-border)" }}
          aria-hidden
        />

        {loading ? (
          <div className="flex h-28 items-center justify-center">
            <span className="text-sm" style={{ color: "var(--color-mist)" }}>
              Loading versions…
            </span>
          </div>
        ) : loadError ? (
          <div className="flex h-28 flex-col items-center justify-center gap-3">
            <span className="text-sm" style={{ color: "var(--color-crimson)" }}>
              {loadError}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="text-xs"
              style={{ color: "var(--color-mist)" }}
            >
              Dismiss
            </button>
          </div>
        ) : (
          <>
            {/* Version cards */}
            <div className="mb-5 grid grid-cols-2 gap-3">
              {/* Local Draft */}
              <div
                className="rounded-xl p-4"
                style={{
                  background: "color-mix(in srgb, var(--color-gold) 7%, transparent)",
                  border: "1px solid var(--color-border-strong)",
                }}
              >
                <p
                  className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em]"
                  style={{ color: "var(--color-gold)" }}
                >
                  Local Draft
                </p>
                <p
                  className="font-rune-serif text-3xl font-bold leading-none"
                  style={{ color: "var(--text-primary)" }}
                >
                  {localDraft?.wordCount ?? 0}
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--color-mist)" }}>
                  {pluralWords(localDraft?.wordCount ?? 0)}
                </p>
                <p
                  className="mt-4 text-[11px]"
                  style={{ color: "var(--color-mist)", opacity: 0.65 }}
                >
                  Edited at{" "}
                  {localDraft ? formatTime(localDraft.localUpdatedAt) : "—"}
                </p>
              </div>

              {/* Server Version */}
              <div
                className="rounded-xl p-4"
                style={{
                  background: "rgba(0, 0, 0, 0.12)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <p
                  className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em]"
                  style={{ color: "var(--color-mist)" }}
                >
                  Server Version
                </p>
                <p
                  className="font-rune-serif text-3xl font-bold leading-none"
                  style={{ color: "var(--text-primary)" }}
                >
                  {serverVersion?.wordCount ?? 0}
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--color-mist)" }}>
                  {pluralWords(serverVersion?.wordCount ?? 0)}
                </p>
                <p
                  className="mt-4 text-[11px]"
                  style={{ color: "var(--color-mist)", opacity: 0.65 }}
                >
                  Saved at{" "}
                  {serverVersion ? formatTime(serverVersion.updatedAt) : "—"}
                </p>
              </div>
            </div>

            {/* Error feedback */}
            {resolveError && (
              <p
                className="mb-4 rounded-lg px-3 py-2 text-xs"
                style={{
                  color: "var(--color-crimson)",
                  background: "color-mix(in srgb, var(--color-crimson) 10%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--color-crimson) 20%, transparent)",
                }}
              >
                {resolveError}
              </p>
            )}

            {/* Actions */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => void handleKeepLocal()}
                disabled={resolving !== null}
                className="rounded-xl py-2.5 text-sm font-semibold transition-opacity disabled:opacity-40"
                style={{
                  background: "var(--color-gold)",
                  color: "var(--color-ink)",
                }}
                aria-label="Keep local draft and upload to server"
              >
                {resolving === "local" ? "Saving…" : "Keep Local"}
              </button>
              <button
                type="button"
                onClick={() => void handleKeepServer()}
                disabled={resolving !== null || !serverVersion}
                className="rounded-xl py-2.5 text-sm font-medium transition-opacity disabled:opacity-40"
                style={{
                  background: "transparent",
                  color: "var(--color-mist)",
                  border: "1px solid var(--color-border-strong)",
                }}
                aria-label="Discard local draft and load server version"
              >
                {resolving === "server" ? "Applying…" : "Keep Server"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
