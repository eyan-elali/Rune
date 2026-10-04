// Rune's closed beta (Beta Completion E): what the beta is, in one place.
// Pure — no database, no React — so the server, the client and the tests
// agree. The records themselves (approved emails, the waitlist, feedback)
// live in the database (migration 052).
//
// The beta is free and full-featured: no trial, no subscription, no feature
// lock, no upgrade prompt. Billing code stays in the repository, switched
// off here; nothing user-facing can start a checkout while it is.

/** Whether anything may start a Stripe checkout or a plan change. Off for the closed beta. */
export const BILLING_OPEN: boolean = false;

/**
 * What the database says about an account (beta_access_state, 052):
 * member / admin / accepted (just now) may use Rune; approved is only ever
 * reported without accepting; waitlisted and none may not.
 */
export type BetaAccessState = "member" | "admin" | "accepted" | "approved" | "waitlisted" | "none";

export function hasBetaAccess(state: BetaAccessState | null | undefined): boolean {
  return state === "member" || state === "admin" || state === "accepted";
}

export function readBetaAccessState(v: unknown): BetaAccessState | null {
  return v === "member" || v === "admin" || v === "accepted" || v === "approved" || v === "waitlisted" || v === "none"
    ? v
    : null;
}

/** How an email is stored and compared: trimmed and lower-case. */
export function normalizeBetaEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isPlausibleEmail(email: string): boolean {
  const e = normalizeBetaEmail(email);
  return e.length <= 320 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
}

export const WAITLIST_NAME_MAX = 120;
export const WAITLIST_WRITES_MAX = 500;

// ── Feedback ────────────────────────────────────────────────────────────────

export const FEEDBACK_CATEGORIES = [
  { id: "confusing", label: "Something was confusing" },
  { id: "broken", label: "Something didn’t work" },
  { id: "idea", label: "I have an idea" },
  { id: "other", label: "Other" },
] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number]["id"];

export const FEEDBACK_MAX = 5000;

export function isFeedbackCategory(v: unknown): v is FeedbackCategory {
  return typeof v === "string" && FEEDBACK_CATEGORIES.some((c) => c.id === v);
}

/**
 * The context sent with feedback — and only this. Every field is about where
 * the writer was and on what, never what they wrote: no prose, no titles, no
 * note or search text. The route is the path alone (no query string, which
 * can carry a search) with ids kept; anything else offered is dropped.
 */
export type FeedbackContext = {
  route: string | null;
  surface: string | null;
  projectId: string | null;
  device: "desktop" | "tablet" | "phone" | null;
  browser: string | null;
  viewport: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SURFACES = new Set([
  "projects",
  "settings",
  "manuscript",
  "scene",
  "chapter",
  "group",
  "page",
  "collection",
  "entry",
  "canvas",
  "folder",
  "trash",
  "reading",
  "onboarding",
  "other",
]);
const BROWSERS = new Set(["Chrome", "Edge", "Firefox", "Safari", "Opera", "Other"]);

export function sanitizeFeedbackContext(raw: unknown): FeedbackContext {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const route =
    typeof r.route === "string"
      ? (r.route.split(/[?#]/)[0] ?? "")
          .split("/")
          .filter(Boolean)
          // Path segments only of the app's own vocabulary or an id: nothing a writer typed.
          .map((seg) => (UUID.test(seg) || /^[a-z-]{1,24}$/.test(seg) ? seg : "…"))
          .join("/")
      : null;
  return {
    route: route === null ? null : `/${route}`.slice(0, 200),
    surface: typeof r.surface === "string" && SURFACES.has(r.surface) ? r.surface : null,
    projectId: typeof r.projectId === "string" && UUID.test(r.projectId) ? r.projectId : null,
    device: r.device === "desktop" || r.device === "tablet" || r.device === "phone" ? r.device : null,
    browser: typeof r.browser === "string" && BROWSERS.has(r.browser) ? r.browser : null,
    viewport: typeof r.viewport === "string" && /^\d{2,5}x\d{2,5}$/.test(r.viewport) ? r.viewport : null,
  };
}

/** A browser's family from its user agent: a word, never the string itself. */
export function browserFamily(userAgent: string): string {
  if (/Edg\//.test(userAgent)) return "Edge";
  if (/OPR\//.test(userAgent)) return "Opera";
  if (/Firefox\//.test(userAgent)) return "Firefox";
  if (/Chrome\//.test(userAgent)) return "Chrome";
  if (/Safari\//.test(userAgent)) return "Safari";
  return "Other";
}

export function deviceClass(width: number): "desktop" | "tablet" | "phone" {
  return width >= 1024 ? "desktop" : width >= 768 ? "tablet" : "phone";
}
