import { isStructureLine } from "./structure";
import { runsText, type ImportBlock } from "./types";

// Intentional blank paragraphs (Milestone 15 fidelity check). A reader emits
// every blank line (TXT) or empty paragraph (DOCX) as a "line" blank; this
// decides which of them are the writer's own empty paragraphs:
//
//   * a file whose blank lines separate most of its paragraphs (more than
//     half of the gaps between two prose paragraphs) uses ONE blank as its
//     paragraph separator: each run of blanks keeps all but one;
//   * otherwise paragraphs sit directly after each other, and every blank
//     is an intentional empty paragraph;
//   * blanks at the very start or end of the file are dropped.
//
// Kept blanks become empty paragraphs (runs []). They are never Scene breaks
// (only an explicit marker line is), and buildPlan drops those at the edge
// of a Scene or next to a heading or Scene break, so spacing around structure
// never turns into prose.

const isLineBlank = (b: ImportBlock) => b.kind === "paragraph" && b.blank === "line";

function isProse(b: ImportBlock | undefined): boolean {
  return b !== undefined && b.kind === "paragraph" && !b.blank && !isStructureLine(runsText(b.runs));
}

export function resolveBlankParagraphs(blocks: ImportBlock[]): ImportBlock[] {
  // Gaps between two prose paragraphs: how many, and how many hold a blank.
  let gaps = 0;
  let blankGaps = 0;
  let prev: ImportBlock | undefined;
  let blanks = 0;
  for (const b of blocks) {
    if (isLineBlank(b)) {
      blanks += 1;
      continue;
    }
    if (isProse(prev) && isProse(b)) {
      gaps += 1;
      if (blanks > 0) blankGaps += 1;
    }
    prev = b;
    blanks = 0;
  }
  const separator = gaps > 0 && blankGaps / gaps > 0.5 ? 1 : 0;

  const out: ImportBlock[] = [];
  let run = 0;
  for (const b of blocks) {
    if (isLineBlank(b)) {
      run += 1;
      continue;
    }
    if (out.length > 0) {
      for (let i = 0; i < run - separator; i++) out.push({ kind: "paragraph", runs: [], blank: "explicit" });
    }
    run = 0;
    out.push(b);
  }
  return out;
}
