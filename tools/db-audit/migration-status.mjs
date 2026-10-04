#!/usr/bin/env node
// Read-only report of the LIVE Rune 2.0 migration ledger (public.schema_migrations).
//
//   npm run db:migrations            (from the repository root)
//   node tools/db-audit/migration-status.mjs [--env <path>] [--json]
//
// This is the only source of truth for "which migrations does the Rune 2.0
// database have". Git history, migration files, STAGING.md, memory notes and
// earlier task reports describe the repository, not the database.
//
// Safety:
//   - Only GET requests. PostgREST runs every GET in a READ ONLY transaction, so
//     the server itself refuses any write.
//   - Refuses (exit 2) unless the database is recognisably Rune 2.0: `pages`
//     must NOT exist and `manuscripts` + `scenes` must exist. Production (Rune
//     1.x) has `pages` and no `manuscripts`, so it is never queried for the
//     ledger. If RUNE2_SUPABASE_PROJECT_REF is set, the URL must also match it.
//   - Never prints the service-role key or the full URL; only the project ref,
//     which is already public in the browser bundle.
//
// Exit codes: 0 = ledger read, 2 = refused / not verified (reason printed).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATIONS_DIR = path.join(ROOT, 'src/lib/supabase/migrations');
const NOT_VERIFIED = 'Live migration state was not verified.';

function fail(reason) {
  console.error(`REFUSED: ${reason}`);
  console.error(NOT_VERIFIED);
  process.exit(2);
}

function parseArgs(argv) {
  const out = { envFile: path.join(ROOT, '.env.local'), json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--env') out.envFile = path.resolve(argv[++i] ?? '');
    else if (argv[i] === '--json') out.json = true;
    else fail(`unknown argument ${argv[i]}`);
  }
  return out;
}

function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
}

async function get(base, key, resource) {
  let res;
  try {
    res = await fetch(`${base}/rest/v1/${resource}`, {
      method: 'GET',
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });
  } catch (err) {
    fail(`could not reach the database API (${err.cause?.code ?? err.message})`);
  }
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* non-JSON error page */ }
  return { status: res.status, body };
}

// 200 → exists, 404 PGRST205/42P01 → absent, anything else → ambiguous.
async function tableExists(base, key, table) {
  const { status, body } = await get(base, key, `${table}?select=*&limit=0`);
  if (status === 200) return true;
  if (status === 404 && ['PGRST205', '42P01'].includes(body?.code)) return false;
  fail(`probe of "${table}" returned HTTP ${status}${body?.code ? ` (${body.code})` : ''}; cannot identify the database`);
}

function repoMigrations() {
  return fs.readdirSync(MIGRATIONS_DIR)
    .map((f) => f.match(/^(\d{3})_(.+)\.sql$/))
    .filter(Boolean)
    .map((m) => ({ version: m[1], file: m[0] }))
    .filter((m) => m.version >= '013')
    .sort((a, b) => a.version.localeCompare(b.version));
}

const args = parseArgs(process.argv.slice(2));
const env = { ...readEnvFile(args.envFile), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  fail(`NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (looked in ${path.relative(ROOT, args.envFile) || args.envFile} and the environment)`);
}

let ref;
try {
  const host = new URL(url).hostname;
  if (!host.endsWith('.supabase.co')) fail('NEXT_PUBLIC_SUPABASE_URL is not a *.supabase.co project URL');
  ref = host.split('.')[0];
} catch {
  fail('NEXT_PUBLIC_SUPABASE_URL is not a valid URL');
}
const base = url.replace(/\/+$/, '');

const pinned = env.RUNE2_SUPABASE_PROJECT_REF;
if (pinned && pinned !== ref) {
  fail(`project ref ${ref} does not match RUNE2_SUPABASE_PROJECT_REF (${pinned})`);
}

// Identify the database BEFORE reading the ledger.
if (await tableExists(base, key, 'pages')) {
  fail(`project ${ref} has a "pages" table: this is a Rune 1.x database (production?), not Rune 2.0`);
}
if (!(await tableExists(base, key, 'manuscripts')) || !(await tableExists(base, key, 'scenes'))) {
  fail(`project ${ref} lacks "manuscripts"/"scenes": not a Rune 2.0 database`);
}
if (!(await tableExists(base, key, 'schema_migrations'))) {
  fail(`project ${ref} has no public.schema_migrations (migration 013 not applied, or not exposed to the API)`);
}

const { status, body } = await get(base, key, 'schema_migrations?select=version,name,applied_at&order=version.asc');
if (status !== 200 || !Array.isArray(body)) fail(`reading schema_migrations returned HTTP ${status}`);

const applied = new Set(body.map((r) => r.version));
const repo = repoMigrations();
const pendingInRepo = repo.filter((m) => !applied.has(m.version));
const unknownToRepo = body.filter((r) => r.version >= '013' && !repo.some((m) => m.version === r.version));
const latest = body.length ? body[body.length - 1].version : null;

if (args.json) {
  console.log(JSON.stringify({ project_ref: ref, database: 'rune2', latest, ledger: body,
    repo_migrations_not_in_ledger: pendingInRepo.map((m) => m.file),
    ledger_versions_not_in_repo: unknownToRepo.map((r) => r.version) }, null, 2));
  process.exit(0);
}

console.log(`Rune 2.0 database: project ${ref} (no "pages"; has "manuscripts", "scenes")`);
console.log('Live ledger, public.schema_migrations (read via GET, read-only):\n');
console.log('version  applied_at                        name');
for (const r of body) {
  console.log(`${r.version.padEnd(8)} ${String(r.applied_at ?? '(before ledger)').padEnd(33)} ${r.name}`);
}
console.log(`\nLatest applied: ${latest ?? '(none)'}`);
console.log(pendingInRepo.length
  ? `Repo migrations NOT in the live ledger: ${pendingInRepo.map((m) => m.file).join(', ')}`
  : 'Every repo migration from 013 onward is in the live ledger.');
if (unknownToRepo.length) {
  console.log(`Ledger versions with no file in this checkout: ${unknownToRepo.map((r) => r.version).join(', ')}`);
}
