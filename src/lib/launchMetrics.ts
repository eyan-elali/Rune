// The launch funnel's shared rules: which values are allowed into analytics
// metadata, which channel a first touch belongs to, and how activation and
// return-to-write are derived. Pure functions only (no DB, no framework), used
// by the write paths (proxy, actions, the front-door event route) and by Pulse.
//
// THE LAUNCH FUNNEL (Pulse "Launch funnel"):
//
//   landing_viewed → landing_cta_clicked → signup_completed → onboarding_completed
//   → Project ready → ACTIVATED → RETURNED (D1 / D7)
//
// ACTIVATED WRITER — the one canonical definition:
//   the writer has credited typed manuscript words in a Project they own.
//   "Credited" is the editor's writing credit (writing_sessions.words_added,
//   migration 057): typed words only, never pasted, imported, restored or
//   moved prose. Creating a Project, opening the editor, importing a
//   manuscript or a save with no new typed words does not activate.
//   Recorded once per account as `first_words_written` (local_date = the
//   writer's local day of that first credit), by recordWordsWritten after the
//   credit lands; for writers who wrote before that event existed, Pulse
//   derives the same thing from writing_sessions (first day with words_added
//   > 0 on a Project). Activation date = the earliest of the two.
//
// WRITING DAYS: the writer's distinct LOCAL calendar days with credited words
//   (writing_sessions rows with words_added > 0 on a Project, plus the
//   local_date of first_words_written / second_writing_day / third_writing_day
//   events, which survive a deleted Project's history).
//
// RETURNED WRITER: an activated writer with a writing day after the activation
//   day (the same thing second_writing_day records). Opening the site, signing
//   in or leaving a tab open never counts — only credited words do.
//
// D1: wrote on the local day right after activation (activation + 1).
// D7: wrote on any day in (activation, activation + 7].
//   Both are null ("not yet measurable") until the window has fully passed:
//   D1 once activation + 1 is before today, D7 once activation + 7 is.

// No imports: the proxy loads this module, so it stays dependency-free.

// ── Environment ──────────────────────────────────────────────────────────
// Local development runs against the production database (.env.local), so
// every event is tagged with where it came from and Pulse counts only
// "production". Vercel sets VERCEL_ENV ("production" | "preview" |
// "development"); anything else (next dev, a local next start) is "local".

export type AnalyticsEnvironment = "production" | "preview" | "development" | "local";

export function analyticsEnvironment(vercelEnv: string | undefined = process.env.VERCEL_ENV): AnalyticsEnvironment {
  if (vercelEnv === "production" || vercelEnv === "preview" || vercelEnv === "development") return vercelEnv;
  return "local";
}

// ── Safe enums ───────────────────────────────────────────────────────────

export type DeviceCategory = "phone" | "tablet" | "desktop";

export function parseDeviceCategory(value: unknown): DeviceCategory | null {
  return value === "phone" || value === "tablet" || value === "desktop" ? value : null;
}

/** Coarse device class from what the browser already reports — never a fingerprint. */
export function deviceCategory(d: { phone: boolean; coarsePointer: boolean }): DeviceCategory {
  if (d.phone) return "phone";
  return d.coarsePointer ? "tablet" : "desktop";
}

/** Where the one action, "Start writing free", was clicked. */
export type CtaPlacement = "header" | "hero" | "final" | "feature";
export const CTA_PLACEMENTS: readonly CtaPlacement[] = ["header", "hero", "final", "feature"];

export function parseCtaPlacement(value: unknown): CtaPlacement | null {
  return typeof value === "string" && (CTA_PLACEMENTS as readonly string[]).includes(value) ? (value as CtaPlacement) : null;
}

export type HandoffVariant = "ready" | "ready-import" | "returning" | "neutral";

export function parseHandoffVariant(value: unknown): HandoffVariant | null {
  return value === "ready" || value === "ready-import" || value === "returning" || value === "neutral" ? value : null;
}

// ── Referrer ─────────────────────────────────────────────────────────────
// Only the referring site's host is kept (never a path or query, which can
// carry search terms or identifiers). Sutura's own hosts are not a referrer.

const OWN_HOSTS = ["writesutura.com", "localhost", "127.0.0.1"];

export function normalizeReferrerHost(raw: unknown, ownHost?: string | null): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let host: string;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    host = url.hostname.toLowerCase();
  } catch {
    return null;
  }
  host = host.replace(/^www\./, "");
  if (!host || host.length > 200) return null;
  const own = (ownHost ?? "").toLowerCase().replace(/^www\./, "");
  if (own && (host === own || host.endsWith(`.${own}`))) return null;
  if (OWN_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return null;
  if (host.endsWith(".vercel.app")) return null;
  return host;
}

// ── Channel ──────────────────────────────────────────────────────────────
// A deliberately conservative bucket for a first touch (or a landing view).
// Campaign parameters decide when present; a Meta click id alone is Meta; a
// referrer decides only without either; nothing at all is "Direct / Unknown"
// — never guessed. The raw values stay alongside for inspection.

export type Channel = "Meta" | "Instagram" | "TikTok" | "Organic search" | "Referral" | "Other campaign" | "Direct / Unknown";

export interface TouchFields {
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  fbclid?: string | boolean | null;
  referrer_host?: string | null;
}

const SEARCH_HOSTS = /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|kagi|brave|baidu|yandex|startpage|qwant)\.[a-z.]+$/;

function channelOfName(value: string): Channel | null {
  const v = value.toLowerCase();
  if (/(^|[^a-z])(ig|instagram)([^a-z]|$)/.test(v)) return "Instagram";
  if (/(^|[^a-z])(fb|facebook|meta)([^a-z]|$)/.test(v)) return "Meta";
  if (/tiktok/.test(v)) return "TikTok";
  return null;
}

function channelOfHost(host: string): Channel {
  if (/(^|\.)instagram\.com$/.test(host)) return "Instagram";
  if (/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/.test(host)) return "Meta";
  if (/(^|\.)tiktok\.com$/.test(host)) return "TikTok";
  if (SEARCH_HOSTS.test(host)) return "Organic search";
  return "Referral";
}

export function channelFor(touch: TouchFields | null | undefined): Channel {
  if (!touch) return "Direct / Unknown";
  const source = touch.source?.trim();
  if (source) return channelOfName(source) ?? "Other campaign";
  if (touch.campaign?.trim() || touch.medium?.trim()) return "Other campaign";
  if (touch.fbclid) return "Meta";
  const host = touch.referrer_host?.trim();
  if (host) return channelOfHost(host);
  return "Direct / Unknown";
}

// ── Activation and return ────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Adds `n` days to a YYYY-MM-DD date (UTC noon anchored, as lib/rune2/writingActivity's shiftDay). */
export function shiftDay(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10);
}

export interface WriterRetention {
  /** The activation day (writer's local date), or null if never activated. */
  activationDate: string | null;
  /** Wrote again on a later day. */
  returned: boolean;
  /** Distinct writing days, activation included. */
  writingDays: number;
  /** null until the D1 window has passed. */
  d1: boolean | null;
  /** null until the D7 window has passed. */
  d7: boolean | null;
}

/**
 * @param activationDates candidate activation days (event local_date, first session date) — the earliest wins
 * @param writingDates every known writing day (local dates); may include duplicates
 * @param today the reporting day (UTC date) — windows close strictly before it
 */
export function deriveWriterRetention(
  activationDates: readonly (string | null | undefined)[],
  writingDates: readonly (string | null | undefined)[],
  today: string,
): WriterRetention {
  const days = Array.from(new Set(writingDates.filter((d): d is string => typeof d === "string" && DATE_RE.test(d)))).sort();
  const candidates = activationDates.filter((d): d is string => typeof d === "string" && DATE_RE.test(d)).sort();
  const activationDate = candidates[0] ?? null;
  if (!activationDate) return { activationDate: null, returned: false, writingDays: 0, d1: null, d7: null };

  const later = days.filter((d) => d > activationDate);
  const next = shiftDay(activationDate, 1);
  const week = shiftDay(activationDate, 7);
  return {
    activationDate,
    returned: later.length > 0,
    writingDays: new Set([activationDate, ...days.filter((d) => d >= activationDate)]).size,
    d1: next < today ? later.includes(next) : null,
    d7: week < today ? later.some((d) => d <= week) : null,
  };
}

/** Median of a list of numbers, or null when empty. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ── Metadata guard ───────────────────────────────────────────────────────
// Analytics metadata is operational only. These keys are the whole allowed
// vocabulary; anything else is dropped before a write, so a careless caller
// cannot put a title, a sentence, a pen name or an email into analytics.

const ALLOWED_METADATA_KEYS = new Set([
  "env",
  "path",
  "kind",
  "device",
  "placement",
  "variant",
  "category",
  "surface",
  "source",
  "medium",
  "campaign",
  "content",
  "term",
  "click_id",
  "referrer_host",
  "skipped_first_sentence",
  "wrote_future_letter",
  "plan",
]);

export function sanitizeAnalyticsMetadata(metadata: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!metadata || typeof metadata !== "object") return out;
  for (const [key, value] of Object.entries(metadata)) {
    if (!ALLOWED_METADATA_KEYS.has(key)) continue;
    if (value === null || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) {
      out[key] = value;
    } else if (typeof value === "string") {
      out[key] = value.slice(0, 200);
    }
  }
  return out;
}
