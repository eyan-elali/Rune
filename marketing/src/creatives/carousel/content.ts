import type { CanvasCardSpec, CanvasLineSpec } from "../../ui/Canvas";

// Equal Temperament — the carousel's own fictional novel
// (marketing/carousel/CAROUSEL_DEMO_PROJECT.md). Invented for marketing; never
// real writing, never the founder's, never written to any database, and
// nothing from the product film's book. A quiet family drama: Inês, a piano
// tuner, comes home to Porto after her father's stroke and tunes his upright.

export const PROJECT = "Equal Temperament";
export const PEN_NAME = "Miriam Holt";

// ── The manuscript ─────────────────────────────────────────────────────────

export type Chapter = { id: string; title: string; words: number; scenes?: { id: string; title: string; words: number }[] };

export const PART_ONE = { id: "g-one", title: "Part One" };
export const PART_TWO = { id: "g-two", title: "Part Two" };

/** The Scene slide 5's thought returns to, and slide 6 is written in. */
export const FLAT_A = { id: "s-flat-a", title: "The Flat A", words: 2134, chapter: "The Second Visit" };

export const PART_ONE_CHAPTERS: Chapter[] = [
  { id: "c-call", title: "The Call", words: 4120 },
  { id: "c-flores", title: "Rua das Flores", words: 5310 },
  {
    id: "c-upright",
    title: "The Upright",
    words: 6870,
    scenes: [
      { id: "s-dust", title: "Dust Cover", words: 2210 },
      { id: "s-middle-c", title: "Middle C", words: 2480 },
      { id: "s-instead", title: "What He Said Instead", words: 2180 },
    ],
  },
  { id: "c-lia", title: "Lia", words: 5045 },
  { id: "c-hall", title: "The Hall", words: 6205 },
];

export const PART_TWO_CHAPTERS: Chapter[] = [
  {
    id: "c-second",
    title: "The Second Visit",
    words: 7180,
    scenes: [{ id: "s-amelia", title: "Amélia", words: 2390 }, FLAT_A, { id: "s-tea", title: "Tea", words: 2656 }],
  },
  { id: "c-beats", title: "Beats", words: 6940 },
  { id: "c-viola", title: "Viola", words: 7415 },
  { id: "c-equal", title: "Equal Temperament", words: 9335 },
];

export const UNPLACED = [
  { id: "u-1971", title: "Rui, 1971", words: 1140 },
  { id: "u-conservatoire", title: "Conservatoire (cut)", words: 860 },
];

export const MANUSCRIPT_WORDS = [...PART_ONE_CHAPTERS, ...PART_TWO_CHAPTERS].reduce((n, c) => n + c.words, 0);

// ── The Workspace ──────────────────────────────────────────────────────────

export const WORKSPACE = {
  characters: { id: "w-characters", title: "Characters" },
  research: { id: "w-research", title: "Research" },
  pitch: { id: "w-pitch", title: "Pitch, 1971" },
  temperament: { id: "w-temperament", title: "Equal temperament" },
  aphasia: { id: "w-aphasia", title: "Aphasia notes" },
  canvas: { id: "w-canvas", title: "Rui’s piano" },
} as const;

// ── The writing ────────────────────────────────────────────────────────────

/**
 * Slides 1–2: the novel's first lines, in the Chapter every new Project
 * begins with (create_project_checked: Project → Manuscript → "Chapter 1").
 * It will become "The Call".
 */
export const CHAPTER_ONE = {
  title: "Chapter 1",
  paragraphs: [
    "Her brother rang on a Tuesday, which was how she knew it was bad. Tomás only ever rang on Sundays.",
    "Inês was inside a piano at the time, a school Bechstein in Lyon, her arm to the elbow among the dampers. She let it ring out and finished the octave, because her father had taught her that you always finish the octave.",
  ],
  open: "Then she sat down on the floor of the empty hall and listened to Tomás say the word stroke as if he were reading it off",
  typed: " a card.",
};

/** The Flat A as it stood before the thinking (slide 5's Scene card previews its first line). */
export const FLAT_A_PROSE = [
  "The A above middle C was flat. Only slightly: three slow beats a second against her fork, the kind of fault a client would never hear and her father would never once have allowed.",
  "He sat in the armchair by the window with his hands folded, the way he had sat through other people’s solos for thirty-eight years.",
  "Her lever was already on the pin when she understood what she was listening to.",
] as const;

/** Slide 6: what the writer adds after following the thought. Typed, never generated. */
export const FLAT_A_NEW = "She took it off again. She left his A where it was, and tuned the other eighty-seven keys to meet it.";

// ── Slide 5: the Canvas "Rui’s piano" ──────────────────────────────────────
// Real Canvas cards and connections (CanvasCard / CanvasConnections), placed
// by their top-left corner in slide pixels and shown at ZOOM. Every size is
// one a writer could drag a card to; the hierarchy is size, room and ink, not
// labels. No Section (its item count read as a stray digit at phone size).

export const ZOOM = 1.8;
const px = (n: number) => Math.round((n / ZOOM) * 10) / 10;

type Card = { id: string } & Record<string, unknown>;
/** A card by its slide-pixel top-left; width and height are the card's own (world units). */
const at = (c: Card, x: number, y: number, width: number, height: number): CanvasCardSpec => ({ ...c, x: px(x), y: px(y), width, height }) as unknown as CanvasCardSpec;

export const THOUGHT_CARDS: CanvasCardSpec[] = [
  // The thought, in reading order: a small question, its evidence, the man, the decision, the Scene.
  at({ id: "question", kind: "note", text: "Why has he kept\nthe A flat?" }, 88, 228, 150, 60),
  at({ id: "pitch", kind: "page", eyebrow: "Page · Research", title: "Pitch, 1971", preview: "Porto’s orchestra tuned to the hall organ, a little under A440." }, 560, 290, 200, 102),
  at({ id: "rui", kind: "entry", eyebrow: "Characters", title: "Rui Carvalho", preview: "Viola, 1971–2009. Taught Inês to hear beats before she could read." }, 150, 506, 206, 118),
  at({ id: "decision", kind: "note", text: "Don’t correct it.\nShe tunes the piano to him." }, 478, 748, 214, 62),
  at({ id: "scene", kind: "scene", eyebrow: "Scene · The Second Visit", title: FLAT_A.title, meta: "2,134 words", preview: FLAT_A_PROSE[0] }, 540, 886, 244, 154),
  // The rest of the Canvas, at its edges.
  at({ id: "amelia", kind: "entry", eyebrow: "Characters", title: "Dona Amélia Reis", preview: "Upstairs. Has heard him practise for forty years." }, -150, 826, 196, 100),
  at({ id: "aphasia", kind: "page", eyebrow: "Page · Research", title: "Aphasia notes", preview: "Many people with aphasia can still sing words they can’t say." }, 906, 540, 196, 100),
];

export const THOUGHT_LINES: CanvasLineSpec[] = [
  { from: "question", to: "pitch" },
  { from: "pitch", to: "rui" },
  { from: "rui", to: "decision" },
  { from: "decision", to: "scene", directed: true },
  { from: "amelia", to: "rui" },
];

/** The thought (lit); the rest of the Canvas recedes. */
export const THOUGHT = new Set(["question", "pitch", "rui", "decision", "scene"]);
export const THOUGHT_LINE = new Set([0, 1, 2, 3]);
/** The destination: the Scene, selected. */
export const DESTINATION = "scene";
