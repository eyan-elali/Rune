export type SubscriptionTier = 'free' | 'scribe'

export const FEATURE_GATES = {
  unlimitedProjects:   ['scribe'],
  goals:               ['scribe'],
  streaks:             ['scribe'],
  export:              ['scribe'],
  focusMode:           ['free', 'scribe'],
  gameMode:            ['free', 'scribe'],
  unlockables:         ['scribe'],
  unlimitedArena: ['scribe'],
  heatmap:             ['scribe'],
  avgWordsWidget:      ['scribe'],
  projectGoals:        ['scribe'],
  chapterGoals:        ['scribe'],
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
