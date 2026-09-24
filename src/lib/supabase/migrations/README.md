# Database migrations

## How the schema is defined

| What | Where |
|---|---|
| **Baseline:** the `public` schema production ran on 2026-09-24 | `../schema.sql` (generated; do not edit by hand) |
| The production catalog it was generated from | `../catalog/production-2026-09-24.json` |
| Changes since the baseline | `013_…sql` onward, applied in order |
| History (already inside the baseline) | `001_…sql` to `012_…sql`. **Never re-run.** |

A new database is built from `schema.sql`, then every migration from `013`
onward in order. Migrations 001–012 must not be replayed. They assume tables
no migration creates, and several aren't idempotent. Re-running `007` silently
regresses signup (`handle_new_user` stops creating pricing entitlements).

Every database records what it has received in `public.schema_migrations`
(created by `013`).

## Rules for a new migration

1. Next number, one concern per file: `015_short_description.sql`.
2. Start with the guard, and end by recording the migration (template below). A
   migration that is already recorded must refuse to run.
3. Compatibility contracts stay intact unless an explicit, staged task
   changes them. That covers the `pages` table and Page IDs, the save-path
   RPC signatures, argument names, return shapes and status values (no new
   overloads, no new statuses), and the columns stale clients read.
4. Add a regression test in `tools/sync-harness/tests/` that applies the
   migration on top of `schema.sql` and asserts its effect, including the exact
   catalog diff (`diffCatalogs`), as `schema-equivalence.test.mjs` does for 013/014.
5. Rehearse it on staging, then apply it to production, following
   `tools/db-audit/STAGING.md`. That covers the manual backup, the backup
   check, the staging run, an exact expected diff, and rollback.
6. After production, re-capture the catalog, commit the new snapshot,
   regenerate `schema.sql` (`node tools/db-audit/generate-schema.mjs …`), and
   update the equivalence test's snapshot path.

## Template

```sql
-- ── Migration 0NN: <what and why> ───────────────────────────────────────────
-- <Rationale. What it changes. What it deliberately does not change.>
-- Rollback: <exact statements>
-- Apply as ONE script, following tools/db-audit/STAGING.md.

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Migration 0NN requires migration 013 (schema_migrations). Nothing was changed.';
  end if;
  if exists (select 1 from public.schema_migrations where version = '0NN') then
    raise exception 'Migration 0NN has already been applied. Nothing was changed.';
  end if;
end
$$;

-- … changes …

insert into public.schema_migrations (version, name, applied_at, note)
values ('0NN', '0NN_short_description.sql', now(), '<one line>');
```

The Supabase SQL editor runs a pasted multi-statement script as one
transaction, so any error rolls back everything. With psql, use `-1`.
