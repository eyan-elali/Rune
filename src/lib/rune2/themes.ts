// Rune's themes and writing surfaces (Beta Completion C): the one registry of
// every colour the Rune 2.0 interface paints with. Pure: no React, no DOM.
//
// Two separate choices, both account-wide (lib/rune2/preferences.ts):
//
//   THEME            the application around the writing — navigator, tabs,
//                    panels, menus, Views, Canvas. Light (the neutral
//                    default), Candlelight (warm paper), Dark (a deep ink
//                    dark), or System (Light or Dark, following the
//                    operating system, in CSS — so the server can render
//                    the right page without knowing the device).
//   WRITING SURFACE  the manuscript itself — the page the writer writes and
//                    reads prose on. "Default" is the theme's own; the
//                    others are fixed, curated surfaces, each with the ink,
//                    caret and selection made for it, and the same in
//                    every theme.
//
// How it reaches the page: buildThemeCss() turns the palettes into one
// stylesheet the (rune2) layout renders before anything else, so the first
// server-rendered paint is already right. Every Rune 2.0 root (`.r2`)
// carries data-theme and data-surface; feature rules in rune2.css read only
// the SEMANTIC tokens below (never a palette, never a theme name), so a new
// theme is a new palette here and nothing else.
//
// ACCENT              the one colour of emphasis — selection, focus, toggles,
//                    the active tab and selected rows. Rune Blue by default;
//                    a curated few others, each tuned for Light,
//                    Candlelight and Dark. It never touches prose, the
//                    writing surface, large surfaces, or danger and warning.
//
// A surface can be of the other scheme from the theme around it (Charcoal in
// Light, Paper in Dark). Then the manuscript region — the context bar, the
// writing column, the document status, Reading Mode — takes the matching
// scheme's interface tokens too, so a chapter title, a placeholder or a
// comment marker is never dark ink on a dark page. The navigator, tabs and
// panel keep the theme.

export type Scheme = "light" | "dark";

/** A palette: semantic token name (without the `--r2-` prefix) → CSS value. */
export type Palette = Readonly<Record<PaletteToken, string>>;

/** Every colour token a palette defines. Feature rules read these, as var(--r2-…). */
export const PALETTE_TOKENS = [
  // Private tints (RGB triplets) a few rules mix from.
  "palette-ink",
  "palette-shadow",
  "palette-blue",
  // Surfaces
  "bg", //            the content field: what the writer reads and works on
  "shell-bg", //      the frame: navigator, tab band, rails
  "panel-bg", //      the right-hand panel
  "nav-bg",
  "page-bg", //       a page outside a Project (Projects, Settings): the field groups sit on
  "group-bg", //      a quiet grouped surface on it (a Settings group, the Projects list)
  "surface-raised", // a field or control lifted off the bg
  "raised-hover", //  that control reached for
  "field-bg",
  "surface-sunken", // a lane, a gap
  "overlay-bg", //    menus, popovers, dialogs, search
  "prose-bg", //      a writing column (Workspace Pages, Collections; the manuscript maps it to ms-bg)
  "hover",
  "hover-faint",
  "press",
  "scrim",
  "scrim-light",
  "scrollbar", //      a scrollbar's thumb at rest: the accent, subdued
  "scrollbar-hover", // the thumb under the pointer
  "scrollbar-active", // the thumb being dragged
  // Text
  "ink-1",
  "ink-2",
  "ink-3",
  "ink-disabled",
  "ink-inverse", // on the accent and on danger
  "text",
  "muted",
  "faint",
  "prose-ink",
  // Structure
  "border",
  "border-strong",
  "accent",
  "accent-ink",
  "accent-soft",
  "accent-soft-hover",
  "accent-line",
  "focus",
  "selection",
  "selected",
  "selected-hover",
  "selected-ink",
  // Semantic states
  "danger",
  "danger-strong",
  "danger-soft",
  "warning",
  "warning-soft",
  "success",
  "success-soft",
  "info",
  "info-soft",
  // Elevation
  "shadow-sm",
  "shadow-pop",
  "shadow-lg",
  "ring",
  "shadow-sheet",
  "tooltip-bg",
  "tooltip-ink",
  "knob", //          a switch's thumb: always the lightest thing in its row
  // The manuscript writing surface (the theme's own — "Default")
  "ms-bg",
  "ms-ink",
  "ms-faint",
  "ms-caret",
  "ms-selection",
  "ms-rule",
] as const;

export type PaletteToken = (typeof PALETTE_TOKENS)[number];

/** The manuscript tokens a writing surface sets. */
export const SURFACE_TOKENS = ["ms-bg", "ms-ink", "ms-faint", "ms-caret", "ms-selection", "ms-rule"] as const satisfies readonly PaletteToken[];
type SurfaceToken = (typeof SURFACE_TOKENS)[number];
/** The surface tokens that read the accent: painted in the manuscript region, where the page's scheme has chosen the accent's variant. */
export const ACCENT_SURFACE_TOKENS = ["ms-caret", "ms-selection"] as const satisfies readonly SurfaceToken[];

// ── Light ──────────────────────────────────────────────────────────────────
// The M21 palette, the neutral default: one off-white system, the frame a
// shade deeper than the content so the manuscript sits in the cleanest
// field; ink blue kept for focus, selection, the caret and the few active
// controls.
const LIGHT: Palette = {
  "palette-ink": "29 32 37",
  "palette-shadow": "20 24 31",
  "palette-blue": "47 76 124",

  bg: "#fbfbfa",
  "shell-bg": "#f4f4f2",
  "panel-bg": "#f7f7f5",
  "nav-bg": "var(--r2-shell-bg)",
  "page-bg": "#f5f5f3",
  "group-bg": "#fdfdfc",
  "surface-raised": "#fdfdfc",
  "raised-hover": "#f4f4f2",
  "field-bg": "var(--r2-surface-raised)",
  "surface-sunken": "rgba(var(--r2-palette-ink) / 0.025)",
  "overlay-bg": "#fdfdfc",
  "prose-bg": "var(--r2-bg)",
  hover: "rgba(var(--r2-palette-ink) / 0.05)",
  "hover-faint": "rgba(var(--r2-palette-ink) / 0.018)",
  press: "rgba(var(--r2-palette-ink) / 0.08)",
  scrim: "rgba(var(--r2-palette-shadow) / 0.28)",
  "scrim-light": "rgba(var(--r2-palette-shadow) / 0.08)",
  scrollbar: "rgba(var(--r2-palette-blue) / 0.3)",
  "scrollbar-hover": "rgba(var(--r2-palette-blue) / 0.5)",
  "scrollbar-active": "var(--r2-accent)",

  "ink-1": "#1c1f24",
  "ink-2": "#585c64",
  "ink-3": "#80838b",
  "ink-disabled": "#a9abb0",
  "ink-inverse": "#ffffff",
  text: "var(--r2-ink-1)",
  muted: "var(--r2-ink-2)",
  faint: "var(--r2-ink-3)",
  "prose-ink": "var(--r2-ink-1)",

  border: "#e6e6e3",
  "border-strong": "#d9d9d5",
  accent: "#2f4c7c",
  "accent-ink": "#223b63",
  "accent-soft": "rgba(var(--r2-palette-blue) / 0.09)",
  "accent-soft-hover": "rgba(var(--r2-palette-blue) / 0.13)",
  "accent-line": "rgba(var(--r2-palette-blue) / 0.28)",
  focus: "var(--r2-accent)",
  selection: "rgba(var(--r2-palette-blue) / 0.16)",
  selected: "var(--r2-accent-soft)",
  "selected-hover": "var(--r2-accent-soft-hover)",
  "selected-ink": "var(--r2-accent-ink)",

  danger: "#a33a32",
  "danger-strong": "#8a2f28",
  "danger-soft": "rgba(163 58 50 / 0.1)",
  warning: "#8a6116",
  "warning-soft": "rgba(138 97 22 / 0.1)",
  success: "#3b6b45",
  "success-soft": "rgba(59 107 69 / 0.1)",
  info: "var(--r2-accent)",
  "info-soft": "var(--r2-accent-soft)",

  "shadow-sm": "0 1px 2px rgba(var(--r2-palette-shadow) / 0.04)",
  "shadow-pop": "0 1px 2px rgba(var(--r2-palette-shadow) / 0.05), 0 8px 24px -8px rgba(var(--r2-palette-shadow) / 0.14)",
  "shadow-lg": "0 18px 48px rgba(var(--r2-palette-shadow) / 0.1)",
  ring: "0 0 0 1px var(--r2-border)",
  "shadow-sheet":
    "0 0 0 1px rgba(var(--r2-palette-ink) / 0.05), -12px 0 28px -14px rgba(var(--r2-palette-shadow) / 0.1), 0 8px 24px -16px rgba(var(--r2-palette-shadow) / 0.08)",
  "tooltip-bg": "var(--r2-ink-1)",
  "tooltip-ink": "var(--r2-ink-inverse)",
  knob: "#ffffff",

  "ms-bg": "var(--r2-bg)",
  "ms-ink": "var(--r2-ink-1)",
  "ms-faint": "var(--r2-ink-3)",
  "ms-caret": "var(--r2-accent)",
  "ms-selection": "var(--r2-selection)",
  "ms-rule": "var(--r2-border-strong)",
};

// ── Candlelight ────────────────────────────────────────────────────────────
// Warm ivory and evening desk light: every neutral drawn from a warm umber
// rather than a cool ink, the contrast a touch softer, the ink blue kept so
// it is still Rune. Paper, not parchment: no yellow, no sepia.
const CANDLELIGHT: Palette = {
  ...LIGHT,
  "palette-ink": "52 42 30",
  "palette-shadow": "46 34 20",
  "palette-blue": "50 76 118",

  bg: "#f8f5ee",
  "shell-bg": "#f0ebe1",
  "panel-bg": "#f4f0e8",
  "page-bg": "#f2eee5",
  "group-bg": "#fbf9f4",
  "surface-raised": "#fbf9f4",
  "raised-hover": "#f0ebe1",
  "overlay-bg": "#fbf9f4",
  "surface-sunken": "rgba(var(--r2-palette-ink) / 0.03)",
  hover: "rgba(var(--r2-palette-ink) / 0.055)",
  "hover-faint": "rgba(var(--r2-palette-ink) / 0.02)",
  press: "rgba(var(--r2-palette-ink) / 0.09)",
  scrollbar: "rgba(var(--r2-palette-blue) / 0.3)",
  "scrollbar-hover": "rgba(var(--r2-palette-blue) / 0.5)",

  "ink-1": "#2a251f",
  "ink-2": "#5f584e",
  "ink-3": "#837a6d",
  "ink-disabled": "#aba293",
  "ink-inverse": "#fffdf8",

  border: "#e6dfd2",
  "border-strong": "#d8cfbf",
  accent: "#324c76",
  "accent-ink": "#263b5e",
  "accent-soft": "rgba(var(--r2-palette-blue) / 0.09)",
  "accent-soft-hover": "rgba(var(--r2-palette-blue) / 0.13)",
  selection: "rgba(var(--r2-palette-blue) / 0.15)",

  danger: "#9f3a2d",
  "danger-strong": "#852f24",
  "danger-soft": "rgba(159 58 45 / 0.1)",
  warning: "#835c14",
  "warning-soft": "rgba(131 92 20 / 0.1)",
  success: "#3f6a3f",
  "success-soft": "rgba(63 106 63 / 0.1)",

  "ms-ink": "#2b2620",
};

// ── Dark ───────────────────────────────────────────────────────────────────
// A deep ink dark, designed rather than inverted: never pure black, faintly
// blue like Rune's ink; the frame a shade lighter than the content field (in
// the dark, what is nearer is lighter), floating surfaces lighter still;
// borders quieter than Light's; prose a soft light grey, not white, for long
// sessions; the ink blue lifted until it reads on the dark without glowing.
const DARK: Palette = {
  "palette-ink": "226 230 238",
  "palette-shadow": "0 0 0",
  "palette-blue": "143 170 216",

  bg: "#1b1d21",
  "shell-bg": "#202227",
  "panel-bg": "#1e2025",
  "nav-bg": "var(--r2-shell-bg)",
  "page-bg": "#18191d",
  "group-bg": "#212328",
  "surface-raised": "#25272d",
  "raised-hover": "#2c2f35",
  "field-bg": "var(--r2-surface-raised)",
  "surface-sunken": "rgba(0 0 0 / 0.16)",
  "overlay-bg": "#26282e",
  "prose-bg": "var(--r2-bg)",
  hover: "rgba(var(--r2-palette-ink) / 0.06)",
  "hover-faint": "rgba(var(--r2-palette-ink) / 0.025)",
  press: "rgba(var(--r2-palette-ink) / 0.1)",
  scrim: "rgba(0 0 0 / 0.5)",
  "scrim-light": "rgba(0 0 0 / 0.22)",
  scrollbar: "rgba(var(--r2-palette-blue) / 0.3)",
  "scrollbar-hover": "rgba(var(--r2-palette-blue) / 0.5)",
  "scrollbar-active": "var(--r2-accent)",

  "ink-1": "#e4e6ea",
  "ink-2": "#a8acb4",
  "ink-3": "#80858e",
  "ink-disabled": "#5c6068",
  "ink-inverse": "#15171b",
  text: "var(--r2-ink-1)",
  muted: "var(--r2-ink-2)",
  faint: "var(--r2-ink-3)",
  "prose-ink": "var(--r2-ink-1)",

  border: "#2b2e34",
  "border-strong": "#373a41",
  accent: "#8faad8",
  "accent-ink": "#aec2e6",
  "accent-soft": "rgba(var(--r2-palette-blue) / 0.14)",
  "accent-soft-hover": "rgba(var(--r2-palette-blue) / 0.2)",
  "accent-line": "rgba(var(--r2-palette-blue) / 0.4)",
  focus: "var(--r2-accent)",
  selection: "rgba(var(--r2-palette-blue) / 0.28)",
  selected: "var(--r2-accent-soft)",
  "selected-hover": "var(--r2-accent-soft-hover)",
  "selected-ink": "var(--r2-accent-ink)",

  danger: "#e27d71",
  "danger-strong": "#ec9489",
  "danger-soft": "rgba(226 125 113 / 0.13)",
  warning: "#d6ad5c",
  "warning-soft": "rgba(214 173 92 / 0.12)",
  success: "#86b98f",
  "success-soft": "rgba(134 185 143 / 0.12)",
  info: "var(--r2-accent)",
  "info-soft": "var(--r2-accent-soft)",

  "shadow-sm": "0 1px 2px rgba(0 0 0 / 0.3)",
  "shadow-pop": "0 1px 2px rgba(0 0 0 / 0.3), 0 10px 28px -8px rgba(0 0 0 / 0.55)",
  "shadow-lg": "0 18px 48px rgba(0 0 0 / 0.45)",
  ring: "0 0 0 1px rgba(var(--r2-palette-ink) / 0.09)",
  "shadow-sheet":
    "0 0 0 1px rgba(var(--r2-palette-ink) / 0.06), -12px 0 28px -14px rgba(0 0 0 / 0.45), 0 8px 24px -16px rgba(0 0 0 / 0.35)",
  "tooltip-bg": "#383b42",
  "tooltip-ink": "#eef0f3",
  knob: "#e9ebef",

  "ms-bg": "var(--r2-bg)",
  "ms-ink": "#d8dbe0",
  "ms-faint": "var(--r2-ink-3)",
  "ms-caret": "var(--r2-accent)",
  "ms-selection": "var(--r2-selection)",
  "ms-rule": "var(--r2-border-strong)",
};

// ── Themes ─────────────────────────────────────────────────────────────────

export const THEMES = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "candlelight", label: "Candlelight" },
  { id: "dark", label: "Dark" },
] as const satisfies readonly { id: string; label: string }[];

export type ThemeId = (typeof THEMES)[number]["id"];
/** A theme as painted: System is Light or Dark. */
export type ResolvedThemeId = Exclude<ThemeId, "system">;

export const PALETTES: Readonly<Record<ResolvedThemeId, Palette>> = { light: LIGHT, candlelight: CANDLELIGHT, dark: DARK };

export const THEME_SCHEME: Readonly<Record<ResolvedThemeId, Scheme>> = { light: "light", candlelight: "light", dark: "dark" };

/** What a theme paints given the operating system's preference: System is Light or Dark. */
export function resolveTheme(theme: ThemeId, systemDark: boolean): ResolvedThemeId {
  return theme === "system" ? (systemDark ? "dark" : "light") : theme;
}

// ── Writing surfaces ───────────────────────────────────────────────────────
// A small, curated set — never a colour picker. Each is a complete
// treatment: page, prose ink, the faint ink of a placeholder or a Scene
// break, the rule. "Default" is the theme's own. The caret and the text
// selection are the writer's accent (ACCENT_SURFACE_TOKENS), in the variant
// made for the page's scheme — so a selection in prose is the same colour as
// a selection anywhere else in Rune, and never a blue the writer did not choose.

type SurfaceDef = {
  id: string;
  label: string;
  /** Whether the page is light or dark: decides the interface ink around the prose. */
  scheme: Scheme | null;
  tokens: Readonly<Record<SurfaceToken, string>> | null;
};

export const WRITING_SURFACES = [
  { id: "theme", label: "Default", scheme: null, tokens: null },
  {
    id: "white",
    label: "White",
    scheme: "light",
    tokens: {
      "ms-bg": "#ffffff",
      "ms-ink": "#1b1d21",
      "ms-faint": "#8a8c92",
      "ms-caret": "var(--r2-accent)",
      "ms-selection": "rgba(var(--r2-palette-blue) / 0.16)",
      "ms-rule": "#dcdcd8",
    },
  },
  {
    id: "paper",
    label: "Paper",
    scheme: "light",
    tokens: {
      "ms-bg": "#f6f3ec",
      "ms-ink": "#25221d",
      "ms-faint": "#8c8578",
      "ms-caret": "var(--r2-accent)",
      "ms-selection": "rgba(var(--r2-palette-blue) / 0.15)",
      "ms-rule": "#d9d2c4",
    },
  },
  {
    id: "warm",
    label: "Warm",
    scheme: "light",
    tokens: {
      "ms-bg": "#f2e9d8",
      "ms-ink": "#2d261d",
      "ms-faint": "#877b67",
      "ms-caret": "var(--r2-accent)",
      "ms-selection": "rgba(var(--r2-palette-blue) / 0.2)",
      "ms-rule": "#d8cbb2",
    },
  },
  {
    id: "gray",
    label: "Soft gray",
    scheme: "light",
    tokens: {
      "ms-bg": "#eaebed",
      "ms-ink": "#202227",
      "ms-faint": "#7d8088",
      "ms-caret": "var(--r2-accent)",
      "ms-selection": "rgba(var(--r2-palette-blue) / 0.17)",
      "ms-rule": "#cfd1d5",
    },
  },
  {
    id: "charcoal",
    label: "Charcoal",
    scheme: "dark",
    tokens: {
      "ms-bg": "#26282c",
      "ms-ink": "#d6d8dc",
      "ms-faint": "#80848b",
      "ms-caret": "var(--r2-accent)",
      "ms-selection": "rgba(var(--r2-palette-blue) / 0.3)",
      "ms-rule": "#3c3f45",
    },
  },
] as const satisfies readonly SurfaceDef[];

export type WritingSurfaceId = (typeof WRITING_SURFACES)[number]["id"];

export function writingSurface(id: WritingSurfaceId): SurfaceDef {
  return WRITING_SURFACES.find((s) => s.id === id) ?? WRITING_SURFACES[0];
}

/**
 * The manuscript tokens a surface paints in a theme (Default takes the
 * theme's), with `var(--r2-…)` references resolved — for tests and swatches.
 */
export function surfaceColours(surface: WritingSurfaceId, theme: ResolvedThemeId): Record<SurfaceToken, string> {
  const s = writingSurface(surface);
  const palette = PALETTES[theme];
  // A surface of the other scheme paints its region with that scheme's
  // interface palette (buildThemeCss), and its caret and selection with it.
  const region = s.scheme && s.scheme !== THEME_SCHEME[theme] ? PALETTES[s.scheme] : palette;
  const out = {} as Record<SurfaceToken, string>;
  for (const t of SURFACE_TOKENS) {
    const value = s.tokens ? s.tokens[t] : palette[t];
    out[t] = resolveToken((ACCENT_SURFACE_TOKENS as readonly string[]).includes(t) ? region : palette, value);
  }
  return out;
}

/** A token's value in a palette with var(--r2-…) references followed. */
export function resolveToken(palette: Palette, value: string): string {
  let v = value;
  for (let i = 0; i < 8; i++) {
    const m = /^var\(--r2-([a-z0-9-]+)\)$/.exec(v.trim());
    if (!m) break;
    v = palette[m[1] as PaletteToken];
  }
  return v.replace(/var\(--r2-palette-([a-z]+)\)/g, (_, k: string) => palette[`palette-${k}` as PaletteToken]);
}

// ── Accents ────────────────────────────────────────────────────────────────
// Each accent is three values per theme: the accent itself, its deeper ink
// (pressed, selected text), and its tint as an RGB triplet, from which the
// palettes derive the soft selected fill, the accent line and the text
// selection. Every other accent use reads those tokens, so an accent is
// these three lines and nothing else. Rune Blue is each palette's own.

export const ACCENT_TOKENS = ["palette-blue", "accent", "accent-ink"] as const satisfies readonly PaletteToken[];
type AccentToken = (typeof ACCENT_TOKENS)[number];
type AccentValues = Readonly<Record<AccentToken, string>>;

const accent = (tint: string, accent: string, ink: string): AccentValues => ({ "palette-blue": tint, accent, "accent-ink": ink });

type AccentDef = { id: string; label: string; values: Readonly<Record<ResolvedThemeId, AccentValues>> };

export const ACCENTS = [
  {
    id: "blue",
    label: "Sutura Blue",
    values: {
      light: accent(LIGHT["palette-blue"], LIGHT.accent, LIGHT["accent-ink"]),
      candlelight: accent(CANDLELIGHT["palette-blue"], CANDLELIGHT.accent, CANDLELIGHT["accent-ink"]),
      dark: accent(DARK["palette-blue"], DARK.accent, DARK["accent-ink"]),
    },
  },
  {
    id: "graphite",
    label: "Graphite",
    values: {
      light: accent("71 75 83", "#474b53", "#33363c"),
      candlelight: accent("74 69 62", "#4a453e", "#36322c"),
      dark: accent("182 186 193", "#b6bac1", "#cfd2d7"),
    },
  },
  {
    id: "forest",
    label: "Forest",
    values: {
      light: accent("54 96 63", "#36603f", "#284a2f"),
      candlelight: accent("58 94 60", "#3a5e3c", "#2b472d"),
      dark: accent("141 187 149", "#8dbb95", "#a9cfb0"),
    },
  },
  {
    id: "teal",
    label: "Slate Teal",
    values: {
      light: accent("44 94 99", "#2c5e63", "#21484c"),
      candlelight: accent("46 92 91", "#2e5c5b", "#234646"),
      dark: accent("134 188 192", "#86bcc0", "#a5d0d3"),
    },
  },
  {
    id: "violet",
    label: "Violet",
    values: {
      light: accent("87 74 138", "#574a8a", "#43386d"),
      candlelight: accent("87 74 133", "#574a85", "#43386a"),
      dark: accent("172 162 220", "#aca2dc", "#c4bce8"),
    },
  },
  {
    id: "burgundy",
    label: "Burgundy",
    values: {
      light: accent("122 47 62", "#7a2f3e", "#5f2330"),
      candlelight: accent("122 50 64", "#7a3240", "#5e2531"),
      dark: accent("214 146 159", "#d6929f", "#e4acb6"),
    },
  },
  {
    id: "terracotta",
    label: "Terracotta",
    values: {
      light: accent("143 76 42", "#8f4c2a", "#713b20"),
      candlelight: accent("140 75 42", "#8c4b2a", "#6e3a20"),
      dark: accent("220 156 120", "#dc9c78", "#e9b597"),
    },
  },
] as const satisfies readonly AccentDef[];

export type AccentId = (typeof ACCENTS)[number]["id"];

export function accentDef(id: AccentId): AccentDef {
  return ACCENTS.find((a) => a.id === id) ?? ACCENTS[0];
}

/** A theme's palette with an accent applied (Rune Blue is the palette itself). */
export function paletteWithAccent(theme: ResolvedThemeId, accentId: AccentId): Palette {
  return { ...PALETTES[theme], ...accentDef(accentId).values[theme] };
}

// ── The stylesheet ─────────────────────────────────────────────────────────

/** The manuscript region: where a writing surface paints, and where its scheme's ink applies. */
const MANUSCRIPT_REGION = [
  ".r2-content-layer[data-manuscript] > .r2-contextbar",
  ".r2-content-layer[data-manuscript] .r2-body > .r2-main",
  ".r2-content-layer[data-manuscript] .r2-body > .r2-status",
  ".r2-reader",
];

function declarations(palette: Partial<Palette>, scheme: Scheme | null): string {
  const lines = Object.entries(palette).map(([k, v]) => `--r2-${k}:${v};`);
  if (scheme) lines.push(`color-scheme:${scheme};`);
  return lines.join("");
}

/**
 * A palette without the manuscript tokens (and the three the region maps to
 * them): the interface ink a surface's region takes.
 */
function interfaceOnly(palette: Palette): Partial<Palette> {
  const out: Partial<Record<PaletteToken, string>> = { ...palette };
  for (const t of [...SURFACE_TOKENS, "prose-bg", "prose-ink", "selection"] as const) delete out[t];
  return out;
}

const DARK_MEDIA = "@media (prefers-color-scheme: dark)";

/**
 * The themes and surfaces as one stylesheet, rendered by the (rune2) layout.
 * Order matters and is fixed here: themes, then surfaces (which override the
 * theme's manuscript tokens), then a surface's scheme for its region, then
 * the region reading the manuscript tokens.
 */
export function buildThemeCss(): string {
  const region = `:is(${MANUSCRIPT_REGION.join(",")})`;
  const css: string[] = [];

  // Themes. Light is also what a root without a theme paints.
  css.push(`.r2{${declarations(LIGHT, "light")}}`);
  css.push(`.r2[data-theme="candlelight"]{${declarations(CANDLELIGHT, "light")}}`);
  css.push(`.r2[data-theme="dark"]{${declarations(DARK, "dark")}}`);
  css.push(`${DARK_MEDIA}{.r2[data-theme="system"]{${declarations(DARK, "dark")}}}`);

  // Writing surfaces: the manuscript tokens, on the root — except the
  // accent-derived ones, painted in the region below.
  for (const s of WRITING_SURFACES) {
    if (!s.tokens) continue;
    const own: Partial<Record<PaletteToken, string>> = { ...s.tokens };
    for (const t of ACCENT_SURFACE_TOKENS) delete own[t];
    css.push(`.r2[data-surface="${s.id}"]{${declarations(own, null)}}`);
  }

  // Accents, over each theme (Rune Blue is the palettes' own, so it needs none).
  for (const a of ACCENTS) {
    if (a.id === "blue") continue;
    css.push(`.r2[data-accent="${a.id}"]{${declarations(a.values.light, null)}}`);
    css.push(`.r2[data-theme="candlelight"][data-accent="${a.id}"]{${declarations(a.values.candlelight, null)}}`);
    css.push(`.r2[data-theme="dark"][data-accent="${a.id}"]{${declarations(a.values.dark, null)}}`);
    css.push(`${DARK_MEDIA}{.r2[data-theme="system"][data-accent="${a.id}"]{${declarations(a.values.dark, null)}}}`);
  }

  // A surface of the other scheme: its region takes that scheme's interface
  // ink — with the writer's accent in that scheme's variant.
  css.push(`.r2[data-surface-scheme="dark"] ${region}{${declarations(interfaceOnly(DARK), "dark")}}`);
  const lightInDark = declarations(interfaceOnly(LIGHT), "light");
  css.push(`.r2[data-theme="dark"][data-surface-scheme="light"] ${region}{${lightInDark}}`);
  css.push(`${DARK_MEDIA}{.r2[data-theme="system"][data-surface-scheme="light"] ${region}{${lightInDark}}}`);
  for (const a of ACCENTS) {
    if (a.id === "blue") continue;
    const sel = `[data-accent="${a.id}"]`;
    css.push(`.r2[data-surface-scheme="dark"]${sel} ${region}{${declarations(a.values.dark, null)}}`);
    css.push(`.r2[data-theme="dark"][data-surface-scheme="light"]${sel} ${region}{${declarations(a.values.light, null)}}`);
    css.push(
      `${DARK_MEDIA}{.r2[data-theme="system"][data-surface-scheme="light"]${sel} ${region}{${declarations(a.values.light, null)}}}`
    );
  }

  // A surface's caret and selection: the accent as the region resolves it —
  // the writer's accent, in the variant made for the page's scheme.
  for (const s of WRITING_SURFACES) {
    if (!s.tokens) continue;
    const own: Partial<Record<PaletteToken, string>> = {};
    for (const t of ACCENT_SURFACE_TOKENS) own[t] = s.tokens[t];
    css.push(`.r2[data-surface="${s.id}"] ${region}{${declarations(own, null)}}`);
  }

  // The region reads the manuscript tokens.
  css.push(
    `.r2 ${region}{--r2-prose-bg:var(--r2-ms-bg);--r2-prose-ink:var(--r2-ms-ink);--r2-selection:var(--r2-ms-selection);}`
  );

  // The document behind a Rune page (seen only past its edges: overscroll,
  // a page shorter than the window) — set by RunePreferences on <html>.
  for (const id of ["light", "candlelight", "dark"] as const) {
    const p = PALETTES[id];
    css.push(
      `html[data-r2-theme="${id}"],html[data-r2-theme="${id}"] body{background:${resolveToken(p, p["page-bg"])};color-scheme:${THEME_SCHEME[id]};}`
    );
  }
  return css.join("\n");
}

// ── Contrast (WCAG 2) — used by tests and nothing at runtime ────────────────

/** An sRGB colour from #rgb/#rrggbb, "r g b", or rgba(r g b / a) over a backdrop. */
export function parseColour(value: string, backdrop?: [number, number, number]): [number, number, number] | null {
  const v = value.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
  }
  const rgba = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[/,]\s*([\d.]+))?\s*\)$/.exec(v);
  if (rgba) {
    const c = [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])] as [number, number, number];
    const a = rgba[4] === undefined ? 1 : Number(rgba[4]);
    if (a >= 1 || !backdrop) return a >= 1 ? c : null;
    return c.map((x, i) => Math.round(x * a + backdrop[i] * (1 - a))) as [number, number, number];
  }
  return null;
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
