// Pulse's launch report, computed from plain rows (no DB here — the loader is
// lib/actions/pulseLaunch.ts). Definitions live in lib/launchMetrics.ts.
//
// COHORT: accounts with a production signup_completed event inside the
// selected range (internal accounts excluded unless asked for). Every later
// stage counts members of that same cohort whenever they reached it — a
// writer who signed up on the last day of the range and activated a week
// later still counts for this cohort. Accounts from before signup tracking
// have no signup_completed event and are never mixed in.
//
// The ACQUISITION line is different by nature: landing views and CTA clicks
// are anonymous, so they are counted as events inside the range, not as a
// cohort. View → signup is therefore a rate between two counts over the same
// window, not a per-visitor conversion.

import { channelFor, deriveWriterRetention, median, type Channel, type CtaPlacement, CTA_PLACEMENTS } from "@/lib/launchMetrics";

export interface CohortSignup {
  user_id: string;
  created_at: string;
}

export interface CohortEvent {
  user_id: string;
  event_name: string;
  created_at: string;
  local_date: string | null;
  metadata: Record<string, unknown> | null;
}

export interface AttributionRow {
  user_id: string;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  fbclid: string | null;
  referrer_host?: string | null;
}

export interface LandingEvent {
  event_name: string;
  metadata: Record<string, unknown> | null;
}

export interface LaunchReportInput {
  signups: CohortSignup[];
  events: CohortEvent[];
  /** writing_sessions rows with words_added > 0 on a Project: (user, local day). */
  writingDays: { user_id: string; session_date: string }[];
  /** Accounts in the cohort that own (or owned, in Trash) a Project. */
  projectOwners: string[];
  attributions: AttributionRow[];
  landing: LandingEvent[];
  /** The reporting day, UTC YYYY-MM-DD. */
  today: string;
}

export interface LaunchStep {
  key: string;
  label: string;
  count: number;
  /** Share of the signup cohort, 0–100 (one decimal). */
  percent: number;
}

export interface CampaignReportRow {
  channel: Channel;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  landingViews: number;
  signups: number;
  onboarded: number;
  activated: number;
  returned: number;
}

export interface LaunchReport {
  acquisition: {
    landingViews: number;
    ctaClicks: number;
    ctaByPlacement: Record<CtaPlacement, number>;
    /** Clicks per view, 0–100. null without views. */
    ctaRate: number | null;
    signups: number;
    /** Signups per landing view in the same window, 0–100. null without views. */
    viewToSignup: number | null;
  };
  funnel: LaunchStep[];
  activation: {
    activated: number;
    rate: number | null;
    /** Median hours from signup to first credited words (writers with the event). */
    medianHoursToActivation: number | null;
    byPath: { path: "new" | "import" | "none"; onboarded: number; activated: number }[];
  };
  retention: {
    activated: number;
    returned: number;
    d1: { eligible: number; returned: number };
    d7: { eligible: number; returned: number };
  };
  device: {
    onboarded: { phone: number; tablet: number; desktop: number; unknown: number };
    handoffShown: number;
    desktopLinkEmailed: number;
    desktopLinkCopied: number;
    /** Finished onboarding on a phone and later activated (on a desktop or tablet). */
    phoneOnboardedActivated: number;
  };
  campaigns: CampaignReportRow[];
}

const pct = (n: number, d: number): number | null => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function campaignKey(r: { channel: Channel; source: string | null; medium: string | null; campaign: string | null; content: string | null }) {
  return JSON.stringify([r.channel, r.source, r.medium, r.campaign, r.content]);
}

export function buildLaunchReport(input: LaunchReportInput): LaunchReport {
  const cohort = new Set(input.signups.map((s) => s.user_id));
  const signupAt = new Map(input.signups.map((s) => [s.user_id, s.created_at]));
  const events = input.events.filter((e) => cohort.has(e.user_id));
  const usersWith = (name: string) => new Set(events.filter((e) => e.event_name === name).map((e) => e.user_id));

  // ── Activation and return, per writer ──
  const activationDates = new Map<string, string[]>();
  const writingDates = new Map<string, string[]>();
  const push = (m: Map<string, string[]>, k: string, v: string | null) => {
    if (!v) return;
    const list = m.get(k) ?? [];
    list.push(v);
    m.set(k, list);
  };
  const firstWordsAt = new Map<string, string>();
  for (const e of events) {
    if (e.event_name === "first_words_written") {
      push(activationDates, e.user_id, e.local_date);
      push(writingDates, e.user_id, e.local_date);
      firstWordsAt.set(e.user_id, e.created_at);
    } else if (e.event_name === "second_writing_day" || e.event_name === "third_writing_day") {
      push(writingDates, e.user_id, e.local_date);
    }
  }
  const firstSession = new Map<string, string>();
  for (const w of input.writingDays) {
    if (!cohort.has(w.user_id)) continue;
    push(writingDates, w.user_id, w.session_date);
    const prev = firstSession.get(w.user_id);
    if (!prev || w.session_date < prev) firstSession.set(w.user_id, w.session_date);
  }
  // A writer with the event but no local_date (should not happen) is still activated.
  const activatedSet = new Set<string>([...firstWordsAt.keys(), ...firstSession.keys()]);
  const returnedSet = new Set<string>();
  const d1 = { eligible: 0, returned: 0 };
  const d7 = { eligible: 0, returned: 0 };
  for (const id of activatedSet) {
    const r = deriveWriterRetention(
      [...(activationDates.get(id) ?? []), firstSession.get(id)],
      writingDates.get(id) ?? [],
      input.today
    );
    if (r.returned) returnedSet.add(id);
    if (r.d1 !== null) {
      d1.eligible++;
      if (r.d1) d1.returned++;
    }
    if (r.d7 !== null) {
      d7.eligible++;
      if (r.d7) d7.returned++;
    }
  }

  const hours: number[] = [];
  for (const [id, at] of firstWordsAt) {
    const s = signupAt.get(id);
    if (!s) continue;
    const h = (Date.parse(at) - Date.parse(s)) / 3_600_000;
    if (Number.isFinite(h) && h >= 0) hours.push(h);
  }

  // ── Funnel ──
  const verified = usersWith("email_verified");
  const onboardedEvents = events.filter((e) => e.event_name === "onboarding_completed");
  const onboarded = new Set(onboardedEvents.map((e) => e.user_id));
  const projectReady = new Set<string>([...usersWith("project_created"), ...input.projectOwners.filter((id) => cohort.has(id))]);
  const size = cohort.size;
  const step = (key: string, label: string, set: Set<string> | number): LaunchStep => {
    const count = typeof set === "number" ? set : set.size;
    return { key, label, count, percent: pct(count, size) ?? 0 };
  };
  const funnel = [
    step("signup", "Signed up", size),
    step("email_verified", "Email verified", verified),
    step("onboarding_completed", "Onboarding completed", onboarded),
    step("project_ready", "Project ready", projectReady),
    step("activated", "Activated (first real writing)", activatedSet),
    step("returned", "Returned to write (2nd writing day)", returnedSet),
  ];

  // ── Path ──
  const pathOf = new Map<string, "new" | "import">();
  for (const e of events) {
    if (e.event_name === "onboarding_path_new") pathOf.set(e.user_id, "new");
    if (e.event_name === "onboarding_path_import" && !pathOf.has(e.user_id)) pathOf.set(e.user_id, "import");
  }
  for (const e of onboardedEvents) {
    const p = e.metadata?.path;
    if (p === "new" || p === "import") pathOf.set(e.user_id, p);
  }
  const byPath = (["new", "import", "none"] as const).map((path) => {
    const members = [...cohort].filter((id) => (pathOf.get(id) ?? "none") === path);
    return {
      path,
      onboarded: members.filter((id) => onboarded.has(id)).length,
      activated: members.filter((id) => activatedSet.has(id)).length,
    };
  });

  // ── Device ──
  const deviceOf = new Map<string, string>();
  for (const e of onboardedEvents) {
    const d = e.metadata?.device;
    deviceOf.set(e.user_id, d === "phone" || d === "tablet" || d === "desktop" ? d : "unknown");
  }
  const onboardedBy = { phone: 0, tablet: 0, desktop: 0, unknown: 0 };
  for (const d of deviceOf.values()) onboardedBy[d as keyof typeof onboardedBy]++;
  const phoneOnboardedActivated = [...deviceOf].filter(([id, d]) => d === "phone" && activatedSet.has(id)).length;

  // ── Acquisition ──
  const views = input.landing.filter((e) => e.event_name === "landing_viewed");
  const clicks = input.landing.filter((e) => e.event_name === "landing_cta_clicked");
  const ctaByPlacement = Object.fromEntries(CTA_PLACEMENTS.map((p) => [p, 0])) as Record<CtaPlacement, number>;
  for (const c of clicks) {
    const p = c.metadata?.placement;
    if (typeof p === "string" && p in ctaByPlacement) ctaByPlacement[p as CtaPlacement]++;
  }

  // ── Campaigns ──
  const rows = new Map<string, CampaignReportRow>();
  const rowFor = (fields: { source: string | null; medium: string | null; campaign: string | null; content: string | null; fbclid: unknown; referrer_host: string | null }) => {
    const base = {
      channel: channelFor({ ...fields, fbclid: fields.fbclid ? true : null }),
      source: fields.source,
      medium: fields.medium,
      campaign: fields.campaign,
      content: fields.content,
    };
    const key = campaignKey(base);
    let row = rows.get(key);
    if (!row) {
      row = { ...base, landingViews: 0, signups: 0, onboarded: 0, activated: 0, returned: 0 };
      rows.set(key, row);
    }
    return row;
  };
  for (const v of views) {
    const m = v.metadata ?? {};
    rowFor({
      source: str(m.source),
      medium: str(m.medium),
      campaign: str(m.campaign),
      content: str(m.content),
      fbclid: m.click_id === true,
      referrer_host: str(m.referrer_host),
    }).landingViews++;
  }
  const attributionOf = new Map(input.attributions.map((a) => [a.user_id, a]));
  for (const id of cohort) {
    const a = attributionOf.get(id);
    const row = rowFor({
      source: str(a?.source),
      medium: str(a?.medium),
      campaign: str(a?.campaign),
      content: str(a?.content),
      fbclid: a?.fbclid ?? null,
      referrer_host: str(a?.referrer_host),
    });
    row.signups++;
    if (onboarded.has(id)) row.onboarded++;
    if (activatedSet.has(id)) row.activated++;
    if (returnedSet.has(id)) row.returned++;
  }

  return {
    acquisition: {
      landingViews: views.length,
      ctaClicks: clicks.length,
      ctaByPlacement,
      ctaRate: pct(clicks.length, views.length),
      signups: size,
      viewToSignup: pct(size, views.length),
    },
    funnel,
    activation: {
      activated: activatedSet.size,
      rate: pct(activatedSet.size, size),
      medianHoursToActivation: median(hours),
      byPath,
    },
    retention: { activated: activatedSet.size, returned: returnedSet.size, d1, d7 },
    device: {
      onboarded: onboardedBy,
      handoffShown: usersWith("phone_waiting_room_viewed").size,
      desktopLinkEmailed: usersWith("desktop_link_requested").size,
      desktopLinkCopied: usersWith("desktop_link_copied").size,
      phoneOnboardedActivated,
    },
    campaigns: [...rows.values()].sort((a, b) => b.signups - a.signups || b.landingViews - a.landingViews),
  };
}
