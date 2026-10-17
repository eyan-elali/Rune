import { CHAPTER_ONE, FLAT_A, FLAT_A_PROSE, MANUSCRIPT_WORDS, PART_ONE, PART_ONE_CHAPTERS, PART_TWO, PART_TWO_CHAPTERS, UNPLACED, WORKSPACE } from "../carousel/content";

// Performance Ad #1 — the book is the carousel's Equal Temperament
// (creatives/carousel/content.ts). Invented for marketing; never real
// writing. The ad adds five short passages for its time-lapse, so the
// stream of prose that months of writing pass through is the novel's own.

export { FLAT_A, FLAT_A_PROSE, MANUSCRIPT_WORDS, PART_ONE, PART_TWO, UNPLACED, WORKSPACE };
export { PEN_NAME, PROJECT } from "../carousel/content";

/** Part One in the ad: the first Chapter keeps the name every new Project gives it. */
export const CHAPTERS_ONE = PART_ONE_CHAPTERS.map((c, i) => (i === 0 ? { ...c, title: "Chapter 1" } : c));
export const CHAPTERS_TWO = PART_TWO_CHAPTERS;

/**
 * The opening: Chapter 1's third paragraph, being written. The writer types
 * its last clause at a natural pace while the hook stands.
 */
export const OPEN = {
  title: CHAPTER_ONE.title,
  paragraphs: CHAPTER_ONE.paragraphs,
  line: "Then she sat down on the floor of the empty hall and listened to Tomás say the word stroke",
  typed: " as if he were reading it off a card.",
} as const;

/** What the writer adds at the end, back in The Flat A. Typed, never generated. */
export const RETURN_TYPED = "She took it off again.";

export type Segment = { id: string; eyebrow?: string; title: string; words: number; paragraphs: readonly string[] };

/** The stream: the book in the order it was written — Chapter 1 first, The Flat A last (where the lapse rests). */
export const SEGMENTS: readonly Segment[] = [
  { id: "c-call", title: OPEN.title, words: 4120, paragraphs: [...OPEN.paragraphs, OPEN.line + OPEN.typed] },
  {
    id: "c-flores",
    eyebrow: PART_ONE.title,
    title: "Rua das Flores",
    words: 5310,
    paragraphs: [
      "The flat smelled of resin and of the river. Nothing had been moved. His viola case stood in the hall where it had stood for thirty years, and she stepped around it the way she had as a child, without looking.",
      "Tomás had left the keys with Dona Amélia upstairs, and a note on the kitchen table in his careful accountant’s hand. Milk in the fridge. He sleeps in the afternoons. Don’t let him see you cry.",
    ],
  },
  {
    id: "s-dust",
    eyebrow: "The Upright",
    title: "Dust Cover",
    words: 2210,
    paragraphs: [
      "The upright stood against the inside wall under a cloth that had once been a curtain. When she lifted it the dust rose and hung in the light from the balcony, and for a moment the room was full of it, slow and gold, like the inside of a bell.",
      "She opened the lid. The felts were moth-eaten at the top end and the ivories had yellowed to the colour of old teeth, but the frame was sound, and when she pressed middle C it spoke.",
    ],
  },
  {
    id: "c-lia",
    eyebrow: PART_ONE.title,
    title: "Lia",
    words: 5045,
    paragraphs: [
      "Lia came on Thursdays, after school, with her hair still wet from swimming. She was thirteen and played the way thirteen-year-olds play, all forearm, as if the piano had to be persuaded.",
      "Rui listened from the armchair. He could not tell her what was wrong. He lifted one hand, flat, and lowered it by the width of a finger, and Lia, who had known him all her life, played the phrase again, quieter.",
    ],
  },
  {
    id: "c-hall",
    eyebrow: PART_ONE.title,
    title: "The Hall",
    words: 6205,
    paragraphs: [
      "The hall had been rebuilt in the eighties and the organ was gone, but the stage was where it had always been, and she stood on it in her coat and clapped once and listened to the room answer.",
      "Two seconds, a little less. Her father had played here for thirty-eight years. The sound she had just made had gone out into the same dark and come back off the same walls, and she found she had to sit down.",
    ],
  },
  {
    id: "s-amelia",
    eyebrow: "The Second Visit",
    title: "Amélia",
    words: 2390,
    paragraphs: [
      "Dona Amélia brought the coffee down herself, on a tray with a cloth, and sat on the edge of the sofa with her knees together as if she were visiting a hospital.",
      "“He practised every morning,” she said. “Forty years. Scales, then something slow. I used to time my eggs by it.” She looked at Rui, and Rui looked at the window, and the clock in the kitchen went on.",
    ],
  },
  { id: FLAT_A.id, eyebrow: FLAT_A.chapter, title: FLAT_A.title, words: FLAT_A.words, paragraphs: FLAT_A_PROSE },
];
export const LAST = SEGMENTS.length - 1;

/**
 * What arrives in the navigator as the book is written: a row, the stream
 * segment the writing front is in when it appears, and where in that segment
 * (a fraction; negative: just before it). Part One arrives first, above
 * Chapter 1. The Workspace arrives in the second half, when the book has
 * become large enough to need it.
 */
export const ARRIVALS: readonly [id: string, segment: number, at: number][] = [
  [PART_ONE.id, 1, -0.07],
  ["c-flores", 1, 0],
  ["c-upright", 2, -0.03],
  ["s-dust", 2, 0.02],
  ["s-middle-c", 2, 0.42],
  ["s-instead", 2, 0.78],
  ["c-lia", 3, 0],
  [WORKSPACE.characters.id, 3, 0.58],
  ["c-hall", 4, 0],
  [WORKSPACE.research.id, 4, 0.32],
  [WORKSPACE.pitch.id, 4, 0.32],
  ["unplaced", 4, 0.68],
  [PART_TWO.id, 5, -0.08],
  ["c-second", 5, 0],
  ["s-amelia", 5, 0.04],
  [WORKSPACE.aphasia.id, 5, 0.62],
  [FLAT_A.id, 6, 0],
  ["s-tea", 6, 0.3],
  ["c-beats", 6, 0.44],
  ["c-viola", 6, 0.58],
  [WORKSPACE.canvas.id, 6, 0.66],
  ["c-equal", 6, 0.74],
];
