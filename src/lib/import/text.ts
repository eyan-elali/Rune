import { isStructureLine } from "./structure";
import type { ImportBlock, ImportNotice, ParsedFile } from "./types";

// Plain text → blocks. Plain text has no markup, so every block is a
// paragraph; structure (Chapter and Part headings, Scene breaks) is detected
// later, conservatively, from the words themselves.
//
// Paragraphs: most manuscripts saved as text put each paragraph on one line
// (with or without blank lines between them), and each line becomes a
// paragraph. A HARD-WRAPPED file (every line broken at a fixed width, blank
// lines between paragraphs) would then fall apart into fragments, so when a
// file is clearly hard-wrapped, the lines of each blank-line-separated block
// are joined with a space, and the preview says so. `keepLineBreaks` keeps
// every line break instead (as a line break inside the paragraph). Leading
// indentation and trailing spaces are layout and are not kept. Every blank
// line is reported as one; resolveBlankParagraphs decides which are
// separators and which are intentional empty paragraphs.

export type TextOptions = { keepLineBreaks?: boolean };

function hardWrapWidth(blocks: string[][]): number | null {
  const multi = blocks.filter((b) => b.length >= 2);
  if (multi.length < 3 || multi.length < blocks.length * 0.3) return null;
  let max = 0;
  let wrappedLines = 0;
  let lines = 0;
  for (const b of multi) {
    for (let i = 0; i < b.length - 1; i++) {
      lines += 1;
      max = Math.max(max, b[i].length);
      // A wrapped line runs close to the width; a short line inside a block is a real break.
      if (b[i].length >= 40) wrappedLines += 1;
    }
  }
  return max <= 100 && wrappedLines >= lines * 0.8 ? max : null;
}

export function parseText(source: string, options: TextOptions = {}): ParsedFile & { hardWrapped: boolean } {
  const lines = source
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+$/, "").replace(/^[ \t　]+/, ""));
  const blocks: string[][] = [];
  // How many blank lines come before each block.
  const blanksBefore: number[] = [];
  let current: string[] = [];
  let blanks = 0;
  for (const line of lines) {
    if (line === "") {
      if (current.length) {
        blocks.push(current);
        blanksBefore.push(blanks);
        blanks = 0;
      }
      current = [];
      blanks += 1;
    } else current.push(line);
  }
  if (current.length) {
    blocks.push(current);
    blanksBefore.push(blanks);
  }

  const width = hardWrapWidth(blocks);
  const out: ImportBlock[] = [];
  const notices: ImportNotice[] = [];
  const blankLine: ImportBlock = { kind: "paragraph", runs: [], blank: "line" };
  for (const [i, block] of blocks.entries()) {
    for (let k = 0; k < blanksBefore[i]; k++) out.push(blankLine);
    if (width === null) {
      for (const line of block) out.push({ kind: "paragraph", runs: [line] });
      continue;
    }
    // A heading or Scene break at the top of a block stays its own line.
    let rest = block;
    while (rest.length > 1 && isStructureLine(rest[0])) {
      out.push({ kind: "paragraph", runs: [rest[0]] });
      rest = rest.slice(1);
    }
    out.push({ kind: "paragraph", runs: [rest.join(options.keepLineBreaks ? "\n" : " ")] });
  }
  if (width !== null) {
    notices.push({
      code: "hard_wrapped",
      message: options.keepLineBreaks
        ? `This file wraps its lines at about ${width} characters. Every line break is kept inside its paragraph.`
        : `This file wraps its lines at about ${width} characters, so the lines of each paragraph were joined with a space. Blank lines still separate paragraphs.`,
    });
  }
  return { format: "txt", blocks: out, notices, suggestedTitle: null, hardWrapped: width !== null };
}
