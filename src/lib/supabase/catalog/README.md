# Production catalog snapshots

`production-2026-09-24.json` is the output of `tools/db-audit/catalog.sql`
(version `phase0-b-1`), run read-only against production on 2026-09-24
(PostgreSQL 17.6, `transaction_read_only = on`). It contains schema structure,
row counts and anonymous integrity counts only: no user content, emails, titles
or ids.

It is the source of truth for:

- `../baseline/production-2026-09-24.sql` (the Rune 1.x baseline, formerly
  `schema.sql`), generated from it by `tools/db-audit/generate-schema.mjs`;
- `tools/sync-harness/tests/schema-equivalence.test.mjs`, which proves
  the baseline reproduces it exactly;
- `tools/sync-harness/tests/production-baseline.test.mjs`, which pins the
  manuscript facts below.

## Production vs. what the repository described before Phase 0

Derived mechanically. The old `schema.sql` plus migrations 001–012 (applied in
order) were loaded into Postgres, captured with `catalog.sql`, and diffed
against this snapshot. Column-order-only differences are omitted.

**In production, but in no tracked file**

| Object | Production |
|---|---|
| `projects.is_pinned` | `boolean not null default false` |
| `projects.chapter_goal` | `integer` (nullable, no default) |
| `game_sessions.meta` | `jsonb default '{}'::jsonb` |
| `writing_sessions.page_id` | `uuid` with FK → `pages(id)` **ON DELETE CASCADE** |
| `writing_sessions` uniqueness | 5 partial unique indexes: `unique_user_page_date_idx`, `writing_sessions_page_unique` (both `(user_id, session_date/page_id)` where `page_id is not null`), `unique_user_project_date_null_page_idx`, `writing_sessions_project_unique`, `writing_sessions_null_project_unique` |
| `profiles.subscription_status` | default `'inactive'`; CHECK in (`active`,`inactive`,`past_due`,`canceled`) |
| `profiles.subscription_tier` | **nullable**, default `'free'`; CHECK in (`free`,`scribe`,`arcane`) |
| `profiles_stripe_customer_id_idx` | index on `profiles(stripe_customer_id)` |
| `subscription_events` | columns `stripe_event_id text not null`, `tier`, `status`; `created_at` nullable; `user_id` FK → **`auth.users`**; extra policy "Users can view own events" |
| `user_unlockables` | `id uuid` primary key + `unique (user_id, unlockable_id)`; select policy named "Users can view their own unlockables" |
| Legacy `FOR ALL` policies | "Users can manage their own projects", "… chapters of their projects", "… pages in their chapters", alongside the per-command policies |
| `increment_page_version()` | same logic as migration 006, plus a comment |
| `rls_auto_enable()` | Supabase-managed event-trigger function (automatic RLS). Ignored by the comparison. |

**In tracked files, but not in production**

| Object | Tracked in |
|---|---|
| `writing_sessions` unique `(user_id, project_id, session_date)` | migration 002 |
| `subscription_events.payload` | migration 004 (and the Stripe webhook inserts it) |
| `user_unlockables` composite primary key `(user_id, unlockable_id)` and policy "user_unlockables: select own" | old `schema.sql` |
| `increment_writing_session(…)` RPC | called by `recordWordsWritten` (`src/lib/actions/writingStats.ts`) for Arena credits; no tracked file ever created it and production doesn't have it, so the call always errors and falls back to a direct upsert |

**Matches:** every function body except the comment above, including
`handle_new_user` (the 009 version) and the migration-011 RPCs; all 7 triggers
(including `trg_page_updated`); all function and table grants; RLS enabled on
all 19 tables.

## Security-relevant facts (recorded as-is; changes need explicit approval)

- `anon` holds EXECUTE on all six migration-011 RPCs. Supabase's default
  privileges grant it directly, and 011's `revoke … from public` doesn't remove
  it. Each function rejects callers without `auth.uid()`
  ("Not authenticated"), so this isn't exploitable today.
- `increment_game_ticket(p_user_id, p_week_start)` is SECURITY DEFINER with no
  pinned `search_path`, trusts `p_user_id`, and is executable by PUBLIC. Anyone
  holding the public anon key can create or increment `game_tickets` rows for
  any existing user. The app doesn't call it.
- Every table grants all privileges, including TRUNCATE, to `anon` and
  `authenticated` (Supabase default). RLS governs rows. TRUNCATE is not
  reachable through PostgREST.

## Manuscript facts (pinned by `production-baseline.test.mjs`)

69 projects, 163 chapters, 280 pages, 290 writing-session rows.
2 projects without chapters; 1 chapter without pages; 32 chapters with a
canonical page (0 with more than one); **86 non-canonical pages holding 41,998
words inside canonical chapters**. Under the approved Rune 2.0 mapping these
become Unplaced Scenes. 21 of 69 projects have a stored `word_count` that
differs from the canonical-aware total. 0 page or chapter position ties.
Largest project 119 pages; largest chapter 10 pages; most chapters in a
project 32. 268 writing-session rows are keyed by page, 0 point at a missing page.

## Updating

After any production migration: re-run `tools/db-audit/catalog.sql`, check
it with `tools/db-audit/diff-catalog.mjs`, save the new snapshot here under a
new date, regenerate the baseline, and update both tests' snapshot path and
pinned facts deliberately.
