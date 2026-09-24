# Production catalog capture (read-only)

| File | Purpose |
|---|---|
| `catalog.sql` | Read-only structural capture (this document) |
| `diff-catalog.mjs` | Compares two captures; `--expect none \| schema-only \| 013-014` checks an exact expected diff |
| `generate-schema.mjs` | Regenerates the Rune 1.x baseline `src/lib/supabase/baseline/production-<date>.sql` from a committed snapshot |
| `schema-generator.mjs` | The generator itself (pure). Also used by `tools/sync-harness/build-schema.mjs` to produce the Rune 2.0 `src/lib/supabase/schema.sql` |
| `catalog-lib.mjs` | Shared loader/normalizer/diff (no dependencies) |
| `STAGING.md` | Manual backup, backup verification, staging rehearsal, expected diffs, rollback |

The first production capture (2026-09-24) is committed at
`src/lib/supabase/catalog/production-2026-09-24.json`, with its findings in
that folder's README.

Rune 2.0 Phase 0 needs one trustworthy picture of what the **production** database
actually contains, so the repository's migrations and `schema.sql` can be reconciled
with it before any Rune 2.0 migration is written. `catalog.sql` produces that picture.

It captures **structure only**: tables, columns, types, defaults, nullability,
constraints (with foreign-key delete behavior), indexes, RLS flags, policies,
non-internal triggers (on `public` tables and `auth.users`), public functions (identity
arguments, SECURITY DEFINER, `search_path`/config, ACLs, overloads), table grants for
`anon` / `authenticated` / `service_role`, views, sequences, extensions, realtime
publications, roles, whitelisted role settings, event triggers (since catalog
version `phase0-d-1`), cron-job and webhook presence, exact
row counts per table, and a small set of anonymous integrity counts (for example, how
many chapters have a canonical page, and how many position ties exist). Since
catalog version `phase1-t2-1`, every integrity probe declares the columns it
needs, so it also captures a Rune 2.0 database (no `pages`): Rune 1.x probes
report `skipped: required column missing` there, and Rune 2.0 probes
(`projects_without_manuscript`, `scenes_placement`, `scene_position_tie_groups`)
report skipped on Rune 1.x.

## Safety guarantees

- **Read-only.** The first statement, `set transaction read only;`, makes the rest of
  the script a read-only transaction; a write attempted in it fails with
  `cannot execute … in a read-only transaction`. The output's `meta` row reports
  `transaction_read_only`, so the protection can be confirmed.
- **One SELECT.** Everything after that line is a single `SELECT`. It creates, alters
  and writes nothing (no temp tables, no functions, no settings).
- **No user content.** It never returns manuscript text, page/project/chapter titles,
  notes, letters, emails, names, analytics metadata, or user ids. Row data appears only
  as counts.
- **Secrets redacted.** Function bodies that look like HTTP/webhook/credential code,
  trigger arguments (database webhooks keep URLs and headers there), cron commands, and
  role settings are withheld or reduced to fingerprints. Only whitelisted settings
  (PostgREST `max_rows`/schemas, timeouts, `search_path`) are shown.
- Tested before commit against a local PostgreSQL 16 (PGlite) built from the repository's
  `schema.sql` and migrations, plus simulated production-only drift. The read-only guard
  blocked a write, the redaction cases (a secret-bearing function and a webhook-style
  trigger) produced no leaks, and every probe returned correct counts on seeded data.

## Procedure

### Before you start (dashboard, no SQL)

Note these down. They are part of what to send back.

1. **Settings → Infrastructure:** the Postgres version.
2. **Database → Backups:** whether daily backups are on, the time of the latest one, and
   whether Point-in-Time Recovery is enabled on this plan.
3. **Settings → API (Data API):** the **Max rows** value and the exposed schemas.
4. **Authentication → Hooks:** any enabled auth hooks (names only).
5. **Database → Webhooks** and **Integrations → Cron** (if present): the names of any
   webhooks or cron jobs. No URLs or commands.

### Method A — Supabase SQL editor (recommended)

1. Open the Supabase dashboard and check the project selector shows the **production**
   project.
2. **SQL Editor → New query.**
3. Paste the **entire** contents of `tools/db-audit/catalog.sql`, unchanged. The first
   statement must be `set transaction read only;`. Do not add, remove or reorder
   statements.
4. Click **Run**. It should return about 20 rows with the columns
   `ord, section, item_count, payload`.
5. **Check the `meta` row (ord 0):** `payload.transaction_read_only` must be `"on"`.
   - If it says `"off"`, stop and tell me. Nothing was changed (the script only reads),
     but we'll use Method B for the stronger guarantee.
6. If Postgres raises an error, send me the exact message. Do not edit the SQL to work
   around it.
7. Export the result with **Export → Download CSV** (or **Copy as JSON**) from the
   results panel. Save it as `production-catalog-YYYY-MM-DD.csv` (or `.json`).
8. Check nothing was truncated: for the `columns`, `constraints`, `policies`, `triggers`
   and `functions` rows, the number of entries in `payload` should equal `item_count`.
   If the editor's export cuts large cells, use Method B.

### Method B — psql (strongest guarantee; use if Method A fails or truncates)

Use the **direct** connection or the **session** pooler (port 5432) from
Settings → Database. The transaction pooler (port 6543) ignores `PGOPTIONS`.

```bash
PGOPTIONS='-c default_transaction_read_only=on' \
psql "postgresql://postgres:<password>@<host>:5432/postgres" \
  -X -q -1 -v ON_ERROR_STOP=1 --csv \
  -f tools/db-audit/catalog.sql \
  > production-catalog-$(date +%F).csv
```

- `default_transaction_read_only=on` makes the whole session read-only at the server.
- `-1` runs the file as a single transaction, so `set transaction read only;` also takes
  effect.
- `-X` ignores your local `~/.psqlrc`.

Don't put the password in shell history on a shared machine. Use `PGPASSWORD` from a
prompt, or a `~/.pgpass` entry.

## Before you send the output: privacy check

1. Search the file for `@`. There should be no email addresses.
2. Search it for your own pen name and a few of your project titles. Neither should
   appear.
3. Look at any function or trigger with `"definition_redacted": true`. Those are withheld
   on purpose. List their names for me; don't paste their bodies.
4. If anything looks private or secret anyway, delete that value from the file and tell
   me what you removed.

## What to send back

1. The exported file (CSV or JSON), complete and unmodified apart from any redaction in
   the privacy check.
2. The method used (A or B) and the `transaction_read_only` value from the `meta` row.
3. The dashboard facts from "Before you start" (Postgres version, backups/PITR, Max rows
   and exposed schemas, auth hooks, webhook and cron names).
4. The names of any redacted functions or triggers, and anything you removed.
5. Any error message, verbatim.

Don't commit the output yourself. After review, a new capture is committed as
`src/lib/supabase/catalog/production-<date>.json` and `schema.sql` is
regenerated from it (see `src/lib/supabase/migrations/README.md`).

## What this does not do

It does not change production, reconcile anything, or create migrations. It reads
the catalog once. Re-run it before and after every production migration and
compare the two with `diff-catalog.mjs --expect …` (see `STAGING.md`).
