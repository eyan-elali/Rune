// Manuscript Import (Rune 2.0, Milestone 15): the shapes shared by the file
// readers (docx.ts, markdown.ts, text.ts), structure detection (structure.ts)
// and the server-side builder (content.ts).
//
// A reader turns a file into a flat list of blocks, in document order, and
// says what it could not carry over. It never decides structure: that is
// structure.ts, which the writer can correct in the preview. Nothing here
// touches the database.

/** Inline formatting Rune's manuscript editor supports. */
export const MARK = { bold: 1, italic: 2, underline: 4, strike: 8 } as const;

/**
 * One run of text with the same formatting: a plain string, or [text, marks]
 * (a sum of MARK flags). "\n" inside a run is a line break within the
 * paragraph (a TipTap hardBreak), never a new paragraph.
 */
export type Run = string | [string, number];

export type ImportBlock =
  /** A heading in the source (DOCX heading/title style, Markdown "#"). level 1 = outermost. */
  | { kind: "heading"; level: number; runs: Run[] }
  /**
   * Ordinary prose. `quote`: a Markdown block quote (kept as a quote).
   * `blank`: an empty paragraph (runs []). "line" — a blank line / empty
   * paragraph as it appears in the file, before resolveBlankParagraphs
   * decides whether it separates paragraphs or is an intentional blank;
   * "explicit" — a blank the file spells out (Markdown "&nbsp;"), always kept.
   */
  | { kind: "paragraph"; runs: Run[]; quote?: boolean; blank?: "line" | "explicit" };

/** Something in the file that could not be carried over exactly. Never prose silently dropped. */
export type ImportNotice = { code: string; message: string };

export type ParsedFile = {
  format: "docx" | "md" | "txt";
  blocks: ImportBlock[];
  notices: ImportNotice[];
  /** A title the file itself suggests (DOCX title property, a lone leading "# Title"). */
  suggestedTitle: string | null;
};

// ── The payload sent on confirmation ──────────────────────────────────────

/** One Scene: its paragraphs. Each paragraph is its runs; `q` marks a quote. */
export type ImportParagraph = Run[] | { q: Run[] };

export type ImportScenePayload = { title: string | null; paragraphs: ImportParagraph[] };

export type ImportItemPayload =
  | { kind: "group"; title: string | null; items: ImportItemPayload[] }
  | { kind: "chapter"; title: string; scenes: ImportScenePayload[] };

/** What the writer confirmed: a new Project's whole manuscript. */
export type ImportPayload = {
  title: string;
  items: ImportItemPayload[];
  unplaced: ImportScenePayload[];
};

/** Plain text of some runs, as written. */
export function runsText(runs: Run[]): string {
  let out = "";
  for (const r of runs) out += typeof r === "string" ? r : r[0];
  return out;
}
