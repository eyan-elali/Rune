import type { CanvasCardSpec, CanvasLineSpec, CanvasSectionSpec } from "../ui/Canvas";

// HOLLOW — a fictional novel, written for Sutura's marketing and nothing
// else. Every word, name and number here is invented and fixed: no account,
// no database, no writer's manuscript is read to make a creative.

export const PROJECT = "HOLLOW";
export const PEN_NAME = "E. Marlowe";

export const CHAPTER_1 = { id: "ch1", title: "Chapter 1", words: 1412 };
export const CHAPTER_2 = { id: "ch2", title: "Chapter 2", words: 2459 };
export const PART_I = { id: "part1", title: "Part I" };
export const UNPLACED_SCENE = { id: "lighthouse", title: "The lighthouse", words: 638 };

/** Chapter 1's prose, as it stands when the creative opens. */
export const CHAPTER_1_PROSE = [
  "The ferry left before the light did. Nerai stood at the rail with her hands inside her sleeves and watched the town go grey behind them, one window at a time, until nothing was left of it but the bell.",
  "Alaric had not come down to the water. She had not expected him to. Still, she had looked for him on the steps, and she was annoyed with herself for looking.",
  "Halfway across, the engine slowed. Nobody spoke. The river was wide here and very still, and the far bank had not yet decided to appear.",
];
/** The paragraph being written, and what the writer adds to it. */
export const CHAPTER_1_OPEN_LINE = "She counted the lamps along the far shore";
export const CHAPTER_1_TYPED = " and found one too few.";

// The Workspace, as the book grows it.
export const WORKSPACE = {
  characters: { id: "characters", title: "Characters", kind: "collection" as const },
  world: { id: "world", title: "World", kind: "folder" as const },
  research: { id: "research", title: "Research", kind: "page" as const },
  ending: { id: "ending", title: "Ending Ideas", kind: "page" as const },
};

// The Characters Collection: three Entries and the properties the writer
// gave them — a Select, a Status and a Text, all real property types.
export const CHARACTER_PROPERTIES = [
  { id: "role", name: "Role", type: "select" as const },
  { id: "status", name: "Status", type: "status" as const },
  { id: "home", name: "From", type: "text" as const },
];

export const CHARACTERS = [
  { id: "nerai", name: "Nerai", role: "Protagonist", status: "Drafted", home: "The east bank" },
  { id: "alaric", name: "Alaric", role: "Brother", status: "Drafted", home: "The east bank" },
  { id: "maelros", name: "Maelros", role: "Ferryman", status: "Sketched", home: "Unknown" },
];

// ── Creative A, 9:16 ─────────────────────────────────────────────────────
// The same book further along: three Chapters under Part I, a Scene with no
// place yet, and a Workspace that has been used — a Characters Collection on
// its Board, and a planning Canvas. Everything below is shown to a camera
// that crops into it, so it is written to survive a pause: every name, value
// and note belongs to the same story.

export const CHAPTER_3 = { id: "ch3", title: "Chapter 3", words: 3104 };

/** Chapter 1's last paragraph: what stands, and what the writer finishes it with. */
export const CHAPTER_1_LAST_LINE = "She counted the lamps along the far shore and found one";
export const CHAPTER_1_LAST_TYPED = " too few.";
/** Back in Chapter 1, the writer begins the next line. */
export const CHAPTER_1_RETURN_TYPED = "No one else on the ferry seemed to notice.";

export const WORKSPACE_GROWN = {
  characters: { id: "characters", title: "Characters" },
  world: { id: "world", title: "World" },
  research: { id: "research", title: "Research" },
  storyMap: { id: "story-map", title: "Story Map" },
  ending: { id: "ending", title: "Ending Ideas" },
};

// The Characters Collection, on its Board: grouped by "Place" (a Select),
// each card carrying its Role and Status (valueLine: the card's other shown
// properties, in order).
export const CHARACTER_BOARD = {
  property: "Place",
  /** Every property the Collection has: the Board's grouping first. */
  properties: ["Place", "Role", "Status", "First seen"],
  views: ["Table", "Board"],
  lanes: [
    {
      name: "Hell’s Market",
      cards: [
        { name: "Nerai", meta: ["Protagonist", "Drafted"] },
        { name: "Djal", meta: ["Fence", "Sketched"] },
        { name: "Maelros", meta: ["Ferryman", "Drafted"] },
      ],
    },
    {
      name: "Military School",
      cards: [
        { name: "Alaric", meta: ["Brother", "Drafted"] },
        { name: "Thyra", meta: ["Instructor", "Revised"] },
        { name: "Talon", meta: ["Cadet", "Sketched"] },
      ],
    },
    {
      name: "Holy City",
      cards: [
        { name: "Elara", meta: ["High Cantor", "Sketched"] },
        { name: "Cero", meta: ["Pilgrim", "Idea"] },
      ],
    },
    {
      name: "Beyond the Veil",
      cards: [{ name: "The Warden", meta: ["Antagonist", "Idea"] }],
    },
  ],
};

// The Story Map Canvas: Sections, the book's own objects placed on it
// (a Scene, a Chapter, Entries, a Page — shown as CanvasCard shows them),
// notes, and the connections the writer drew. World units; about
// DEFAULT_SIZE (lib/rune2/canvas.ts), as cards a writer has nudged.
export const STORY_MAP = {
  sections: [
    { id: "s-market", x: 0, y: 0, width: 520, height: 360, title: "Nerai — Hell’s Market", count: 4 },
    { id: "s-city", x: 580, y: 120, width: 520, height: 330, title: "The Holy City", count: 3 },
    { id: "s-veil", x: 0, y: 600, width: 520, height: 330, title: "Alaric crosses the Veil", count: 4 },
  ] as CanvasSectionSpec[],
  cards: [
    // Nerai — Hell's Market
    { id: "c-nerai", kind: "entry", x: 16, y: 46, width: 232, height: 96, eyebrow: "Characters", title: "Nerai", meta: "Protagonist · Hell’s Market" },
    {
      id: "c-lighthouse",
      kind: "scene",
      x: 264,
      y: 46,
      width: 240,
      height: 150,
      eyebrow: "Scene · Unplaced",
      title: "The lighthouse",
      meta: "638 words",
      preview: "The keeper had been dead a week before anyone thought to climb the stairs.",
    },
    { id: "c-djal", kind: "entry", x: 16, y: 210, width: 232, height: 96, eyebrow: "Characters", title: "Djal", meta: "Fence · Hell’s Market" },
    { id: "n-debt", kind: "note", x: 264, y: 216, width: 240, height: 72, text: "What does she owe Djal? Pay it off in Part II — or never." },
    // Loose on the board: the question that drives Part I
    { id: "n-father", kind: "note", x: 0, y: 410, width: 236, height: 72, text: "Father’s death — before the Military School, or after?" },
    {
      id: "c-funeral",
      kind: "scene",
      x: 284,
      y: 400,
      width: 240,
      height: 150,
      eyebrow: "Scene · Chapter 2",
      title: "The funeral",
      meta: "1,206 words",
      preview: "Alaric wore the school’s grey. Nerai noticed, and said nothing about it.",
    },
    // The Holy City
    {
      id: "c-city",
      kind: "page",
      x: 596,
      y: 166,
      width: 240,
      height: 150,
      eyebrow: "Page · World",
      title: "The Holy City",
      preview: "Seven bell towers. The seventh rings only for the dead, and no one sleeps through it.",
    },
    { id: "c-elara", kind: "entry", x: 852, y: 166, width: 232, height: 96, eyebrow: "Characters", title: "Elara", meta: "High Cantor · Holy City" },
    { id: "n-bells", kind: "note", x: 596, y: 334, width: 240, height: 64, text: "Who rings the seventh bell now?" },
    { id: "n-lamp", kind: "note", x: 600, y: 520, width: 210, height: 64, text: "Who lit the missing lamp?" },
    // Alaric crosses the Veil
    { id: "c-alaric", kind: "entry", x: 16, y: 646, width: 232, height: 96, eyebrow: "Characters", title: "Alaric", meta: "Brother · Military School" },
    { id: "c-ch3", kind: "chapter", x: 264, y: 646, width: 240, height: 96, eyebrow: "Chapter · Part I", title: "Chapter 3", meta: "2 scenes · 3,104 words" },
    { id: "n-memory", kind: "note", x: 16, y: 770, width: 232, height: 72, text: "The Veil takes one memory from him. Which one does he notice?" },
    { id: "n-school", kind: "note", x: 264, y: 770, width: 240, height: 72, text: "Military School: the Veil is a lesson, not a door." },
  ] as CanvasCardSpec[],
  lines: [
    { from: "c-nerai", to: "c-djal", label: "owes", directed: true },
    { from: "n-father", to: "c-funeral", label: "drives", directed: true },
    { from: "c-funeral", to: "c-ch3", directed: true },
    { from: "c-alaric", to: "c-ch3", directed: true },
    { from: "c-city", to: "c-elara" },
    { from: "c-lighthouse", to: "n-lamp" },
  ] as CanvasLineSpec[],
};
