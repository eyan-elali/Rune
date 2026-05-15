# CLAUDE.md — Rune

> This file is the source of truth for Claude Code when building Rune. Read it in full before every session. It describes what Rune is, how it is built, and the conventions that must be followed consistently across all prompts.

---

## What Is Rune?

Rune is a **web-based, gamified text editor for writers**. It is a Mac-first, local-first application built with Next.js and deployed to the web. Its aesthetic is **Dark Academia**: warm browns, antique gold, serif type, candlelight — the feeling of writing in a library at midnight.

Rune solves a specific problem: writers struggle to sit down and produce a first draft. Rune gamifies that act. Once a draft exists, Rune's distraction-free tools help them shape it.

### Modes
- `normal` — default. Full UI. No special behavior.
- `focus` — Sidebar, Header, and PageList unmounted entirely. Editor is fullscreen.
  Exit: Escape key, or hover top-right corner to reveal the ModeToggle.
- `game` — game HUD active (built in Prompts 10–11).

modeStore default: 'normal'
Toggle: two-button pill (Focus | Game). Clicking the active button returns to 'normal'.
ModeToggle is a shared component at src/components/ui/ModeToggle.tsx — used in Header (normal/game) and the Focus hotzone.

| Mode           | Purpose                              | Philosophy                        |
| -------------- | ------------------------------------ | --------------------------------- |
| **Focus Mode** | Distraction-free writing and editing | No gamification. Clean. Silent.   |
| **Game Mode**  | Gamified drafting via competition    | Words = actions. Time = pressure. |

### Three Games (MVP scope)

1. **Race Yourself** — Beat your personal word-count record within a time limit.
2. **Battle Mode** — Deal damage by typing. Take damage when idle. Defeat enemies to win.
3. **1v1 Race** — Compete against another user in real time. *(Post-MVP, architecture should not block this.)*

### Monetization

| Tier            | Projects  | Game Tickets/Week             | Price  |
| --------------- | --------- | ----------------------------- | ------ |
| Free            | 1         | 1                             | $0     |
| Scribe (Tier 1) | Unlimited | 3                             | $5/mo  |
| Arcane (Tier 2) | Unlimited | Unlimited + early multiplayer | $12/mo |

---

## Tech Stack

| Layer          | Technology                           | Notes                                            |
| -------------- | ------------------------------------ | ------------------------------------------------ |
| Framework      | Next.js 14 (App Router)              | TypeScript, `src/` directory, `@/*` import alias |
| Styling        | Tailwind CSS + CSS custom properties | No UI libraries. All components are bespoke.     |
| Rich text      | Tiptap (React)                       | StarterKit, Placeholder, CharacterCount          |
| State          | Zustand                              | Multiple focused stores                          |
| Backend / Auth | Supabase                             | Auth, Postgres DB, RLS, Realtime (future)        |
| Deployment     | Vercel                               | Edge middleware for auth                         |

### Key Package Versions (do not upgrade without reason)
- `next`: 14.x
- `@supabase/supabase-js` + `@supabase/ssr`: latest stable
- `@tiptap/react` + `@tiptap/pm` + `@tiptap/starter-kit`: latest stable
- `zustand`: latest stable
- `next-themes`: latest stable

---

## Project Structure

```
rune/
├── src/
│   ├── app/
│   │   ├── (auth)/               # Login, signup — public routes
│   │   │   ├── layout.tsx
│   │   │   ├── login/page.tsx
│   │   │   └── signup/page.tsx
│   │   ├── (app)/                # Protected routes — requires session
│   │   │   ├── layout.tsx        # App shell: sidebar + header
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── projects/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [projectId]/
│   │   │   │       ├── page.tsx
│   │   │   │       └── chapters/[chapterId]/page.tsx
│   │   │   ├── games/
│   │   │   │   ├── page.tsx      # The Arena hub
│   │   │   │   ├── race/page.tsx
│   │   │   │   └── battle/page.tsx
│   │   │   ├── profile/
│   │   │   │   ├── page.tsx
│   │   │   │   └── unlockables/page.tsx
│   │   │   └── settings/page.tsx
│   │   ├── auth/callback/route.ts
│   │   ├── page.tsx              # Landing page (public)
│   │   ├── layout.tsx            # Root layout with ThemeProvider
│   │   ├── globals.css
│   │   ├── loading.tsx
│   │   └── error.tsx
│   ├── components/
│   │   ├── ui/                   # Primitive UI components
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Toast.tsx
│   │   │   ├── ThemeProvider.tsx
│   │   │   └── LevelUpModal.tsx
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   └── Header.tsx
│   │   ├── editor/
│   │   │   ├── RuneEditor.tsx
│   │   │   ├── PageList.tsx
│   │   │   └── FocusToolbar.tsx
│   │   ├── projects/
│   │   │   ├── ProjectCard.tsx
│   │   │   ├── NewProjectModal.tsx
│   │   │   └── ChapterRow.tsx
│   │   ├── games/
│   │   │   ├── HpBar.tsx
│   │   │   └── BattleLog.tsx
│   │   └── profile/
│   │       └── XpBar.tsx
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts         # Browser client (createBrowserClient)
│   │   │   ├── server.ts         # Server client (createServerClient + cookies)
│   │   │   └── schema.sql        # Full DB schema — run manually in Supabase
│   │   ├── actions/              # Server actions ("use server")
│   │   │   ├── projects.ts
│   │   │   ├── chapters.ts
│   │   │   ├── pages.ts
│   │   │   ├── games.ts
│   │   │   ├── xp.ts
│   │   │   ├── unlockables.ts
│   │   │   └── settings.ts
│   │   ├── types.ts              # TypeScript interfaces for all DB tables
│   │   ├── utils.ts              # cn() helper (clsx + tailwind-merge)
│   │   ├── xp.ts                 # Pure XP math functions (no DB calls)
│   │   ├── unlockables.ts        # Static registry of themes and avatars
│   │   └── env.ts                # Env var validation on startup
│   ├── store/
│   │   ├── modeStore.ts          # 'focus' | 'game'
│   │   ├── editorStore.ts        # currentPageId, isSaving, lastSaved
│   │   ├── profileStore.ts       # profile data, preferences
│   │   ├── gameStore.ts          # game state machine, word counts
│   │   └── toastStore.ts         # showToast(message, type)
│   └── middleware.ts             # Supabase session refresh + route protection
├── CLAUDE.md                     # ← this file
├── DEPLOYMENT.md
├── .env.local
├── tailwind.config.ts
└── next.config.ts
```

---

## Design System

### Dark Academia Palette

```css
--color-ink:          #1a1614   /* near-black — primary text */
--color-parchment:    #f5f0e8   /* warm off-white — light bg */
--color-vellum:       #ede8db   /* slightly darker warm — secondary bg */
--color-sepia:        #2c2420   /* dark warm brown — sidebar bg */
--color-gold:         #c9a84c   /* muted antique gold — primary accent */
--color-gold-dim:     #8a6f2e   /* darker gold — hover states */
--color-crimson:      #8b2e2e   /* deep red — danger / enemy */
--color-sage:         #4a6741   /* muted green — success */
--color-mist:         #6b6560   /* warm gray — muted text */
--color-border:       rgba(201, 168, 76, 0.2)
--color-border-strong: rgba(201, 168, 76, 0.4)
```

**Dark mode is default.** Themes are class-based via `next-themes`. The `data-theme` attribute on `<html>` controls unlockable theme variants.

### Typography

- **Serif** (`rune.serif`): editor body, headings, wordmarks, large display text
- **Sans** (`rune.sans`): UI chrome, labels, small metadata

### Unlockable Themes

| ID                 | Name             | Unlock Condition          |
| ------------------ | ---------------- | ------------------------- |
| `candlelight`      | Candlelight      | Default — always unlocked |
| `midnight-library` | Midnight Library | Level 3                   |
| `crimson-ink`      | Crimson Ink      | Level 5                   |
| `ivory-tower`      | The Ivory Tower  | Level 10                  |

Theme CSS overrides live in `globals.css` under `[data-theme="midnight-library"] { ... }`.

---

## Database Schema

All tables have Row Level Security enabled. Users can only read and write their own rows.

### Tables

| Table              | Key Columns                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------ |
| `profiles`         | id (refs auth.users), username, display\_name, avatar\_url, xp, level, preferences (jsonb) |
| `projects`         | id, user\_id, title, description, cover\_color, word\_count                                |
| `chapters`         | id, project\_id, title, position                                                           |
| `pages`            | id, chapter\_id, title, content (jsonb), word\_count, position                             |
| `game_sessions`    | id, user\_id, mode, words\_written, duration\_seconds, xp\_earned, completed, enemy\_type  |
| `xp_events`        | id, user\_id, amount, reason, created\_at                                                  |
| `user_unlockables` | user\_id, unlockable\_id, unlocked\_at                                                     |

A **Postgres trigger** auto-creates a `profiles` row when `auth.users` receives a new record.

> **Important:** Claude Code cannot connect to Supabase directly. The `schema.sql` file is generated and must be run manually in the Supabase SQL editor. Do not attempt live DB queries during build prompts.

---

## State Management (Zustand Stores)

| Store          | Key State                                    | Notes                                     |
| -------------- | -------------------------------------------- | ----------------------------------------- |
| `modeStore`    | `mode: 'focus' \| 'game'`                    | Toggled from Header; persists in session  |
| `editorStore`  | `currentPageId`, `isSaving`, `lastSaved`     | Updated by RuneEditor on every save       |
| `profileStore` | `profile`, `preferences`                     | Hydrated at layout level from server      |
| `gameStore`    | `gameState`, `wordsWritten`, `personalBests` | Local to game session; resets on new game |
| `toastStore`   | `showToast(message, type)`                   | Global toast system                       |

---

## Routing & Auth

- **Public routes:** `/`, `/login`, `/signup`, `/auth/callback`
- **Protected routes:** `/app/*` — redirect to `/login` if no Supabase session
- Middleware runs on every request to refresh the session token.
- Supabase SSR: browser client in client components, server client in server components and actions.

Route prefix: All routes inside src/app/(app)/ resolve without the /app prefix in the URL. The (app) folder is a Next.js route group  -- it is invisble in the broswer. 
Always use /dashboard , /projects , /games , /progile , /settings , -- never /app/dashboard , /app/projects , etc.

---

## XP & Progression System

### XP Math (pure functions in `src/lib/xp.ts`)

```typescript
xpForLevel(level)          // level * level * 100
levelFromXp(xp)            // inverse of above
xpProgressInCurrentLevel(xp) // { current, required, percent }
xpRewardForWords(wordCount)  // 1 XP per 10 words, min 5 XP
```

### XP Multipliers by Game Mode

| Mode          | Multiplier            |
| ------------- | --------------------- |
| Race Yourself | 1× base               |
| Battle (Win)  | 1.5×                  |
| Battle (Loss) | 0.5× (partial credit) |

### Level-Up Flow

1. `awardXp()` runs → compares level before and after.
2. If level increased → set `profileStore.pendingLevelUp`.
3. `LevelUpModal` detects this → displays animated level-up screen.
4. `checkAndGrantUnlockables()` runs at the end of every `awardXp()` call.

---

## Editor Architecture

### RuneEditor (Tiptap)

- **Extensions:** StarterKit, Placeholder, CharacterCount
- **StarterKit nodes:** H1, H2, H3, bold, italic, bullet list, ordered list, blockquote, horizontal rule
- **Max width:** 680px centered, generous line-height (1.9), 18px serif
- **Auto-save:** debounce 1500ms → `updatePage()` → saves content (Tiptap JSON) + word count
- **Game mode prop:** disables paste, tracks additions-only word count (never subtract on delete)
- **SSR:** All Tiptap imports must be wrapped in `next/dynamic` with `ssr: false`

### Focus Mode Behavior

When `modeStore.mode === 'focus'`:
- Page list panel removed from DOM (not just hidden)
- App header hidden
- `FocusToolbar` appears (fixed top-center, auto-hides after 3s idle)
- Vignette overlay applied (CSS radial gradient, `pointer-events: none`)
- `Cmd+Shift+F` toggles mode; fires a Toast notification

---

## Game Mode Architecture

### Race Yourself — State Machine

```
idle → active → results → idle
```

- **Active state:** countdown timer (MM:SS), words written (additions only), HUD pulses every 10s
- **Results state:** WPM calculated, personal best checked, XP awarded, `game_sessions` record saved

### Battle Mode — State Machine

```
enemy-select → active → results → idle
```

**Game Logic (all client-side):**
- 5 words written = 10 damage to enemy
- 5 seconds idle = player takes 5 HP/s damage
- Player starts at 200 HP
- Enemy HP reaches 0 → Victory
- Player HP reaches 0 → Defeat

**Enemies:**

| Name           | HP   | Gimmick                     |
| -------------- | ---- | --------------------------- |
| The Blank Page | 500  | None                        |
| Writer's Block | 800  | Heals 50 HP every 60s       |
| The Deadline   | 1200 | Player takes 2× idle damage |

---

## Unlockables Registry

Defined as a **static hardcoded array** in `src/lib/unlockables.ts` — not stored in the DB (only which ones a user has earned is stored).

Shape:
```typescript
{
  id: string
  name: string
  type: 'theme' | 'avatar'
  description: string
  requirement: { type: 'level' | 'total_words' | 'battle_wins' | 'race_duration', value: number }
}
```

### Profile Avatars

| ID              | Name          | Unlock Condition       |
| --------------- | ------------- | ---------------------- |
| `quill`         | Quill         | Default                |
| `skull-roses`   | Skull & Roses | 10,000 total words     |
| `crescent-moon` | Crescent Moon | 5 battle wins          |
| `ouroboros`     | Ouroboros     | Level 7                |
| `hourglass`     | Hourglass     | Complete a 30-min race |

---

## Component Conventions

### Do's
- All UI components are built from scratch using Tailwind + CSS variables. **No external UI libraries** (no shadcn, no Radix, no Headless UI).
- Use `cn()` from `@/lib/utils` for conditional class merging.
- Every interactive element must have proper ARIA attributes and label associations.
- Client components that use hooks must have `"use client"` at the top.
- Server actions must have `"use server"` at the top.
- Game components and Tiptap editor must use `next/dynamic` with `ssr: false`.

### Don'ts
- Do not use `localStorage` or `sessionStorage` — Supabase handles auth state; Zustand handles UI state.
- Do not make DB calls inside client components directly — use server actions.
- Do not lift the Tiptap editor into SSR context.
- Do not hardcode colors — always use CSS custom properties (`var(--color-gold)`).
- Do not skip debouncing on auto-save.

### Primitive Components (`src/components/ui/`)

**Button variants:** `primary` (gold bg, dark text) | `ghost` (transparent, gold border) | `danger` (crimson). Accepts `loading?: boolean`.

**Input:** full-width, serif font option, gold focus ring, warm tint bg, error state.

**Toast:** bottom-center, fade in 0.2s, hold 2s, fade out. Managed by `toastStore`.

---

## Settings & User Preferences

Preferences are stored as a JSONB column on `profiles`. They include:
- `fontSize`: 16–22 (px)
- `lineHeight`: 1.7 | 1.9 | 2.2
- `autoSaveDelay`: 0 | 1000 | 3000 (ms)
- `typewriterMode`: boolean
- `activeTheme`: string (unlockable theme ID)
- `activeAvatar`: string (unlockable avatar ID)

Preferences are applied dynamically as CSS custom properties on the editor element via `profileStore`.

---

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=       # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=  # Supabase anon/public key
```

`src/lib/env.ts` validates these on startup and throws a descriptive error if missing.

---

## Build Sequence Reference

The project is built across 14 sequential prompts. Each prompt builds on the last. **Do not skip steps or combine prompts.**

| Prompt | What It Builds                                                          |
| ------ | ----------------------------------------------------------------------- |
| 1      | Next.js scaffold, dependencies, `cn()` util                             |
| 2      | Design system: CSS tokens, Tailwind config, ThemeProvider               |
| 3      | Supabase clients, middleware, DB schema SQL, TypeScript types           |
| 4      | Auth pages (login, signup), auth callback, Button + Input components    |
| 5      | App shell: sidebar, header, mode toggle, dashboard placeholder          |
| 6      | Project management: project cards, chapter list, CRUD actions           |
| 7      | Core text editor: Tiptap, page list, auto-save, word count              |
| 8      | Focus mode: FocusToolbar, vignette, keyboard shortcut, Toast, Dashboard |
| 9      | XP system, level math, Profile page, XpBar, profileStore                |
| 10     | Game Mode — Race Yourself                                               |
| 11     | Game Mode — Battle Mode                                                 |
| 12     | Unlockables gallery, LevelUpModal, theme application                    |
| 13     | Settings page: Account, Editor, Appearance, Danger Zone tabs            |
| 14     | Landing page, loading/error states, SEO, deployment prep                |

---

## Anti-Cheating Notes (for Game Mode)

Valid words are defined as whitespace-separated tokens of at least 2 characters. Word count during games tracks **additions only** — the running total never decreases when the user deletes text. Paste is disabled during game sessions. This logic lives in the Tiptap editor when the `gameMode` prop is `true`.

---

## Post-MVP Considerations (do not build now, but do not block)

- **1v1 Race:** Supabase Realtime channels. The `game_sessions` table schema should be compatible with a `room_id` column being added later.
- **Subscription enforcement:** Game ticket counts live on `profiles`. The subscription tier check will wrap around game session creation in `src/lib/actions/games.ts` — leave a `// TODO: check tier` comment where the guard will go.
- **Mobile:** Layout is desktop-first for MVP. Do not add mobile-breaking code (avoid fixed pixel widths outside of the sidebar and editor column).

---

## Checklist Before Each Prompt

Before executing any prompt, confirm:

- [ ] `npm run dev` runs without error from the previous step
- [ ] `.env.local` has real Supabase values (required from Prompt 4 onward)
- [ ] If Prompt 3 just completed: schema.sql has been run in Supabase SQL editor
- [ ] No TypeScript errors in existing files (`npx tsc --noEmit`)

If something breaks, report the full error before continuing.
