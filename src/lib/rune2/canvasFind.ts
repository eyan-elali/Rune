import type { CanvasConnection, CanvasItem } from "@/lib/types";
import { ITEM_LABEL, isSection, noteText, targetIdOf } from "./canvas";
import type { NavEntry } from "./navigatorModel";
import { normalizeQuery } from "./projectSearch";

// Find on Canvas (Milestone 22B): a Canvas-local search over what the board
// shows — the current titles of live cards (from the shell's index, as the
// cards show them), the fallback label of an unavailable card, the text of
// notes, Section titles and connection labels. Answered from the session's
// own items, no index and no server: a board of a few hundred cards is
// searched in a moment. Pure; the overlay ranks and shows what comes back.

export type FindKind = "card" | "note" | "section" | "connection";

export type FindResult = {
  /** The placement (or connection) to focus. */
  id: string;
  kind: FindKind;
  /** What it is: "Scene", "Note", "Section", "Connection". */
  type: string;
  /** The line to show: a title, a note's first matching line, a label. */
  text: string;
  /** For a connection: the two placements to focus. */
  endpoints?: [string, string];
  /** Ranking: 0 the text is the query, 1 starts with it, 2 contains it. */
  tier: 0 | 1 | 2;
};

/** The text a card is found by: its live title, else its label when placed. */
export function cardTitle(item: CanvasItem, index: ReadonlyMap<string, NavEntry>): string {
  const target = targetIdOf(item);
  const entry = target ? index.get(target) : undefined;
  if (entry) return entry.title;
  return item.label ?? `Untitled ${ITEM_LABEL[item.item_type].toLowerCase()}`;
}

function tierOf(text: string, q: string): 0 | 1 | 2 | null {
  const t = normalizeQuery(text);
  if (!t) return null;
  if (t === q) return 0;
  if (t.startsWith(q)) return 1;
  if (t.includes(q)) return 2;
  return null;
}

/** The line of a note that contains the query (else its first line), trimmed to a readable length. */
function noteLine(text: string, q: string, max = 120): string {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const hit = lines.find((l) => normalizeQuery(l).includes(q)) ?? lines[0] ?? "";
  if (hit.length <= max) return hit;
  const at = Math.max(0, normalizeQuery(hit).indexOf(q) - 40);
  return `${at > 0 ? "…" : ""}${hit.slice(at, at + max).trim()}…`;
}

/**
 * Everything on the Canvas matching `query`, best first (exact, then
 * starts-with, then contains; within a tier, the board's own stacking
 * order). An empty query finds nothing.
 */
export function findOnCanvas(
  items: readonly CanvasItem[],
  connections: readonly CanvasConnection[],
  index: ReadonlyMap<string, NavEntry>,
  query: string
): FindResult[] {
  const q = normalizeQuery(query);
  if (!q) return [];
  const out: FindResult[] = [];
  for (const item of items) {
    if (item.item_type === "note") {
      const text = noteText(item.content);
      const tier = tierOf(text, q);
      if (tier !== null) out.push({ id: item.id, kind: "note", type: "Note", text: noteLine(text, q), tier });
      continue;
    }
    if (isSection(item)) {
      const title = item.label ?? "";
      const tier = tierOf(title, q);
      if (tier !== null) out.push({ id: item.id, kind: "section", type: "Section", text: title, tier });
      continue;
    }
    const title = cardTitle(item, index);
    const tier = tierOf(title, q);
    if (tier !== null) out.push({ id: item.id, kind: "card", type: ITEM_LABEL[item.item_type], text: title, tier });
  }
  for (const c of connections) {
    if (!c.label) continue;
    const tier = tierOf(c.label, q);
    if (tier !== null) {
      out.push({ id: c.id, kind: "connection", type: "Connection", text: c.label, endpoints: [c.source_item_id, c.target_item_id], tier });
    }
  }
  return out.sort((a, b) => a.tier - b.tier);
}
