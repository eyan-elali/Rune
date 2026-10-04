// The closed beta and Rune 2.0 onboarding (Beta Completion E, migration 052):
// the REAL actions, route handlers and pure modules against the Rune 2.0
// schema in real Postgres + RLS, analytics recorded by a mock (never sent),
// Stripe replaced by a trap that fails any use.
//
//   * access: an approved email is accepted on first arrival and stays a
//     member; an unapproved or merely waitlisted account is refused — and,
//     server-side, cannot own a Project by any creation path; an accepted
//     writer cannot be un-accepted by editing the list; an admin is never
//     locked out; 052 accepts every account that already exists; the
//     optional Auth hook refuses an unapproved email
//   * waitlist: idempotent, says nothing about other addresses, grants nothing
//   * onboarding: new path and import path, resume after refresh, one Project
//     however often it is asked, completion once per account, arrival in
//     Chapter 1's first Scene; the old journey (first sentence, letter,
//     tutorial) is gone
//   * contextual teaching: one-time hints persist on the account, never
//     repeat, and nothing modal blocks the product
//   * feedback: the writer's text, a category, and safe context only
//   * monetization: nothing user-facing reaches Stripe; no feature is gated
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createTestDb, readRepoFile, readMigration, createAuthUser, grantBetaAccess, asUser, REPO_DIR, HARNESS_DIR, LEGACY_BASELINE, RUNE2_SCHEMA } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';
import { migrationsAfterBaseline } from '../build-schema.mjs';

const W = (n) => `be000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const all = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const as = (db, userId) => createSupabaseAdapter(db, userId ? { userId } : {});
const ok = (r) => { assert.equal(r.error, null, r.error); return r.data; };
const read = (f) => fs.readFileSync(path.join(REPO_DIR, f), 'utf8');
/** Source without comments: what the code does, not what it explains. */
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const MOCKS = {
  '@/lib/actions/analytics': path.join(HARNESS_DIR, 'mocks/analyticsRecorder.js'),
  '@/lib/supabase/service': path.join(HARNESS_DIR, 'mocks/serviceClient.js'),
  '@/lib/stripe/client': path.join(HARNESS_DIR, 'mocks/stripeTrap.js'),
};

let beta, betaAccess, onboarding, onboardingLib, betaLib, hints, settings, importRoute, projects, billing, pricing, checkoutRoute;
before(async () => {
  const b = (entry, name) => bundleForTest(entry, { name, aliases: MOCKS });
  beta = await b('src/lib/actions/beta.ts', 'cb_beta');
  betaAccess = await b('src/lib/betaAccess.ts', 'cb_betaAccess');
  onboarding = await b('src/lib/actions/onboarding.ts', 'cb_onboarding');
  onboardingLib = await b('src/lib/onboarding.ts', 'cb_onboardingLib');
  betaLib = await b('src/lib/beta.ts', 'cb_betaLib');
  hints = await b('src/lib/rune2/hints.ts', 'cb_hints');
  settings = await b('src/lib/actions/settings.ts', 'cb_settings');
  importRoute = await b('src/app/api/manuscript-import/route.ts', 'cb_import');
  projects = await b('src/lib/actions/projects.ts', 'cb_projects');
  billing = await b('src/lib/actions/billing.ts', 'cb_billing');
  pricing = await b('src/lib/actions/pricing.ts', 'cb_pricing');
  checkoutRoute = await b('src/app/api/billing/checkout/route.ts', 'cb_checkout');
});

const events = () => globalThis.__analyticsCalls;
const clearEvents = () => { events().length = 0; };

async function freshDb() {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  return db;
}

/** An account with an email and no beta access (createAuthUser's default would make it a member). */
const account = (db, n, email) => createAuthUser(db, W(n), {}, { beta: false, email });

function signIn(userId, db) {
  const sb = as(db, userId);
  for (const mod of [beta, betaAccess, onboarding, settings, importRoute, projects, billing, pricing, checkoutRoute]) mod.setServerClient(sb);
  return sb;
}

const createProject = (db, userId, title = 'A book') => as(db, userId).rpc('create_project_checked', {
  p_title: title, p_description: null, p_cover_color: null, p_first_scene_content: null, p_first_scene_word_count: 0, p_request_id: null,
});
const projectCount = async (db, userId) => (await one(db, `select count(*)::int as n from public.projects where user_id = $1`, [userId])).n;

const IMPORT_PAYLOAD = {
  title: 'Imported Book',
  items: [{ kind: 'chapter', title: 'One', scenes: [{ title: null, paragraphs: [['The lamp was lit.']] }] }],
  unplaced: [],
};
const postImport = (body) => importRoute.POST(new Request('http://localhost/api/manuscript-import', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}));

// ── 1. Access ─────────────────────────────────────────────────────────────────

test('an approved email is accepted the first time its account arrives, and is a member from then on', async () => {
  const db = await freshDb();
  await db.query(`insert into public.beta_access (email) values ('writer@example.com')`);
  await account(db, 1, '  Writer@Example.com ');
  signIn(W(1), db);
  clearEvents();
  assert.equal(await betaAccess.claimBetaAccess(await as(db, W(1)), W(1)), 'accepted');
  assert.deepEqual(events().map((e) => e.eventName), ['beta_access_accepted'], 'recorded once, with no email or content');
  assert.equal(events()[0].metadata, undefined);
  assert.equal(await betaAccess.claimBetaAccess(as(db, W(1)), W(1)), 'member');
  assert.equal(events().length, 1, 'accepting is recorded once');
  const row = await one(db, `select user_id, accepted_at is not null as accepted from public.beta_access where email = 'writer@example.com'`);
  assert.deepEqual(row, { user_id: W(1), accepted: true });
  assert.ok(betaLib.hasBetaAccess('accepted') && betaLib.hasBetaAccess('member') && betaLib.hasBetaAccess('admin'));
  assert.equal(ok(await createProject(db, W(1))).status, 'ok', 'a member creates Projects');
});

test('an unapproved account is refused, and cannot own a Project by any creation path (the server-side boundary)', async () => {
  const db = await freshDb();
  await account(db, 2, 'stranger@example.com');
  const sb = signIn(W(2), db);
  assert.equal(await betaAccess.claimBetaAccess(sb, W(2)), 'none');
  assert.equal(betaLib.hasBetaAccess('none'), false);

  const rpc = await createProject(db, W(2));
  assert.match(rpc.error?.message ?? '', /closed beta/, 'create_project_checked refused');
  const created = await projects.createProject('A book');
  assert.equal(created.data, null);
  assert.match(created.error, /closed beta/);
  const viaOnboarding = await onboarding.createOnboardingProject('A book');
  assert.match(viaOnboarding.error, /closed beta/, 'onboarding says so plainly');
  const imported = await postImport({ payload: IMPORT_PAYLOAD, requestId: W(900) });
  assert.equal(imported.status, 422, 'import refused');
  assert.equal(await projectCount(db, W(2)), 0, 'nothing was created');

  // The service role (an operator) is not a writer request and is not checked.
  await db.query(`insert into public.projects (user_id, title) values ($1, 'Operator-made')`, [W(2)]);
  assert.equal(await projectCount(db, W(2)), 1);
});

test('the (rune2) layout turns an account without access away on the server; the front door shows the closed beta', () => {
  const layout = code('src/app/(rune2)/layout.tsx');
  assert.match(layout, /claimBetaAccess\(supabase, user\.id\)/);
  assert.match(layout, /if \(access !== null && !hasBetaAccess\(access\)\) redirect\("\/"\)/);
  for (const page of ['projects/(home)/page.tsx', 'projects/[projectId]/layout.tsx', 'settings/page.tsx', 'onboarding/page.tsx']) {
    assert.ok(fs.existsSync(path.join(REPO_DIR, 'src/app/(rune2)', page)), `${page} sits under the gated layout`);
  }
  const front = read('src/app/(front)/page.tsx');
  assert.match(front, /Sutura is currently in closed beta\./);
  assert.match(front, /We’re inviting writers in gradually while we finish the first release\./);
  assert.match(front, /You’re on the list\./);
  assert.doesNotMatch(code('src/app/(front)/page.tsx'), /beta_access|invite id|permission|denied|unauthori[sz]ed|403|pricing|\$\d/i,
    'no internal or error-like language, no pricing');
});

test('the waitlist grants nothing: a waitlisted account is told so, and still cannot create a Project', async () => {
  const db = await freshDb();
  await account(db, 3, 'eager@example.com');
  signIn(null, db); // a visitor
  ok(await beta.joinBetaWaitlist({ email: ' Eager@Example.com', name: 'Eager', writes: 'A long saga' }));
  ok(await beta.joinBetaWaitlist({ email: 'eager@example.com' }));
  assert.deepEqual(await all(db, `select email, name, writes from public.beta_waitlist`), [{ email: 'eager@example.com', name: 'Eager', writes: 'A long saga' }],
    'one row; a second submission changes nothing');
  assert.equal((await beta.joinBetaWaitlist({ email: 'not an email' })).error, 'Enter an email address we can reach you at.');

  const sb = signIn(W(3), db);
  assert.equal(await betaAccess.claimBetaAccess(sb, W(3)), 'waitlisted');
  assert.equal(betaLib.hasBetaAccess('waitlisted'), false);
  assert.match((await createProject(db, W(3))).error?.message ?? '', /closed beta/);
  assert.equal(await one(db, `select count(*)::int as n from public.beta_access`).then((r) => r.n), 0, 'no approval appears');
});

test('nobody reads or writes the beta tables directly: not anon, not a writer', async () => {
  const db = await freshDb();
  await account(db, 4, 'w4@example.com');
  await grantBetaAccess(db, W(4));
  for (const userId of [null, W(4)]) {
    const sb = as(db, userId);
    for (const table of ['beta_access', 'beta_waitlist', 'beta_feedback']) {
      const r = await sb.from(table).select('*');
      assert.ok(r.error, `${table} is not readable by ${userId ? 'a writer' : 'anon'}`);
    }
    assert.ok((await sb.from('beta_access').insert({ email: 'me@example.com' })).error, 'no self-approval');
  }
  assert.ok((await as(db, null).rpc('claim_beta_access')).error, 'anon cannot claim');
  assert.ok((await as(db, W(4)).rpc('beta_access_state', { p_user: W(4), p_claim: true })).error, 'the internal state function is not exposed');
});

test('an accepted writer stays accepted: the list cannot un-accept, re-point or delete them; deleting the account releases the email', async () => {
  const db = await freshDb();
  await db.query(`insert into public.beta_access (email) values ('kept@example.com'), ('open@example.com')`);
  await account(db, 5, 'kept@example.com');
  await account(db, 6, 'other@example.com');
  signIn(W(5), db);
  assert.equal(await betaAccess.claimBetaAccess(as(db, W(5)), W(5)), 'accepted');
  await createProject(db, W(5));

  for (const [sql, what] of [
    [`delete from public.beta_access where email = 'kept@example.com'`, 'delete'],
    [`update public.beta_access set user_id = null, accepted_at = null where email = 'kept@example.com'`, 'un-accept'],
    [`update public.beta_access set user_id = '${W(6)}' where email = 'kept@example.com'`, 're-point'],
    [`update public.beta_access set email = 'changed@example.com' where email = 'kept@example.com'`, 'change email'],
  ]) {
    await assert.rejects(db.query(sql), /already accepted the beta/, what);
  }
  assert.equal(await betaAccess.claimBetaAccess(as(db, W(5)), W(5)), 'member');
  // Unaccepted rows are the operator's to change.
  await db.query(`delete from public.beta_access where email = 'open@example.com'`);

  // The writer's own account deletion releases the row; the email stays approved.
  await db.query(`delete from public.projects where user_id = $1`, [W(5)]);
  await db.query(`delete from auth.users where id = $1`, [W(5)]);
  assert.deepEqual(await one(db, `select user_id, accepted_at from public.beta_access where email = 'kept@example.com'`), { user_id: null, accepted_at: null });
});

test('an admin is never locked out, needs no approval, and is not recorded as a beta member', async () => {
  const db = await freshDb();
  await account(db, 7, 'founder@example.com');
  await db.query(`update public.profiles set is_admin = true where id = $1`, [W(7)]);
  assert.equal(await betaAccess.claimBetaAccess(as(db, W(7)), W(7)), 'admin');
  assert.equal(ok(await createProject(db, W(7))).status, 'ok');
  assert.equal((await one(db, `select count(*)::int as n from public.beta_access`)).n, 0);
});

test('migration 052 accepts every account that already exists, so no one loses access', async () => {
  const db = await createTestDb();
  await db.exec(readRepoFile(LEGACY_BASELINE));
  for (const f of migrationsAfterBaseline().filter((f) => f < '052')) await db.exec(readMigration(f));
  await createAuthUser(db, W(8), {}, { email: 'Early@Example.com' }); // before 052: no table, nothing granted
  await createAuthUser(db, W(9), {}, { email: null });
  await db.exec(readMigration('052_closed_beta.sql'));
  assert.deepEqual(await all(db, `select email, user_id, accepted_at is not null as accepted from public.beta_access`),
    [{ email: 'early@example.com', user_id: W(8), accepted: true }]);
  assert.equal((await one(db, `select public.beta_access_state($1, false) as s`, [W(8)])).s, 'member');
  await assert.rejects(db.exec(readMigration('052_closed_beta.sql')), /already been applied/);
});

test('the optional Auth hook refuses sign-up for an email that is not approved, and allows an approved one', async () => {
  const db = await freshDb();
  await db.query(`insert into public.beta_access (email) values ('invited@example.com')`);
  const hook = async (email) => (await one(db, `select public.beta_before_user_created($1::jsonb) as r`, [JSON.stringify({ user: { email } })])).r;
  assert.deepEqual(await hook('Invited@example.com '), {});
  const refused = await hook('stranger@example.com');
  assert.equal(refused.error.http_code, 403);
  assert.match(refused.error.message, /closed beta/, 'the sign-up page recognises this');
  assert.match(read('src/app/(auth)/signup/SignupClient.tsx'), /closed beta\/i\.test\(error\.message\)/);
});

// ── 2. Onboarding ─────────────────────────────────────────────────────────────

test('onboarding, new path: Welcome → path → title → one Project (Chapter 1, an empty Scene) → completion opens that Scene', async () => {
  const db = await freshDb();
  await createAuthUser(db, W(10));
  signIn(W(10), db);
  clearEvents();
  const row = async () => onboardingLib.readOnboardingRow(await one(db, `select path, project_id, completed_at from public.account_onboarding where user_id = $1`, [W(10)]));

  assert.equal(onboardingLib.needsOnboarding(null, { projectsEver: 0, hasWritten: false }), true, 'a new account belongs in onboarding');
  assert.equal(onboardingLib.onboardingStep(null, false), 'welcome');
  ok(await onboarding.beginOnboarding());
  assert.equal(onboardingLib.onboardingStep(await row(), false), 'path');
  ok(await onboarding.chooseOnboardingPath('new'));
  assert.equal(onboardingLib.onboardingStep(await row(), false), 'title', 'a refresh resumes at the title');
  const p = ok(await onboarding.createOnboardingProject('  The Glass Orchard '));
  assert.equal(p.title, 'The Glass Orchard');
  assert.equal(onboardingLib.onboardingStep(await row(), true), 'model', 'a refresh after the Project resumes at the mental model');

  const structure = await all(db, `select c.title as chapter, s.title as scene, s.word_count, s.content, s.id
    from public.manuscripts m join public.chapters c on c.manuscript_id = m.id join public.scenes s on s.chapter_id = c.id
    where m.project_id = $1`, [p.projectId]);
  assert.equal(structure.length, 1);
  assert.deepEqual({ ...structure[0], id: undefined }, { chapter: 'Chapter 1', scene: 'Scene 1', word_count: 0, content: null, id: undefined });
  for (const t of ['manuscript_groups', 'workspace_documents', 'workspace_collections', 'workspace_canvases']) {
    assert.equal((await one(db, `select count(*)::int as n from public.${t} where ${t === 'manuscript_groups' ? 'manuscript_id in (select id from public.manuscripts where project_id = $1)' : 'project_id = $1'}`, [p.projectId])).n, 0,
      `no ${t}: no templates, nothing but the manuscript`);
  }

  const done = ok(await onboarding.completeOnboarding());
  assert.equal(done.href, `/projects/${p.projectId}?open=${structure[0].id}`, 'arrival opens Chapter 1\'s first Scene, ready for writing');
  assert.equal(onboardingLib.needsOnboarding(await row(), { projectsEver: 1, hasWritten: false }), false);
  ok(await onboarding.completeOnboarding());

  assert.deepEqual(events().map((e) => e.eventName), ['onboarding_path_new', 'project_created', 'onboarding_completed'],
    'path, Project and completion — each once');
  assert.deepEqual(events().find((e) => e.eventName === 'onboarding_completed').metadata, { path: 'new' });
  assert.ok(!JSON.stringify(events()).includes('Glass Orchard'), 'no title in analytics');
});

test('onboarding, import path: the existing importer makes the Project, the journey records it, arrival opens the Manuscript', async () => {
  const db = await freshDb();
  await createAuthUser(db, W(11));
  signIn(W(11), db);
  clearEvents();
  ok(await onboarding.beginOnboarding());
  ok(await onboarding.chooseOnboardingPath('import'));
  assert.equal(onboardingLib.onboardingStep(onboardingLib.readOnboardingRow(await one(db, `select * from public.account_onboarding where user_id = $1`, [W(11)])), false), 'import');

  const res = await postImport({ payload: IMPORT_PAYLOAD, requestId: W(901), onboarding: true });
  assert.equal(res.status, 200);
  const { projectId } = await res.json();
  assert.equal((await one(db, `select project_id from public.account_onboarding where user_id = $1`, [W(11)])).project_id, projectId,
    'attached in the same request: a refresh resumes after the import, never offering a second');
  assert.equal(await projectCount(db, W(11)), 1, 'no blank Project was made first');

  // Choosing "new" afterwards cannot replace the journey's Project.
  ok(await onboarding.chooseOnboardingPath('new'));
  assert.equal((await one(db, `select path from public.account_onboarding where user_id = $1`, [W(11)])).path, 'import');
  assert.equal(ok(await onboarding.createOnboardingProject('Imported Book')).projectId, projectId);
  assert.equal(await projectCount(db, W(11)), 1);

  assert.equal(ok(await onboarding.completeOnboarding()).href, `/projects/${projectId}`);
  assert.deepEqual(events().map((e) => e.eventName), ['onboarding_path_import', 'onboarding_completed']);
});

test('onboarding: a failed import changes nothing and the journey stays where it was', async () => {
  const db = await freshDb();
  await createAuthUser(db, W(12));
  signIn(W(12), db);
  ok(await onboarding.chooseOnboardingPath('import'));
  const res = await postImport({ payload: { title: 'Broken', items: 'nope', unplaced: [] }, requestId: W(902), onboarding: true });
  assert.notEqual(res.status, 200);
  assert.equal(await projectCount(db, W(12)), 0);
  assert.equal((await one(db, `select project_id from public.account_onboarding where user_id = $1`, [W(12)])).project_id, null);
});

test('onboarding: refreshes, retries and double clicks make one Project; another writer\'s Project cannot be attached', async () => {
  const db = await freshDb();
  await createAuthUser(db, W(13));
  await createAuthUser(db, W(14));
  signIn(W(13), db);
  const results = await Promise.all([1, 2, 3].map(() => onboarding.createOnboardingProject('Once')));
  const ids = new Set(results.map((r) => ok(r).projectId));
  assert.equal(ids.size, 1);
  assert.equal(await projectCount(db, W(13)), 1);

  const theirs = ok(await createProject(db, W(14), 'Theirs')).project.id;
  const attach = await as(db, W(13)).rpc('onboarding_attach_project', { p_project: theirs });
  assert.ok(attach.error, 'only the writer\'s own Project');
});

test('onboarding is account-level: completion is once, a completed account skips it, and later Projects never replay it', async () => {
  const db = await freshDb();
  await createAuthUser(db, W(15));
  signIn(W(15), db);
  ok(await onboarding.createOnboardingProject('First'));
  ok(await onboarding.completeOnboarding());
  const completedAt = (await one(db, `select completed_at::text from public.account_onboarding where user_id = $1`, [W(15)])).completed_at;
  ok(await projects.createProject('Second'));
  ok(await onboarding.completeOnboarding());
  const row = onboardingLib.readOnboardingRow(await one(db, `select path, project_id, completed_at from public.account_onboarding where user_id = $1`, [W(15)]));
  assert.equal(row.completed_at !== null, true);
  assert.equal((await one(db, `select completed_at::text from public.account_onboarding where user_id = $1`, [W(15)])).completed_at, completedAt, 'unchanged');
  assert.equal(onboardingLib.needsOnboarding(row, { projectsEver: 0, hasWritten: false }), false, 'even with every Project deleted');
  // A writer from before onboarding existed (no record, with Projects or words) is never sent there.
  assert.equal(onboardingLib.needsOnboarding(null, { projectsEver: 2, hasWritten: false }), false);
  assert.equal(onboardingLib.needsOnboarding(null, { projectsEver: 0, hasWritten: true }), false);
  // An unfinished journey resumes, whatever else the account has.
  assert.equal(onboardingLib.needsOnboarding({ path: 'new', project_id: null, completed_at: null }, { projectsEver: 3, hasWritten: true }), true);
  const projectsPage = code('src/app/(rune2)/projects/(home)/page.tsx');
  assert.match(projectsPage, /needsOnboarding\(readOnboardingRow\(onboarding\)/);
  assert.match(code('src/app/(rune2)/onboarding/page.tsx'), /if \(!needsOnboarding\([\s\S]*?\)\) \{\s*redirect\("\/projects"\)/);
  assert.doesNotMatch(code('src/components/rune2/ProjectsHome.tsx'), /onboarding/i, 'New Project and Import never route through onboarding');
});

test('onboarding\'s appearance choice persists on the account through the existing theme preference', async () => {
  const db = await freshDb();
  await createAuthUser(db, W(16));
  signIn(W(16), db);
  await db.query(`update public.profiles set preferences = '{"rune2Hints":["collection"]}' where id = $1`, [W(16)]);
  ok(await settings.updateRunePreferences({ appearance: 'candlelight' }));
  const prefs = (await one(db, `select preferences from public.profiles where id = $1`, [W(16)])).preferences;
  assert.equal(prefs.rune2Appearance, 'candlelight');
  assert.deepEqual(prefs.rune2Hints, ['collection'], 'nothing else is disturbed');
  const ui = code('src/components/rune2/Onboarding.tsx');
  assert.match(ui, /update\(\{ appearance: id \}\)/, 'the BC-C preference, not a second theme system');
  assert.match(ui, /\["light", "candlelight", "dark"\]/);
  assert.doesNotMatch(ui, /accent:|writingSurface:|editorFont:/, 'no other appearance controls');
});

test('onboarding copy: the authorship promise, the mental model, and no feature tour or retired journey', () => {
  const ui = read('src/components/rune2/Onboarding.tsx');
  for (const line of [
    'Your story has a place now.',
    'Sutura keeps your manuscript at the center, with a workspace that can grow around it only when you need it.',
    'Your words remain your own.',
    'Sutura will never use AI to write, rewrite, or complete your story.',
    'How are you starting?', 'Start something new', 'Begin with a clean manuscript.', 'Bring in a manuscript', 'Import your existing writing.',
    'What are you working on?', 'You can change this anytime.',
    'Write here. Build around it only when you need to.', 'You never need to build a system just to start writing.',
    'Make the desk yours.', 'Your desk is ready.',
  ]) assert.ok(ui.includes(line), line);
  assert.doesNotMatch(code('src/components/rune2/Onboarding.tsx'), /first sentence|future|letter|tutorial|genre|synopsis|deadline|word count|Propert|Relationship|Base\b/i);
  for (const gone of ['src/app/onboarding', 'src/app/api/onboarding', 'src/components/LandingPage.tsx']) {
    assert.ok(!fs.existsSync(path.join(REPO_DIR, gone)), `${gone} is retired`);
  }
  assert.ok(fs.existsSync(path.join(REPO_DIR, 'src/app/(rune2)/onboarding/page.tsx')));
});

// ── 3. Contextual teaching ────────────────────────────────────────────────────

test('one-time hints: seen once per account, recorded idempotently, unknown ids refused, other preferences kept', async () => {
  const db = await freshDb();
  await createAuthUser(db, W(20));
  signIn(W(20), db);
  await db.query(`update public.profiles set preferences = '{"rune2Appearance":"dark"}' where id = $1`, [W(20)]);
  assert.deepEqual(hints.readSeenHints(null), []);
  assert.deepEqual(hints.readSeenHints({ rune2Hints: ['collection', 'nope', 'collection', 4] }), ['collection']);

  ok({ data: true, ...(await settings.markHintSeen('collection')) });
  ok({ data: true, ...(await settings.markHintSeen('collection')) });
  ok({ data: true, ...(await settings.markHintSeen('timeline')) });
  assert.equal((await settings.markHintSeen('tour')).error, 'Unknown hint.');
  const prefs = (await one(db, `select preferences from public.profiles where id = $1`, [W(20)])).preferences;
  assert.deepEqual(prefs, { rune2Appearance: 'dark', rune2Hints: ['collection', 'timeline'] });

  const hint = code('src/components/rune2/Hint.tsx');
  assert.match(hint, /api\.seen\.has/, 'a seen hint never renders');
  assert.doesNotMatch(hint, /aria-modal|r2-dialog-backdrop|role="dialog"/, 'a hint is never modal');
  assert.match(code('src/app/(rune2)/layout.tsx'), /<HintsProvider initial=\{profile\?\.preferences \?\? null\}>/, 'seeded from the server: no flash');
  assert.match(code('src/components/rune2/CollectionView.tsx'), /<OneTimeHint id=/);
});

test('first-use empty states teach the Workspace, Pages, Canvas and Revision Notes; no global tour exists', () => {
  const nav = read('src/components/rune2/ProjectNavigator.tsx');
  assert.match(nav, /Build only what the book asks for/);
  assert.match(nav, /onClick=\{\(\) => addPage\(\)\}[\s\S]{0,80}Page/);
  assert.match(nav, /onClick=\{\(\) => addCollection\(\)\}[\s\S]{0,80}Collection/);
  assert.match(nav, /onClick=\{\(\) => addCanvas\(\)\}[\s\S]{0,80}Canvas/);
  assert.match(read('src/components/rune2/WorkspacePageEditor.tsx'), /type \/ for/);
  const canvas = read('src/components/rune2/CanvasSurface.tsx');
  assert.match(canvas, /Double-click empty space for a note/);
  assert.match(canvas, /never changes your manuscript’s order/);
  assert.match(read('src/components/rune2/RevisionNotes.tsx'), /Leave yourself one for the next pass/);
  const rune2 = fs.readdirSync(path.join(REPO_DIR, 'src/components/rune2'));
  assert.ok(!rune2.some((f) => /tour|tutorial|walkthrough/i.test(f)), 'no tour component');
});

// ── 4. Feedback ───────────────────────────────────────────────────────────────

test('feedback: the writer\'s text, an optional category and safe context — nothing authored, nothing extra', async () => {
  const db = await freshDb();
  await createAuthUser(db, W(30));
  signIn(W(30), db);
  clearEvents();
  const project = W(31);
  ok({ data: true, ...(await beta.submitFeedback({
    body: '  The import preview confused me.  ',
    category: 'confusing',
    context: {
      route: `/projects/${project}?q=the+murder+of+Lord+Ashby#scene`,
      surface: 'scene',
      projectId: project,
      device: 'desktop',
      browser: 'Firefox',
      viewport: '1440x900',
      sceneText: 'It was a dark and stormy night.',
      search: 'Lord Ashby',
      title: 'My Secret Novel',
    },
  })) });
  const row = await one(db, `select user_id, category, body, context from public.beta_feedback`);
  assert.equal(row.user_id, W(30));
  assert.equal(row.category, 'confusing');
  assert.equal(row.body, 'The import preview confused me.');
  assert.deepEqual(Object.keys(row.context).sort(), ['browser', 'build', 'device', 'projectId', 'route', 'surface', 'viewport']);
  assert.equal(row.context.route, `/projects/${project}`, 'no query string or fragment');
  assert.ok(!JSON.stringify(row.context).match(/Ashby|stormy|Secret/), 'no authored content in the context');
  assert.deepEqual(events().map((e) => [e.eventName, e.metadata]), [['feedback_submitted', { category: 'confusing', surface: 'scene' }]]);

  ok({ data: true, ...(await beta.submitFeedback({ body: 'Idea', category: 'made-up', context: { route: '/projects/My Novel Title/x', surface: 'galaxy', browser: 'Mozilla/5.0 (secret)' } })) });
  const second = await one(db, `select category, context from public.beta_feedback where body = 'Idea'`);
  assert.equal(second.category, null);
  assert.equal(second.context.route, '/projects/…/x', 'a typed path segment is not kept');
  assert.equal(second.context.surface, null);
  assert.equal(second.context.browser, null);

  assert.equal((await beta.submitFeedback({ body: '   ' })).error, 'Write a few words first.');
  signIn(null, db);
  assert.match((await beta.submitFeedback({ body: 'hello' })).error, /signed out/);
  const ui = code('src/components/rune2/Feedback.tsx');
  assert.doesNotMatch(ui, /editor|getHTML|getText|useRune2Selection|scene\.content|innerText|textContent|localStorage/,
    'the dialog reads nothing from the product\'s content');
  assert.match(code('src/components/rune2/AccountMenu.tsx'), /label: "Send feedback"[^}]*section: "Sutura beta"/, 'in the account menu, under a quiet Beta label');
});

test('feedback: a writer cannot insert as someone else, and cannot read anyone\'s', async () => {
  const db = await freshDb();
  await createAuthUser(db, W(32));
  await createAuthUser(db, W(33));
  const sb = as(db, W(32));
  assert.ok((await sb.from('beta_feedback').insert({ user_id: W(33), body: 'forged' })).error);
  await asUser(db, W(32), (tx) => tx.query(`insert into public.beta_feedback (user_id, body) values ($1, 'mine')`, [W(32)]));
  assert.ok((await sb.from('beta_feedback').select('body')).error, 'not readable, even one\'s own');
});

test('the operator: an admin sees waitlist, approval and activation (no content) and approves an email; nobody else can', async () => {
  const db = await freshDb();
  await createAuthUser(db, W(40), { display_name: 'Founder' });
  await db.query(`update public.profiles set is_admin = true where id = $1`, [W(40)]);
  await account(db, 41, 'reader@example.com');
  globalThis.__runeServiceClient = createSupabaseAdapter(db, { role: 'service_role' });

  signIn(null, db);
  ok(await beta.joinBetaWaitlist({ email: 'reader@example.com', writes: 'Gothic' }));
  ok(await beta.joinBetaWaitlist({ email: 'later@example.com' }));

  signIn(W(41), db);
  assert.equal((await beta.approveBetaEmail('reader@example.com')).error, 'Not authorized');
  assert.equal((await beta.getBetaOverview()).error, 'Not authorized');

  signIn(W(40), db);
  ok({ data: true, ...(await beta.approveBetaEmail(' Reader@Example.com ')) });
  ok({ data: true, ...(await beta.approveBetaEmail('reader@example.com')) });
  assert.equal((await beta.approveBetaEmail('nope')).error, 'That isn’t an email address.');
  let people = ok(await beta.getBetaOverview()).people;
  const reader = people.find((p) => p.email === 'reader@example.com');
  assert.ok(reader.waitlistedAt && reader.approvedAt && reader.acceptedAt === null);
  assert.equal(reader.writes, 'Gothic');
  assert.equal(people.find((p) => p.email === 'later@example.com').approvedAt, null);

  // The approved writer arrives: accepted, and the operator sees it.
  signIn(W(41), db);
  assert.equal(await betaAccess.claimBetaAccess(as(db, W(41)), W(41)), 'accepted');
  signIn(W(40), db);
  people = ok(await beta.getBetaOverview()).people;
  assert.ok(people.find((p) => p.email === 'reader@example.com').acceptedAt);
  assert.deepEqual(Object.keys(people[0]).sort(), ['acceptedAt', 'approvedAt', 'email', 'name', 'waitlistedAt', 'writes'], 'nothing about their writing');
  assert.match(code('src/app/(app)/pulse/page.tsx'), /<ClosedBeta initial=/, 'in Pulse, which is admin-gated');
  globalThis.__runeServiceClient = null;
});

// ── 5. No monetization in the closed beta ─────────────────────────────────────

test('nothing user-facing can start a checkout or a plan change; Stripe is never reached', async () => {
  const db = await freshDb();
  await createAuthUser(db, W(50));
  signIn(W(50), db);
  globalThis.__stripeUses.length = 0;
  assert.equal(betaLib.BILLING_OPEN, false);
  assert.match((await billing.createCheckoutSession('scribe', 'monthly')).error, /free during the closed beta/);
  assert.equal((await billing.startScribeCheckoutForCurrentUser('monthly', 'landing_purchase_intent')).status, 'error');
  assert.match((await billing.changeScribeBillingInterval('annual')).error, /free during the closed beta/);
  assert.match((await pricing.createFoundingCheckoutSession()).error, /free during the closed beta/);
  const res = await checkoutRoute.GET(new Request('http://localhost/api/billing/checkout?plan=scribe&billing=monthly'));
  assert.equal(res.status, 307);
  assert.equal(new URL(res.headers.get('location')).pathname, '/projects');
  assert.deepEqual(globalThis.__stripeUses, [], 'Stripe never used');

  assert.match(code('src/app/api/intent/scribe/route.ts'), /if \(!BILLING_OPEN\) \{[\s\S]*?redirect\(`\$\{origin\}\/`\)/);
  assert.match(code('src/app/auth/continue/route.ts'), /BILLING_OPEN \? parsePurchaseIntent/);
  assert.match(code('src/app/auth/callback/route.ts'), /BILLING_OPEN && parsePurchaseIntent/);

  const surfaces = (dir) => {
    const out = [];
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.tsx$/.test(e.name)) out.push(p); } };
    walk(path.join(REPO_DIR, 'src', dir));
    return out;
  };
  const ui = [...surfaces('app'), ...surfaces('components')].filter((f) => !f.includes(`${path.sep}pulse`) && !f.includes('(legal)'));
  const offenders = ui.filter((f) => /api\/billing|api\/intent\/scribe|createCheckoutSession|createPortalSession|createFoundingCheckoutSession|startScribeCheckout|changeScribeBillingInterval|["'`]\/pricing\b|PricingTable|PricingNotice|\$\d|Scribe|Upgrade/.test(code(path.relative(REPO_DIR, f)))).map((f) => path.relative(REPO_DIR, f));
  assert.deepEqual(offenders, [], 'no page or component offers a purchase, plan or price');
});

test('no closed-beta feature gating: an accepted writer creates every kind of object, with no word limit', async () => {
  const db = await freshDb();
  await createAuthUser(db, W(51));
  const sb = as(db, W(51));
  const pid = ok(await createProject(db, W(51))).project.id;
  for (const [fn, args] of [
    ['create_workspace_document', { p_project_id: pid, p_parent_node_id: null, p_title: 'Notes' }],
    ['create_workspace_collection', { p_project_id: pid, p_parent_node_id: null, p_title: 'Characters' }],
    ['create_workspace_canvas', { p_project_id: pid, p_parent_node_id: null, p_title: 'Map' }],
  ]) {
    const r = await sb.rpc(fn, args);
    assert.equal(r.error, null, `${fn}: ${r.error?.message}`);
    assert.equal(r.data.status, 'ok', fn);
  }
  assert.equal((await sb.rpc('free_word_limit_for_caller')).data, null, 'no word limit (037)');
});
