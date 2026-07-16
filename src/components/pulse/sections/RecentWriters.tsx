"use client";

import { useEffect, useState } from "react";
import { usePulseDrawer } from "@/components/pulse/PulseDrawer";
import { PulseCard } from "@/components/pulse/PulseCard";
import { searchRecentWriters } from "@/lib/actions/pulse";
import type { WriterSummary } from "@/lib/actions/pulse";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function RecentWriters({ initialWriters }: { initialWriters: WriterSummary[] }) {
  const { range, includeInternal, openUser } = usePulseDrawer();
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<WriterSummary[] | null>(null);
  const [loading, setLoading] = useState(false);

  // No effect needed to sync "no active search" back to initialWriters — it's
  // derived directly below, which also sidesteps re-running search state from
  // a stale debounce once the query is cleared.
  const trimmedQuery = query.trim();
  const writers = trimmedQuery ? (searchResults ?? []) : initialWriters;

  useEffect(() => {
    if (!trimmedQuery) return;
    let cancelled = false;
    const t = setTimeout(() => {
      setLoading(true);
      searchRecentWriters(trimmedQuery, range, includeInternal)
        .then((results) => {
          if (!cancelled) setSearchResults(results);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [trimmedQuery, range, includeInternal]);

  return (
    <PulseCard className="flex flex-col p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--color-mist)" }}>
          Recent Writers
        </p>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name…"
          className="w-40 rounded-md px-3 py-1.5 text-xs outline-none"
          style={{
            background: "var(--surface-card)",
            border: "1px solid var(--color-border-strong)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      <div className="max-h-[340px] overflow-y-auto">
        {loading ? (
          <p className="py-6 text-center text-sm" style={{ color: "var(--color-mist)" }}>
            Searching…
          </p>
        ) : writers.length === 0 ? (
          <p className="py-6 text-center text-sm" style={{ color: "var(--color-mist)" }}>
            No writers found.
          </p>
        ) : (
          <ul role="list" className="space-y-0.5">
            {writers.map((w) => (
              <li key={w.id}>
                <button
                  onClick={() => openUser(w.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-rune-gold/5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm" style={{ color: "var(--text-primary)" }}>
                      {w.displayName?.trim() || w.username?.trim() || "Writer"}
                    </span>
                    <span className="block text-xs" style={{ color: "var(--color-mist)" }}>
                      Joined {fmtDate(w.createdAt)} · {w.subscriptionTier ?? "free"}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span
                      className="block text-sm font-medium tabular-nums"
                      style={{ color: "var(--text-primary)", opacity: 0.85 }}
                    >
                      {w.totalWordsWritten.toLocaleString()} written
                    </span>
                    <span
                      className="block text-xs tabular-nums"
                      style={{ color: "var(--color-mist)" }}
                    >
                      {w.totalWords.toLocaleString()} total
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PulseCard>
  );
}
