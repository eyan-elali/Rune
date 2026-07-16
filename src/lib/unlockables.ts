export type UnlockableType = 'theme' | 'avatar' | 'font'

export type RequirementType =
  | 'level'
  | 'words' // raw manuscript total (projects.word_count) — includes pasted/imported words
  | 'words_written' // real words typed (writing_sessions.words_added) — paste-deducted
  | 'battles_won'
  | 'race_30min'
  | 'xp'
  | 'streak'
  | 'theme_unlocked'

export interface UnlockableRequirement {
  type: RequirementType
  value: number | string
}

export interface Unlockable {
  id: string
  name: string
  type: UnlockableType
  tier: 'free' | 'scribe'
  description: string
  requirement: UnlockableRequirement | null
}

export const UNLOCKABLES: Unlockable[] = [
  // ── Themes (12) ──────────────────────────────────────────────────────────────
  { id: 'parchment',          name: 'Parchment',          type: 'theme', tier: 'free',   description: 'Warm whites and antique gold.',                                    requirement: null },
  { id: 'candlelight',        name: 'Candlelight',        type: 'theme', tier: 'free',   description: 'Deep sepia and amber. Write by firelight.',                       requirement: null },
  { id: 'fog',                name: 'London Fog',         type: 'theme', tier: 'free',   description: 'Cool grays and muted slate. Quiet and austere.',                  requirement: { type: 'xp', value: 200 } },
  { id: 'manuscript',         name: 'Manuscript',         type: 'theme', tier: 'free',   description: 'Warm paper and charcoal ink. No gold — just the page.',           requirement: { type: 'words_written', value: 2000 } },
  { id: 'midnight-library',   name: 'Midnight Library',   type: 'theme', tier: 'scribe', description: 'Deep navy and silver. The library after hours.',                  requirement: { type: 'level', value: 5 } },
  { id: 'crimson-ink',        name: 'Crimson Ink',        type: 'theme', tier: 'scribe', description: 'Dark reds and bone white. Dramatic and intense.',                 requirement: { type: 'level', value: 15 } },
  { id: 'forest-scriptorium', name: 'Forest Scriptorium', type: 'theme', tier: 'scribe', description: 'Deep greens and bark brown. Grounded and focused.',              requirement: { type: 'words', value: 10000 } },
  { id: 'obsidian',           name: 'Obsidian',           type: 'theme', tier: 'scribe', description: 'Pure blacks and ice blue. Cold and precise.',                     requirement: { type: 'level', value: 25 } },
  { id: 'ivory-tower',        name: 'Rosewood',           type: 'theme', tier: 'scribe', description: 'Warm ivory and dusty rose. A pressed petal between the pages.',    requirement: { type: 'level', value: 30 } },
  { id: 'absinthe',           name: 'Absinthe',           type: 'theme', tier: 'scribe', description: 'Deep emerald and gold. Decadent and otherworldly.',               requirement: { type: 'level', value: 40 } },
  { id: 'ravens-court',       name: "Raven's Court",      type: 'theme', tier: 'scribe', description: 'Black, purple, and silver. The darkest academia.',                requirement: { type: 'words', value: 50000 } },
  { id: 'gilded-age',         name: 'Gilded Age',         type: 'theme', tier: 'scribe', description: 'Rich burgundy and hammered gold. Opulent.',                       requirement: { type: 'level', value: 50 } },
  { id: 'the-void',           name: 'The Void',           type: 'theme', tier: 'scribe', description: 'True black and faint violet. For the committed.',                 requirement: { type: 'words', value: 100000 } },

  // ── Avatars (14) ─────────────────────────────────────────────────────────────
  { id: 'quill',         name: 'Quill',         type: 'avatar', tier: 'free',   description: 'The classic. Where every writer begins.',   requirement: null },
  { id: 'inkwell',       name: 'Inkwell',       type: 'avatar', tier: 'free',   description: 'Full and ready.',                           requirement: { type: 'xp', value: 100 } },
  { id: 'open-book',     name: 'Open Book',     type: 'avatar', tier: 'free',   description: 'Always mid-chapter.',                       requirement: { type: 'words', value: 1000 } },
  { id: 'skull-roses',   name: 'Skull & Roses', type: 'avatar', tier: 'scribe', description: 'Beauty and mortality.',                     requirement: { type: 'words', value: 10000 } },
  { id: 'crescent-moon', name: 'Crescent Moon', type: 'avatar', tier: 'scribe', description: 'For the late-night writers.',               requirement: { type: 'battles_won', value: 5 } },
  { id: 'hourglass',     name: 'Hourglass',     type: 'avatar', tier: 'scribe', description: 'Time is the only resource.',                requirement: { type: 'race_30min', value: 1 } },
  { id: 'compass',       name: 'The Compass',   type: 'avatar', tier: 'scribe', description: 'Always finding true north.',                requirement: { type: 'level', value: 6 } },
  { id: 'crow',          name: 'The Crow',      type: 'avatar', tier: 'scribe', description: 'Watchful. Precise.',                        requirement: { type: 'streak', value: 7 } },
  { id: 'ouroboros',     name: 'Ouroboros',     type: 'avatar', tier: 'scribe', description: 'The eternal draft.',                        requirement: { type: 'level', value: 7 } },
  { id: 'lantern',       name: 'The Lantern',   type: 'avatar', tier: 'scribe', description: 'Light in the dark.',                        requirement: { type: 'streak', value: 30 } },
  { id: 'sigil',         name: 'The Sigil',     type: 'avatar', tier: 'scribe', description: 'Marked by the craft.',                      requirement: { type: 'level', value: 14 } },
  { id: 'the-eye',       name: 'The Eye',       type: 'avatar', tier: 'scribe', description: 'Sees everything. Misses nothing.',           requirement: { type: 'words', value: 75000 } },
  { id: 'crown',         name: 'The Crown',     type: 'avatar', tier: 'scribe', description: 'Earned, not given.',                        requirement: { type: 'words', value: 100000 } },
  { id: 'void-walker',   name: 'Void Walker',   type: 'avatar', tier: 'scribe', description: 'Unlocked The Void.',                        requirement: { type: 'theme_unlocked', value: 'the-void' } },

  // ── Font Packs (8) ───────────────────────────────────────────────────────────
  { id: 'font-classical',  name: 'Classical',         type: 'font', tier: 'free',   description: 'Georgia & system serif. Familiar, timeless, easy on the eyes.',                        requirement: null },
  { id: 'font-typewriter', name: 'Typewriter',        type: 'font', tier: 'free',   description: 'Courier Prime. The draft as it was always meant to look.',                             requirement: { type: 'xp', value: 300 } },
  { id: 'font-lora',       name: 'Lora',              type: 'font', tier: 'scribe', description: 'Lora. A well-balanced serif made for long reading. Warm and literary.',                requirement: { type: 'level', value: 4 } },
  { id: 'font-palatino',   name: 'Palatino',          type: 'font', tier: 'scribe', description: 'EB Garamond. Renaissance origins. Elegant, refined, deeply readable.',                requirement: { type: 'words', value: 5000 } },
  { id: 'font-libre',      name: 'Libre Baskerville', type: 'font', tier: 'scribe', description: 'Libre Baskerville. Sturdy and classical. Built for the long haul.',                   requirement: { type: 'level', value: 7 } },
  { id: 'font-playfair',   name: 'Playfair',          type: 'font', tier: 'scribe', description: 'Playfair Display. High contrast, editorial. Your manuscript as a cover.',              requirement: { type: 'words', value: 20000 } },
  { id: 'font-crimson',    name: 'Crimson Text',      type: 'font', tier: 'scribe', description: 'Crimson Text. Designed specifically for long-form prose. Exceptional clarity.',        requirement: { type: 'level', value: 10 } },
  { id: 'font-im-fell',    name: 'Fell Type',         type: 'font', tier: 'scribe', description: 'IM Fell English. 17th century type with deliberate imperfection. For the romantics.',  requirement: { type: 'words', value: 50000 } },
]

export function requirementLabel(req: Unlockable['requirement']): string {
  if (!req) return 'Always unlocked'
  switch (req.type) {
    case 'level':
      return `Reach Level ${req.value}`
    case 'words':
    case 'words_written':
      return `Write ${Number(req.value).toLocaleString()} words`
    case 'battles_won':
      return `Win ${req.value} ${Number(req.value) === 1 ? 'battle' : 'battles'}`
    case 'race_30min':
      return 'Complete a 30-minute race'
    case 'xp':
      return `Earn ${Number(req.value).toLocaleString()} XP`
    case 'streak':
      return `Maintain a ${req.value}-day writing streak`
    case 'theme_unlocked':
      return 'Unlock The Void theme first'
  }
}

/** Build a toast message for unlockables granted outside a level-up (word/xp/streak milestones, etc). */
export function unlockToastMessage(ids: string[]): string {
  const names = ids
    .map((id) => UNLOCKABLES.find((u) => u.id === id)?.name)
    .filter((n): n is string => Boolean(n))
  if (names.length === 0) return ''
  return `Unlocked: ${names.join(', ')}`
}
