"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  getActivationFunnelDrilldownUsers,
  getCampaignDrilldownUsers,
  getDrilldownUsers,
  getOnboardingDrilldownRows,
  getUserDrawerData,
} from "@/lib/actions/pulse";
import type {
  DrilldownKind,
  DrilldownUser,
  OnboardingDrilldownKind,
  OnboardingDrilldownPage,
  OnboardingDrilldownRow,
  PulseTimeRange,
  UserDrawerData,
} from "@/lib/actions/pulse";

type CampaignMetric = "signups" | "firstSaves" | "secondWritingDays" | "subscribers";

type ListBackTo = { mode: "list"; title: string; users: DrilldownUser[] };
type TableBackTo = {
  mode: "table";
  // Identifies which openOnboardingDrilldown call produced this state, so
  // TablePanel can be keyed by it and remount (resetting its local
  // search/pagination state) whenever a *different* open happens — including
  // re-clicking the same kind's card while the table is already showing.
  session: number;
  kind: OnboardingDrilldownKind;
  title: string;
  rows: OnboardingDrilldownRow[];
  totalCount: number;
};

type DrawerState =
  | { mode: "closed" }
  | { mode: "list"; title: string; loading: boolean; users: DrilldownUser[] }
  | {
      mode: "table";
      session: number;
      kind: OnboardingDrilldownKind;
      title: string;
      loading: boolean;
      rows: OnboardingDrilldownRow[];
      totalCount: number;
    }
  | {
      mode: "user";
      loading: boolean;
      userId: string;
      data: UserDrawerData | null;
      backTo: ListBackTo | TableBackTo | null;
    };

interface PulseDrawerContextValue {
  range: PulseTimeRange;
  includeInternal: boolean;
  openDrilldown: (kind: DrilldownKind, title: string) => void;
  openFunnelDrilldown: (stepKey: string, title: string) => void;
  openCampaignDrilldown: (campaign: string, metric: CampaignMetric, title: string) => void;
  openOnboardingDrilldown: (kind: OnboardingDrilldownKind, title: string) => void;
  fetchOnboardingDrilldownPage: (
    kind: OnboardingDrilldownKind,
    query: string,
    offset: number
  ) => Promise<OnboardingDrilldownPage>;
  openUser: (userId: string) => void;
}

const PulseDrawerContext = createContext<PulseDrawerContextValue | null>(null);

export function usePulseDrawer(): PulseDrawerContextValue {
  const ctx = useContext(PulseDrawerContext);
  if (!ctx) throw new Error("usePulseDrawer must be used within PulseDrawerProvider");
  return ctx;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const EVENT_LABELS: Record<string, string> = {
  signup_completed: "Signed up",
  email_verified: "Verified email",
  onboarding_started: "Started onboarding",
  onboarding_completed: "Completed onboarding",
  project_created: "Created a project",
  first_sentence_written: "Wrote first sentence",
  editor_opened: "Opened editor",
  first_character_typed: "Typed first character",
  first_save: "First save",
  first_sync_completed: "First sync completed",
  reached_100_words: "Reached 100 words",
  reached_500_words: "Reached 500 words",
  reached_2000_words: "Reached 2,000 words",
  reached_5000_words: "Reached 5,000 words",
  reached_10000_words: "Reached 10,000 words",
  reached_15000_words: "Reached 15,000 words",
  second_writing_day: "Second writing day",
  third_writing_day: "Third writing day",
  export_completed: "Exported manuscript",
  arena_session_completed: "Completed an Arena session",
  revision_note_created: "Added a revision note",
  subscription_started: "Subscription started",
  subscription_cancelled: "Subscription cancelled",
  account_deleted: "Account deleted",
};

function eventLabel(name: string): string {
  return EVENT_LABELS[name] ?? name;
}

export function PulseDrawerProvider({
  range,
  includeInternal,
  children,
}: {
  range: PulseTimeRange;
  includeInternal: boolean;
  children: ReactNode;
}) {
  const [state, setState] = useState<DrawerState>({ mode: "closed" });
  const tableSessionRef = useRef(0);

  const close = useCallback(() => setState({ mode: "closed" }), []);

  const openDrilldown = useCallback(
    (kind: DrilldownKind, title: string) => {
      setState({ mode: "list", title, loading: true, users: [] });
      getDrilldownUsers(kind, range, includeInternal)
        .then((users) => setState({ mode: "list", title, loading: false, users }))
        .catch(() => setState({ mode: "list", title, loading: false, users: [] }));
    },
    [range, includeInternal]
  );

  // Distinct from openDrilldown: the funnel's counts are cohort-consistent
  // (a signup cohort, checked against a later event with no time bound), so
  // its drilldown must use the matching cohort-aware query — otherwise the
  // list a founder opens wouldn't match the number they clicked.
  const openFunnelDrilldown = useCallback(
    (stepKey: string, title: string) => {
      setState({ mode: "list", title, loading: true, users: [] });
      getActivationFunnelDrilldownUsers(stepKey, range, includeInternal)
        .then((users) => setState({ mode: "list", title, loading: false, users }))
        .catch(() => setState({ mode: "list", title, loading: false, users: [] }));
    },
    [range, includeInternal]
  );

  const openCampaignDrilldown = useCallback(
    (campaign: string, metric: CampaignMetric, title: string) => {
      setState({ mode: "list", title, loading: true, users: [] });
      getCampaignDrilldownUsers(campaign, metric, range, includeInternal)
        .then((users) => setState({ mode: "list", title, loading: false, users }))
        .catch(() => setState({ mode: "list", title, loading: false, users: [] }));
    },
    [range, includeInternal]
  );

  const openOnboardingDrilldown = useCallback(
    (kind: OnboardingDrilldownKind, title: string) => {
      const session = ++tableSessionRef.current;
      setState({ mode: "table", session, kind, title, loading: true, rows: [], totalCount: 0 });
      getOnboardingDrilldownRows(kind, range, includeInternal, "", 0)
        .then(({ rows, totalCount }) =>
          setState((prev) =>
            prev.mode === "table" && prev.session === session
              ? { ...prev, loading: false, rows, totalCount }
              : prev
          )
        )
        .catch(() =>
          setState((prev) => (prev.mode === "table" && prev.session === session ? { ...prev, loading: false } : prev))
        );
    },
    [range, includeInternal]
  );

  // Shared by the table panel's search box and its load-more button — both
  // need to re-query the full server-side cohort (not just what's already
  // loaded), so this is exposed on context rather than baked into
  // openOnboardingDrilldown, which only ever fetches page one.
  const fetchOnboardingDrilldownPage = useCallback(
    (kind: OnboardingDrilldownKind, query: string, offset: number) =>
      getOnboardingDrilldownRows(kind, range, includeInternal, query, offset),
    [range, includeInternal]
  );

  const openUser = useCallback(
    (userId: string) => {
      setState((prev) => ({
        mode: "user",
        loading: true,
        userId,
        data: null,
        backTo:
          prev.mode === "list"
            ? { mode: "list", title: prev.title, users: prev.users }
            : prev.mode === "table"
              ? {
                  mode: "table",
                  session: prev.session,
                  kind: prev.kind,
                  title: prev.title,
                  rows: prev.rows,
                  totalCount: prev.totalCount,
                }
              : null,
      }));
      getUserDrawerData(userId)
        .then((data) =>
          setState((prev) =>
            prev.mode === "user" && prev.userId === userId ? { ...prev, loading: false, data } : prev
          )
        )
        .catch(() =>
          setState((prev) =>
            prev.mode === "user" && prev.userId === userId ? { ...prev, loading: false, data: null } : prev
          )
        );
    },
    []
  );

  const goBack = useCallback(() => {
    setState((prev) => {
      if (prev.mode !== "user" || !prev.backTo) return { mode: "closed" };
      return prev.backTo.mode === "list"
        ? { mode: "list", title: prev.backTo.title, loading: false, users: prev.backTo.users }
        : {
            mode: "table",
            session: prev.backTo.session,
            kind: prev.backTo.kind,
            title: prev.backTo.title,
            loading: false,
            rows: prev.backTo.rows,
            totalCount: prev.backTo.totalCount,
          };
    });
  }, []);

  useEffect(() => {
    if (state.mode === "closed") return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [state.mode, close]);

  const isOpen = state.mode !== "closed";

  return (
    <PulseDrawerContext.Provider
      value={{
        range,
        includeInternal,
        openDrilldown,
        openFunnelDrilldown,
        openCampaignDrilldown,
        openOnboardingDrilldown,
        fetchOnboardingDrilldownPage,
        openUser,
      }}
    >
      {children}

      {/* Overlay */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-40 transition-opacity duration-300"
        style={{
          background: "var(--color-ink)",
          opacity: isOpen ? 0.3 : 0,
          pointerEvents: isOpen ? "auto" : "none",
        }}
        onClick={close}
      />

      {/* Panel — widened for the table mode, which has too many columns for
          the standard 440px list/user width. */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Pulse detail"
        className={`fixed right-0 top-0 z-50 flex h-full w-full flex-col overflow-y-auto transition-transform duration-300 ${
          state.mode === "table" ? "max-w-[880px]" : "max-w-[440px]"
        }`}
        style={{
          background: "var(--surface-card)",
          borderLeft: "1px solid var(--color-border)",
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          boxShadow: "-10px 0 40px var(--color-shadow)",
        }}
      >
        {state.mode === "list" && (
          <ListPanel
            title={state.title}
            loading={state.loading}
            users={state.users}
            onClose={close}
            onSelectUser={openUser}
          />
        )}
        {state.mode === "table" && (
          <TablePanel
            key={state.session}
            kind={state.kind}
            title={state.title}
            loading={state.loading}
            rows={state.rows}
            totalCount={state.totalCount}
            onClose={close}
            onSelectUser={openUser}
            fetchPage={fetchOnboardingDrilldownPage}
          />
        )}
        {state.mode === "user" && (
          <UserPanel
            loading={state.loading}
            data={state.data}
            onClose={close}
            onBack={state.backTo ? goBack : undefined}
          />
        )}
      </aside>
    </PulseDrawerContext.Provider>
  );
}

function DrawerHeader({
  eyebrow,
  title,
  onClose,
  onBack,
}: {
  eyebrow: string;
  title: string;
  onClose: () => void;
  onBack?: () => void;
}) {
  return (
    <div
      className="flex flex-shrink-0 items-start justify-between px-7 pb-5 pt-6"
      style={{ borderBottom: "1px solid var(--color-border)" }}
    >
      <div className="min-w-0 flex-1 pr-4">
        {onBack && (
          <button
            onClick={onBack}
            className="mb-2 text-xs transition-opacity hover:opacity-70"
            style={{ color: "var(--color-gold-dim)" }}
          >
            ← Back
          </button>
        )}
        <p
          className="mb-2 text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: "var(--color-mist)" }}
        >
          {eyebrow}
        </p>
        <p className="truncate font-rune-serif text-xl leading-tight" style={{ color: "var(--text-primary)" }}>
          {title}
        </p>
      </div>
      <button
        onClick={onClose}
        aria-label="Close panel"
        className="ml-4 mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded transition-opacity hover:opacity-60"
        style={{ color: "var(--color-mist)" }}
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
          <path d="M1 1L12 12M12 1L1 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

function ListPanel({
  title,
  loading,
  users,
  onClose,
  onSelectUser,
}: {
  title: string;
  loading: boolean;
  users: DrilldownUser[];
  onClose: () => void;
  onSelectUser: (userId: string) => void;
}) {
  return (
    <>
      <DrawerHeader eyebrow={`${users.length} writer${users.length === 1 ? "" : "s"}`} title={title} onClose={onClose} />
      <div className="flex-1 px-3 py-3">
        {loading ? (
          <p className="px-4 py-6 text-sm" style={{ color: "var(--color-mist)" }}>
            Loading…
          </p>
        ) : users.length === 0 ? (
          <p className="px-4 py-6 text-sm" style={{ color: "var(--color-mist)" }}>
            No writers match this yet.
          </p>
        ) : (
          <ul role="list">
            {users.map((u) => (
              <li key={u.id}>
                <button
                  onClick={() => onSelectUser(u.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-md px-4 py-2.5 text-left transition-colors hover:bg-rune-gold/5"
                >
                  <span className="min-w-0 truncate text-sm" style={{ color: "var(--text-primary)" }}>
                    {u.displayName?.trim() || u.username?.trim() || "Writer"}
                  </span>
                  <span className="shrink-0 text-xs" style={{ color: "var(--color-mist)" }}>
                    {fmtDate(u.eventAt ?? u.createdAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

const TABLE_COLUMNS: { key: string; label: string; align?: "right" }[] = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "createdAt", label: "Joined" },
  { key: "plan", label: "Plan" },
  { key: "projects", label: "Projects", align: "right" },
  { key: "words", label: "Words", align: "right" },
  { key: "streak", label: "Streak", align: "right" },
  { key: "letter", label: "Letter" },
  { key: "firstSentence", label: "1st Sentence" },
];

function statusLabel(status: "written" | "skipped" | "unknown" | "unavailable"): string {
  if (status === "written") return "Written";
  if (status === "skipped") return "Skipped";
  if (status === "unavailable") return "Not available yet";
  return "Unknown";
}

function TablePanel({
  kind,
  title,
  loading,
  rows: propsRows,
  totalCount: propsTotalCount,
  onClose,
  onSelectUser,
  fetchPage,
}: {
  kind: OnboardingDrilldownKind;
  title: string;
  loading: boolean;
  rows: OnboardingDrilldownRow[];
  totalCount: number;
  onClose: () => void;
  onSelectUser: (userId: string) => void;
  fetchPage: (
    kind: OnboardingDrilldownKind,
    query: string,
    offset: number
  ) => Promise<OnboardingDrilldownPage>;
}) {
  const [query, setQuery] = useState("");
  // null means "no local action taken yet — reflect the live rows/totalCount
  // props as-is" (which is what lets the initial fetch's props update, from
  // loading:true/rows:[] to the real first page, show up correctly without
  // ever syncing a prop into state via an effect). Search and load-more
  // both set this explicitly from their own event handlers instead.
  const [override, setOverride] = useState<{ rows: OnboardingDrilldownRow[]; totalCount: number } | null>(
    null
  );
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const rows = override?.rows ?? propsRows;
  const totalCount = override?.totalCount ?? propsTotalCount;

  function handleQueryChange(next: string) {
    setQuery(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = next.trim();
    if (!trimmed) {
      // Cleared search — fall back to the original (unsearched) page
      // instead of re-fetching it.
      setOverride(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      fetchPage(kind, trimmed, 0)
        .then((page) => setOverride(page))
        .finally(() => setSearching(false));
    }, 250);
  }

  function handleLoadMore() {
    setLoadingMore(true);
    fetchPage(kind, query.trim(), rows.length)
      .then((page) => setOverride({ rows: [...rows, ...page.rows], totalCount: page.totalCount }))
      .finally(() => setLoadingMore(false));
  }

  const hasMore = rows.length < totalCount;
  const showingLabel =
    totalCount === 0
      ? null
      : rows.length < totalCount
        ? `Showing ${rows.length} of ${totalCount}`
        : `${totalCount} writer${totalCount === 1 ? "" : "s"}`;

  return (
    <>
      <DrawerHeader eyebrow={`${totalCount} writer${totalCount === 1 ? "" : "s"}`} title={title} onClose={onClose} />
      <div className="flex-1 overflow-y-auto px-5 py-3">
        <input
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Search by name or email…"
          className="mb-3 w-full rounded-md px-3 py-1.5 text-xs outline-none"
          style={{
            background: "var(--surface-card)",
            border: "1px solid var(--color-border-strong)",
            color: "var(--text-primary)",
          }}
        />
        {loading || searching ? (
          <p className="px-2 py-6 text-sm" style={{ color: "var(--color-mist)" }}>
            {loading ? "Loading…" : "Searching…"}
          </p>
        ) : rows.length === 0 ? (
          <p className="px-2 py-6 text-sm" style={{ color: "var(--color-mist)" }}>
            No writers match this yet.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                    {TABLE_COLUMNS.map((col) => (
                      <th
                        key={col.key}
                        className={`whitespace-nowrap pb-2 pr-3 font-semibold uppercase tracking-widest ${
                          col.align === "right" ? "text-right" : "text-left"
                        }`}
                        style={{ color: "var(--color-mist)" }}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td className="max-w-[130px] truncate py-2 pr-3">
                        <button
                          onClick={() => onSelectUser(r.id)}
                          className="truncate text-left transition-opacity hover:opacity-70"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {r.displayName?.trim() || r.username?.trim() || "Writer"}
                        </button>
                      </td>
                      <td
                        className="max-w-[170px] truncate py-2 pr-3"
                        style={{ color: "var(--color-mist)" }}
                        title={r.email ?? undefined}
                      >
                        {r.email ?? "—"}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3" style={{ color: "var(--color-mist)" }}>
                        {fmtDate(r.createdAt)}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3" style={{ color: "var(--color-mist)" }}>
                        {r.subscriptionTier ?? "free"}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums" style={{ color: "var(--text-primary)" }}>
                        {r.projectCount}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums" style={{ color: "var(--text-primary)" }}>
                        {r.totalWords.toLocaleString()}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums" style={{ color: "var(--text-primary)" }}>
                        {r.streak}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3" style={{ color: "var(--color-mist)" }}>
                        {statusLabel(r.futureLetterStatus)}
                      </td>
                      <td className="whitespace-nowrap py-2" style={{ color: "var(--color-mist)" }}>
                        {statusLabel(r.firstSentenceStatus)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-1 py-3">
              <p className="text-[11px]" style={{ color: "var(--color-mist)", opacity: 0.7 }}>
                {showingLabel}
              </p>
              {hasMore && (
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="rounded-md px-3 py-1.5 text-xs transition-opacity hover:opacity-70 disabled:opacity-50"
                  style={{
                    border: "1px solid var(--color-border-strong)",
                    color: "var(--text-primary)",
                  }}
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function UserPanel({
  loading,
  data,
  onClose,
  onBack,
}: {
  loading: boolean;
  data: UserDrawerData | null;
  onClose: () => void;
  onBack?: () => void;
}) {
  return (
    <>
      <DrawerHeader
        eyebrow="Writer"
        title={data ? data.displayName?.trim() || data.username?.trim() || "Writer" : "Loading…"}
        onClose={onClose}
        onBack={onBack}
      />
      {loading ? (
        <p className="px-7 py-6 text-sm" style={{ color: "var(--color-mist)" }}>
          Loading…
        </p>
      ) : !data ? (
        <p className="px-7 py-6 text-sm" style={{ color: "var(--color-mist)" }}>
          Couldn&apos;t load this writer.
        </p>
      ) : (
        <div className="flex flex-1 flex-col">
          <div className="px-7 py-5" style={{ borderBottom: "1px solid var(--color-border)" }}>
            <div className="grid grid-cols-2 gap-y-3 text-sm">
              <StatRow label="Email" value={data.email ?? "—"} />
              <StatRow label="Joined" value={fmtDate(data.createdAt)} />
              <StatRow label="Tier" value={data.subscriptionTier ?? "free"} />
              <StatRow label="Level" value={String(data.level)} />
              <StatRow label="Words written" value={data.totalWordsWritten.toLocaleString()} />
              <StatRow label="Total words" value={data.totalWords.toLocaleString()} />
              <StatRow label="XP" value={data.xp.toLocaleString()} />
            </div>
          </div>

          <div className="px-7 py-5">
            <p
              className="mb-4 text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: "var(--color-mist)" }}
            >
              Timeline
            </p>
            {data.timeline.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--color-mist)" }}>
                No recorded events yet.
              </p>
            ) : (
              <ol className="space-y-4">
                {data.timeline.map((entry, i) => (
                  <li key={`${entry.eventName}-${entry.createdAt}-${i}`} className="flex gap-3">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: "var(--color-gold)" }}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                        {eventLabel(entry.eventName)}
                      </p>
                      <p className="text-xs" style={{ color: "var(--color-mist)" }}>
                        {fmtDateTime(entry.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest" style={{ color: "var(--color-mist)" }}>
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm" style={{ color: "var(--text-primary)" }}>
        {value}
      </p>
    </div>
  );
}
