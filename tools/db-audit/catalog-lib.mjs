// Loading, normalizing and diffing outputs of tools/db-audit/catalog.sql.
// No dependencies — used by diff-catalog.mjs (CLI) and by the regression
// harness's schema-equivalence test.
//
// A catalog is `{ [section]: payload }`, where payload is what catalog.sql
// returned for that section. It can be loaded from the SQL editor's CSV
// export, a JSON object keyed by section, or catalog.sql rows.
import fs from 'node:fs';

// ── loading ──────────────────────────────────────────────────────────────────

/** RFC 4180 CSV parser (quoted fields, doubled quotes, embedded newlines). */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let i = 0;
  let quoted = false;
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { quoted = true; i++; continue; }
    if (ch === ',') { row.push(field); field = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += ch; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Rows of { section, payload } (payload parsed or JSON text) → catalog object. */
export function catalogFromRows(rows) {
  const out = {};
  for (const r of rows) {
    out[r.section] = typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload;
  }
  return out;
}

/** Loads a catalog from a .csv export or a .json file. */
export function loadCatalog(file) {
  const text = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.json')) {
    const data = JSON.parse(text);
    return Array.isArray(data) ? catalogFromRows(data) : data;
  }
  const [header, ...rows] = parseCsv(text).filter((r) => r.length > 1);
  const idx = Object.fromEntries(header.map((h, n) => [h.trim(), n]));
  if (!('section' in idx) || !('payload' in idx)) throw new Error(`${file}: not a catalog.sql export (missing section/payload columns)`);
  return catalogFromRows(rows.map((r) => ({ section: r[idx.section], payload: r[idx.payload] })));
}

// ── normalization ────────────────────────────────────────────────────────────

/**
 * Objects that are not Rune's schema. They are provisioned by Supabase (or by
 * a Supabase project setting) and must not be expected in schema.sql, so the
 * comparison ignores them. Each entry is documented in
 * src/lib/supabase/catalog/README.md.
 */
export const SUPABASE_MANAGED = {
  // Supabase "automatic RLS" event-trigger function, created in `public` by
  // the platform. Present in production; absent from a PGlite test database.
  functions: new Set(['rls_auto_enable']),
};

// Sections compared structurally. Everything else (meta, schemas, extensions,
// roles, role_settings, row_counts, integrity) describes the platform or the
// data, not Rune's schema, and is reported separately by diff-catalog.mjs.
export const STRUCTURAL_SECTIONS = [
  'relations', 'columns', 'constraints', 'indexes', 'policies', 'triggers',
  'functions', 'overloads', 'function_grants', 'table_grants', 'views', 'sequences',
  'event_triggers',
];

// Normalizes an ACL string like "{=X/postgres,anon=X/postgres}" into a sorted
// list of "grantee:privs". PUBLIC is written as an empty grantee.
function normalizeAcl(acl) {
  if (acl === null || acl === undefined) return null;
  return acl.replace(/^\{|\}$/g, '').split(',').filter(Boolean)
    .map((e) => { const [who, rest] = e.split('='); return `${who || 'PUBLIC'}:${rest.split('/')[0]}`; })
    .sort();
}

const trimWs = (s) => (typeof s === 'string' ? s.replace(/[ \t]+$/gm, '').trim() : s);

const KEYERS = {
  relations: (r) => r.table,
  columns: (c) => `${c.table}.${c.column}`,
  constraints: (c) => `${c.table}.${c.name}`,
  indexes: (i) => `${i.table}.${i.name}`,
  policies: (p) => `${p.table}.${p.name}`,
  triggers: (t) => `${t.table}.${t.name}`,
  functions: (f) => `${f.name}(${f.identity_args})`,
  overloads: (o) => o.name,
  function_grants: (g) => `${g.function} ${g.grantee} ${g.privilege}`,
  table_grants: (g) => `${g.table} ${g.grantee} ${g.privilege}`,
  views: (v) => v.name,
  sequences: (s) => (typeof s === 'string' ? s : JSON.stringify(s)),
  event_triggers: (e) => e.name,
};

const CLEANERS = {
  // reltuples is a planner estimate; owner is compared.
  relations: (r) => { const out = { ...r }; delete out.reltuples_estimate; return out; },
  functions: (f) => ({
    ...f,
    acl: normalizeAcl(f.acl),
    config: f.config ? [...f.config].sort() : null,
    definition: trimWs(f.definition),
  }),
  policies: (p) => ({ ...p, roles: [...(p.roles ?? [])].sort(), using: trimWs(p.using), with_check: trimWs(p.with_check) }),
};

/** catalog → { section: Map(key → normalized item) } for structural sections. */
export function normalizeCatalog(catalog, { ignoreManaged = true } = {}) {
  const out = {};
  for (const section of STRUCTURAL_SECTIONS) {
    const items = catalog[section];
    const map = new Map();
    if (Array.isArray(items)) {
      for (const raw of items) {
        if (ignoreManaged && section === 'functions' && SUPABASE_MANAGED.functions.has(raw.name)) continue;
        if (ignoreManaged && section === 'function_grants' && SUPABASE_MANAGED.functions.has(String(raw.function).split('(')[0])) continue;
        if (ignoreManaged && section === 'event_triggers') {
          // Only event triggers calling a Rune function in `public` are Rune's.
          const [schema, fn] = String(raw.function).split('.');
          if (schema !== 'public' || SUPABASE_MANAGED.functions.has(fn)) continue;
        }
        const item = CLEANERS[section] ? CLEANERS[section](raw) : raw;
        map.set(KEYERS[section](raw), item);
      }
    }
    out[section] = { present: Array.isArray(items), map };
  }
  return out;
}

function stable(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
}

/**
 * Structural diff of two catalogs. Returns an array of
 * { section, key, kind: 'added'|'removed'|'changed', fields?, before?, after? }
 * describing how `after` differs from `before`. Sections missing from either
 * side (e.g. a section added to catalog.sql after a snapshot was taken) are
 * skipped and listed in `skippedSections`.
 */
export function diffCatalogs(before, after, opts = {}) {
  const a = normalizeCatalog(before, opts);
  const b = normalizeCatalog(after, opts);
  const differences = [];
  const skippedSections = [];
  for (const section of STRUCTURAL_SECTIONS) {
    if (!a[section].present || !b[section].present) {
      if (a[section].present || b[section].present) skippedSections.push(section);
      continue;
    }
    const keys = new Set([...a[section].map.keys(), ...b[section].map.keys()]);
    for (const key of [...keys].sort()) {
      const x = a[section].map.get(key);
      const y = b[section].map.get(key);
      if (x && !y) differences.push({ section, key, kind: 'removed', before: x });
      else if (!x && y) differences.push({ section, key, kind: 'added', after: y });
      else if (stable(x) !== stable(y)) {
        const fields = [...new Set([...Object.keys(x), ...Object.keys(y)])].filter((f) => stable(x[f]) !== stable(y[f]));
        differences.push({ section, key, kind: 'changed', fields, before: Object.fromEntries(fields.map((f) => [f, x[f]])), after: Object.fromEntries(fields.map((f) => [f, y[f]])) });
      }
    }
  }
  return { differences, skippedSections };
}

/** Diff of the data-shaped sections (row_counts, integrity): key → [before, after]. */
export function diffCounts(before, after) {
  const out = [];
  for (const section of ['row_counts', 'integrity']) {
    const x = before[section] ?? {};
    const y = after[section] ?? {};
    for (const key of [...new Set([...Object.keys(x), ...Object.keys(y)])].sort()) {
      if (stable(x[key]) !== stable(y[key])) out.push({ section, key, before: x[key] ?? null, after: y[key] ?? null });
    }
  }
  return out;
}

/** Human-readable one-line summary of a structural difference. */
export function describeDifference(d) {
  if (d.kind === 'changed') return `~ ${d.section} ${d.key}: ${d.fields.map((f) => `${f} ${JSON.stringify(d.before[f])} → ${JSON.stringify(d.after[f])}`).join('; ')}`;
  return `${d.kind === 'added' ? '+' : '-'} ${d.section} ${d.key}`;
}

// ── named expectations (shared by diff-catalog.mjs and the harness tests) ────

/** The exact structural diff migrations 013 + 014 produce on the baseline. */
export const LEDGER_TABLE_DIFF = [
  '+ columns schema_migrations.applied_at',
  '+ columns schema_migrations.name',
  '+ columns schema_migrations.note',
  '+ columns schema_migrations.recorded_at',
  '+ columns schema_migrations.version',
  '+ constraints schema_migrations.schema_migrations_pkey',
  '+ indexes schema_migrations.schema_migrations_pkey',
  '+ relations schema_migrations',
  ...['DELETE', 'INSERT', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE']
    .map((p) => `+ table_grants schema_migrations service_role ${p}`),
].sort();

/**
 * structural: the exact list of describeDifference() lines expected.
 * counts: 'ignore' | array of allowed "section.key" data changes.
 */
export const EXPECTATIONS = {
  // Same structure AND same data (production vs itself, or vs a full restore).
  none: { structural: [], counts: [] },
  // Same structure; data ignored (a fresh staging project built from schema.sql).
  'schema-only': { structural: [], counts: 'ignore' },
  // Before → after applying migrations 013 + 014.
  '013-014': { structural: LEDGER_TABLE_DIFF, counts: ['row_counts.schema_migrations'] },
};
