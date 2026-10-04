// Contextual first-use teaching (Beta Completion E). Onboarding teaches what
// Rune is; the product teaches itself when the writer reaches for something
// new — first through empty states (in the surfaces themselves), and, only
// where an interaction is genuinely not obvious, through one of these
// one-time hints anchored in the surface. Tooltips stay for terse controls.
//
// A hint is seen once per account: dismissing it records its id in
// profiles.preferences (HINTS_KEY), so it does not return on another device.
// Pure: the registry and how a stored value is read.

export const HINTS = {
  collection: {
    title: "Collections organize things that share a structure.",
    body: "Add entries — a character, a place, a source — then give them properties and views when you need them.",
  },
  timeline: {
    title: "A timeline along one axis.",
    body: "Items sit along the axis named at the top left — manuscript order, or a date or number property. Change it in the view’s options.",
  },
} as const satisfies Record<string, { title: string; body: string }>;

export type HintId = keyof typeof HINTS;

export const HINTS_KEY = "rune2Hints";

export function isHintId(v: unknown): v is HintId {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(HINTS, v);
}

/** The hints an account has seen, from a stored profile.preferences value (any shape). */
export function readSeenHints(stored: unknown): HintId[] {
  const p = stored && typeof stored === "object" && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
  const list = p[HINTS_KEY];
  return Array.isArray(list) ? [...new Set(list.filter(isHintId))] : [];
}
