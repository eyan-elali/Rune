import { MARK, type ImportParagraph, type Run } from "./types";

// Imported paragraphs → the manuscript editor's stored form (TipTap JSON:
// the StarterKit nodes paragraph, blockquote, text and hardBreak, and the
// marks bold, italic, underline and strike), and the word count the editor
// itself would give that document. Pure; used by the server on confirmation
// and by the preview for its approximate counts.

type TextNode = { type: "text"; text: string; marks?: { type: string }[] };
type InlineNode = TextNode | { type: "hardBreak" };
type ParagraphNode = { type: "paragraph"; content?: InlineNode[] };
type BlockNode = ParagraphNode | { type: "blockquote"; content: ParagraphNode[] };
export type SceneDoc = { type: "doc"; content: BlockNode[] };

const MARK_ORDER: [number, string][] = [
  [MARK.bold, "bold"],
  [MARK.italic, "italic"],
  [MARK.underline, "underline"],
  [MARK.strike, "strike"],
];

function inline(runs: Run[]): InlineNode[] {
  const out: InlineNode[] = [];
  for (const run of runs) {
    const [text, flags] = typeof run === "string" ? [run, 0] : run;
    const marks = MARK_ORDER.filter(([bit]) => flags & bit).map(([, type]) => ({ type }));
    text.split("\n").forEach((part, i) => {
      if (i > 0) out.push({ type: "hardBreak" });
      if (part === "") return;
      // Adjacent runs with the same marks read as one text node, as the editor stores them.
      const prev = out[out.length - 1];
      if (prev?.type === "text" && JSON.stringify(prev.marks ?? []) === JSON.stringify(marks)) {
        prev.text += part;
      } else {
        out.push(marks.length ? { type: "text", text: part, marks } : { type: "text", text: part });
      }
    });
  }
  return out;
}

function paragraphNode(runs: Run[]): ParagraphNode {
  const content = inline(runs);
  return content.length ? { type: "paragraph", content } : { type: "paragraph" };
}

/** A Scene's paragraphs as a TipTap document. No paragraphs: one empty paragraph, as a new Scene has. */
export function sceneDocument(paragraphs: ImportParagraph[]): SceneDoc {
  const content: BlockNode[] = [];
  for (const p of paragraphs) {
    if (Array.isArray(p)) {
      content.push(paragraphNode(p));
    } else {
      // Consecutive quote paragraphs share one blockquote.
      const prev = content[content.length - 1];
      if (prev?.type === "blockquote") prev.content.push(paragraphNode(p.q));
      else content.push({ type: "blockquote", content: [paragraphNode(p.q)] });
    }
  }
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

/**
 * Words in some text exactly as the manuscript editor counts them
 * (useSceneEditor's countWords: the document's text with a space between
 * blocks and for each line break, split on " ", empty tokens dropped).
 */
export function countTextWords(text: string): number {
  let n = 0;
  for (const token of text.replace(/\n/g, " ").split(" ")) if (token !== "") n += 1;
  return n;
}

function runsWords(runs: Run[]): number {
  let text = "";
  for (const r of runs) text += typeof r === "string" ? r : r[0];
  return countTextWords(text);
}

/** The editor's word count of these paragraphs (equal to counting sceneDocument(paragraphs)). */
export function paragraphsWordCount(paragraphs: ImportParagraph[]): number {
  let n = 0;
  for (const p of paragraphs) n += runsWords(Array.isArray(p) ? p : p.q);
  return n;
}
