import type { Project, Chapter, Page } from "@/lib/types";
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

function renderPageDivider(state: State): void {
  guard(state, lh(BODY_PT) + 8);
  const d = state.doc;
  const before = lh(BODY_PT) * 0.6;
  state.y += before;
  d.setFont(FONT, "normal");
  d.setFontSize(10);
  d.setTextColor(122, 111, 99);
  d.text("✶", PW / 2, state.y, { align: "center" }); // ✶ six-pointed star
  state.y += lh(10) + before;
  d.setTextColor(30, 26, 22);
}

export async function exportProjectAsPdf(
  project: Project,
  chapters: Chapter[],
  pagesPerChapter: Record<string, Page[]>
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

  // Sort chapters by ascending position
  const sorted = [...chapters].sort((a, b) => a.position - b.position);

  let firstChapter = true;
  for (const chapter of sorted) {
    const allPages = pagesPerChapter[chapter.id] ?? [];
    if (allPages.length === 0) continue;

    // Determine pages to export: canonical page only, or all in position order
    const canonicalPage = allPages.find((p) => p.is_canonical);
    const pagesToExport = canonicalPage
      ? [canonicalPage]
      : [...allPages].sort((a, b) => a.position - b.position);

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

    for (let i = 0; i < pagesToExport.length; i++) {
      if (i > 0) {
        renderPageDivider(state);
        state.bodyParagraphCount = 0;
      }
      const root = pagesToExport[i].content as TNode | null;
      if (root?.content) {
        for (const node of root.content) {
          renderNode(state, node);
        }
      }
    }
  }

  const filename = `${slugify(project.title)}-manuscript.pdf`;
  doc.save(filename);
}
