import { child, elements, parseXml, textContent, type XmlElement } from "./xml";
import { ImportFileError, openZip } from "./zip";
import { MARK, type ImportBlock, type ImportNotice, type ParsedFile, type Run } from "./types";

// .docx → blocks. Rune imports manuscript prose and structure, not Word's
// layout: paragraphs, bold / italic / underline / strikethrough, line breaks,
// and headings (by heading style or outline level) come across; page geometry,
// fonts, sizes, alignment, indentation and spacing do not. Empty paragraphs
// are reported as blank lines (resolveBlankParagraphs decides which are the
// writer's intentional empty paragraphs); a paragraph that holds only a page
// or section break, or only an image, is layout and never a blank. Anything
// that holds content Rune cannot represent (images, footnotes, text boxes,
// comments, tracked deletions) is reported as a notice — never silently dropped.

type Style = { name: string; basedOn: string | null; outline: number | null; marks: number };

const TOGGLE_OFF = new Set(["0", "false", "off", "none"]);

function on(el: XmlElement | undefined): boolean {
  if (!el) return false;
  const v = el.attrs["w:val"];
  return v === undefined || !TOGGLE_OFF.has(v.toLowerCase());
}

/** Bold / italic / underline / strike from a w:rPr (explicit off wins over a style's on). */
function runMarks(rPr: XmlElement | undefined, base: number): number {
  if (!rPr) return base;
  let marks = base;
  const set = (el: XmlElement | undefined, bit: number) => {
    if (!el) return;
    marks = on(el) ? marks | bit : marks & ~bit;
  };
  set(child(rPr, "w:b"), MARK.bold);
  set(child(rPr, "w:i"), MARK.italic);
  const u = child(rPr, "w:u");
  if (u) marks = u.attrs["w:val"] && TOGGLE_OFF.has(u.attrs["w:val"].toLowerCase()) ? marks & ~MARK.underline : marks | MARK.underline;
  const strike = child(rPr, "w:strike") ?? child(rPr, "w:dstrike");
  set(strike, MARK.strike);
  return marks;
}

function readStyles(xml: string | null): Map<string, Style> {
  const styles = new Map<string, Style>();
  if (!xml) return styles;
  const root = parseXml(xml);
  for (const s of elements(root, "w:style")) {
    const id = s.attrs["w:styleId"];
    if (!id) continue;
    const outline = child(child(s, "w:pPr"), "w:outlineLvl")?.attrs["w:val"];
    styles.set(id, {
      name: (child(s, "w:name")?.attrs["w:val"] ?? id).toLowerCase(),
      basedOn: child(s, "w:basedOn")?.attrs["w:val"] ?? null,
      outline: outline !== undefined && /^\d$/.test(outline) ? Number(outline) : null,
      marks: runMarks(child(s, "w:rPr"), 0),
    });
  }
  return styles;
}

function resolve(styles: Map<string, Style>, id: string | undefined): Style[] {
  const chain: Style[] = [];
  let at = id;
  for (let depth = 0; at && depth < 8; depth++) {
    const s = styles.get(at);
    if (!s) break;
    chain.push(s);
    at = s.basedOn ?? undefined;
  }
  return chain;
}

/** A paragraph style's heading level: 0 for Title, 1–9 for Heading n / outline level; null for body text. */
function headingLevel(chain: Style[], ownOutline: number | null): number | null {
  if (ownOutline !== null) return ownOutline < 9 ? ownOutline + 1 : null;
  for (const s of chain) {
    if (s.name === "title") return 0;
    const m = /^heading (\d)$/.exec(s.name);
    if (m) return Number(m[1]);
    if (s.outline !== null) return s.outline < 9 ? s.outline + 1 : null;
  }
  return null;
}

type Counts = Record<string, number>;

const NOTICE_TEXT: Record<string, (n: number) => string> = {
  image: (n) => `${n} image${n === 1 ? "" : "s"} or drawing${n === 1 ? "" : "s"} can’t be imported and ${n === 1 ? "was" : "were"} left out.`,
  footnote: (n) => `${n} footnote or endnote reference${n === 1 ? "" : "s"}: the notes themselves are not imported.`,
  textbox: (n) => `${n} text box${n === 1 ? "" : "es"} or shape${n === 1 ? "" : "s"} can’t be imported and ${n === 1 ? "was" : "were"} left out.`,
  deletion: (n) => `${n} tracked deletion${n === 1 ? " was" : "s were"} left out (as if accepted). Tracked insertions are imported.`,
  comment: (n) => `${n} comment${n === 1 ? " was" : "s were"} left out. Comments aren’t part of the manuscript.`,
  table: (n) => `${n} table${n === 1 ? "" : "s"}: the text is imported as ordinary paragraphs, without the table.`,
  list: (n) => `${n} list paragraph${n === 1 ? "" : "s"}: the text is imported; bullets and automatic numbering are not.`,
  symbol: (n) => `${n} special symbol${n === 1 ? "" : "s"} from a symbol font can’t be imported and ${n === 1 ? "was" : "were"} left out.`,
};

function noticesFrom(counts: Counts): ImportNotice[] {
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([code, n]) => ({ code, message: NOTICE_TEXT[code]?.(n) ?? `${n} × ${code}` }));
}

export async function parseDocx(bytes: Uint8Array): Promise<ParsedFile> {
  const zip = openZip(bytes);
  const documentXml = await zip.text("word/document.xml");
  if (documentXml === null) throw new ImportFileError("This file isn’t a Word document (.docx): it has no document body.");
  let doc: XmlElement;
  try {
    doc = parseXml(documentXml);
  } catch {
    throw new ImportFileError("This Word document appears to be damaged.");
  }
  const styles = readStyles(await zip.text("word/styles.xml").catch(() => null));
  const counts: Counts = {};
  const count = (code: string) => (counts[code] = (counts[code] ?? 0) + 1);
  if (zip.has("word/comments.xml")) {
    const comments = await zip.text("word/comments.xml").catch(() => null);
    const n = comments ? (comments.match(/<w:comment\b/g) ?? []).length : 0;
    if (n) counts.comment = n;
  }

  const body = child(doc, "w:body");
  if (!body) throw new ImportFileError("This Word document has no body.");
  const blocks: ImportBlock[] = [];
  // Set while reading a paragraph that holds a page/column break or an image: layout, not a blank.
  let layout = false;

  function inline(el: XmlElement, base: number, runs: Run[]) {
    for (const c of el.children) {
      if (typeof c === "string") continue;
      switch (c.name) {
        case "w:r":
          readRun(c, base, runs);
          break;
        case "w:hyperlink":
        case "w:ins":
        case "w:moveTo":
        case "w:smartTag":
        case "w:customXml":
        case "w:fldSimple":
        case "w:dir":
        case "w:bdo":
          inline(c, base, runs);
          break;
        case "w:sdt":
          inline(child(c, "w:sdtContent") ?? c, base, runs);
          break;
        case "w:del":
        case "w:moveFrom":
          count("deletion");
          break;
        case "mc:AlternateContent":
          count("textbox");
          layout = true;
          break;
        default:
          break; // w:pPr, bookmarks, proofing marks, permissions: not content
      }
    }
  }

  function readRun(r: XmlElement, base: number, runs: Run[]) {
    const rPr = child(r, "w:rPr");
    const charStyle = rPr ? child(rPr, "w:rStyle")?.attrs["w:val"] : undefined;
    let marks = base;
    for (const s of resolve(styles, charStyle).reverse()) marks |= s.marks;
    marks = runMarks(rPr, marks);
    let text = "";
    for (const c of r.children) {
      if (typeof c === "string") continue;
      switch (c.name) {
        case "w:t":
          text += textContent(c);
          break;
        case "w:tab":
        case "w:ptab":
          text += "\t";
          break;
        case "w:br":
          // A page or column break is layout; a text-wrapping break is a line break.
          if (!c.attrs["w:type"] || c.attrs["w:type"] === "textWrapping") text += "\n";
          else layout = true;
          break;
        case "w:cr":
          text += "\n";
          break;
        case "w:noBreakHyphen":
          text += "‑";
          break;
        case "w:drawing":
        case "w:pict":
        case "w:object":
          count("image");
          layout = true;
          break;
        case "w:footnoteReference":
        case "w:endnoteReference":
          count("footnote");
          break;
        case "w:sym":
          count("symbol");
          break;
        case "mc:AlternateContent":
          count("textbox");
          layout = true;
          break;
        default:
          break; // w:rPr, w:instrText (field codes), w:delText, w:fldChar, w:softHyphen, w:lastRenderedPageBreak
      }
    }
    if (text) runs.push(marks ? [text, marks] : text);
  }

  function paragraph(p: XmlElement) {
    const pPr = child(p, "w:pPr");
    const styleId = child(pPr, "w:pStyle")?.attrs["w:val"];
    const chain = resolve(styles, styleId ?? "Normal");
    const ownOutline = child(pPr, "w:outlineLvl")?.attrs["w:val"];
    const level = headingLevel(chain, ownOutline !== undefined && /^\d$/.test(ownOutline) ? Number(ownOutline) : null);
    let base = 0;
    if (level === null) for (const s of [...chain].reverse()) base |= s.marks;
    const runs: Run[] = [];
    layout = Boolean(child(pPr, "w:sectPr"));
    inline(p, base, runs);
    const cleaned = tidyRuns(runs);
    if (cleaned.every((r) => (typeof r === "string" ? r : r[0]).trim() === "")) {
      // An empty paragraph the writer typed — unless it only carries a break or an image.
      if (!layout && level === null) blocks.push({ kind: "paragraph", runs: [], blank: "line" });
      return;
    }
    if (child(pPr, "w:numPr") && level === null) count("list");
    if (level !== null) blocks.push({ kind: "heading", level, runs: cleaned });
    else blocks.push({ kind: "paragraph", runs: cleaned });
  }

  function block(el: XmlElement) {
    for (const c of el.children) {
      if (typeof c === "string") continue;
      switch (c.name) {
        case "w:p":
          paragraph(c);
          break;
        case "w:tbl":
          count("table");
          for (const tr of elements(c, "w:tr")) for (const tc of elements(tr, "w:tc")) block(tc);
          break;
        case "w:sdt":
          block(child(c, "w:sdtContent") ?? c);
          break;
        case "w:customXml":
          block(c);
          break;
        case "mc:AlternateContent":
          count("textbox");
          break;
        default:
          break; // w:sectPr, bookmarks
      }
    }
  }

  block(body);

  let suggestedTitle: string | null = null;
  const core = await zip.text("docProps/core.xml").catch(() => null);
  if (core) {
    try {
      const title = child(parseXml(core), "dc:title");
      suggestedTitle = title ? textContent(title).trim() || null : null;
    } catch {
      // A damaged properties part only loses the suggestion.
    }
  }

  return { format: "docx", blocks, notices: noticesFrom(counts), suggestedTitle };
}

/**
 * A paragraph's leading tabs are indentation (layout), and a tab inside the
 * text reads as a space; everything else is kept exactly. Adjacent runs with
 * the same marks are merged.
 */
export function tidyRuns(runs: Run[]): Run[] {
  const out: Run[] = [];
  let leading = true;
  for (const r of runs) {
    const marks = typeof r === "string" ? 0 : r[1];
    let text = typeof r === "string" ? r : r[0];
    if (leading) {
      text = text.replace(/^\t+/, "");
      if (text) leading = false;
    }
    text = text.replace(/\t/g, " ");
    if (!text) continue;
    const prev = out[out.length - 1];
    const prevMarks = prev === undefined ? -1 : typeof prev === "string" ? 0 : prev[1];
    if (prev !== undefined && prevMarks === marks) {
      out[out.length - 1] = marks ? [(prev as [string, number])[0] + text, marks] : (prev as string) + text;
    } else {
      out.push(marks ? [text, marks] : text);
    }
  }
  return out;
}
