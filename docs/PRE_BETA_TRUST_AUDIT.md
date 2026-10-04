# Rune 2.0 — Pre-Beta Trust Audit (2026-10-04)

Native editing, security and legal/trust audit before Rune 2 goes to `rune-app.com` and real closed-beta writers. Nothing in this audit was committed, deployed, or applied to a live database. Branch `rune-2`, worktree `/Users/eyanelali/rune-2`.

Live migration state (from `npm run db:migrations`, read-only, at the start of the audit): **latest applied 053**; every repository migration from 013 through 053 is in the live ledger. Migrations 054 and 055 were written during this audit and are **not applied**.

---

## 1. Live migration state

- Ledger read through the Rune 2.0 project (`schema_migrations`): 013 … 053 applied, latest 053 (`053_profile_invariant.sql`, 2026-10-04 00:54 UTC).
- Written during the audit, not applied: `054_game_ticket_caller_check.sql`, `055_attachment_registration_hardening.sql`.
- `src/lib/supabase/schema.sql` regenerated and `--check` reports current (includes 054 + 055).

## 2. Selection / accent changes

Files: `src/lib/rune2/themes.ts`, `src/app/(rune2)/rune2.css`, `src/app/globals.css`.

- The interface selection (`--r2-selection`) was already derived from the accent tint. The gap was the curated **writing surfaces** (White, Paper, Warm, Soft gray, Charcoal), which hard-coded a blue caret and a blue selection (Warm a brown one). They now read the accent: `ms-caret: var(--r2-accent)` and `ms-selection: rgba(var(--r2-palette-blue) / α)` with each surface's own alpha (0.15–0.3).
- Those two tokens are now emitted in the **manuscript region** rather than on the root (`buildThemeCss`), so a surface of the other scheme (Charcoal in Light, Paper in Dark) resolves the accent variant made for the page's scheme. `surfaceColours()` mirrors this for tests; `ACCENT_SURFACE_TOKENS` exported.
- `::selection` rules keep no `color`, so text keeps its ink; alphas are muted (0.15–0.3) — never saturated.
- Verified in the browser: Light + Burgundy, Dark + Forest, Candlelight + Slate Teal, Light + Graphite; prose, Workspace Entry text, Settings fields all share the one selection colour. Caret follows the accent (computed `caret-color` checked). All seven accents × three themes pass the harness contrast tests (caret ≥ 4.5:1 on every surface).
- Legal pages (`(legal)` layout) are still the legacy Candlelight-only layout outside `.r2`; untouched.

## 3. Scrollbar changes

- New palette tokens `scrollbar` (rest: accent tint / 0.3), `scrollbar-hover` (/ 0.5), `scrollbar-active` (the accent). Track stays transparent.
- WebKit/Blink: `::-webkit-scrollbar-thumb:hover/:active` rules; Firefox/Chrome-standard: `scrollbar-color`, with the hover value applied to the hovered scroll region (`.r2 :where(:hover)`), since Firefox has no thumb-level hover state.
- Finding fixed on the way: `scrollbar-width` is not inherited, so `thin` is now applied to every element under a Rune root; and the legacy `globals.css` universal rule (`* { scrollbar-color: gold }`) was beating the Rune 2 root's inherited value in Firefox — it is now scoped `*:not(.r2, .r2 *)`.
- Note for Chrome ≥ 121: once `scrollbar-color` is set, `::-webkit-scrollbar` rules are ignored; the standard properties carry the look. macOS overlay scrollbars only appear while scrolling (OS setting) — verified the thumb is accent-tinted and the hover value applies.
- Not verified: high browser zoom (the automation cannot change page zoom) and Safari.

## 4. Chapter-wide ⌘A / Ctrl+A

Files: `src/lib/rune2/chapterSelection.ts` (pure model), `src/components/rune2/ChapterSelection.tsx` (controller + decoration plugin), `src/components/rune2/Rune2Editor.tsx`, `src/components/rune2/Rune2Writing.tsx`, `rune2.css`.

Why not native: a browser confines a selection that begins inside an editable region to that editing host, and WebKit adjusts even programmatic selections so they never cross one. With one editor per Scene (architecture §7) there is no native selection that can run from Scene 2 into Scene 4.

How it works:
- ⌘A (Ctrl+A elsewhere) with focus in any Scene editor selects the **document shown**: the Chapter title and every Scene in manuscript order (a single opened Scene: its title and prose). Navigator, tabs, Inspector, Revision Notes and chrome are never part of it.
- The Scene the writer is in keeps a real native selection (so the browser fires `copy` and focus stays put); every Scene in the range paints the same highlight as a ProseMirror inline decoration (`.r2-xsel`, `var(--r2-selection)`); the native paint is hidden meanwhile, so the Chapter reads as one selection. The title is highlighted too.
- If the focused Scene is empty, the native selection moves to the first Scene with text, so there is always something for the browser to copy.
- The selection is **read-only**: typing, Backspace, Delete, Enter, Tab collapse it (caret returns to where it was before ⌘A) and the key is dropped — a highlight that spans Scenes can never become an edit that spans them. Escape collapses to the caret; arrows/Home/End collapse to the selection's start or end; a click anywhere clears it; opening another document or a change in the Chapter's Scenes clears it. Other shortcuts (⌘Z, ⌘B…) pass through after collapsing.
- A visually hidden live region announces "Whole chapter selected, across N scenes." for assistive technology.
- Nothing is saved, merged or re-ordered; decoration transactions carry no document change and are excluded from history.

Copy: `copy` (and `cut`, which copies and deletes nothing) is intercepted on the writing column and the range is serialised from the Scenes' own documents: `text/html` (title as `<h1>`, then each Scene's fragment through the editor schema's DOMSerializer — paragraphs, headings, marks preserved) and `text/plain` (title, then prose with ProseMirror's paragraph separator inside a Scene and a blank line between Scenes — the whitespace the Chapter shows; export keeps its `* * *`).

## 5. Cross-Scene drag selection

- A drag that starts in one Scene and leaves it enters the same model: the anchor is read from the browser's own selection in the origin Scene, the head from the pointer (`posAtCoords` inside a Scene; the end of the Scene above when between two; the Chapter's ends beyond the first/last; the title when the pointer is above it). Works downward and upward.
- While the pointer is outside the origin Scene the column auto-scrolls at its edges (reusing `lib/rune2/dragAutoScroll.ts`, reduced-motion aware); returning into the origin Scene hands back to the browser's native selection.
- After mouse-up the selection stays (copyable) until a click or key.
- Known native behaviour kept: pressing inside already-selected text starts a text drag-and-drop, not a new selection, exactly as in any editor.

## 6. Manuscript interaction browser results (Chrome, dev server, 7-Scene Chapter incl. one empty Scene)

| Check | Result |
|---|---|
| ⌘A from Scene 2 | title + all 7 Scenes highlighted; status "Whole chapter selected, across 7 scenes." |
| ⌘C after ⌘A | `text/plain` 1,503 chars in order (title, blank-line Scene breaks, empty Scene silent); `text/html` `<h1>…</h1><p>…` |
| typing with selection active | key dropped, selection collapsed, word count unchanged (289), focus kept |
| typing after collapse | inserts normally; ⌘Z undoes it |
| drag Scene 1 → Scene 4 | one continuous highlight across 4 Scenes; copy starts at the drag anchor |
| drag Scene 4 → above title | title + Scenes 1–4 selected |
| Escape / arrows | collapse to caret, decorations gone |
| Inspector open/closed | selection persists |
| Reading Mode | opens and reads normally; untouched by the layer |
| Workspace Entry text | native selection in the accent, coherent |
| autosave / offline queue / conflicts | decoration transactions never touch the doc; save status stayed "Saved"; engine code untouched |
| auto-scroll | loop verified with synthetic pointer events and a frame shim (the automation tab was hidden, which pauses animation frames); a real held pointer at the edge still owes a hands-on check |
| Safari | **not tested** (no automation); the design avoids the WebKit editing-boundary rule by construction |

Harness: `tools/sync-harness/tests/app-chapter-selection.test.mjs` (ranges, text serialisation with the real schema, key classification) — 4/4 pass.

## 7. Security threat model

Attacker: a normal or malicious user with public application access and the public client credentials (anon key, their own session). Goals: read/infer/modify/delete/enumerate another writer's data; reach admin (Pulse, beta approval); abuse storage; inject active content; take over accounts via auth flows. Not in model: AI prompt injection (no AI surface), physical access, Supabase/Vercel platform compromise, the founder's own database access (disclosed in the Privacy Policy).

## 8. RLS / database findings

48 public tables, RLS enabled on all, no views. Full table matrix in the RLS agent's report (`tests/security-rls.test.mjs` encodes it). No table lets attacker or anon read, write, delete or enumerate victim rows, including Trash states, purges, beta tables, admin rows, ledger.

- `profiles.is_admin` and billing columns are reverted by BEFORE UPDATE triggers — verified an own-row UPDATE cannot set them.
- Low (unchanged): own-row INSERT on `user_unlockables`/`xp_events` and own `xp`/`level` lets a writer self-grant legacy unlocks/XP (own data; XP model being retired — flag for the unlock-model rework). Own writing-history rows are fully writable by design.
- Info: Supabase default grants include TRUNCATE for anon/authenticated (unreachable through PostgREST); a blanket revoke is a policy decision.

## 9. RPC / function findings

167 functions; after 054 every one pins `search_path`. Only `join_beta_waitlist`, `free_word_limit_for_caller`, `lock_account_word_budget` are anon-callable (the last two raise without a user).

- **Moderate — fixed (054):** `increment_game_ticket(p_user_id, p_week_start)` (legacy Arena, 005) was SECURITY DEFINER with no caller check, no pinned search_path, EXECUTE to PUBLIC. Anyone with the anon key could spend any writer's weekly Arena tickets and plant `game_tickets` rows. Not called by the rune-2 app. 054 requires `p_user_id = auth.uid()` (or service_role), pins search_path, revokes from public/anon; also pins `touch_pricing_entitlement_updated_at`.
- **Low — fixed (055):** `create_workspace_attachment` accepted unvalidated bucket/MIME/kind/size/keys from a direct client call (keys are unguessable UUID paths; no cross-user read was possible). 055 enforces the app's own shape.
- Low: UUID existence oracles on a few error messages (reveal only that a random v4 UUID exists).
- All manuscript, trash, backup, search, workspace, property/view, reference, canvas, attachment, history, revision-note and account RPCs refuse forged/cross-project IDs with no side effects (whole-database digest before/after each attack).

## 10. API / server-action findings

Every writer-facing action authenticates with `supabase.auth.getUser()` and proves ownership through the RLS-scoped client or owner-checked RPCs; no action passes a client-supplied ID to the service-role client.

- **Moderate — fixed:** `recordAnalyticsEvent` (service-role writer taking arbitrary `userId`/`eventName`/`metadata`) lived in a `"use server"` module imported by a client component, so it was callable as a Server Action by any client — Pulse funnels could be poisoned. `src/lib/actions/analytics.ts` is now a plain server module; the one browser-recorded event lives in `src/lib/actions/signupAnalytics.ts` (writes only `signup_completed`, UUID-validated, profile must exist).
- Low (unchanged): `awardXp`/`awardProjectXp` trust client amounts (legacy XP, cosmetic); `recordSignupCompletedEvent` can mark another existing user's `signup_completed` once (Pulse accuracy only); `/api/billing/checkout` is a state-changing GET (disabled by `BILLING_OPEN=false`; make it POST when billing reopens); proxy offline `getSession()` fallback affects only the redirect decision.
- Low (unchanged): ~40 actions return raw Supabase `error.message` to authenticated callers (constraint/table names, never data).

## 11. Pulse / admin findings

- `/pulse` is gated twice (`(app)/layout.tsx` and the page) via `requireAdmin()`; every one of the 19 Pulse actions and both beta operator actions re-check `profiles.is_admin` server-side before using the service client (tested as non-admin and signed-out).
- `is_admin` is the DB column, read through the user's own RLS-scoped row, never from the client; an own-row update is reverted by trigger.
- Beta approval is admin-only; `beta_access` has no client policy; `claim_beta_access()` takes no parameters and uses the session's own email, so another email's approval cannot be claimed.
- Pulse never selects `scenes.content`; feedback shows body + sanitised route context + pen name only (static test asserts no prose select).
- Browser: admin account loads Pulse; the harness covers non-admin refusal.

## 12. Auth findings

- Order preserved: session → `/auth/callback` (exchange → 053 profile gate → destination) → `/complete-profile` → `/projects` layout (getUser → profile → beta claim → device gate).
- **Moderate — fixed:** `/auth/callback` built `${origin}${next}` from a raw `next`; `next=@evil.example` became `https://rune-app.com@evil.example` (user-info trick). An attacker could trigger a genuine Rune magic-link/sign-up email with that redirect and land the victim on their site after sign-in (cookies stay on Rune; phishing-grade). New `src/lib/authRedirect.ts` `safeNextPath()` accepts only in-app absolute paths (rejects `//`, `/\`, schemes, `@`, control chars). Verified: `?next=@evil.example` and `?next=//evil.example` both go to `/login?error=confirmation_failed` with a bad code.
- Spent/expired/forged links → `/login?error=confirmation_failed`; missing profile → `/complete-profile` regardless of `next`; missing beta record → `none` → front door; confirmed-but-unapproved cannot create Projects (DB trigger).
- Proxy covers all routes except the Stripe webhook and static assets; every handler re-checks the user itself.

## 13. XSS / content-injection findings

No exploitable XSS found. React escapes everywhere; the three `dangerouslySetInnerHTML` sites render the static theme CSS only; no `innerHTML`/`document.write`/`srcdoc`/`eval`. TipTap link marks reject `javascript:`/`data:`/`vbscript:` (incl. obfuscated); `ProseSnapshot`/Reading Mode render an element allowlist and never spread attrs; exports escape XML/Markdown; file names sanitised; Pulse renders user strings as JSX text; search terms are not turned into regexes. Low: stored TipTap JSON is not schema-validated server-side (a writer can only corrupt their own document; render paths are allowlisted).

## 14. Import / upload / storage findings

- Imports are parsed in the browser (hand-rolled ZIP + XML tokenizer, no entity expansion); the server receives only text runs with a 15-bit mark set and rebuilds TipTap JSON itself — HTML in `.md`/`.docx`/`.txt` stays literal. 4 MB body cap, 400k-paragraph budget, 20k-deep nesting handled; `import_manuscript_checked` always creates a new Project owned by the caller.
- Storage: bucket `workspace-attachments` is private, service-role only, no public or signed URLs; the only URL is `/api/attachments/<id>` read under RLS as the signed-in user (other writer/anon → 404/401). Keys `<projectId>/<attachmentId>/original|display.<ext>`.
- **Moderate — fixed:** the serve path trusted the client-declared MIME and never validated the display derivative, so a writer could store HTML as `display` and have it served as `text/html` from the app origin (self-XSS today; a real stored XSS the moment attachments are shared or previewed by admin). Now: magic-byte checks for original and derivative (PNG/JPEG/GIF/WebP), accepted-type enforcement, serve path answers only with an accepted image type or `application/octet-stream`, plus `Content-Security-Policy: default-src 'none'; sandbox` on the response; RFC 5987-complete filename encoding.
- Not expanded: supported file types unchanged.

## 15. Secrets / infrastructure findings

- No secrets in the working tree or git history (service-role, Stripe, webhook, DB URL patterns searched across all history). No `.env*` ever committed; `.gitignore` covers them. `stripe.tar.gz` at the repo root is a 9-byte "Not Found" junk file — delete it.
- Client/server boundary sound: only intentionally public `NEXT_PUBLIC_*` values reach the browser; the service-role client is server-only; no manuscript content is logged.
- `productionBrowserSourceMaps` unset (default off). No `.env.example` (the ignore rule would need an exception).

## 16. Browser / header / CSRF findings

- Before: no security headers. After (`next.config.ts`, all routes, enforced): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()`, `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
- CSP shipped as **`Content-Security-Policy-Report-Only`**: `default-src 'self'; script-src 'self' 'unsafe-inline' https://connect.facebook.net https://cdn.promotekit.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' blob: data: https://www.facebook.com; connect-src 'self' <supabase https+wss> https://connect.facebook.net https://www.facebook.com https://*.promotekit.com; worker-src 'self' blob:; media-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'none'; manifest-src 'self'; upgrade-insecure-requests` (dev adds `'unsafe-eval'`). `'unsafe-inline'` for scripts is unavoidable without nonces (next-themes, Meta Pixel inline bootstrap, Next hydration); the value of this CSP is `connect-src`/`frame-ancestors`/`object-src`/`base-uri`/`form-action`.
- Browser pass (dev): front door, login, editor, Settings, Pulse produced no CSP violations. **Promote to enforced** after one pass on the production URL with the Pixel and PromoteKit loading (rename the header key).
- CSRF: Next 16 enforces Origin/Host on every Server Action POST; `allowedOrigins` is unset (same-origin only, correct for one host); Supabase cookies are SameSite=Lax; the two custom POST handlers (attachments, import) require the session and are same-origin fetches; the Stripe webhook is signature-verified. No extra machinery needed.
- Don't submit to the HSTS preload list until apex and www are confirmed HTTPS-only.

## 17. Abuse / rate-limit findings

- Added `src/lib/rateLimit.ts` (in-memory fixed window; per Vercel instance; fails open; honest caveats in the header) wired into `joinBetaWaitlist` (5 per IP / 10 min) and `submitFeedback` (20 per user / hour).
- Deferred: durable DB-side caps (migration territory) for waitlist/feedback; per-user attachment storage quota; import per-user cap (each import creates a Project, bounded to the caller's own account); plus-addressing can still create many waitlist rows. Supabase Auth's own signup/OTP rate limits and hCaptcha toggle should be confirmed in the dashboard.
- Search (029) and backup (041) are clamped in SQL; `/api/ping` trivial; billing routes short-circuit on `BILLING_OPEN=false`.

## 18. Dependency audit findings

- Committed `next@16.2.6` carried **critical** advisories, two reachable in Rune (`next/og` ImageResponse RCE via `src/app/opengraph-image.tsx`; proxy/middleware bypass affecting `src/proxy.ts`). Bumped `next` and `eslint-config-next` to **16.3.8** (minor; also clears transitive nanoid/postcss/sharp). Build and type-check pass on 16.3.8.
- Remaining (`npm audit --omit=dev`: 2 high, 28 moderate): `@tiptap/core` ≤ 3.30.4 high (`__proto__` via attacker-controlled JSON — only own documents in the beta; Markdown ReDoS — no Markdown extension used) → deferred to a coordinated all-`@tiptap/*` bump with an editor verification pass (an `audit fix` would mix 3.23/3.31 with peer conflicts); `dompurify` via `jspdf` (only used by `.html()`, which Rune never calls); `baseline-browser-mapping` (build-time). Dev-only: babel/brace-expansion/braces/browserslist/js-yaml. No `npm audit fix` run. Harness deps: 0 vulnerabilities.

## 19. Security fixes made

1. 054 — `increment_game_ticket` caller check + search_path + grants (DB).
2. 055 — `create_workspace_attachment` shape/key/MIME hardening (DB).
3. Analytics writer no longer a Server Action; `signupAnalytics.ts`.
4. `safeNextPath()` for `/auth/callback`.
5. Attachment store/serve: magic-byte checks, image-only content types, sandboxed CSP on the response, RFC 5987 filenames.
6. Security headers + report-only CSP.
7. Rate limits on waitlist and feedback.
8. `next` 16.3.8.
9. Harness: `security-rls` (15), `security-rpc` (18), `security-actions` (9), `security-content` (11) tests + `lib/security-fixture.mjs`, `mocks/nextHeaders.js`.

## 20. Unresolved security risks by severity

- **Critical:** none.
- **High:** none open. (`@tiptap/core` high advisory: not reachable cross-user in the closed beta; coordinated upgrade task.)
- **Moderate:** CSP is report-only until the production browser pass; rate limits are per-instance, not durable.
- **Low:** legacy XP/unlock self-grant; own-history forgery; raw Supabase error messages; GET checkout when billing reopens; UUID existence oracles; no server-side TipTap schema validation; TRUNCATE default grants; no per-user storage quota; `deleted_accounts` retention (see legal).
- **Needs dashboard check:** Storage bucket policies (not in migrations), Auth rate limits/hCaptcha, auth email sender.

## 21. Actual data-flow inventory

| Category | Stored | Processors | Deletion |
|---|---|---|---|
| Email, password hash / magic link | Supabase Auth | Supabase (auth emails) | immediate; email copied to `deleted_accounts` |
| Pen name, username, avatar, preferences, is_admin, legacy xp/level/subscription cols | `profiles` | Supabase | cascade; username/display name/xp/level/tier copied to `deleted_accounts` |
| Projects, manuscripts, groups, chapters, scenes (TipTap JSON), scene revisions, milestones, scene properties/views, revision notes | Postgres | Supabase | cascade; Trash is soft delete until the writer empties it |
| Workspace documents/folders/nodes/collections/entries/properties/values/views, canvases/items/connections, references | Postgres | Supabase | cascade |
| Attachments (images ≤ 10 MB, SVG refused) + display derivative | `workspace_attachments` + private bucket | Supabase Storage | best-effort byte purge; failures recorded for an operator |
| Imported manuscripts | parsed in the browser; only text structure sent | Vercel (transit), Supabase | becomes a Project |
| Writing history (`writing_sessions`, goals, onboarding) | Postgres | Supabase | cascade |
| Legacy: xp_events, game sessions/tickets, unlockables, future letters, pricing entitlements, subscription events | Postgres | Supabase | cascade |
| First-party analytics (`analytics_events`: user, event, project id, local date, small metadata) | Postgres, service-role write only | Supabase | cascade |
| Attribution (`rune_attribution` cookie 30 d → `acquisition_attribution`) | cookie + Postgres | Supabase | cascade |
| **Meta Pixel** — loaded in the root layout on **every page including the signed-in app**; PageView on each route change, CompleteRegistration after signup; `_fbp`/`_fbc` cookies; no consent banner | — | Meta | not controllable |
| **PromoteKit** affiliate script on every page (only used to pass a referral into Stripe checkout, which is closed) | — | PromoteKit | — |
| Stripe | dormant (`BILLING_OPEN=false`); webhook route still reachable; no payment data collected | Stripe | — |
| Feedback (`beta_feedback`: category, body, route/surface/device/browser/viewport/build) | Postgres, shown in Pulse with pen name | Supabase | cascade |
| Waitlist (`beta_waitlist`: email, name?, writes?, created_at) | Postgres | Supabase | **survives account deletion** |
| Beta access (email, user_id, approved/accepted) | Postgres | Supabase | user_id nulled; email stays approved |
| Device/browser metadata | provider request logs; localStorage prefs/tutorial flags; IndexedDB offline drafts | Vercel, Supabase | provider defaults (unknown) |
| Founder notes | `founder_notes` (admin only) | Supabase | author nulled |
| Hosting regions, backup/PITR retention | **unknown from the repo** — read from the Supabase/Vercel dashboards | | |

## 22. Privacy Policy findings / changes

`src/app/(legal)/privacy/page.tsx` rewritten (dated 2026-10-04). The old text was Rune 1.x (XP/levels, subscriptions, Stripe card handling, "delete within 30 days", Pixel "only on marketing pages", PromoteKit undisclosed, no Québec items). Now: operator in Québec, closed-beta framing, "Rune will never use AI to write, rewrite, or complete your story" verbatim and scoped to the story, per-category collection and purpose, imports read on device, analytics never contain content, attribution cookie, feedback fields, waitlist fields, honest founder database access, processors (Supabase, Vercel, Meta Pixel on all pages, PromoteKit, Stripe dormant), no AI/ML services, cross-border processing (may be outside Québec/Canada incl. US), security limits + breach notice, cookies/browser storage, exports, deletion (immediate; what remains; provider backups expire — no instant-eradication claim), retention, rights incl. CAI complaint, children (13; Québec under-14 parental consent), changes, responsible person = the founder, contacts `privacy@rune-app.com` / `support@rune-app.com`. Removed claims Rune cannot guarantee (SOC 2/GDPR assertions about providers, 30-day window, erasure from all backups, regions).

## 23. Terms findings / changes

`src/app/(legal)/terms/page.tsx` rewritten. Removed Scribe/Arcane plans, Stripe billing/refunds, XP/unlockables/game modes, "30-day retention after termination" (false), word-count rules. Now: free invite-only closed beta, waitlist grants nothing, no charge, product may change, any paid plan requires new acceptance; account security; age ≥ 13 (existing floor kept, flagged); writer owns Content, Rune claims none, limited operational permission (store, sync, back up, display, count words, export) only while Content is in Rune, no AI training/selling; export always available; acceptable use; Rune's IP; feedback licence (ideas only, never Content); no uptime promise; immediate deletion; suspension/termination with a chance to export; warranty disclaimer with consumer-law carve-out; liability cap (greater of fees paid and "one hundred dollars", currency unstated); governing law Québec/Canada "unless your local law requires otherwise", contact-first disputes; changes; contacts.

## 24. Authorship / IP findings

Terms §3 and Privacy §1/§3 now state: ownership stays with the writer; Rune claims none; Rune's only right is the operational permission to store, sync, back up, export and display; the AI promise verbatim. No broad IP licence was written. The old Terms had no materially different ownership claim; the gap was obsolete commercial language, now removed.

## 25. Beta / waitlist / CASL findings

- Front door, onboarding, feedback and Settings copy: clear Beta status, no scarcity, no pricing, no uptime/permanence claims — unchanged.
- Signup page has **no Terms/Privacy acceptance line** (login has one) — add the same sentence (consent at the point of collection under Law 25). Waitlist form has **no purpose/consent statement**.
- Waitlist records email, optional name/"writes", `created_at`; **not** source, IP, consent wording/version, or unsubscribe state. No sending tool, sender identity or unsubscribe mechanism exists.
- Before any broad or marketing email: add a consent line at the form and store consent timestamp + wording version + source (schema change); choose a sender with one-click unsubscribe honoured within 10 business days and a suppression list; identify the sender (name, mailing address, contact) in every message; keep consent records; treat one-to-one beta invitations as the "requested" case but still include identity + unsubscribe.

## 26. Contact-address issues Eyan must confirm

Every mailbox was on `rune.app` while the site is `rune-app.com`; mail would have gone to whoever owns rune.app. Changed to `rune-app.com` in: `(legal)/privacy/page.tsx`, `(legal)/terms/page.tsx` (`legal@` dropped), `src/components/front/PublicFrame.tsx:27`, `src/components/rune2/RuneSettings.tsx:319-320`. Unchanged: `src/app/layout.tsx:29,34` `https://www.rune-app.com` (metadataBase/OG — confirm www vs apex), `DEPLOYMENT.md` examples.

**Confirm these exist and are read:** `support@rune-app.com`, `privacy@rune-app.com`. Confirm rune-app.com vs rune.app ownership and the Supabase Auth sender address / custom SMTP.

## 27. Account export / deletion findings

- Deletion (`settings.ts deleteAccount`): snapshot → `deleted_accounts` (email, username, display name, xp, level, tier) → best-effort attachment byte purge → `auth.admin.deleteUser` → cascades (profiles, projects and every project table, history, analytics, attribution, feedback, onboarding, subscription events). Remains: `deleted_accounts` row (indefinite), `beta_waitlist` row, `beta_access` email. Legal text now matches; "30 days" removed; backups described as expiring after a limited period, never instant eradication.
- Export: Settings JSON = projects/manuscripts/groups/chapters/scenes; Project Backup ZIP (041) = everything per project incl. Trash, canvases, attachments, history, goals, notes; manuscript export DOCX/PDF/MD/TXT. Not exportable in-app: profile/preferences, feedback, analytics, attribution — policy says to write in.
- Deletion only touches the caller's own rows (service role used only with the session's own id); verified by the actions tests.

## 28. Migrations written (not applied)

- `src/lib/supabase/migrations/054_game_ticket_caller_check.sql` — apply as `postgres` in the SQL editor on the Rune 2.0 database; requires 013 + 053 in the ledger, refuses re-run; no env vars, no deploy order dependency; smoke: own-id call succeeds, another id → 42501, anon → permission denied; `npm run db:migrations` shows 054.
- `src/lib/supabase/migrations/055_attachment_registration_hardening.sql` — same procedure; requires 047; independent of 054; app calls already match the enforced shape; rollback = re-create 047's body + delete ledger row.
- `schema.sql` regenerated with both.

## 29. Automated checks

See the chat report for the final numbers (full harness, `tsc`, ESLint, `next build`, schema check, `npm audit`).

## 30. Browser / adversarial checks

Done with the admin account in Chrome against the dev server: Pulse loads; forged callback `next=@evil.example` and `//evil.example` → `/login?error=confirmation_failed`; `/api/attachments/<random uuid>` and `/pulse` without a session → redirect to login; security headers present on every response; no CSP report-only violations on front door, login, editor, Settings, Pulse. Cross-account attacks (victim/attacker/unapproved) were run deterministically in the harness against the real schema and real server actions rather than in the browser — a second confirmed beta account was not available to sign in. Owed: a two-account hands-on pass on the production URL (Project URLs, Trash, attachments, backup paths), the Safari manuscript pass, and the CSP promotion pass.

## 31. What should block closed beta

1. Apply 054 and 055 (or accept their risk explicitly — both are low-exploitability today).
2. Decide the Meta Pixel + PromoteKit question: they load on every signed-in app page with no consent UI; Law 25 requires informing about tracking tech and a way to deactivate. Recommended: remove them from the app routes (keep, if at all, on the front door) before writers enter.
3. Confirm the two mailboxes exist (`support@`, `privacy@` on rune-app.com) — the legal pages now point to them.
4. Add the Terms/Privacy line to the signup page and a purpose line to the waitlist form.
5. Promote the CSP after the production browser pass (not strictly blocking).

## 32. Needs professional legal review

Both legal pages in full, especially: warranty/liability wording and the cap, governing law and forum (Québec written, unconfirmed), consumer-law carve-outs, the Québec French-language requirement (Bill 96) for consumer contracts, Law 25 statements (person in charge of PI protection, cross-border assessment/PIA, breach process, retention schedule for `deleted_accounts` and waitlist), the children's provision (13 vs Québec's under-14 parental consent), the "founder has database access" disclosure, PIPEDA/other provinces and any EU/UK beta writers (no DPA referenced with Supabase/Vercel), the entity name and postal address for Terms and CASL sender identity.
