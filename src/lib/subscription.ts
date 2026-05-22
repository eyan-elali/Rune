export type SubscriptionTier = 'free' | 'scribe' | 'arcane'

export const FEATURE_GATES = {
  unlimitedProjects:   ['scribe', 'arcane'],
  goals:               ['scribe', 'arcane'],
  streaks:             ['scribe', 'arcane'],
  export:              ['scribe', 'arcane'],
  focusMode:           ['free', 'scribe', 'arcane'],
  gameMode:            ['arcane'],
  allUnlockables:      ['arcane'],
  multipleGameTickets: ['arcane'],
} as const satisfies Record<string, readonly SubscriptionTier[]>

export function canAccessFeature(
  tier: SubscriptionTier,
  feature: keyof typeof FEATURE_GATES
): boolean {
  return (FEATURE_GATES[feature] as readonly string[]).includes(tier)
}

export function getGameTicketsAllowed(tier: SubscriptionTier): number {
  if (tier === 'arcane') return Infinity
  return 1
}
