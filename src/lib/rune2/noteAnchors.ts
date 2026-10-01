// Reading anchors (migration 043): a Scene Revision Note made from a passage
// of that Scene while reading remembers the passage — its words, a little of
// what came before and after, where it was, and the Scene version it was
// taken from — so the reader can show it beside the text again. Pure rules,
// shared by the reader, the Revision Notes panel and the tests.
//
// Anchoring is best effort and the note is never lost for it:
//   * the prose carries no mark of any kind — an anchor is a note's own
//     memory of a passage, kept with the note, never with the Scene;
//   * positions are offsets into the Scene's PLAIN text, derived the same way
//     from the stored document (proseText) and from the rendered reading
//     surface (readingAnchors.ts), so an anchor taken from one resolves in the
//     other;
//   * when the Scene is read again, the passage is looked for by its words
//     (locateAnchor): at its old place first, then anywhere in the text, and
//     only where exactly one passage matches — with the saved context deciding
//     between several. Nothing is guessed: a passage that is gone, or that
//     can't be told apart from another, leaves the note unanchored ("stale")
//     with its quoted text intact. It is never attached to the wrong passage.

export type NoteAnchor = {
  /** The passage, as it read when the note was made. */
  text: string;
  /** Up to ANCHOR_CONTEXT characters before and after it. */
  before: string;
  after: string;
  /** Offsets in the Scene's plain text when the note was made. */
  from: number;
  to: number;
  /** The Scene's version then (the prose may have changed since). */
  scene_version: number;
};

/** The longest passage a note may anchor to (revision_notes_anchor_check). */
export const ANCHOR_TEXT_MAX = 2000;
/** How much context is kept on each side. */
export const ANCHOR_CONTEXT = 48;

type ProseNode = { type?: string; text?: string; content?: ProseNode[] };

/** A block that ends a line of the plain text (its text is followed by "\n"). */
const LINE_BLOCKS = new Set(["paragraph", "heading", "codeBlock"]);

/**
 * A Scene's plain text, as anchors measure it: text nodes in order, a line
 * break after every paragraph, heading and code block, and for every hard
 * break. Lists, blockquotes and rules add nothing of their own. The reading
 * surface derives exactly the same text from its rendered elements.
 */
export function proseText(content: unknown): string {
  let out = "";
  const walk = (node: ProseNode) => {
    if (node.type === "text") {
      out += node.text ?? "";
      return;
    }
    if (node.type === "hardBreak") {
      out += "\n";
      return;
    }
    for (const child of node.content ?? []) walk(child);
    if (node.type && LINE_BLOCKS.has(node.type)) out += "\n";
  };
  if (content && typeof content === "object") walk(content as ProseNode);
  return out;
}

/**
 * An anchor for the passage `from`–`to` of `plain` (a Scene at
 * `sceneVersion`): the selection trimmed of surrounding whitespace, with its
 * context. null when nothing with a word in it is selected, or it is too long.
 */
export function makeAnchor(plain: string, from: number, to: number, sceneVersion: number): NoteAnchor | null {
  let start = Math.max(0, Math.min(from, to));
  let end = Math.min(plain.length, Math.max(from, to));
  while (start < end && /\s/.test(plain[start])) start++;
  while (end > start && /\s/.test(plain[end - 1])) end--;
  const text = plain.slice(start, end);
  if (!/\S/.test(text) || text.length > ANCHOR_TEXT_MAX) return null;
  return {
    text,
    before: plain.slice(Math.max(0, start - ANCHOR_CONTEXT), start),
    after: plain.slice(end, end + ANCHOR_CONTEXT),
    from: start,
    to: end,
    scene_version: Math.max(1, Math.floor(sceneVersion)),
  };
}

export type AnchorMatch = { from: number; to: number };

/**
 * Where an anchor's passage is in `plain` now, or null when it can't be found
 * with confidence:
 *   1. still exactly where it was → there;
 *   2. its words occur exactly once → there (the passage moved);
 *   3. several times → the one whose context (before and after, as much of
 *      it as the text allows) matches, if exactly one does;
 *   4. otherwise null — gone, or ambiguous. Never a guess.
 */
export function locateAnchor(plain: string, anchor: NoteAnchor): AnchorMatch | null {
  const { text } = anchor;
  if (!text) return null;
  if (plain.slice(anchor.from, anchor.to) === text) return { from: anchor.from, to: anchor.to };
  const hits: number[] = [];
  for (let at = plain.indexOf(text); at !== -1; at = plain.indexOf(text, at + 1)) {
    hits.push(at);
    if (hits.length > 64) break;
  }
  if (hits.length === 0) return null;
  if (hits.length === 1) return { from: hits[0], to: hits[0] + text.length };
  const contextual = hits.filter((at) => {
    const before = plain.slice(Math.max(0, at - anchor.before.length), at);
    const after = plain.slice(at + text.length, at + text.length + anchor.after.length);
    return before === anchor.before.slice(anchor.before.length - before.length) && after === anchor.after.slice(0, after.length);
  });
  return contextual.length === 1 ? { from: contextual[0], to: contextual[0] + text.length } : null;
}

/** Whether a value has an anchor's shape (what the database accepts). */
export function isNoteAnchor(value: unknown): value is NoteAnchor {
  if (!value || typeof value !== "object") return false;
  const a = value as Record<string, unknown>;
  return (
    typeof a.text === "string" &&
    /\S/.test(a.text) &&
    a.text.length <= ANCHOR_TEXT_MAX &&
    typeof a.before === "string" &&
    typeof a.after === "string" &&
    Number.isInteger(a.from) &&
    Number.isInteger(a.to) &&
    (a.from as number) >= 0 &&
    (a.to as number) > (a.from as number) &&
    Number.isInteger(a.scene_version) &&
    (a.scene_version as number) >= 1
  );
}

/** A passage as the panel quotes it: its first line, shortened. */
export function anchorExcerpt(anchor: NoteAnchor, max = 140): string {
  const line = anchor.text.trim().replace(/\s*\n\s*/g, " ");
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}
