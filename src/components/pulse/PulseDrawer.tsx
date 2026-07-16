"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  getActivationFunnelDrilldownUsers,
  getCampaignDrilldownUsers,
  getDrilldownUsers,
  getUserDrawerData,
} from "@/lib/actions/pulse";
import type {
  DrilldownKind,
  DrilldownUser,
  PulseTimeRange,
  UserDrawerData,
} from "@/lib/actions/pulse";

type CampaignMetric = "signups" | "firstSaves" | "secondWritingDays" | "subscribers";

type DrawerState =
  | { mode: "closed" }
  | { mode: "list"; title: string; loading: boolean; users: DrilldownUser[] }
  | {
      mode: "user";
      loading: boolean;
      userId: string;
      data: UserDrawerData | null;
      backTo: { title: string; users: DrilldownUser[] } | null;
    };

interface PulseDrawerContextValue {
  range: PulseTimeRange;
  includeInternal: boolean;
  openDrilldown: (kind: DrilldownKind, title: string) => void;
  openFunnelDrilldown: (stepKey: string, title: string) => void;
  openCampaignDrilldown: (campaign: string, metric: CampaignMetric, title: string) => void;
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

  const openUser = useCallback(
    (userId: string) => {
      setState((prev) => ({
        mode: "user",
        loading: true,
        userId,
        data: null,
        backTo: prev.mode === "list" ? { title: prev.title, users: prev.users } : null,
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
    setState((prev) =>
      prev.mode === "user" && prev.backTo
        ? { mode: "list", title: prev.backTo.title, loading: false, users: prev.backTo.users }
        : { mode: "closed" }
    );
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
      value={{ range, includeInternal, openDrilldown, openFunnelDrilldown, openCampaignDrilldown, openUser }}
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

      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Pulse detail"
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[440px] flex-col overflow-y-auto transition-transform duration-300"
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
