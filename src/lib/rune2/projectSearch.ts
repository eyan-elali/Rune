import type { ReferenceObjectType } from "@/lib/types";
import { chapterShowsScenes, type NavEntry } from "./navigatorModel";

// Project Search: one way to find a canonical object of the current Project,
// shared by the search overlay and by every reference picker. Pure — no I/O.
//
// What can be found is read from the shell's index (navigatorModel), so a
// title is matched exactly as the writer sees it now — a rename, a fallback
// ("Untitled", "Scene 2") and a Chapter shown as one piece of writing
// included — and nothing outside the Project can ever be in it. Text inside
// Scenes, Pages and Entries — and in Canvas notes and Section titles (046)
// — is found by the server (actions/projectSearch.ts) and arrives as
// ContentMatches; this module ranks both together. A Canvas note is shown
// as its Canvas, with the matching text, and opens that Canvas at the note.
//
// Ranking is predictable, never a score:
//   0 the title is the query          2 the title contains it
//   1 the title starts with it        3 where it lives contains it (pickers)
//                                     4 its text contains it
// and within a tier, the order of the Project itself: the Manuscript in
// reading order, Unplaced Scenes, then the Workspace as the navigator shows it.
// Matching ignores case, accents and repeated spaces. Nothing is fuzzy.

export type SearchKind = "group" | "chapter" | "scene" | "page" | "folder" | "collection" | "entry" | "canvas" | "canvasNote" | "canvasSection";

export const SEARCH_KIND_LABEL: Record<SearchKind, string> = {
  group: "Group",
  chapter: "Chapter",
  scene: "Scene",
  page: "Page",
  folder: "Folder",
  collection: "Collection",
  entry: "Entry",
  canvas: "Canvas",
  canvasNote: "Note on canvas",
  canvasSection: "Section on canvas",
};

/** A query shorter than this is matched against titles only. */
export const CONTENT_QUERY_MIN = 2;

/**
 * One object whose text contains the query (from the server), with an
 * excerpt — or (migration 046) a Canvas note or Section title: `id` is the
 * placement, `canvas_id` the Canvas it is on.
 */
export type ContentMatch =
  | { type: ReferenceObjectType; id: string; snippet: string }
  | { type: "canvas_note" | "canvas_section"; id: string; canvas_id: string; snippet: string };

export type SearchObject = {
  /** The canonical id to open: a Chapter's only Scene is found as its Chapter. */
  id: string;
  kind: SearchKind;
  /** The title as shown everywhere else. */
  title: string;
  /** Where it lives, in words: "Characters", "Chapter 14", "Workspace / Research". */
  context: string;
  /**
   * The Entry, Page or Scene this is — what a reference points to and whose
   * text a ContentMatch names. A Chapter shown as one piece of writing is its
   * only Scene. null for Groups, divided Chapters, Folders and Collections.
   */
  subject: { type: ReferenceObjectType; id: string } | null;
  /** An Entry's Collection. */
  collectionId: string | null;
  /**
   * A Canvas note or Section (found by its text): the Canvas to open — `id`
   * is then the placement to focus there. Absent for every other result.
   */
  canvasId?: string;
};

export type SearchScope = {
  /** Only these kinds (default: all). */
  kinds?: readonly SearchKind[];
  /** Only objects that are an Entry, Page or Scene of these types (see `subject`). */
  subjects?: readonly ReferenceObjectType[];
  /** Only Entries of this Collection. */
  collectionId?: string;
  /** Never these ids (an object's own id or its subject's). */
  exclude?: ReadonlySet<string>;
  /** Also match where an object lives (tier 3): a picker finds "Characters"' Entries by typing "Characters". */
  matchContext?: boolean;
};

export type MatchTier = 0 | 1 | 2 | 3 | 4;

export type SearchResult = SearchObject & {
  tier: MatchTier;
  /** For a match in the text: the server's excerpt. */
  snippet: string | null;
};

const KIND: Partial<Record<NavEntry["kind"], SearchKind>> = {
  group: "group",
  chapter: "chapter",
  scene: "scene",
  unplacedScene: "scene",
  workspacePage: "page",
  workspaceFolder: "folder",
  workspaceCollection: "collection",
  collectionEntry: "entry",
  workspaceCanvas: "canvas",
};

/**
 * Everything in the Project that can be found, once each, in the Project's
 * own order. A Chapter's only Scene is not listed apart: the navigator shows
 * that Chapter as one piece of writing, so the Chapter is the result — for
 * its title and for its Scene's text — and opening it never makes a second
 * writing surface.
 */
export function searchObjects(index: ReadonlyMap<string, NavEntry>): SearchObject[] {
  const out: SearchObject[] = [];
  const workspace = (e: NavEntry) => ["Workspace", ...e.path.map((p) => p.title)].join(" / ");
  const manuscript = (e: NavEntry) => (e.path.length ? e.path.map((p) => p.title).join(" / ") : "Manuscript");

  for (const e of index.values()) {
    const kind = KIND[e.kind];
    if (!kind) continue;
    const base = { id: e.id, kind, title: e.title, subject: null, collectionId: null } as const;
    switch (e.kind) {
      case "group":
        out.push({ ...base, context: manuscript(e) });
        break;
      case "chapter": {
        const scenes = e.sceneIds ?? [];
        const sole = scenes.length === 1 && !chapterShowsScenes({ scenes });
        out.push({ ...base, context: manuscript(e), subject: sole ? { type: "scene", id: scenes[0] } : null });
        break;
      }
      case "scene": {
        const chapter = index.get(e.path[e.path.length - 1]?.id ?? "");
        if (chapter && !chapterShowsScenes({ scenes: chapter.sceneIds ?? [] })) break;
        out.push({ ...base, context: chapter?.title ?? "Manuscript", subject: { type: "scene", id: e.id } });
        break;
      }
      case "unplacedScene":
        out.push({ ...base, context: "Unplaced", subject: { type: "scene", id: e.id } });
        break;
      case "workspacePage":
        out.push({ ...base, context: workspace(e), subject: { type: "page", id: e.id } });
        break;
      case "collectionEntry": {
        const collection = e.path[e.path.length - 1];
        out.push({
          ...base,
          context: collection?.title ?? "Workspace",
          subject: { type: "entry", id: e.id },
          collectionId: collection?.id ?? null,
        });
        break;
      }
      default:
        out.push({ ...base, context: workspace(e) });
    }
  }
  return out;
}

/** Lower case, without accents, spaces collapsed — the form every comparison uses. */
export function normalizeQuery(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function inScope(object: SearchObject, scope: SearchScope): boolean {
  if (scope.kinds && !scope.kinds.includes(object.kind)) return false;
  if (scope.subjects && !(object.subject && scope.subjects.includes(object.subject.type))) return false;
  if (scope.collectionId !== undefined && object.collectionId !== scope.collectionId) return false;
  if (scope.exclude && (scope.exclude.has(object.id) || (object.subject && scope.exclude.has(object.subject.id)))) return false;
  return true;
}

/** How an object's title (or, if asked, its place) matches a normalized query; null: it doesn't. */
export function titleTier(object: Pick<SearchObject, "title" | "context">, q: string, matchContext = false): MatchTier | null {
  const title = normalizeQuery(object.title);
  if (title === q) return 0;
  if (title.startsWith(q)) return 1;
  if (title.includes(q)) return 2;
  if (matchContext && normalizeQuery(object.context).includes(q)) return 3;
  return null;
}

/**
 * The objects in `scope` matching `query`, best first (see the tiers above).
 * `content`: the server's matches inside text for the same query; a match
 * for an object whose title already matched adds nothing, and one for an
 * object not in the Project's index is ignored. An empty query matches
 * nothing.
 */
export function searchProject(
  objects: readonly SearchObject[],
  query: string,
  scope: SearchScope = {},
  content: readonly ContentMatch[] = []
): SearchResult[] {
  const q = normalizeQuery(query);
  if (!q) return [];
  const inText = new Map<string, string>();
  const onCanvas: ContentMatch[] = [];
  for (const m of content) {
    if (m.type === "canvas_note" || m.type === "canvas_section") onCanvas.push(m);
    else inText.set(m.id, m.snippet);
  }
  const found: { result: SearchResult; at: number }[] = [];
  objects.forEach((object, at) => {
    if (!inScope(object, scope)) return;
    const tier = titleTier(object, q, scope.matchContext);
    if (tier !== null) {
      found.push({ result: { ...object, tier, snippet: null }, at });
      return;
    }
    const snippet = object.subject ? inText.get(object.subject.id) : undefined;
    if (snippet !== undefined) found.push({ result: { ...object, tier: 4, snippet }, at });
  });
  // Canvas-local writing: found by its text, shown under the Canvas it is on
  // (which must be in the Project's index — a trashed Canvas is not), after
  // everything else, in the order the Canvases themselves are listed.
  const canvasAt = new Map(objects.map((o, at) => [o.id, at] as const));
  for (const m of onCanvas) {
    if (m.type !== "canvas_note" && m.type !== "canvas_section") continue;
    const kind: SearchKind = m.type === "canvas_note" ? "canvasNote" : "canvasSection";
    if (scope.kinds && !scope.kinds.includes(kind)) continue;
    const canvas = objects.find((o) => o.id === m.canvas_id && o.kind === "canvas");
    if (!canvas) continue;
    found.push({
      result: { id: m.id, kind, title: canvas.title, context: canvas.context, subject: null, collectionId: null, canvasId: canvas.id, tier: 4, snippet: m.snippet },
      at: objects.length + (canvasAt.get(canvas.id) ?? 0),
    });
  }
  return found.sort((a, b) => a.result.tier - b.result.tier || a.at - b.at).map((f) => f.result);
}

/**
 * `text` in pieces, each marked if it is an occurrence of `query` (ignoring
 * case) — for highlighting in the search UI only; nothing is ever written
 * into content.
 */
export function highlight(text: string, query: string): { text: string; match: boolean }[] {
  const q = query.trim().replace(/\s+/g, " ").toLowerCase();
  const lower = text.toLowerCase();
  // Case folding that changes length (rare) would misplace the marks: don't mark.
  if (!q || lower.length !== text.length) return [{ text, match: false }];
  const parts: { text: string; match: boolean }[] = [];
  let from = 0;
  for (let at = lower.indexOf(q); at !== -1; at = lower.indexOf(q, at + q.length)) {
    if (at > from) parts.push({ text: text.slice(from, at), match: false });
    parts.push({ text: text.slice(at, at + q.length), match: true });
    from = at + q.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), match: false });
  return parts.length ? parts : [{ text, match: false }];
}
