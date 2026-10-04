# CLAUDE.md — Rune

> This file is the product and engineering source of truth for Claude Code when working on Rune.
>
> Read it before making changes. Then inspect the actual code, migrations, and current branch before assuming a feature is already implemented.
>
> Product decisions in this file are intentional. Implementation details may lag behind them. When the code and this file differ, report the difference before changing architecture or behavior.

---

## 0. Rune 2.0 and How to Read This File

**`Rune 2.0 — Product & Domain Architecture v1.md`** (repository root) is the authoritative source for Rune 2.0 product and domain architecture. That covers Manuscript, Groups, Chapters, Scenes, Unplaced Scenes, Workspace, Pages, Collections, the pricing direction, progress, Arena's status, the mapping from canonical Pages, and staged retirement of legacy systems.

If this file and that document disagree about Rune 2.0 direction, the architecture document wins. Report the conflict.

Rune 2.0 is:

> **A special manuscript surrounded by a workspace the writer can shape however they think.**

Several sections below separate two things:

- **Current implementation reality:** what the deployed code does today. It is often load-bearing and compatibility-sensitive.
- **Rune 2.0 direction:** where the product is going.

Neither overrides the other by default.

> **Do not remove legacy systems solely because the new architecture deprecates them.** Follow the staged Rune 2.0 migration plan and preserve compatibility until an explicit implementation task removes them safely.

Legacy systems Rune 2.0 plans to retire, all still present in code:

- free-word allowance pricing and its enforcement (`save_page_checked`, `insert_page_checked`, `account_word_total`, editor input guards, offline-queue compatibility),
- XP, Levels, and XP/Level-based unlock requirements,
- Arena as a notable product area (now optional legacy functionality),
- Pages and canonical Pages as the manuscript-prose model (to be reinterpreted as Scenes).

Rune 2.0 decisions do not authorize implementation. Start Rune 2.0 migration work only when a task explicitly asks for it.

### Current state of the `rune-2` branch (closed-beta release candidate)

On `rune-2`, Rune 2.0 **is** the product. Treat this as the active truth when a later section still describes Rune 1.x:

- The app runs on the Rune 2.0 database (Manuscript, Groups, Chapters, Scenes, Unplaced Scenes, Workspace, Collections, Canvas). There are no `pages` and no canonical logic here.
- `/projects` is the home. The Rune 1.x Dashboard, Profile, Arena (`/games`) and legacy editor UI are deleted; their old URLs redirect (`src/lib/legacyRedirects.ts`). `/settings` is Rune 2.0 Settings. Pulse (`/pulse`) is the only surface left in the `(app)` group.
- Access is a **closed beta** (migration 052): invite-only, with a public front door (`/`) that explains the beta and runs the waitlist.
- The beta is **free and full-featured**. Billing code stays in the repository but is switched off (`BILLING_OPEN = false` in `src/lib/beta.ts`); free-word enforcement is off (migration 037).
- Onboarding is the Rune 2.0 journey in `src/app/(rune2)/onboarding` and `src/lib/onboarding.ts` (§7).
- Third-party marketing scripts (Meta Pixel, PromoteKit) load only on the public front door for signed-out visitors, never in the authenticated app (§9).
- Rune 1.x library code (`src/lib/xp.ts`, `src/lib/unlockables.ts`, word-limit RPCs, `src/lib/actions/*`) is still present for stale clients, tests and the staged retirement. Production (`main`) is still Rune 1.x until the release-candidate deploy.

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
- manuscript groups and chapters,
- scenes (placed and unplaced),
- revision notes,
- goals,
- progress,
- writing sessions,
- and a long-term relationship between the writer and the work.

That list is the current implementation. In Rune 2.0, manuscript prose lives in **Scenes**, placed in Chapters or kept as Unplaced Scenes, inside optional **Manuscript Groups**. A flexible **Workspace** of Pages, Folders, and Collections surrounds it. See the architecture document.

Do not copy competitors mechanically. Use comparisons only to clarify Rune’s purpose.

### Rune 2.0 priorities

1. Manuscript integrity.
2. An excellent writing experience.
3. A flexible supporting Workspace.
4. Complexity only when requested.
5. Protect attention.
6. Help writers finish.
7. The writer creates. Rune organizes.

### Progress, not gamification

> **Progress reflects the actual creative work. Gamification exists primarily to manufacture engagement.**

Rune 2.0 puts the first ahead of the second.

**Rune 2.0 direction:**

- XP and Levels are **not** part of Rune 2.0's product identity. That includes XP accumulation, level progression, XP bars, level-up framing, XP-based rewards, and level-based unlock conditions.
- Rune is not a progression RPG layered over writing software.
- Do not design a replacement XP economy.
- Real progress stays central: manuscript word count, writing sessions, writing history, Today’s Words or equivalent, project goals, completion progress, milestones, Focus Mode, writing-day history, and realistic progress toward finishing.
- Streaks may remain as underlying writing-history information. They are not a central pressure mechanism. Do not emphasize "don't break the streak."
- Arena is optional legacy functionality, not central (§12).

**Current implementation reality:** XP, Levels, and XP/Level unlock requirements still exist in code (for example `src/lib/xp.ts` and `src/lib/unlockables.ts`), as do Arena games. Leave them in place unless a task explicitly retires them.

Rune should never feel like a childish game, a neon gamer product, or a habit app wearing a literary skin.

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
- Reading Mode,
- manuscript fonts,
- themes,
- autosave,
- offline resilience,
- safe background sync.

#### Organize

- projects,
- manuscript groups, chapters and scenes,
- revision notes,
- the Workspace (pages, folders, collections, canvas),
- export and backup.

#### Return

- the Projects home,
- writing history (streaks as supporting history, not pressure),
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

Rune 2.0 adds a flexible Workspace around the manuscript, under Organize. Arena and XP/Level progression are not pillars. Arena stays as optional legacy functionality, and XP/Levels are to be retired.

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

Current product decisions (Rune 2.0, `src/lib/rune2/themes.ts`, the one colour registry):

- Themes are **Light** (the default), **Candlelight**, **Dark**, and **System** (Light or Dark from the OS). All are available to every writer; nothing is unlocked.
- The **writing surface** (the manuscript page) is a separate choice from the theme, as is the **accent** colour.
- Theme, surface, accent, manuscript font and spellcheck are account-wide preferences (`src/lib/rune2/preferences.ts`) and must persist.
- Feature CSS reads only semantic `--r2-*` tokens, never a palette or a theme name.
- Manuscript fonts apply to manuscript writing, not the entire application UI.

Rune 1.x Parchment/Candlelight themes with XP/Level unlocks are legacy (§13).

When changing theme-aware UI:

- use existing semantic variables,
- test every supported theme touched by the change,
- verify contrast in Light, Candlelight and Dark,
- do not hardcode light text that breaks light themes or gray text that disappears on dark themes.

---

## 6. Current Product Areas

Rune’s main experiences are:

### Projects home

`/projects` is the return point: the writer’s Projects, Project Trash, and the way into Settings. (The Rune 1.x Dashboard is retired; `/dashboard` redirects here.)

It should answer:

> What am I writing, and where do I pick it up?

Do not turn it into an analytics wall or a grid of equally weighted cards.

### Project shell and editor

The Project shell is the core of Rune: the Manuscript navigator, tabs, the Scene editor, the Inspector and panels, Reading Mode, and the Workspace around the manuscript.

The editor includes:

- TipTap editing, one Scene per editor instance,
- Groups, Chapters, placed and Unplaced Scenes,
- reliable saving and offline support,
- Scene History and Milestones,
- export (DOCX/PDF/Markdown/TXT) and project backup,
- theme, writing-surface and manuscript-font preferences.

The editor should remain calm and manuscript-first.

### Chapters and manuscript organization

Writers organize work through Manuscript Groups, Chapters and Scenes. Older Rune 1.x language (pages, canonical pages) describes `main` only.

Do not change counting, deletion, export, Scene placement, or chapter-order behavior casually. These systems affect manuscript integrity and totals.

**Current implementation reality:** in production (Rune 1.x, the `main` branch), a Chapter may mark one Page as canonical. When it does, only that Page counts toward manuscript totals and appears in export. On the `rune-2` branch the application runs on the Rune 2.0 schema instead: every placed Scene counts and exports, and there is no canonical logic (`src/lib/manuscript.ts`, `src/lib/manuscriptQueries.ts`, `src/lib/projectWordCount.ts`, `src/lib/export/projectExport.ts`).

**Rune 1.x data migration** (intended mapping only; not yet authorized to run):

- A Chapter with a canonical Page: the canonical Page becomes the Chapter’s placed Scene, and its non-canonical Pages become Unplaced Scenes.
- A Chapter without a canonical Page: its Pages become placed Scenes in their existing order.
- Rune 2.0 stores Scenes in a `scenes` table, owned by a `manuscripts` row (one per Project); Chapters belong to the Manuscript. That schema exists on the new, empty Rune 2.0 database (migration 015). Production keeps `pages` until the Rune 1.x data migration, and each Page ID becomes its Scene ID.
- Unplaced Scenes are real manuscript prose. They are excluded from the ordered manuscript total and from default export, but new writing in them counts toward writing activity (Today’s Words, writing days, sessions).
- Scene numbers like `31.2` are derived presentation, never stored identity.
- The beta keeps one Scene per editor instance. Do not rebuild the editor as a continuous multi-Scene document.
- Titled Manuscript Groups appear as headings in standard export by default.
- Workspace Pages (freeform documents writers call “Pages”) must **not** be stored in the `pages` table. Use a clearly distinct physical name such as `workspace_documents`.

### Revision Notes

**Current implementation reality:** in production (`main`), Revision Notes are a project-scoped, lightweight checklist (`project_notes`). On the `rune-2` branch, Revision Notes are one feature (`revision_notes`, migrations 039–040): notes on the Manuscript, a Group, a Chapter or a Scene, shown by manuscript level in the Revision Notes panel (never the Inspector), with a Reading Mode quick-add. 040 copied the open checklist items into Manuscript notes and left `project_notes` untouched for the remaining Rune 1.x pages. See architecture §30.

**Rune 2.0 direction:** Revision Notes stay their own system for the beta. Do not migrate them into Workspace Pages or Collections. Folding them into a revision workflow later is deferred.

### Progress

Progress should communicate movement toward a finished manuscript, not create pressure for constant output.

### Profile (retired)

The Rune 1.x Profile page (level, unlockables, heatmap, streaks) is deleted on `rune-2`; `/profile` redirects to Settings. Do not add Level prominence or level-based features anywhere.

### Arena (retired UI)

The Rune 1.x Arena UI (Race Yourself, Battle Mode) is deleted on `rune-2`; `/games` redirects to Projects. Its server code and tables (for example `game_tickets`, guarded by migration 054) remain for compatibility. Do not rebuild Arena or let it shape core architecture without an explicit task.

There is no global “Game Mode” that should take over the application shell. Do not reintroduce a global normal/focus/game mode system.

### Settings

Settings manages account, appearance (theme, writing surface, accent), manuscript preferences, unsent drafts, the About/beta note, and account deletion. There is no subscription UI during the closed beta.

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

Rune onboarding is a short transition into Rune, not a generic setup wizard.

### Current journey (Rune 2.0, closed beta)

Implemented in `src/app/(rune2)/onboarding/page.tsx`, `src/components/rune2/Onboarding.tsx` and `src/lib/onboarding.ts`, backed by `account_onboarding` (migration 052):

1. Welcome
2. Path: start a new Project, or import an existing manuscript
3. Title (new) or Import
4. The mental model: the Manuscript, and the Workspace around it
5. Appearance (optional)
6. Arrival

It runs once per account. The (rune2) layout has already required sign-in, beta access and a pen name before it.

### Principles that still apply

- Rune respects the writer’s authorship: **“Your words remain your own.”** Rune will never use AI to write, rewrite, or complete the story.
- Perfection is not required; the writer should feel they have a place to return to.
- Where the account is in the journey is **server state** (`account_onboarding`). A refresh resumes; a completed journey (or an account from before onboarding existed) goes to Projects.
- The Project is created by **one authoritative server operation**. Once it exists, the journey resumes after it — never a second Project. Avoid duplicate projects and route/save race conditions.
- Choosing an appearance re-themes onboarding immediately and persists into the app. Do not duplicate theme definitions inside onboarding.
- Never put project titles, imported text or any writing into analytics.

### Rune 1.x onboarding (legacy, `main` only)

The Rune 1.x journey (title, optional first sentence, Parchment/Candlelight choice, a private letter to the writer’s future self, AppShell transitions) is deleted on `rune-2`. Any stored future letters remain private: never place their contents in analytics, Pulse, logs, Meta, AI systems or public UI. Do not resurrect the old cinematic AppShell transition architecture.

### Phones and device handoff

- Authentication and required profile completion remain accessible on phones.
- The application, onboarding included, sits behind the supported-device gate (`src/components/layout/SupportedDeviceGate.tsx`); a phone sees the waiting room.
- The full app remains a desktop/supported-tablet experience.
- Cross-device state must be durable and server-backed. Do not rely on browser storage as the source of truth.

---

## 8. Pricing and Entitlements

### Rune 2.0 direction

Rune 2.0 is a **subscription product with a time-based, full-product trial**. See §43 of the architecture document.

- The trial is likely about one month. The **length is provisional**; do not hardcode "30 days" as a product requirement.
- The **future price is not final**.
- During the trial, writers use the real Rune, not a deliberately crippled version.
- Rune 2.0 is **not** designed around a free manuscript word allowance, the 2,000-word limit, the 15,000-word legacy allowance as a long-term model, blocking words past a threshold, word-count-based free/paid distinctions, or free-project limits.
- Do not design new features (Unplaced Scenes, Workspace Pages, and so on) around free-word allowance enforcement.

**Not yet decided.** Do not invent answers to these:

- trial length and price,
- what access remains after a trial ends without converting, beyond reading and export,
- existing-subscriber and Stripe migration,
- legacy entitlements and cohorts,
- grandfathering, including the Founding Scribe offer,
- trial conversion,
- cancellation behavior.

These must be settled before billing changes ship.

**Staged retirement.** Current word-limit enforcement is deeply built into `save_page_checked`, `insert_page_checked`, `account_word_total`, editor input guards, IndexedDB/offline-queue compatibility, and stale deployed clients. Dropping the product requirement does **not** mean removing that enforcement.

The Rune 2.0 migration initially keeps the load-bearing RPC signatures and database contracts, so stale clients and queued offline saves keep working. Enforcement is retired in later stages, each through its own explicit task.

**Stage reached on the `rune-2` branch (Rune 2.0 database, migration 037):** enforcement is off. `free_word_limit_for_caller()` answers "no limit", so no save, creation, import, duplication or restore is gated; the checked RPCs keep their signatures and result shapes; `account_word_total` stays as a metric; the editor input guards and free-word notices are removed.

### Closed beta (current, `rune-2`)

- The closed beta is **free and full-featured**: no trial, no subscription, no feature lock, no upgrade prompt.
- `BILLING_OPEN = false` (`src/lib/beta.ts`) gates every checkout path. Stripe code stays in the repository, switched off. The Rune 1.x pricing table, paywalls and returning-writer pricing notice are deleted from the UI.
- Do not reopen billing, or show prices, without an explicit billing task that settles the open decisions above.

### Rune 1.x pricing (legacy, production `main` only)

Everything below describes the word-allowance pricing still deployed on `main`. It is **not** the model on `rune-2` and must not guide new work. It is kept because existing writers were promised it and stale clients depend on its contracts. (Earlier tiers such as Arcane no longer exist anywhere.)

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

These apply now and continue under Rune 2.0 unless a bullet is marked current-model only.

- The server is authoritative.
- Users must not be able to modify their pricing cohort.
- Client-provided Stripe Price IDs must not be trusted.
- Reading and export must remain available above a free limit, and when a trial or subscription ends.
- Never delete, truncate, hide, or corrupt a manuscript because a subscription ends.
- Current model only: above-limit free users may be prevented from adding words according to existing enforcement behavior.
- Current model only: word-limit resolution must be centralized.
- Current model only: pricing cohorts should be explicit, such as `legacy_15k` and `starter_2k`.

Inspect the branch before assuming any schema, Stripe Price, notice, enforcement, or trial change exists.

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

Rune 2.0 pricing and XP retirement do not change existing events. For example, `reached_2000_words` and `reached_15000_words` stay as milestones. Trial-related events are not defined yet. Add them only through an explicit analytics task.

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

### Third-party marketing scripts

Meta Pixel and PromoteKit render only through `src/components/MarketingTrackers.tsx`, which only the public front door (`src/app/(front)/page.tsx`) mounts, and only for signed-out visitors. `MARKETING_PATHS` in `src/lib/meta-pixel.ts` stops pixel events from firing anywhere else, including after a client-side navigation into the app. Never mount them in the root layout or any authenticated surface (Projects, the Project shell, Settings, onboarding, Pulse). First-party analytics are separate and unaffected. If their scope changes, update the Privacy Policy in the same change.

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

### Live migration state

Before making claims about which Rune 2.0 migrations are applied, query the live Rune 2.0 migration ledger when access is available:

```bash
npm run db:migrations    # tools/db-audit/migration-status.mjs — read-only
```

It reads `public.schema_migrations` through GET requests only. It refuses to read a database that has a `pages` table (Rune 1.x or production). It also refuses a database that lacks `manuscripts` or `scenes`, and a project that doesn't match `RUNE2_SUPABASE_PROJECT_REF` when that variable is set.

Git history, migration files in the repository, `STAGING.md`, memory notes, prior task reports, and whether changes are committed describe the **repository**, not the database. Never infer applied state from them.

If the check refuses or cannot run, say exactly: **"Live migration state was not verified."** Never report a migration as unapplied unless the live ledger shows that.

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

**Rune 2.0 direction:**

- XP-eligible words and the free-tier allowance are legacy concepts to be retired in stages. They are not removed as collateral work.
- Rune 2.0 adds **Unplaced Scene words**. They are excluded from the ordered manuscript total and default export, but new writing in them counts toward writing activity (Today’s Words, writing days, streak/history, sessions).
- Manuscript totals, Today’s Words, sessions, goals, and milestones remain central.

The word-limit RPCs (`save_page_checked`, `insert_page_checked`, `account_word_total`) sit on the save path, and stale clients and queued offline saves depend on them. Do not change their signatures or remove them outside an explicit, staged retirement task.

When fixing a count discrepancy, trace every source rather than patching one display.

---

## 12. Focus Mode and Arena

### Focus Mode

The Rune 1.x editor’s Focus Mode is gone with that editor. The Rune 2.0 Project shell has no Focus Mode today; Reading Mode is the distraction-free reading surface. If Focus Mode returns, it belongs to the editor.

Do not reintroduce a global application mode toggle that treats normal, focus, and game as equivalent shell states.

Inspect the current Project shell before changing navigator, tab, panel, toolbar, keyboard-shortcut or escape behavior.

### Arena

The Arena UI is retired on `rune-2` (§6). Its server code and tables remain for compatibility; preserve them unless a task explicitly concerns Arena. Do not let Arena styling or mechanics leak into the editor or onboarding.

---

## 13. Unlockables and Progression

**On `rune-2`:** every theme, writing surface, accent and manuscript font is available to every writer (§5). There is no unlock UI, no Profile, no XP bar and no level-up framing.

**Still in code (legacy):** the Rune 1.x unlockable registry and grant logic (`src/lib/unlockables.ts`, `src/lib/actions/unlockables.ts`) and XP (`src/lib/xp.ts`, `src/lib/actions/xp.ts`). The Scene editor (`src/components/editor/useSceneEditor.ts`) still awards project XP in the background. Do not remove this, or the recorded unlocks, until an explicit retirement task does; existing users must not lose earned unlocks.

Do not design a replacement XP economy. If unlocks return, their model is **not decided** (subscription-included, writing milestones, or achievements tied to creative work).

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
- Test Light, Candlelight and Dark when touching shared UI.
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
- do not refactor the saving system during a visual task,
- do not design a replacement XP economy,
- do not build a full Version History UI for the Rune 2.0 beta, but do not make one harder to add later,
- do not begin Rune 2.0 migrations or retire legacy systems (word limits, XP/Levels, canonical Pages, Arena) unless the task explicitly asks.

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
- Light, Candlelight and Dark,
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

1. Read this file, and for Rune 2.0 work, `Rune 2.0 — Product & Domain Architecture v1.md`.
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
- Reading and export remain available above free limits, and when a trial or subscription ends.
- Manuscript content must never appear in analytics or logs.
- Rune must not use AI to write, rewrite, or complete a writer’s story.
- Saving reliability outranks animation and polish.
- Offline resilience and safe sync must not be weakened, including for stale clients and queued offline saves during Rune 2.0 migration.
- Desktop onboarding must not be degraded while building a separate mobile presentation.
- Existing users must not lose the allowance they were originally promised. How that promise carries into the Rune 2.0 subscription model is an open business decision; do not resolve it unilaterally.
- Existing users must not lose manuscript content, alternate drafts, or earned unlocks in any Rune 2.0 migration.
- Server-side state controls subscriptions, trials, pricing cohorts, and founder eligibility, with RLS on user data.
- Do not create duplicate projects during onboarding or retries.
- Rune 2.0 migrations are staged and compatibility-safe. Legacy systems are not removed only because they are deprecated.
- Do not add features merely because they are technically possible.