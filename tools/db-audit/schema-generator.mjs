// Turns a catalog (output of catalog.sql, loaded with catalog-lib.mjs) into a
// fresh-install schema file. Pure: no file or database access. Used by
//
//   - generate-schema.mjs — the Rune 1.x production baseline
//     (src/lib/supabase/baseline/production-<date>.sql), from a committed
//     production catalog snapshot;
//   - tools/sync-harness/build-schema.mjs — the canonical Rune 2.0 schema
//     (src/lib/supabase/schema.sql), from a catalog captured after applying
//     the migrations to that baseline in PGlite.
//
// Definitions (constraints, indexes, policies, triggers, functions) are
// emitted verbatim from the catalog. Grants are emitted only where the
// catalog differs from what Supabase's default privileges produce for
// objects created by `postgres` in `public`: EXECUTE for PUBLIC plus
// postgres/anon/authenticated/service_role on functions, and all table
// privileges for anon/authenticated/service_role on tables.
import { SUPABASE_MANAGED } from './catalog-lib.mjs';

const q = (name) => (/^[a-z_][a-z0-9_]*$/.test(name) ? name : `"${name.replaceAll('"', '""')}"`);

/**
 * @param cat      catalog object
 * @param header   comment lines (without the leading `-- `) for the banner
 * @param notes    { [tableName | 'fn:<name>' | 'policies:legacy' | 'index:<name>']: string[] }
 *                 short explanations emitted above the matching object
 * @param ledger   optional [{ version, name, note }] rows to insert into
 *                 public.schema_migrations at the end (applied_at null)
 * @returns { sql, stats }
 */
export function generateSchemaSql(cat, { header, notes = {}, ledger = null }) {
  const lines = [];
  const emit = (...l) => lines.push(...l);
  const rule = (title) => emit('', `-- ── ${title} ${'─'.repeat(Math.max(3, 72 - title.length))}`);
  const note = (key) => (notes[key] ?? []).forEach((l) => emit(`-- ${l}`));

  // ── header ──
  const bar = '-- ═══════════════════════════════════════════════════════════════════════════';
  emit(bar, `--  ${header[0]}`, bar);
  for (const l of header.slice(1)) emit(l === '' ? '--' : `--  ${l}`);
  emit(bar);

  // ── tables ──
  const tables = cat.relations.filter((r) => r.kind === 'table').map((r) => r.table).sort();
  const colsBy = new Map(tables.map((t) => [t, []]));
  for (const c of cat.columns) if (colsBy.has(c.table)) colsBy.get(c.table).push(c);

  rule('Tables');
  for (const t of tables) {
    emit('');
    note(t);
    const cols = colsBy.get(t).sort((a, b) => a.ord - b.ord);
    const width = Math.max(...cols.map((c) => c.column.length));
    emit(`create table public.${q(t)} (`);
    cols.forEach((c, i) => {
      if (c.identity || c.generated) throw new Error(`generator: identity/generated column ${t}.${c.column} not supported`);
      const parts = [q(c.column).padEnd(width), c.type];
      if (c.default !== null && c.default !== undefined) parts.push(`default ${c.default}`);
      if (c.not_null) parts.push('not null');
      emit(`  ${parts.join(' ')}${i < cols.length - 1 ? ',' : ''}`);
    });
    emit(');');
  }

  // ── constraints: primary/unique/check first, then foreign keys ──
  rule('Constraints');
  const order = { primary_key: 0, unique: 1, check: 2, exclusion: 3, foreign_key: 4 };
  const cons = [...cat.constraints].sort((a, b) => order[a.type] - order[b.type] || a.table.localeCompare(b.table) || a.name.localeCompare(b.name));
  for (const c of cons) {
    if (c.validated === false) throw new Error(`generator: NOT VALID constraint ${c.name} not supported`);
    emit(`alter table public.${q(c.table)} add constraint ${q(c.name)} ${c.definition};`);
  }

  // ── indexes not backing a constraint ──
  rule('Indexes');
  const consNames = new Set(cat.constraints.map((c) => c.name));
  for (const i of [...cat.indexes].sort((a, b) => a.table.localeCompare(b.table) || a.name.localeCompare(b.name))) {
    if (consNames.has(i.name)) continue;
    note(`index:${i.name}`);
    emit(`${i.definition};`);
  }

  // ── functions ──
  rule('Functions');
  const fns = cat.functions
    .filter((f) => !SUPABASE_MANAGED.functions.has(f.name))
    .sort((a, b) => a.name.localeCompare(b.name) || a.identity_args.localeCompare(b.identity_args));
  for (const f of fns) {
    if (f.definition_redacted || !f.definition) throw new Error(`generator: definition of ${f.name} is redacted — obtain it separately`);
    emit('');
    note(`fn:${f.name}`);
    emit(`${f.definition.trim()};`);
  }

  // ── function EXECUTE privileges that differ from Supabase defaults ──
  const DEFAULT_FN_GRANTEES = ['PUBLIC', 'anon', 'authenticated', 'postgres', 'service_role'];
  const fnAclLines = [];
  for (const f of fns) {
    const have = new Set((f.acl ?? '').replace(/^\{|\}$/g, '').split(',').filter(Boolean)
      .filter((e) => e.split('=')[1]?.split('/')[0].includes('X'))
      .map((e) => e.split('=')[0] || 'PUBLIC'));
    if (f.acl_is_default) continue; // null ACL == Postgres default (PUBLIC execute)
    const sig = `public.${q(f.name)}(${f.identity_args})`;
    for (const g of DEFAULT_FN_GRANTEES) if (!have.has(g)) fnAclLines.push(`revoke execute on function ${sig} from ${g === 'PUBLIC' ? 'public' : g};`);
    for (const g of have) if (!DEFAULT_FN_GRANTEES.includes(g)) fnAclLines.push(`grant execute on function ${sig} to ${g};`);
  }
  if (fnAclLines.length) {
    rule('Function privileges (differences from Supabase defaults)');
    emit(...fnAclLines);
  }

  // ── table privileges that differ from Supabase defaults ──
  const TABLE_PRIVS = ['DELETE', 'INSERT', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'];
  const API_ROLES = ['anon', 'authenticated', 'service_role'];
  const tableAclLines = [];
  for (const t of tables) {
    for (const role of API_ROLES) {
      const have = new Set(cat.table_grants.filter((g) => g.table === t && g.grantee === role).map((g) => g.privilege));
      const missing = TABLE_PRIVS.filter((p) => !have.has(p));
      if (missing.length) tableAclLines.push(`revoke ${missing.join(', ').toLowerCase()} on public.${q(t)} from ${role};`);
    }
  }
  if (tableAclLines.length) {
    rule('Table privileges (differences from Supabase defaults)');
    emit(...tableAclLines);
  }

  // ── row level security + policies ──
  rule('Row Level Security');
  for (const r of cat.relations.filter((x) => x.kind === 'table').sort((a, b) => a.table.localeCompare(b.table))) {
    if (r.rls_enabled) emit(`alter table public.${q(r.table)} enable row level security;`);
    if (r.rls_forced) emit(`alter table public.${q(r.table)} force row level security;`);
  }
  emit('-- Tables with RLS enabled and no policy below are service-role only.');
  emit('');
  note('policies:legacy');
  const CMD = { ALL: 'all', SELECT: 'select', INSERT: 'insert', UPDATE: 'update', DELETE: 'delete' };
  for (const p of [...cat.policies].sort((a, b) => a.table.localeCompare(b.table) || a.name.localeCompare(b.name))) {
    const roles = (p.roles ?? ['public']).map((r) => (r === 'public' ? 'public' : q(r))).join(', ');
    let sql = `create policy "${p.name.replaceAll('"', '""')}" on public.${q(p.table)}\n  as ${p.permissive.toLowerCase()} for ${CMD[p.command]} to ${roles}`;
    if (p.using) sql += `\n  using (${p.using})`;
    if (p.with_check) sql += `\n  with check (${p.with_check})`;
    emit('', `${sql};`);
  }

  // ── triggers ──
  rule('Triggers');
  for (const t of [...cat.triggers].sort((a, b) => a.table.localeCompare(b.table) || a.name.localeCompare(b.name))) {
    if (t.definition_redacted || !t.definition) throw new Error(`generator: trigger ${t.name} definition redacted — obtain it separately`);
    if (t.enabled !== 'O') throw new Error(`generator: trigger ${t.name} has non-default enabled state ${t.enabled}`);
    emit(`${t.definition};`);
  }

  // ── migration ledger rows contained in this file ──
  if (ledger) {
    rule('Migration ledger (migrations contained in this file)');
    const lit = (s) => (s === null || s === undefined ? 'null' : `'${String(s).replaceAll("'", "''")}'`);
    emit('insert into public.schema_migrations (version, name, applied_at, note) values');
    ledger.forEach((r, i) => emit(`  (${lit(r.version)}, ${lit(r.name)}, null, ${lit(r.note)})${i < ledger.length - 1 ? ',' : ';'}`));
  }

  emit('');
  return {
    sql: lines.join('\n'),
    stats: { tables: tables.length, constraints: cons.length, functions: fns.length, policies: cat.policies.length, triggers: cat.triggers.length },
  };
}
