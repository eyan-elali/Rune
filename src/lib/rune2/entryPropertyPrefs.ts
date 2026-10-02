// One remembered way of looking at an Entry: whether its Collection's
// properties are COLLAPSED under their heading ("Properties · 5") or shown
// (Milestone 21E.2). A preference, not data: nothing about the Entry or its
// values changes, the properties are a click away, and it is kept on this
// device per writer and per Collection — the Characters show their facts,
// the Research notes keep theirs folded. Never server state; every access
// is guarded, and without storage the choice lives for the session.

const KEY = "rune:entry-properties:";

/** The Collections whose properties this writer keeps collapsed, as stored. */
export type CollapsedCollections = Readonly<Record<string, true>>;

/** The stored value, read leniently: anything but an object of `id: true` is nothing. */
export function parseCollapsed(raw: string | null | undefined): CollapsedCollections {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, true> = {};
    for (const [id, v] of Object.entries(parsed)) if (v === true && id) out[id] = true;
    return out;
  } catch {
    return {};
  }
}

/** The map with one Collection's choice changed; a Collection shown is simply absent. */
export function withCollapsed(map: CollapsedCollections, collectionId: string, collapsed: boolean): CollapsedCollections {
  if (collapsed) return map[collectionId] ? map : { ...map, [collectionId]: true };
  if (!map[collectionId]) return map;
  const next: Record<string, true> = { ...map };
  delete next[collectionId];
  return next;
}

export function isCollapsed(map: CollapsedCollections, collectionId: string): boolean {
  return map[collectionId] === true;
}

export function readCollapsedCollections(userId: string | undefined): CollapsedCollections {
  if (!userId) return {};
  try {
    return parseCollapsed(window.localStorage.getItem(`${KEY}${userId}`));
  } catch {
    return {};
  }
}

export function writeCollapsedCollections(userId: string | undefined, map: CollapsedCollections): void {
  if (!userId) return;
  try {
    const key = `${KEY}${userId}`;
    if (Object.keys(map).length === 0) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(map));
  } catch {
    // Storage unavailable: the choice lives for the session only.
  }
}
