import type { Rune2EditorFont } from "@/lib/types";

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
//   * rune2Appearance   the application's appearance — see APPEARANCES
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
};

// ── Appearance ──────────────────────────────────────────────────────────────
// The foundation the themes (Beta Completion C) are built on. Every Rune 2.0
// surface root (`.r2`) carries data-theme={appearance}; a theme is a block of
// SEMANTIC token overrides on `.r2[data-theme="…"]` in rune2.css, and a
// feature rule never names a theme. "system" will follow the operating
// system's light or dark setting in CSS (a prefers-color-scheme block under
// `.r2[data-theme="system"]`), so the server can render the right attribute
// without knowing the device. Today there is one designed palette — the M21
// tokens on `.r2` — so the registry offers only it, and Settings shows no
// Appearance choice until there is a second. A stored id the registry does
// not know (a theme withdrawn, a newer client's choice) reads as the default.

export const APPEARANCES = [{ id: "light", label: "Light" }] as const satisfies readonly { id: string; label: string }[];

export type AppearanceId = (typeof APPEARANCES)[number]["id"];

export const DEFAULT_APPEARANCE: AppearanceId = "light";

export function isAppearanceId(v: unknown): v is AppearanceId {
  return typeof v === "string" && APPEARANCES.some((a) => a.id === v);
}

export function resolveAppearance(v: unknown): AppearanceId {
  return isAppearanceId(v) ? v : DEFAULT_APPEARANCE;
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
  };
}

/** The stored keys of each preference. */
export const PREFERENCE_KEYS = {
  editorFont: "rune2EditorFont",
  spellcheck: "rune2Spellcheck",
  appearance: "rune2Appearance",
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
      default:
        return { patch: null, error: "Unknown preference." };
    }
  }
  if (Object.keys(patch).length === 0) return { patch: null, error: "Nothing to save." };
  return { patch, error: null };
}
