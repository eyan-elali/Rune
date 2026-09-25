# Backup, staging rehearsal, and rollback

This is how any change reaches the production database. It was written for
Phase 0 migrations **013** (migration ledger) and **014** (read-only baseline
assertions), and applies to every later migration.

> **This document does not authorize a production change.** Production has no
> managed backups or point-in-time recovery (Free plan). The manual backup in
> Part 1 is the only way back. Instructions for applying 013/014 to production
> will be given separately, only after the staging results in Part 3 are
> reviewed.

Part 1 (backup) and all catalog captures only **read** production.

---

## Part 0 — One-time setup

```bash
brew install libpq                                  # pg_dump / pg_restore / psql (18.x works with PG 17)
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
pg_dump --version && pg_restore --version && psql --version
```

Connection strings: Supabase dashboard → **Connect** → **Session pooler** URI
(port 5432). On the Free plan the direct connection is IPv6-only. Keep the
password out of shell history:

```bash
read -s PGPASSWORD && export PGPASSWORD    # paste; not echoed
```

Run every command from the repository root unless it says otherwise.

---

## Part 1 — Manual logical backup of production (read-only)

```bash
PROD_URL='postgresql://postgres.<prod-ref>@<pooler-host>:5432/postgres'
B=~/rune-backups/$(date +%F) && mkdir -p "$B"

# Every command in this part reads only. This makes the server enforce it.
export PGOPTIONS='-c default_transaction_read_only=on'

# 1. Catalog capture immediately BEFORE the dump
psql "$PROD_URL" -X -q -1 -v ON_ERROR_STOP=1 --csv -f tools/db-audit/catalog.sql > "$B/catalog-before-dump.csv"

# 2. Everything Rune owns: schema + data of `public` (custom format, compressed)
pg_dump "$PROD_URL" -Fc -n public -f "$B/rune-public.dump"

# 3. User accounts (profiles.id references auth.users). SENSITIVE: emails, password hashes.
pg_dump "$PROD_URL" -Fc --data-only -t auth.users -t auth.identities -f "$B/rune-auth-users.dump"

# 4. Readable copy of the public schema, for reference
pg_dump "$PROD_URL" --schema-only -n public -f "$B/rune-public-schema.sql"

# 5. Catalog capture immediately AFTER the dump
psql "$PROD_URL" -X -q -1 -v ON_ERROR_STOP=1 --csv -f tools/db-audit/catalog.sql > "$B/catalog-after-dump.csv"

unset PGOPTIONS
```

`pg_dump` takes one consistent snapshot. The two catalog captures bracket it.

- If step 3 fails with a permission error, send the exact message. The `public`
  dump alone still protects every manuscript.
- The `public` dump does **not** contain the signup trigger
  (`on_auth_user_created` lives on `auth.users`). Every restore must re-create
  it (Part 2, step 4, and Part 4). Its definition is in the Rune 1.x baseline,
  `src/lib/supabase/baseline/production-2026-09-24.sql`.

### Verify the backup (offline, no server needed)

```bash
cd "$B"

# a. Nothing changed while dumping: the two captures must have identical data counts
node <repo>/tools/db-audit/diff-catalog.mjs catalog-before-dump.csv catalog-after-dump.csv --expect none
#    → RESULT: MATCHES EXPECTATION. If counts changed, someone wrote during the
#      dump; that's fine, but compare the dump against catalog-after-dump.csv.

# b. The archives are readable and complete
pg_restore --list rune-public.dump | grep -c "TABLE DATA public"        # expect 19
pg_restore --list rune-auth-users.dump | grep "TABLE DATA"              # expect auth users + identities

# c. Row counts inside the dump match production
for t in projects chapters pages writing_sessions profiles future_letters project_notes; do
  printf "%-16s " $t
  pg_restore -f - --data-only -n public -t $t rune-public.dump \
    | awk '/^COPY /{c=1;next} /^\\\.$/{c=0} c' | wc -l
done
#    Compare with row_counts in catalog-after-dump.csv. On 2026-09-24 production
#    had projects 69, chapters 163, pages 280, writing_sessions 290, profiles 100,
#    future_letters 5, project_notes 24.
```

Save the output of a–c next to the files. The **strongest** check, an actual
restore, is Part 3's second pass.

### Store it

- Keep it outside the repository and never in git.
- Keep two copies: this Mac, plus an encrypted volume (Disk Utility → New Image
  → AES-256) or an encrypted external drive.
- `rune-auth-users.dump` is personal data. Delete superseded backups
  deliberately, not automatically.

---

## Part 2 — Staging project (disposable)

1. Supabase dashboard → **New project** (Free allows two active projects), same
   region as production. Name it e.g. `rune-staging-YYYYMMDD`. Save the password.
2. `STAGING_URL='postgresql://postgres.<staging-ref>@<pooler-host>:5432/postgres'`
3. Check you are **not** pointing at production:
   `psql "$STAGING_URL" -X -At -c "select count(*) from auth.users"` → `0`.
4. Staging never gets Stripe keys, the production service-role key, or real
   email sending. Delete it when the rehearsal is done.

---

## Part 3 — Rehearsal

### Pass 1 — schema proof (no user data)

```bash
S=~/rune-backups/staging-$(date +%F) && mkdir -p "$S"

# 1. Build the Rune 1.x production baseline (NOT schema.sql, which is the Rune 2.0 schema)
psql "$STAGING_URL" -X -1 -v ON_ERROR_STOP=1 -f src/lib/supabase/baseline/production-2026-09-24.sql

# 2. Capture and compare with the production snapshot: structure must be identical
psql "$STAGING_URL" -X -q -1 -v ON_ERROR_STOP=1 --csv -f tools/db-audit/catalog.sql > "$S/pass1-baseline.csv"
node tools/db-audit/diff-catalog.mjs src/lib/supabase/catalog/production-2026-09-24.json "$S/pass1-baseline.csv" --expect schema-only

# 3. Apply 013, then 014 (each as one transaction)
psql "$STAGING_URL" -X -1 -v ON_ERROR_STOP=1 -f src/lib/supabase/migrations/013_schema_migrations_ledger.sql
psql "$STAGING_URL" -X -1 -v ON_ERROR_STOP=1 -f src/lib/supabase/migrations/014_assert_production_baseline.sql

# 4. Capture and compare with the pre-migration capture
psql "$STAGING_URL" -X -q -1 -v ON_ERROR_STOP=1 --csv -f tools/db-audit/catalog.sql > "$S/pass1-after-013-014.csv"
node tools/db-audit/diff-catalog.mjs "$S/pass1-baseline.csv" "$S/pass1-after-013-014.csv" --expect 013-014

# 5. Both must refuse a second run
psql "$STAGING_URL" -X -1 -f src/lib/supabase/migrations/013_schema_migrations_ledger.sql   # → "already been applied"
psql "$STAGING_URL" -X -1 -f src/lib/supabase/migrations/014_assert_production_baseline.sql # → "already been applied"
```

The SQL editor works too: paste each file and click Run. psql is preferred
because `-1` and `ON_ERROR_STOP` make the all-or-nothing behavior explicit.

### Pass 2 — backup-restore proof + migration on real data

Reset staging first: Settings → General → **Pause/Delete project** and create
it again, or use a second fresh project. Then:

```bash
# 1. Accounts first (no signup trigger exists yet, so nothing fires)
pg_restore -d "$STAGING_URL" --data-only --no-owner "$B/rune-auth-users.dump"

# 2. Rune's schema + data
pg_restore -d "$STAGING_URL" --no-owner "$B/rune-public.dump"
#    Harmless if reported: 'schema "public" already exists'. Any other error: stop, send it verbatim.

# 3. The signup trigger (not in a public-schema dump)
psql "$STAGING_URL" -X -1 -v ON_ERROR_STOP=1 -c \
  "create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();"

# 4. The restored copy must equal production in structure AND data
psql "$STAGING_URL" -X -q -1 -v ON_ERROR_STOP=1 --csv -f tools/db-audit/catalog.sql > "$S/pass2-restored.csv"
node tools/db-audit/diff-catalog.mjs "$B/catalog-after-dump.csv" "$S/pass2-restored.csv" --expect none

# 5. Apply 013 + 014 on real data; exact same diff as Pass 1, and no data count changes
psql "$STAGING_URL" -X -1 -v ON_ERROR_STOP=1 -f src/lib/supabase/migrations/013_schema_migrations_ledger.sql
psql "$STAGING_URL" -X -1 -v ON_ERROR_STOP=1 -f src/lib/supabase/migrations/014_assert_production_baseline.sql
psql "$STAGING_URL" -X -q -1 -v ON_ERROR_STOP=1 --csv -f tools/db-audit/catalog.sql > "$S/pass2-after-013-014.csv"
node tools/db-audit/diff-catalog.mjs "$S/pass2-restored.csv" "$S/pass2-after-013-014.csv" --expect 013-014
```

Pass 2 contains real manuscripts and accounts. Delete the staging project as
soon as the results are recorded.

### Send back

The four `diff-catalog.mjs` outputs (they contain no user data), any
error text verbatim, and the Part 1 verification output (a–c).

---

## Expected catalog diffs (exact)

| Comparison | `--expect` | Structural differences | Data counts |
|---|---|---|---|
| Production snapshot → Pass 1 baseline | `schema-only` | **none** | ignored (staging is empty) |
| Pass 1 baseline → after 013+014 | `013-014` | exactly the 15 lines below | only `row_counts.schema_migrations` (new: 15) |
| Production (after dump) → Pass 2 restored | `none` | **none** | **none** |
| Pass 2 restored → after 013+014 | `013-014` | exactly the 15 lines below | only `row_counts.schema_migrations` (new: 15) |

The 013 + 014 structural diff:

```
+ columns schema_migrations.applied_at
+ columns schema_migrations.name
+ columns schema_migrations.note
+ columns schema_migrations.recorded_at
+ columns schema_migrations.version
+ constraints schema_migrations.schema_migrations_pkey
+ indexes schema_migrations.schema_migrations_pkey
+ relations schema_migrations
+ table_grants schema_migrations service_role DELETE
+ table_grants schema_migrations service_role INSERT
+ table_grants schema_migrations service_role REFERENCES
+ table_grants schema_migrations service_role SELECT
+ table_grants schema_migrations service_role TRIGGER
+ table_grants schema_migrations service_role TRUNCATE
+ table_grants schema_migrations service_role UPDATE
```

`schema_migrations` has RLS enabled and no policies, and `anon`/`authenticated`
have no grants on it. Nothing else — no existing table, column, index, policy,
trigger, function or grant — may appear.

These may legitimately differ and are shown only as "platform sections"
(informational): `extensions`, `roles`, `role_settings`, and Supabase's own
event triggers and `rls_auto_enable()` (which a new project may or may not
have). The comparison ignores them.

Any other difference: **stop** and send the output.

---

## Part 4 — Rollback and recovery

### Rolling back 013 / 014

Each file runs as one transaction. If it errors, nothing it contains is applied.
Once applied:

| Migration | What it changed | Rollback |
|---|---|---|
| 014 | inserted ledger row `014`; nothing else (checks only) | `delete from public.schema_migrations where version = '014';` |
| 013 | created `public.schema_migrations` and its 14 rows | `drop table public.schema_migrations;` |

Roll back in reverse order (014, then 013). Then re-capture the catalog and
confirm with `diff-catalog.mjs <pre-apply capture> <post-rollback capture> --expect none`.
Neither migration touches manuscript data, so no data recovery is ever needed
for them.

### Recovering data from the manual backup

This is only for real data loss or corruption, which 013/014 cannot cause. There is
no point-in-time recovery on the Free plan: you can only return to the moment of
the dump, and anything written after it is lost unless recovered separately. Stop
and decide deliberately; don't improvise under pressure.

- **Whole-database recovery** (preferred over overwriting production in place):
  1. Create a new Supabase project.
  2. Run Part 3 Pass 2 steps 1–4 against it (restore accounts, restore
     `public`, re-create the signup trigger, verify with `--expect none`).
  3. Re-apply any migrations numbered after the backup (check
     `schema_migrations` in the dump).
  4. Point the app at it: in Vercel, `NEXT_PUBLIC_SUPABASE_URL`,
     `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, plus the
     Auth URL configuration and the Stripe webhook's Supabase target.

  Page IDs are preserved by the dump, so writers' queued offline saves (keyed by
  Page ID in IndexedDB) still land on the right Pages. Users must sign in again.
- **Selective recovery** (for example one writer's deleted chapter): extract only
  the rows needed with
  `pg_restore -f - --data-only -n public -t pages rune-public.dump`, filter
  them, and insert them inside a transaction after checking that the target rows
  don't already exist. Work out the exact statements before running anything
  against production.

### Before Rune 2.0 Phase 1

Phase 1 rewrites manuscript structure. Consider enabling daily backups/PITR
(Pro plan) before it. At minimum, take a fresh Part 1 backup and verify it
immediately before each Phase 1 production migration.

---

## Part 5 — The Rune 2.0 database (migrations 015–017)

Migration 015 (`015_rune2_manuscript_foundation.sql`) is for the **new, empty
Rune 2.0 Supabase project only**. It drops and re-creates the manuscript
tables, so it refuses to run if `projects`, `chapters`, `pages` or
`writing_sessions` hold a single row. It must never be applied to production:
production's Rune 1.x → Rune 2.0 data migration is a separate, future task.

No backup is needed (there is no data), and rollback is rebuilding: create a
new project, or re-run the steps below on a fresh one.

```bash
R2='postgresql://postgres.<rune2-ref>@<pooler-host>:5432/postgres'
S=~/rune-backups/rune2-$(date +%F) && mkdir -p "$S"

# 0. Make sure this is the EMPTY Rune 2.0 project, not production → both 0
psql "$R2" -X -At -c "select count(*) from auth.users"
psql "$R2" -X -At -c "select count(*) from public.projects"

# 1. What the result must be: the catalog of baseline + 013–017, built locally
npm --prefix tools/sync-harness run schema -- --check --catalog "$S/rune2-expected.json"

# 2. Capture before
psql "$R2" -X -q -1 -v ON_ERROR_STOP=1 --csv -f tools/db-audit/catalog.sql > "$S/rune2-before.csv"

# 3. Apply 013 and 014 if the database does not have them yet (each refuses a
#    second run with "already been applied" — that is fine), then 015, 016 and 017
psql "$R2" -X -1 -v ON_ERROR_STOP=1 -f src/lib/supabase/migrations/013_schema_migrations_ledger.sql
psql "$R2" -X -1 -v ON_ERROR_STOP=1 -f src/lib/supabase/migrations/014_assert_production_baseline.sql
psql "$R2" -X -1 -v ON_ERROR_STOP=1 -f src/lib/supabase/migrations/015_rune2_manuscript_foundation.sql
psql "$R2" -X -1 -v ON_ERROR_STOP=1 -f src/lib/supabase/migrations/016_scene_structure_rpcs.sql
psql "$R2" -X -1 -v ON_ERROR_STOP=1 -f src/lib/supabase/migrations/017_atomic_scene_move.sql

# 4. Capture after: structure must be IDENTICAL to the local build
psql "$R2" -X -q -1 -v ON_ERROR_STOP=1 --csv -f tools/db-audit/catalog.sql > "$S/rune2-after.csv"
node tools/db-audit/diff-catalog.mjs "$S/rune2-expected.json" "$S/rune2-after.csv" --expect schema-only

# 5. 015, 016 and 017 must refuse a second run
psql "$R2" -X -1 -f src/lib/supabase/migrations/015_rune2_manuscript_foundation.sql   # → "already been applied"
psql "$R2" -X -1 -f src/lib/supabase/migrations/016_scene_structure_rpcs.sql          # → "already been applied"
psql "$R2" -X -1 -f src/lib/supabase/migrations/017_atomic_scene_move.sql             # → "already been applied"
```

`rune2-after.csv`'s `integrity` section should show `projects_without_manuscript: 0`
and the Rune 1.x page probes as `skipped: required column missing`. The exact
structural changes 015–017 make are pinned by `tools/sync-harness/tests/rune2-schema.test.mjs`.

A Rune 2.0 database that already has 015 only needs the later migrations:
016 (two new functions) and 017 (one new function). Neither touches a row, so
both are safe where test manuscripts already exist. Run steps 1, 2, the lines
of step 3 it has not received, 4 and 5. Rollback is in each migration's header.

A database created later can instead be built in one step from
`src/lib/supabase/schema.sql`, which already contains 013–017 and records them
in `schema_migrations`.

The application code on the `rune-2` branch targets this schema (Scenes,
Manuscripts, the Scene RPCs). It does not work against a Rune 1.x database.
