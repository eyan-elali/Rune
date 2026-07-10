// Shared, framework-agnostic helpers for first-touch acquisition attribution.
// Used by both src/proxy.ts (capture on landing, edge runtime) and
// src/app/auth/callback/route.ts (read + clear on verified signup). No DB
// calls here — see src/lib/actions/attribution.ts for the write path.
//
// Only these fields are ever parsed, stored, or persisted. Do not widen this
// list to arbitrary query params, referrers, or anything else that could
// carry PII.

export const ATTRIBUTION_COOKIE_NAME = "rune_attribution";

// A writer's path from ad click to verified signup can span days; 30 days
// covers that window without holding stale campaign data indefinitely.
export const ATTRIBUTION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const MAX_FIELD_LENGTH = 200;
const MAX_LANDING_PATH_LENGTH = 300;

export interface AttributionTouch {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
  fbclid: string | null;
  landing_path: string | null;
  captured_at: string;
}

type AttributionUtmFields = Pick<
  AttributionTouch,
  "source" | "medium" | "campaign" | "content" | "term" | "fbclid"
>;

function normalizeField(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_FIELD_LENGTH);
}

// Only accept an internal, single-leading-slash path. Rejects protocol-relative
// ("//evil.com"), absolute URLs, and anything else that isn't a same-origin path.
export function normalizeLandingPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value.slice(0, MAX_LANDING_PATH_LENGTH);
}

function normalizeCapturedAt(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

export function parseAttributionFromSearchParams(
  searchParams: URLSearchParams
): AttributionUtmFields {
  return {
    source: normalizeField(searchParams.get("utm_source")),
    medium: normalizeField(searchParams.get("utm_medium")),
    campaign: normalizeField(searchParams.get("utm_campaign")),
    content: normalizeField(searchParams.get("utm_content")),
    term: normalizeField(searchParams.get("utm_term")),
    fbclid: normalizeField(searchParams.get("fbclid")),
  };
}

export function hasMeaningfulAttribution(fields: AttributionUtmFields): boolean {
  return Boolean(
    fields.source || fields.medium || fields.campaign || fields.content || fields.term || fields.fbclid
  );
}

export function serializeAttributionCookie(touch: AttributionTouch): string {
  return JSON.stringify(touch);
}

// Treats cookie content as untrusted input: re-normalizes every field and
// rejects the whole thing (returns null) if it isn't a usable touch.
export function deserializeAttributionCookie(raw: string | undefined | null): AttributionTouch | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const candidate = parsed as Record<string, unknown>;

  const capturedAt = normalizeCapturedAt(candidate.captured_at);
  if (!capturedAt) return null;

  const touch: AttributionTouch = {
    source: normalizeField(candidate.source),
    medium: normalizeField(candidate.medium),
    campaign: normalizeField(candidate.campaign),
    content: normalizeField(candidate.content),
    term: normalizeField(candidate.term),
    fbclid: normalizeField(candidate.fbclid),
    landing_path: normalizeLandingPath(candidate.landing_path),
    captured_at: capturedAt,
  };

  if (!hasMeaningfulAttribution(touch)) return null;

  return touch;
}
