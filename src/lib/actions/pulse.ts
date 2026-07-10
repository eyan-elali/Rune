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
  until: string | null
): Promise<number> {
  let q = client.from("profiles").select("id", { count: "exact", head: true });
  if (since) q = q.gte("created_at", since);
  if (until) q = q.lt("created_at", until);
  const { count } = await q;
  return count ?? 0;
}

async function countDistinctUsersForEvent(
  client: ServiceClient,
  eventName: AnalyticsEventName,
  since: string | null,
  until: string | null = null
): Promise<number> {
  let q = client.from("analytics_events").select("user_id").eq("event_name", eventName);
  if (since) q = q.gte("created_at", since);
  if (until) q = q.lt("created_at", until);
  const { data } = await q;
  return new Set((data ?? []).map((r) => r.user_id).filter(Boolean)).size;
}

// ── Daily Brief ──────────────────────────────────────────────────────────

export interface DailyBrief {
  label: string;
  signups: number;
  onboardingCompletions: number;
  firstSaves: number;
  secondWritingDays: number;
  subscriptions: number;
  bottleneck: FunnelBottleneck | null;
}

export async function getDailyBrief(): Promise<DailyBrief> {
  const client = await requireAdminService();
  const { since, until, label } = yesterdayBoundsUtc();

  const [signups, onboardingCompletions, firstSaves, secondWritingDays, subscriptions, funnel] =
    await Promise.all([
      countProfilesInWindow(client, since, until),
      countDistinctUsersForEvent(client, "onboarding_completed", since, until),
      countDistinctUsersForEvent(client, "first_save", since, until),
      countDistinctUsersForEvent(client, "second_writing_day", since, until),
      countDistinctUsersForEvent(client, "subscription_started", since, until),
      // The drop-off insight uses a trailing 30-day funnel rather than a
      // single day — one day of raw counts is too small a sample to name a
      // reliable bottleneck, and the brief is meant to describe the current
      // state of the funnel, not just what happened in the last 24 hours.
      getActivationFunnelInternal(client, rangeSince("30d"), null),
    ]);

  return {
    label,
    signups,
    onboardingCompletions,
    firstSaves,
    secondWritingDays,
    subscriptions,
    bottleneck: funnel.bottleneck,
  };
}

// ── Heartbeat ────────────────────────────────────────────────────────────

export interface HeartbeatMetrics {
  signups: number;
  firstSaves: number;
  secondWritingDays: number;
  subscribers: number;
}

export async function getHeartbeat(range: PulseTimeRange): Promise<HeartbeatMetrics> {
  const client = await requireAdminService();
  const since = rangeSince(range);

  const [signups, firstSaves, secondWritingDays, subscribers] = await Promise.all([
    countProfilesInWindow(client, since, null),
    countDistinctUsersForEvent(client, "first_save", since),
    countDistinctUsersForEvent(client, "second_writing_day", since),
    countDistinctUsersForEvent(client, "subscription_started", since),
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
}

export interface FunnelBottleneck {
  fromLabel: string;
  toLabel: string;
  dropPercent: number;
}

export interface FunnelResult {
  steps: FunnelStep[];
  bottleneck: FunnelBottleneck | null;
}

const FUNNEL_DEFS: { key: string; label: string; eventName: AnalyticsEventName | null }[] = [
  { key: "signup", label: "Signup", eventName: null },
  { key: "email_verified", label: "Email Verified", eventName: "email_verified" },
  { key: "onboarding_started", label: "Onboarding Started", eventName: "onboarding_started" },
  { key: "project_created", label: "Project Created", eventName: "project_created" },
  { key: "first_sentence_written", label: "First Sentence", eventName: "first_sentence_written" },
  { key: "onboarding_completed", label: "Onboarding Completed", eventName: "onboarding_completed" },
  { key: "first_save", label: "First Save", eventName: "first_save" },
];

async function getActivationFunnelInternal(
  client: ServiceClient,
  since: string | null,
  until: string | null
): Promise<FunnelResult> {
  const counts = await Promise.all(
    FUNNEL_DEFS.map((step) =>
      step.eventName === null
        ? countProfilesInWindow(client, since, until)
        : countDistinctUsersForEvent(client, step.eventName, since, until)
    )
  );

  const first = counts[0] || 0;
  const steps: FunnelStep[] = FUNNEL_DEFS.map((def, i) => {
    const count = counts[i];
    const prev = i > 0 ? counts[i - 1] : null;
    const dropFromPrevious =
      prev !== null && prev > 0 ? Math.round((1 - count / prev) * 1000) / 10 : null;
    return {
      key: def.key,
      label: def.label,
      count,
      percentOfFirst: first > 0 ? Math.round((count / first) * 1000) / 10 : 0,
      dropFromPrevious,
    };
  });

  let bottleneck: FunnelBottleneck | null = null;
  for (let i = 1; i < steps.length; i++) {
    const drop = steps[i].dropFromPrevious;
    if (drop !== null && (bottleneck === null || drop > bottleneck.dropPercent)) {
      bottleneck = { fromLabel: steps[i - 1].label, toLabel: steps[i].label, dropPercent: drop };
    }
  }

  return { steps, bottleneck };
}

export async function getActivationFunnel(range: PulseTimeRange): Promise<FunnelResult> {
  const client = await requireAdminService();
  return getActivationFunnelInternal(client, rangeSince(range), null);
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

export async function getWriterProgress(range: PulseTimeRange): Promise<WriterProgressItem[]> {
  const client = await requireAdminService();
  const since = rangeSince(range);

  const counts = await Promise.all(
    WORD_MILESTONES.map((m) => countDistinctUsersForEvent(client, m.eventName, since))
  );

  return WORD_MILESTONES.map((m, i) => ({ ...m, count: counts[i] }));
}

// ── Campaign Performance ─────────────────────────────────────────────────

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
  range: PulseTimeRange
): Promise<{ userIds: string[]; campaignByUser: Map<string, string> }> {
  const since = rangeSince(range);
  let q = client.from("profiles").select("id, created_at");
  if (since) q = q.gte("created_at", since);
  const { data: profiles } = await q;
  const userIds = (profiles ?? []).map((p) => p.id as string);

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

export async function getCampaignPerformance(range: PulseTimeRange): Promise<CampaignRow[]> {
  const client = await requireAdminService();
  const { userIds, campaignByUser } = await getCampaignCohort(client, range);
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
  range: PulseTimeRange
): Promise<DrilldownUser[]> {
  const client = await requireAdminService();
  const { userIds, campaignByUser } = await getCampaignCohort(client, range);
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
  range: PulseTimeRange
): Promise<DrilldownUser[]> {
  const client = await requireAdminService();
  const since = rangeSince(range);

  if (kind === "signups") {
    let q = client
      .from("profiles")
      .select("id, display_name, username, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (since) q = q.gte("created_at", since);
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
  const { data } = await q;

  const eventAtByUser = new Map<string, string>();
  for (const row of data ?? []) {
    if (!eventAtByUser.has(row.user_id as string)) {
      eventAtByUser.set(row.user_id as string, row.created_at as string);
    }
  }

  return hydrateDrilldownUsers(client, Array.from(eventAtByUser.keys()), eventAtByUser);
}

// ── Recent Writers ───────────────────────────────────────────────────────

export interface WriterSummary {
  id: string;
  displayName: string | null;
  username: string | null;
  createdAt: string;
  subscriptionTier: string | null;
  totalWordsWritten: number;
}

export async function searchRecentWriters(
  query: string,
  range: PulseTimeRange
): Promise<WriterSummary[]> {
  const client = await requireAdminService();
  const since = rangeSince(range);

  let q = client
    .from("profiles")
    .select("id, display_name, username, created_at, subscription_tier")
    .order("created_at", { ascending: false })
    .limit(50);
  if (since) q = q.gte("created_at", since);

  const term = query.trim();
  if (term) {
    const escaped = term.replace(/[%_]/g, (c) => `\\${c}`);
    q = q.or(`display_name.ilike.%${escaped}%,username.ilike.%${escaped}%`);
  }

  const { data: profiles } = await q;
  const rows = profiles ?? [];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id as string);
  const { data: sessions } = await client
    .from("writing_sessions")
    .select("user_id, words_added")
    .in("user_id", ids);

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
  timeline: UserTimelineEntry[];
}

export async function getUserDrawerData(userId: string): Promise<UserDrawerData | null> {
  const client = await requireAdminService();

  const [{ data: profile }, { data: events }, { data: sessions }] = await Promise.all([
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
