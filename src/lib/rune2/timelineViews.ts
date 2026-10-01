import type { PropertyDefinition, PropertyValue, SavedView } from "@/lib/types";
import { valueKey } from "./collectionProperties";
import { isNative } from "./collectionViews";
import type { NavEntry } from "./navigatorModel";

// A Timeline View (migration 042): the same items a List, Table or Board
// shows, arranged along one horizontal axis. Pure — no I/O, no pixels — so
// the Timeline body and the tests share one set of rules, whoever owns the
// View (a Collection over its Entries, the Manuscript over its Scenes).
//
// An axis is one of:
//   manuscript position — a Scene's actual place in the manuscript
//                         (Group → Chapter → Scene), worked out afresh from
//                         the shell's index every time and never stored;
//   a number property   — a story day, an age, a chronology number;
//   a date property     — a date the writer typed.
// Nothing here infers a chronology: an item without a value for the axis
// property has no place on the axis and is listed apart ("No Story day"),
// exactly as an Unplaced Scene is listed apart from the manuscript.
//
// Lanes are the View's group_by — a select or status property, or a
// Relationship to a Collection's Entries — through the Board's own rule
// (boardLanes), so one grouping model serves both.
//
// The layout returned here is structural (columns, bands, ticks, rows); the
// body turns it into pixels, so the same layout reads at any width.

/** The axis id that means "manuscript position" — a Scene View only. */
export const MANUSCRIPT_AXIS = "manuscript";

export type TimelineAxis = { kind: "manuscript" } | { kind: "property"; property: PropertyDefinition };

/** Properties a Timeline can run along: number and date — never a read-only field. */
export function axisProperties<P extends PropertyDefinition>(properties: readonly P[]): P[] {
  return properties.filter((p) => !isNative(p) && (p.type === "number" || p.type === "date"));
}

/**
 * The axis a View is along, or null when it has none it can use. `manuscript`:
 * whether the owner offers manuscript position (a Manuscript does; a
 * Collection never).
 */
export function timelineAxis(view: SavedView, properties: readonly PropertyDefinition[], manuscript: boolean): TimelineAxis | null {
  const axis = view.config.axis ?? null;
  if (axis === null) return null;
  if (axis === MANUSCRIPT_AXIS) return manuscript ? { kind: "manuscript" } : null;
  const property = axisProperties(properties).find((p) => p.id === axis);
  return property ? { kind: "property", property } : null;
}

/** How an axis reads: "Manuscript position", "Story day". */
export function axisName(axis: TimelineAxis): string {
  return axis.kind === "manuscript" ? "Manuscript position" : axis.property.name;
}

// ── Values ──────────────────────────────────────────────────────────────────

/**
 * A "YYYY-MM-DD" as a day number (days since 1970-01-01 in the proleptic
 * Gregorian calendar, any year — a story set in 1203 or 40 000 places as
 * well as one set today), or null when it isn't a date.
 */
export function dayNumber(date: string): number | null {
  const m = /^(-?\d{1,6})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return daysFromCivil(y, mo, d);
}

function daysFromCivil(y: number, m: number, d: number): number {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** The civil date of a day number. */
export function civilOf(day: number): { y: number; m: number; d: number } {
  const z = day + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return { y: y + (m <= 2 ? 1 : 0), m, d };
}

/** An item's place along a property axis, or null when it has no usable value. */
export function axisValue(property: PropertyDefinition, value: PropertyValue | undefined): number | null {
  if (property.type === "number") return typeof value === "number" && Number.isFinite(value) ? value : null;
  if (property.type === "date") return typeof value === "string" ? dayNumber(value) : null;
  return null;
}

export type PropertyPlacement = { id: string; at: number };

/**
 * The items placed along a property axis, in the View's order (so items
 * sharing a value keep it), and those with no value — never placed at an
 * invented one.
 */
export function propertyPlacements(
  property: PropertyDefinition,
  itemIds: readonly string[],
  values: ReadonlyMap<string, PropertyValue>
): { placed: PropertyPlacement[]; missing: string[] } {
  const placed: PropertyPlacement[] = [];
  const missing: string[] = [];
  for (const id of itemIds) {
    const at = axisValue(property, values.get(valueKey(id, property.id)));
    if (at === null) missing.push(id);
    else placed.push({ id, at });
  }
  return { placed, missing };
}

// ── Ticks ───────────────────────────────────────────────────────────────────

export type Tick = { at: number; label: string; major: boolean };

/** A round step (1, 2, 5 × 10ⁿ) that divides `span` into about `count` parts. */
export function niceStep(span: number, count: number): number {
  if (!(span > 0) || !(count > 0)) return 1;
  const rough = span / count;
  const power = Math.pow(10, Math.floor(Math.log10(rough)));
  const unit = rough / power;
  const factor = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10;
  return factor * power;
}

/** Ticks along a number axis: round values from below `min` to above `max`. */
export function numberTicks(min: number, max: number, count: number): Tick[] {
  if (min === max) return [{ at: min, label: min.toLocaleString(), major: true }];
  const step = niceStep(max - min, Math.max(1, count));
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  const ticks: Tick[] = [];
  const first = Math.floor(min / step) * step;
  for (let i = 0; ; i++) {
    const at = Number((first + i * step).toFixed(decimals));
    if (at > max + step / 2) break;
    ticks.push({ at, label: at.toLocaleString(undefined, { maximumFractionDigits: decimals }), major: i === 0 || at % (step * 5) === 0 });
    if (ticks.length > 1000) break;
  }
  return ticks;
}

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type DateUnit = { unit: "day" | "month" | "year"; step: number };
const DATE_UNITS: DateUnit[] = [
  { unit: "day", step: 1 },
  { unit: "day", step: 2 },
  { unit: "day", step: 7 },
  { unit: "day", step: 14 },
  { unit: "month", step: 1 },
  { unit: "month", step: 3 },
  { unit: "month", step: 6 },
  { unit: "year", step: 1 },
  { unit: "year", step: 2 },
  { unit: "year", step: 5 },
  { unit: "year", step: 10 },
  { unit: "year", step: 25 },
  { unit: "year", step: 50 },
  { unit: "year", step: 100 },
  { unit: "year", step: 250 },
  { unit: "year", step: 500 },
  { unit: "year", step: 1000 },
];

function approxDays({ unit, step }: DateUnit): number {
  return step * (unit === "day" ? 1 : unit === "month" ? 30.44 : 365.25);
}

/**
 * Ticks along a date axis (day numbers): days, months or years, whichever
 * gives about `count` ticks; the first tick of a year or month is major and
 * says so ("Mar 1203", "1204"); a lone date is its own tick.
 */
export function dateTicks(minDay: number, maxDay: number, count: number): Tick[] {
  const label = (day: number, unit: DateUnit["unit"], major: boolean) => {
    const { y, m, d } = civilOf(day);
    if (unit === "year") return String(y);
    if (unit === "month") return major ? `${MONTH[m - 1]} ${y}` : MONTH[m - 1];
    return major ? `${d} ${MONTH[m - 1]} ${y}` : `${d} ${MONTH[m - 1]}`;
  };
  if (minDay === maxDay) return [{ at: minDay, label: label(minDay, "day", true), major: true }];
  const span = maxDay - minDay;
  const chosen = DATE_UNITS.find((u) => span / approxDays(u) <= Math.max(1, count)) ?? DATE_UNITS[DATE_UNITS.length - 1];
  const ticks: Tick[] = [];
  const start = civilOf(minDay);
  let y = start.y;
  let m = start.m;
  let d = start.d;
  if (chosen.unit === "year") {
    y = Math.floor(y / chosen.step) * chosen.step;
    m = 1;
    d = 1;
  } else if (chosen.unit === "month") {
    m = Math.floor((m - 1) / chosen.step) * chosen.step + 1;
    d = 1;
  } else {
    // Days: start from the day itself, stepping from there.
  }
  let day = daysFromCivil(y, m, d);
  let previousYear: number | null = null;
  let previousMonth: number | null = null;
  while (day <= maxDay && ticks.length < 1000) {
    const c = civilOf(day);
    const major =
      chosen.unit === "year"
        ? ticks.length === 0 || c.y % (chosen.step * 5) === 0
        : chosen.unit === "month"
          ? previousYear !== c.y
          : previousMonth !== c.m || previousYear !== c.y;
    ticks.push({ at: day, label: label(day, chosen.unit, major), major });
    previousYear = c.y;
    previousMonth = c.m;
    if (chosen.unit === "day") day += chosen.step;
    else if (chosen.unit === "month") {
      m += chosen.step;
      while (m > 12) {
        m -= 12;
        y += 1;
      }
      day = daysFromCivil(y, m, 1);
    } else {
      y += chosen.step;
      day = daysFromCivil(y, 1, 1);
    }
  }
  return ticks;
}

/** Ticks for a property axis over these placements. */
export function axisTicks(property: PropertyDefinition, placed: readonly PropertyPlacement[], count: number): Tick[] {
  if (placed.length === 0) return [];
  let min = Infinity;
  let max = -Infinity;
  for (const p of placed) {
    if (p.at < min) min = p.at;
    if (p.at > max) max = p.at;
  }
  return property.type === "date" ? dateTicks(min, max, count) : numberTicks(min, max, count);
}

// ── Manuscript position ─────────────────────────────────────────────────────

export type TimelineColumn =
  | {
      kind: "chapter";
      id: string;
      /** Its number among all Chapters ("12"). */
      ordinal: number;
      title: string;
      named: boolean;
      /** The View's Scenes in this Chapter, in manuscript order. */
      sceneIds: string[];
      /** The Groups it sits in, top down. */
      groupIds: string[];
    }
  | {
      /** A run of Chapters with none of the View's Scenes — kept, narrowly, so the manuscript's shape stays legible. */
      kind: "gap";
      from: number;
      to: number;
      count: number;
      groupIds: string[];
    };

export type TimelineGroupBand = {
  id: string;
  title: string;
  named: boolean;
  /** 0 for a top-level Group. */
  depth: number;
  /** First and last column (inclusive) the Group spans. */
  from: number;
  to: number;
};

export type ManuscriptLayout = {
  columns: TimelineColumn[];
  groups: TimelineGroupBand[];
  /** How many rows of Group bands the header needs. */
  depth: number;
  /** The placed Scenes shown, in manuscript order — never the View's sort. */
  placed: string[];
  /** The Unplaced Scenes among `sceneIds`, in the order given: they have no manuscript position. */
  unplaced: string[];
};

/**
 * The manuscript as a Timeline's axis: a column per Chapter that holds any
 * of `sceneIds` (the View's arranged Scenes), with its Scenes in manuscript
 * order; Chapters holding none collapse into narrow gaps; Groups become bands
 * over their Chapters. Derived from the index each time, so a Chapter moved,
 * a Scene reordered or moved, or a Group moved is simply read again. Nothing
 * but active objects is in the index, so Trash never appears.
 */
export function manuscriptLayout(index: ReadonlyMap<string, NavEntry>, sceneIds: readonly string[]): ManuscriptLayout {
  const shown = new Set(sceneIds);
  const chapters = [...index.values()].filter((e) => e.kind === "chapter").sort((a, b) => a.ordinal - b.ordinal);
  const groupIdsOf = (chapter: NavEntry) => chapter.path.filter((p) => p.kind === "group").map((p) => p.id);
  const commonPrefix = (a: string[], b: string[]) => {
    let n = 0;
    while (n < a.length && n < b.length && a[n] === b[n]) n++;
    return a.slice(0, n);
  };

  const columns: TimelineColumn[] = [];
  const placed: string[] = [];
  let gap: Extract<TimelineColumn, { kind: "gap" }> | null = null;
  for (const chapter of chapters) {
    const scenes = (chapter.sceneIds ?? []).filter((id) => shown.has(id) && index.get(id)?.kind === "scene");
    const groupIds = groupIdsOf(chapter);
    if (scenes.length === 0) {
      if (gap) {
        gap.to = chapter.ordinal;
        gap.count += 1;
        gap.groupIds = commonPrefix(gap.groupIds, groupIds);
      } else {
        gap = { kind: "gap", from: chapter.ordinal, to: chapter.ordinal, count: 1, groupIds };
        columns.push(gap);
      }
      continue;
    }
    gap = null;
    columns.push({ kind: "chapter", id: chapter.id, ordinal: chapter.ordinal, title: chapter.title, named: chapter.named, sceneIds: scenes, groupIds });
    placed.push(...scenes);
  }

  const groups: TimelineGroupBand[] = [];
  const depth = columns.reduce((n, c) => Math.max(n, c.groupIds.length), 0);
  for (let d = 0; d < depth; d++) {
    let open: TimelineGroupBand | null = null;
    columns.forEach((c, at) => {
      const id = c.groupIds[d];
      if (id && open && open.id === id) {
        open.to = at;
        return;
      }
      open = null;
      if (!id) return;
      const group = index.get(id);
      open = { id, title: group?.title ?? "", named: group?.named ?? false, depth: d, from: at, to: at };
      groups.push(open);
    });
  }

  const unplaced = sceneIds.filter((id) => index.get(id)?.kind === "unplacedScene");
  return { columns, groups, depth, placed, unplaced };
}

// ── Rows ────────────────────────────────────────────────────────────────────

/**
 * Which row each item takes so that none overlaps another: items are placed
 * left to right, each in the first row whose last item ends at least `gap`
 * before it starts — so a pile at one position becomes a readable stack,
 * and items far apart share the first row. `items` in the order they should
 * be considered (ties keep it); the result is by item id.
 */
export function packRows(items: readonly { id: string; x: number }[], width: number, gap = 6): Map<string, number> {
  const sorted = [...items].map((it, at) => ({ ...it, at })).sort((a, b) => a.x - b.x || a.at - b.at);
  const rowEnds: number[] = [];
  const rows = new Map<string, number>();
  for (const it of sorted) {
    let row = rowEnds.findIndex((end) => end + gap <= it.x);
    if (row === -1) {
      row = rowEnds.length;
      rowEnds.push(it.x + width);
    } else rowEnds[row] = it.x + width;
    rows.set(it.id, row);
  }
  return rows;
}
