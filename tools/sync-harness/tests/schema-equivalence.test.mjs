// Phase 0 Commit D — schema truth.
//
// 1. src/lib/supabase/schema.sql, loaded into Postgres behind the Supabase
//    shim, re-captured with tools/db-audit/catalog.sql, is structurally
//    IDENTICAL to the committed production catalog snapshot (only documented
//    Supabase-managed objects are ignored — see catalog-lib.mjs).
// 2. Migrations 013 (ledger) and 014 (baseline assertions) apply on top of the
//    baseline with EXACTLY the expected catalog diff, refuse to run twice, and
//    014 aborts without changing anything on a database that isn't the baseline.
//
// This is the local half of the proof. The other half runs on a real Supabase
// project (PostgreSQL 17) — see tools/db-audit/STAGING.md.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, readRepoFile, readMigration } from '../lib/pg.mjs';
import {
  loadCatalog, catalogFromRows, diffCatalogs, diffCounts, describeDifference, EXPECTATIONS,
} from '../../db-audit/catalog-lib.mjs';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { REPO_DIR } from '../lib/pg.mjs';

const SNAPSHOT = path.join(REPO_DIR, 'src/lib/supabase/catalog/production-2026-09-24.json');
const CATALOG_SQL = readRepoFile('tools/db-audit/catalog.sql');
const SCHEMA_SQL = readRepoFile('src/lib/supabase/schema.sql');

async function capture(db) {
  const res = await db.exec(CATALOG_SQL);
  return catalogFromRows(res[res.length - 1].rows);
}

async function baselineDb() {
  const db = await createTestDb();
  await db.exec(SCHEMA_SQL);
  return db;
}

const fmt = (diffs) => diffs.map(describeDifference).join('\n');

let prod;
before(() => { prod = loadCatalog(SNAPSHOT); });

test('snapshot is a complete, read-only capture', () => {
  assert.equal(prod.meta.transaction_read_only, 'on');
  assert.equal(prod.meta.catalog_sql_version, 'phase0-b-1');
  for (const s of ['relations', 'columns', 'constraints', 'indexes', 'policies', 'triggers', 'functions', 'function_grants', 'table_grants']) {
    assert.ok(Array.isArray(prod[s]) && prod[s].length > 0, `snapshot section ${s} present`);
  }
});

test('schema.sql is exactly what generate-schema.mjs produces from the snapshot (no hand edits)', () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rune-schema-')), 'schema.sql');
  const res = spawnSync(process.execPath, ['tools/db-audit/generate-schema.mjs', path.relative(REPO_DIR, SNAPSHOT), out],
    { cwd: REPO_DIR, encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  assert.equal(fs.readFileSync(out, 'utf8'), SCHEMA_SQL, 'regenerate: node tools/db-audit/generate-schema.mjs <snapshot> src/lib/supabase/schema.sql');
});

test('schema.sql reproduces the production catalog exactly', async () => {
  const local = await capture(await baselineDb());
  const { differences, skippedSections } = diffCatalogs(prod, local);
  assert.equal(differences.length, 0, `schema.sql differs from production:\n${fmt(differences)}`);
  // event_triggers was added to catalog.sql after the snapshot was taken.
  assert.deepEqual(skippedSections, ['event_triggers']);
});

test('negative control: the comparison detects a single-object change', async () => {
  const db = await baselineDb();
  await db.exec(`alter table public.writing_sessions drop constraint writing_sessions_page_id_fkey;
                 alter table public.writing_sessions add constraint writing_sessions_page_id_fkey
                   foreign key (page_id) references public.pages(id) on delete set null;`);
  const { differences } = diffCatalogs(prod, await capture(db));
  assert.equal(differences.length, 1, fmt(differences));
  assert.equal(differences[0].key, 'writing_sessions.writing_sessions_page_id_fkey');
});

test('013 + 014 apply on the baseline with exactly the expected catalog diff', async () => {
  const db = await baselineDb();
  const before = await capture(db);
  await db.exec(readMigration('013_schema_migrations_ledger.sql'));
  await db.exec(readMigration('014_assert_production_baseline.sql'));
  const after = await capture(db);

  const { differences } = diffCatalogs(before, after);
  const got = differences.map(describeDifference).sort();
  // Same list diff-catalog.mjs --expect 013-014 enforces on staging/production.
  const expected = EXPECTATIONS['013-014'].structural;
  assert.deepEqual(got, expected, `unexpected catalog diff:\n${got.join('\n')}`);

  const rel = after.relations.find((r) => r.table === 'schema_migrations');
  assert.equal(rel.rls_enabled, true);
  assert.deepEqual(diffCounts(before, after).map((d) => `${d.section}.${d.key}`), EXPECTATIONS['013-014'].counts);
  assert.equal(after.row_counts.schema_migrations, 15, '000 baseline + 001–014');

  const versions = (await db.query(`select version from public.schema_migrations order by version`)).rows.map((r) => r.version);
  assert.deepEqual(versions, ['000', '001', '002', '003', '004', '005', '006', '007', '008', '009', '010', '011', '012', '013', '014']);
});

test('013 and 014 refuse to run twice and change nothing when refused', async () => {
  const db = await baselineDb();
  await db.exec(readMigration('013_schema_migrations_ledger.sql'));
  await db.exec(readMigration('014_assert_production_baseline.sql'));
  const before = await capture(db);
  await assert.rejects(db.exec(readMigration('013_schema_migrations_ledger.sql')), /Migration 013 has already been applied/);
  await assert.rejects(db.exec(readMigration('014_assert_production_baseline.sql')), /Migration 014 has already been applied/);
  const after = await capture(db);
  assert.equal(diffCatalogs(before, after).differences.length, 0);
  assert.deepEqual(diffCounts(before, after), []);
});

test('014 requires 013', async () => {
  const db = await baselineDb();
  await assert.rejects(db.exec(readMigration('014_assert_production_baseline.sql')), /requires migration 013/);
});

test('014 aborts with every mismatch on a database that is not the baseline, changing nothing', async () => {
  const db = await baselineDb();
  await db.exec(readMigration('013_schema_migrations_ledger.sql'));
  // Three independent departures from the baseline:
  await db.exec(`
    drop index public.writing_sessions_page_unique;
    create function public.save_page_checked(p_page_id uuid) returns jsonb language sql as $$ select '{}'::jsonb $$;
    drop policy "Users can manage pages in their chapters" on public.pages;
  `);
  const before = await capture(db);
  await assert.rejects(db.exec(readMigration('014_assert_production_baseline.sql')), (err) => {
    assert.match(err.message, /does not match the 2026-09-24 production baseline/);
    assert.match(err.message, /index writing_sessions\.writing_sessions_page_unique is missing/);
    assert.match(err.message, /function save_page_checked has 2 overloads/);
    assert.match(err.message, /policies on pages are/);
    return true;
  });
  const after = await capture(db);
  assert.equal(diffCatalogs(before, after).differences.length, 0, 'nothing changed');
  const versions = (await db.query(`select version from public.schema_migrations where version = '014'`)).rows;
  assert.deepEqual(versions, [], '014 not recorded');
});

test('014 detects the migration-007 regression of handle_new_user', async () => {
  const db = await baselineDb();
  await db.exec(readMigration('013_schema_migrations_ledger.sql'));
  await db.exec(readMigration('007_fix_signup_trigger.sql')); // the historical file must never be re-run
  await assert.rejects(db.exec(readMigration('014_assert_production_baseline.sql')), /does not create pricing entitlements/);
});
