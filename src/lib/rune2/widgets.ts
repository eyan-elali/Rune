// Widgets: the global glance surface (components/rune2/Widgets.tsx). Pure
// rules over a writer's widget layout — which widgets show, in what order,
// at which size — and nothing about their data. No React, no storage.
//
// Three contextual systems, three questions:
//   Inspector        "What am I looking at?"
//   Revision Notes   "What do I need to remember while revising?"
//   Widgets          "How is my writing going?"
//
// The layout is the writer's, once, for every Project (LAYOUT = global per
// writer); the widgets' values are the current Project's (DATA = contextual).
// The grid is constrained on purpose: two columns, two sizes, no free
// placement, no resizing by hand. The constraint is part of the quality.
//
// ACTIVITY widgets (Today's Words, Writing Streak, Writing Activity) read the
// per-day writing-credit ledger (lib/rune2/writingActivity.ts has the rules:
// typed words only, the device's local day, no XP). They became available
// once the credit write was made atomic and idempotent (migration 057).
// A widget that is not available is never offered and is dropped from a
// stored layout, so no borrowed number is ever shown.

export type WidgetId =
  | "projectWords"
  | "currentScene"
  | "goal"
  | "revisionNotes"
  | "milestone"
  | "recent"
  | "todayWords"
  | "dailyGoal"
  | "writingStreak"
  | "writingActivity"
  | "timer";

export type WidgetSize = "small" | "wide";

export type WidgetGroup = "project" | "writing" | "activity";

export type WidgetDefinition = {
  id: WidgetId;
  name: string;
  /** A tiny description for the catalog. */
  description: string;
  group: WidgetGroup;
  /** The sizes it supports; the first is its default. */
  sizes: readonly WidgetSize[];
  /** False: its data source is not yet trustworthy — never offered, never shown. */
  available: boolean;
  /** Why it is gated (available: false). */
  gated?: string;
};

export const WIDGET_GROUP_LABEL: Record<WidgetGroup, string> = {
  project: "Project",
  writing: "Writing",
  activity: "Activity",
};

export const WIDGETS: readonly WidgetDefinition[] = [
  {
    id: "projectWords",
    name: "Project words",
    description: "The ordered manuscript's word count.",
    group: "project",
    sizes: ["small", "wide"],
    available: true,
  },
  {
    id: "goal",
    name: "Goal",
    description: "Words toward this manuscript's goal.",
    group: "project",
    sizes: ["wide", "small"],
    available: true,
  },
  {
    id: "milestone",
    name: "Milestone",
    description: "The latest named picture of the manuscript.",
    group: "project",
    sizes: ["small", "wide"],
    available: true,
  },
  {
    id: "revisionNotes",
    name: "Revision Notes",
    description: "Open notes in this Project.",
    group: "project",
    sizes: ["small"],
    available: true,
  },
  {
    id: "currentScene",
    name: "Current scene",
    description: "What is open in the manuscript, and its words.",
    group: "writing",
    sizes: ["small", "wide"],
    available: true,
  },
  {
    id: "recent",
    name: "Recent",
    description: "Where you were lately in this Project.",
    group: "writing",
    sizes: ["wide"],
    available: true,
  },
  {
    // The writing timer (lib/rune2/timer.ts): a quiet countdown, device-local,
    // the same in every Project. Never writing credit, never a goal.
    id: "timer",
    name: "Timer",
    description: "A quiet countdown for a stretch of writing.",
    group: "writing",
    sizes: ["small", "wide"],
    available: true,
  },
  {
    id: "todayWords",
    name: "Today’s words",
    description: "Words you wrote today, in this Project.",
    group: "activity",
    sizes: ["small", "wide"],
    available: true,
  },
  {
    id: "dailyGoal",
    name: "Daily goal",
    description: "Words written today toward your daily goal, every Project.",
    group: "activity",
    sizes: ["wide", "small"],
    available: true,
  },
  {
    id: "writingStreak",
    name: "Writing streak",
    description: "Days in a row with writing, any Project.",
    group: "activity",
    sizes: ["small"],
    available: true,
  },
  {
    id: "writingActivity",
    name: "Writing activity",
    description: "The last sixteen weeks, a cell a day.",
    group: "activity",
    sizes: ["wide"],
    available: true,
  },
];

const BY_ID = new Map(WIDGETS.map((w) => [w.id, w]));

export function widgetDefinition(id: WidgetId): WidgetDefinition {
  return BY_ID.get(id) as WidgetDefinition;
}

export function isWidgetId(v: unknown): v is WidgetId {
  return typeof v === "string" && BY_ID.has(v as WidgetId);
}

/** The widgets a writer may add: available, and not already on the board. */
export function availableWidgets(layout: WidgetLayout): WidgetDefinition[] {
  const placed = new Set(layout.widgets.map((w) => w.id));
  return WIDGETS.filter((w) => w.available && !placed.has(w.id));
}

/** The widgets held back: in the catalog, not offered. */
export function gatedWidgets(): WidgetDefinition[] {
  return WIDGETS.filter((w) => !w.available);
}

/** What the Writing Activity calendar shows: words written (the accent by intensity), or daily-goal completion. */
export type ActivityDisplay = "words" | "goal";
export const ACTIVITY_DISPLAYS: readonly ActivityDisplay[] = ["words", "goal"];

/** A widget's own few choices (only Writing Activity has one today). */
export type WidgetOptions = { display?: ActivityDisplay };

export type WidgetPlacement = { id: WidgetId; size: WidgetSize; options?: WidgetOptions };

export type WidgetLayout = { widgets: WidgetPlacement[] };

/** The curated first board. Every writer starts here; every value is trustworthy. */
export const DEFAULT_WIDGET_LAYOUT: WidgetLayout = {
  widgets: [
    { id: "projectWords", size: "small" },
    { id: "todayWords", size: "small" },
    { id: "goal", size: "wide" },
    { id: "currentScene", size: "small" },
    { id: "revisionNotes", size: "small" },
    { id: "milestone", size: "wide" },
    { id: "recent", size: "wide" },
  ],
};

/** Stored shape (versioned, so a later layout can read an older one). */
export const WIDGET_LAYOUT_VERSION = 1;

function sizeFor(def: WidgetDefinition, v: unknown): WidgetSize {
  return (v === "small" || v === "wide") && def.sizes.includes(v) ? v : def.sizes[0];
}

/** The options a stored placement carries that this widget knows; nothing else. */
function optionsFor(id: WidgetId, v: unknown): WidgetOptions | undefined {
  if (!v || typeof v !== "object") return undefined;
  const display = (v as { display?: unknown }).display;
  if (id === "writingActivity" && (display === "words" || display === "goal") && display !== "words") return { display };
  return undefined;
}

/**
 * A stored layout (any shape) as the layout to show: unknown and gated
 * widgets dropped, duplicates kept once, a size the widget doesn't support
 * replaced by its default. Nothing stored (null, or not a layout at all)
 * reads as the default board; a stored empty board stays empty — the writer
 * chose that.
 */
export function readWidgetLayout(stored: unknown): WidgetLayout {
  if (!stored || typeof stored !== "object") return DEFAULT_WIDGET_LAYOUT;
  const list = (stored as { widgets?: unknown }).widgets;
  if (!Array.isArray(list)) return DEFAULT_WIDGET_LAYOUT;
  const seen = new Set<WidgetId>();
  const widgets: WidgetPlacement[] = [];
  for (const item of list) {
    const id = item && typeof item === "object" ? (item as { id?: unknown }).id : item;
    if (!isWidgetId(id) || seen.has(id)) continue;
    const def = widgetDefinition(id);
    if (!def.available) continue;
    seen.add(id);
    const options = optionsFor(id, (item as { options?: unknown }).options);
    widgets.push({ id, size: sizeFor(def, (item as { size?: unknown }).size), ...(options ? { options } : {}) });
  }
  return { widgets };
}

/** What is stored: the shape readWidgetLayout reads. */
export function serializeWidgetLayout(layout: WidgetLayout): { v: number; widgets: WidgetPlacement[] } {
  return {
    v: WIDGET_LAYOUT_VERSION,
    widgets: layout.widgets.map((w) => ({ id: w.id, size: w.size, ...(w.options ? { options: w.options } : {}) })),
  };
}

export function addWidget(layout: WidgetLayout, id: WidgetId): WidgetLayout {
  const def = widgetDefinition(id);
  if (!def.available || layout.widgets.some((w) => w.id === id)) return layout;
  return { widgets: [...layout.widgets, { id, size: def.sizes[0] }] };
}

export function removeWidget(layout: WidgetLayout, id: WidgetId): WidgetLayout {
  if (!layout.widgets.some((w) => w.id === id)) return layout;
  return { widgets: layout.widgets.filter((w) => w.id !== id) };
}

export function setWidgetSize(layout: WidgetLayout, id: WidgetId, size: WidgetSize): WidgetLayout {
  const def = widgetDefinition(id);
  if (!def.sizes.includes(size)) return layout;
  const at = layout.widgets.findIndex((w) => w.id === id);
  if (at === -1 || layout.widgets[at].size === size) return layout;
  const widgets = [...layout.widgets];
  widgets[at] = { ...widgets[at], size };
  return { widgets };
}

/** The Writing Activity calendar's display. The default ("words") is stored as nothing. */
export function setActivityDisplay(layout: WidgetLayout, display: ActivityDisplay): WidgetLayout {
  const at = layout.widgets.findIndex((w) => w.id === "writingActivity");
  if (at === -1) return layout;
  const current = activityDisplayOf(layout.widgets[at]);
  if (current === display) return layout;
  const widgets = [...layout.widgets];
  const { options: _dropped, ...rest } = widgets[at];
  void _dropped;
  widgets[at] = display === "words" ? rest : { ...rest, options: { display } };
  return { widgets };
}

export function activityDisplayOf(placement: WidgetPlacement): ActivityDisplay {
  return placement.options?.display ?? "words";
}

/** Puts `id` at `index` (clamped), the others keeping their order. */
export function reorderWidget(layout: WidgetLayout, id: WidgetId, index: number): WidgetLayout {
  const from = layout.widgets.findIndex((w) => w.id === id);
  if (from === -1) return layout;
  const to = Math.max(0, Math.min(layout.widgets.length - 1, Math.round(index)));
  if (to === from) return layout;
  const widgets = [...layout.widgets];
  const [moved] = widgets.splice(from, 1);
  widgets.splice(to, 0, moved);
  return { widgets };
}

/** The keyboard's reorder: one place earlier or later. */
export function moveWidget(layout: WidgetLayout, id: WidgetId, direction: "earlier" | "later"): WidgetLayout {
  const from = layout.widgets.findIndex((w) => w.id === id);
  if (from === -1) return layout;
  return reorderWidget(layout, id, from + (direction === "earlier" ? -1 : 1));
}

// ── Recents ─────────────────────────────────────────────────────────────────
// The objects the writer was in lately (the Recent widget): object ids only,
// newest first, a short list. The shell records a selection as it is made;
// the widget resolves ids against the live index, so anything gone (Trash,
// deleted) simply isn't shown.

export const RECENT_LIMIT = 8;

export function pushRecent(recent: readonly string[], id: string): string[] {
  if (recent[0] === id) return [...recent];
  return [id, ...recent.filter((r) => r !== id)].slice(0, RECENT_LIMIT);
}

export function readRecent(stored: unknown): string[] {
  if (!Array.isArray(stored)) return [];
  return [...new Set(stored.filter((v): v is string => typeof v === "string"))].slice(0, RECENT_LIMIT);
}

// ── Goal ────────────────────────────────────────────────────────────────────
// Progress toward a project_total goal (writing_goals — the one goal system
// there is; nothing new is invented here). Quiet numbers: words done, words
// to go, a share for the line — capped at the whole, never beyond.

export const GOAL_MIN = 1;
export const GOAL_MAX = 5_000_000;

export function goalProgress(words: number, target: number): { share: number; percent: number; remaining: number } {
  if (!(target > 0)) return { share: 0, percent: 0, remaining: 0 };
  const share = Math.max(0, Math.min(1, words / target));
  return { share, percent: Math.floor(share * 100), remaining: Math.max(0, target - words) };
}

/** A typed goal, checked: the words, or why it is refused. */
export function parseGoalTarget(raw: string): { target: number; error: null } | { target: null; error: string } {
  const digits = raw.replace(/[\s,._']/g, "");
  if (digits === "") return { target: null, error: "Enter a number of words." };
  if (!/^\d+$/.test(digits)) return { target: null, error: "Whole words only — no letters." };
  const n = Number(digits);
  if (n < GOAL_MIN) return { target: null, error: "A goal is at least one word." };
  if (n > GOAL_MAX) return { target: null, error: "That goal is beyond any manuscript." };
  return { target: n, error: null };
}
