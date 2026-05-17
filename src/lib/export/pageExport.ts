import type { Page, Chapter, Project } from "@/lib/types";
import {
  PW,
  PH,
  M,
  CW,
  FONT,
  type TNode,
  type State,
  drawPageChrome,
  renderNode,
  lh,
} from "./tiptapToPdf";

function slugify(s: string) {
  return s.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export async function exportPageAsPdf(
  page: Page,
  chapter: Chapter,
  project: Project
): Promise<void> {
  const { default: jsPDF } = await import("jspdf");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });

  const state: State = {
    doc,
    y: M + 10,
    pageNum: 1,
    projectTitle: project.title,
    bodyParagraphCount: 0,
  };

  drawPageChrome(state);

  doc.setFont(FONT, "bold");
  doc.setFontSize(14);
  doc.setTextColor(30, 26, 22);
  const titleLines: string[] = doc.splitTextToSize(chapter.title.toUpperCase(), CW);
  for (const line of titleLines) {
    doc.text(line, PW / 2, state.y, { align: "center" });
    state.y += lh(14);
  }
  state.y += lh(14);

  const root = page.content as TNode | null;
  if (root?.content) {
    for (const node of root.content) {
      renderNode(state, node);
    }
  }

  const filename = `${slugify(project.title)}-${slugify(chapter.title)}-${slugify(page.title)}.pdf`;
  doc.save(filename);
}
