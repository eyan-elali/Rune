export type SubscriptionTier = 'free' | 'scribe'

export const FREE_WORD_LIMIT = 15_000

export const FEATURE_GATES = {
  // Scale gates — scribe only
  unlimitedProjects: ['scribe'],
  unlimitedArena:    ['scribe'],
  premiumUnlockables: ['scribe'],
  // Writing features — available to all
  goals:          ['free', 'scribe'],
  streaks:        ['free', 'scribe'],
  export:         ['free', 'scribe'],
  focusMode:      ['free', 'scribe'],
  gameMode:       ['free', 'scribe'],
  heatmap:        ['free', 'scribe'],
  avgWordsWidget: ['free', 'scribe'],
  projectGoals:   ['free', 'scribe'],
  chapterGoals:   ['free', 'scribe'],
} as const satisfies Record<string, readonly SubscriptionTier[]>

export function canAccessFeature(
  tier: SubscriptionTier,
  feature: keyof typeof FEATURE_GATES
): boolean {
  return (FEATURE_GATES[feature] as readonly string[]).includes(tier)
}

export function getGameTicketsAllowed(tier: SubscriptionTier): number {
  if (tier === 'scribe') return Infinity
  return 1
}
