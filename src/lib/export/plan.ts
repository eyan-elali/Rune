import { buildManuscriptOutline, orderChaptersInManuscript, type OutlineNode } from "@/lib/manuscriptStructure";
import { chapterTitle, sceneIsNamed, sceneLabel } from "@/lib/rune2/navigatorModel";
import { hasText, proseBlocks, type ProseBlock, type TNode } from "./prose";
import { readAllRows } from "@/lib/readAllRows";

// The one export pipeline (Milestone 19). Every export — the whole
// Manuscript, one Chapter, one Scene — is the same three steps:
//
//   loadExportSource   canonical rows, read-only, active only (Trash is never
//                      exported; RLS hides it and the rows are checked again)
//   planExport         those rows → one ExportDocument: title, headings,
//                      Scene breaks and prose, in manuscript order
//   render…            the document → DOCX, PDF, Markdown or plain text
//                      (docx.ts, pdf.ts, markdown.ts, text.ts; formats.ts)
//
// What is exported is the book, never Rune's model of it: no Revision Notes,
// Scene properties, references, History, Milestones, Workspace or statistics
// are read at all. Scene titles are organisational and never printed as prose
// (except to name an Unplaced Scene in the optional Unplaced section, which
// has no other name). Nothing is written anywhere: export only reads.

export type ExportScope =
  | { kind: "manuscript"; includeUnplaced?: boolean }
  | { kind: "chapter"; chapterId: string }
  | { kind: "scene"; sceneId: string };

export type ExportGroupRow = { id: string; title: string | null; parent_group_id: string | null; position: number };
export type ExportChapterRow = {
  id: string;
  title: string;
  position: number;
  group_id: string | null;
  trashed_at?: string | null;
};
export type ExportSceneRow = {
  id: string;
  chapter_id: string | null;
  title: string;
  position: number;
  content: unknown;
  word_count?: number;
  trashed_at?: string | null;
};

/** Canonical rows an export reads: the Project's title and (part of) its Manuscript. */
export type ExportSource = {
  projectTitle: string;
  groups: ExportGroupRow[];
  chapters: ExportChapterRow[];
  /** Placed and (when asked for) Unplaced Scenes. */
  scenes: ExportSceneRow[];
};

export type ExportHeadingRole = "group" | "chapter" | "unplaced" | "unplacedScene";

export type ExportBlock =
  /** The document's title (the Project's), on a page of its own. Manuscript export only. */
  | { kind: "title"; text: string }
  /**
   * A structural heading. `level` is its depth in the document's outline
   * (1 = top): a titled Group by the titled Groups above it; every Chapter
   * one below the deepest printed Group. `newPage`: it starts a page (a
   * heading straight after another shares that page).
   */
  | { kind: "heading"; role: ExportHeadingRole; level: number; text: string; newPage: boolean }
  /** Between two Scenes of a Chapter — never before the first or after the last. */
  | { kind: "sceneBreak" }
  /** One Scene's prose. A heading inside it sits `headingBase` levels below the document's top. */
  | { kind: "prose"; blocks: ProseBlock[]; headingBase: number };

export type ExportDocument = {
  scope: ExportScope["kind"];
  projectTitle: string;
  /** What the file is of, for its metadata and default name ("The Hollow", "Chapter 3"). */
  subject: string;
  blocks: ExportBlock[];
  stats: { chapters: number; scenes: number; words: number; unplacedScenes: number };
};

// ── The manuscript's chapters (the Rune 2.0 rule, unchanged since Milestone 11) ──

export type ExportedChapter<C, S> = {
  chapter: C;
  /** The Chapter's placed Scenes that have text, in Scene order. */
  scenes: S[];
};

/**
 * What the standard manuscript export prints, in order (architecture §6):
 *
 *   * every Chapter with at least one placed Scene, in manuscript reading
 *     order (through its Manuscript Groups: lib/manuscriptStructure.ts), under
 *     its heading (a Chapter with no placed Scene is left out);
 *   * its prose: all its placed Scenes, by Scene position. A Scene break goes
 *     between two adjacent Scenes — never before the first or after the last.
 *     Scenes without text print nothing and take no break, so an empty Scene
 *     never doubles one;
 *   * Scene titles are organizational metadata and are never printed;
 *   * Unplaced Scenes are never part of it (any Scene whose chapter_id is not
 *     the Chapter's is ignored regardless).
 */
export function planManuscriptExport<
  C extends { id: string; position: number; group_id?: string | null },
  S extends { chapter_id: string | null; position: number; content: unknown },
>(
  chapters: C[],
  scenesPerChapter: Record<string, S[]>,
  groups: { id: string; parent_group_id: string | null; position: number }[] = []
): ExportedChapter<C, S>[] {
  return orderChaptersInManuscript(chapters, groups).flatMap((chapter) => {
    const placed = (scenesPerChapter[chapter.id] ?? []).filter((s) => s.chapter_id === chapter.id);
    if (placed.length === 0) return [];
    const scenes = [...placed]
      .sort((a, b) => a.position - b.position)
      .filter((s) => hasText(s.content as TNode | null));
    return [{ chapter, scenes }];
  });
}

// ── Planning ─────────────────────────────────────────────────────────────────

const active = <T extends { trashed_at?: string | null }>(rows: T[]) => rows.filter((r) => !r.trashed_at);
const contentOf = (scene: ExportSceneRow): TNode[] => ((scene.content as TNode | null)?.content ?? []) as TNode[];
const wordsOf = (scenes: ExportSceneRow[]) => scenes.reduce((n, s) => n + (s.word_count ?? 0), 0);

/** A Group's title as a heading, or null: only a titled Group appears in an export (architecture §4). */
function groupHeading(group: ExportGroupRow): string | null {
  return group.title?.trim() || null;
}

/**
 * The document an export scope produces from its source. Pure: the same rows
 * always give the same document, whatever order they arrive in.
 */
export function planExport(source: ExportSource, scope: ExportScope): ExportDocument {
  const chapters = active(source.chapters);
  const scenes = active(source.scenes);
  const blocks: ExportBlock[] = [];
  const heading = (role: ExportHeadingRole, level: number, text: string) => {
    const prev = blocks[blocks.length - 1];
    blocks.push({ kind: "heading", role, level, text, newPage: prev !== undefined && prev.kind !== "heading" });
  };
  const sceneRun = (list: ExportSceneRow[], headingBase: number) => {
    list.forEach((scene, i) => {
      if (i > 0) blocks.push({ kind: "sceneBreak" });
      blocks.push({ kind: "prose", blocks: proseBlocks(contentOf(scene)), headingBase });
    });
  };

  if (scope.kind === "scene") {
    const scene = scenes.find((s) => s.id === scope.sceneId);
    if (!scene) throw new ExportUnavailableError("This scene isn’t available to export.");
    blocks.push({ kind: "prose", blocks: proseBlocks(contentOf(scene)), headingBase: 0 });
    // An unnamed placed Scene is named by where it stands among its Chapter's Scenes ("Scene 2").
    const ordinal =
      scene.chapter_id === null
        ? null
        : scenes
            .filter((s) => s.chapter_id === scene.chapter_id)
            .sort((a, b) => a.position - b.position)
            .findIndex((s) => s.id === scene.id) + 1;
    return {
      scope: "scene",
      projectTitle: source.projectTitle,
      subject: sceneLabel(scene.title, ordinal),
      blocks,
      stats: { chapters: 0, scenes: 1, words: scene.word_count ?? 0, unplacedScenes: 0 },
    };
  }

  if (scope.kind === "chapter") {
    const chapter = chapters.find((c) => c.id === scope.chapterId);
    if (!chapter) throw new ExportUnavailableError("This chapter isn’t available to export.");
    const placed = scenes.filter((s) => s.chapter_id === chapter.id).sort((a, b) => a.position - b.position);
    heading("chapter", 1, chapterTitle(chapter.title));
    sceneRun(placed.filter((s) => hasText(s.content as TNode | null)), 1);
    return {
      scope: "chapter",
      projectTitle: source.projectTitle,
      subject: chapterTitle(chapter.title),
      blocks,
      stats: { chapters: 1, scenes: placed.length, words: wordsOf(placed), unplacedScenes: 0 },
    };
  }

  // The whole Manuscript.
  blocks.push({ kind: "title", text: source.projectTitle.trim() || "Untitled" });
  const byChapter: Record<string, ExportSceneRow[]> = {};
  for (const s of scenes) if (s.chapter_id) (byChapter[s.chapter_id] ??= []).push(s);
  const exported = new Map(planManuscriptExport(chapters, byChapter, source.groups).map((e) => [e.chapter.id, e]));

  // Walk the outline: a titled Group's heading comes before its first exported
  // Chapter; a Group with nothing exported inside prints nothing. Every
  // Chapter heading is one level below the deepest printed Group, so all
  // Chapters look alike (and read back as Chapters), in a Part or not.
  type Node = OutlineNode<ExportGroupRow, ExportChapterRow>;
  const inside = (n: Node): boolean => (n.kind === "chapter" ? exported.has(n.chapter.id) : n.children.some(inside));
  const printedDepth = (nodes: Node[], titledAbove: number): number =>
    nodes.reduce((deepest, n) => {
      if (n.kind === "chapter" || !inside(n)) return deepest;
      const titled = groupHeading(n.group) ? 1 : 0;
      return Math.max(deepest, titledAbove + titled, printedDepth(n.children, titledAbove + titled));
    }, 0);
  const tree = buildManuscriptOutline(source.groups, chapters);
  const chapterLevel = printedDepth(tree, 0) + 1;
  const walk = (nodes: Node[], titledAbove: number) => {
    for (const node of nodes) {
      if (node.kind === "chapter") {
        const entry = exported.get(node.chapter.id);
        if (!entry) continue;
        heading("chapter", chapterLevel, chapterTitle(node.chapter.title));
        sceneRun(entry.scenes, chapterLevel);
        continue;
      }
      if (!inside(node)) continue;
      const title = groupHeading(node.group);
      if (title) heading("group", titledAbove + 1, title);
      walk(node.children, titledAbove + (title ? 1 : 0));
    }
  };
  walk(tree, 0);

  const placed = scenes.filter((s) => s.chapter_id !== null && chapters.some((c) => c.id === s.chapter_id));
  const unplaced = scenes.filter((s) => s.chapter_id === null).sort((a, b) => a.position - b.position);
  if (scope.includeUnplaced) {
    const withText = unplaced.filter((s) => hasText(s.content as TNode | null));
    if (withText.length > 0) {
      // Clearly apart from the book: its own heading on a new page, and each
      // Scene under its name (it has no place in the story to be known by).
      heading("unplaced", 1, "Unplaced Scenes");
      for (const scene of withText) {
        heading("unplacedScene", 2, sceneIsNamed(scene.title) ? scene.title.trim() : "Untitled scene");
        blocks.push({ kind: "prose", blocks: proseBlocks(contentOf(scene)), headingBase: 2 });
      }
    }
  }

  return {
    scope: "manuscript",
    projectTitle: source.projectTitle,
    subject: source.projectTitle.trim() || "Untitled",
    blocks,
    stats: {
      chapters: chapters.length,
      scenes: placed.length,
      words: wordsOf(placed),
      unplacedScenes: scope.includeUnplaced ? unplaced.length : 0,
    },
  };
}

export class ExportUnavailableError extends Error {}

// ── Loading ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

// Every row of a scope, a page at a time (lib/readAllRows.ts): never cut
// short at the API's row cap, and a failed read throws, so nothing partial is
// ever exported.
export { readAllRows };

const SCENE_COLUMNS = "id, chapter_id, title, position, content, word_count, trashed_at";
const CHAPTER_COLUMNS = "id, title, position, group_id, trashed_at";

/**
 * The canonical rows a scope needs, read as the signed-in writer (RLS: their
 * own Project, active rows only). Nothing outside the scope is read: a Scene
 * export reads one Scene, a Chapter export one Chapter and its Scenes.
 */
export async function loadExportSource(
  supabase: SupabaseLike,
  projectId: string,
  scope: ExportScope
): Promise<ExportSource> {
  const { data: project, error: projectErr } = await supabase
    .from("projects")
    .select("id, title")
    .eq("id", projectId)
    .maybeSingle();
  if (projectErr) throw projectErr;
  const { data: manuscript, error: manuscriptErr } = await supabase
    .from("manuscripts")
    .select("id")
    .eq("project_id", projectId)
    .maybeSingle();
  if (manuscriptErr) throw manuscriptErr;
  if (!project || !manuscript) throw new ExportUnavailableError("This project isn’t available to export.");
  const source: ExportSource = { projectTitle: project.title ?? "", groups: [], chapters: [], scenes: [] };

  if (scope.kind === "scene") {
    const { data, error } = await supabase
      .from("scenes")
      .select(SCENE_COLUMNS)
      .eq("id", scope.sceneId)
      .eq("manuscript_id", manuscript.id)
      .maybeSingle();
    if (error) throw error;
    source.scenes = data ? [data as ExportSceneRow] : [];
    // Its Chapter's other Scenes — placement only, never their prose — so it can be named by its place.
    if (data?.chapter_id) {
      const siblings = await readAllRows<ExportSceneRow>(() =>
        supabase.from("scenes").select("id, chapter_id, title, position, trashed_at").eq("chapter_id", data.chapter_id)
      );
      source.scenes.push(...siblings.filter((s) => s.id !== data.id).map((s) => ({ ...s, content: null })));
    }
    return source;
  }

  if (scope.kind === "chapter") {
    const { data, error } = await supabase
      .from("chapters")
      .select(CHAPTER_COLUMNS)
      .eq("id", scope.chapterId)
      .eq("manuscript_id", manuscript.id)
      .maybeSingle();
    if (error) throw error;
    source.chapters = data ? [data as ExportChapterRow] : [];
    if (data) {
      source.scenes = await readAllRows<ExportSceneRow>(() =>
        supabase.from("scenes").select(SCENE_COLUMNS).eq("chapter_id", scope.chapterId)
      );
    }
    return source;
  }

  const [groups, chapters, scenes] = await Promise.all([
    readAllRows<ExportGroupRow>(() =>
      supabase.from("manuscript_groups").select("id, title, parent_group_id, position").eq("manuscript_id", manuscript.id)
    ),
    readAllRows<ExportChapterRow>(() =>
      supabase.from("chapters").select(CHAPTER_COLUMNS).eq("manuscript_id", manuscript.id)
    ),
    readAllRows<ExportSceneRow>(() =>
      supabase.from("scenes").select(SCENE_COLUMNS).eq("manuscript_id", manuscript.id)
    ),
  ]);
  // Unplaced Scenes go no further unless the writer asked for them.
  const kept = scope.includeUnplaced ? scenes : scenes.filter((s) => s.chapter_id !== null);
  return { ...source, groups, chapters, scenes: kept };
}
