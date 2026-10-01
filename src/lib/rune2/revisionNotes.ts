import { chapterShowsScenes, type NavEntry } from "./navigatorModel";

// Revision Notes (migrations 039, 040): writer-authored revision thoughts,
// each on exactly one target — the Manuscript, a Group, a Chapter or a Scene —
// beside the prose and never in it. Anchored by the target's id, so a note
// follows its target through every move. Written only through their own
// functions, which never touch a manuscript row: a note never changes a
// Scene's version, words, history or anyone's writing record.
//
// What each level shows is derived here from the live manuscript index,
// never stored, and each note appears once:
//   * a Scene: its own notes only — the narrowest view;
//   * a Chapter: its own, then each of its Scenes' in Scene order;
//   * a Group: its own, then everything inside it — nested Groups, Chapters,
//     Scenes — in manuscript order;
//   * the Manuscript: its own, then every Group, Chapter and Scene in
//     manuscript order, then the Unplaced Scenes.
// Move a Scene, a Chapter or a Group and its notes are simply read in the new
// place. Pure — shared by the store, the Revision Notes panel, Reading Mode
// and the tests.

export type NoteTargetType = "manuscript" | "group" | "chapter" | "scene";

export type RevisionNote = {
  id: string;
  project_id: string;
  target_type: NoteTargetType;
  target_id: string;
  body: string;
  /** Bumped by every edit; an edit or delete sends the one it was based on. */
  version: number;
  created_at: string;
  updated_at: string;
};

/** The longest note the database accepts (revision_notes_body_check). */
export const REVISION_NOTE_MAX = 20_000;

/** A blank note is never stored. */
export function noteIsBlank(body: string | null | undefined): boolean {
  return (body ?? "").trim() === "";
}

/** A note's first line, shortened — how a margin mark or a title names it. */
export function noteExcerpt(body: string, max = 80): string {
  const line = body.trim().split(/\n+/)[0] ?? "";
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

// ── Scope ─────────────────────────────────────────────────────────────────

/** The level a Revision Notes view is for: also where a note added there goes. */
export type NoteScope = { type: NoteTargetType; id: string };

/**
 * The scope of a navigator entry: a Scene (placed or Unplaced), a Chapter or
 * a Group; nothing selected is the Manuscript. null for a Workspace object,
 * which holds no revision notes.
 */
export function noteScopeOf(entry: NavEntry | null | undefined, manuscriptId: string): NoteScope | null {
  if (!entry) return { type: "manuscript", id: manuscriptId };
  switch (entry.kind) {
    case "scene":
    case "unplacedScene":
      return { type: "scene", id: entry.id };
    case "chapter":
      return { type: "chapter", id: entry.id };
    case "group":
      return { type: "group", id: entry.id };
    default:
      return null;
  }
}

/** One target a view shows notes of, in order; depth is below the view's own level. */
export type ScopeTarget = { type: NoteTargetType; id: string; depth: number; own: boolean; unplaced: boolean };

const TARGET_OF: Partial<Record<NavEntry["kind"], NoteTargetType>> = {
  group: "group",
  chapter: "chapter",
  scene: "scene",
  unplacedScene: "scene",
};

/**
 * Every target a scope shows, in manuscript order (the index is built in
 * reading order, Unplaced Scenes last): the scope's own target first, then
 * its live descendants. A target in Trash is not in the index, so its notes
 * are not shown.
 */
export function scopeTargets(scope: NoteScope, index: ReadonlyMap<string, NavEntry>): ScopeTarget[] {
  const own: ScopeTarget = { type: scope.type, id: scope.id, depth: 0, own: true, unplaced: false };
  if (scope.type === "scene") {
    return [{ ...own, unplaced: index.get(scope.id)?.kind === "unplacedScene" }];
  }
  if (scope.type === "chapter") {
    const chapter = index.get(scope.id);
    return [own, ...(chapter?.sceneIds ?? []).map((id) => ({ type: "scene" as const, id, depth: 1, own: false, unplaced: false }))];
  }
  const out = [own];
  const base = scope.type === "group" ? (index.get(scope.id)?.path.length ?? 0) + 1 : 0;
  for (const entry of index.values()) {
    const type = TARGET_OF[entry.kind];
    if (!type) continue;
    if (scope.type === "group" && !entry.path.some((p) => p.id === scope.id)) continue;
    const unplaced = entry.kind === "unplacedScene";
    out.push({ type, id: entry.id, depth: unplaced ? 1 : entry.path.length - base + 1, own: false, unplaced });
  }
  return out;
}

/** Anything with a target and a creation time — a stored note, or one waiting to be saved. */
type Targeted = { target_type: NoteTargetType; target_id: string; created_at: string; id: string };

const time = (at: string) => new Date(at).getTime();
const key = (type: string, id: string) => `${type}:${id}`;

/** A target and its notes, oldest first. */
export type NoteSection<N> = { target: ScopeTarget; notes: N[] };

/**
 * The Chapter a placed Scene is folded into: a Chapter the writer hasn't
 * divided into Scenes (chapterShowsScenes) reads as just the Chapter, its one
 * Scene has no surface of its own, and so its notes read as the Chapter's.
 * Presentation only — each note keeps its Scene target — and it follows the
 * live structure: once the Chapter has a second Scene, the Scene shows again.
 */
export function foldedIntoChapter(sceneId: string, index: ReadonlyMap<string, NavEntry>): string | null {
  const scene = index.get(sceneId);
  if (scene?.kind !== "scene") return null;
  const chapter = scene.path[scene.path.length - 1];
  if (chapter?.kind !== "chapter") return null;
  return chapterShowsScenes({ scenes: index.get(chapter.id)?.sceneIds ?? [] }) ? null : chapter.id;
}

/**
 * The level a view presents for a scope: a Scene folded into its Chapter
 * (foldedIntoChapter) is presented as that Chapter, so its view, trail and
 * new notes are the Chapter's, as when the Chapter is selected.
 */
export function presentedScope(scope: NoteScope, index: ReadonlyMap<string, NavEntry>): NoteScope {
  if (scope.type !== "scene") return scope;
  const chapter = foldedIntoChapter(scope.id, index);
  return chapter ? { type: "chapter", id: chapter } : scope;
}

/**
 * The notes a scope shows, grouped by target in manuscript order, each note
 * once. Targets without notes are left out. A folded Scene's notes
 * (foldedIntoChapter) join its Chapter's section, after the Chapter's own,
 * rather than showing a "Scene 1" the writer never sees; a Scene viewed on
 * its own still shows them as its own.
 */
export function noteSections<N extends Targeted>(
  notes: Iterable<N>,
  scope: NoteScope,
  index: ReadonlyMap<string, NavEntry>,
): NoteSection<N>[] {
  const byTarget = new Map<string, N[]>();
  for (const n of notes) {
    const k = key(n.target_type, n.target_id);
    const list = byTarget.get(k);
    if (list) list.push(n);
    else byTarget.set(k, [n]);
  }
  const ordered = (list: N[]) =>
    list.sort((a, b) => time(a.created_at) - time(b.created_at) || a.id.localeCompare(b.id));
  const targets = scopeTargets(scope, index);
  const listed = new Set(targets.map((t) => key(t.type, t.id)));
  // Folded Scenes whose Chapter is in this view: chapter id → the Scene's notes.
  const folded = new Map<string, N[]>();
  const skip = new Set<string>();
  for (const target of targets) {
    if (target.type !== "scene" || target.own) continue;
    const chapter = foldedIntoChapter(target.id, index);
    if (!chapter || !listed.has(key("chapter", chapter))) continue;
    skip.add(key(target.type, target.id));
    const list = byTarget.get(key(target.type, target.id));
    if (list) folded.set(chapter, ordered(list));
  }
  const sections: NoteSection<N>[] = [];
  for (const target of targets) {
    const k = key(target.type, target.id);
    if (skip.has(k)) continue;
    const own = byTarget.get(k);
    const list = [...(own ? ordered(own) : []), ...(target.type === "chapter" ? (folded.get(target.id) ?? []) : [])];
    if (list.length === 0) continue;
    sections.push({ target, notes: list });
  }
  return sections;
}

/**
 * One level of a view's notes, read as the manuscript is shaped: a target, its
 * own notes, and the targets inside it that hold notes (a Group's Chapters, a
 * Chapter's Scenes). `count` is every note in the subtree.
 */
export type NoteTreeNode<N> = { target: ScopeTarget; notes: N[]; children: NoteTreeNode<N>[]; count: number };

/**
 * The notes a scope shows as a tree, in manuscript order — what the Revision
 * Notes panel renders. The same notes, grouped by the same rules as
 * noteSections (each note once; a folded Scene's notes read in its Chapter's),
 * but with the containers kept: a Chapter whose Scenes carry notes appears
 * even when it has none of its own, so every note is read under where it
 * lives. Containers with nothing under them are left out. `own` is the
 * scope's own notes; `nodes` everything inside it, Unplaced Scenes last.
 */
export function noteTree<N extends Targeted>(
  notes: Iterable<N>,
  scope: NoteScope,
  index: ReadonlyMap<string, NavEntry>,
): { own: N[]; nodes: NoteTreeNode<N>[] } {
  const sections = new Map(noteSections(notes, scope, index).map((s) => [key(s.target.type, s.target.id), s.notes]));
  const targets = scopeTargets(scope, index);
  const own = targets[0] ? (sections.get(key(targets[0].type, targets[0].id)) ?? []) : [];
  const root: NoteTreeNode<N>[] = [];
  const stack: NoteTreeNode<N>[] = [];
  for (const target of targets.slice(1)) {
    const node: NoteTreeNode<N> = { target, notes: sections.get(key(target.type, target.id)) ?? [], children: [], count: 0 };
    // An Unplaced Scene stands on its own, after everything placed.
    if (target.unplaced) stack.length = 0;
    while (stack.length > 0 && stack[stack.length - 1].target.depth >= target.depth) stack.pop();
    (stack.length > 0 ? stack[stack.length - 1].children : root).push(node);
    stack.push(node);
  }
  const prune = (list: NoteTreeNode<N>[]): NoteTreeNode<N>[] =>
    list.flatMap((node) => {
      node.children = prune(node.children);
      node.count = node.notes.length + node.children.reduce((n, c) => n + c.count, 0);
      return node.count > 0 ? [node] : [];
    });
  return { own, nodes: prune(root) };
}

/** The notes a scope shows, flat, in the order the view lists them. */
export function notesInScope<N extends Targeted>(
  notes: Iterable<N>,
  scope: NoteScope,
  index: ReadonlyMap<string, NavEntry>,
): N[] {
  return noteSections(notes, scope, index).flatMap((s) => s.notes);
}

const NOUN: Record<NoteTargetType, string> = { manuscript: "manuscript", group: "group", chapter: "chapter", scene: "scene" };

/** What a scope's level is called in prose ("this chapter"). */
export function scopeNoun(scope: NoteScope): string {
  return NOUN[scope.type];
}

/**
 * The quiet label of a target in a view: "This scene" / "This chapter" /
 * "This group" / "Whole manuscript" for the view's own level, otherwise the
 * target's title ("Chapter 12", "The Bell Tower"), and "· Unplaced" for an
 * Unplaced Scene.
 */
export function targetLabel(target: ScopeTarget, index: ReadonlyMap<string, NavEntry>): string {
  if (target.own) return target.type === "manuscript" ? "Whole manuscript" : `This ${NOUN[target.type]}`;
  const title = index.get(target.id)?.title ?? NOUN[target.type];
  return target.unplaced ? `${title} · Unplaced` : title;
}

/**
 * The way up from a scope, for moving between levels: the Manuscript, then
 * the Groups and Chapter that contain it, then the scope itself.
 */
export function scopeTrail(
  scope: NoteScope,
  index: ReadonlyMap<string, NavEntry>,
  manuscriptId: string,
): { scope: NoteScope; title: string }[] {
  const trail: { scope: NoteScope; title: string }[] = [{ scope: { type: "manuscript", id: manuscriptId }, title: "Manuscript" }];
  if (scope.type === "manuscript") return trail;
  const entry = index.get(scope.id);
  if (!entry) return trail;
  for (const p of entry.path) {
    const type = TARGET_OF[p.kind];
    if (type) trail.push({ scope: { type, id: p.id }, title: p.title });
  }
  trail.push({ scope, title: entry.title });
  return trail;
}

/** How many notes are on each target (by id) — Reading Mode's quiet marks. */
export function noteCountsByTarget(notes: Iterable<{ target_id: string }>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const n of notes) counts.set(n.target_id, (counts.get(n.target_id) ?? 0) + 1);
  return counts;
}
