/** Canonical unlockable theme IDs — keep in sync with UNLOCKABLES themes in unlockables.ts */
export const THEME_IDS = [
  "parchment",
  "manuscript",
  "candlelight",
  "fog",
  "midnight-library",
  "crimson-ink",
  "forest-scriptorium",
  "obsidian",
  "ivory-tower",
  "absinthe",
  "ravens-court",
  "gilded-age",
  "the-void",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME_ID: ThemeId = "parchment";

/** Themes that use dark surfaces and `color-scheme: dark` */
export const DARK_THEME_IDS: readonly ThemeId[] = [
  "candlelight",
  "midnight-library",
  "crimson-ink",
  "forest-scriptorium",
  "obsidian",
  "absinthe",
  "ravens-court",
  "gilded-age",
  "the-void",
];

const THEME_ID_SET = new Set<string>(THEME_IDS);

export function isThemeId(value: string): value is ThemeId {
  return THEME_ID_SET.has(value);
}

/** Coerce unknown persisted values to a known id without blocking future ids at runtime. */
export function resolveThemeId(value: string | undefined | null): string {
  if (value && isThemeId(value)) return value;
  if (value) return value;
  return DEFAULT_THEME_ID;
}

export const DARK_THEMES = new Set<string>(DARK_THEME_IDS);
