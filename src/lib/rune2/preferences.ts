import type { Rune2EditorFont } from "@/lib/types";
import { ACCENTS, THEMES, WRITING_SURFACES, type AccentId, type ThemeId, type WritingSurfaceId } from "./themes";

// The writer's Rune preferences (Beta Completion A) — what each one is, who
// owns it, and how a stored value is read. Pure: no React, no storage.
//
// Ownership model
// ───────────────
// ACCOUNT-GLOBAL, synced (profiles.preferences, written only through
// updateRunePreferences, which accepts nothing else and validates every
// value). They follow the writer to every Project and every device:
//   * rune2EditorFont   manuscript type: the prose serif or Rune's sans
//                       (manuscript editing and reading prose only)
//   * rune2Spellcheck   the browser's spelling check while writing
//   * rune2Appearance   the application's theme — see APPEARANCES
//   * rune2Accent       the accent colour — see ACCENTS
//   * rune2WritingSurface the manuscript's page — see WRITING_SURFACES
//                       (one for all manuscript writing and reading; never
//                       per Scene or per Project)
//   * rune2DailyGoal    the Daily Writing Goal — see DAILY GOAL below: the
//                       target and the days it changed on, so a past day is
//                       judged by the goal that applied then
//
// PROJECT-SPECIFIC, synced (the projects row): the Project's title. No
// writer preference genuinely varies by Project today, so none is stored per
// Project; one that does later belongs beside the Project, not here.
//
// DEVICE-LOCAL, deliberately not synced — ways of looking at this screen,
// never content, each guarded so a browser without storage still works:
//   * the navigator's and panel's width and whether they are open (session)
//   * the open working-set tabs (session)
//   * a Canvas's viewport (localStorage, per Canvas)
//   * Reading Mode comments expanded or collapsed (localStorage, per writer)
//   * an Entry's properties folded (localStorage, per writer and Collection)
//   * whether resolved Revision Notes are shown (session)
//   * an unsent Revision Note draft (localStorage) and the offline save
//     queue (IndexedDB) — the writer's words, kept on the device that holds
//     them until the server has them; never preferences
//
// The legacy Rune 1.x preferences on the same profile column (activeTheme,
// activeFont, fontSize, lineHeight, wideEditor, autoSaveDelay, hideArena,
// the tutorial and notice flags) are left untouched: onboarding still writes
// activeTheme, and nothing in Rune 2.0 reads the rest.

export type RunePreferences = {
  editorFont: Rune2EditorFont;
  spellcheck: boolean;
  appearance: AppearanceId;
  writingSurface: WritingSurfaceId;
  accent: AccentId;
  dailyGoal: DailyGoalHistory;
};

// ── Daily Writing Goal ──────────────────────────────────────────────────────
// An optional, account-wide target of credited writing words per LOCAL
// calendar day (the words the writer typed, by the rules in
// lib/rune2/writingActivity.ts — across every Project). Stored as its
// history: one entry per day it was set, changed or turned off, in the
// writer's local date (the device supplies it; the server never substitutes
// its own clock), so a past day is judged by the goal that applied then —
// raising the goal later never turns an earlier success into a failure, and
// turning it off leaves later days with no goal. A second change on one day
// replaces that day's entry: today's progress is against the goal as it now
// stands. Days before the first entry have no goal. Never a per-Project
// goal, never a schedule. Kept apart from the Project goal (writing_goals,
// a manuscript total): different question, different storage.

export type DailyGoalEntry = {
  /** The local calendar day this goal applies from (YYYY-MM-DD). */
  from: string;
  /** Words per day, or null: the goal was turned off that day. */
  target: number | null;
};

/** Ascending by day, one entry per day. Empty: never set. */
export type DailyGoalHistory = DailyGoalEntry[];

export const DAILY_GOAL_MIN = 1;
export const DAILY_GOAL_MAX = 100_000;
/**
 * At most this many entries are kept: the latest ones. Entries are one per
 * day, so the kept list always holds every change inside the activity
 * calendar's window (112 days) AND the last change before it — a day in the
 * window could only lose its governing entry if all 400 kept entries fell
 * after it, i.e. 400 distinct change-days inside 112 days, which cannot be.
 * Only days older than the 400th most recent change read as "no goal", and
 * no surface judges those. (Proven by app-writing-activity.test.mjs.)
 */
export const DAILY_GOAL_HISTORY_MAX = 400;
export const DAILY_GOAL_PRESETS = [250, 500, 750, 1000] as const;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDailyGoalTarget(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= DAILY_GOAL_MIN && v <= DAILY_GOAL_MAX;
}

/**
 * A stored history (any shape) as the history to use: well-formed entries
 * only, sorted by day, the last entry for a day standing, the latest
 * DAILY_GOAL_HISTORY_MAX kept. Anything else reads as never set.
 */
export function resolveDailyGoal(v: unknown): DailyGoalHistory {
  if (!Array.isArray(v)) return [];
  const byDay = new Map<string, number | null>();
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const { from, target } = item as { from?: unknown; target?: unknown };
    if (typeof from !== "string" || !DAY_RE.test(from)) continue;
    if (target !== null && !isDailyGoalTarget(target)) continue;
    byDay.set(from, target as number | null);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .slice(-DAILY_GOAL_HISTORY_MAX)
    .map(([from, target]) => ({ from, target }));
}

/** The goal that applied on `date` (the last entry on or before it), or null: none, or off. */
export function dailyGoalOn(history: DailyGoalHistory, date: string): number | null {
  let target: number | null = null;
  for (const e of history) {
    if (e.from > date) break;
    target = e.target;
  }
  return target;
}

/** Whether a goal has ever been set: the "goal completion" view has something to show. */
export function hasDailyGoalHistory(history: DailyGoalHistory): boolean {
  return history.some((e) => e.target !== null);
}

/** The history with `target` (or off, null) applying from `today` on. */
export function setDailyGoal(history: DailyGoalHistory, today: string, target: number | null): DailyGoalHistory {
  return resolveDailyGoal([...history, { from: today, target }]);
}


// ── Appearance ──────────────────────────────────────────────────────────────
// The theme (Beta Completion C; the palettes are lib/rune2/themes.ts). Every
// Rune 2.0 surface root (`.r2`) carries data-theme={appearance}; "system"
// follows the operating system's light or dark setting in CSS, so the server
// renders the right page without knowing the device, and the stored choice
// stays "system" whatever the device says. Light is the default. A stored id
// the registry does not know (a theme withdrawn, a newer client's choice)
// reads as the default.

export const APPEARANCES = THEMES;

export type AppearanceId = ThemeId;

export const DEFAULT_APPEARANCE: AppearanceId = "light";

export function isAppearanceId(v: unknown): v is AppearanceId {
  return typeof v === "string" && APPEARANCES.some((a) => a.id === v);
}

export function resolveAppearance(v: unknown): AppearanceId {
  return isAppearanceId(v) ? v : DEFAULT_APPEARANCE;
}

/**
 * Whether the account has ever chosen an appearance (a stored value the
 * registry knows). An account that has not is shown the default, Light —
 * the public pages' own appearance.
 */
export function hasChosenAppearance(stored: unknown): boolean {
  const p = stored && typeof stored === "object" && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
  return isAppearanceId(p.rune2Appearance);
}

// ── Writing surface ─────────────────────────────────────────────────────────
// The manuscript's page, separate from the theme: "theme" (Default) takes the
// theme's own; the others are curated surfaces with their own ink. Unknown
// values read as Default.

export { WRITING_SURFACES };

export const DEFAULT_WRITING_SURFACE: WritingSurfaceId = "theme";

export function isWritingSurfaceId(v: unknown): v is WritingSurfaceId {
  return typeof v === "string" && WRITING_SURFACES.some((s) => s.id === v);
}

export function resolveWritingSurface(v: unknown): WritingSurfaceId {
  return isWritingSurfaceId(v) ? v : DEFAULT_WRITING_SURFACE;
}

// ── Accent ──────────────────────────────────────────────────────────────────
// The colour of emphasis, independent of the theme and the writing surface.
// Rune Blue is the default; unknown values read as it.

export { ACCENTS };

export const DEFAULT_ACCENT: AccentId = "blue";

export function isAccentId(v: unknown): v is AccentId {
  return typeof v === "string" && ACCENTS.some((a) => a.id === v);
}

export function resolveAccent(v: unknown): AccentId {
  return isAccentId(v) ? v : DEFAULT_ACCENT;
}

// ── Reading stored preferences ──────────────────────────────────────────────

export function resolveEditorFont(v: unknown): Rune2EditorFont {
  return v === "sans" ? "sans" : "serif";
}

/** On unless the writer turned it off. */
export function resolveSpellcheck(v: unknown): boolean {
  return v !== false;
}

/** The writer's preferences from a stored profile.preferences value (any shape). */
export function readRunePreferences(stored: unknown): RunePreferences {
  const p = stored && typeof stored === "object" && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
  return {
    editorFont: resolveEditorFont(p.rune2EditorFont),
    spellcheck: resolveSpellcheck(p.rune2Spellcheck),
    appearance: resolveAppearance(p.rune2Appearance),
    writingSurface: resolveWritingSurface(p.rune2WritingSurface),
    accent: resolveAccent(p.rune2Accent),
    dailyGoal: resolveDailyGoal(p.rune2DailyGoal),
  };
}

/** The stored keys of each preference. */
export const PREFERENCE_KEYS = {
  editorFont: "rune2EditorFont",
  spellcheck: "rune2Spellcheck",
  appearance: "rune2Appearance",
  writingSurface: "rune2WritingSurface",
  accent: "rune2Accent",
  dailyGoal: "rune2DailyGoal",
} as const satisfies Record<keyof RunePreferences, string>;

/**
 * A change from the client, checked: the stored patch, or the reason it is
 * refused. Only the preferences above can be written this way, and only
 * with values they accept.
 */
export function validatePreferenceChange(
  change: unknown
): { patch: Record<string, unknown>; error: null } | { patch: null; error: string } {
  if (!change || typeof change !== "object" || Array.isArray(change)) return { patch: null, error: "Nothing to save." };
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(change as Record<string, unknown>)) {
    switch (key) {
      case "editorFont":
        if (value !== "serif" && value !== "sans") return { patch: null, error: "Unknown manuscript type." };
        patch[PREFERENCE_KEYS.editorFont] = value;
        break;
      case "spellcheck":
        if (typeof value !== "boolean") return { patch: null, error: "Spelling check is on or off." };
        patch[PREFERENCE_KEYS.spellcheck] = value;
        break;
      case "appearance":
        if (!isAppearanceId(value)) return { patch: null, error: "Unknown appearance." };
        patch[PREFERENCE_KEYS.appearance] = value;
        break;
      case "writingSurface":
        if (!isWritingSurfaceId(value)) return { patch: null, error: "Unknown writing surface." };
        patch[PREFERENCE_KEYS.writingSurface] = value;
        break;
      case "accent":
        if (!isAccentId(value)) return { patch: null, error: "Unknown accent colour." };
        patch[PREFERENCE_KEYS.accent] = value;
        break;
      case "dailyGoal": {
        // The whole history, well-formed: every entry a local day with a
        // target in range or off; what is stored is the normalised list.
        if (!Array.isArray(value)) return { patch: null, error: "A daily goal is its history." };
        const ok = value.every(
          (e) =>
            e &&
            typeof e === "object" &&
            typeof (e as { from?: unknown }).from === "string" &&
            DAY_RE.test((e as { from: string }).from) &&
            ((e as { target?: unknown }).target === null || isDailyGoalTarget((e as { target?: unknown }).target))
        );
        if (!ok) return { patch: null, error: "A daily goal is a whole number of words per day." };
        patch[PREFERENCE_KEYS.dailyGoal] = resolveDailyGoal(value);
        break;
      }
      default:
        return { patch: null, error: "Unknown preference." };
    }
  }
  if (Object.keys(patch).length === 0) return { patch: null, error: "Nothing to save." };
  return { patch, error: null };
}
