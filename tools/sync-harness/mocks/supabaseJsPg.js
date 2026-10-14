// Mock of '@supabase/supabase-js' for the service-role writes of the
// analytics / attribution modules: createClient() returns a tiny client that
// runs straight against the test's PGlite database (globalThis.__pgServiceDb)
// as its owner (no RLS, like the service-role key). Only what those modules
// use: upsert(…, { onConflict, ignoreDuplicates }), insert(…), and
// select(…).eq(…).maybeSingle(). The real unique indexes decide dedupe.
const q = (name) => `"${String(name).replace(/"/g, '""')}"`;

function client() {
  const db = globalThis.__pgServiceDb;
  if (!db) throw new Error('supabaseJsPg: no globalThis.__pgServiceDb');
  const write = async (table, row, conflict) => {
    const cols = Object.keys(row);
    const values = cols.map((c) => (row[c] !== null && typeof row[c] === 'object' ? JSON.stringify(row[c]) : row[c]));
    const sql = `insert into public.${q(table)} (${cols.map(q).join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')})` +
      (conflict ? ` on conflict (${conflict.split(',').map((c) => q(c.trim())).join(', ')}) do nothing` : '');
    try {
      await db.query(sql, values);
      return { data: null, error: null };
    } catch (e) {
      return { data: null, error: { message: e.message, code: e.code } };
    }
  };
  return {
    from(table) {
      return {
        upsert: (row, opts = {}) => write(table, row, opts.ignoreDuplicates ? opts.onConflict : null),
        insert: (row) => write(table, row, null),
        select(cols) {
          const filters = [];
          const chain = {
            eq(c, v) { filters.push([c, v]); return chain; },
            async maybeSingle() {
              const where = filters.map(([c], i) => `${q(c)} = $${i + 1}`).join(' and ');
              const { rows } = await db.query(`select ${cols} from public.${q(table)}${where ? ` where ${where}` : ''} limit 1`, filters.map(([, v]) => v));
              return { data: rows[0] ?? null, error: null };
            },
          };
          return chain;
        },
      };
    },
  };
}

export function createClient() {
  return client();
}
