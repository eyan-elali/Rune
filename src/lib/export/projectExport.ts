import type { Project, Chapter, PlacedScene } from "@/lib/types";
import {
  PW,
  PH,
  M,
  CW,
  FONT,
  BODY_PT,
  type Doc,
  type TNode,
  type State,
  drawPageChrome,
  guard,
  renderNode,
  lh,
} from "./tiptapToPdf";

function slugify(s: string) {
  return s.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function drawCoverPage(doc: Doc, project: Project): void {
  const centerY = PH * 0.42;

  // Thin gold rule above title
  doc.setDrawColor(201, 168, 76);
  doc.setLineWidth(0.4);
  doc.line(M + CW * 0.2, centerY - 18, PW - M - CW * 0.2, centerY - 18);

  // Project title
  doc.setFont(FONT, "bold");
  doc.setFontSize(22);
  doc.setTextColor(30, 26, 22);
  const titleLines: string[] = doc.splitTextToSize(project.title.toUpperCase(), CW * 0.72);
  let y = centerY;
  for (const line of titleLines) {
    doc.text(line, PW / 2, y, { align: "center" });
    y += lh(22);
  }

  // Thin gold rule below title
  doc.setDrawColor(201, 168, 76);
  doc.line(M + CW * 0.2, y + 6, PW - M - CW * 0.2, y + 6);

  // "Manuscript" label
  doc.setFont(FONT, "italic");
  doc.setFontSize(10);
  doc.setTextColor(122, 111, 99);
  doc.text("Manuscript", PW / 2, y + 16, { align: "center" });

  // Rune wordmark
  doc.setFont(FONT, "italic");
  doc.setFontSize(8);
  doc.setTextColor(122, 111, 99);
  doc.text("Rune", PW / 2, PH - 14, { align: "center" });
}

function renderChapterTitle(state: State, chapter: Chapter): void {
  const d = state.doc;
  const pt = 14;
  guard(state, lh(pt) * 3);
  d.setFont(FONT, "bold");
  d.setFontSize(pt);
  d.setTextColor(30, 26, 22);
  const lines: string[] = d.splitTextToSize(chapter.title.toUpperCase(), CW);
  for (const line of lines) {
    d.text(line, PW / 2, state.y, { align: "center" });
    state.y += lh(pt);
  }
  state.y += lh(pt); // blank line below
}

function renderSceneDivider(state: State): void {
  guard(state, lh(BODY_PT) + 8);
  const d = state.doc;
  const before = lh(BODY_PT) * 0.6;
  state.y += before;
  d.setFont(FONT, "normal");
  d.setFontSize(10);
  d.setTextColor(122, 111, 99);
  d.text("* * *", PW / 2, state.y, { align: "center" });
  state.y += lh(10) + before;
  d.setTextColor(30, 26, 22);
}

function hasText(node: TNode): boolean {
  if (node.type === "text") return (node.text ?? "").trim().length > 0;
  return (node.content ?? []).some(hasText);
}

export type ExportedChapter = {
  chapter: Chapter;
  /** The Chapter's placed Scenes that have text, in Scene order. */
  scenes: PlacedScene[];
};

/**
 * What the standard manuscript export prints, in order (architecture §6):
 *
 *   * every Chapter with at least one placed Scene, by Chapter position, under
 *     its heading (a Chapter with no placed Scene is left out, as before);
 *   * its prose: all its placed Scenes, by Scene position, concatenated. A
 *     scene break ("* * *") goes between two adjacent Scenes — never before the
 *     first or after the last. Scenes without text print nothing and take no
 *     break, so an empty Scene never doubles one;
 *   * Scene titles are organizational metadata and are never printed;
 *   * Unplaced Scenes are never exported (they are not in scenesPerChapter:
 *     loadManuscriptForExport reads placed Scenes only; any Scene whose
 *     chapter_id is not the Chapter's is ignored regardless).
 */
export function planManuscriptExport(
  chapters: Chapter[],
  scenesPerChapter: Record<string, PlacedScene[]>
): ExportedChapter[] {
  return [...chapters]
    .sort((a, b) => a.position - b.position)
    .flatMap((chapter) => {
      const placed = (scenesPerChapter[chapter.id] ?? []).filter((s) => s.chapter_id === chapter.id);
      if (placed.length === 0) return [];
      const scenes = [...placed]
        .sort((a, b) => a.position - b.position)
        .filter((s) => hasText((s.content as TNode | null) ?? { type: "doc" }));
      return [{ chapter, scenes }];
    });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

/**
 * Loads what the manuscript export renders: the Project's Chapters by
 * position and their placed Scenes. Unplaced Scenes are never exported.
 * Throws on a failed read so a partial manuscript is never exported.
 */
export async function loadManuscriptForExport(
  supabase: SupabaseLike,
  projectId: string
): Promise<{ chapters: Chapter[]; scenesPerChapter: Record<string, PlacedScene[]> }> {
  const { data: manuscript, error: manuscriptErr } = await supabase
    .from("manuscripts")
    .select("id")
    .eq("project_id", projectId)
    .maybeSingle();
  if (manuscriptErr) throw manuscriptErr;
  if (!manuscript) return { chapters: [], scenesPerChapter: {} };

  const { data: chapters, error: chapErr } = await supabase
    .from("chapters")
    .select("*")
    .eq("manuscript_id", manuscript.id)
    .order("position", { ascending: true });
  if (chapErr) throw chapErr;
  if (!chapters || chapters.length === 0) return { chapters: [], scenesPerChapter: {} };

  const { data: scenes, error: sceneErr } = await supabase
    .from("scenes")
    .select("*")
    .in("chapter_id", (chapters as Chapter[]).map((c) => c.id))
    .order("position", { ascending: true });
  if (sceneErr) throw sceneErr;

  const scenesPerChapter: Record<string, PlacedScene[]> = {};
  for (const scene of (scenes ?? []) as PlacedScene[]) {
    (scenesPerChapter[scene.chapter_id] ??= []).push(scene);
  }
  return { chapters: chapters as Chapter[], scenesPerChapter };
}

export async function exportProjectAsPdf(
  project: Project,
  chapters: Chapter[],
  scenesPerChapter: Record<string, PlacedScene[]>
): Promise<void> {
  const { default: jsPDF } = await import("jspdf");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });

  // Cover page — no chrome
  drawCoverPage(doc, project);

  const state: State = {
    doc,
    y: M + 10,
    pageNum: 1,
    projectTitle: project.title,
    bodyParagraphCount: 0,
  };

  let firstChapter = true;
  for (const { chapter, scenes } of planManuscriptExport(chapters, scenesPerChapter)) {
    // Start every chapter on a fresh page
    if (firstChapter) {
      doc.addPage();
      drawPageChrome(state);
      firstChapter = false;
    } else {
      doc.addPage();
      state.pageNum++;
      drawPageChrome(state);
      state.y = M + 10;
    }

    renderChapterTitle(state, chapter);
    state.bodyParagraphCount = 0;

    scenes.forEach((scene, i) => {
      if (i > 0) {
        renderSceneDivider(state);
        // The first paragraph after a scene break is not indented.
        state.bodyParagraphCount = 0;
      }
      for (const node of (scene.content as TNode).content ?? []) {
        renderNode(state, node);
      }
    });
  }

  const filename = `${slugify(project.title)}-manuscript.pdf`;
  doc.save(filename);
}
