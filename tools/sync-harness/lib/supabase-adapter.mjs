// A minimal supabase-js-shaped client over PGlite, for running REAL Rune
// server code (server actions, route handlers, the sync engine) against real
// Postgres + RLS in tests.
//
// Every request runs in its own transaction as the configured role/user (see
// withRole in ./pg.mjs), exactly like one PostgREST request. Errors come back
// as `{ data: null, error: { message, code } }` the way supabase-js returns
// them; nothing throws.
//
// Deliberately minimal — it supports only the query shapes Phase 0 tests need:
//
//   from(t).select('a, b' | '*', { count: 'exact', head: true }?)
//          .eq / neq / gt / gte / lt / lte / is / in / filter(col, op, val)
//          .order(col, { ascending }) .limit(n)
//          .single() / .maybeSingle() / await
//   from(t).insert(obj | obj[]) [.select(cols)] [.single()]
//   from(t).update(obj).<filters> [.select(cols)] [.single()]
//   from(t).delete().<filters> [.select(cols)]
//   rpc(fn, { named: args })
//   auth.getUser() / auth.getSession()
//
// Anything else — embedded resources like 'pages(id)', JSON-path filters,
// upsert, or/not/range/textSearch — throws "adapter: unsupported …" so a test
// can never silently pass on a shape this adapter doesn't really implement.
import { withRole } from './pg.mjs';

const IDENT = /^[a-z_][a-z0-9_]*$/;
const OPS = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };

function ident(name, what = 'identifier') {
  if (typeof name !== 'string' || !IDENT.test(name)) {
    throw new Error(`adapter: unsupported ${what} ${JSON.stringify(name)}`);
  }
  return `"${name}"`;
}

function selectList(cols) {
  if (cols === undefined || cols.trim() === '*') return '*';
  return cols
    .split(',')
    .map((c) => c.trim())
    .map((c) => {
      if (c.includes('(')) throw new Error(`adapter: unsupported embedded select ${JSON.stringify(cols)}`);
      return ident(c, 'column');
    })
    .join(', ');
}

function toError(e) {
  return { message: e.message, code: e.code ?? null, details: e.detail ?? null, hint: e.hint ?? null };
}

// PGlite serializes parameters by the inferred Postgres type. jsonb/json
// parameters need JSON text; arrays are passed through for `= any($n)`.
function param(value) {
  if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
    return JSON.stringify(value);
  }
  return value;
}

class Query {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.kind = null; // select | insert | update | delete
    this.cols = undefined;
    this.returning = false;
    this.filters = [];
    this.orders = [];
    this.limitN = null;
    this.cardinality = 'many'; // many | single | maybe
    this.countMode = null;
    this.head = false;
    this.values = null;
  }

  // ── verbs ──
  select(cols, opts = {}) {
    if (this.kind === null) {
      this.kind = 'select';
      this.cols = cols;
      if (opts.count) {
        if (opts.count !== 'exact') throw new Error(`adapter: unsupported count mode ${opts.count}`);
        this.countMode = 'exact';
      }
      this.head = Boolean(opts.head);
    } else {
      // .insert().select() / .update().select() / .delete().select()
      this.returning = true;
      this.cols = cols;
    }
    return this;
  }
  insert(values) { this.kind = 'insert'; this.values = Array.isArray(values) ? values : [values]; return this; }
  update(values) { this.kind = 'update'; this.values = values; return this; }
  delete() { this.kind = 'delete'; return this; }
  upsert() { throw new Error('adapter: unsupported upsert'); }

  // ── filters ──
  _f(col, op, value) { this.filters.push({ col, op, value }); return this; }
  eq(c, v) { return this._f(c, 'eq', v); }
  neq(c, v) { return this._f(c, 'neq', v); }
  gt(c, v) { return this._f(c, 'gt', v); }
  gte(c, v) { return this._f(c, 'gte', v); }
  lt(c, v) { return this._f(c, 'lt', v); }
  lte(c, v) { return this._f(c, 'lte', v); }
  is(c, v) {
    if (v !== null && v !== true && v !== false) throw new Error(`adapter: unsupported is(${c}, ${v})`);
    return this._f(c, 'is', v);
  }
  in(c, arr) { return this._f(c, 'in', arr); }
  filter(c, op, v) {
    if (!(op in OPS) && op !== 'is') throw new Error(`adapter: unsupported filter operator ${op}`);
    if (op === 'is') return this.is(c, v === 'null' ? null : v);
    return this._f(c, op, v);
  }

  // ── modifiers ──
  order(col, { ascending = true } = {}) { this.orders.push({ col, ascending }); return this; }
  limit(n) { this.limitN = n; return this; }
  single() { this.cardinality = 'single'; return this; }
  maybeSingle() { this.cardinality = 'maybe'; return this; }

  // ── SQL generation ──
  _where(params) {
    if (this.filters.length === 0) return '';
    const parts = this.filters.map(({ col, op, value }) => {
      const c = ident(col, 'column');
      if (op === 'is') return value === null ? `${c} is null` : `${c} is ${value ? 'true' : 'false'}`;
      if (op === 'in') { params.push(value); return `${c} = any($${params.length})`; }
      params.push(param(value));
      return `${c} ${OPS[op]} $${params.length}`;
    });
    return ` where ${parts.join(' and ')}`;
  }

  _build() {
    const t = `public.${ident(this.table, 'table')}`;
    const params = [];
    const ret = this.returning ? ` returning ${selectList(this.cols)}` : '';
    switch (this.kind) {
      case 'select': {
        let sql = `select ${selectList(this.cols)} from ${t}${this._where(params)}`;
        if (this.orders.length) {
          sql += ' order by ' + this.orders.map((o) => `${ident(o.col, 'column')} ${o.ascending ? 'asc' : 'desc'}`).join(', ');
        }
        if (this.limitN !== null) sql += ` limit ${Number(this.limitN)}`;
        return { sql, params };
      }
      case 'insert': {
        const keys = [...new Set(this.values.flatMap((v) => Object.keys(v)))];
        const rows = this.values.map((v) => '(' + keys.map((k) => {
          if (!(k in v)) return 'default';
          params.push(param(v[k]));
          return `$${params.length}`;
        }).join(', ') + ')');
        return { sql: `insert into ${t} (${keys.map((k) => ident(k, 'column')).join(', ')}) values ${rows.join(', ')}${ret}`, params };
      }
      case 'update': {
        const sets = Object.entries(this.values).map(([k, v]) => {
          params.push(param(v));
          return `${ident(k, 'column')} = $${params.length}`;
        });
        return { sql: `update ${t} set ${sets.join(', ')}${this._where(params)}${ret}`, params };
      }
      case 'delete':
        return { sql: `delete from ${t}${this._where(params)}${ret}`, params };
      default:
        throw new Error('adapter: query has no verb');
    }
  }

  async _run() {
    let built;
    try { built = this._build(); } catch (e) { return { data: null, error: toError(e), count: null }; }
    try {
      const result = await withRole(this.client.db, this.client.identity, async (tx) => {
        const res = await tx.query(built.sql, built.params);
        let count = null;
        if (this.countMode) {
          const cParams = [];
          const where = this._where(cParams);
          const c = await tx.query(`select count(*)::int as n from public.${ident(this.table)}${where}`, cParams);
          count = c.rows[0].n;
        }
        return { rows: res.rows, count };
      });
      const returnsRows = this.kind === 'select' || this.returning;
      if (!returnsRows) return { data: null, error: null, count: result.count };
      if (this.head) return { data: null, error: null, count: result.count };
      if (this.cardinality === 'single') {
        if (result.rows.length !== 1) {
          return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' }, count: null };
        }
        return { data: result.rows[0], error: null, count: result.count };
      }
      if (this.cardinality === 'maybe') {
        if (result.rows.length > 1) {
          return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' }, count: null };
        }
        return { data: result.rows[0] ?? null, error: null, count: result.count };
      }
      return { data: result.rows, error: null, count: result.count };
    } catch (e) {
      return { data: null, error: toError(e), count: null };
    }
  }

  then(resolve, reject) { return this._run().then(resolve, reject); }
}

/**
 * Creates a supabase-js-shaped client bound to a PGlite database and a
 * Supabase identity. `userId: null` with role 'anon' models a signed-out
 * browser; role 'service_role' models the service-role key (bypasses RLS).
 */
export function createSupabaseAdapter(db, { userId = null, role = userId ? 'authenticated' : 'anon' } = {}) {
  const client = {
    db,
    identity: { role, userId },
    calls: [], // { kind: 'from'|'rpc', name } — lets tests assert which paths ran
    from(table) {
      client.calls.push({ kind: 'from', name: table });
      return new Query(client, table);
    },
    async rpc(fn, args = {}) {
      client.calls.push({ kind: 'rpc', name: fn });
      try {
        const names = Object.keys(args);
        const argSql = names.map((n, i) => `${ident(n, 'argument')} => $${i + 1}`).join(', ');
        const params = names.map((n) => param(args[n]));
        const res = await withRole(db, client.identity, (tx) =>
          tx.query(`select public.${ident(fn, 'function')}(${argSql}) as result`, params)
        );
        return { data: res.rows[0]?.result ?? null, error: null };
      } catch (e) {
        return { data: null, error: toError(e) };
      }
    },
    auth: {
      async getUser() {
        return userId
          ? { data: { user: { id: userId } }, error: null }
          : { data: { user: null }, error: { message: 'Auth session missing!' } };
      },
      async getSession() {
        return { data: { session: userId ? { user: { id: userId } } : null }, error: null };
      },
    },
  };
  return client;
}
