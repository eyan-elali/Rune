// Manuscript prose as the export renderers read it: the Scene editor's stored
// form (TipTap JSON from StarterKit — paragraph, heading 1–3, blockquote,
// bullet and ordered lists, code block, horizontal rule, hard break; marks
// bold, italic, underline, strike, code, link) walked into blocks and inline
// segments. Nothing here invents formatting: a node or mark Rune doesn't know
// keeps its text, as plain text, and is never dropped.

export type TNode = {
  type: string;
  content?: TNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  attrs?: Record<string, unknown>;
};

/** One run of text with the marks every format may represent. */
export type Segment = {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  code: boolean;
  /** A link's address (http, https or mailto only), or null. */
  href: string | null;
};

/** A hard line break inside a paragraph. */
export const LINE_BREAK = "\n";

const SAFE_HREF = /^(https?:|mailto:)/i;

function segmentOf(node: TNode): Segment {
  const has = (t: string) => node.marks?.some((m) => m.type === t) ?? false;
  const link = node.marks?.find((m) => m.type === "link");
  const href = typeof link?.attrs?.href === "string" && SAFE_HREF.test(link.attrs.href) ? link.attrs.href : null;
  return {
    text: node.text ?? "",
    bold: has("bold"),
    italic: has("italic"),
    underline: has("underline"),
    strike: has("strike"),
    code: has("code"),
    href,
  };
}

const PLAIN: Omit<Segment, "text"> = { bold: false, italic: false, underline: false, strike: false, code: false, href: null };

/**
 * A text block's inline content as segments, in order; a hard break is a
 * segment whose text is exactly LINE_BREAK. Adjacent runs with the same marks
 * are joined (the editor may split them). An inline node Rune doesn't know
 * keeps its text.
 */
export function segmentsOf(node: TNode): Segment[] {
  const out: Segment[] = [];
  const push = (seg: Segment) => {
    if (seg.text === "") return;
    const prev = out[out.length - 1];
    if (prev && prev.text !== LINE_BREAK && seg.text !== LINE_BREAK && sameMarks(prev, seg)) prev.text += seg.text;
    else out.push({ ...seg });
  };
  const walk = (n: TNode) => {
    if (n.type === "text") push(segmentOf(n));
    else if (n.type === "hardBreak") push({ ...PLAIN, text: LINE_BREAK });
    else for (const c of n.content ?? []) walk(c);
  };
  for (const c of node.content ?? []) walk(c);
  return out;
}

export function sameMarks(a: Omit<Segment, "text">, b: Omit<Segment, "text">): boolean {
  return (
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.strike === b.strike &&
    a.code === b.code &&
    a.href === b.href
  );
}

/** Plain text of a node (hard breaks as "\n"). */
export function plainText(node: TNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return LINE_BREAK;
  return (node.content ?? []).map(plainText).join("");
}

/** Whether a document or node has any visible text. */
export function hasText(node: TNode | null | undefined): boolean {
  if (!node) return false;
  if (node.type === "text") return (node.text ?? "").trim().length > 0;
  return (node.content ?? []).some(hasText);
}

/**
 * Prose blocks, flattened for renderers. A list item holds its own blocks
 * (usually one paragraph; nested lists inside it), so lists stay a tree.
 */
export type ProseBlock =
  | { kind: "paragraph"; segments: Segment[] }
  | { kind: "heading"; level: number; segments: Segment[] }
  | { kind: "quote"; blocks: ProseBlock[] }
  | { kind: "list"; ordered: boolean; start: number; items: ProseBlock[][] }
  | { kind: "code"; text: string }
  | { kind: "rule" };

/** A Scene's (or any TipTap document's) top-level nodes → prose blocks. */
export function proseBlocks(nodes: readonly TNode[]): ProseBlock[] {
  const out: ProseBlock[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case "paragraph":
        out.push({ kind: "paragraph", segments: segmentsOf(node) });
        break;
      case "heading": {
        const level = Number(node.attrs?.level);
        out.push({ kind: "heading", level: level >= 1 && level <= 6 ? level : 1, segments: segmentsOf(node) });
        break;
      }
      case "blockquote":
        out.push({ kind: "quote", blocks: proseBlocks(node.content ?? []) });
        break;
      case "bulletList":
      case "orderedList": {
        const start = Number(node.attrs?.start);
        out.push({
          kind: "list",
          ordered: node.type === "orderedList",
          start: Number.isFinite(start) && start >= 0 ? Math.floor(start) : 1,
          items: (node.content ?? []).map((item) =>
            item.type === "listItem" ? proseBlocks(item.content ?? []) : proseBlocks([item])
          ),
        });
        break;
      }
      case "codeBlock":
        out.push({ kind: "code", text: plainText(node) });
        break;
      case "horizontalRule":
        out.push({ kind: "rule" });
        break;
      case "text":
      case "hardBreak":
        // Inline content at block level (never written by the editor): kept as a paragraph.
        out.push({ kind: "paragraph", segments: segmentsOf({ type: "paragraph", content: [node] }) });
        break;
      default:
        // A block Rune doesn't know: its children, so no text is lost.
        if (node.content?.length) {
          const inner = proseBlocks(node.content);
          if (inner.length) out.push(...inner);
          else out.push({ kind: "paragraph", segments: segmentsOf(node) });
        }
    }
  }
  return out;
}

/** Every character of some text, by code point (a surrogate pair is one). */
export function codePoints(text: string): string[] {
  return Array.from(text);
}

/** Characters XML 1.0 can't hold (controls other than tab/newline, lone surrogates, U+FFFE/F). */
const XML_INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function xmlSafe(text: string): string {
  return text.replace(XML_INVALID, "");
}

export function escapeXml(text: string): string {
  return xmlSafe(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
