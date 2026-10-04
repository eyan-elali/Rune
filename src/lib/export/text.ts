import type { ExportDocument } from "./plan";
import { LINE_BREAK, type ProseBlock, type Segment } from "./prose";

// ExportDocument → plain text (UTF-8). No formatting survives in plain text,
// so marks keep their text and nothing else; everything else is layout a
// reader (and Rune's own text import) understands:
//   * one blank line between paragraphs; an intentional empty paragraph adds
//     exactly one more, so it can be told apart from the separator;
//   * a line break inside a paragraph is a line break;
//   * headings on lines of their own (a new page's heading after extra blank
//     lines); Scene breaks as "* * *";
//   * quotes indented, list items "•" / "1.", code blocks as written.
// A link keeps its text; its address has no place in plain prose.

type Item = { text: string; before?: number } | "blank";

function plain(segments: Segment[]): string {
  return segments.map((s) => (s.text === LINE_BREAK ? "\n" : s.text)).join("");
}

function indent(text: string, first: string, rest: string): string {
  return text
    .split("\n")
    .map((line, i) => (line ? (i === 0 ? first : rest) + line : line))
    .join("\n");
}

function items(list: ProseBlock[]): Item[] {
  const out: Item[] = [];
  for (const b of list) {
    switch (b.kind) {
      case "paragraph": {
        const text = plain(b.segments);
        out.push(text.trim() === "" ? "blank" : { text });
        break;
      }
      case "heading":
        out.push({ text: plain(b.segments).replace(/\n/g, " ") });
        break;
      case "quote":
        for (const item of items(b.blocks)) out.push(item === "blank" ? item : { ...item, text: indent(item.text, "    ", "    ") });
        break;
      case "list": {
        const lines = b.items.map((item, i) => {
          const marker = b.ordered ? `${b.start + i}. ` : "• ";
          const body = items(item)
            .filter((x): x is Exclude<Item, "blank"> => x !== "blank")
            .map((x) => x.text)
            .join("\n");
          return indent(body || "", marker, " ".repeat(marker.length));
        });
        out.push({ text: lines.join("\n") });
        break;
      }
      case "code":
        out.push({ text: b.text });
        break;
      case "rule":
        out.push({ text: "---" });
        break;
    }
  }
  return out;
}

/** The document as plain text. */
export function renderText(doc: ExportDocument): string {
  const all: Item[] = [];
  for (const block of doc.blocks) {
    switch (block.kind) {
      case "title":
        all.push({ text: block.text });
        break;
      case "heading":
        all.push({ text: block.text, before: block.newPage ? 2 : 0 });
        break;
      case "sceneBreak":
        all.push({ text: "* * *" });
        break;
      case "prose":
        all.push(...items(block.blocks));
        break;
    }
  }
  let out = "";
  let blanks = 0;
  for (const item of all) {
    if (item === "blank") {
      blanks += 1;
      continue;
    }
    // Blank paragraphs at a heading are spacing, not prose: a heading only takes its own.
    if (out) out += "\n\n" + "\n".repeat(item.before ?? blanks);
    out += item.text.replace(/[ \t]+$/gm, "");
    blanks = 0;
  }
  return out + "\n";
}
