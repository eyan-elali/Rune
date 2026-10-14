// Early Access (migration 056; formerly the closed beta, 052) and Rune 2.0 onboarding (Beta Completion E):
// the REAL actions, route handlers and pure modules against the Rune 2.0
// schema in real Postgres + RLS, analytics recorded by a mock (never sent),
// Stripe replaced by a trap that fails any use.
//
//   * access: any account with a profile owns Projects by every creation
//     path, with no approval written for it; the profile still comes first;
//     a closed-beta writer is unaffected and their acceptance cannot be
//     undone by editing the list; 052 accepted every account that existed;
//     056 changes no row and opens the optional Auth hook; the app has no
//     access check, no waitlist and no invitation language left
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

let beta, onboarding, onboardingLib, betaLib, hints, settings, importRoute, projects, billing, pricing, checkoutRoute;
before(async () => {
  const b = (entry, name) => bundleForTest(entry, { name, aliases: MOCKS });
  beta = await b('src/lib/actions/beta.ts', 'cb_beta');
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
  for (const mod of [beta, onboarding, settings, importRoute, projects, billing, pricing, checkoutRoute]) mod.setServerClient(sb);
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

// ── 1. Access (Early Access, migration 056) ──────────────────────────────────

test('Early Access: a brand-new, unapproved account owns Projects by every creation path, and nothing is approved on its behalf', async () => {
  const db = await freshDb();
  await account(db, 2, 'stranger@example.com');
  const sb = signIn(W(2), db);

  assert.equal(ok(await createProject(db, W(2))).status, 'ok', 'create_project_checked');
  assert.equal((await projects.createProject('A second book')).error, null, 'the Projects home');
  const imported = await postImport({ payload: IMPORT_PAYLOAD, requestId: W(900) });
  assert.equal(imported.status, 200, 'Manuscript Import');
  assert.equal(await projectCount(db, W(2)), 3);

  // The onboarding path, for another new account.
  await account(db, 3, 'eager@example.com');
  signIn(W(3), db);
  ok(await onboarding.beginOnboarding());
  ok(await onboarding.chooseOnboardingPath('new'));
  const viaOnboarding = ok(await onboarding.createOnboardingProject('A book'));
  assert.ok(viaOnboarding.projectId, 'onboarding makes the Project');
  assert.equal(await projectCount(db, W(3)), 1);

  assert.equal((await one(db, `select count(*)::int as n from public.beta_access`)).n, 0, 'no approval is needed or written');
  assert.equal((await sb.rpc('claim_beta_access')).data, 'none', 'the closed-beta record still reads honestly, and decides nothing');
});

test('Early Access keeps the profile first: an account without a profile is still refused a Project, with the plain message', async () => {
  const db = await freshDb();
  await account(db, 12, 'noprofile@example.com');
  await db.query(`delete from public.user_pricing_entitlements where user_id = $1`, [W(12)]);
  await db.query(`delete from public.profiles where id = $1`, [W(12)]);
  assert.match((await createProject(db, W(12))).error?.message ?? '', /Choose your pen name before creating a project\./);
  assert.equal(await projectCount(db, W(12)), 0);
});

test('a closed-beta writer is unaffected: their acceptance stays recorded and they keep creating Projects', async () => {
  const db = await freshDb();
  await db.query(`insert into public.beta_access (email) values ('writer@example.com')`);
  await account(db, 1, '  Writer@Example.com ');
  assert.equal((await as(db, W(1)).rpc('claim_beta_access')).data, 'accepted', 'the record can still be completed');
  assert.equal((await as(db, W(1)).rpc('claim_beta_access')).data, 'member');
  const row = await one(db, `select user_id, accepted_at is not null as accepted from public.beta_access where email = 'writer@example.com'`);
  assert.deepEqual(row, { user_id: W(1), accepted: true });
  assert.equal(ok(await createProject(db, W(1))).status, 'ok');
});

test('the app no longer gates on beta access: the (rune2) layout has no access check; the front door offers Start writing free and Sign in', () => {
  const layout = code('src/app/(rune2)/layout.tsx');
  assert.doesNotMatch(layout, /claimBetaAccess|hasBetaAccess|claim_beta_access|redirect\("\/"\)/);
  assert.match(layout, /if \(!user\) redirect\("\/login"\)/, 'signed out is still sent to sign in');
  assert.match(layout, /if \(needsProfileCompletion\(profileState\)\) redirect\(COMPLETE_PROFILE_PATH\)/, 'the profile still comes first');
  assert.equal(fs.existsSync(path.join(REPO_DIR, 'src/lib/betaAccess.ts')), false);
  assert.equal(fs.existsSync(path.join(REPO_DIR, 'src/components/front/FrontDoor.tsx')), false, 'the waitlist form is gone');
  assert.doesNotMatch(read('src/lib/actions/beta.ts'), /join_beta_waitlist|beta_access"\)\.insert/, 'no public waitlist action, no approval action');

  // The front door (page.tsx composes components/front): one action, "Start writing free",
  // that sends a visitor to Create account; Sign in beside it in the header.
  const hero = read('src/components/front/FrontHero.tsx');
  assert.match(hero, /<Link href=\{startPath\(member\)\} className="r2-button r2-button--primary r2-button--lg" data-cta="hero">\s*Start writing free\s*<\/Link>/);
  // startPath (publicRoutes.ts) is the one rule for where that action goes: Create account, or a member's Projects.
  assert.match(read('src/components/front/publicRoutes.ts'), /export function startPath\(member: boolean\): string \{\s*return member \? PUBLIC_ROUTES\.projects : PUBLIC_ROUTES\.signUp;\s*\}/);
  const header = read('src/components/front/FrontHeader.tsx');
  assert.match(header, /<Link href=\{PUBLIC_ROUTES\.signIn\}[^>]*>\s*Sign in\s*<\/Link>/);
  assert.match(read('src/components/front/publicRoutes.ts'), /signIn: "\/login"/);
  assert.match(header, /Start writing free/);
  for (const f of ['src/app/(front)/page.tsx', 'src/components/front/FrontHero.tsx', 'src/components/front/FrontHeader.tsx']) {
    assert.doesNotMatch(code(f), /beta_access|invite id|permission|denied|unauthori[sz]ed|403|pricing|\$\d/i,
      `${f}: no internal or error-like language, no pricing`);
  }

  // No active surface tells a writer they need an invitation, approval or the waitlist.
  for (const f of [
    'src/app/(front)/page.tsx', 'src/components/front/FrontHero.tsx', 'src/components/front/FrontHeader.tsx', 'src/app/(auth)/signup/SignupClient.tsx', 'src/app/(auth)/signup/page.tsx',
    'src/app/(auth)/login/LoginClient.tsx', 'src/components/rune2/RuneSettings.tsx', 'src/components/rune2/AccountMenu.tsx',
    'src/components/rune2/Feedback.tsx', 'src/lib/actions/onboarding.ts', 'src/app/(legal)/terms/page.tsx',
  ]) {
    assert.doesNotMatch(code(f), /closed beta|invite-only|invited|invitation|join the beta|waitlist/i, f);
  }
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
  assert.equal((await as(db, W(5)).rpc('claim_beta_access')).data, 'accepted');
  await createProject(db, W(5));

  for (const [sql, what] of [
    [`delete from public.beta_access where email = 'kept@example.com'`, 'delete'],
    [`update public.beta_access set user_id = null, accepted_at = null where email = 'kept@example.com'`, 'un-accept'],
    [`update public.beta_access set user_id = '${W(6)}' where email = 'kept@example.com'`, 're-point'],
    [`update public.beta_access set email = 'changed@example.com' where email = 'kept@example.com'`, 'change email'],
  ]) {
    await assert.rejects(db.query(sql), /already accepted the beta/, what);
  }
  assert.equal((await as(db, W(5)).rpc('claim_beta_access')).data, 'member');
  // Unaccepted rows are the operator's to change.
  await db.query(`delete from public.beta_access where email = 'open@example.com'`);

  // The writer's own account deletion releases the row; the email stays approved.
  await db.query(`delete from public.projects where user_id = $1`, [W(5)]);
  await db.query(`delete from auth.users where id = $1`, [W(5)]);
  assert.deepEqual(await one(db, `select user_id, accepted_at from public.beta_access where email = 'kept@example.com'`), { user_id: null, accepted_at: null });
});

test('an admin creates Projects and is not recorded as a beta member', async () => {
  const db = await freshDb();
  await account(db, 7, 'founder@example.com');
  await db.query(`update public.profiles set is_admin = true where id = $1`, [W(7)]);
  assert.equal((await as(db, W(7)).rpc('claim_beta_access')).data, 'admin');
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

test('migration 056 opens Project creation without touching a row of the closed beta, and applies once', async () => {
  const db = await createTestDb();
  await db.exec(readRepoFile(LEGACY_BASELINE));
  for (const f of migrationsAfterBaseline().filter((f) => f < '056')) await db.exec(readMigration(f));
  await db.query(`insert into public.beta_access (email) values ('invited@example.com')`);
  await db.query(`insert into public.beta_waitlist (email, name) values ('hopeful@example.com', 'Hope')`);
  await createAuthUser(db, W(10), {}, { beta: false, email: 'late@example.com' });
  assert.match((await createProject(db, W(10))).error?.message ?? '', /closed beta/, 'before 056: refused');
  const snapshot = async () => all(db, `select (select json_agg(b order by email) from public.beta_access b) as a, (select json_agg(w order by email) from public.beta_waitlist w) as w`);
  const before = await snapshot();

  await db.exec(readMigration('056_open_early_access.sql'));
  assert.equal(ok(await createProject(db, W(10))).status, 'ok', 'after 056: any account with a profile');
  assert.deepEqual(await snapshot(), before, 'approvals and the waitlist kept exactly');
  assert.deepEqual((await one(db, `select public.beta_before_user_created($1::jsonb) as r`, [JSON.stringify({ user: { email: 'anyone@example.com' } })])).r, {},
    'the optional Auth hook, if enabled by hand, refuses no one');
  await assert.rejects(db.exec(readMigration('056_open_early_access.sql')), /already been applied/);
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

  const done = ok(await onboarding.completeOnboarding('desktop'));
  assert.equal(done.href, `/projects/${p.projectId}?open=${structure[0].id}`, 'arrival opens Chapter 1\'s first Scene, ready for writing');
  assert.equal(onboardingLib.needsOnboarding(await row(), { projectsEver: 1, hasWritten: false }), false);
  ok(await onboarding.completeOnboarding());

  assert.deepEqual(events().map((e) => e.eventName), ['onboarding_path_new', 'project_created', 'onboarding_completed'],
    'path, Project and completion — each once');
  assert.deepEqual(events().find((e) => e.eventName === 'onboarding_completed').metadata, { path: 'new', device: 'desktop' },
    'the coarse device class only (lib/launchMetrics.ts)');
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
  assert.match(code('src/components/rune2/AccountMenu.tsx'), /label: "Send feedback"[^}]*section: "Early Access"/, 'in the account menu, under a quiet Early Access label');
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

test('the operator: an admin sees the closed beta\'s history (no content), read-only; nobody else can', async () => {
  const db = await freshDb();
  await createAuthUser(db, W(40), { display_name: 'Founder' });
  await db.query(`update public.profiles set is_admin = true where id = $1`, [W(40)]);
  await account(db, 41, 'reader@example.com');
  globalThis.__runeServiceClient = createSupabaseAdapter(db, { role: 'service_role' });
  // History from the closed beta: a waitlisted address that was approved and accepted, and one still waiting.
  await db.query(`insert into public.beta_waitlist (email, writes) values ('reader@example.com', 'Gothic'), ('later@example.com', null)`);
  await db.query(`insert into public.beta_access (email) values ('reader@example.com')`);
  assert.equal((await as(db, W(41)).rpc('claim_beta_access')).data, 'accepted');

  signIn(W(41), db);
  assert.equal((await beta.getBetaOverview()).error, 'Not authorized');

  signIn(W(40), db);
  const people = ok(await beta.getBetaOverview()).people;
  const reader = people.find((p) => p.email === 'reader@example.com');
  assert.ok(reader.waitlistedAt && reader.approvedAt && reader.acceptedAt);
  assert.equal(reader.writes, 'Gothic');
  assert.equal(people.find((p) => p.email === 'later@example.com').approvedAt, null);
  assert.deepEqual(Object.keys(people[0]).sort(), ['acceptedAt', 'approvedAt', 'email', 'name', 'waitlistedAt', 'writes'], 'nothing about their writing');
  assert.equal('approveBetaEmail' in beta, false, 'approval is no longer a thing to do');
  assert.match(code('src/app/(app)/pulse/page.tsx'), /<ClosedBeta initial=/, 'in Pulse, which is admin-gated');
  globalThis.__runeServiceClient = null;
});

// ── 5. No monetization in Early Access ─────────────────────────────────────

test('nothing user-facing can start a checkout or a plan change; Stripe is never reached', async () => {
  const db = await freshDb();
  await createAuthUser(db, W(50));
  signIn(W(50), db);
  globalThis.__stripeUses.length = 0;
  assert.equal(betaLib.BILLING_OPEN, false);
  assert.match((await billing.createCheckoutSession('scribe', 'monthly')).error, /free during Early Access/);
  assert.equal((await billing.startScribeCheckoutForCurrentUser('monthly', 'landing_purchase_intent')).status, 'error');
  assert.match((await billing.changeScribeBillingInterval('annual')).error, /free during Early Access/);
  assert.match((await pricing.createFoundingCheckoutSession()).error, /free during Early Access/);
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

// ── 7. The production failure of 2026-10-12: the app ahead of the database ──

test('a database still at 055 refuses a brand-new account\'s first onboarding Project (closed-beta trigger), creates nothing, logs the cause, and the same request succeeds once 056 is applied', async () => {
  const db = await createTestDb();
  await db.exec(readRepoFile(LEGACY_BASELINE));
  for (const f of migrationsAfterBaseline().filter((f) => f < '056')) await db.exec(readMigration(f));
  assert.equal((await one(db, `select max(version) as v from public.schema_migrations`)).v, '055');

  // An external sign-up: auth user → profile (handle_new_user) → no beta_access row.
  await createAuthUser(db, W(70), { display_name: 'A Stranger' }, { beta: false, email: 'stranger@example.com' });
  assert.equal((await one(db, `select count(*)::int as n from public.profiles where id = $1`, [W(70)])).n, 1, 'the profile exists');
  assert.equal((await one(db, `select count(*)::int as n from public.beta_access where user_id = $1`, [W(70)])).n, 0, 'no beta access');
  signIn(W(70), db);
  ok(await onboarding.beginOnboarding());
  ok(await onboarding.chooseOnboardingPath('new'));

  const logged = [];
  const realError = console.error;
  console.error = (...args) => { logged.push(args); };
  let refused;
  try {
    refused = await onboarding.createOnboardingProject('My Secret Title');
  } finally {
    console.error = realError;
  }
  assert.equal(refused.data, null);
  assert.equal(refused.error, 'Your project couldn’t be created. Please try again.', 'the writer sees the plain message');

  // The server log says what refused it — the SQLSTATE and the database's message — and never the title.
  const entries = logged.map((a) => JSON.stringify(a));
  assert.ok(entries.some((e) => e.includes('[projectCreation] create_project_checked failed') && e.includes('"code":"42501"') && /closed beta/.test(e)),
    `create_project_checked's refusal is logged with its SQLSTATE: ${entries.join('\n')}`);
  assert.ok(entries.some((e) => e.includes('[onboarding] project creation refused') && e.includes(W(70))), 'onboarding names the account');
  assert.ok(!entries.some((e) => e.includes('My Secret Title')), 'the title is never logged');

  // Nothing partial: no Project, Manuscript, Chapter or Scene; the journey resumes at the title.
  assert.equal(await projectCount(db, W(70)), 0);
  assert.equal((await one(db, `select count(*)::int as n from public.manuscripts`)).n, 0);
  assert.equal((await one(db, `select count(*)::int as n from public.chapters`)).n, 0);
  assert.equal((await one(db, `select count(*)::int as n from public.scenes`)).n, 0);
  const row = await one(db, `select path, project_id, request_id, completed_at from public.account_onboarding where user_id = $1`, [W(70)]);
  assert.equal(row.path, 'new');
  assert.equal(row.project_id, null);
  assert.equal(onboardingLib.onboardingStep(onboardingLib.readOnboardingRow(row), false), 'title');

  // A closed-beta writer on the same database is unaffected.
  await createAuthUser(db, W(71), {}, { email: 'member@example.com' });
  signIn(W(71), db);
  ok(await onboarding.beginOnboarding());
  ok(await onboarding.chooseOnboardingPath('new'));
  assert.ok(ok(await onboarding.createOnboardingProject('A member\'s book')).projectId);

  // The fix is the migration: the stranger retries (same request_id) and gets exactly one Project.
  await db.exec(readMigration('056_open_early_access.sql'));
  signIn(W(70), db);
  const made = ok(await onboarding.createOnboardingProject('My Secret Title'));
  assert.ok(made.projectId);
  const again = ok(await onboarding.createOnboardingProject('My Secret Title'));
  assert.equal(again.projectId, made.projectId, 'a second submit is the same Project');
  assert.equal(await projectCount(db, W(70)), 1);
  assert.equal((await one(db, `select creation_request_id as r from public.projects where id = $1`, [made.projectId])).r, row.request_id);
  assert.equal((await one(db, `select count(*)::int as n from public.scenes s join public.manuscripts m on m.id = s.manuscript_id where m.project_id = $1`, [made.projectId])).n, 1, 'Chapter 1, Scene 1');
  const done = ok(await onboarding.completeOnboarding());
  assert.match(done.href, new RegExp(`^/projects/${made.projectId}\\?open=`));
});
