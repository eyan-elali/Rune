// Smoke tests proving the Phase 0 test foundation itself works:
//   1. the Supabase shim (roles, auth.uid(), RLS behaviour per role),
//   2. the supabase-js-shaped PGlite adapter (query shapes, RLS, errors, rpc),
//   3. bundling a REAL Rune TypeScript module with next/* + server-client
//      mocks and running it against PGlite as a user.
// These are foundation checks, not the Phase 0 regression suites.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, readRepoFile, withRole, asUser, createAuthUser, LEGACY_BASELINE, RUNE2_SCHEMA } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';

const A = 'a0000000-0000-0000-0000-00000000000a';
const B = 'b0000000-0000-0000-0000-00000000000b';
const PROJ = 'aaaaaaaa-0000-0000-0000-0000000000a1';
const CH1 = 'bbbbbbbb-0000-0000-0000-0000000000a1';
const CH2 = 'bbbbbbbb-0000-0000-0000-0000000000a2';
const PG1 = 'cccccccc-0000-0000-0000-0000000000a1';
const PG2 = 'cccccccc-0000-0000-0000-0000000000a2';
const PG3 = 'cccccccc-0000-0000-0000-0000000000a3';

let db;

before(async () => {
  db = await createTestDb();
  await db.exec(readRepoFile(LEGACY_BASELINE)); // Rune 1.x production baseline
  await createAuthUser(db, A); // signup trigger → profiles + entitlements
  await createAuthUser(db, B);
  await db.exec(`
    insert into public.projects (id, user_id, title, word_count) values ('${PROJ}', '${A}', 'Golden', 12345);
    insert into public.chapters (id, project_id, title, position) values ('${CH1}', '${PROJ}', 'One', 1), ('${CH2}', '${PROJ}', 'Two', 2);
    insert into public.pages (id, chapter_id, title, position, word_count, is_canonical) values
      ('${PG1}', '${CH1}', 'p', 0, 100, false),
      ('${PG2}', '${CH1}', 'p', 1, 40,  true),
      ('${PG3}', '${CH2}', 'p', 0, 7,   false);
  `);
});

// ── 1. shim ──────────────────────────────────────────────────────────────────

test('shim: auth.uid()/auth.role() reflect the impersonated request and reset afterwards', async () => {
  const r = await asUser(db, A, (tx) => tx.query(`select auth.uid() as uid, auth.role() as role, current_user as cu`));
  assert.deepEqual(r.rows[0], { uid: A, role: 'authenticated', cu: 'authenticated' });
  const after = await db.query(`select auth.uid() as uid, current_user as cu`);
  assert.deepEqual(after.rows[0], { uid: null, cu: 'postgres' }, 'claims and role are transaction-local');
});

test('shim: RLS applies per role — owner, other user, anon, service_role', async () => {
  const count = (identity) =>
    withRole(db, identity, (tx) => tx.query(`select count(*)::int as n from public.pages`)).then((r) => r.rows[0].n);
  assert.equal(await count({ role: 'authenticated', userId: A }), 3);
  assert.equal(await count({ role: 'authenticated', userId: B }), 0);
  assert.equal(await count({ role: 'anon' }), 0);
  assert.equal(await count({ role: 'service_role' }), 3, 'service_role bypasses RLS');
});

test('shim: a failure inside withRole rolls the whole request back', async () => {
  await assert.rejects(asUser(db, A, async (tx) => {
    await tx.query(`update public.pages set title = 'changed' where id = $1`, [PG1]);
    throw new Error('boom');
  }));
  const r = await db.query(`select title from public.pages where id = $1`, [PG1]);
  assert.equal(r.rows[0].title, 'p');
});

// ── 2. adapter ───────────────────────────────────────────────────────────────

test('adapter: select / filters / order / limit / single / maybeSingle / count', async () => {
  const sb = createSupabaseAdapter(db, { userId: A });

  const list = await sb.from('pages').select('id, position').eq('chapter_id', CH1).order('position', { ascending: false });
  assert.equal(list.error, null);
  assert.deepEqual(list.data.map((p) => p.id), [PG2, PG1]);

  const inList = await sb.from('pages').select('id').in('chapter_id', [CH1, CH2]).order('position').limit(10);
  assert.equal(inList.data.length, 3);

  const one = await sb.from('projects').select('*').eq('id', PROJ).single();
  assert.equal(one.data.word_count, 12345);

  const none = await sb.from('projects').select('id').eq('id', PG1).single();
  assert.equal(none.data, null);
  assert.equal(none.error.code, 'PGRST116', 'single() on zero rows mirrors PostgREST');

  const maybe = await sb.from('projects').select('id').eq('id', PG1).maybeSingle();
  assert.deepEqual({ data: maybe.data, error: maybe.error }, { data: null, error: null });

  const counted = await sb.from('pages').select('id', { count: 'exact', head: true }).eq('chapter_id', CH1);
  assert.deepEqual({ data: counted.data, count: counted.count }, { data: null, count: 2 });

  const canonical = await sb.from('pages').select('id').is('is_canonical', true);
  assert.deepEqual(canonical.data.map((p) => p.id), [PG2]);
});

test('adapter: RLS — another user sees nothing and cannot update', async () => {
  const other = createSupabaseAdapter(db, { userId: B });
  const read = await other.from('pages').select('id').eq('id', PG1);
  assert.deepEqual(read, { data: [], error: null, count: null });

  const upd = await other.from('pages').update({ title: 'hijack' }).eq('id', PG1).select('id');
  assert.deepEqual(upd.data, [], 'update silently affects 0 rows, like PostgREST');
  const r = await db.query(`select title from public.pages where id = $1`, [PG1]);
  assert.equal(r.rows[0].title, 'p');
});

test('adapter: insert / update / delete with returning, and jsonb round-trip', async () => {
  const sb = createSupabaseAdapter(db, { userId: A });
  const content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }] };

  const ins = await sb.from('pages').insert({ chapter_id: CH2, title: 'New', content, position: 1 }).select().single();
  assert.equal(ins.error, null, JSON.stringify(ins.error));
  assert.deepEqual(ins.data.content, content);
  assert.equal(ins.data.version, 1);

  const upd = await sb.from('pages').update({ title: 'Renamed' }).eq('id', ins.data.id).select('title, version').single();
  assert.deepEqual(upd.data, { title: 'Renamed', version: 2 }, 'version trigger fires through the adapter');

  const del = await sb.from('pages').delete().eq('id', ins.data.id).select('id');
  assert.deepEqual(del.data, [{ id: ins.data.id }], 'owner may delete (pages: delete own)');

  const otherDel = await createSupabaseAdapter(db, { userId: B }).from('pages').delete().eq('id', PG1).select('id');
  assert.deepEqual(otherDel.data, [], "another user's delete affects 0 rows");
});

test('adapter: rejected insert (RLS WITH CHECK) returns an error object, not a throw', async () => {
  const other = createSupabaseAdapter(db, { userId: B });
  const res = await other.from('pages').insert({ chapter_id: CH1, title: 'x', position: 9 });
  assert.equal(res.data, null);
  assert.equal(res.error.code, '42501', JSON.stringify(res.error));
});

test('adapter: rpc uses named arguments and returns the function result', async () => {
  const sb = createSupabaseAdapter(db, { userId: A });
  const total = await sb.rpc('account_word_total');
  assert.deepEqual(total, { data: 147, error: null }, 'every page counts, canonical or not');

  const saved = await sb.rpc('save_page_checked', {
    p_page_id: PG3, p_content: { type: 'doc' }, p_word_count: 9, p_expected_version: 1,
  });
  assert.equal(saved.error, null, JSON.stringify(saved.error));
  assert.equal(saved.data.status, 'ok');
  assert.equal(saved.data.version, 2);

  const anon = createSupabaseAdapter(db);
  const denied = await anon.rpc('account_word_total');
  assert.equal(denied.data, null);
  assert.ok(denied.error, 'anon call errors (Not authenticated / permission denied)');
});

test('adapter: unsupported shapes fail loudly instead of passing silently', async () => {
  const sb = createSupabaseAdapter(db, { userId: A });
  const embedded = await sb.from('chapters').select('id, pages(id)');
  assert.match(embedded.error?.message ?? '', /adapter: unsupported embedded select/);
  assert.throws(() => sb.from('pages').upsert({}), /adapter: unsupported upsert/);
});

// ── 3. bundling real Rune code ───────────────────────────────────────────────

test('bundle: real revalidateProjectTotals runs against PGlite (Rune 2.0 schema); the database keeps the ordered total', async () => {
  // The app targets the Rune 2.0 schema; the shim/adapter tests above use the Rune 1.x baseline.
  const r2 = await createTestDb();
  await r2.exec(readRepoFile(RUNE2_SCHEMA));
  await createAuthUser(r2, A);
  await r2.exec(`insert into public.projects (id, user_id, title, word_count) values ('${PROJ}', '${A}', 'Golden', 12345);`);
  const m = (await r2.query(`select id from public.manuscripts where project_id = $1`, [PROJ])).rows[0].id;
  await r2.exec(`
    insert into public.chapters (id, manuscript_id, title, position) values ('${CH1}', '${m}', 'One', 1), ('${CH2}', '${m}', 'Two', 2);
    insert into public.scenes (id, manuscript_id, chapter_id, title, position, word_count) values
      ('${PG1}', '${m}', '${CH1}', 'p', 0, 100),
      ('${PG2}', '${m}', '${CH1}', 'p', 1, 40),
      ('${PG3}', '${m}', null,     'p', 0, 500);
  `);

  // Every placed Scene counts (100 + 40); the Unplaced Scene (500) does not.
  // The trigger (migration 020) replaced the stale 12345 as the Scenes arrived.
  const stored = async () => (await r2.query(`select word_count from public.projects where id = $1`, [PROJ])).rows[0].word_count;
  assert.equal(await stored(), 140);

  const mod = await bundleForTest('src/lib/projectWordCount.ts', { name: 'foundation_projectWordCount' });
  mod.setServerClient(createSupabaseAdapter(r2, { userId: A })); // unused by this helper, but proves the export
  mod.revalidateProjectTotals(PROJ);
  assert.equal(await stored(), 140, 'the app helper never writes the total');
  assert.deepEqual(
    mod.revalidateCalls.map((c) => c.path),
    [`/projects/${PROJ}`, '/profile'],
    'next/cache mock recorded revalidatePath calls'
  );
});
