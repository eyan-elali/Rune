import type { ExportDocument } from "./plan";
import { LINE_BREAK, type ProseBlock, type Segment } from "./prose";

// ExportDocument → Markdown (CommonMark, with GitHub's ~~strikethrough~~),
// written to read cleanly as text and to come back through Rune's own
// Markdown import:
//   * the title is "# Title"; Group and Chapter headings follow by outline
//     depth ("## Part One", "### Chapter 1"; "## Chapter 1" with no Groups);
//   * **bold**, *italic*, ~~strike~~, `code`, [links](https://…); underline
//     has no Markdown form, so its text is kept plain;
//   * a line break is a trailing backslash; an intentional empty paragraph is
//     a line holding only "&nbsp;" (Markdown itself would collapse it);
//   * Scene breaks are "* * *"; quotes "> ", lists "- " / "1. ", code blocks
//     fenced; characters Markdown would read as syntax are escaped. Leading
//     indentation and trailing spaces are layout, and are not kept.

export const BLANK_PARAGRAPH = "&nbsp;";

type Delim = "**" | "*" | "~~";

function delimsOf(seg: Segment): Delim[] {
  const d: Delim[] = [];
  if (seg.bold) d.push("**");
  if (seg.italic) d.push("*");
  if (seg.strike) d.push("~~");
  return d;
}

/** Escapes what Markdown would otherwise read as inline syntax. */
function escapeInline(text: string): string {
  return text
    .replace(/[\\`*_~[\]]/g, (c) => `\\${c}`)
    .replace(/<(?=[A-Za-z/!?])/g, "\\<")
    .replace(/&(?=#?[A-Za-z0-9]+;)/g, "\\&");
}

/** Escapes what would start a block at the beginning of a line. */
function escapeLineStart(line: string): string {
  return line
    .replace(/^(#{1,6})(?=\s|$)/, (m) => `\\${m}`)
    .replace(/^([>+-])(?=\s|$)/, "\\$1")
    .replace(/^(\d{1,9})([.)])(?=\s|$)/, "$1\\$2")
    .replace(/^(=+|-+)\s*$/, (m) => `\\${m}`);
}

/** A link address as a Markdown destination: spaces and parentheses percent-encoded. */
function linkTarget(href: string): string {
  return href.replace(/[()\s]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
}

function codeSpan(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((r) => r.length));
  const fence = "`".repeat(longest + 1);
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return `${fence}${pad}${text}${pad}${fence}`;
}

/**
 * One line of inline segments (no line breaks). Emphasis delimiters open and
 * close only where the marks change, and never against whitespace (which
 * CommonMark would not read as emphasis): surrounding spaces move outside.
 */
function inlineLine(segments: Segment[]): string {
  let out = "";
  let open: Delim[] = [];
  let pending = "";
  let i = 0;
  while (i < segments.length) {
    const seg = segments[i];
    // A link wraps its consecutive runs; emphasis is closed around it.
    if (seg.href) {
      let j = i;
      while (j < segments.length && segments[j].href === seg.href) j++;
      const inner = inlineLine(segments.slice(i, j).map((s) => ({ ...s, href: null })));
      out += [...open].reverse().join("") + pending;
      open = [];
      pending = "";
      const lead = inner.match(/^\s*/)![0];
      const trail = inner.slice(lead.length).match(/\s*$/)![0];
      const core = inner.slice(lead.length, inner.length - trail.length);
      out += core ? `${lead}[${core}](${linkTarget(seg.href)})` : inner;
      pending = core ? trail : "";
      i = j;
      continue;
    }
    const text = seg.text;
    const lead = text.match(/^\s*/)![0];
    const core = text.slice(lead.length).replace(/\s+$/, "");
    if (!core) {
      pending += text;
      i++;
      continue;
    }
    const trail = text.slice(lead.length + core.length);
    const want = delimsOf(seg);
    let k = 0;
    while (k < open.length && k < want.length && open[k] === want[k]) k++;
    out += open.slice(k).reverse().join("");
    out += pending + lead;
    out += want.slice(k).join("");
    open = want;
    out += seg.code ? codeSpan(core) : escapeInline(core);
    pending = trail;
    i++;
  }
  out += [...open].reverse().join("") + pending;
  return out;
}

/** A paragraph's segments → Markdown lines (a line break is a trailing backslash). */
function inline(segments: Segment[]): string {
  const lines: Segment[][] = [[]];
  for (const s of segments) {
    if (s.text === LINE_BREAK) lines.push([]);
    else lines[lines.length - 1].push(s);
  }
  return lines
    .map((line) => escapeLineStart(inlineLine(line).replace(/^[ \t]+/, "").replace(/[ \t]+$/, "")))
    .join("\\\n");
}

function prefixLines(text: string, first: string, rest: string): string {
  return text
    .split("\n")
    .map((line, i) => (line === "" ? (i === 0 ? first.trimEnd() : rest.trimEnd()) : (i === 0 ? first : rest) + line))
    .join("\n");
}

function blocks(list: ProseBlock[], headingBase: number): string[] {
  return list.map((b) => {
    switch (b.kind) {
      case "paragraph":
        return b.segments.length === 0 ? BLANK_PARAGRAPH : inline(b.segments) || BLANK_PARAGRAPH;
      case "heading":
        return `${"#".repeat(Math.min(6, headingBase + b.level))} ${inline(b.segments).replace(/\\\n/g, " ")}`;
      case "quote":
        return prefixLines(blocks(b.blocks, headingBase).join("\n\n"), "> ", "> ");
      case "list":
        return b.items
          .map((item, i) => {
            const marker = b.ordered ? `${b.start + i}. ` : "- ";
            const body = blocks(item, headingBase).join("\n\n") || "";
            return prefixLines(body, marker, " ".repeat(marker.length));
          })
          .join("\n");
      case "code": {
        const longest = Math.max(2, ...(b.text.match(/`+/g) ?? []).map((r) => r.length));
        const fence = "`".repeat(longest + 1);
        return `${fence}\n${b.text}\n${fence}`;
      }
      case "rule":
        return "---";
    }
  });
}

/** The document as Markdown text. */
export function renderMarkdown(doc: ExportDocument): string {
  const titled = doc.blocks[0]?.kind === "title";
  const shift = titled ? 1 : 0;
  const out: string[] = [];
  for (const block of doc.blocks) {
    switch (block.kind) {
      case "title":
        out.push(`# ${escapeInline(block.text)}`);
        break;
      case "heading":
        out.push(`${"#".repeat(Math.min(6, block.level + shift))} ${escapeInline(block.text)}`);
        break;
      case "sceneBreak":
        out.push("* * *");
        break;
      case "prose":
        out.push(...blocks(block.blocks, block.headingBase + shift));
        break;
    }
  }
  return out.join("\n\n") + "\n";
}
