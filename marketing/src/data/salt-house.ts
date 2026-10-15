// The Salt House — the fictional novel Sutura's product film is set inside.
// Invented for marketing; never real writing, never anyone's manuscript, and
// never written to any database. A grounded coastal mystery, written only as
// far as the film's screens need it to be believable.
//
// The thread the film follows: Mara Vale, back at the abandoned Salt House
// Hotel after an anonymous letter about her missing brother Elias, finds the
// hook for Room 17 empty. The writer's Revision Note asks why she recognises
// the number; the 1998 Guest Ledger, Elias's Entry and the Canvas give the
// answer (the key was signed out at 23:40, initials T.V. — her father); the
// writer goes back to the Scene and plants it.

import type { CanvasCardSpec, CanvasLineSpec, CanvasSectionSpec } from "../ui/Canvas";
import type { Block } from "../ui/Page";

export const PROJECT = "The Salt House";
export const PEN_NAME = "Isobel Wren";

// ── The manuscript ─────────────────────────────────────────────────────────

export type ChapterSpec = { id: string; title: string; words: number; scenes?: { id: string; title: string; words: number }[] };

export const PART_I = { id: "g-part-1", title: "Part I" };
export const PART_II = { id: "g-part-2", title: "Part II" };

export const SCENE = { id: "s-key-cabinet", title: "The Key Cabinet", words: 1846 };

export const PART_I_CHAPTERS: ChapterSpec[] = [
  { id: "c-ferry", title: "The Ferry", words: 4212 },
  { id: "c-greyhaven", title: "Greyhaven", words: 5630 },
  {
    id: "c-east-stair",
    title: "The East Stair",
    words: 6188,
    scenes: [
      { id: "s-lobby", title: "The Lobby", words: 2240 },
      SCENE,
      { id: "s-room-17", title: "Room 17", words: 2102 },
    ],
  },
  { id: "c-june", title: "June", words: 5904 },
  { id: "c-low-tide", title: "Low Tide", words: 6371 },
];

export const PART_II_CHAPTERS: ChapterSpec[] = [
  { id: "c-inquest", title: "The Inquest", words: 7020 },
  { id: "c-ledger", title: "What the Ledger Kept", words: 6488 },
  { id: "c-cliff", title: "The Cliff Path", words: 5817 },
  { id: "c-seventeen", title: "Seventeen", words: 4366 },
];

export const UNPLACED = [
  { id: "u-thomas", title: "Thomas, 1998", words: 1314 },
  { id: "u-cliff-alt", title: "Cliff path (other ending)", words: 962 },
];

/** The first draft, done: every placed Scene. */
export const MANUSCRIPT_WORDS = [...PART_I_CHAPTERS, ...PART_II_CHAPTERS].reduce((n, c) => n + c.words, 0);

/** The Scene the film opens in and returns to: the end of Chapter 3's second Scene. */
export const SCENE_PROSE = [
  "The reception desk had been built for a busier century. Its brass rail had gone green where hands had rested on it, and the bell beside the register had lost its clapper, so that when Mara pressed it, out of some old courtesy, it made no sound at all.",
  "Behind the desk the key cabinet stood open. Forty hooks in five rows, each with its number painted beneath in a careful white hand. Most still held their keys, heavy brass tags turning slowly in the draught from the broken fanlight.",
  "She did not mean to count them. She counted them anyway, the way she had once counted ferry lights from the harbour wall, and somewhere in the third row her finger stopped.",
  "Seventeen was empty.",
] as const;

/** Frame 01: the paragraph being finished. */
export const SCENE_OPEN_LINE = "The hook was brighter than the others, worn smooth, as if someone had gone on taking that key down";
export const SCENE_OPEN_TYPED = " long after there was any reason to.";

/** Frame 12: what the writer adds, coming back from the Workspace — the ledger's 23:40 and T.V. */
export const SCENE_RETURN_TYPED =
  "Beneath it, in pencil gone soft with years, someone had written a time and two initials: 23:40, T.V. Her father had signed for the key himself.";

/**
 * The product film's payoff (SuturaProductFilm): what the writer types after
 * "Seventeen was empty." — where the caret stopped when they paused — once the
 * Workspace has given them the answer. Typed, never carried: Sutura does not
 * write for the writer. (SCENE_RETURN_TYPED is the storyboard's longer draft.)
 */
export const FILM_RETURN_TYPED = [" Beneath it, in pencil: 23:40, T.V.", " Her father had signed for the key himself."] as const;

/** Fragments that pass the editor during the time-lapse (frame 03): other chapters, being written. */
export const TIMELAPSE_PROSE = [
  "The harbour office smelled of diesel and wet paper. June Mercer did not look up when the bell went, and when she did, it was at Mara’s hands, not her face.",
  "“Your father kept that ledger like a parish register,” Ned said. “Every key in, every key out. He never missed a line. Not once in twenty years.”",
  "The inquest had taken four days. The fire had taken forty minutes. Mara read the transcript twice on the ferry back and could not have said which was worse.",
  "Low tide uncovered the old slipway below the hotel, green with weed, and a rusted chain that ran down into the water and did not come back up.",
  "Elias had written the address in capitals, the way he had at nine, pressing so hard the pen went through to the table beneath.",
  "There was no seventeen on the fire brigade’s plan of the east wing. There was a sixteen and an eighteen, and between them a wall.",
] as const;

// ── Revision Notes (the Scene's own) ───────────────────────────────────────

export const REVISION_NOTES = [
  {
    id: "n-seed",
    body: "Seed why Mara recognizes the room number earlier.",
    details: "Right now it lands with no cause. Something she saw — or was told — in 1998.",
    anchor: "Seventeen was empty.",
  },
  { id: "n-bell", body: "Is the silent bell too neat? Keep it, or let the desk be plainer.", details: null, anchor: null },
] as const;

export const NOTES_TRAIL = ["Manuscript", PART_I.title, "The East Stair", SCENE.title];

// ── The Scene in the Inspector ─────────────────────────────────────────────

export const SCENE_PROPERTIES = [
  { name: "POV", type: "relationship" as const, value: ["Mara Vale"] },
  { name: "Location", type: "select" as const, value: ["Salt House Hotel"] },
  { name: "Status", type: "status" as const, value: ["Revising"] },
  { name: "Cast", type: "relationship" as const, value: ["Mara Vale", "Elias Vale"] },
  { name: "Research", type: "relationship" as const, value: ["1998 Guest Ledger"] },
];

export const SCENE_HISTORY = [
  { when: "Today, 9:42 AM", words: "same as now" },
  { when: "Yesterday, 6:15 PM", words: "1,802 words" },
  { when: "Mon, 12 Oct", words: "1,790 words" },
];

export const SCENE_MILESTONE = { name: "First Draft", meta: "Sun, 4 Oct · in The East Stair · 1,790 words" };

// ── The Workspace ──────────────────────────────────────────────────────────

export const WORKSPACE = {
  characters: { id: "w-characters", title: "Characters" },
  research: { id: "w-research", title: "Research" },
  ledger: { id: "w-ledger", title: "1998 Guest Ledger" },
  harbour: { id: "w-harbour", title: "Greyhaven Harbour" },
  canvas: { id: "w-night", title: "The Night of the Fire" },
} as const;

/** The ledger Page's facts and connections, as the Inspector shows them (frame 07). */
export const LEDGER_FACTS = ["Created 2 Sept 2026", "Edited 11 Oct 2026"];
export const LEDGER_BACKLINKS = [
  { title: "The East Stair · The Key Cabinet", hint: "Manuscript · Research" },
  { title: "What the Ledger Kept", hint: "Manuscript · Research" },
  { title: "Elias Vale", hint: "Characters · Connected to" },
];
export const LEDGER_RELATED = [
  { title: "Thomas Vale", hint: "Characters" },
  { title: "Greyhaven Harbour", hint: "Research" },
];

// The Characters Collection: one Board View, by Whereabouts. A card's second
// line is what the app draws there (CollectionViewBodies → BoardView): the
// values of the properties the View shows "On cards" — here Role · Last seen,
// empty values omitted — so a card is the same object as its Entry: Elias's
// card reads "Brother · Greyhaven ferry, 3 March" because his Entry does.
export const CHARACTERS_PROPERTIES = ["Role", "Whereabouts", "Age in 1998", "Last seen", "Connected to"];
export const CHARACTERS_BOARD = [
  {
    name: "Greyhaven",
    cards: [
      { name: "Mara Vale", meta: ["Protagonist"] },
      { name: "June Mercer", meta: ["Harbour office"] },
      { name: "Ned Ashby", meta: ["Night porter, 1998"] },
      { name: "Constance Ware", meta: ["Owner, 1998"] },
    ],
  },
  {
    name: "Missing",
    cards: [
      { name: "Elias Vale", meta: ["Brother", "Greyhaven ferry, 3 March"] },
      { name: "The guest in 17", meta: ["Unconfirmed", "Room 17, 14 November"] },
    ],
  },
  {
    name: "Deceased",
    cards: [
      { name: "Thomas Vale", meta: ["Night manager, 1998"] },
      { name: "Clara Mercer", meta: ["Housekeeper", "The east stair, 14 November"] },
    ],
  },
];

export const ELIAS = {
  title: "Elias Vale",
  properties: [
    { name: "Role", type: "select" as const, value: ["Brother"] },
    { name: "Whereabouts", type: "select" as const, value: ["Missing"] },
    { name: "Age in 1998", type: "number" as const, value: "9" },
    { name: "Last seen", type: "text" as const, value: "Greyhaven ferry, 3 March" },
    { name: "Connected to", type: "relationship" as const, value: ["Mara Vale", "Thomas Vale", "1998 Guest Ledger"] },
  ],
};

// ── Page and Entry bodies (Workspace rich text: ui/Page.tsx's Block) ────────

export const LEDGER_BODY: Block[] = [
  {
    p: [
      "Bound guest register, Salt House Hotel, October–November 1998. Water damage to the last six pages. Kept by ",
      { ref: "June Mercer" },
      " since the estate sale; photographed in September.",
    ],
  },
  { h: 2, text: "14–15 November" },
  {
    bullets: [
      ["13 Nov — Rooms 12, 14 and 15 let. Room 17: no entry."],
      ["14 Nov, 23:40 — Key 17 signed out. Initials: T.V."],
      ["15 Nov, 02:10 — Fire reported in the east wing."],
      ["Fire brigade report: Room 17 “vacant, no occupant.”"],
    ],
  },
  { aside: ["The contradiction: the key went out, but the room was never let. Who was in seventeen?"] },
  { h: 2, text: "Who saw what" },
  {
    p: [
      { ref: "Clara Mercer" },
      " was seen on the east stair at midnight (inquest, day two). ",
      { ref: "Elias Vale" },
      ", nine, was found on the cliff path at 02:30 and told the constable he had been “in seventeen.”",
    ],
  },
  {
    tasks: [
      { done: true, text: ["Check the inquest dates against the tide tables"] },
      { done: false, text: ["Does June still have the original? Ask about the missing pages"] },
    ],
  },
];

export const ELIAS_BODY: Block[] = [
  { h: 2, text: "Now" },
  {
    p: [
      "Thirty-five. Restores boats in Leith; good with his hands, bad with letters. Has not been back to Greyhaven since ",
      { ref: "Thomas Vale" },
      "’s funeral.",
    ],
  },
  { h: 2, text: "The night of the fire" },
  {
    p: [
      "Found barefoot on the cliff path at 02:30. Told the constable he had been “in seventeen” and that Dad gave him the key. Nobody wrote it down except ",
      { ref: "Ned Ashby" },
      ".",
    ],
  },
  { quote: ["“He said the room was full of water. There was no water in that wing.”"] },
  {
    tasks: [
      { done: false, text: ["Decide: did Elias send the letter himself?"] },
      { done: true, text: ["Keep his voice off the page until Part II"] },
    ],
  },
];

// ── The Canvas: The Night of the Fire ──────────────────────────────────────

export const NIGHT_SECTIONS: CanvasSectionSpec[] = [
  { id: "sec-1998", x: 0, y: 0, width: 950, height: 680, title: "14 November 1998", count: 7 },
  { id: "sec-now", x: 1000, y: 0, width: 600, height: 680, title: "Now", count: 5 },
  { id: "sec-hotel", x: 1660, y: 0, width: 560, height: 680, title: "The hotel", count: 3 },
];

export const NIGHT_CARDS: CanvasCardSpec[] = [
  { id: "thomas", kind: "entry", x: 20, y: 64, width: 240, height: 112, eyebrow: "Characters", title: "Thomas Vale", preview: "Night manager. Kept the ledger “like a parish register.”" },
  { id: "key", kind: "note", x: 350, y: 76, width: 240, height: 88, text: "23:40 — key 17 signed out.\nInitials: T.V." },
  { id: "ledger", kind: "page", x: 680, y: 64, width: 240, height: 112, eyebrow: "Page · Research", title: "1998 Guest Ledger", preview: "Bound guest register, Salt House Hotel, October–November 1998." },
  { id: "elias", kind: "entry", x: 20, y: 290, width: 240, height: 112, eyebrow: "Characters", title: "Elias Vale", preview: "Found on the cliff path, 02:30. “In seventeen.”" },
  { id: "guest", kind: "note", x: 350, y: 302, width: 240, height: 88, text: "Who was in seventeen?" },
  { id: "vacant", kind: "note", x: 680, y: 302, width: 240, height: 88, text: "Fire brigade: Room 17 “vacant, no occupant.”" },
  { id: "clara", kind: "entry", x: 350, y: 500, width: 240, height: 112, eyebrow: "Characters", title: "Clara Mercer", preview: "Housekeeper. On the east stair at midnight." },
  { id: "letter", kind: "note", x: 1030, y: 76, width: 240, height: 88, text: "The letter: “He went back to seventeen.”" },
  { id: "mara", kind: "entry", x: 1310, y: 64, width: 240, height: 112, eyebrow: "Characters", title: "Mara Vale", preview: "Twelve in 1998. Remembers nothing of the night." },
  { id: "june", kind: "entry", x: 1030, y: 290, width: 240, height: 112, eyebrow: "Characters", title: "June Mercer", preview: "Clara’s daughter. Kept the ledger." },
  { id: "scene", kind: "scene", x: 1310, y: 290, width: 240, height: 132, eyebrow: "Scene · The East Stair", title: "The Key Cabinet", meta: "1,846 words", preview: "Seventeen was empty." },
  { id: "plant", kind: "note", x: 1030, y: 508, width: 240, height: 88, text: "Plant it: pencil under hook 17. Her father’s initials." },
  { id: "constance", kind: "entry", x: 1690, y: 64, width: 240, height: 112, eyebrow: "Characters", title: "Constance Ware", preview: "Owner in 1998. Sold the Salt House the next spring." },
  { id: "insurance", kind: "note", x: 1690, y: 302, width: 240, height: 88, text: "Insurance paid in full — within a month." },
];

export const NIGHT_LINES: CanvasLineSpec[] = [
  { from: "thomas", to: "key", label: "signed for", directed: true },
  { from: "key", to: "ledger", label: "recorded in", directed: true },
  { from: "ledger", to: "vacant", label: "contradicts" },
  { from: "guest", to: "vacant" },
  { from: "elias", to: "guest", label: "was it him?" },
  { from: "clara", to: "guest", label: "saw?" },
  { from: "june", to: "letter", label: "wrote it?" },
  { from: "letter", to: "mara", label: "sent to", directed: true },
  { from: "ledger", to: "plant", label: "plant it", directed: true },
  { from: "plant", to: "scene", directed: true },
  { from: "constance", to: "insurance" },
];
