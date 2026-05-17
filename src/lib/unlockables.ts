export type UnlockableType = "theme" | "avatar";
export type RequirementType = "level" | "total_words" | "battle_wins" | "race_duration";

export interface Unlockable {
  id: string;
  name: string;
  type: UnlockableType;
  description: string;
  requirement: { type: RequirementType; value: number } | null;
}

export const UNLOCKABLES: Unlockable[] = [
  // ── Themes ──────────────────────────────────────────────────────────────────
  {
    id: "parchment",
    name: "Parchment",
    type: "theme",
    description: "Warm whites and antique gold. Write by daylight.",
    requirement: null,
  },
  {
    id: "candlelight",
    name: "Candlelight",
    type: "theme",
    description: "The original dark scholar aesthetic.",
    requirement: null,
  },
  {
    id: "midnight-library",
    name: "Midnight Library",
    type: "theme",
    description: "Deeper blacks and cool blue accents. The witching hour.",
    requirement: { type: "level", value: 3 },
  },
  {
    id: "crimson-ink",
    name: "Crimson Ink",
    type: "theme",
    description: "Dark red tones stained with urgency. For those who write with fire.",
    requirement: { type: "level", value: 5 },
  },
  {
    id: "ivory-tower",
    name: "The Ivory Tower",
    type: "theme",
    description: "Bone white and slate. A light mode variant for scholars of the highest order.",
    requirement: { type: "level", value: 10 },
  },
  // ── Avatars ─────────────────────────────────────────────────────────────────
  {
    id: "quill",
    name: "Quill",
    type: "avatar",
    description: "The writer's oldest instrument.",
    requirement: null,
  },
  {
    id: "skull-roses",
    name: "Skull & Roses",
    type: "avatar",
    description: "Beauty and darkness intertwined.",
    requirement: { type: "total_words", value: 10000 },
  },
  {
    id: "crescent-moon",
    name: "Crescent Moon",
    type: "avatar",
    description: "For those who write by moonlight.",
    requirement: { type: "battle_wins", value: 5 },
  },
  {
    id: "ouroboros",
    name: "Ouroboros",
    type: "avatar",
    description: "The eternal cycle. Consume your own words to create more.",
    requirement: { type: "level", value: 7 },
  },
  {
    id: "hourglass",
    name: "Hourglass",
    type: "avatar",
    description: "Time is running out. And you wrote through it.",
    requirement: { type: "race_duration", value: 1800 },
  },
];

export function requirementLabel(req: Unlockable["requirement"]): string {
  if (!req) return "Always unlocked";
  switch (req.type) {
    case "level":
      return `Reach Level ${req.value}`;
    case "total_words":
      return `Write ${req.value.toLocaleString()} words`;
    case "battle_wins":
      return `Win ${req.value} ${req.value === 1 ? "battle" : "battles"}`;
    case "race_duration":
      return `Complete a ${req.value / 60}-minute race`;
  }
}
