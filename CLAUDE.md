# CLAUDE.md — Rune

> This file is the product and engineering source of truth for Claude Code when working on Rune.
>
> Read it before making changes. Then inspect the actual code, migrations, and current branch before assuming a feature is already implemented.
>
> Product decisions in this file are intentional. Implementation details may lag behind them. When the code and this file differ, report the difference before changing architecture or behavior.

---

## 1. What Rune Is

Rune is a **writing companion and manuscript workspace built for novelists**.

It gives fiction writers a calm place to:

- write,
- organize a manuscript,
- see meaningful progress,
- return consistently,
- and finish a story.

Rune is not primarily a generic document editor, productivity app, note-taking tool, or game.

Its identity is:

- literary,
- calm,
- premium,
- intentional,
- quietly motivating,
- influenced by dark academia without being trapped by it.

A useful positioning line is:

> **A home for writing novels.**

A useful supporting line is:

> **A writing companion built for novelists. Write, organize, and finish your story.**

### The central promise

Rune should help writers cross the distance between wanting to write a novel and actually finishing one.

The product should make the writer feel:

- their story matters,
- their manuscript is safe,
- beginning is possible,
- returning is natural,
- progress is visible,
- their words remain their own.

---

## 2. Product Philosophy

### The manuscript comes first

The most important product rule is:

> **Protect the manuscript before optimizing anything else.**

When choosing between implementations, prefer the one that:

1. protects manuscript integrity,
2. preserves reliable saving and recovery,
3. reduces writing friction,
4. increases the chance the writer returns,
5. preserves calm focus,
6. avoids feature creep and unnecessary architecture.

Never trade saving reliability for animation, novelty, or polish.

### Rune is not a blank document

General document tools treat a novel as a file.

Rune treats a novel as a manuscript made of:

- projects,
- chapters,
- pages,
- canonical pages,
- revision notes,
- goals,
- progress,
- writing sessions,
- and a long-term relationship between the writer and the work.

Do not copy competitors mechanically. Use comparisons only to clarify Rune’s purpose.

### Gamification is supportive, not the identity

Rune contains progression and Arena experiences, but Rune should never feel like a childish game, a neon gamer product, or a habit app wearing a literary skin.

Gamification exists to help defeat the blank page and create momentum.

It must remain:

- optional,
- restrained,
- understandable,
- secondary to the manuscript.

### AI and authorship

Rune’s product principle is explicit:

> **Rune will never use AI to write, rewrite, or complete a writer’s story.**

Do not:

- add AI-generated prose,
- add AI completion to the editor,
- add AI rewriting,
- send manuscript text, first sentences, private letters, or revision notes to AI services,
- imply that Rune will replace the writer’s voice.

The approved onboarding language is:

> **Your words remain your own.**  
> Rune will never use AI to write, rewrite, or complete your story.

This promise is specifically about the writer’s manuscript and creative writing experience. Do not broaden it into claims about every internal business process unless that has been explicitly decided.

---

## 3. Audience and Positioning

### Primary audience

Rune is built first for people writing long-form fiction, especially novelists.

Do not position Rune primarily for:

- bloggers,
- students,
- journalists,
- marketers,
- general note-taking,
- generic productivity,
- business documentation.

Those users may still find value, but the product and copy should speak first to novelists building manuscripts.

### Core transformation

Users are not buying isolated features. They are moving:

- from scattered writing to a structured manuscript,
- from avoidance to a first sentence,
- from inconsistent effort to visible momentum,
- from an endless document to chapters and pages,
- from fragile browser writing to offline-resilient manuscript work,
- from an unfinished idea to a completed story.

### Product pillars

Use these pillars to organize product decisions and marketing.

#### Write

- literary editor,
- Focus Mode,
- manuscript fonts,
- themes,
- autosave,
- offline resilience,
- safe background sync.

#### Organize

- projects,
- chapters,
- pages,
- canonical pages,
- revision notes,
- manuscript structure,
- export.

#### Return

- Today’s Focus,
- streaks,
- writing history,
- goals,
- progress,
- gentle prompts,
- clear next actions.

#### Finish

- manuscript totals,
- project progress,
- milestones,
- revision support,
- exports,
- completion-oriented statistics.

Arena and progression support these pillars. They are not a separate reason for Rune to exist.

---

## 4. Brand Voice

### Product tone

Rune should feel:

- premium,
- calm,
- literary,
- serious,
- warm,
- focused,
- elegant,
- quietly encouraging.

Rune should not feel:

- generic SaaS,
- childish,
- loud,
- cluttered,
- neon,
- productivity-bro,
- manipulative,
- AI-hype-driven,
- overly cute,
- self-important.

### Copy principles

Clarity comes before poetry.

A new visitor should understand quickly that Rune is for writing novels.

Prefer concrete language such as:

- “A home for writing novels.”
- “A writing companion built for novelists.”
- “Write, organize, and finish your story.”
- “Chapters, pages, goals, and progress.”
- “Your words remain your own.”
- “Your desk is ready.”

Poetic language is appropriate when it deepens an already clear experience. It should not conceal meaning.

Before approving copy, ask:

> Does this make Rune clearer or more emotionally meaningful, or is it merely decorative?

### Emotional design

Rune may create ritual, recognition, and atmosphere.

It must not use:

- fake urgency,
- guilt,
- pressure,
- streak anxiety,
- manipulative scarcity,
- forced celebration,
- excessive animation.

The writer should feel seen, not managed.

---

## 5. Design Principles

Rune’s visual language is literary and premium, with dark-academia influence.

The current product includes multiple themes. Do not reduce Rune to one fixed dark palette.

### Approved design direction

Use:

- serif type for manuscript text, headings, wordmarks, and emotional moments,
- sans-serif type for controls, metadata, and dense interface text,
- generous whitespace,
- restrained borders,
- subtle depth,
- theme-aware semantic tokens,
- strong hierarchy,
- purposeful transitions.

Avoid:

- card grids as the default solution,
- boxes around every section,
- excessive outlines,
- dense dashboards,
- decorative copy that pushes important content below the fold,
- generic SaaS gradients,
- neon game styling,
- arbitrary hardcoded colors.

### Containment rule

Use the lightest container that clearly communicates structure.

A section does not automatically need a card.

Cards are appropriate when they represent a distinct object or action. They should not be used merely to fill space.

### Theme system

The codebase, theme registry, and CSS variables are the source of truth for exact colors and tokens.

Do not copy stale color values from this file into implementation.

Current product decisions include:

- **Parchment** is the default writing space.
- **Candlelight** is available to all writers.
- Additional themes are unlocked through writing and progression.
- Theme selection should persist.
- Unlocking a theme must not automatically switch the active theme.
- Editor/manuscript font unlocks apply to manuscript writing, not the entire application UI.

When changing theme-aware UI:

- use existing semantic variables,
- test every supported theme touched by the change,
- verify contrast in both Parchment and Candlelight,
- do not hardcode light text that breaks light themes or gray text that disappears on dark themes.

---

## 6. Current Product Areas

Rune’s main experiences are:

### Dashboard

A calm return point centered on the writer’s current manuscript.

Current concepts include:

- Your Story hero,
- Continue Writing action,
- Today’s Focus,
- Today’s Words,
- total manuscript words,
- streak,
- manuscript goal,
- project progress,
- a compact path into supporting tools.

The Dashboard should answer:

> What am I writing, where did I leave off, and what should I do next?

Do not turn it into an analytics wall or a grid of equally weighted cards.

### Editor

The editor is the core of Rune.

It includes:

- TipTap manuscript editing,
- chapters and pages,
- canonical pages,
- reliable saving,
- offline support,
- export,
- Focus Mode,
- theme and manuscript-font preferences.

The editor should remain calm and manuscript-first.

### Chapters and manuscript organization

Writers organize work through projects, chapters, pages, and canonical-page behavior.

Do not change counting, deletion, export, canonical-page, or chapter-order behavior casually. These systems affect manuscript integrity and totals.

### Progress

Progress should communicate movement toward a finished manuscript, not create pressure for constant output.

### Profile

Profile represents writer growth and long-term progress.

Current concepts include:

- level,
- unlockables,
- heatmap,
- total words,
- current and best streak,
- projects,
- sessions,
- manuscript records,
- estimated pages.

Keep the hierarchy compact. Level may be prominent; statistics should not overwhelm the page.

### Arena

Arena contains optional writing experiences such as:

- Race Yourself,
- Battle Mode.

Arena is separate from the normal editor experience.

There is no global “Game Mode” that should take over the application shell.

Do not reintroduce a global normal/focus/game mode system.

### Settings

Settings manages account, appearance, manuscript preferences, subscription, and account deletion.

Do not place experimental or founder-only pricing in ordinary Settings unless a task explicitly requires it.

### Pulse

Pulse is the private founder analytics dashboard.

It is admin-gated and exists to answer practical product questions about:

- acquisition,
- activation,
- progression,
- retention signals,
- subscriptions,
- recent writers.

Pulse is not a user-facing feature.

Do not weaken its admin protection or expose private writer content.

---

## 7. Onboarding

Rune onboarding is an emotional journey, not a generic setup wizard.

### Approved onboarding journey

The approved stages are:

1. Story title
2. Recognition interlude
3. Optional first sentence
4. Momentum interlude
5. Writing-space choice
6. Explicit authorship and AI interlude
7. Invitation to write a letter to the writer’s future self
8. Optional private letter
9. Final arrival
10. Authoritative project, chapter, and page creation
11. Editor tutorial on a supported device

### Emotional purpose

The onboarding should make the writer feel:

- starting a novel is significant,
- they have already taken a real step,
- perfection is not required,
- Rune respects their authorship,
- they have a place to return to.

Approved ideas and language include:

- “It has a name now.”
- “The first sentence is often the hardest.”
- “It does not need to be perfect. It only needs to exist.”
- “Stories are not finished in a day. They are finished one page at a time.”
- “Your words remain your own.”
- “Your desk is ready.”

### First sentence

The first sentence is optional.

If skipped:

- create a valid empty first page,
- do not record `first_sentence_written`,
- do not shame the writer,
- do not create fake content.

If written:

- preserve the writer’s exact text,
- use canonical word-count behavior,
- never include the text in analytics.

### Writing-space choice

Onboarding offers:

- Parchment,
- Candlelight.

Selecting a writing space should immediately retheme the entire onboarding experience and persist into the editor.

Do not duplicate theme definitions inside onboarding.

### Future letter

The future letter is optional and private.

It may be stored with a future reveal date, but the reveal experience is a separate feature unless explicitly requested.

Never place the letter’s contents in:

- analytics,
- Pulse,
- logs,
- Meta,
- AI systems,
- public UI.

### Creation architecture

Do not create the manuscript incrementally across onboarding screens.

Use one authoritative final server operation to create the initial:

- project,
- chapter,
- page,
- optional first sentence,
- selected theme,
- optional future letter.

Avoid duplicate projects and route/save race conditions.

Do not resurrect older cinematic AppShell transition architecture.

### Mobile onboarding and device handoff

Approved product behavior:

- authentication and required profile completion remain accessible on phones,
- new users may complete onboarding on a phone,
- mobile onboarding should use a purpose-built mobile presentation rather than a compressed desktop layout,
- desktop onboarding should remain visually unchanged when mobile presentation work is done,
- after successful phone onboarding, show the phone waiting room,
- the full editor and application remain desktop/supported-tablet experiences,
- a mobile-onboarded writer’s first supported-device visit should go directly to the initial editor exactly once,
- the editor tutorial remains pending until that supported-device entry.

This cross-device state must be durable and server-backed.

Do not rely on browser storage as the source of truth.

---

## 8. Pricing and Entitlements

### Approved pricing direction

The approved model is:

#### New writers

- one free manuscript,
- first **2,000 real manuscript words free**,
- no card required,
- Scribe required to continue adding words after the limit.

#### Existing writers

Users who existed before the pricing migration retain:

- one free manuscript,
- their original **15,000-word allowance**.

This legacy allowance must be durable and explicit. Do not infer it repeatedly from account creation dates.

#### Scribe

- standard monthly price: **$9.99/month**,
- active Scribe writers retain the existing paid entitlements in code.

Do not change other tier entitlements unless a task explicitly asks.

### Founding Scribe offer

Eligible legacy writers receive one in-app offer:

- **$6.99/month**,
- shown only in the one-time returning-user pricing notice,
- not emailed,
- not shown publicly,
- not shown in ordinary Settings or standard paywalls,
- retained while the original subscription remains continuously active,
- unavailable again after decline, successful claim, or later cancellation.

The returning-user notice must clearly state:

- new writers receive 2,000 free words,
- the legacy writer keeps 15,000 free words,
- nothing is being taken away,
- the founder price is a one-time opportunity,
- keeping the free allowance is a respected choice.

### Entitlement principles

- The server is authoritative.
- Users must not be able to modify their pricing cohort.
- Client-provided Stripe Price IDs must not be trusted.
- Reading and export must remain available above a free limit.
- Never delete, truncate, hide, or corrupt a manuscript because a subscription ends.
- Above-limit free users may be prevented from adding words according to existing enforcement behavior.
- Word-limit resolution must be centralized.
- Pricing cohorts should be explicit, such as `legacy_15k` and `starter_2k`.

These decisions may be pending implementation. Inspect the branch before assuming the schema, Stripe Price, notice, or enforcement changes already exist.

---

## 9. Analytics and Privacy

Rune uses first-party analytics to understand the product funnel.

Core event names include:

- `signup_completed`
- `email_verified`
- `onboarding_started`
- `project_created`
- `first_sentence_written`
- `onboarding_completed`
- `first_save`
- `second_session`
- `third_session`
- `reached_100_words`
- `reached_500_words`
- `reached_1000_words`
- `reached_2000_words`
- `reached_5000_words`
- `reached_10000_words`
- `reached_15000_words`
- `second_writing_day`
- `third_writing_day`
- `export_used`
- `arena_played`
- `note_created`
- `subscription_started`
- `account_deleted`

Before adding or renaming events, inspect the typed analytics registry and Pulse queries.

Event names and semantics are contracts. Do not casually rename them.

### Funnel rules

Pulse uses cohort-consistent funnel logic anchored to signup events.

Do not mix historical totals into clean acquisition cohorts.

If a stage becomes optional, do not leave it as a mandatory linear funnel stage without addressing the resulting interpretation.

### Onboarding metadata

Approved non-sensitive onboarding completion metadata may include:

- whether the first sentence was skipped,
- whether a future letter was written.

Never store:

- first-sentence text,
- future-letter text,
- project title,
- manuscript text,
- pen name,
- private notes,
- payment information

inside analytics metadata.

### Attribution

Preserve first-touch attribution behavior and existing UTM/fbclid capture.

Do not change attribution semantics while working on unrelated features.

### Pulse privacy

Pulse may show operational writer information needed by the founder, but it must never expose manuscript prose, private letters, or sensitive writing content.

---

## 10. Technical Foundation

### Current stack

- Next.js **16**
- App Router
- TypeScript
- Supabase Auth and Postgres
- Row Level Security
- server actions and route handlers
- TipTap
- Zustand where appropriate
- IndexedDB for offline resilience
- Stripe
- CSS variables and theme classes
- Vercel deployment

Do not downgrade the framework or recreate patterns from the original Next.js 14 scaffold.

Before changing dependencies, inspect `package.json` and the current lockfile.

Do not upgrade packages merely because a newer version exists.

### Routes

Folders in parentheses are route groups and do not appear in URLs.

Use actual route paths such as:

- `/dashboard`
- `/projects`
- `/games`
- `/profile`
- `/settings`
- `/pulse`

Never invent `/app/...` URL prefixes for the `(app)` route group.

Inspect the current route tree rather than relying on an old static project map.

### Authentication and profile completion

Preserve the current order of:

- authentication,
- email verification,
- required profile completion,
- onboarding eligibility,
- device gating,
- protected application access.

Avoid redirect loops.

Do not bypass pen-name completion or phone waiting-room rules.

### Database

The database has expanded beyond the original MVP schema.

The current migrations and canonical schema are the source of truth.

Do not assume the only tables are the original profiles/projects/chapters/pages/game tables.

When schema changes are required:

- create a committed migration,
- update the canonical schema if the repository maintains one,
- include RLS,
- include indexes and constraints where needed,
- provide exact rollout instructions,
- do not modify production directly,
- do not expose service-role credentials.

### Environment variables

Inspect the existing environment validation and example files.

Do not assume Supabase variables are the only required values.

Never hardcode:

- Stripe Price IDs,
- secrets,
- service-role keys,
- admin credentials,
- production URLs.

### Source of truth

Prefer:

- one canonical word-count helper,
- one canonical entitlement resolver,
- one canonical theme registry,
- one typed analytics event registry,
- one authoritative server creation path,
- one durable tutorial/onboarding state.

Avoid duplicated constants and parallel implementations.

---

## 11. Saving, Offline Work, and Word Counting

Saving reliability is one of Rune’s highest-risk systems.

### Saving principles

Preserve:

- debounced editor saves,
- local baseline behavior,
- IndexedDB offline storage,
- background synchronization,
- silent retry where appropriate,
- safe handling of zero-word resets,
- canonical server reconciliation,
- deletion and recalculation behavior.

Do not change autosave or offline sync as collateral work in an unrelated prompt.

### Word-count principles

Rune has multiple word concepts:

- manuscript totals,
- Today’s Words,
- XP-eligible words,
- free-tier allowance,
- pasted/imported words,
- game-session words,
- milestones.

Do not assume they all use the same inclusion rules.

Current product decisions include:

- pasted/imported writing contributes to manuscript totals and export,
- pasted/imported writing does not contribute to XP, Today’s Words, or unlockables,
- free-tier enforcement must preserve the current definition of countable manuscript words unless explicitly changed,
- server enforcement is authoritative.

When fixing a count discrepancy, trace every source rather than patching one display.

---

## 12. Focus Mode and Arena

### Focus Mode

Focus Mode belongs to the editor.

It should remove distractions and preserve a clean writing environment.

Do not reintroduce a global application mode toggle that treats normal, focus, and game as equivalent shell states.

Inspect the current editor implementation before changing:

- sidebar behavior,
- page/chapter navigation,
- toolbar behavior,
- keyboard shortcuts,
- focus escape behavior.

### Arena

Arena is a separate optional area for writing games.

Current games include:

- Race Yourself,
- Battle Mode.

Preserve current game logic unless the task explicitly concerns Arena.

Do not let Arena styling or mechanics leak into the normal editor or onboarding.

---

## 13. Unlockables and Progression

Rune includes unlockable:

- themes,
- avatars,
- manuscript fonts.

The static unlockable registry and grant logic in the current code are authoritative.

Do not rely on the original four-theme/five-avatar MVP list.

Current decisions include:

- Parchment and Candlelight are available early,
- Manuscript is a neutral early font unlock,
- premium and progression-based unlockables remain part of Scribe/engagement design,
- fonts affect manuscript writing, not the entire UI,
- unlock persistence and grant logic must remain reliable,
- unlocking an item should not silently change the active selection.

When modifying unlockables:

- audit every registry item,
- audit grant conditions,
- audit persistence,
- audit toasts,
- audit profile/settings display,
- verify existing users do not lose valid unlocks.

---

## 14. Engineering Conventions

### General

- Read existing code before proposing architecture.
- Prefer focused changes over broad rewrites.
- Reuse existing helpers and components.
- Keep business logic server-authoritative.
- Use TypeScript types rather than untyped metadata.
- Preserve current route and data semantics unless the task explicitly changes them.
- Report uncertainty rather than inventing schema or behavior.

### UI

- Use existing bespoke components and CSS variables.
- Do not introduce a UI library without explicit approval.
- Use semantic theme tokens.
- Support keyboard navigation and screen readers.
- Respect reduced-motion preferences.
- Test Parchment and Candlelight when touching shared UI.
- Do not rely on hover for required mobile interactions.

### Client and server

- Client components using hooks require `"use client"`.
- Server actions require `"use server"`.
- Use the established Supabase client for each environment.
- Do not expose secrets to the browser.
- Do not make sensitive entitlement decisions from client state.
- Do not trust arbitrary IDs or price values supplied by the client.

### Editor

- Preserve TipTap JSON compatibility.
- Do not move editor rendering into an unsafe SSR path.
- Use the established editor loading strategy in the current code.
- Do not bypass save debouncing or offline safeguards.
- Never log manuscript content.

### Browser storage

Do not use `localStorage` or `sessionStorage` as the authoritative source for:

- authentication,
- onboarding completion,
- tutorial completion,
- pricing cohort,
- founder-offer eligibility,
- subscription state,
- cross-device state.

Temporary UI recovery may use existing browser storage patterns when a task explicitly permits it, but durable state must live server-side.

---

## 15. Scope Control

Do not add speculative systems because they may be useful later.

Examples:

- do not build a broad notification framework for one notice,
- do not build an AI layer,
- do not build a general onboarding engine,
- do not build full mobile editor support,
- do not build future-letter resurfacing unless requested,
- do not build 1v1 multiplayer unless requested,
- do not redesign Pulse during an unrelated analytics change,
- do not refactor the saving system during a visual task.

When a prompt identifies a deferred feature, preserve a clean path for it without implementing it prematurely.

---

## 16. Required Verification

For meaningful changes, run the relevant subset of:

- `npx tsc --noEmit`
- targeted ESLint
- `npm run build`
- relevant automated tests
- `git diff`

Also perform focused manual verification for the affected flow.

For database or Stripe changes, provide:

- exact migration files,
- required environment variables,
- safe rollout order,
- production smoke-test steps,
- known race windows or compatibility risks.

For visual changes, verify:

- desktop,
- supported tablet where relevant,
- phone where relevant,
- Parchment,
- Candlelight,
- keyboard access,
- reduced motion,
- contrast.

For editor changes, verify:

- typing,
- paste,
- autosave,
- refresh,
- offline behavior where relevant,
- word counts,
- export,
- no manuscript loss.

---

## 17. Before Every Task

Before coding:

1. Read this file.
2. Inspect the actual implementation and current branch.
3. Identify whether the requested product decision is already implemented, partially implemented, or pending.
4. State the smallest safe plan.
5. Call out any conflict between the prompt, this file, and current code.
6. Preserve manuscript integrity and existing user trust.
7. Avoid unrelated changes.

After coding:

1. Report files changed.
2. Report behavior changed.
3. Report behavior intentionally left unchanged.
4. Report migrations and environment variables.
5. Report verification results.
6. Report unresolved risks honestly.

---

## 18. Non-Negotiables

- A writer’s manuscript must never be trapped, deleted, or corrupted by pricing changes.
- Reading and export remain available above free limits.
- Manuscript content must never appear in analytics or logs.
- Rune must not use AI to write, rewrite, or complete a writer’s story.
- Saving reliability outranks animation and polish.
- Desktop onboarding must not be degraded while building a separate mobile presentation.
- Existing users must not lose the allowance they were originally promised.
- Server-side state controls subscriptions, pricing cohorts, and founder eligibility.
- Do not create duplicate projects during onboarding or retries.
- Do not add features merely because they are technically possible.