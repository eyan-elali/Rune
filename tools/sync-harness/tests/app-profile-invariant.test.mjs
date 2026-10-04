// Every account in Rune has a profile (migration 053), and no entry point lets
// an account without one in. The BC-E walkthrough found a fresh, confirmed,
// approved account with no public.profiles row — its signup trigger had not
// run on the Rune 2.0 database — that reached /projects and failed to create
// a Project with projects_user_id_fkey. These tests reproduce that state
// exactly (the trigger is dropped, as on the live database) and drive the
// REAL callback route, gate, action and onboarding against real Postgres + RLS:
//
//   * the failure itself, as it was at 052 (the foreign-key error)
//   * 053: the trigger is back and idempotent; complete_profile creates a
//     missing profile only with a real pen name, idempotently; a Project needs
//     a profile before beta access is even consulted
//   * the confirmed callback (code and token_hash links) sends an account
//     without a profile to /complete-profile, never /projects or /onboarding
//   * the gate every page uses (lib/accountGate.ts) and the pages that use it
//   * the whole journey: profile → beta → onboarding Project, with refreshes
//     and retries leaving one profile and one Project
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createTestDb, readRepoFile, readMigration, createAuthUser, REPO_DIR, HARNESS_DIR, LEGACY_BASELINE, RUNE2_SCHEMA } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';
import { NextRequest } from '../mocks/nextServer.js';
import { migrationsAfterBaseline } from '../build-schema.mjs';

const W = (n) => `bf000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const read = (f) => fs.readFileSync(path.join(REPO_DIR, f), 'utf8');
/** Source without comments: what the code does, not what it explains. */
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const MOCKS = {
  '@/lib/actions/analytics': path.join(HARNESS_DIR, 'mocks/analyticsRecorder.js'),
  '@/lib/supabase/service': path.join(HARNESS_DIR, 'mocks/serviceClient.js'),
  '@/lib/stripe/client': path.join(HARNESS_DIR, 'mocks/stripeTrap.js'),
  '@supabase/ssr': path.join(HARNESS_DIR, 'mocks/supabaseSsr.js'),
};

let gate, callback, profileActions, onboarding, betaAccess;
before(async () => {
  const b = (entry, name) => bundleForTest(entry, { name, aliases: MOCKS });
  gate = await b('src/lib/accountGate.ts', 'pi_gate');
  callback = await b('src/app/auth/callback/route.ts', 'pi_callback');
  profileActions = await b('src/lib/actions/profile.ts', 'pi_profile');
  onboarding = await b('src/lib/actions/onboarding.ts', 'pi_onboarding');
  betaAccess = await b('src/lib/betaAccess.ts', 'pi_betaAccess');
});

const EMAIL = 'fresh@example.com';

/** The signed-in browser of `userId`: the server client every bundled module uses. */
function signIn(db, userId) {
  const sb = createSupabaseAdapter(db, { userId });
  sb.auth.updateUser = async () => ({ data: {}, error: null }); // the auth metadata sync
  for (const mod of [callback, profileActions, onboarding, betaAccess]) mod.setServerClient(sb);
  globalThis.__ssrClient = sb;
  return sb;
}

/** The live state: approved email, confirmed account, signup trigger absent → no profile. */
async function freshAccountWithoutProfile(db, n = 1) {
  await db.query(`insert into public.beta_access (email) values ($1) on conflict do nothing`, [EMAIL]);
  await createAuthUser(db, W(n), { display_name: 'Ada Quill' }, { beta: false, email: EMAIL });
  return W(n);
}

async function fixedDbWithoutTrigger() {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  await db.exec(`drop trigger on_auth_user_created on auth.users`);
  return db;
}

const counts = async (db, id) => one(db, `select
  (select count(*)::int from public.profiles where id = $1) as profiles,
  (select count(*)::int from public.user_pricing_entitlements where user_id = $1) as entitlements,
  (select count(*)::int from public.projects where user_id = $1) as projects`, [id]);

const createProjectRpc = (sb) => sb.rpc('create_project_checked', {
  p_title: 'A book', p_description: null, p_cover_color: null, p_first_scene_content: null, p_first_scene_word_count: 0, p_request_id: null,
});

async function callbackGet(query) {
  const res = await callback.GET(new NextRequest(`http://localhost:3000/auth/callback?${query}`));
  return { status: res.status, location: res.headers.get('location') };
}

// ── 1. The failure, as it was ────────────────────────────────────────────────

test('REPRODUCTION at 052: a confirmed, approved account whose signup trigger did not run has no profile, is accepted into the beta, and its Project fails on projects_user_id_fkey', async () => {
  const db = await createTestDb();
  await db.exec(readRepoFile(LEGACY_BASELINE));
  for (const f of migrationsAfterBaseline().filter((f) => f < '053')) await db.exec(readMigration(f));
  await db.exec(`drop trigger on_auth_user_created on auth.users`); // as on the live Rune 2.0 database
  const id = await freshAccountWithoutProfile(db);
  assert.deepEqual(await counts(db, id), { profiles: 0, entitlements: 0, projects: 0 });

  const sb = createSupabaseAdapter(db, { userId: id });
  assert.equal((await sb.rpc('claim_beta_access')).data, 'accepted', 'beta acceptance never needed a profile');
  const r = await createProjectRpc(sb);
  assert.match(r.error?.message ?? '', /projects_user_id_fkey/);
});

// ── 2. Migration 053 ─────────────────────────────────────────────────────────

test('053 on that database: re-creates the signup trigger, writes no row for existing accounts, and refuses a second run', async () => {
  const db = await createTestDb();
  await db.exec(readRepoFile(LEGACY_BASELINE));
  for (const f of migrationsAfterBaseline().filter((f) => f < '053')) await db.exec(readMigration(f));
  await db.exec(`drop trigger on_auth_user_created on auth.users`);
  const stranded = await freshAccountWithoutProfile(db, 1);
  await db.exec(`create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user()`);
  await createAuthUser(db, W(2), { display_name: 'Existing Writer' });
  await db.exec(`drop trigger on_auth_user_created on auth.users`);
  const before = await one(db, `select (select count(*)::int from public.profiles) as p, (select count(*)::int from public.user_pricing_entitlements) as e`);

  await db.exec(readMigration('053_profile_invariant.sql'));
  assert.deepEqual(await one(db, `select (select count(*)::int from public.profiles) as p, (select count(*)::int from public.user_pricing_entitlements) as e`), before,
    'no placeholder profile is created for the stranded account; nothing changes for the existing one');
  assert.equal((await counts(db, stranded)).profiles, 0);
  assert.equal((await one(db, `select display_name from public.profiles where id = $1`, [W(2)])).display_name, 'Existing Writer');

  await createAuthUser(db, W(3), { display_name: 'New Writer' });
  assert.deepEqual(await counts(db, W(3)), { profiles: 1, entitlements: 1, projects: 0 }, 'signup creates the profile again');
  assert.equal((await one(db, `select display_name from public.profiles where id = $1`, [W(3)])).display_name, 'New Writer');
  await assert.rejects(db.exec(readMigration('053_profile_invariant.sql')), /already been applied/);
});

test('handle_new_user is idempotent: a profile that already exists is kept, not duplicated or overwritten', async () => {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  await db.exec(`drop trigger on_auth_user_created on auth.users`);
  await db.exec(`create trigger on_auth_user_created_twice after insert on auth.users for each row execute function public.handle_new_user()`);
  await db.exec(`create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user()`);
  await createAuthUser(db, W(4), { display_name: 'Once' });
  assert.deepEqual(await counts(db, W(4)), { profiles: 1, entitlements: 1, projects: 0 });
});

test('complete_profile: only the caller, only a real pen name, creates a missing profile and entitlement once, and never a second', async () => {
  const db = await fixedDbWithoutTrigger();
  const id = await freshAccountWithoutProfile(db);
  const sb = createSupabaseAdapter(db, { userId: id });
  for (const bad of [null, '', '   ', 'A', 'x'.repeat(41)]) {
    assert.match((await sb.rpc('complete_profile', { p_display_name: bad })).error?.message ?? '', /invalid_pen_name/, String(bad));
  }
  assert.equal((await counts(db, id)).profiles, 0, 'no placeholder profile on a refused name');
  assert.match((await createSupabaseAdapter(db).rpc('complete_profile', { p_display_name: 'Anon' })).error?.message ?? '', /permission denied|Not authenticated/);

  for (let i = 0; i < 3; i++) {
    const r = await sb.rpc('complete_profile', { p_display_name: '  Ada Quill ' });
    assert.equal(r.error, null);
    assert.deepEqual(r.data, { id, display_name: 'Ada Quill' });
  }
  assert.deepEqual(await counts(db, id), { profiles: 1, entitlements: 1, projects: 0 });
  assert.deepEqual(await one(db, `select subscription_tier, xp, level, is_admin from public.profiles where id = $1`, [id]),
    { subscription_tier: 'free', xp: 0, level: 1, is_admin: false }, 'the same defaults as signup');
  assert.equal((await one(db, `select pricing_cohort from public.user_pricing_entitlements where user_id = $1`, [id])).pricing_cohort, 'starter_2k');
});

test('a Project needs a profile first, with a clear refusal, before beta access is consulted or accepted', async () => {
  const db = await fixedDbWithoutTrigger();
  const id = await freshAccountWithoutProfile(db);
  const r = await createProjectRpc(createSupabaseAdapter(db, { userId: id }));
  assert.match(r.error?.message ?? '', /Choose your pen name before creating a project/);
  assert.doesNotMatch(r.error.message, /foreign key/);
  assert.equal((await one(db, `select accepted_at from public.beta_access where email = $1`, [EMAIL])).accepted_at, null,
    'beta acceptance is not a profile: nothing was accepted');
});

// ── 3. The callback ──────────────────────────────────────────────────────────

test('the confirmed callback sends an account without a profile to /complete-profile — code and token_hash links, a signup and a sign-in, every repeat visit', async () => {
  const db = await fixedDbWithoutTrigger();
  const id = await freshAccountWithoutProfile(db);
  signIn(db, id);
  globalThis.__ssrLinks = { 'code-1': id, 'hash-1': id };

  assert.deepEqual(await callbackGet('code=code-1&next=/projects&intent=signup'),
    { status: 307, location: 'http://localhost:3000/complete-profile?registered=1' });
  assert.deepEqual(await callbackGet('token_hash=hash-1&type=signup&next=/projects&intent=signup'),
    { status: 307, location: 'http://localhost:3000/complete-profile?registered=1' });
  assert.deepEqual(await callbackGet('code=code-1&next=/projects'), { status: 307, location: 'http://localhost:3000/complete-profile' },
    'a repeated visit (or a magic link) still lands on profile completion');
  assert.deepEqual(await callbackGet('code=used-or-expired'), { status: 307, location: 'http://localhost:3000/login?error=confirmation_failed' });
  assert.deepEqual(await callbackGet('token_hash=hash-1&type=not-a-type'), { status: 307, location: 'http://localhost:3000/login?error=confirmation_failed' });
  assert.equal((await counts(db, id)).profiles, 0, 'the callback never creates a profile by itself');

  await createSupabaseAdapter(db, { userId: id }).rpc('complete_profile', { p_display_name: 'Ada Quill' });
  assert.deepEqual(await callbackGet('code=code-1&next=/projects&intent=signup'),
    { status: 307, location: 'http://localhost:3000/onboarding?registered=1' }, 'with a profile: onward to onboarding');
});

test('a blank pen name on an existing profile also goes to /complete-profile', async () => {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  await createAuthUser(db, W(5), {}, { email: 'blank@example.com' });
  signIn(db, W(5));
  globalThis.__ssrLinks = { c: W(5) };
  assert.equal((await callbackGet('code=c&next=/projects')).location, 'http://localhost:3000/complete-profile');
});

// ── 4. The gate and the pages that use it ────────────────────────────────────

test('the account gate: missing and blank are profile completion; a failed lookup is unknown, never "complete"', async () => {
  const db = await fixedDbWithoutTrigger();
  const id = await freshAccountWithoutProfile(db);
  const sb = createSupabaseAdapter(db, { userId: id });
  const missing = await gate.readProfileState(sb, id);
  assert.deepEqual(missing, { status: 'missing' });
  assert.equal(gate.needsProfileCompletion(missing), true);
  await sb.rpc('complete_profile', { p_display_name: 'Ada Quill' });
  const complete = await gate.readProfileState(sb, id, 'display_name');
  assert.deepEqual(complete, { status: 'complete', profile: { display_name: 'Ada Quill' } });
  assert.equal(gate.needsProfileCompletion(complete), false);
  assert.equal(gate.needsProfileCompletion({ status: 'incomplete', profile: {} }), true);
  const failing = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'down' } }) }) }) }) };
  assert.deepEqual(await gate.readProfileState(failing, id), { status: 'unknown' });
  assert.equal(gate.needsProfileCompletion({ status: 'unknown' }), false);
});

test('the (rune2) layout (Projects, a Project, Settings, onboarding, import) asks the gate first and claims beta access only after it', () => {
  const layout = code('src/app/(rune2)/layout.tsx');
  const gateAt = layout.indexOf('if (needsProfileCompletion(profileState)) redirect(COMPLETE_PROFILE_PATH)');
  const claimAt = layout.indexOf('claimBetaAccess(supabase, user.id)');
  assert.ok(gateAt > 0 && claimAt > gateAt, 'profile → beta, never the other way round');
  assert.match(layout, /readProfileState<Profile>\(supabase, user\.id\)/);
  assert.doesNotMatch(layout, /\.single\(\)/, 'a missing row is an answer, not an error to wave through');

  const front = code('src/app/(front)/page.tsx');
  assert.ok(front.indexOf('redirect(COMPLETE_PROFILE_PATH)') > 0 && front.indexOf('redirect(COMPLETE_PROFILE_PATH)') < front.indexOf('claimBetaAccess('));

  const page = code('src/app/(auth)/complete-profile/page.tsx');
  assert.match(page, /if \(state\.status === "complete"\) redirect\("\/projects"\)/, 'only a complete profile leaves the page');

  const proxy = code('src/proxy.ts');
  assert.match(proxy, /pathname === "\/" &&[\s\S]*?has\("code"\)[\s\S]*?callbackUrl\.pathname = "\/auth\/callback"/, 'a link that fell back to the Site URL is finished at the callback');
  assert.match(code('src/app/(auth)/login/LoginClient.tsx'), /emailRedirectTo: new URL\("\/auth\/callback\?next=\/projects"/, 'magic links come back through the callback');
});

// ── 5. The whole journey ─────────────────────────────────────────────────────

test('JOURNEY: no profile → forced through profile completion → profile created → beta accepted → onboarding Project, with no FK error; refreshes and retries duplicate nothing', async () => {
  const db = await fixedDbWithoutTrigger();
  const id = await freshAccountWithoutProfile(db);
  const sb = signIn(db, id);
  globalThis.__ssrLinks = { 'code-1': id };

  // Confirmation link → profile completion.
  assert.equal((await callbackGet('code=code-1&next=/projects&intent=signup')).location, 'http://localhost:3000/complete-profile?registered=1');
  // Trying to go straight to onboarding fails safely, without a foreign-key error.
  const early = await onboarding.createOnboardingProject('A book');
  assert.equal(early.data, null);
  assert.doesNotMatch(early.error, /foreign key|projects_user_id_fkey/);
  assert.equal((await counts(db, id)).projects, 0);

  // The required step, submitted twice (a double click, a refresh and resubmit).
  assert.deepEqual(await profileActions.completePenName('A'), { error: 'Pen name must be at least 2 characters.' });
  assert.equal((await counts(db, id)).profiles, 0);
  assert.deepEqual(await profileActions.completePenName('Ada Quill'), { error: null, redirectTo: '/projects' });
  assert.deepEqual(await profileActions.completePenName('Ada Quill'), { error: null, redirectTo: '/projects' });
  assert.deepEqual(await counts(db, id), { profiles: 1, entitlements: 1, projects: 0 });
  assert.equal(gate.needsProfileCompletion(await gate.readProfileState(sb, id)), false, '/projects now lets the account in');

  // Then beta access (the layout), then onboarding.
  assert.equal(await betaAccess.claimBetaAccess(sb, id), 'accepted');
  assert.equal(await betaAccess.claimBetaAccess(sb, id), 'member');
  assert.equal((await onboarding.beginOnboarding()).error, null);
  assert.equal((await onboarding.chooseOnboardingPath('new')).error, null);
  const made = await onboarding.createOnboardingProject('A book');
  assert.equal(made.error, null, made.error);
  const again = await onboarding.createOnboardingProject('A book');
  assert.equal(again.data.projectId, made.data.projectId, 'a retry returns the same Project');
  assert.deepEqual(await counts(db, id), { profiles: 1, entitlements: 1, projects: 1 });

  // A repeat callback visit after all this goes on into the product, and changes nothing.
  assert.equal((await callbackGet('code=code-1&next=/projects')).location, 'http://localhost:3000/projects');
  assert.equal(gate.needsProfileCompletion(await gate.readProfileState(sb, id)), false);
  assert.deepEqual(await counts(db, id), { profiles: 1, entitlements: 1, projects: 1 });
});
