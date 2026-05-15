// XP threshold to reach `level` (cumulative total XP)
export function xpForLevel(level: number): number {
  return level * level * 100;
}

// Current level for a given total XP (minimum 1)
export function levelFromXp(xp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(xp / 100)));
}

// Progress within the current level
export function xpProgressInCurrentLevel(xp: number): {
  current: number;
  required: number;
  percent: number;
} {
  const level = levelFromXp(xp);
  // Level 1 starts at 0; higher levels start at their xpForLevel threshold
  const base = level === 1 ? 0 : xpForLevel(level);
  const next = xpForLevel(level + 1);
  const current = Math.max(0, xp - base);
  const required = next - base;
  return {
    current,
    required,
    percent: Math.min(100, Math.max(0, Math.round((current / required) * 100))),
  };
}

// Base XP reward for a word count (1 XP per 10 words, minimum 5)
export function xpRewardForWords(wordCount: number): number {
  return Math.max(5, Math.floor(wordCount / 10));
}
