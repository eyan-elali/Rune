// XP threshold to reach `level` (cumulative total XP)
export function xpForLevel(level: number): number {
  return 25 * level ** 2;
}

// Current level for a given total XP (minimum 1)
export function levelFromXp(xp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(xp / 25)));
}

// Progress within the current level
export function xpProgressInCurrentLevel(xp: number): {
  current: number;
  required: number;
  percent: number;
} {
  const level = levelFromXp(xp);
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

// Base XP reward for a word count (1 XP per 5 words, minimum 1)
export function xpRewardForWords(wordCount: number): number {
  return Math.max(1, Math.round(wordCount / 5));
}

export type XpContext =
  | { mode: 'project' }
  | { mode: 'race'; beatenPB: boolean }
  | { mode: 'battle'; outcome: 'win' | 'loss'; enemyTier: 1 | 2 | 3 };

export function applyMultiplier(baseXp: number, context: XpContext): number {
  let multiplier: number;

  if (context.mode === 'project') {
    multiplier = 1.0;
  } else if (context.mode === 'race') {
    multiplier = context.beatenPB ? 1.5 : 1.2;
  } else if (context.outcome === 'loss') {
    // Loss applies 0.8× to base XP with no tier scaling
    multiplier = 0.8;
  } else {
    const tierMultipliers: Record<1 | 2 | 3, number> = { 1: 1.5, 2: 2.0, 3: 2.5 };
    multiplier = tierMultipliers[context.enemyTier];
  }

  return Math.round(baseXp * multiplier);
}
