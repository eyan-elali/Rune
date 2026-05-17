import type { Page, Chapter, Project } from "@/lib/types";

// US Letter in mm, 1-inch margins
const PW = 215.9;
const PH = 279.4;
const M = 25.4;
const CW = PW - 2 * M;
const PARA_INDENT = 12.7; // 0.5 inch
const BQ_INDENT = 19.05; // 0.75 inch
const FONT = "times";
const BODY_PT = 12;
const LH = 1.5;
const PT_MM = 0.352778;

type TNode = {
  type: string;
  content?: TNode[];
  text?: string;
  marks?: Array<{ type: string }>;
  attrs?: Record<string, unknown>;
};

type Seg = { text: string; bold: boolean; italic: boolean };

type Token = Seg & { w: number };

function collectSegs(node: TNode): Seg[] {
  if (node.type === "text") {
    const bold = node.marks?.some((m) => m.type === "bold") ?? false;
    const italic = node.marks?.some((m) => m.type === "italic") ?? false;
    return [{ text: node.text ?? "", bold, italic }];
  }
  if (node.type === "hardBreak") return [{ text: "\n", bold: false, italic: false }];
  return (node.content ?? []).flatMap(collectSegs);
}

function fstyle(bold: boolean, italic: boolean) {
  if (bold && italic) return "bolditalic";
  if (bold) return "bold";
  if (italic) return "italic";
  return "normal";
}

function lh(pt: number) {
  return pt * LH * PT_MM;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = any;

interface State {
  doc: Doc;
  y: number;
  pageNum: number;
  projectTitle: string;
}

function drawHeader(state: State) {
  const d = state.doc;
  d.setFontSize(8);
  d.setFont(FONT, "normal");
  d.setTextColor(122, 111, 99); // mist
  d.text(state.projectTitle, M, 14);
  d.text(String(state.pageNum), PW - M, 14, { align: "right" });
  d.setTextColor(30, 26, 22); // ink
}

function guard(state: State, needed: number) {
  if (state.y + needed > PH - M) {
    state.doc.addPage();
    state.pageNum++;
    drawHeader(state);
    state.y = M + 10;
  }
}

function renderPara(
  state: State,
  segs: Seg[],
  pt: number,
  leftX: number,
  firstX: number,
  rightX: number,
  after: number
) {
  const d = state.doc;
  const lineH = lh(pt);

  // Tokenize all segments into word-level tokens
  const tokens: Token[] = [];
  for (const seg of segs) {
    if (seg.text === "\n") {
      tokens.push({ text: "\n", bold: seg.bold, italic: seg.italic, w: 0 });
      continue;
    }
    const parts = seg.text.split(/(\s+)/);
    for (const part of parts) {
      if (!part) continue;
      d.setFont(FONT, fstyle(seg.bold, seg.italic));
      d.setFontSize(pt);
      tokens.push({ text: part, bold: seg.bold, italic: seg.italic, w: d.getTextWidth(part) });
    }
  }

  // Build lines via greedy word-wrap
  type Line = Token[];
  const lines: Line[] = [];
  let cur: Line = [];
  let curW = 0;
  let firstLine = true;

  const avail = (first: boolean) => rightX - (first ? firstX : leftX);

  for (const tok of tokens) {
    if (tok.text === "\n") {
      lines.push(cur);
      cur = [];
      curW = 0;
      firstLine = false;
      continue;
    }
    // skip leading spaces on a new line
    if (tok.text.trim() === "" && curW === 0) continue;

    if (curW > 0 && curW + tok.w > avail(firstLine)) {
      lines.push(cur);
      cur = [];
      curW = 0;
      firstLine = false;
      if (tok.text.trim() === "") continue;
    }

    cur.push(tok);
    curW += tok.w;
  }
  if (cur.length > 0) lines.push(cur);

  // Render each line
  let isFirst = true;
  for (const line of lines) {
    if (line.length === 0) {
      state.y += lineH;
      isFirst = false;
      continue;
    }
    guard(state, lineH);
    let x = isFirst ? firstX : leftX;
    for (const tok of line) {
      d.setFont(FONT, fstyle(tok.bold, tok.italic));
      d.setFontSize(pt);
      d.text(tok.text, x, state.y);
      x += tok.w;
    }
    state.y += lineH;
    isFirst = false;
  }

  state.y += after;
}

function renderNode(state: State, node: TNode) {
  const d = state.doc;
  const paraAfter = lh(BODY_PT) * 0.4;

  switch (node.type) {
    case "paragraph": {
      const segs = collectSegs(node);
      const hasText = segs.some((s) => s.text.trim().length > 0);
      if (!hasText) {
        state.y += lh(BODY_PT);
        return;
      }
      renderPara(state, segs, BODY_PT, M, M + PARA_INDENT, PW - M, paraAfter);
      break;
    }

    case "heading": {
      const level = (node.attrs?.level as number) ?? 1;
      const segs = collectSegs(node);
      const flat = segs.map((s) => s.text).join("");

      if (level === 1) {
        const pt = 16;
        guard(state, lh(pt) * 2);
        d.setFont(FONT, "bold");
        d.setFontSize(pt);
        const lines: string[] = d.splitTextToSize(flat, CW);
        for (const line of lines) {
          guard(state, lh(pt));
          d.text(line, PW / 2, state.y, { align: "center" });
          state.y += lh(pt);
        }
        state.y += paraAfter;
      } else if (level === 2) {
        const pt = 14;
        guard(state, lh(pt) * 2);
        d.setFont(FONT, "bold");
        d.setFontSize(pt);
        const lines: string[] = d.splitTextToSize(flat, CW);
        for (const line of lines) {
          guard(state, lh(pt));
          d.text(line, M, state.y);
          state.y += lh(pt);
        }
        state.y += paraAfter;
      } else {
        const pt = 13;
        guard(state, lh(pt) * 2);
        d.setFont(FONT, "bolditalic");
        d.setFontSize(pt);
        const lines: string[] = d.splitTextToSize(flat, CW);
        for (const line of lines) {
          guard(state, lh(pt));
          d.text(line, M, state.y);
          state.y += lh(pt);
        }
        state.y += paraAfter;
      }
      break;
    }

    case "blockquote": {
      const bqL = M + BQ_INDENT;
      const bqR = PW - M - BQ_INDENT;
      for (const child of node.content ?? []) {
        if (child.type === "paragraph") {
          const raw = collectSegs(child);
          const italic = raw.map((s) => ({ ...s, italic: true }));
          renderPara(state, italic, BODY_PT, bqL, bqL, bqR, paraAfter);
        }
      }
      break;
    }

    case "bulletList": {
      for (const item of node.content ?? []) {
        if (item.type !== "listItem") continue;
        const textSegs: Seg[] = (item.content ?? []).flatMap((c) =>
          c.type === "paragraph" ? collectSegs(c) : []
        );
        const all: Seg[] = [{ text: "• ", bold: false, italic: false }, ...textSegs];
        renderPara(state, all, BODY_PT, M + 10, M + 5, PW - M, paraAfter * 0.6);
      }
      state.y += paraAfter * 0.5;
      break;
    }

    case "orderedList": {
      let num = (node.attrs?.start as number) ?? 1;
      for (const item of node.content ?? []) {
        if (item.type !== "listItem") continue;
        const textSegs: Seg[] = (item.content ?? []).flatMap((c) =>
          c.type === "paragraph" ? collectSegs(c) : []
        );
        const all: Seg[] = [{ text: `${num}. `, bold: false, italic: false }, ...textSegs];
        renderPara(state, all, BODY_PT, M + 10, M + 5, PW - M, paraAfter * 0.6);
        num++;
      }
      state.y += paraAfter * 0.5;
      break;
    }

    case "horizontalRule": {
      guard(state, 10);
      d.setDrawColor(122, 111, 99);
      d.setLineWidth(0.3);
      d.line(M + CW * 0.25, state.y, PW - M - CW * 0.25, state.y);
      state.y += 8;
      break;
    }

    default: {
      for (const child of node.content ?? []) {
        renderNode(state, child);
      }
    }
  }
}

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
  };

  // First page header + chapter title
  drawHeader(state);

  doc.setFont(FONT, "bold");
  doc.setFontSize(14);
  doc.setTextColor(30, 26, 22);
  const titleLines: string[] = doc.splitTextToSize(chapter.title.toUpperCase(), CW);
  for (const line of titleLines) {
    doc.text(line, PW / 2, state.y, { align: "center" });
    state.y += lh(14);
  }
  state.y += lh(14); // blank line below chapter title

  // Render Tiptap content
  const root = page.content as TNode | null;
  if (root?.content) {
    for (const node of root.content) {
      renderNode(state, node);
    }
  }

  const filename = `${slugify(project.title)}-${slugify(chapter.title)}-${slugify(page.title)}.pdf`;
  doc.save(filename);
}
