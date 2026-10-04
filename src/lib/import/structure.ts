import { paragraphsWordCount } from "./content";
import {
  runsText,
  type ImportBlock,
  type ImportItemPayload,
  type ImportParagraph,
  type ImportPayload,
  type ImportScenePayload,
  type ParsedFile,
} from "./types";

// Structure detection and the import plan (Rune 2.0, Milestone 15).
//
// Detection is deliberately conservative. It reads the blocks a file reader
// produced and gives each a ROLE:
//
//   title    the document's own title (a Word "Title" paragraph, or a lone
//            leading top-level Markdown heading) — it names the Project and is
//            not prose
//   group    a Manuscript Group: "Part One", "Book III", "Volume 2", "Act I",
//            or a heading at a level above the Chapters' level
//   chapter  "Chapter 7", "Chapter Seven: The Storm", "Prologue", "Epilogue",
//            "Interlude", a heading at the Chapters' level, or a run of bare
//            numbers 1, 2, 3 … (at least three, in order) on lines of their own
//   break    an explicit Scene-break line: "* * *", "***", "#", "~", "⁂",
//            "---" … — the marker itself is not prose
//   text     everything else: prose
//
// A blank line is never a Scene break (readers don't even produce blank
// blocks). Capitalisation alone never makes a heading: an all-caps line, or a
// lone number outside a sequence, is only offered to the writer as a
// POSSIBLE heading in the preview. A heading deeper than the Chapters' level
// stays in the prose.
//
// The writer corrects roles in the preview (overrides); buildPlan() turns
// blocks + roles into Groups → Chapters → Scenes. Prose is never dropped:
//   * text before the first Chapter (when there are Chapters) becomes an
//     Unplaced Scene ("Front matter"); a Group's text before its first Chapter
//     likewise ("<Group> — opening") — real prose, kept out of the ordered
//     manuscript until the writer places it;
//   * with no Chapter at all, the whole text is one Chapter;
//   * a Scene break with no prose on one side creates no empty Scene;
//   * an intentional empty paragraph (see blanks.ts) is kept between two
//     paragraphs of prose, and dropped at the edge of a Scene or next to a
//     heading or Scene break — it is never itself a Scene break.

export type Role = "title" | "group" | "chapter" | "break" | "scene" | "text";

export type Line = {
  index: number;
  block: ImportBlock;
  /** The line's plain text, trimmed. */
  text: string;
  detected: Role;
  /** Nesting rank of a Group line: lower is outer (Book 0 → Part 1). */
  rank: number;
  /** The roles the preview offers for this line. Empty: ordinary prose, not offered. */
  options: Role[];
};

// ── Patterns ────────────────────────────────────────────────────────────────

const WORD_NUMBERS = [
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
  "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety", "hundred",
  "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth",
];
const NUM = `(?:\\d{1,4}|[ivxlcdm]{1,8}|(?:${WORD_NUMBERS.join("|")})(?:[-\\s](?:${WORD_NUMBERS.join("|")}))?)`;
// After the number: nothing, or a separator and a short title that doesn't end a sentence.
const STRICT_TAIL = `\\.?(?:\\s*[:.\\-–—]\\s*[^.,;]{0,60}[^.,;\\s])?`;
const LOOSE_TAIL = `(?:\\b.*)?`;

const GROUP_WORD = "part|book|volume|act";
const CHAPTER_WORD = "chapter|ch\\.?";
const NAMED_CHAPTER = "prologue|epilogue|interlude|afterword|foreword|preface|introduction|coda";

const GROUP_STRICT = new RegExp(`^(${GROUP_WORD})\\s+${NUM}${STRICT_TAIL}$`, "i");
const CHAPTER_STRICT = new RegExp(`^(?:(?:${CHAPTER_WORD})\\s+${NUM}|${NAMED_CHAPTER})${STRICT_TAIL}$`, "i");
const GROUP_LOOSE = new RegExp(`^(${GROUP_WORD})\\s+${NUM}${LOOSE_TAIL}$`, "i");
const CHAPTER_LOOSE = new RegExp(`^(?:(?:${CHAPTER_WORD})\\s+${NUM}|(?:${NAMED_CHAPTER})\\b)${LOOSE_TAIL}$`, "i");

/** An explicit Scene-break line: 1–5 marker symbols, or a rule of dashes / underscores. */
const BREAK = /^(?:(?:[*#~•·◆◇✦✧❖❧§⁂※∗⋆=+][ \t]*){1,5}|[-–—][ \t]*(?:[-–—][ \t]*){2,}|_{3,})$/;
const BARE_NUMBER = /^(\d{1,3}|[IVXLCDM]{1,7})\.?$/;

function romanValue(s: string): number {
  const v: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const a = v[s[i]];
    const b = v[s[i + 1]] ?? 0;
    total += a < b ? -a : a;
  }
  return total;
}

function bareNumber(text: string): number | null {
  const m = BARE_NUMBER.exec(text);
  if (!m) return null;
  return /^\d/.test(m[1]) ? Number(m[1]) : romanValue(m[1]);
}

function groupRank(text: string): number {
  return /^(book|volume)\b/i.test(text) ? 0 : 1;
}

export function isSceneBreak(text: string): boolean {
  return BREAK.test(text.trim());
}

/** Whether a line of plain text would be read as a Group, a Chapter or a Scene break on its own. */
export function isStructureLine(text: string): boolean {
  const t = text.trim();
  return t.length <= 80 && (GROUP_STRICT.test(t) || CHAPTER_STRICT.test(t) || BREAK.test(t));
}

/** A short line that might be a heading the patterns don't recognise: all capitals, or a lone number. */
function possibleHeading(text: string): boolean {
  if (text.length > 60 || text.split(/\s+/).length > 8) return false;
  if (BARE_NUMBER.test(text)) return true;
  const letters = text.replace(/[^\p{L}]/gu, "");
  return letters.length >= 3 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
}

// ── Detection ───────────────────────────────────────────────────────────────

function mostCommon(levels: number[]): number | null {
  const counts = new Map<number, number>();
  for (const l of levels) counts.set(l, (counts.get(l) ?? 0) + 1);
  let best: number | null = null;
  for (const [level, n] of counts) {
    if (best === null || n > counts.get(best)! || (n === counts.get(best)! && level < best)) best = level;
  }
  return best;
}

export function detectLines(parsed: ParsedFile): Line[] {
  const lines: Line[] = parsed.blocks.map((block, index) => ({
    index,
    block,
    text: runsText(block.runs).replace(/\s+/g, " ").trim(),
    detected: "text" as Role,
    rank: 1,
    options: [],
  }));

  const headings = lines.filter((l) => l.block.kind === "heading");
  const levelOf = (l: Line) => (l.block.kind === "heading" ? Math.max(1, l.block.level) : 0);

  // The document's title: a leading Word "Title" paragraph, or a leading
  // top-level heading that is the only one at its level while deeper headings follow.
  const first = lines[0];
  if (first?.block.kind === "heading") {
    const level = first.block.level;
    const deeper = headings.some((h) => h !== first && h.block.kind === "heading" && h.block.level > Math.max(level, 1));
    const alone = !headings.some((h) => h !== first && levelOf(h) <= Math.max(level, 1));
    const patterned = GROUP_LOOSE.test(first.text) || CHAPTER_LOOSE.test(first.text);
    if (level === 0 || (alone && deeper && !patterned)) first.detected = "title";
  }

  // Headings: by their words first, then by level.
  const open = headings.filter((h) => h.detected !== "title");
  for (const h of open) {
    if (GROUP_LOOSE.test(h.text)) {
      h.detected = "group";
      h.rank = groupRank(h.text);
    } else if (CHAPTER_LOOSE.test(h.text)) h.detected = "chapter";
  }
  const chapterLevel =
    mostCommon(open.filter((h) => h.detected === "chapter").map(levelOf)) ??
    mostCommon(open.filter((h) => h.detected === "text" && !open.some((g) => g.detected === "group" && levelOf(g) >= levelOf(h))).map(levelOf));
  for (const h of open) {
    if (h.detected !== "text" || chapterLevel === null) continue;
    const level = levelOf(h);
    if (level === chapterLevel) h.detected = "chapter";
    else if (level < chapterLevel) {
      h.detected = "group";
      h.rank = level - 1;
    }
    // Deeper headings stay prose.
  }

  // Ordinary paragraphs: strict patterns only.
  for (const l of lines) {
    if (l.block.kind !== "paragraph" || l.block.quote) continue;
    if (isSceneBreak(l.text)) l.detected = "break";
    else if (l.text.length <= 80 && GROUP_STRICT.test(l.text)) {
      l.detected = "group";
      l.rank = groupRank(l.text);
    } else if (l.text.length <= 80 && CHAPTER_STRICT.test(l.text)) l.detected = "chapter";
  }

  // Bare numbers 1, 2, 3 … on lines of their own, at least three in order.
  const numbered = lines.filter((l) => l.block.kind === "paragraph" && l.detected === "text" && bareNumber(l.text) !== null);
  const chain: Line[] = [];
  for (const l of numbered) if (bareNumber(l.text) === chain.length + 1) chain.push(l);
  if (chain.length >= 3) for (const l of chain) l.detected = "chapter";

  // Group ranks as nesting depth: Book above Part; heading levels as they are.
  for (const l of lines) {
    if (l.detected === "title") l.options = ["title", "group", "chapter", "text"];
    else if (l.detected === "group" || l.detected === "chapter") l.options = ["group", "chapter", "text"];
    else if (l.detected === "break") l.options = ["break", "text"];
    else if (l.block.kind === "heading" || (l.block.kind === "paragraph" && !l.block.quote && possibleHeading(l.text))) {
      l.options = ["text", "chapter", "group", "scene"];
    }
  }
  return lines;
}

// ── The plan ────────────────────────────────────────────────────────────────

export type Overrides = Readonly<Record<number, { role?: Role; title?: string }>>;

export type PlanScene = {
  /** The line that started it (a break, a "new scene" line, or the Chapter heading); null for the first. */
  startLine: number | null;
  paragraphs: ImportParagraph[];
  /** Lines inside it that are offered as possible structure. */
  candidates: number[];
  words: number;
  /** The first words, for recognising it. */
  excerpt: string;
};
export type PlanChapter = { kind: "chapter"; line: number | null; title: string; scenes: PlanScene[]; words: number };
export type PlanGroup = { kind: "group"; line: number; title: string | null; rank: number; items: PlanItem[]; words: number };
export type PlanItem = PlanGroup | PlanChapter;
export type PlanUnplaced = PlanScene & { title: string };

export type ImportPlan = {
  title: string;
  titleLine: number | null;
  items: PlanItem[];
  unplaced: PlanUnplaced[];
  groups: number;
  chapters: number;
  scenes: number;
  /** Words in the ordered manuscript (placed Scenes). */
  words: number;
  unplacedWords: number;
};

export function roleOf(line: Line, overrides: Overrides): Role {
  const r = overrides[line.index]?.role;
  return r && (r === line.detected || line.options.includes(r)) ? r : line.detected;
}

export function titleOf(line: Line, overrides: Overrides): string {
  const t = overrides[line.index]?.title;
  return (t !== undefined ? t : line.text).trim();
}

function toParagraph(block: ImportBlock): ImportParagraph {
  return block.kind === "paragraph" && block.quote ? { q: block.runs } : block.runs;
}

function newScene(startLine: number | null): PlanScene {
  return { startLine, paragraphs: [], candidates: [], words: 0, excerpt: "" };
}

function finishScene(scene: PlanScene): PlanScene {
  scene.words = paragraphsWordCount(scene.paragraphs);
  const first = scene.paragraphs[0];
  const text = first ? runsText(Array.isArray(first) ? first : first.q) : "";
  scene.excerpt = text.length > 110 ? `${text.slice(0, 110).trimEnd()}…` : text;
  return scene;
}

export function buildPlan(lines: Line[], overrides: Overrides, fallbackTitle: string): ImportPlan {
  const roles = lines.map((l) => roleOf(l, overrides));
  const hasChapter = roles.includes("chapter");

  const items: PlanItem[] = [];
  const unplaced: PlanUnplaced[] = [];
  const groupStack: PlanGroup[] = [];
  let chapter: PlanChapter | null = null;
  let scene: PlanScene | null = null;
  // Prose outside any Chapter, waiting for a home.
  let loose: PlanScene | null = null;
  let looseTitle = "Front matter";
  let titleLine: number | null = null;
  let title: string | null = null;

  const siblings = () => (groupStack.length ? groupStack[groupStack.length - 1].items : items);
  const closeScene = () => {
    if (chapter && scene && scene.paragraphs.length) chapter.scenes.push(finishScene(scene));
    scene = null;
  };
  const closeLoose = () => {
    if (loose && loose.paragraphs.length) {
      if (hasChapter) unplaced.push({ ...finishScene(loose), title: looseTitle });
      else {
        // No Chapters anywhere: this prose is the Chapter.
        const holder: PlanChapter = { kind: "chapter", line: null, title: groupStack.length ? groupStack[groupStack.length - 1].title ?? "Chapter 1" : "Chapter 1", scenes: [], words: 0 };
        holder.scenes.push(finishScene(loose));
        siblings().push(holder);
      }
    }
    loose = null;
  };
  const closeChapter = () => {
    closeScene();
    if (chapter && chapter.scenes.length === 0) chapter.scenes.push(finishScene(newScene(null)));
    chapter = null;
  };

  // Empty paragraphs waiting for the next paragraph of prose in the same Scene.
  let pendingBlanks = 0;

  lines.forEach((line, i) => {
    if (line.block.kind === "paragraph" && line.block.blank) {
      pendingBlanks += 1;
      return;
    }
    const blanks = pendingBlanks;
    pendingBlanks = 0;
    const role = roles[i];
    if (role === "title") {
      if (titleLine === null) {
        titleLine = line.index;
        title ??= titleOf(line, overrides) || null;
        return;
      }
    }
    if (role === "group") {
      closeChapter();
      closeLoose();
      const rank = line.rank;
      while (groupStack.length && groupStack[groupStack.length - 1].rank >= rank) groupStack.pop();
      const group: PlanGroup = { kind: "group", line: line.index, title: titleOf(line, overrides) || null, rank, items: [], words: 0 };
      siblings().push(group);
      groupStack.push(group);
      looseTitle = `${group.title ?? "Untitled group"} — opening`;
      return;
    }
    if (role === "chapter") {
      closeChapter();
      closeLoose();
      chapter = { kind: "chapter", line: line.index, title: titleOf(line, overrides) || "Untitled chapter", scenes: [], words: 0 };
      siblings().push(chapter);
      scene = newScene(null);
      return;
    }
    if (role === "break") {
      if (chapter) {
        closeScene();
        scene = newScene(line.index);
      } else if (loose && loose.paragraphs.length && !hasChapter) {
        // No Chapters: breaks still separate Scenes of the one Chapter.
        closeLoose();
      }
      return;
    }
    if (role === "scene" && chapter) {
      closeScene();
      scene = newScene(line.index);
    }
    // Prose (a "text" line, or a "title" line after the first, or a "scene" line outside a Chapter).
    const target: PlanScene = chapter ? (scene ??= newScene(null)) : (loose ??= newScene(line.index));
    // Kept visible in the preview so a correction can be changed back.
    if (line.options.length) target.candidates.push(line.index);
    if (target.paragraphs.length) for (let b = 0; b < blanks; b++) target.paragraphs.push([]);
    target.paragraphs.push(toParagraph(line.block));
  });
  closeChapter();
  closeLoose();

  // With no Chapters, several loose runs (split by breaks) became several
  // one-Scene Chapters; merge them into ONE Chapter per parent.
  if (!hasChapter) mergeHolders(items);

  let groups = 0;
  let chapters = 0;
  let scenes = 0;
  const total = (list: PlanItem[]): number => {
    let sum = 0;
    for (const it of list) {
      if (it.kind === "group") {
        groups += 1;
        it.words = total(it.items);
      } else {
        chapters += 1;
        scenes += it.scenes.length;
        it.words = it.scenes.reduce((n, s) => n + s.words, 0);
      }
      sum += it.words;
    }
    return sum;
  };
  const words = total(items);
  return {
    title: (title ?? fallbackTitle).slice(0, 200) || "Imported manuscript",
    titleLine,
    items,
    unplaced,
    groups,
    chapters,
    scenes,
    words,
    unplacedWords: unplaced.reduce((n, s) => n + s.words, 0),
  };
}

function mergeHolders(list: PlanItem[]) {
  let holder: PlanChapter | null = null;
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    if (it.kind === "group") {
      holder = null;
      mergeHolders(it.items);
    } else if (it.line === null) {
      if (holder) {
        holder.scenes.push(...it.scenes);
        list.splice(i, 1);
        i -= 1;
      } else holder = it;
    }
  }
}

// ── The payload ────────────────────────────────────────────────────────────

function scenePayload(s: PlanScene, title: string | null = null): ImportScenePayload {
  return { title, paragraphs: s.paragraphs };
}

function itemPayload(it: PlanItem): ImportItemPayload | null {
  if (it.kind === "chapter") return { kind: "chapter", title: it.title, scenes: it.scenes.map((s) => scenePayload(s)) };
  const children = it.items.map(itemPayload).filter((x): x is ImportItemPayload => x !== null);
  return { kind: "group", title: it.title, items: children };
}

/** What is sent on confirmation: exactly the plan the writer saw. */
export function planPayload(plan: ImportPlan, title: string): ImportPayload {
  return {
    title: title.trim() || plan.title,
    items: plan.items.map(itemPayload).filter((x): x is ImportItemPayload => x !== null),
    unplaced: plan.unplaced.map((s) => scenePayload(s, s.title)),
  };
}
