#!/usr/bin/env node
// Compares two catalog.sql captures (SQL-editor CSV export or JSON snapshot).
//
//   node tools/db-audit/diff-catalog.mjs <before> <after> [--expect <name>]
//
// Prints structural differences (tables, columns, constraints, indexes,
// policies, triggers, functions, grants), then data-count differences
// (row_counts, integrity), then platform differences (extensions, roles,
// role settings), which are informational only.
//
// --expect selects a named expectation. The exit code is 0 only if the
// structural differences are EXACTLY the expected ones and no data counts
// changed except those the expectation allows:
//
//   none            identical structure AND data (e.g. a full backup restore vs production)
//   schema-only     identical structure; data ignored (fresh staging built from schema.sql)
//   013-014         the ledger table added by migrations 013 + 014, nothing else;
//                   only row_counts.schema_migrations may change
//
// Without --expect it just reports (exit 0 if identical, 1 otherwise).
// No dependencies; needs Node 18+.
import { loadCatalog, diffCatalogs, diffCounts, describeDifference, EXPECTATIONS } from './catalog-lib.mjs';

const args = process.argv.slice(2);
const expectIdx = args.indexOf('--expect');
const expectName = expectIdx >= 0 ? args[expectIdx + 1] : null;
const [beforeFile, afterFile] = args.filter((_, i) => i !== expectIdx && i !== expectIdx + 1);
if (!beforeFile || !afterFile) {
  console.error('usage: diff-catalog.mjs <before.csv|json> <after.csv|json> [--expect none|schema-only|013-014]');
  process.exit(2);
}

const before = loadCatalog(beforeFile);
const after = loadCatalog(afterFile);

console.log(`before: ${beforeFile}  (${before.meta?.captured_at ?? '?'}, PG ${before.meta?.server_version ?? '?'}, catalog ${before.meta?.catalog_sql_version ?? '?'}, read_only=${before.meta?.transaction_read_only ?? '?'})`);
console.log(`after:  ${afterFile}  (${after.meta?.captured_at ?? '?'}, PG ${after.meta?.server_version ?? '?'}, catalog ${after.meta?.catalog_sql_version ?? '?'}, read_only=${after.meta?.transaction_read_only ?? '?'})`);

const { differences, skippedSections } = diffCatalogs(before, after);
const structural = differences.map(describeDifference).sort();
console.log(`\n── structural differences (${structural.length}) ──`);
for (const l of structural) console.log(l);
if (skippedSections.length) console.log(`(sections present in only one capture, not compared: ${skippedSections.join(', ')})`);

const counts = diffCounts(before, after);
console.log(`\n── data counts that changed (${counts.length}) ──`);
for (const c of counts) console.log(`  ${c.section}.${c.key}: ${JSON.stringify(c.before)} → ${JSON.stringify(c.after)}`);

const platform = [];
for (const s of ['extensions', 'roles', 'role_settings']) {
  const x = JSON.stringify(before[s] ?? null);
  const y = JSON.stringify(after[s] ?? null);
  if (x !== y) platform.push(s);
}
console.log(`\n── platform sections that differ (informational) ──\n  ${platform.length ? platform.join(', ') : 'none'}`);

let ok;
if (expectName) {
  const exp = EXPECTATIONS[expectName];
  if (!exp) { console.error(`unknown --expect ${expectName}`); process.exit(2); }
  const missing = exp.structural.filter((l) => !structural.includes(l));
  const extra = structural.filter((l) => !exp.structural.includes(l));
  const badCounts = exp.counts === 'ignore' ? [] : counts.filter((c) => !exp.counts.includes(`${c.section}.${c.key}`));
  ok = missing.length === 0 && extra.length === 0 && badCounts.length === 0;
  console.log(`\n── expectation "${expectName}" ──`);
  for (const l of missing) console.log(`  MISSING  ${l}`);
  for (const l of extra) console.log(`  UNEXPECTED  ${l}`);
  for (const c of badCounts) console.log(`  UNEXPECTED DATA CHANGE  ${c.section}.${c.key}`);
  console.log(ok ? '  RESULT: MATCHES EXPECTATION' : '  RESULT: DOES NOT MATCH — stop and investigate');
} else {
  ok = structural.length === 0 && counts.length === 0;
  console.log(ok ? '\nRESULT: IDENTICAL' : '\nRESULT: DIFFERENT');
}
process.exit(ok ? 0 : 1);
