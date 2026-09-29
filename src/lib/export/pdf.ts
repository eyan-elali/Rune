import type { ExportBlock, ExportDocument } from "./plan";
import { codePoints, LINE_BREAK, type ProseBlock, type Segment } from "./prose";

// ExportDocument → PDF (jsPDF, loaded only when a PDF is made): a readable
// manuscript, not a typeset book — US Letter, 1-inch margins, Times 12 pt at
// 1.5 spacing, a title page (Manuscript export), every Chapter and titled
// Group on a new page, Scene breaks as a centred "* * *", the first
// paragraph of a passage unindented, a running head (the Project's title) and
// page numbers. No Rune interface, colours or marks.
//
// Fidelity: bold, italic, underline and strikethrough are drawn; inline code
// and code blocks are set in Courier; quotes and lists are indented; blank
// paragraphs keep their space. Links keep their text.
//
// Characters: the PDF uses the standard Times and Courier fonts, which cover
// Windows-1252 (Western European letters and typographic punctuation: “ ” ‘ ’
// — – … • € and so on). jsPDF garbles a whole string that holds anything
// else, so every character is checked: common variants are mapped (non-
// breaking hyphen → "-", a two-em dash → "——"), accented letters outside the
// set lose the accent (ā → a), and anything else — Greek, Cyrillic, CJK,
// emoji — is drawn as "?" and reported (unsupportedPdfCharacters) so the
// export dialog can say so and offer DOCX, which keeps every character.

// US Letter in mm, 1-inch margins.
const PW = 215.9;
const PH = 279.4;
const M = 25.4;
const CW = PW - 2 * M;
const PARA_INDENT = 12.7;
const QUOTE_INDENT = 12.7;
const SERIF = "times";
const MONO = "courier";
const BODY_PT = 12;
const LINE = 1.5;
const PT_MM = 0.352778;
const INK: [number, number, number] = [20, 20, 20];
const QUIET: [number, number, number] = [110, 110, 110];

const lh = (pt: number) => pt * LINE * PT_MM;

// ── Characters ───────────────────────────────────────────────────────────────

/** Windows-1252's characters above ASCII outside Latin-1: what the standard fonts can also draw. */
const CP1252_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

function drawable(ch: string): boolean {
  const c = ch.codePointAt(0)!;
  return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || CP1252_EXTRA.has(ch);
}

const EQUIVALENTS: Record<string, string> = {
  "‐": "-", "‑": "-", "‒": "–", "―": "—", "−": "-", "⁃": "-",
  "⸺": "——", "⸻": "———",
  "‛": "‘", "‟": "“", "′": "'", "″": '"', "ʼ": "’", "ʹ": "'",
  " ": " ", " ": " ", " ": " ", " ": " ", " ": " ", " ": " ", " ": " ",
  " ": " ", " ": " ", " ": " ", " ": " ", "　": " ", "\t": "    ",
  "​": "", "‌": "", "‍": "", "⁠": "", "﻿": "", "­": "",
  "․": ".", "‧": "·", "⁄": "/", "№": "No.", "™": "™", "‰": "‰",
  "•": "•", "◦": "•", "∙": "·", "…": "…", "⸮": "?",
};

/** One character as the PDF fonts can draw it: itself, an equivalent, without its accent, or "?". */
function pdfChar(ch: string): { text: string; lost: boolean } {
  if (drawable(ch)) return { text: ch, lost: false };
  if (ch in EQUIVALENTS) return { text: EQUIVALENTS[ch], lost: false };
  const base = ch.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  if (base && base !== ch && codePoints(base).every(drawable)) return { text: base, lost: false };
  // Controls are layout, not text.
  if (/[\u0000-\u001f\u007f-\u009f]/.test(ch)) return { text: "", lost: false };
  return { text: "?", lost: true };
}

/** Text the PDF fonts can draw. */
export function pdfText(text: string): string {
  let out = "";
  for (const ch of codePoints(text)) out += pdfChar(ch).text;
  return out;
}

function collectText(blocks: ProseBlock[], into: string[]): void {
  for (const b of blocks) {
    if (b.kind === "paragraph" || b.kind === "heading") into.push(b.segments.map((s) => s.text).join(""));
    else if (b.kind === "quote") collectText(b.blocks, into);
    else if (b.kind === "list") b.items.forEach((item) => collectText(item, into));
    else if (b.kind === "code") into.push(b.text);
  }
}

/** The distinct characters a PDF of this document can't show (drawn as "?"), in order of appearance. */
export function unsupportedPdfCharacters(doc: ExportDocument): string[] {
  const texts: string[] = [doc.projectTitle];
  for (const b of doc.blocks) {
    if (b.kind === "title" || b.kind === "heading") texts.push(b.text);
    else if (b.kind === "prose") collectText(b.blocks, texts);
  }
  const seen = new Set<string>();
  for (const t of texts) for (const ch of codePoints(t)) if (!seen.has(ch) && pdfChar(ch).lost) seen.add(ch);
  return [...seen];
}

// ── Layout ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Pdf = any;

type State = {
  doc: Pdf;
  y: number;
  page: number;
  runningHead: string;
  /** Whether the next body paragraph opens a passage (no first-line indent). */
  first: boolean;
  /** Whether the current page carries the running head and number (not the title page). */
  chrome: boolean;
};

type Token = { text: string; seg: Segment; w: number; space: boolean };

function fontOf(seg: Pick<Segment, "bold" | "italic" | "code">): [string, string] {
  const style = seg.bold && seg.italic ? "bolditalic" : seg.bold ? "bold" : seg.italic ? "italic" : "normal";
  return [seg.code ? MONO : SERIF, style];
}

function setInk(d: Pdf, rgb: [number, number, number]) {
  d.setTextColor(rgb[0], rgb[1], rgb[2]);
}

function drawChrome(s: State) {
  const d = s.doc;
  d.setFont(SERIF, "normal");
  d.setFontSize(9);
  setInk(d, QUIET);
  if (s.runningHead) d.text(s.runningHead, M, 14);
  d.text(String(s.page), PW - M, PH - 12.7, { align: "right" });
  setInk(d, INK);
}

function newPage(s: State, top = M + 10) {
  s.doc.addPage();
  s.page += 1;
  s.chrome = true;
  drawChrome(s);
  s.y = top;
}

function guard(s: State, needed: number) {
  if (s.y + needed > PH - M) newPage(s);
}

/**
 * Draws one paragraph of segments, wrapped between leftX (firstX on its first
 * line) and rightX, word by word, then leaves `after` below it.
 */
function drawParagraph(
  s: State,
  segments: Segment[],
  o: { pt?: number; leftX: number; firstX: number; rightX: number; after: number; align?: "center"; force?: Partial<Segment> }
) {
  const d = s.doc;
  const pt = o.pt ?? BODY_PT;
  const lineH = lh(pt);
  const tokens: (Token | "break")[] = [];
  for (const raw of segments) {
    if (raw.text === LINE_BREAK) {
      tokens.push("break");
      continue;
    }
    const seg = { ...raw, ...o.force };
    for (const part of pdfText(seg.text).split(/(\s+)/)) {
      if (!part) continue;
      const [font, style] = fontOf(seg);
      d.setFont(font, style);
      d.setFontSize(pt);
      tokens.push({ text: part, seg, w: d.getTextWidth(part), space: /^\s+$/.test(part) });
    }
  }

  const lines: Token[][] = [];
  let cur: Token[] = [];
  let width = 0;
  const avail = () => o.rightX - (lines.length === 0 ? o.firstX : o.leftX);
  for (const t of tokens) {
    if (t === "break") {
      lines.push(cur);
      cur = [];
      width = 0;
      continue;
    }
    if (t.space && width === 0) continue;
    if (width > 0 && width + t.w > avail()) {
      lines.push(cur);
      cur = [];
      width = 0;
      if (t.space) continue;
    }
    cur.push(t);
    width += t.w;
  }
  lines.push(cur);

  lines.forEach((line, i) => {
    while (line.length && line[line.length - 1].space) line.pop();
    guard(s, lineH);
    const lineWidth = line.reduce((n, t) => n + t.w, 0);
    let x = o.align === "center" ? (PW - lineWidth) / 2 : i === 0 ? o.firstX : o.leftX;
    for (const t of line) {
      const [font, style] = fontOf(t.seg);
      d.setFont(font, style);
      d.setFontSize(pt);
      if (!t.space) d.text(t.text, x, s.y);
      if (t.seg.underline || t.seg.strike) {
        d.setDrawColor(INK[0], INK[1], INK[2]);
        d.setLineWidth(0.2);
        if (t.seg.underline) d.line(x, s.y + 0.7, x + t.w, s.y + 0.7);
        if (t.seg.strike) d.line(x, s.y - pt * PT_MM * 0.28, x + t.w, s.y - pt * PT_MM * 0.28);
      }
      x += t.w;
    }
    s.y += lineH;
  });
  s.y += o.after;
}

const PARA_AFTER = lh(BODY_PT) * 0.4;
const PLAIN: Omit<Segment, "text"> = { bold: false, italic: false, underline: false, strike: false, code: false, href: null };

function drawHeadingText(s: State, text: string, pt: number, align: "center" | "left", style: string) {
  const d = s.doc;
  d.setFont(SERIF, style);
  d.setFontSize(pt);
  setInk(d, INK);
  const lines: string[] = d.splitTextToSize(pdfText(text), CW);
  guard(s, lh(pt) * (lines.length + 2));
  for (const line of lines) {
    d.text(line, align === "center" ? PW / 2 : M, s.y, align === "center" ? { align: "center" } : undefined);
    s.y += lh(pt);
  }
}

function drawProse(s: State, blocks: ProseBlock[], base: number, left = M, right = PW - M) {
  for (const b of blocks) {
    switch (b.kind) {
      case "paragraph": {
        if (!b.segments.some((seg) => seg.text !== LINE_BREAK && seg.text.trim())) {
          // An intentional empty paragraph keeps its line.
          s.y += lh(BODY_PT) * Math.max(1, b.segments.length);
          break;
        }
        const firstX = s.first || left !== M ? left : left + PARA_INDENT;
        drawParagraph(s, b.segments, { leftX: left, firstX, rightX: right, after: PARA_AFTER });
        s.first = false;
        break;
      }
      case "heading": {
        const level = base + b.level;
        const text = b.segments.map((seg) => (seg.text === LINE_BREAK ? " " : seg.text)).join("");
        s.y += lh(BODY_PT) * 0.5;
        if (level <= 1) drawHeadingText(s, text, 16, "center", "bold");
        else if (level === 2) drawHeadingText(s, text, 14, "center", "bold");
        else if (level === 3) drawHeadingText(s, text, 13, "left", "bold");
        else drawHeadingText(s, text, 12, "left", "bolditalic");
        s.y += PARA_AFTER;
        s.first = true;
        break;
      }
      case "quote":
        drawProse(s, b.blocks, base, left + QUOTE_INDENT, right - QUOTE_INDENT);
        s.first = false;
        break;
      case "list":
        b.items.forEach((item, i) => {
          const marker = b.ordered ? `${b.start + i}.` : "•";
          const [first, ...rest] = item;
          if (first?.kind === "paragraph") {
            drawParagraph(s, [{ ...PLAIN, text: `${marker} ` }, ...first.segments], {
              leftX: left + 10,
              firstX: left + 4,
              rightX: right,
              after: PARA_AFTER * 0.5,
            });
            drawProse(s, rest, base, left + 10, right);
          } else {
            drawParagraph(s, [{ ...PLAIN, text: marker }], { leftX: left + 4, firstX: left + 4, rightX: right, after: 0 });
            drawProse(s, item, base, left + 10, right);
          }
        });
        s.y += PARA_AFTER * 0.5;
        s.first = false;
        break;
      case "code":
        for (const line of b.text.split("\n")) {
          drawParagraph(s, [{ ...PLAIN, code: true, text: line || " " }], { pt: 10, leftX: left, firstX: left, rightX: right, after: 0 });
        }
        s.y += PARA_AFTER;
        s.first = false;
        break;
      case "rule":
        guard(s, 10);
        s.doc.setDrawColor(QUIET[0], QUIET[1], QUIET[2]);
        s.doc.setLineWidth(0.3);
        s.doc.line(left + (right - left) * 0.3, s.y, right - (right - left) * 0.3, s.y);
        s.y += 8;
        s.first = true;
        break;
    }
  }
}

function drawTitlePage(s: State, text: string) {
  const d = s.doc;
  d.setFont(SERIF, "bold");
  d.setFontSize(22);
  setInk(d, INK);
  let y = PH * 0.4;
  for (const line of d.splitTextToSize(pdfText(text), CW * 0.8) as string[]) {
    d.text(line, PW / 2, y, { align: "center" });
    y += lh(22);
  }
}

function drawBlock(s: State, block: ExportBlock, index: number) {
  switch (block.kind) {
    case "title":
      drawTitlePage(s, block.text);
      break;
    case "heading": {
      // A new page's heading sits a little way down it, as a chapter opening does.
      if (block.newPage || (index > 0 && !s.chrome)) newPage(s, M + 30);
      else if (index > 0) s.y += lh(BODY_PT);
      const pt = block.role === "group" || block.role === "unplaced" ? 16 : block.role === "chapter" ? 14 : 13;
      drawHeadingText(s, block.text.toUpperCase(), pt, "center", "bold");
      s.y += lh(pt);
      s.first = true;
      break;
    }
    case "sceneBreak": {
      guard(s, lh(BODY_PT) * 2);
      s.y += lh(BODY_PT) * 0.6;
      s.doc.setFont(SERIF, "normal");
      s.doc.setFontSize(BODY_PT);
      setInk(s.doc, INK);
      s.doc.text("* * *", PW / 2, s.y, { align: "center" });
      s.y += lh(BODY_PT) * 1.6;
      s.first = true;
      break;
    }
    case "prose":
      if (!s.chrome) newPage(s);
      drawProse(s, block.blocks, block.headingBase);
      break;
  }
}

/** A blank US Letter jsPDF document (the library is loaded only now). */
export async function newPdf(): Promise<Pdf> {
  const mod = await import("jspdf");
  const JsPDF = (mod as { jsPDF?: unknown }).jsPDF ?? mod.default;
  return new (JsPDF as new (options: object) => Pdf)({ orientation: "portrait", unit: "mm", format: "letter", compress: true });
}

/** Lays the document out on a jsPDF document (created by the caller). */
export function layoutPdf(doc: Pdf, exportDoc: ExportDocument): void {
  const titled = exportDoc.blocks[0]?.kind === "title";
  // The title page is unnumbered: the first page of text is page 1.
  const s: State = { doc, y: M + 10, page: titled ? 0 : 1, runningHead: pdfText(exportDoc.projectTitle), first: true, chrome: !titled };
  doc.setProperties?.({ title: pdfText(exportDoc.subject) });
  if (!titled) drawChrome(s);
  exportDoc.blocks.forEach((block, i) => drawBlock(s, block, i));
}

/** The document as a PDF file's bytes. */
export async function renderPdf(exportDoc: ExportDocument): Promise<Uint8Array> {
  const doc = await newPdf();
  layoutPdf(doc, exportDoc);
  return new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
}
