import { MARK, type ImportBlock, type ImportNotice, type ParsedFile, type Run } from "./types";

// Markdown → blocks. What a manuscript uses: ATX headings ("#" … "######") and
// "===" underlined headings, paragraphs (a blank line ends one; a single
// newline is a space, as Markdown reads it; two trailing spaces or a trailing
// backslash is a line break), block quotes, bold / italic / strikethrough,
// and thematic breaks ("***", "* * *", "---", "___") and a lone "#", which
// structure detection treats as explicit Scene breaks.
//
// Deliberately NOT CommonMark's "---" underline heading: in a manuscript a
// "---" line is a Scene break far more often, and reading it as a heading
// would turn a paragraph of prose into a title. Lists and code blocks keep
// their text exactly (markers included) as ordinary paragraphs. Link text is
// kept (the address is not); images are left out and reported.
//
// Blank lines only separate paragraphs, as Markdown defines them (so three
// blank lines read as one); an intentional empty paragraph is written as a
// line holding only "&nbsp;" or "<br>", and is kept as one.

const ESCAPABLE = "\\`*_{}[]()#+-.!~>|";
// Escaped characters become private-use placeholders while emphasis is matched.
const PUA = 0xe000;

function protect(s: string): string {
  return s.replace(/\\(.)/g, (whole, c: string) =>
    ESCAPABLE.includes(c) ? String.fromCharCode(PUA + c.charCodeAt(0)) : whole
  );
}
function restore(s: string): string {
  return s.replace(/[-]/g, (c) => String.fromCharCode(c.charCodeAt(0) - PUA));
}

const EMPHASIS: [RegExp, number][] = [
  [/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/, MARK.bold | MARK.italic],
  [/\*\*(?=\S)([\s\S]*?\S)\*\*/, MARK.bold],
  [/(?<![A-Za-z0-9])__(?=\S)([\s\S]*?\S)__(?![A-Za-z0-9])/, MARK.bold],
  [/~~(?=\S)([\s\S]*?\S)~~/, MARK.strike],
  [/\*(?=[^\s*])([\s\S]*?[^\s*])\*/, MARK.italic],
  [/(?<![A-Za-z0-9])_(?=[^\s_])([\s\S]*?[^\s_])_(?![A-Za-z0-9])/, MARK.italic],
];

/** Inline Markdown → runs. Unmatched delimiters stay as written. */
export function parseInline(source: string, counts: Record<string, number> = {}): Run[] {
  let s = protect(source);
  // Images are not prose: left out, and reported.
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, () => {
    counts.image = (counts.image ?? 0) + 1;
    return "";
  });
  // A link keeps its text.
  s = s.replace(/\[([^\]]+)\]\((?:[^()]|\([^)]*\))*\)/g, "$1");
  const runs: Run[] = [];
  const emit = (text: string, marks: number) => {
    if (!text) return;
    const t = restore(text);
    const prev = runs[runs.length - 1];
    const prevMarks = prev === undefined ? -1 : typeof prev === "string" ? 0 : prev[1];
    if (prev !== undefined && prevMarks === marks) {
      runs[runs.length - 1] = marks ? [(prev as [string, number])[0] + t, marks] : (prev as string) + t;
    } else runs.push(marks ? [t, marks] : t);
  };
  const walk = (text: string, marks: number) => {
    while (text) {
      let best: { at: number; len: number; inner: string; mark: number } | null = null;
      for (const [re, mark] of EMPHASIS) {
        const m = re.exec(text);
        if (m && (best === null || m.index < best.at)) best = { at: m.index, len: m[0].length, inner: m[1], mark };
      }
      if (!best) {
        emit(text, marks);
        return;
      }
      emit(text.slice(0, best.at), marks);
      walk(best.inner, marks | best.mark);
      text = text.slice(best.at + best.len);
    }
  };
  walk(s, 0);
  return runs;
}

const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const THEMATIC = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const SETEXT_1 = /^ {0,3}=+[ \t]*$/;
const QUOTE = /^ {0,3}> ?(.*)$/;
const LIST = /^ {0,3}(?:[-*+]|\d{1,9}[.)])[ \t]+\S/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const EXPLICIT_BLANK = /^ {0,3}(?:&nbsp;|&#160;|&#xa0;|\u00a0|<br\s*\/?>)[ \t]*$/i;

export function parseMarkdown(source: string): ParsedFile {
  const lines = source.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
  const blocks: ImportBlock[] = [];
  const counts: Record<string, number> = {};
  let para: string[] = [];
  let quote = false;

  const flush = () => {
    if (!para.length) return;
    let text = "";
    para.forEach((line, i) => {
      if (i === para.length - 1) {
        text += line.trim();
        return;
      }
      const hard = /( {2,}|\\)$/.test(line);
      text += line.replace(/( {2,}|\\)$/, "").trim() + (hard ? "\n" : " ");
    });
    const runs = parseInline(text, counts);
    if (runs.length) blocks.push(quote ? { kind: "paragraph", runs, quote: true } : { kind: "paragraph", runs });
    para = [];
    quote = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = FENCE.exec(line);
    if (fence) {
      // A code block: every line kept exactly as its own paragraph.
      flush();
      counts.code = (counts.code ?? 0) + 1;
      for (i = i + 1; i < lines.length && !lines[i].trim().startsWith(fence[1]); i++) {
        if (lines[i].trim()) blocks.push({ kind: "paragraph", runs: [lines[i]] });
      }
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    if (EXPLICIT_BLANK.test(line) && para.length === 0) {
      blocks.push({ kind: "paragraph", runs: [], blank: "explicit" });
      continue;
    }
    const atx = ATX.exec(line);
    if (atx) {
      flush();
      const text = (atx[2] ?? "").trim();
      // A lone "#" is a Scene-break marker, not an empty heading.
      if (!text) blocks.push({ kind: "paragraph", runs: [atx[1]] });
      else blocks.push({ kind: "heading", level: atx[1].length, runs: parseInline(text, counts) });
      continue;
    }
    if (THEMATIC.test(line)) {
      flush();
      blocks.push({ kind: "paragraph", runs: [line.trim()] });
      continue;
    }
    if (para.length === 1 && !quote && SETEXT_1.test(line)) {
      const runs = parseInline(para[0].trim(), counts);
      para = [];
      if (runs.length) blocks.push({ kind: "heading", level: 1, runs });
      continue;
    }
    const q = QUOTE.exec(line);
    if (q) {
      if (!quote) flush();
      quote = true;
      if (!q[1].trim()) {
        flush();
        quote = true;
        continue;
      }
      para.push(q[1]);
      continue;
    }
    if (quote) flush();
    if (LIST.test(line)) {
      // A list item keeps its marker as written, one paragraph per item.
      flush();
      counts.list = (counts.list ?? 0) + 1;
      blocks.push({ kind: "paragraph", runs: parseInline(line.trim(), counts) });
      continue;
    }
    para.push(line);
  }
  flush();

  const notices: ImportNotice[] = [];
  if (counts.image) notices.push({ code: "image", message: `${counts.image} image${counts.image === 1 ? " was" : "s were"} left out; images can’t be imported.` });
  if (counts.list) notices.push({ code: "list", message: `${counts.list} list item${counts.list === 1 ? " is" : "s are"} imported as ordinary paragraphs, markers included.` });
  if (counts.code) notices.push({ code: "code", message: `${counts.code} code block${counts.code === 1 ? " is" : "s are"} imported line by line as ordinary paragraphs.` });
  return { format: "md", blocks, notices, suggestedTitle: null };
}
