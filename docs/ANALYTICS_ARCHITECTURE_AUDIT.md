# Rune — First-Party Analytics Architecture Audit

> Audit only. No schema, code, or Meta Pixel behavior was changed as part of this document.
> Prepared: 2026-07-10 · Branch: `analytics`

---

## 1. Executive Summary

Rune currently has **one** working analytics system — the Meta Pixel — and it is scoped to advertising conversion tracking only. It fires exactly two events (`PageView`, `CompleteRegistration`), is not gated to production, has no consent handling, and has no purchase/subscription event, so it cannot answer any question about product usage, activation, or retention.

There is **no first-party product analytics system at all**. There is no `analytics_events` table, no UTM/attribution capture, no session concept beyond a daily word-count aggregate, and no admin role or internal dashboard infrastructure. This is a greenfield build, not a migration.

The good news: Rune's existing conventions are unusually easy to extend safely.
- `writing_sessions` already gives a clean, battle-tested definition of a "writing day" (see §Session-Definition Analysis) that a session/retention concept can be built on directly, with zero new instrumentation.
- `unlockables.ts`'s `checkAndGrantUnlockables()` already implements idempotent, centralized milestone detection against the correct source of truth (`sum(writing_sessions.words_added)`, which is **paste-deducted real words**, not `projects.word_count`, which includes pasted content). Analytics word-count milestones should reuse this exact number.
- `subscription_events` already logs every Stripe lifecycle transition. `subscription_started` is nearly free to derive from it.
- `deleted_accounts` is a precise, already-shipped template for a service-role-only table: RLS enabled, zero policies, no FK on the historical user ID. `analytics_events` should follow the same pattern.

The two biggest structural gaps, in order of consequence:
1. **No admin/role concept exists anywhere in the codebase.** An internal analytics dashboard cannot be protected by "hide the nav link" — it needs a new access-control mechanism built from scratch (see §6).
2. **Zero UTM/attribution capture exists.** Rune cannot currently tell which campaign or ad produced a signup, let alone a retained writer. The only acquisition signal in the codebase is a third-party affiliate script (PromoteKit) that is forwarded to Stripe metadata at checkout and never persisted to Supabase.

A secondary but important finding: the current new-user flow is **not** what `docs/ONBOARDING_VISION.md` describes as "current" — that document is a proposal that has since been implemented (commits dated 2026-06-29/06-30, after the doc's own 2026-06-27 timestamp). The funnel map in §4 reflects the actual, verified, current code. `ONBOARDING_VISION.md` should be updated or annotated as historical; that is a documentation hygiene item, not part of this audit's deliverable.

This audit also surfaces two pre-existing, unrelated bugs worth a founder's attention (not fixed here, per scope):
- `schema.sql` has a typo — `create policy "projects: insert own" on public.pmusirojects for insert` — which will break any wholesale re-run of `schema.sql` against a fresh database.
- `writing_sessions.page_id` and the `increment_writing_session()` RPC are used by live application code but do not exist in any tracked migration file — they were added directly in the Supabase dashboard and never captured in repo history.

---

## 2. Existing Meta Pixel Inventory

### Files
| File | Role |
|---|---|
| `src/lib/meta-pixel.ts` | Hardcoded pixel ID, `window.fbq` type declaration, `trackPixelEvent()` helper. |
| `src/components/MetaPixel.tsx` | Injects the base `fbevents.js` loader via `next/script`, fires `init` + initial `PageView`, re-fires `PageView` on `usePathname()` change, renders `<noscript>` fallback. Mounted in root layout. |
| `src/components/RegistrationTracker.tsx` | Fires `CompleteRegistration` once, guarded by a `localStorage` flag. Mounted in two places (see below). |
| `src/app/layout.tsx` | Mounts `<MetaPixel />` unconditionally for every route in the app, including anonymous/pre-auth pages. |
| `src/app/(app)/layout.tsx` | Mounts `<RegistrationTracker />` for every authenticated app page (fallback/catch-all). |
| `src/app/onboarding/OnboardingClient.tsx` | Also mounts `<RegistrationTracker />` — this is the instance that actually fires for real signups today, since new users land on `/onboarding`, not `/dashboard`. |
| `src/app/auth/callback/route.ts` | Produces the `?registered=1` param `RegistrationTracker` consumes. |
| `src/app/(legal)/privacy/page.tsx` | Discloses Meta Pixel, cookies, and a claim of "Automatic Advanced Matching" being enabled. |

### Configuration
- **Pixel ID is hardcoded**, not env-driven: `src/lib/meta-pixel.ts` → `export const FB_PIXEL_ID = '2001689237155573';`. No `NEXT_PUBLIC_META_PIXEL_ID` or similar exists in `src/lib/env.ts`, `.env.local`, or `DEPLOYMENT.md`.
- **No dev/prod gating.** No `NODE_ENV`/`process.env.VERCEL_ENV` check anywhere in the three pixel files. Local dev, PR previews, and production all report to the same live pixel ID.

### Load surface
`MetaPixel` loads on **every route** via the root layout — anonymous visitors on `/login`, `/signup`, and the legal pages are tracked identically to authenticated app users, with no auth or route-group gate.

### Events currently sent (exhaustive — verified, no other `fbq(`/`trackPixelEvent(` call sites exist)
| Event | Trigger | File : mechanism |
|---|---|---|
| `PageView` (initial) | Fires synchronously in the inline init script on first paint of any route. | `MetaPixel.tsx`, inline `<Script>` |
| `PageView` (navigation) | Fires on `usePathname()` change, guarded against the very first mount by an `isInitialMount` ref. Query-string-only changes (e.g. `?registered=1` being stripped) do **not** re-fire it — correct behavior. | `MetaPixel.tsx`, `useEffect([pathname])` |
| `CompleteRegistration` | Fires once when `?registered=1` is present and a `localStorage` flag (`rune_complete_registration_tracked`) is absent. Immediately strips the param via `router.replace()`. | `RegistrationTracker.tsx` |

No `Lead`, `Purchase`, `Subscribe`, `StartTrial`, or `trackCustom(...)` calls exist anywhere.

### Duplicate-event risk
- Route-level `PageView` dedup is correctly implemented for path changes via the `isInitialMount` ref + `[pathname]` dependency array. Query-only navigations correctly do not re-fire it.
- The navigation effect has **no Strict-Mode-safe guard beyond the initial mount** — combined with no dev-mode gating, a Strict Mode double-invoke could double-count `PageView` on every route change in local dev (dev-only impact, but still hits the live production pixel ID per the configuration gap above).
- `RegistrationTracker`'s `localStorage` dedup is durable across remounts/reloads, which is good — but **there is no `try/catch` around the `localStorage` calls**. In a context where `localStorage` throws (Safari private mode edge cases, storage-blocking extensions), the effect could abort before `router.replace()` strips the param, risking a re-fire on next remount.
- `RegistrationTracker` is mounted in two independent places (`OnboardingClient.tsx` and `(app)/layout.tsx`). The trigger condition is a **public, client-trusted query parameter** with no server-side verification that the visitor is a genuinely new registrant — a stray or manually-appended `?registered=1` on any `(app)` route would refire the event, mitigated only by the one-time `localStorage` flag.

### Registration timing vs. email verification
Traced end-to-end: `CompleteRegistration` fires **strictly after** email verification. The redirect to a page containing `RegistrationTracker` (`/onboarding?registered=1`) is only reachable after `src/app/auth/callback/route.ts` successfully calls `supabase.auth.exchangeCodeForSession(code)` — there is no code path where the event fires before that exchange succeeds.

### Subscription/Purchase events
**None exist.** The Stripe webhook (`src/app/api/webhooks/stripe/route.ts`) does purely server-side DB writes with zero Meta Conversions API or pixel calls. The checkout success URL (`/settings?upgraded=true`) is never read by any component to fire a Purchase/Subscribe event. **This is a real gap**: Rune can currently measure ad-driven signups but not ad-driven revenue.

### PII in event payloads
No `fbq()` call in code passes email, name, project titles, or manuscript text — all calls pass either no parameters or `undefined`. However, `src/app/(legal)/privacy/page.tsx` (lines 126–139) states that **Automatic Advanced Matching is enabled**, a Meta Business Manager dashboard setting (not code) that, if actually turned on, causes the pixel script to auto-scrape visible email/name form fields and send them to Meta without any line of Rune code doing so explicitly. This cannot be verified or falsified from the codebase — it is either an accurate disclosure of a dashboard setting outside this repo's control, or a documentation error. **Founder should confirm Advanced Matching's actual state in Meta Events Manager.**

### Consent management
**None exists.** No cookie-consent banner, no `useConsent`/`ConsentProvider`, no `navigator.doNotTrack` check, no tracking-preference toggle anywhere in Settings. The pixel fires unconditionally on first paint for every visitor, including EU/EEA visitors, before any consent could be collected — a real GDPR/ePrivacy compliance gap, especially given the privacy policy's own framing of Meta Pixel as a non-essential advertising cookie.

### Other defects
- Hardcoded pixel ID with no environment override (compounds the dev/prod gating gap — no way to route dev traffic to a disabled or separate pixel without a code change).
- No Purchase/Subscribe tracking despite a working Stripe flow with an obvious hook point (`/settings?upgraded=true`).

---

## 3. Existing Attribution Inventory

All items below are **negative findings** unless noted otherwise — verified with multiple grep patterns across the full repo (excluding `node_modules`).

| Mechanism | Present? | Notes |
|---|---|---|
| UTM parameters (`utm_source/medium/campaign/content/term`) | **No** | Zero occurrences anywhere in the repo. |
| `fbclid` / `gclid` | **No** | Zero occurrences. |
| Attribution cookies | **No** | The only cookies written anywhere (`src/proxy.ts`, `src/app/auth/callback/route.ts`, `src/lib/supabase/server.ts`) are Supabase session/JWT cookies — no campaign data. |
| localStorage/sessionStorage for attribution | **No** | `sessionStorage` is unused entirely. The one relevant `localStorage` use (`RegistrationTracker.tsx`'s `rune_complete_registration_tracked` key) is a pixel-fire dedup flag, not attribution storage — and is itself a narrow violation of CLAUDE.md's "no localStorage" rule, worth flagging even though its intent is limited. |
| Signup metadata (`supabase.auth.signUp().options.data`) | **Partial** | Only `{ display_name }` is passed. No campaign/source/referrer field. |
| `profiles` attribution columns | **No** | No `referrer`, `source`, `campaign`, or `landing_page` column exists on `profiles`. |
| Stripe metadata | **Partial** | Checkout sessions carry `supabase_user_id`, `tier`, and `promotekit_referral` (a third-party affiliate ID from the PromoteKit script loaded globally in `src/app/layout.tsx`). This value is read fresh from `window.promotekit_referral`/a query-string fallback at checkout time and forwarded to Stripe — **it is never persisted to Supabase**, so it cannot be joined against product-usage data. |
| Landing page query capture | **No** | `src/components/LandingPage.tsx` and `src/app/page.tsx` read no query params, no `document.referrer`. |
| Middleware/proxy attribution handling | **No** | `src/proxy.ts` (Next.js 16's rename of `middleware.ts`) only relays Supabase session cookies and enforces a public/private route allowlist. |

**Bottom line:** Rune has zero first-party campaign attribution today. The only acquisition signal is the PromoteKit affiliate ID, which is vendor-owned, checkout-time-only, and not queryable against Supabase data. A first-touch attribution system is fully additive — there is nothing to migrate or reconcile.

### Recommended first-touch attribution schema (recommendation only — not created)

A single row per user, written once at signup and never overwritten (first-touch semantics), following the project's existing migration conventions (see §6 for those conventions in detail):

```sql
create table if not exists public.acquisition_attribution (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null unique references public.profiles (id) on delete cascade,
  source       text,
  medium       text,
  campaign     text,
  content      text,
  term         text,
  fbclid       text,
  landing_path text,
  captured_at  timestamptz,        -- when the touch was first observed (pre-signup)
  created_at   timestamptz not null default now()
);
alter table public.acquisition_attribution enable row level security;
-- No user-facing policies — service-role/admin-dashboard read only, mirroring deleted_accounts.
```

Capture mechanism (recommendation, not implemented): a short-lived, first-party cookie set on landing-page load (or in `proxy.ts`) captures UTM/`fbclid`/landing path; at signup, that cookie's values are read server-side and inserted here in the same request that creates the session — avoiding a separate anonymous-visitor ID table, which is unnecessary complexity given Rune's funnel is short (landing → signup, not a long multi-visit research cycle for most novelist users). `unique(user_id)` plus `on conflict (user_id) do nothing` gives first-touch-wins semantics for free.

---

## 4. Signup / Onboarding Funnel Map (verified against current code, not the vision doc)

**Correction to `docs/ONBOARDING_VISION.md`:** that document's "current flow" section (written 2026-06-27) is now historical — the "target flow" it proposed has since been built (commits 2026-06-29, 2026-06-30). Below is the actual, current, verified flow.

### Step-by-step
1. **Signup form** — `src/app/(auth)/signup/SignupClient.tsx`. Fully client-side, no server action. Calls `supabase.auth.signUp({ email, password, options: { data: { display_name }, emailRedirectTo: '/auth/callback?next=/dashboard&intent=signup' } })` directly against the Supabase REST API.
2. **Profile row created** — a Postgres trigger, `handle_new_user()` (current definition in `src/lib/supabase/migrations/007_fix_signup_trigger.sql`), fires on `auth.users` insert — i.e. **at `signUp()` time, before email confirmation** — inserting `profiles` with `has_written_first_words: false`, `subscription_tier: 'free'`.
3. **Email confirmation link** → `src/app/auth/callback/route.ts`. This route **decides the redirect destination before exchanging the code**, based solely on the `intent` query param: `intent === 'signup'` → destination `/onboarding` with `?registered=1` appended. It then calls `supabase.auth.exchangeCodeForSession(code)`; only on success does it return the pre-built redirect. **This exchange succeeding is the exact, safe point to record `email_verified` server-side** (would require adding one `supabase.auth.getUser()` call after the exchange — not currently present).
4. **`/onboarding`** (`src/app/onboarding/page.tsx` + `OnboardingClient.tsx`) — a real, dedicated route (contrary to the vision doc's premise that it doesn't exist). Server component redirects existing users (`projects.count > 0`) straight to `/dashboard`; new users see a 3-stage client wizard: title → first sentence → transition animation. `<RegistrationTracker />` mounts here and fires the Meta `CompleteRegistration` event on page load.
5. **Submission** → `POST /api/onboarding` (`src/app/api/onboarding/route.ts`), a Route Handler, not a server action. This is the authoritative creation path: inserts `projects` → `chapters` (`"Chapter 1"`) → `pages` (`"Page 1"`, content built from the typed first sentence) in sequence, then unconditionally sets `profiles.has_written_first_words = true` and `preferences.has_seen_guides_update_notice = true`. Returns `{ projectId, chapterId }` (no page ID). Client then does `router.replace('/projects/{projectId}/chapters/{chapterId}?tutorial=editor')`.
6. **Editor opens** — `RuneEditor.tsx` mounts with `autofocus: "start"` (always true, not onboarding-specific), and the standard autosave path takes over from here (see §5).

### Two other, now-secondary creation paths (do not confuse with the primary flow above)
- **`createProjectWithDraft()`** (`src/lib/actions/projects.ts`) — used by `YourStoryHero`'s `NewUserHero` fallback on the dashboard. Since `/dashboard` now hard-redirects to `/onboarding` whenever `projects.length === 0`, this path is **effectively dead for true first-time signups** today — only reachable in the edge case of a user who has a project but zero chapters. Does not set `has_written_first_words`, does not capture a first sentence, no `?tutorial=editor` param.
- **`NewProjectModal.tsx` + `createProject()`** — the general-purpose "create another project" flow for existing users (title + description + cover color). This is what the vision doc originally described as "the current flow" — it is no longer part of the new-user path.

### First-time / tutorial flags (state check — corrects the vision doc)
- **`profiles.has_written_first_words`** — **already exists** (migration `007_fix_signup_trigger.sql`), contrary to the vision doc's claim that it's a future addition. It is set unconditionally inside `/api/onboarding/route.ts` as part of onboarding completion — **not** in response to the actual editor autosave path, meaning it reflects "completed the onboarding wizard," not "the standard save pipeline detected a first real save." There is also a fully-built but **never-called** helper, `markFirstWordsSaved()` in `src/lib/actions/settings.ts` (zero call sites anywhere) — a pre-built hook that was never wired into `RuneEditor.tsx`'s save path. This is the natural place to make `has_written_first_words` reflect the true first save, if that distinction matters.
- **`profiles.preferences.has_completed_editor_tutorial`** — governs the separate `EditorTutorial` spotlight walkthrough (unrelated to activation tracking).
- No `isNewUser` flag and no onboarding-step-tracking column exist anywhere.

### Word count algorithm discrepancy (worth flagging)
`/api/onboarding/route.ts` computes the first page's word count with its own local regex (`text.trim().split(/\s+/).filter(w => w.length >= 2).length`), while every subsequent editor save uses Tiptap's `CharacterCount` extension (`editor.storage.characterCount.words()`) in `RuneEditor.tsx`. These two algorithms can disagree on the same text. Not a blocker for analytics, but any milestone/word-count event should be aware that the very first page's stored `word_count` was computed differently than all later saves.

### Recommended event hook points

| Event | Origin | File : function | Fires when |
|---|---|---|---|
| `signup_completed` | Client | `SignupClient.tsx`, right after `supabase.auth.signUp()` resolves with no error | Form submitted successfully; no server action exists to hook instead — this is a genuine client-only event since `signUp()` talks directly to Supabase's REST API with no Rune server code in between. |
| `email_verified` | Server | `src/app/auth/callback/route.ts`, right after `exchangeCodeForSession(code)` succeeds | Requires adding one `supabase.auth.getUser()` call (not currently present) to get the user ID before the pre-built redirect is returned. |
| `onboarding_started` | Server or client | `src/app/onboarding/page.tsx` render (only reached when `projects.count === 0`), or `OnboardingClient.tsx` mount | Server-side render already proves "zero-project new user reached onboarding." |
| `project_created` + `first_sentence_written` (naturally a combined event today) | Server | `src/app/api/onboarding/route.ts`, end of `POST` handler, before the JSON response is returned | Has user ID, project ID, chapter ID, page ID (in scope but not currently returned to client), word count, and title all in one place. |
| `editor_opened` | Server or client | `src/app/(app)/projects/[projectId]/chapters/[chapterId]/page.tsx` render, or `RuneEditor.tsx`'s mount effect | Server render has the `tutorial` query param (`editor`/`returning`/none) for free, useful metadata. |
| `first_character_typed` | Client | `RuneEditor.tsx`'s `onUpdate` handler, first invocation per page-session | Needs a new per-mount ref guard — none exists today. |
| `first_save` / `first_sync_completed` | Server | `syncPageWithLimitCheck()` (the function the live editor's autosave path actually calls, via `syncEngine.ts`) or `updatePage()` in `src/lib/actions/pages.ts`, success branch | Should be guarded by "was `word_count` previously 0" rather than reusing the onboarding-only `has_written_first_words` flag, since that flag is only set by the onboarding route today, not by the general save path. |

---

## 5. Writing and Session Data Sources

### Word counts — three distinct numbers, do not conflate them
| Concept | Source of truth | Includes pasted content? |
|---|---|---|
| Manuscript size | `projects.word_count` (denormalized column, recalculated by `recalculateProjectWordCount()` in `src/lib/projectWordCount.ts`, canonical-page-aware) | **Yes** |
| "Real" typed words | `sum(writing_sessions.words_added)` | **No — paste-deducted at write time** |
| Per-save delta | Client-computed via Tiptap's `CharacterCount` extension, trusted as-is by `updatePage()`/`syncPageWithLimitCheck()` (no server-side recomputation) | Depends on caller |

`src/lib/actions/unlockables.ts`'s `checkAndGrantUnlockables()` contains an explicit code comment making this distinction — **any analytics "words written" milestone should use `writing_sessions.words_added`, never `projects.word_count`.**

**Known discrepancy:** `games.ts`'s Arena "append sprint to manuscript" path (`appendSprintToProject`/`appendToExistingPage`) recomputes `projects.word_count` with its own naive, non-canonical-aware sum, unlike the shared `recalculateProjectWordCount()` used everywhere else — a pre-existing inconsistency, not something to fix here.

### Paste deduction
Lives entirely in `src/components/editor/RuneEditor.tsx` (not in the offline layer). `editorProps.handlePaste` tokenizes pasted text (same ≥2-character-token rule as Arena's anti-cheat logic) into `pastedWordsRef`; on save, `Math.min(pastedWordsRef.current, delta)` is subtracted from the word-count delta before it's passed to `recordWordsWritten()`/`storeOfflineWritingCredit()`. Pasted words still count toward the stored `word_count` — only writing-credit/XP excludes them.

### "Writing session" — currently a daily aggregate, not a per-sitting event
`writing_sessions` (`src/lib/supabase/migrations/002_word_goals.sql`) is keyed `unique(user_id, project_id, session_date)` — **one row per user per project per calendar day**, not one row per sitting. There is no start/end timestamp anywhere in the non-game writing path. `recordWordsWritten()` (`src/lib/actions/writingStats.ts`) is the single write path (no-ops on non-positive deltas).

**Schema drift found:** live code reads/writes a `writing_sessions.page_id` column and calls a `increment_writing_session()` RPC, **neither of which appears in any tracked migration file** — both were added directly in the Supabase dashboard and never captured in repo history. Any new migration work should account for this gap, not assume the tracked `.sql` files are the complete picture.

### Local date handling
`getLocalDateString()` (`src/lib/utils.ts`) — browser-local (`getFullYear`/`getMonth`/`getDate`, not UTC) — is the canonical function used everywhere a "writing day" boundary matters (`RuneEditor.tsx`, offline credit capture in `db.ts`). Server-only contexts fall back to a UTC date string as a documented exception. **Any analytics `local_date` field should be computed with this exact function, not a new one.**

### Streaks
`getWritingStreak()` → private `computeStreaks()` — a pure function over the **distinct, sorted `session_date` values where `words_added > 0`**. Not DB-persisted; always derived fresh on read. This is directly reusable for retention/session-count analytics (see §Session-Definition Analysis below).

### Successful sync
No single boolean flag exists, but it's cleanly derivable: `syncPendingWrite()` (`src/lib/offline/syncEngine.ts`) calling `syncPageWithLimitCheck()` and getting `{ status: 'ok' }` back is "sync succeeded" — on that branch, the local `pending_writes` entry is deleted and `afterPageSync()` runs (touches parent chapter, recalculates project total). `flushPendingQueue()` is the batch entry point, returning `{ synced, failed, conflicts }` counts, called by `NetworkProvider.tsx` on reconnect (with toasts) and every 30s (silently). A DOM event, `rune-sync-queue-updated`, already fires after every flush — useful as a listener hook, but it fires on *every* flush, not just the first-ever one, so it cannot alone distinguish `first_sync_completed`.

### Other systems, briefly
- **Arena (Race/Battle):** `game_sessions` table, single write path `createGameSession()` in `src/lib/actions/games.ts`, offline-queued via a separate IndexedDB store (`pending_game_sessions`). Arena words reach the manuscript via `transferGameWordsToProject()`.
- **Export:** entirely client-side, PDF-only (`jsPDF`), triggered from `ExportButton.tsx`/`ManuscriptExportButton.tsx`. **No server-side record of an export exists at all today** — an `export_completed` event would need net-new instrumentation at those two call sites, since nothing else observes them.
- **Revision Notes:** full CRUD in `src/lib/actions/notes.ts` against `project_notes`. No word-count/streak interaction.
- **Subscription tier:** stored directly on `profiles` (`subscription_tier`, `subscription_status`, etc. — not a separate table). The Stripe webhook (`src/app/api/webhooks/stripe/route.ts`) already inserts a row into `subscription_events` (`event_type`, `payload jsonb`) on **every** lifecycle transition via `upsertSubscriptionEvent()` — this is already a usable event log. `subscription_started` can be derived from the `checkout.session.completed` branch, which already has `userId`/`tier`/`subscriptionId` in scope — the least invasive hook point available anywhere in this audit.
- **Account deletion:** `deleteAccount()` (`src/lib/actions/settings.ts`) snapshots `{ username, display_name, xp, level, subscription_tier, email }` into `deleted_accounts` **before** cascading `auth.admin.deleteUser()`. Same data is already assembled in scope — an `account_deleted` event should be forwarded from the same point, using the same snapshot.

---

## 6. Admin / Security Findings

**No admin role concept exists anywhere in Rune today.** No `is_admin`/`role` column on `profiles`, no admin routes, no RBAC library, no staff-only pages, no feature flags, no email allowlist env vars. This was checked exhaustively across `src/` and all migrations.

**Service-role key usage — exactly 2 real call sites**, both ad-hoc (no shared `src/lib/supabase/admin.ts` helper exists):
1. `src/lib/actions/settings.ts` → `deleteAccount()` — inline service-role client for the `deleted_accounts` insert + `auth.admin.deleteUser()`.
2. `src/app/api/webhooks/stripe/route.ts` → local `createServiceClient()` — used for all four webhook handlers, protected only by Stripe's signature verification, not by any app-level auth (this route has no user session).

**`src/proxy.ts`** (Next.js 16's rename of `middleware.ts` — worth noting since CLAUDE.md's structure diagram still says `middleware.ts`) does binary public/private routing only: a `PUBLIC_ROUTES` allowlist + `/auth/` prefix, gated purely on "does a Supabase session exist." There is no role-based branch anywhere in it.

### Recommendation for protecting an internal analytics dashboard
Do not rely on hiding a nav link. Two things need to be built, since nothing like them exists today:
1. **Table-level protection**, following the exact precedent already shipped for `deleted_accounts`: `alter table analytics_events enable row level security;` with **zero policies defined**. That makes the table unreadable/unwritable by any authenticated user's client and accessible only via a service-role client — this is already Rune's established pattern for admin-only data, not a new convention.
2. **A new server-side route guard**, since Rune has nothing like this today. The simplest option consistent with the codebase's current maturity: a hardcoded email allowlist read from a new server-only env var (e.g. `ADMIN_EMAILS`), checked in a new `src/app/(app)/admin/layout.tsx` (mirroring the existing auth-check pattern in `(app)/layout.tsx`) before rendering any dashboard route, and redirecting non-matches to `/dashboard`. A `profiles.is_admin` boolean column is a reasonable alternative if more than one or two people will ever need access, but for a single-founder tool, an env-var allowlist avoids a new column and RLS-policy surface for a capability that's rarely checked at scale. This decision should go to the founder (see §14).

### Database conventions extracted (for the recommended schema in §7)
- **Migrations:** `src/lib/supabase/migrations/NNN_description.sql`, numbered `001`–`007`. **But the most recent table (`deleted_accounts`) was added directly to `schema.sql`, not a new numbered migration** — with an inline commented-out "run once on existing databases" copy of the `CREATE TABLE` statement left as documentation. This is the newer, current precedent; `analytics_events` should probably follow it (edit `schema.sql` directly with an inline migration comment block) rather than restart the numbered-migration convention with `008_analytics_events.sql` — though this drift is worth a founder decision (see §14), since neither approach is unambiguously "correct" going forward.
- **UUIDs:** always `gen_random_uuid()`, never `uuid_generate_v4()`.
- **Timestamps:** always `timestamptz`, never bare `timestamp`. `created_at timestamptz not null default now()` universally; `updated_at` is set manually in application code on most tables (only `pages` has a real DB trigger for it).
- **Foreign keys:** `ON DELETE CASCADE` on literally every FK in the codebase except one deliberate exception — `deleted_accounts.original_user_id` has **no FK constraint at all**, specifically so the audit row survives after the referenced `auth.users` row is gone. This is the relevant precedent if `analytics_events` needs to outlive account deletion (see §14 for whether it should).
- **RLS:** two coexisting idioms — per-verb named policies (`"table: verb own"`, the dominant/current style in `schema.sql`) and single `for all` policies (older migrations). For a service-role-only table, the correct pattern is `enable row level security` with **zero policies**, exactly as `deleted_accounts` does.
- **JSONB:** always nullable, never has a `default`. No DB-level shape validation — validation lives entirely in application code.
- **Postgres functions:** `SECURITY DEFINER SET search_path = public`, snake_case verb-first names (`handle_`, `enforce_`, `increment_`), params prefixed `p_`. `increment_game_ticket()` (`005_game_tickets.sql`) is a good template for an idempotent upsert RPC (`UNIQUE` constraint + `ON CONFLICT ... DO UPDATE`), directly relevant to the dedup strategy in §10.
- **Indexes: zero exist anywhere in the entire codebase** — not even on foreign-key columns like `user_id`/`project_id`. This is a real, pre-existing gap with no convention to inherit; `analytics_events` will be the first table in Rune to need explicit indexes, and that should be treated as a new, deliberate convention rather than an oversight to match.
- **TypeScript types:** `src/lib/types.ts` is **manually maintained**, not generated (no `supabase` CLI project is configured in this repo). Convention: PascalCase singular interface name, snake_case fields matching DB columns exactly, `timestamptz` → `string` (ISO), JSONB → `Record<string, unknown> | null`.
- **Pre-existing bug found (unrelated to this audit, flagged for founder awareness):** `schema.sql`'s projects-insert RLS policy has a typo — `on public.pmusirojects for insert` instead of `on public.projects for insert` — which will error if `schema.sql` is ever re-run wholesale against a fresh database. Not fixed here per the "do not make broad code changes" constraint.

---

## 7. Proposed Database Architecture (recommendation — not created)

### `analytics_events` — the central table

```sql
create table if not exists public.analytics_events (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        references public.profiles (id) on delete cascade,
  event_name   text        not null,
  project_id   uuid        references public.projects (id) on delete cascade,
  local_date   date,
  metadata     jsonb,
  dedupe_key   text,
  created_at   timestamptz not null default now()
);

alter table public.analytics_events enable row level security;
-- No user-facing policies — service-role / admin-dashboard access only,
-- mirroring the deleted_accounts precedent. All writes go through a
-- SECURITY DEFINER RPC (below) or the service-role client, never a
-- plain authenticated insert.

create index if not exists analytics_events_user_created_idx
  on public.analytics_events (user_id, created_at);

create index if not exists analytics_events_name_created_idx
  on public.analytics_events (event_name, created_at);

-- One-time milestone dedup (e.g. first_save, project_created, subscription_started):
create unique index if not exists analytics_events_user_event_once_idx
  on public.analytics_events (user_id, event_name)
  where dedupe_key is null;

-- Repeatable-but-idempotent events (e.g. daily word-count milestones per project):
create unique index if not exists analytics_events_user_event_dedupe_idx
  on public.analytics_events (user_id, event_name, dedupe_key)
  where dedupe_key is not null;
```

Design notes, tied to Rune's actual conventions:
- `user_id` is nullable in the type but in practice will always be populated — every event in the recommended taxonomy (§8) occurs after a `profiles` row exists (even `signup_completed`, since the `handle_new_user()` trigger fires synchronously inside `supabase.auth.signUp()`, before email confirmation). **No `anonymous_id`/pre-auth visitor table is recommended** — it would be unnecessary complexity for a funnel this short (landing → signup is typically a single visit for this product), and nothing in the current codebase needs it. If pre-signup funnel drop-off ever becomes a real question, revisit then.
- `event_name text not null` rather than a Postgres `enum`, matching the existing `CHECK`-constraint idiom used for enum-like columns elsewhere (e.g. `writing_goals.type`) — keeps future event additions purely additive (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`-style migrations, no enum-altering).
- `dedupe_key` is nullable and drives two partial unique indexes — see §10 for exactly how each event type uses it.
- Zero indexes exist anywhere else in this codebase; the two indexes here are a deliberate, new, necessary convention, not an inherited one.
- Writes should go through a `SECURITY DEFINER` RPC (`record_analytics_event(...)`), following the `increment_game_ticket()` template — this lets server actions/route handlers write events using the normal authenticated Supabase client (no service-role key needed in most call sites) while still bypassing RLS safely, exactly the way `increment_page_version()`/`handle_new_user()` already do for their respective concerns.

### `acquisition_attribution` — first-touch attribution
See §3 for the full recommended schema. One row per user, `unique(user_id)`, written once via `on conflict (user_id) do nothing`.

---

## 8. Proposed Event Taxonomy

Conservative by design — most internal events should **not** reach Meta (see §12).

### Acquisition and account
| Event | Definition | Origin | Meta? |
|---|---|---|---|
| `signup_completed` | `supabase.auth.signUp()` resolved without error | Client | No — Meta already gets `CompleteRegistration` post-verification; sending a pre-verification signal to Meta would misrepresent conversion quality. |
| `email_verified` | `exchangeCodeForSession()` succeeded in `auth/callback/route.ts` | Server | No |
| `onboarding_started` | New user (0 projects) rendered `/onboarding` | Server | No |

### Writing activation
| Event | Definition | Origin | Meta? |
|---|---|---|---|
| `project_created` | First row inserted into `projects` for this user via `/api/onboarding` (or any later `createProject`) | Server | No |
| `first_sentence_written` | The onboarding-flow first page saved with `word_count > 0` | Server | **Yes — this is the real activation moment** (see `ONBOARDING_VISION.md`'s own "Activation Definition"); a dedicated Meta custom conversion event here (not a standard event) gives Meta a genuine activation signal to optimize campaigns toward, unlike raw `CompleteRegistration`. |
| `editor_opened` | Editor route rendered/mounted | Server or client | No |
| `first_character_typed` | First `onUpdate` firing on a fresh page-session | Client | No |
| `first_save` | First `updatePage`/`syncPageWithLimitCheck` success where prior `word_count` was 0 | Server | No |
| `first_sync_completed` | First `syncPendingWrite` returning `status: 'ok'` for this user | Server | No |

### Writing milestones (real words — `writing_sessions.words_added`, never `projects.word_count`)
`words_100`, `words_500`, `words_2000`, `words_5000`, `words_10000`, `words_15000` — one-time per user, `dedupe_key = null` (unique index enforces once-ever). Server-origin, computed the same place `checkAndGrantUnlockables()` already sums `totalWordsWritten` — piggyback on that existing pass rather than adding a new query path. Not sent to Meta (internal progress signal, not a conversion event).

### Retention
| Event | Definition | Origin | Meta? |
|---|---|---|---|
| `second_writing_session` | Second distinct `local_date` with a `writing_sessions` row where `words_added > 0` for this user (any project) | Server | **Yes** — this is exactly the "retained writer, not just signup" signal the product goal calls out; worth a Meta custom conversion so ad campaigns can eventually optimize toward it via Conversions API, not just pixel-side. |
| `third_writing_session` | Third such distinct date | Server | Optional — evaluate after `second_writing_session` proves useful; don't ship both day one. |

See Session-Definition Analysis (§ below) for why "distinct local writing day" is the recommended unit, not a per-sitting concept.

### Feature use
`export_completed`, `arena_session_completed`, `revision_note_created` — server-origin where possible (`arena_session_completed` can piggyback on `createGameSession()`; `export_completed` needs new client-side instrumentation at `ExportButton.tsx`/`ManuscriptExportButton.tsx` since nothing server-side observes exports today). None sent to Meta — feature adoption is an internal product question, not an ad-optimization signal.

### Revenue and lifecycle
| Event | Definition | Origin | Meta? |
|---|---|---|---|
| `subscription_started` | `checkout.session.completed` webhook branch, derived alongside the existing `upsertSubscriptionEvent()` call | Server | **Yes** — this is the real gap identified in §2; Meta currently has no purchase signal at all. |
| `subscription_cancelled` | `customer.subscription.deleted` webhook branch | Server | No (not typically useful to advertise against) |
| `account_deleted` | `deleteAccount()` in `settings.ts`, alongside the existing `deleted_accounts` snapshot insert | Server | No |

---

## 9. Event Placement Map (file paths and functions — summary; full detail in §4/§5/§8 tables above)

| Event | File | Function |
|---|---|---|
| `signup_completed` | `src/app/(auth)/signup/SignupClient.tsx` | `handleSubmit`, after `supabase.auth.signUp()` |
| `email_verified` | `src/app/auth/callback/route.ts` | `GET`, after `exchangeCodeForSession` |
| `onboarding_started` | `src/app/onboarding/page.tsx` | server render |
| `project_created` / `first_sentence_written` | `src/app/api/onboarding/route.ts` | `POST`, before response |
| `editor_opened` | `src/app/(app)/projects/[projectId]/chapters/[chapterId]/page.tsx` | server render |
| `first_character_typed` | `src/components/editor/RuneEditor.tsx` | `onUpdate` (new ref guard needed) |
| `first_save` / `first_sync_completed` | `src/lib/actions/pages.ts` | `syncPageWithLimitCheck` / `updatePage` success branch |
| word-count milestones | `src/lib/actions/unlockables.ts` | `checkAndGrantUnlockables` (piggyback existing pass) |
| `second_writing_session` / `third_writing_session` | `src/lib/actions/writingStats.ts` | `recordWordsWritten` (post-insert, count distinct prior dates) |
| `export_completed` | `src/components/editor/ExportButton.tsx`, `src/components/projects/ManuscriptExportButton.tsx` | `handleExport` (net-new instrumentation, nothing observes this today) |
| `arena_session_completed` | `src/lib/actions/games.ts` | `createGameSession` |
| `subscription_started` / `subscription_cancelled` | `src/app/api/webhooks/stripe/route.ts` | `checkout.session.completed` / `customer.subscription.deleted` branches, alongside `upsertSubscriptionEvent()` |
| `account_deleted` | `src/lib/actions/settings.ts` | `deleteAccount`, alongside the `deleted_accounts` insert |

---

## 10. Deduplication and Idempotency Strategy

Two event shapes, two dedup mechanisms — both enforced at the database level, not just in application code, so retries and offline-reconnect replays cannot double-write regardless of client bugs:

1. **One-time milestones** (`signup_completed`, `email_verified`, `project_created`, `first_sentence_written`, `first_save`, `first_sync_completed`, word-count milestones, `subscription_started`, `account_deleted`): `dedupe_key = null`, enforced by the partial unique index on `(user_id, event_name) where dedupe_key is null`. Insert via `on conflict do nothing` — safe to call from any retry path without checking existence first.
2. **Repeatable-but-should-only-fire-once-per-unit events** (`second_writing_session`, `third_writing_session`, per-project daily writing detection): `dedupe_key` set to a stable string (e.g. `'session_2'`, `'session_3'`, or a `local_date` value for a hypothetical "active day" event), enforced by the partial unique index on `(user_id, event_name, dedupe_key)`. Same `on conflict do nothing` insert pattern.

This mirrors the existing `increment_game_ticket()` upsert idiom (`UNIQUE` constraint + `ON CONFLICT`) already proven in this codebase — no new pattern is being introduced, just applied to a new table.

**Offline reconnection:** since all recommended server-origin events fire from server actions/route handlers/webhooks (not from the offline sync queue directly), there is no risk of an offline client re-queuing and replaying an analytics write on reconnect — the events fire once, synchronously, at the moment the authoritative server-side action succeeds (e.g. `first_save` fires inside `syncPageWithLimitCheck`'s success branch, which only runs once per successful sync, not once per queued retry). The one exception is `first_character_typed`, which is client-origin by necessity — that event should use the same `on conflict do nothing` pattern via the RPC, since a flaky network could cause the client to retry the call.

---

## 11. Privacy Boundaries

**Never stored in `analytics_events.metadata`:** manuscript content, opening-sentence text, project/chapter/page titles (unless a specific internal need is identified and approved — none was found in this audit), revision-note content, export contents, passwords, auth tokens, payment-card data.

**Safe to store:** numeric word counts (already the paste-deducted `writing_sessions.words_added`, never raw text), event source/route, onboarding step name, subscription tier, campaign identifiers (source/medium/campaign/content/term/fbclid — none of which are PII on their own), boolean flags (`is_canonical`, `tutorial` param value).

**Specific risk already identified in this audit that the analytics build must not repeat:** `first_sentence_written`'s natural implementation point (`/api/onboarding/route.ts`) has the literal typed sentence text sitting in a local variable a few lines above where the event would fire. The event payload must carry only `word_count`, never the `firstSentence` string itself — this is an easy mistake to make precisely because the text is right there in scope.

**Meta Pixel boundary (existing, must be preserved):** confirmed in §2 that no current `fbq()` call passes manuscript or PII data. The one open question — whether Meta's "Automatic Advanced Matching" dashboard setting is actually enabled and scraping email from form fields — is outside this repo's code and should be confirmed directly in Meta Events Manager by the founder (§14).

---

## 12. Meta Pixel Recommendations

Do not implement these now — recorded for the next phase, consistent with "send fewer events to Meta, not more."

1. **Gate the pixel to production only.** Add an env-var-driven pixel ID (`NEXT_PUBLIC_META_PIXEL_ID`) with a `process.env.VERCEL_ENV === 'production'` (or `NODE_ENV`) check before rendering `<MetaPixel />` at all. This alone fixes the dev/preview traffic pollution identified in §2.
2. **Add a `Purchase`/`Subscribe` custom conversion event** at the `checkout.session.completed` webhook branch (server-side, via Meta's Conversions API, not client-side pixel — a server-side Stripe webhook has no browser context to fire `fbq()` from anyway). This closes the biggest Meta gap found in this audit: campaigns currently cannot optimize toward revenue.
3. **Send `first_sentence_written` as a custom conversion**, not `CompleteRegistration` alone — this is the actual activation moment per Rune's own `ONBOARDING_VISION.md` definition, and a much higher-quality signal for ad optimization than "confirmed email."
4. **Add a `try/catch` around the `localStorage` calls** in `RegistrationTracker.tsx` — small, low-risk fix, but currently a real (if rare) re-fire risk.
5. **Confirm Advanced Matching's actual state** in Meta Events Manager and correct the privacy policy if it doesn't match reality (§2, §11).
6. **Consider a lightweight consent gate** before firing the pixel for EU/EEA visitors, given the current zero-consent-handling state is a real compliance gap — scope and urgency is a founder/legal call, not an engineering-only decision.

Internal events that should **not** go to Meta: word-count milestones below activation, `export_completed`, `arena_session_completed`, `revision_note_created`, `account_deleted`, `subscription_cancelled` — none of these are useful ad-optimization signals and sending them would just add noise to Meta's event stream.

---

## 13. Recommended Phased Implementation Plan

**Phase 0 — Schema only.** Add `analytics_events`, `acquisition_attribution`, and the `record_analytics_event()` RPC to `schema.sql` (following the `deleted_accounts` precedent — inline migration comment block, not necessarily a new numbered `008_*.sql` file, pending the founder decision in §14). No application code changes. Verify RLS (zero policies) and both partial unique indexes.

**Phase 1 — Server-side activation funnel.** Instrument the highest-value, lowest-risk events first, all server-origin: `email_verified`, `project_created`/`first_sentence_written`, `first_save`, `subscription_started`, `account_deleted`. These all sit at existing, well-understood server hook points (§9) and require no client-side code changes.

**Phase 2 — Attribution capture.** Land the UTM/`fbclid` cookie capture + `acquisition_attribution` write at signup. Low risk, purely additive, no existing behavior touched.

**Phase 3 — Client-side and milestone events.** `signup_completed`, `first_character_typed`, `editor_opened` (client variant if server-side proves insufficient for timing precision), word-count milestones piggybacked on `checkAndGrantUnlockables()`.

**Phase 4 — Retention.** `second_writing_session`/`third_writing_session`, derived from `writing_sessions` distinct-date logic (§ Session-Definition Analysis). Depends on Phase 1's events existing for at least a few days of real data to validate against.

**Phase 5 — Internal dashboard.** Requires the admin-access mechanism from §6 to be built first (new, not adapted from anything existing). Build funnel and per-user timeline queries against the indexes defined in §7.

**Phase 6 — Meta Pixel hardening.** The §12 recommendations, once the first-party system is proven and trusted as the system of record — deliberately last, so Meta-side changes are validated against real internal data rather than the other way around.

---

## 14. Open Decisions / Risks Requiring Founder Review

1. **Migration convention drift:** should `analytics_events` follow the older numbered-migration convention (`008_analytics_events.sql`) or the newer `schema.sql`-direct-edit convention established by `deleted_accounts`? Neither is unambiguously current practice — this should be settled once, ideally for all future tables, not decided ad hoc per feature.
2. **Admin access mechanism:** env-var email allowlist vs. a new `profiles.is_admin` column (§6) — a genuinely new capability either way, worth a deliberate choice rather than defaulting to whichever is fastest to build.
3. **Retention of `analytics_events` after account deletion:** should analytics rows cascade-delete with the user (matching every other FK in the codebase) or survive deletion like `deleted_accounts` does (no FK, for historical/audit purposes)? This has real privacy/GDPR "right to erasure" implications and should not be decided by engineering convenience alone.
4. **Meta Advanced Matching:** confirm its actual on/off state in Meta Events Manager (§2, §11) — this repo's code cannot answer that question, and the current privacy policy makes a factual claim about it that needs verification.
5. **`third_writing_session` → Meta or not:** recommended as optional/defer in §8 — worth revisiting once `second_writing_session` data exists and its usefulness as an ad-optimization signal can be judged empirically rather than speculatively.
6. **`ONBOARDING_VISION.md` staleness:** its "current flow" section actively contradicts the shipped code (§4). Recommend it be updated or explicitly marked historical so future contributors (human or AI) don't re-derive an already-outdated funnel map the way this audit initially risked doing.
7. **Pre-existing bugs surfaced incidentally by this audit** (not part of the analytics scope, but should not be lost): the `schema.sql` `pmusirojects` typo (§6), and the untracked `writing_sessions.page_id`/`increment_writing_session()` schema drift (§5) — both independent of the analytics work and should be triaged separately.

---

## 15. Files Likely to Change in the Next Implementation Phase

**New files:**
- `src/lib/supabase/schema.sql` — additive edit (or new numbered migration, pending §14 decision 1): `analytics_events`, `acquisition_attribution`, `record_analytics_event()` RPC.
- `src/lib/actions/analytics.ts` (new) — thin server-side wrapper(s) around the RPC, analogous to existing action files.
- `src/lib/types.ts` — add `AnalyticsEvent`/`AcquisitionAttribution` interfaces, following the existing manual-maintenance convention.

**Existing files that will gain new (additive) hook calls, per §9:**
- `src/app/(auth)/signup/SignupClient.tsx`
- `src/app/auth/callback/route.ts`
- `src/app/onboarding/page.tsx`
- `src/app/api/onboarding/route.ts`
- `src/app/(app)/projects/[projectId]/chapters/[chapterId]/page.tsx`
- `src/components/editor/RuneEditor.tsx`
- `src/lib/actions/pages.ts` (`syncPageWithLimitCheck`, `updatePage`)
- `src/lib/actions/writingStats.ts` (`recordWordsWritten`)
- `src/lib/actions/unlockables.ts` (`checkAndGrantUnlockables`)
- `src/components/editor/ExportButton.tsx`, `src/components/projects/ManuscriptExportButton.tsx`
- `src/lib/actions/games.ts` (`createGameSession`)
- `src/app/api/webhooks/stripe/route.ts`
- `src/lib/actions/settings.ts` (`deleteAccount`)

**Meta Pixel files (Phase 6 only, per §13):**
- `src/lib/meta-pixel.ts`, `src/components/MetaPixel.tsx`, `src/components/RegistrationTracker.tsx`, `src/lib/env.ts` (new pixel-ID env var).

**New admin-access files (§6, needed before Phase 5):**
- `src/app/(app)/admin/layout.tsx` (new)
- A new server-only env var for the access allowlist, or a `profiles.is_admin` migration — per §14 decision 2.

**Not expected to change:** anything in `src/lib/offline/`, `src/lib/actions/projects.ts`/`chapters.ts` core CRUD, `src/lib/actions/notes.ts`, `src/proxy.ts`, or any Stripe billing logic beyond the single additive call noted above.

---

## Session-Definition Analysis (supporting detail for §8)

Rune needs a reliable definition of "Nth writing session." Four candidates were compared against what already exists:

| Candidate | Feasibility today | Verdict |
|---|---|---|
| Separate `writing_sessions` rows as literal per-sitting events | `writing_sessions` rows already exist, but represent **daily aggregates** (`unique(user_id, project_id, session_date)`), not sittings — redefining their semantics would be a breaking change to streak/goal logic that already depends on the daily-bucket meaning. | Rejected — would require breaking an existing, working system. |
| **Distinct local calendar days** | `writing_sessions.session_date` (via `getLocalDateString()`) already gives exactly this, and `computeStreaks()` already operates on distinct dates with `words_added > 0`. Zero new instrumentation needed — "Nth writing session" = the Nth distinct `session_date` with a positive-word-count row. | **Recommended.** Simplest, reuses a proven, already-correct local-date convention, and is trivially queryable from data that already exists. |
| Inactivity-based session windows (e.g. 30-minute gap = new session) | Would require a net-new timestamped event stream with gap-detection logic — not derivable from any existing table. Meaningfully richer (captures multiple sittings per day), but a real engineering investment with no existing foundation. | Not recommended for the initial build — revisit only if "distinct days" proves too coarse in practice. |
| Editor-open sessions (each mount = 1 session) | Trivial to instrument (`editor_opened` event), but prone to inflation — a writer who opens the editor five times in one day to read, not write, would count as five "sessions," which is not a meaningful retention signal. | Rejected — measures the wrong thing. |

**Recommendation:** define a "writing session" as **a distinct local calendar day with at least one `writing_sessions` row where `words_added > 0`**, reusing the exact `getLocalDateString()` convention already proven in the streak system. `second_writing_session`/`third_writing_session` should fire from `recordWordsWritten()` in `src/lib/actions/writingStats.ts`, immediately after a successful positive-word insert, by counting the distinct prior dates for that user and checking if the count just crossed 2 or 3 — no new tables, no new client instrumentation, and it inherits correctness from a system that has already been in production use.

---

## Terminal Summary

**File created:** `docs/ANALYTICS_ARCHITECTURE_AUDIT.md`

**Most important Meta Pixel finding:** the pixel has zero purchase/subscription tracking despite a fully working Stripe flow, is not gated to production (hardcoded ID, no env var, fires identically in dev/preview/prod), and has no consent mechanism at all — three independent, real gaps, not one.

**Most important attribution finding:** Rune captures zero UTM/campaign/click-ID data anywhere in the stack today. The only acquisition signal that exists is a third-party affiliate ID (PromoteKit) forwarded to Stripe metadata at checkout and never persisted to Supabase — first-touch attribution is a fully greenfield build, nothing to migrate.

**Recommended analytics architecture:** a single `analytics_events` table (service-role-only via RLS-enabled-zero-policies, matching the `deleted_accounts` precedent exactly) plus a small `acquisition_attribution` table, written through a `SECURITY DEFINER` RPC modeled on the existing `increment_game_ticket()` idempotent-upsert pattern, with two partial unique indexes handling one-time-milestone vs. repeatable-event deduplication.

**Recommended writing-session definition:** a distinct local calendar day with positive `writing_sessions.words_added` — reuses existing, proven data and the existing `getLocalDateString()` convention with zero new instrumentation required.

**Highest-risk implementation area:** the internal admin dashboard's access control — Rune has no admin/role concept anywhere today, so this is new infrastructure, not an extension of anything existing, and deserves the founder decision flagged in §14 before any code is written.

**Decisions needing founder approval:** migration-file convention going forward (§14.1), admin-access mechanism (§14.2), analytics-row retention after account deletion (§14.3), Meta Advanced Matching's real on/off state (§14.4).

**Confirmation:** no runtime behavior was changed. Only `docs/ANALYTICS_ARCHITECTURE_AUDIT.md` was created; `git diff` shows no other files touched.

---

## Phase 1 Addendum — Implementation Decisions That Differed From §7/§10

Phase 1 (infrastructure only — `analytics_events`, `acquisition_attribution`, `src/lib/actions/analytics.ts`, event typing) is implemented. Two decisions came out simpler than the recommendation above; recorded here per the phase's instruction to update this doc only where implementation diverged.

1. **No `record_analytics_event()` RPC.** §7 proposed a `SECURITY DEFINER` RPC modeled on `increment_game_ticket()`. Implemented instead as a plain service-role insert in `recordAnalyticsEvent()` (`src/lib/actions/analytics.ts`), using the same inline-service-role-client pattern already shipped in `deleteAccount()` (`src/lib/actions/settings.ts`). `analytics_events` has zero RLS policies either way, so the RPC's only real justification would have been the partial-unique-index conflict target below — once that was simplified away, a normal helper was sufficient and matches the codebase's existing "ad hoc service-role client" precedent more closely than introducing a new RPC pattern would have.
2. **One non-partial unique index instead of two partial ones.** §7 proposed `(user_id, event_name) where dedupe_key is null` plus `(user_id, event_name, dedupe_key) where dedupe_key is not null`. Postgres requires an explicit `WHERE` clause on the `ON CONFLICT` target to match a partial index, which PostgREST's `upsert(..., { onConflict })` cannot express — that would have forced the RPC in decision 1. Instead, `recordAnalyticsEvent()` always supplies a `dedupe_key` (a fixed `"once"` sentinel when the caller omits one for a true one-time milestone, or a caller-supplied value for repeatable events), so a single non-partial `unique index on (user_id, event_name, dedupe_key)` covers both cases and works with a plain `.upsert(..., { ignoreDuplicates: true })`. The `dedupe_key` column itself stays nullable at the schema level as specified; the helper is what guarantees it's always populated in practice.

Everything else — table shape, both tables' zero-policy RLS pattern, the two read-path indexes, the event taxonomy, the cascade-delete decision for `analytics_events.user_id` (confirmed with the founder during this phase, resolving §14 decision 3) — matches the recommendation as written.
