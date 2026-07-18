"use server";

// Read-only data layer for Pulse, Rune's internal founder dashboard.
// Every export re-verifies admin access itself (via requireAdminService,
// which calls getCurrentAdmin — the RLS-scoped, "can only read your own
// row" check) before touching a service-role client. This is deliberate
// defense in depth: some of these functions are called directly by the
// admin-gated /pulse server component, but others are invoked as server
// actions from client components (search box, drawers, notes), which have
// no other access-control layer of their own.
//
// analytics_events, acquisition_attribution, and founder_notes all have RLS
// enabled with zero user-facing policies (see schema.sql), so cross-user
// reads are only possible through a service-role client — same pattern as
// deleteAccount() and recordAnalyticsEvent().

import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "@/lib/actions/admin";
import { computeStreaks } from "@/lib/streaks";
import type { AnalyticsEventName } from "@/lib/analyticsEvents";
import type { FounderNote } from "@/lib/types";

export type PulseTimeRange = "7d" | "30d" | "90d" | "all";

async function getServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;

  const { createClient: createSupabaseClient } = await import("@supabase/supabase-js");
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

type ServiceClient = NonNullable<Awaited<ReturnType<typeof getServiceClient>>>;

async function requireAdminService(): Promise<ServiceClient> {
  const admin = await getCurrentAdmin();
  if (!admin) throw new Error("Not authorized");

  const client = await getServiceClient();
  if (!client) throw new Error("Pulse is not configured (missing SUPABASE_SERVICE_ROLE_KEY).");

  return client;
}

// ── Internal-account exclusion ───────────────────────────────────────────
// Founder/test accounts recorded in analytics_excluded_users keep firing
// (and storing) normal analytics_events rows — this never touches the write
// path. It only changes what Pulse's read queries count by default, via one
// canonical set fetched once per call and applied at every query that would
// otherwise leak an excluded account into a metric. `includeInternal` is a
// per-request debug override (never persisted) — see IncludeInternalToggle.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getExcludedUserIds(
  client: ServiceClient,
  includeInternal: boolean
): Promise<Set<string>> {
  if (includeInternal) return new Set();
  const { data } = await client.from("analytics_excluded_users").select("user_id");
  return new Set((data ?? []).map((r) => r.user_id as string));
}

// A Postgrest "not in (...)" filter value for the given excluded ids, or
// null when there's nothing to exclude (callers skip the .not() call
// entirely in that case). Values are validated as UUIDs before being
// interpolated — analytics_excluded_users is service-role-managed only, but
// this keeps the query safe even against a malformed row rather than
// trusting the shape.
function excludedIdsFilter(excluded: Set<string>): string | null {
  if (excluded.size === 0) return null;
  const ids = Array.from(excluded).filter((id) => UUID_RE.test(id));
  if (ids.length === 0) return null;
  return `(${ids.join(",")})`;
}

function rangeSince(range: PulseTimeRange): string | null {
  if (range === "all") return null;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

function yesterdayBoundsUtc(): { since: string; until: string; label: string } {
  const now = new Date();
  const todayUtcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const since = new Date(todayUtcMidnight - 86_400_000).toISOString();
  const until = new Date(todayUtcMidnight).toISOString();
  const label = new Date(todayUtcMidnight - 86_400_000).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  return { since, until, label };
}

async function countProfilesInWindow(
  client: ServiceClient,
  since: string | null,
  until: string | null,
  excluded: Set<string>
): Promise<number> {
  let q = client.from("profiles").select("id", { count: "exact", head: true });
  if (since) q = q.gte("created_at", since);
  if (until) q = q.lt("created_at", until);
  const notIn = excludedIdsFilter(excluded);
  if (notIn) q = q.not("id", "in", notIn);
  const { count } = await q;
  return count ?? 0;
}

async function countDistinctUsersForEvent(
  client: ServiceClient,
  eventName: AnalyticsEventName,
  since: string | null,
  until: string | null,
  excluded: Set<string>
): Promise<number> {
  let q = client.from("analytics_events").select("user_id").eq("event_name", eventName);
  if (since) q = q.gte("created_at", since);
  if (until) q = q.lt("created_at", until);
  const notIn = excludedIdsFilter(excluded);
  if (notIn) q = q.not("user_id", "in", notIn);
  const { data } = await q;
  return new Set((data ?? []).map((r) => r.user_id).filter(Boolean)).size;
}

// ── Signup cohorts ───────────────────────────────────────────────────────
// Tracked activation metrics (the funnel, campaign conversion) must all be
// anchored on the same population: users with a recorded signup_completed
// event. Historical profiles that predate first-party analytics never fire
// this event, so they're correctly excluded rather than silently mixed in
// with `profiles.created_at` — see CLAUDE.md-adjacent Pulse correction notes.

async function getUserIdsForEventInRange(
  client: ServiceClient,
  eventName: AnalyticsEventName,
  since: string | null,
  until: string | null,
  excluded: Set<string>
): Promise<string[]> {
  let q = client.from("analytics_events").select("user_id").eq("event_name", eventName);
  if (since) q = q.gte("created_at", since);
  if (until) q = q.lt("created_at", until);
  const notIn = excludedIdsFilter(excluded);
  if (notIn) q = q.not("user_id", "in", notIn);
  const { data } = await q;
  return Array.from(new Set((data ?? []).map((r) => r.user_id as string).filter(Boolean)));
}

// Counts how many members of a fixed cohort have ever reached `eventName`,
// with no time bound on the event itself — a signup inside the selected
// range whose first save happens after the range ends still counts for
// that signup's cohort.
async function countCohortUsersForEvent(
  client: ServiceClient,
  eventName: AnalyticsEventName,
  cohort: string[]
): Promise<number> {
  if (cohort.length === 0) return 0;
  const { data } = await client
    .from("analytics_events")
    .select("user_id")
    .eq("event_name", eventName)
    .in("user_id", cohort);
  return new Set((data ?? []).map((r) => r.user_id as string)).size;
}

// ── Daily Brief ──────────────────────────────────────────────────────────
//
// KNOWN LIMITATION — subscription_started (used here and in Heartbeat/
// Campaign Performance as the only subscription/revenue proxy Pulse has) is
// fired by the Stripe webhook (src/app/api/webhooks/stripe/route.ts) without
// recording Stripe's `livemode` flag anywhere — subscription_events.payload
// doesn't capture it either. Pulse cannot today distinguish a real
// subscription from one created against Stripe's test/sandbox mode; do not
// present this count as verified live revenue. The only current mitigation
// is analytics_excluded_users: every controlled Stripe sandbox/test account
// MUST be added there, since user-level exclusion filters its
// subscription_started events regardless of livemode. If a real revenue/MRR
// metric is added later, capture and check `livemode` at that time.

export interface DailyBrief {
  label: string;
  signups: number;
  onboardingCompletions: number;
  firstSaves: number;
  secondWritingDays: number;
  subscriptions: number;
  bottleneck: FunnelBottleneck | null;
  // Size of the trailing-30-day signup_completed cohort behind `bottleneck`.
  // 0 means there isn't enough tracked activation data to name a bottleneck
  // yet — distinct from "the funnel has no drop-off".
  activationCohortSize: number;
}

export async function getDailyBrief(includeInternal = false): Promise<DailyBrief> {
  const client = await requireAdminService();
  const { since, until, label } = yesterdayBoundsUtc();
  const excluded = await getExcludedUserIds(client, includeInternal);

  const [signups, onboardingCompletions, firstSaves, secondWritingDays, subscriptions, funnel] =
    await Promise.all([
      countProfilesInWindow(client, since, until, excluded),
      countDistinctUsersForEvent(client, "onboarding_completed", since, until, excluded),
      countDistinctUsersForEvent(client, "first_save", since, until, excluded),
      countDistinctUsersForEvent(client, "second_writing_day", since, until, excluded),
      countDistinctUsersForEvent(client, "subscription_started", since, until, excluded),
      // The drop-off insight uses a trailing 30-day funnel rather than a
      // single day — one day of raw counts is too small a sample to name a
      // reliable bottleneck, and the brief is meant to describe the current
      // state of the funnel, not just what happened in the last 24 hours.
      getActivationFunnelInternal(client, rangeSince("30d"), null, excluded),
    ]);

  return {
    label,
    signups,
    onboardingCompletions,
    firstSaves,
    secondWritingDays,
    subscriptions,
    bottleneck: funnel.bottleneck,
    activationCohortSize: funnel.cohortSize,
  };
}

// ── Heartbeat ────────────────────────────────────────────────────────────
// `subscribers` is subscription_started — see the sandbox/live limitation
// noted above DailyBrief.

export interface HeartbeatMetrics {
  signups: number;
  firstSaves: number;
  secondWritingDays: number;
  subscribers: number;
}

export async function getHeartbeat(
  range: PulseTimeRange,
  includeInternal = false
): Promise<HeartbeatMetrics> {
  const client = await requireAdminService();
  const since = rangeSince(range);
  const excluded = await getExcludedUserIds(client, includeInternal);

  const [signups, firstSaves, secondWritingDays, subscribers] = await Promise.all([
    countProfilesInWindow(client, since, null, excluded),
    countDistinctUsersForEvent(client, "first_save", since, null, excluded),
    countDistinctUsersForEvent(client, "second_writing_day", since, null, excluded),
    countDistinctUsersForEvent(client, "subscription_started", since, null, excluded),
  ]);

  return { signups, firstSaves, secondWritingDays, subscribers };
}

// ── Activation Funnel ────────────────────────────────────────────────────

export interface FunnelStep {
  key: string;
  label: string;
  count: number;
  percentOfFirst: number;
  dropFromPrevious: number | null;
  // True when this stage's raw count exceeds the preceding stage's — e.g.
  // some users have first_save recorded without an onboarding_completed
  // event for the same user. This is a tracking gap, not a real funnel
  // gain, so counts are shown as-is (never altered) and no drop/conversion
  // percentage is computed for this transition.
  exceedsPrevious: boolean;
}

export interface FunnelBottleneck {
  fromLabel: string;
  toLabel: string;
  dropPercent: number;
}

export interface FunnelResult {
  steps: FunnelStep[];
  bottleneck: FunnelBottleneck | null;
  // Size of the signup_completed cohort the funnel is anchored on. 0 means
  // there's nothing tracked to show — callers should render a calm empty
  // state rather than a funnel full of misleading 0%s.
  cohortSize: number;
}

const FUNNEL_DEFS: { key: string; label: string; eventName: AnalyticsEventName }[] = [
  { key: "signup", label: "Signup", eventName: "signup_completed" },
  { key: "email_verified", label: "Email Verified", eventName: "email_verified" },
  { key: "onboarding_started", label: "Onboarding Started", eventName: "onboarding_started" },
  { key: "project_created", label: "Project Created", eventName: "project_created" },
  { key: "first_sentence_written", label: "First Sentence", eventName: "first_sentence_written" },
  { key: "onboarding_completed", label: "Onboarding Completed", eventName: "onboarding_completed" },
  { key: "first_save", label: "First Save", eventName: "first_save" },
];

// Cohort-consistent activation funnel: the population is anchored on users
// with a signup_completed event inside [since, until), and every later
// stage counts only members of that same cohort — regardless of when they
// reached the later event. This intentionally excludes historical profiles
// that predate analytics (they have no signup_completed event) rather than
// mixing them with profiles.created_at as the old denominator did.
async function getActivationFunnelInternal(
  client: ServiceClient,
  since: string | null,
  until: string | null,
  excluded: Set<string>
): Promise<FunnelResult> {
  const cohort = await getUserIdsForEventInRange(client, "signup_completed", since, until, excluded);
  const cohortSize = cohort.length;

  if (cohortSize === 0) {
    return { steps: [], bottleneck: null, cohortSize: 0 };
  }

  const laterCounts = await Promise.all(
    FUNNEL_DEFS.slice(1).map((def) => countCohortUsersForEvent(client, def.eventName, cohort))
  );
  // Raw cohort counts, shown as-is. Incomplete historical instrumentation
  // can make a later stage exceed the one before it (e.g. a first_save
  // recorded without an onboarding_completed event for the same user) —
  // that's a real gap in tracking coverage, not a funnel gain, so it's
  // surfaced via `exceedsPrevious` rather than hidden by clamping counts.
  const counts = [cohortSize, ...laterCounts];

  const first = counts[0];
  const steps: FunnelStep[] = FUNNEL_DEFS.map((def, i) => {
    const count = counts[i];
    const prev = i > 0 ? counts[i - 1] : null;
    const exceedsPrevious = prev !== null && count > prev;
    const dropFromPrevious =
      prev !== null && prev > 0 && !exceedsPrevious
        ? Math.round((1 - count / prev) * 1000) / 10
        : null;
    return {
      key: def.key,
      label: def.label,
      count,
      // Capped at 100 — a later stage's count is always bounded by the
      // cohort itself, but this guards the display against ever reading
      // as a >100% conversion if that invariant is ever violated.
      percentOfFirst: first > 0 ? Math.min(100, Math.round((count / first) * 1000) / 10) : 0,
      dropFromPrevious,
      exceedsPrevious,
    };
  });

  let bottleneck: FunnelBottleneck | null = null;
  for (let i = 1; i < steps.length; i++) {
    const drop = steps[i].dropFromPrevious;
    if (drop !== null && (bottleneck === null || drop > bottleneck.dropPercent)) {
      bottleneck = { fromLabel: steps[i - 1].label, toLabel: steps[i].label, dropPercent: drop };
    }
  }

  return { steps, bottleneck, cohortSize };
}

export async function getActivationFunnel(
  range: PulseTimeRange,
  includeInternal = false
): Promise<FunnelResult> {
  const client = await requireAdminService();
  const excluded = await getExcludedUserIds(client, includeInternal);
  return getActivationFunnelInternal(client, rangeSince(range), null, excluded);
}

// Drilldown for a single funnel stage — must return exactly the members
// counted at that stage (the signup cohort, filtered to those who reached
// the stage's event with no time bound), so the list a founder opens always
// matches the number they clicked.
export async function getActivationFunnelDrilldownUsers(
  stepKey: string,
  range: PulseTimeRange,
  includeInternal = false
): Promise<DrilldownUser[]> {
  const client = await requireAdminService();
  const since = rangeSince(range);
  const def = FUNNEL_DEFS.find((d) => d.key === stepKey);
  if (!def) return [];

  const excluded = await getExcludedUserIds(client, includeInternal);
  const cohort = await getUserIdsForEventInRange(client, "signup_completed", since, null, excluded);
  if (cohort.length === 0) return [];

  let q = client
    .from("analytics_events")
    .select("user_id, created_at")
    .eq("event_name", def.eventName)
    .in("user_id", cohort);
  // The signup stage's own event is naturally bounded by the selected
  // range already (that's how the cohort was built); later stages are
  // intentionally left unbounded so a first save after the range's end
  // still shows up under its signup cohort.
  if (def.key === "signup" && since) q = q.gte("created_at", since);
  const { data } = await q;

  const eventAtByUser = new Map<string, string>();
  for (const row of data ?? []) {
    const uid = row.user_id as string;
    const existing = eventAtByUser.get(uid);
    if (!existing || (row.created_at as string) < existing) {
      eventAtByUser.set(uid, row.created_at as string);
    }
  }

  return hydrateDrilldownUsers(client, Array.from(eventAtByUser.keys()), eventAtByUser);
}

// Earliest recorded signup_completed event — used only to caption the
// funnel with when tracked activation data begins. No new schema; just the
// min of an already-indexed column.
export async function getActivationTrackingStartDate(): Promise<string | null> {
  const client = await requireAdminService();
  const { data } = await client
    .from("analytics_events")
    .select("created_at")
    .eq("event_name", "signup_completed")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.created_at as string) ?? null;
}

// ── Onboarding Insights ──────────────────────────────────────────────────
// Behavioral detail on top of the onboarding_completed milestone — not a new
// funnel stage. Two different questions, two different reliable signals:
//
// - "Did this writer complete onboarding at all?" is knowable for every
//   account ever created: onboarding creates a project atomically (see
//   src/app/api/onboarding/route.ts), so "has >=1 project" is a durable,
//   analytics-independent population.
//
// - "Did this writer write or skip their first sentence?" has no durable
//   signal beyond the analytics events recorded at the moment onboarding
//   finished (first_sentence_written, and the sibling onboarding_completed
//   event). Page content is mutable after the fact — a skipped first page
//   can fill up with real writing later — so it can't be reconstructed
//   after the fact from page state. Accounts that onboarded before this
//   event existed are excluded from both written and skipped counts rather
//   than guessed at (see hasIncompleteFirstSentenceCoverage below).
//
// Future-letter written/skipped is measured against a narrower population
// still: writers who *completed onboarding* on or after the future-letter
// feature's launch date. Writers who onboarded before that date never had
// the option to write one, so counting them as "skipped" would misrepresent
// a feature they never saw — they're excluded from both counts and
// surfaced with a distinct "unavailable" status in the drilldown table
// instead. Ground truth for "written" is the future_letters table itself
// (not the onboarding_completed metadata boolean), which is what lets this
// cover every eligible writer, not just those onboarded after analytics
// metadata existed.
//
// Eligibility is intentionally NOT keyed on profiles.created_at (account
// creation). A writer can create an account before the feature launched and
// only complete onboarding afterward — signup and onboarding completion are
// not the same moment. Onboarding creates the project/chapter/page
// atomically as its final step (src/app/api/onboarding/route.ts), so a
// writer's earliest project.created_at is the durable, analytics-independent
// timestamp for "when onboarding actually finished," and that's what's
// compared against the launch date below.
//
// FUTURE_LETTER_LAUNCH_AT is the commit that shipped the future-letter
// migration, the onboarding route's write path, and the onboarding UI for
// it in one changeset — commit 3a729f02f96defa4cf62caf70c31835b86e31ca8,
// "New steps added. V1 Done." (git log -S'future_letters' -- src/app/api/
// onboarding/route.ts), authored 2026-07-13T16:00:37-04:00 =
// 2026-07-13T20:00:37.000Z. There is no separate deploy-log entry in this
// repo, so this assumes Vercel's continuous deployment from `main` shipped
// it at essentially the same moment the commit landed (per CLAUDE.md, this
// project deploys to Vercel on push) — it is the commit timestamp, not a
// confirmed production deploy timestamp.
const FUTURE_LETTER_LAUNCH_AT = "2026-07-13T20:00:37.000Z";

interface OnboardingCohort {
  // Every writer, in range, who has completed onboarding (>=1 project).
  onboardedIds: string[];
  // Subset of onboardedIds whose earliest project was created on/after
  // FUTURE_LETTER_LAUNCH_AT — the actual future-letter population.
  letterEligibleIds: string[];
  // user_id -> earliest future_letters.created_at, scoped to letterEligibleIds.
  letterWrittenAt: Map<string, string>;
  // user_id -> onboarding_completed event time, for writers whose onboarding
  // was tracked by analytics — the first-sentence population.
  firstSentenceCompletedAt: Map<string, string>;
  // user_id -> first_sentence_written event time.
  firstSentenceWrittenAt: Map<string, string>;
}

async function getOnboardedUserIds(
  client: ServiceClient,
  since: string | null,
  excluded: Set<string>
): Promise<{ id: string; earliestProjectAt: string }[]> {
  let q = client.from("profiles").select("id, created_at");
  if (since) q = q.gte("created_at", since);
  const notIn = excludedIdsFilter(excluded);
  if (notIn) q = q.not("id", "in", notIn);
  const { data: profiles } = await q;
  const candidateIds = (profiles ?? []).map((p) => p.id as string);
  if (candidateIds.length === 0) return [];

  // One batched query for every candidate's projects — not just whether one
  // exists, but each project's created_at, so the earliest one can double
  // as the onboarding-completion timestamp (see comment above
  // FUTURE_LETTER_LAUNCH_AT). No N+1: this is a single .in() query
  // regardless of how many candidates there are.
  const { data: projects } = await client
    .from("projects")
    .select("user_id, created_at")
    .in("user_id", candidateIds);
  const earliestProjectAtByUser = new Map<string, string>();
  for (const p of projects ?? []) {
    const uid = p.user_id as string;
    const at = p.created_at as string;
    const existing = earliestProjectAtByUser.get(uid);
    if (!existing || at < existing) earliestProjectAtByUser.set(uid, at);
  }

  return Array.from(earliestProjectAtByUser.entries()).map(([id, earliestProjectAt]) => ({
    id,
    earliestProjectAt,
  }));
}

async function getOnboardingCohort(
  client: ServiceClient,
  since: string | null,
  excluded: Set<string>
): Promise<OnboardingCohort> {
  const onboarded = await getOnboardedUserIds(client, since, excluded);
  const onboardedIds = onboarded.map((o) => o.id);
  const letterEligibleIds = onboarded
    .filter((o) => o.earliestProjectAt >= FUTURE_LETTER_LAUNCH_AT)
    .map((o) => o.id);
  const notIn = excludedIdsFilter(excluded);

  const [lettersResult, eventsResult] = await Promise.all([
    letterEligibleIds.length > 0
      ? client.from("future_letters").select("user_id, created_at").in("user_id", letterEligibleIds)
      : Promise.resolve({ data: [] as { user_id: string; created_at: string }[] | null }),
    (async () => {
      let q = client
        .from("analytics_events")
        .select("user_id, event_name, created_at")
        .in("event_name", ["onboarding_completed", "first_sentence_written"]);
      if (since) q = q.gte("created_at", since);
      if (notIn) q = q.not("user_id", "in", notIn);
      return q;
    })(),
  ]);

  const letterWrittenAt = new Map<string, string>();
  for (const row of lettersResult.data ?? []) {
    const uid = row.user_id as string;
    const at = row.created_at as string;
    const existing = letterWrittenAt.get(uid);
    if (!existing || at < existing) letterWrittenAt.set(uid, at);
  }

  const firstSentenceCompletedAt = new Map<string, string>();
  const firstSentenceWrittenAt = new Map<string, string>();
  for (const row of eventsResult.data ?? []) {
    const uid = row.user_id as string;
    const at = row.created_at as string;
    const target = row.event_name === "onboarding_completed" ? firstSentenceCompletedAt : firstSentenceWrittenAt;
    const existing = target.get(uid);
    if (!existing || at < existing) target.set(uid, at);
  }

  return { onboardedIds, letterEligibleIds, letterWrittenAt, firstSentenceCompletedAt, firstSentenceWrittenAt };
}

export interface OnboardingInsights {
  // Every writer in range who has completed onboarding, regardless of
  // whether they're old enough to count toward the letter stat.
  onboardedCount: number;
  // Subset of onboardedCount who onboarded on/after the future-letter
  // launch date — the actual denominator for the letter percentages below.
  letterEligibleCount: number;
  letterWrittenCount: number;
  letterSkippedCount: number;
  letterWrittenPercent: number;
  letterSkippedPercent: number;
  // True when some onboarded writers in range predate the future-letter
  // launch — callers should show a quiet eligibility notice.
  hasIneligibleLetterCohort: boolean;

  // Subset of onboardedCount whose onboarding was tracked by analytics —
  // the denominator for the first-sentence percentages below.
  firstSentenceCoveredCount: number;
  firstSentenceWrittenCount: number;
  firstSentenceSkippedCount: number;
  firstSentenceWrittenPercent: number;
  firstSentenceSkippedPercent: number;
  // True when some onboarded writers in range predate the first-sentence
  // analytics event — callers should show a quiet coverage notice.
  hasIncompleteFirstSentenceCoverage: boolean;
}

export async function getOnboardingInsights(
  range: PulseTimeRange,
  includeInternal = false
): Promise<OnboardingInsights> {
  const client = await requireAdminService();
  const since = rangeSince(range);
  const excluded = await getExcludedUserIds(client, includeInternal);
  const cohort = await getOnboardingCohort(client, since, excluded);

  const onboardedCount = cohort.onboardedIds.length;
  const letterEligibleCount = cohort.letterEligibleIds.length;
  const letterWrittenCount = cohort.letterWrittenAt.size;
  const letterSkippedCount = letterEligibleCount - letterWrittenCount;

  const firstSentenceCoveredCount = cohort.firstSentenceCompletedAt.size;
  const firstSentenceWrittenCount = Array.from(cohort.firstSentenceCompletedAt.keys()).filter((id) =>
    cohort.firstSentenceWrittenAt.has(id)
  ).length;
  const firstSentenceSkippedCount = firstSentenceCoveredCount - firstSentenceWrittenCount;

  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

  return {
    onboardedCount,
    letterEligibleCount,
    letterWrittenCount,
    letterSkippedCount,
    letterWrittenPercent: pct(letterWrittenCount, letterEligibleCount),
    letterSkippedPercent: pct(letterSkippedCount, letterEligibleCount),
    hasIneligibleLetterCohort: onboardedCount > letterEligibleCount,
    firstSentenceCoveredCount,
    firstSentenceWrittenCount,
    firstSentenceSkippedCount,
    firstSentenceWrittenPercent: pct(firstSentenceWrittenCount, firstSentenceCoveredCount),
    firstSentenceSkippedPercent: pct(firstSentenceSkippedCount, firstSentenceCoveredCount),
    hasIncompleteFirstSentenceCoverage: onboardedCount > firstSentenceCoveredCount,
  };
}

// ── Onboarding drilldowns: future letters + first sentence ──────────────

export type OnboardingDrilldownKind =
  | "future_letter_written"
  | "future_letter_skipped"
  | "first_sentence_written"
  | "first_sentence_skipped";

export interface OnboardingDrilldownRow {
  id: string;
  displayName: string | null;
  username: string | null;
  email: string | null;
  createdAt: string;
  subscriptionTier: string | null;
  projectCount: number;
  totalWords: number;
  streak: number;
  // "unavailable" — onboarded before the future-letter feature launched, so
  // they never had the option and don't count toward written or skipped.
  futureLetterStatus: "written" | "skipped" | "unavailable";
  firstSentenceStatus: "written" | "skipped" | "unknown";
}

function idsForOnboardingKind(
  cohort: OnboardingCohort,
  kind: OnboardingDrilldownKind
): { ids: string[]; sortAt: Map<string, string> } {
  switch (kind) {
    case "future_letter_written":
      return { ids: Array.from(cohort.letterWrittenAt.keys()), sortAt: cohort.letterWrittenAt };
    case "future_letter_skipped":
      return {
        ids: cohort.letterEligibleIds.filter((id) => !cohort.letterWrittenAt.has(id)),
        sortAt: new Map(),
      };
    case "first_sentence_written":
      return {
        ids: Array.from(cohort.firstSentenceCompletedAt.keys()).filter((id) =>
          cohort.firstSentenceWrittenAt.has(id)
        ),
        sortAt: cohort.firstSentenceWrittenAt,
      };
    case "first_sentence_skipped":
      return {
        ids: Array.from(cohort.firstSentenceCompletedAt.keys()).filter(
          (id) => !cohort.firstSentenceWrittenAt.has(id)
        ),
        sortAt: cohort.firstSentenceCompletedAt,
      };
  }
}

// auth.admin has no "get many users by id" call — only getUserById (one at a
// time) and listUsers (paginated, unfiltered). For a table of up to ~200
// drilldown rows, paginating listUsers once and keeping only the ids we
// need avoids up to 200 sequential admin calls.
async function getEmailsByUserId(
  client: ServiceClient,
  userIds: string[]
): Promise<Map<string, string>> {
  const emails = new Map<string, string>();
  if (userIds.length === 0) return emails;
  const wanted = new Set(userIds);
  const perPage = 1000;
  for (let page = 1; page <= 20 && wanted.size > 0; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error || !data) break;
    for (const u of data.users) {
      if (wanted.has(u.id) && u.email) {
        emails.set(u.id, u.email);
        wanted.delete(u.id);
      }
    }
    if (data.users.length < perPage) break;
  }
  return emails;
}

// One page of a drilldown table, plus the true size of the full matching
// cohort (after any search filter) — never just the page size. Callers rely
// on totalCount to render an honest "Showing X of Y" / load-more state
// instead of silently truncating at the page size.
export interface OnboardingDrilldownPage {
  rows: OnboardingDrilldownRow[];
  totalCount: number;
}

const ONBOARDING_DRILLDOWN_PAGE_SIZE = 50;

export async function getOnboardingDrilldownRows(
  kind: OnboardingDrilldownKind,
  range: PulseTimeRange,
  includeInternal = false,
  query = "",
  offset = 0
): Promise<OnboardingDrilldownPage> {
  const client = await requireAdminService();
  const since = rangeSince(range);
  const excluded = await getExcludedUserIds(client, includeInternal);
  const cohort = await getOnboardingCohort(client, since, excluded);

  const { ids: allIds, sortAt } = idsForOnboardingKind(cohort, kind);
  if (allIds.length === 0) return { rows: [], totalCount: 0 };

  // Lightweight pass over the FULL matching cohort (not just one page) —
  // needed to sort deterministically before paginating, and, when
  // searching, to match on name/username without fetching heavier
  // per-row data (projects, word totals, streak) for anyone outside the
  // requested page.
  const { data: lightProfiles } = await client
    .from("profiles")
    .select("id, display_name, username, created_at")
    .in("id", allIds);
  const createdAtById = new Map<string, string>();
  const nameById = new Map<string, string>();
  for (const p of lightProfiles ?? []) {
    const id = p.id as string;
    createdAtById.set(id, p.created_at as string);
    nameById.set(id, `${p.display_name ?? ""} ${p.username ?? ""}`.toLowerCase());
  }

  const sortedIds = [...allIds].sort((a, b) => {
    const at = sortAt.get(a) ?? createdAtById.get(a) ?? "";
    const bt = sortAt.get(b) ?? createdAtById.get(b) ?? "";
    return bt.localeCompare(at);
  });

  // Search spans the full cohort, not just whatever page is currently
  // loaded — this is what lets totalCount (and therefore the "Showing X of
  // Y" state) stay accurate while a search is active. Cohort sizes here are
  // a founder debugging tool's scale (tens to low hundreds), so scanning it
  // in memory is cheap; email matching reuses the same bulk lookup pagination
  // uses for row-building rather than a second per-row admin call.
  const term = query.trim().toLowerCase();
  let matchingIds = sortedIds;
  let emailById: Map<string, string> | null = null;
  if (term) {
    emailById = await getEmailsByUserId(client, sortedIds);
    const emails = emailById;
    matchingIds = sortedIds.filter((id) => {
      const name = nameById.get(id) ?? "";
      const email = (emails.get(id) ?? "").toLowerCase();
      return name.includes(term) || email.includes(term);
    });
  }

  const totalCount = matchingIds.length;
  const pageIds = matchingIds.slice(offset, offset + ONBOARDING_DRILLDOWN_PAGE_SIZE);
  if (pageIds.length === 0) return { rows: [], totalCount };

  const [{ data: profiles }, { data: projects }, totalWordsByUser, { data: sessions }, emailByUser] =
    await Promise.all([
      client
        .from("profiles")
        .select("id, display_name, username, created_at, subscription_tier")
        .in("id", pageIds),
      client.from("projects").select("id, user_id").in("user_id", pageIds),
      getStoredWordTotalsByUser(client, pageIds),
      client
        .from("writing_sessions")
        .select("user_id, session_date")
        .in("user_id", pageIds)
        .gt("words_added", 0),
      emailById ? Promise.resolve(emailById) : getEmailsByUserId(client, pageIds),
    ]);

  const projectCountByUser = new Map<string, number>();
  for (const p of projects ?? []) {
    const uid = p.user_id as string;
    projectCountByUser.set(uid, (projectCountByUser.get(uid) ?? 0) + 1);
  }

  const sessionDatesByUser = new Map<string, string[]>();
  for (const s of sessions ?? []) {
    const uid = s.user_id as string;
    const list = sessionDatesByUser.get(uid) ?? [];
    list.push(s.session_date as string);
    sessionDatesByUser.set(uid, list);
  }
  const streakByUser = new Map<string, number>();
  for (const [uid, dates] of sessionDatesByUser) {
    const uniqueSorted = Array.from(new Set(dates)).sort();
    streakByUser.set(uid, computeStreaks(uniqueSorted).currentStreak);
  }

  const letterEligibleSet = new Set(cohort.letterEligibleIds);
  // pageIds already reflects the intended sort + search + pagination order
  // established above — .in() queries don't preserve row order, so rebuild
  // the final order from it rather than re-deriving from timestamps again.
  const orderIndex = new Map(pageIds.map((id, i) => [id, i]));

  const rows = (profiles ?? [])
    .map((p) => {
      const id = p.id as string;
      const row: OnboardingDrilldownRow = {
        id,
        displayName: p.display_name as string | null,
        username: p.username as string | null,
        email: emailByUser.get(id) ?? null,
        createdAt: p.created_at as string,
        subscriptionTier: p.subscription_tier as string | null,
        projectCount: projectCountByUser.get(id) ?? 0,
        totalWords: totalWordsByUser.get(id) ?? 0,
        streak: streakByUser.get(id) ?? 0,
        futureLetterStatus: !letterEligibleSet.has(id)
          ? "unavailable"
          : cohort.letterWrittenAt.has(id)
            ? "written"
            : "skipped",
        firstSentenceStatus: cohort.firstSentenceCompletedAt.has(id)
          ? cohort.firstSentenceWrittenAt.has(id)
            ? "written"
            : "skipped"
          : "unknown",
      };
      return row;
    })
    .sort((a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0));

  return { rows, totalCount };
}

// ── Writer Progress ──────────────────────────────────────────────────────

export interface WriterProgressItem {
  threshold: number;
  eventName: AnalyticsEventName;
  count: number;
}

const WORD_MILESTONES: { threshold: number; eventName: AnalyticsEventName }[] = [
  { threshold: 100, eventName: "reached_100_words" },
  { threshold: 500, eventName: "reached_500_words" },
  { threshold: 2000, eventName: "reached_2000_words" },
  { threshold: 5000, eventName: "reached_5000_words" },
  { threshold: 10000, eventName: "reached_10000_words" },
  { threshold: 15000, eventName: "reached_15000_words" },
];

export async function getWriterProgress(
  range: PulseTimeRange,
  includeInternal = false
): Promise<WriterProgressItem[]> {
  const client = await requireAdminService();
  const since = rangeSince(range);
  const excluded = await getExcludedUserIds(client, includeInternal);

  const counts = await Promise.all(
    WORD_MILESTONES.map((m) => countDistinctUsersForEvent(client, m.eventName, since, null, excluded))
  );

  return WORD_MILESTONES.map((m, i) => ({ ...m, count: counts[i] }));
}

// ── Campaign Performance ─────────────────────────────────────────────────
// `subscribers` is subscription_started — see the sandbox/live limitation
// noted above DailyBrief.

export interface CampaignRow {
  campaign: string;
  signups: number;
  firstSaves: number;
  secondWritingDays: number;
  subscribers: number;
}

const UNATTRIBUTED_LABEL = "Direct / Unattributed";

async function getCampaignCohort(
  client: ServiceClient,
  range: PulseTimeRange,
  excluded: Set<string>
): Promise<{ userIds: string[]; campaignByUser: Map<string, string> }> {
  const since = rangeSince(range);
  // Cohort-consistent with the activation funnel: a campaign's signups are
  // users with a tracked signup_completed event in range, not every profile
  // created in range. A historically attributed user with no tracked signup
  // event is correctly absent here — their journey can't be reconstructed.
  const userIds = await getUserIdsForEventInRange(client, "signup_completed", since, null, excluded);

  const campaignByUser = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: attributions } = await client
      .from("acquisition_attribution")
      .select("user_id, campaign, source")
      .in("user_id", userIds);
    for (const a of attributions ?? []) {
      const label = (a.campaign as string | null)?.trim() || (a.source as string | null)?.trim();
      if (label) campaignByUser.set(a.user_id as string, label);
    }
  }

  return { userIds, campaignByUser };
}

export async function getCampaignPerformance(
  range: PulseTimeRange,
  includeInternal = false
): Promise<CampaignRow[]> {
  const client = await requireAdminService();
  const excluded = await getExcludedUserIds(client, includeInternal);
  const { userIds, campaignByUser } = await getCampaignCohort(client, range, excluded);
  if (userIds.length === 0) return [];

  // Downstream conversion is checked across all time, not bounded to the
  // signup window — a writer who signed up 3 days ago hasn't had the same
  // chance to reach "second writing day" as one who signed up 25 days ago,
  // but their eventual conversion still belongs to their acquisition cohort.
  const [firstSaveRows, secondDayRows, subRows] = await Promise.all([
    client.from("analytics_events").select("user_id").eq("event_name", "first_save").in("user_id", userIds),
    client.from("analytics_events").select("user_id").eq("event_name", "second_writing_day").in("user_id", userIds),
    client.from("analytics_events").select("user_id").eq("event_name", "subscription_started").in("user_id", userIds),
  ]);

  const firstSaveSet = new Set((firstSaveRows.data ?? []).map((r) => r.user_id));
  const secondDaySet = new Set((secondDayRows.data ?? []).map((r) => r.user_id));
  const subSet = new Set((subRows.data ?? []).map((r) => r.user_id));

  const byCampaign = new Map<string, CampaignRow>();
  for (const id of userIds) {
    const campaign = campaignByUser.get(id) ?? UNATTRIBUTED_LABEL;
    const bucket = byCampaign.get(campaign) ?? {
      campaign,
      signups: 0,
      firstSaves: 0,
      secondWritingDays: 0,
      subscribers: 0,
    };
    bucket.signups++;
    if (firstSaveSet.has(id)) bucket.firstSaves++;
    if (secondDaySet.has(id)) bucket.secondWritingDays++;
    if (subSet.has(id)) bucket.subscribers++;
    byCampaign.set(campaign, bucket);
  }

  return Array.from(byCampaign.values()).sort((a, b) => b.signups - a.signups);
}

export async function getCampaignDrilldownUsers(
  campaign: string,
  metric: "signups" | "firstSaves" | "secondWritingDays" | "subscribers",
  range: PulseTimeRange,
  includeInternal = false
): Promise<DrilldownUser[]> {
  const client = await requireAdminService();
  const excluded = await getExcludedUserIds(client, includeInternal);
  const { userIds, campaignByUser } = await getCampaignCohort(client, range, excluded);
  const cohort = userIds.filter((id) => (campaignByUser.get(id) ?? UNATTRIBUTED_LABEL) === campaign);
  if (cohort.length === 0) return [];

  let qualifying = cohort;
  if (metric !== "signups") {
    const eventName: AnalyticsEventName =
      metric === "firstSaves"
        ? "first_save"
        : metric === "secondWritingDays"
          ? "second_writing_day"
          : "subscription_started";
    const { data } = await client
      .from("analytics_events")
      .select("user_id")
      .eq("event_name", eventName)
      .in("user_id", cohort);
    const qualifyingSet = new Set((data ?? []).map((r) => r.user_id));
    qualifying = cohort.filter((id) => qualifyingSet.has(id));
  }

  return hydrateDrilldownUsers(client, qualifying);
}

// ── Drilldowns: click a metric, see the underlying users ────────────────

export interface DrilldownUser {
  id: string;
  displayName: string | null;
  username: string | null;
  createdAt: string;
  eventAt: string | null;
}

async function hydrateDrilldownUsers(
  client: ServiceClient,
  userIds: string[],
  eventAtByUser?: Map<string, string>
): Promise<DrilldownUser[]> {
  if (userIds.length === 0) return [];
  const ids = userIds.slice(0, 200);
  const { data: profiles } = await client
    .from("profiles")
    .select("id, display_name, username, created_at")
    .in("id", ids);

  return (profiles ?? [])
    .map((p) => ({
      id: p.id as string,
      displayName: p.display_name as string | null,
      username: p.username as string | null,
      createdAt: p.created_at as string,
      eventAt: eventAtByUser?.get(p.id as string) ?? null,
    }))
    .sort((a, b) => {
      const at = a.eventAt ?? a.createdAt;
      const bt = b.eventAt ?? b.createdAt;
      return new Date(bt).getTime() - new Date(at).getTime();
    });
}

export type DrilldownKind = "signups" | AnalyticsEventName;

export async function getDrilldownUsers(
  kind: DrilldownKind,
  range: PulseTimeRange,
  includeInternal = false
): Promise<DrilldownUser[]> {
  const client = await requireAdminService();
  const since = rangeSince(range);
  const excluded = await getExcludedUserIds(client, includeInternal);
  const notIn = excludedIdsFilter(excluded);

  if (kind === "signups") {
    let q = client
      .from("profiles")
      .select("id, display_name, username, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (since) q = q.gte("created_at", since);
    if (notIn) q = q.not("id", "in", notIn);
    const { data } = await q;
    return (data ?? []).map((p) => ({
      id: p.id as string,
      displayName: p.display_name as string | null,
      username: p.username as string | null,
      createdAt: p.created_at as string,
      eventAt: null,
    }));
  }

  let q = client
    .from("analytics_events")
    .select("user_id, created_at")
    .eq("event_name", kind)
    .order("created_at", { ascending: false })
    .limit(500);
  if (since) q = q.gte("created_at", since);
  if (notIn) q = q.not("user_id", "in", notIn);
  const { data } = await q;

  const eventAtByUser = new Map<string, string>();
  for (const row of data ?? []) {
    if (!eventAtByUser.has(row.user_id as string)) {
      eventAtByUser.set(row.user_id as string, row.created_at as string);
    }
  }

  return hydrateDrilldownUsers(client, Array.from(eventAtByUser.keys()), eventAtByUser);
}

// ── Stored-word totals ───────────────────────────────────────────────────
// "Total Words" in Pulse means every live page a writer has stored —
// canonical AND non-canonical — the same definition the free-tier
// allowance is measured against (see account_word_total() in migration
// 011). This is deliberately not projects.word_count: that cached column is
// canonical-aware (only each chapter's canonical page counts), which is the
// right definition for the manuscript's *official* display total elsewhere
// in the app, but would under-report a writer who has non-canonical drafts
// stored — Pulse's Total Words is about storage/allowance usage, not the
// official manuscript. Queried directly (projects → chapters → pages)
// rather than any cached total, so it can never be stale for this purpose.
// Deleted rows are excluded automatically (they aren't in the tables), and
// each page is read exactly once, so nothing is double-counted.
async function getStoredWordTotalsByUser(
  client: ServiceClient,
  userIds: string[]
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (userIds.length === 0) return totals;

  const { data: projects } = await client
    .from("projects")
    .select("id, user_id")
    .in("user_id", userIds);
  const userIdByProject = new Map((projects ?? []).map((p) => [p.id as string, p.user_id as string]));
  const projectIds = Array.from(userIdByProject.keys());
  if (projectIds.length === 0) return totals;

  const { data: chapters } = await client
    .from("chapters")
    .select("id, project_id")
    .in("project_id", projectIds);
  const projectIdByChapter = new Map((chapters ?? []).map((c) => [c.id as string, c.project_id as string]));
  const chapterIds = Array.from(projectIdByChapter.keys());
  if (chapterIds.length === 0) return totals;

  const { data: pages } = await client
    .from("pages")
    .select("word_count, chapter_id")
    .in("chapter_id", chapterIds);

  for (const p of pages ?? []) {
    const projectId = projectIdByChapter.get(p.chapter_id as string);
    const userId = projectId ? userIdByProject.get(projectId) : undefined;
    if (!userId) continue;
    totals.set(userId, (totals.get(userId) ?? 0) + ((p.word_count as number) ?? 0));
  }

  return totals;
}

// ── Recent Writers ───────────────────────────────────────────────────────

export interface WriterSummary {
  id: string;
  displayName: string | null;
  username: string | null;
  createdAt: string;
  subscriptionTier: string | null;
  totalWordsWritten: number;
  totalWords: number;
}

export async function searchRecentWriters(
  query: string,
  range: PulseTimeRange,
  includeInternal = false
): Promise<WriterSummary[]> {
  const client = await requireAdminService();
  const since = rangeSince(range);
  const excluded = await getExcludedUserIds(client, includeInternal);
  const notIn = excludedIdsFilter(excluded);

  let q = client
    .from("profiles")
    .select("id, display_name, username, created_at, subscription_tier")
    .order("created_at", { ascending: false })
    .limit(50);
  if (since) q = q.gte("created_at", since);
  if (notIn) q = q.not("id", "in", notIn);

  const term = query.trim();
  if (term) {
    const escaped = term.replace(/[%_]/g, (c) => `\\${c}`);
    q = q.or(`display_name.ilike.%${escaped}%,username.ilike.%${escaped}%`);
  }

  const { data: profiles } = await q;
  const rows = profiles ?? [];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id as string);
  const [{ data: sessions }, totalWordsByUser] = await Promise.all([
    client.from("writing_sessions").select("user_id, words_added").in("user_id", ids),
    getStoredWordTotalsByUser(client, ids),
  ]);

  const wordsByUser = new Map<string, number>();
  for (const s of sessions ?? []) {
    wordsByUser.set(
      s.user_id as string,
      (wordsByUser.get(s.user_id as string) ?? 0) + ((s.words_added as number) ?? 0)
    );
  }

  return rows.map((p) => ({
    id: p.id as string,
    displayName: p.display_name as string | null,
    username: p.username as string | null,
    createdAt: p.created_at as string,
    subscriptionTier: p.subscription_tier as string | null,
    totalWordsWritten: wordsByUser.get(p.id as string) ?? 0,
    totalWords: totalWordsByUser.get(p.id as string) ?? 0,
  }));
}

// ── User drawer: chronological event timeline ───────────────────────────

export interface UserTimelineEntry {
  eventName: string;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

export interface UserDrawerData {
  id: string;
  email: string | null;
  displayName: string | null;
  username: string | null;
  createdAt: string;
  subscriptionTier: string | null;
  xp: number;
  level: number;
  totalWordsWritten: number;
  totalWords: number;
  timeline: UserTimelineEntry[];
}

export async function getUserDrawerData(userId: string): Promise<UserDrawerData | null> {
  const client = await requireAdminService();

  const [{ data: profile }, { data: events }, { data: sessions }, totalWordsByUser] =
    await Promise.all([
      client
        .from("profiles")
        .select("id, display_name, username, created_at, subscription_tier, xp, level")
        .eq("id", userId)
        .maybeSingle(),
      client
        .from("analytics_events")
        .select("event_name, created_at, metadata")
        .eq("user_id", userId)
        .order("created_at", { ascending: true }),
      client.from("writing_sessions").select("words_added").eq("user_id", userId),
      getStoredWordTotalsByUser(client, [userId]),
    ]);

  if (!profile) return null;

  let email: string | null = null;
  try {
    const { data } = await client.auth.admin.getUserById(userId);
    email = data?.user?.email ?? null;
  } catch {
    // Best-effort — the timeline is still useful without the email.
  }

  const totalWordsWritten = (sessions ?? []).reduce(
    (sum, s) => sum + ((s.words_added as number) ?? 0),
    0
  );

  // Every stored page this writer owns, canonical or not — see
  // getStoredWordTotalsByUser above. Includes pasted/imported words, unlike
  // totalWordsWritten above.
  const totalWords = totalWordsByUser.get(userId) ?? 0;

  return {
    id: profile.id as string,
    email,
    displayName: profile.display_name as string | null,
    username: profile.username as string | null,
    createdAt: profile.created_at as string,
    subscriptionTier: profile.subscription_tier as string | null,
    xp: (profile.xp as number) ?? 0,
    level: (profile.level as number) ?? 1,
    totalWordsWritten,
    totalWords,
    timeline: (events ?? []).map((e) => ({
      eventName: e.event_name as string,
      createdAt: e.created_at as string,
      metadata: e.metadata as Record<string, unknown> | null,
    })),
  };
}

// ── Open Questions: founder notes ────────────────────────────────────────

export async function listFounderNotes(): Promise<FounderNote[]> {
  const client = await requireAdminService();
  const { data } = await client
    .from("founder_notes")
    .select("*")
    .order("created_at", { ascending: false });
  return (data ?? []) as FounderNote[];
}

export async function createFounderNote(content: string): Promise<{ error: string | null }> {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Not authorized" };

  const trimmed = content.trim();
  if (!trimmed) return { error: "Note cannot be empty." };

  const client = await getServiceClient();
  if (!client) return { error: "Pulse is not configured (missing SUPABASE_SERVICE_ROLE_KEY)." };

  const { error } = await client
    .from("founder_notes")
    .insert({ content: trimmed, author_id: admin.id });

  if (error) return { error: error.message };
  revalidatePath("/pulse");
  return { error: null };
}

export async function deleteFounderNote(id: string): Promise<{ error: string | null }> {
  const client = await requireAdminService();
  const { error } = await client.from("founder_notes").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/pulse");
  return { error: null };
}

// ── Internal Accounts: manage Pulse's founder/test exclusion list ────────
// Minimal admin CRUD over analytics_excluded_users. Deliberately add-by-
// exact-UUID only — no search/browse UI for picking accounts to exclude, to
// keep this a narrow allowlist tool rather than a user-management surface.

export interface ExcludedUser {
  userId: string;
  displayName: string | null;
  username: string | null;
  reason: string | null;
  createdAt: string;
}

export async function listExcludedUsers(): Promise<ExcludedUser[]> {
  const client = await requireAdminService();
  const { data: rows } = await client
    .from("analytics_excluded_users")
    .select("user_id, reason, created_at")
    .order("created_at", { ascending: false });
  if (!rows || rows.length === 0) return [];

  const ids = rows.map((r) => r.user_id as string);
  const { data: profiles } = await client
    .from("profiles")
    .select("id, display_name, username")
    .in("id", ids);
  const profileById = new Map((profiles ?? []).map((p) => [p.id as string, p]));

  return rows.map((r) => {
    const p = profileById.get(r.user_id as string);
    return {
      userId: r.user_id as string,
      displayName: (p?.display_name as string | null) ?? null,
      username: (p?.username as string | null) ?? null,
      reason: r.reason as string | null,
      createdAt: r.created_at as string,
    };
  });
}

export async function addExcludedUser(
  userId: string,
  reason: string
): Promise<{ error: string | null }> {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: "Not authorized" };

  const trimmedId = userId.trim();
  if (!UUID_RE.test(trimmedId)) return { error: "Enter a valid user UUID." };

  const client = await getServiceClient();
  if (!client) return { error: "Pulse is not configured (missing SUPABASE_SERVICE_ROLE_KEY)." };

  const { data: profile } = await client
    .from("profiles")
    .select("id")
    .eq("id", trimmedId)
    .maybeSingle();
  if (!profile) return { error: "No account exists with that ID." };

  const { error } = await client.from("analytics_excluded_users").upsert({
    user_id: trimmedId,
    reason: reason.trim() || null,
    created_by: admin.id,
  });

  if (error) return { error: error.message };
  revalidatePath("/pulse");
  return { error: null };
}

export async function removeExcludedUser(userId: string): Promise<{ error: string | null }> {
  const client = await requireAdminService();
  const { error } = await client.from("analytics_excluded_users").delete().eq("user_id", userId);
  if (error) return { error: error.message };
  revalidatePath("/pulse");
  return { error: null };
}
