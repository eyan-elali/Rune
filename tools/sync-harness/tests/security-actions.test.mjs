// Pre-beta security audit (server actions, auth routes, Pulse): the REAL
// server actions and the real auth callback against the Rune 2.0 schema in
// real Postgres + RLS, driven as an attacker who holds only their own
// session (or none), so a regression in any action's authorization is a
// failing test rather than a leak.
//
//   * cross-account: a second writer's session cannot read, rename, save,
//     trash, delete, or annotate another writer's Project, Scene or Page by
//     any action, nor read their writing history, goals, games, unlocks or
//     XP; signed out, nothing answers
//   * admin: every Pulse action and the beta operator's actions refuse a
//     non-admin, service-role client or not; forged parameters grant neither
//     admin nor beta state; no Pulse read selects prose
//   * auth: the callback's `next` can only name a path of this app (the
//     sanitizer, unit-tested, then the real route); a link cannot forge a
//     destination past the profile gate; an unapproved email claims nothing
//   * actions reachable from the browser: a module that writes for a
//     client-named user id must not be a "use server" module
//
// Raw-SQL RLS and RPC contracts live in security-rls / security-rpc; this file
// goes through the application's own entry points.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createTestDb, readRepoFile, createAuthUser, REPO_DIR, HARNESS_DIR, RUNE2_SCHEMA } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';
import { NextRequest } from '../mocks/nextServer.js';

const W = (n) => `5ec00000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const all = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const as = (db, userId) => createSupabaseAdapter(db, userId ? { userId } : {});
const read = (f) => fs.readFileSync(path.join(REPO_DIR, f), 'utf8');
/** Source without comments: what the code does, not what it explains. */
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const MOCKS = {
  '@/lib/actions/analytics': path.join(HARNESS_DIR, 'mocks/analyticsRecorder.js'),
  '@/lib/supabase/service': path.join(HARNESS_DIR, 'mocks/serviceClient.js'),
  '@/lib/stripe/client': path.join(HARNESS_DIR, 'mocks/stripeTrap.js'),
  '@/lib/attachments/storage': path.join(HARNESS_DIR, 'mocks/attachmentStorage.js'),
  '@supabase/ssr': path.join(HARNESS_DIR, 'mocks/supabaseSsr.js'),
};

let scenes, projects, pages, notes, stats, xp, games, settings, unlockables, pulse, beta, betaAccess, callback, authRedirect;
const mods = () => [scenes, projects, pages, notes, stats, xp, games, settings, unlockables, pulse, beta, betaAccess, callback];
before(async () => {
  const b = (entry, name) => bundleForTest(entry, { name, aliases: MOCKS });
  scenes = await b('src/lib/actions/scenes.ts', 'sec_scenes');
  projects = await b('src/lib/actions/projects.ts', 'sec_projects');
  pages = await b('src/lib/actions/workspacePages.ts', 'sec_pages');
  notes = await b('src/lib/actions/revisionNotes.ts', 'sec_notes');
  stats = await b('src/lib/actions/writingStats.ts', 'sec_stats');
  xp = await b('src/lib/actions/xp.ts', 'sec_xp');
  games = await b('src/lib/actions/games.ts', 'sec_games');
  settings = await b('src/lib/actions/settings.ts', 'sec_settings');
  unlockables = await b('src/lib/actions/unlockables.ts', 'sec_unlockables');
  pulse = await b('src/lib/actions/pulse.ts', 'sec_pulse');
  beta = await b('src/lib/actions/beta.ts', 'sec_beta');
  betaAccess = await b('src/lib/betaAccess.ts', 'sec_betaAccess');
  callback = await b('src/app/auth/callback/route.ts', 'sec_callback');
  authRedirect = await b('src/lib/authRedirect.ts', 'sec_authRedirect');
});

async function freshDb() {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  return db;
}

/** The signed-in browser of `userId` (none: signed out) for every bundled module. */
function signIn(db, userId) {
  const sb = as(db, userId);
  sb.auth.updateUser = async () => ({ data: {}, error: null });
  for (const mod of mods()) mod.setServerClient(sb);
  globalThis.__ssrClient = sb;
  return sb;
}

const TODAY = new Date().toISOString().slice(0, 10);
const DOC = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });

/** A member's Project with Chapter 1's first Scene, a Workspace Page and a day of writing — the victim's manuscript. */
async function victimManuscript(db, userId) {
  const created = await as(db, userId).rpc('create_project_checked', {
    p_title: 'The Lamp', p_description: null, p_cover_color: null,
    p_first_scene_content: DOC('The lamp was lit.'), p_first_scene_word_count: 4, p_request_id: null,
  });
  assert.equal(created.error, null, created.error?.message);
  assert.equal(created.data.status, 'ok');
  const projectId = created.data.project.id;
  const scene = await one(db, `select s.id, s.version from public.scenes s join public.manuscripts m on m.id = s.manuscript_id where m.project_id = $1`, [projectId]);
  assert.ok(scene, 'the first Scene exists');
  signIn(db, userId);
  const page = await pages.createWorkspacePage(projectId, 'Notes');
  assert.equal(page.error, null, page.error);
  await db.query(`insert into public.writing_sessions (user_id, project_id, session_date, words_added) values ($1, $2, $3, 120)`, [userId, projectId, TODAY]);
  await db.query(`insert into public.writing_goals (user_id, project_id, type, target_words) values ($1, $2, 'project_total', 50000)`, [userId, projectId]);
  await db.query(`insert into public.game_sessions (user_id, mode, words_written, duration_seconds, xp_earned, completed, enemy_type, meta) values ($1, 'battle', 300, 600, 10, true, 'blank-page', '{"outcome":"victory"}')`, [userId]);
  return { projectId, sceneId: scene.id, sceneVersion: scene.version, pageId: page.data.id };
}

const A = W(1); // the victim
const B = W(2); // the attacker: a signed-in beta member with a session of their own

async function twoWriters() {
  const db = await freshDb();
  await createAuthUser(db, A, { display_name: 'Ada Quill' }, { email: 'ada@example.com' });
  await createAuthUser(db, B, { display_name: 'Mal Ory' }, { email: 'mal@example.com' });
  const victim = await victimManuscript(db, A);
  signIn(db, B);
  return { db, ...victim };
}

// ── 1. Cross-account access through the real actions ────────────────────────

test('another writer cannot read, rename, save over, trash or delete a Project, Scene or Page by any action', async () => {
  const { db, projectId, sceneId, sceneVersion, pageId } = await twoWriters();

  // Scenes
  const got = await scenes.getScene(sceneId);
  assert.equal(got.data, null);
  assert.equal(got.error, 'Scene not found', 'the same answer as for a Scene that does not exist');
  assert.equal((await scenes.renameScene(sceneId, 'Stolen')).data, null);
  const saved = await scenes.syncSceneWithLimitCheck(sceneId, DOC('Overwritten.'), 1, sceneVersion);
  assert.notEqual(saved.status, 'ok', `save refused: ${JSON.stringify(saved)}`);
  const unplaced = await scenes.getUnplacedScenes(projectId);
  assert.deepEqual(unplaced.data ?? [], [], 'nothing of the Project is listed');
  assert.equal((await scenes.createUnplacedScene(projectId, 'Planted')).data, null, 'no Scene can be planted in it');
  const scene = await one(db, `select title, content, version from public.scenes where id = $1`, [sceneId]);
  assert.notEqual(scene.title, 'Stolen');
  assert.deepEqual(scene.content, DOC('The lamp was lit.'), 'the prose is untouched');
  assert.equal(scene.version, sceneVersion, 'never bumped');

  // Projects
  assert.equal((await projects.renameProject(projectId, 'Stolen')).data, null);
  assert.equal((await projects.trashProject(projectId)).data, null);
  assert.equal((await projects.restoreProject(projectId)).data, null);
  assert.notEqual((await projects.deleteTrashedProject(projectId)).error, null);
  assert.equal((await projects.duplicateProject(projectId)).data, null);
  assert.equal((await projects.toggleProjectPin(projectId, true)).error ?? 'refused', 'refused', 'pin: no row to change');
  assert.deepEqual(await projects.getProjectStats(projectId), { chapterCount: 0, totalWords: 0 }, 'stats read as empty, never the manuscript');
  assert.deepEqual((await projects.getProjects()).data, [], 'their list holds none of it');
  const project = await one(db, `select title, trashed_at, is_pinned from public.projects where id = $1`, [projectId]);
  assert.equal(project.title, 'The Lamp');
  assert.equal(project.trashed_at, null);
  assert.equal(await one(db, `select count(*)::int as n from public.projects where user_id = $1`, [A]).then((r) => r.n), 1, 'nothing duplicated or deleted');

  // Workspace Pages
  assert.equal((await pages.getWorkspacePage(pageId)).data, null);
  assert.equal((await pages.createWorkspacePage(projectId, 'Planted')).data, null);
  const pageSave = await pages.saveWorkspacePageContent(pageId, DOC('Overwritten.'), 1);
  assert.notEqual(pageSave.status, 'ok');
  assert.equal((await pages.renameWorkspacePage(pageId, 'Stolen')).data, null);
  const page = await one(db, `select title, version from public.workspace_documents where id = $1`, [pageId]);
  assert.equal(page.title, 'Notes');
  assert.equal(page.version, 1);

  // Revision notes
  const note = await notes.createRevisionNote(W(500), 'scene', sceneId, 'A note on someone else’s Scene');
  assert.notEqual(note.status, 'ok');
  assert.deepEqual((await notes.listRevisionNotes(projectId)).data ?? [], []);
  assert.equal((await one(db, `select count(*)::int as n from public.revision_notes`)).n, 0);
});

test('another writer’s writing history, goals, games, unlocks and XP cannot be read or changed by naming their id', async () => {
  const { db } = await twoWriters();

  assert.deepEqual(await stats.getWritingStreak(A, TODAY), { currentStreak: 0, maxStreak: 0 });
  assert.equal(await stats.getTodayWords(A, TODAY), 0);
  // (getGoals embeds projects(title), a select the harness adapter does not model; the table itself answers.)
  assert.deepEqual((await as(db, B).from('writing_goals').select('id').eq('user_id', A)).data, []);
  assert.deepEqual(await stats.getContributionHistory(A), []);
  assert.ok((await stats.getWordsByDay(A, 7)).every((d) => d.words === 0));
  assert.deepEqual(await games.getCombatRecords(A), { 'blank-page': { wins: 0, losses: 0 }, 'writers-block': { wins: 0, losses: 0 }, deadline: { wins: 0, losses: 0 } });
  assert.deepEqual(await games.getPersonalBests(A), {});
  assert.deepEqual(await unlockables.getUserUnlockables(A), []);
  assert.deepEqual(await unlockables.checkAndGrantUnlockables(A), []);

  const award = await xp.awardXp(A, 100000, 'forged');
  assert.equal(award.data, null);
  assert.deepEqual(await one(db, `select xp, level from public.profiles where id = $1`, [A]), { xp: 0, level: 1 });
  assert.equal((await one(db, `select count(*)::int as n from public.xp_events`)).n, 0);

  // The account export is the caller's own, never the other writer's manuscript.
  const exported = await settings.exportUserData();
  assert.equal(exported.error, null);
  assert.deepEqual(exported.data.projects, []);
  assert.deepEqual(exported.data.scenes, []);
  assert.equal(exported.data.user_id, B);

  // The victim still sees everything of their own.
  signIn(db, A);
  assert.deepEqual(await stats.getWritingStreak(A, TODAY), { currentStreak: 1, maxStreak: 1 });
  assert.equal(await stats.getTodayWords(A, TODAY), 120);
  assert.equal((await as(db, A).from('writing_goals').select('id').eq('user_id', A)).data.length, 1);
  assert.equal((await games.getCombatRecords(A))['blank-page'].wins, 1);
});

test('signed out, every state-changing action refuses before touching the database', async () => {
  const { db, projectId, sceneId, sceneVersion, pageId } = await twoWriters();
  signIn(db, null);
  assert.equal((await scenes.getScene(sceneId)).error, 'Not authenticated');
  assert.equal((await scenes.syncSceneWithLimitCheck(sceneId, DOC('x'), 1, sceneVersion)).status, 'error');
  assert.equal((await projects.renameProject(projectId, 'x')).error, 'Not authenticated');
  assert.equal((await projects.deleteTrashedProject(projectId)).error, 'Not authenticated');
  assert.equal((await pages.saveWorkspacePageContent(pageId, DOC('x'), 1)).status, 'error');
  assert.equal((await settings.deleteAccount()).error, 'Not authenticated');
  assert.equal((await settings.exportUserData()).error, 'Not authenticated');
  assert.equal((await stats.createGoal('project_total', 1000, projectId)).error, 'Not authenticated');
  assert.equal((await xp.awardProjectXp(50, { mode: 'project' }, W(600))).error, 'Not authenticated');
  assert.equal((await beta.submitFeedback({ body: 'hello' })).error, 'You’re signed out. Sign in again to send feedback.');
  assert.equal((await one(db, `select count(*)::int as n from public.beta_feedback`)).n, 0);
});

// ── 2. Admin: Pulse and the beta operator ───────────────────────────────────

test('every Pulse action refuses a non-admin on every call, with or without the service role configured', async () => {
  const { db } = await twoWriters();
  // Even with a service-role client at hand (and the key in the environment), the admin check comes first.
  globalThis.__runeServiceClient = createSupabaseAdapter(db, { role: 'service_role' });
  const hadKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'present-for-the-test';
  try {
    const rejects = (p) => assert.rejects(p, /Not authorized/);
    await rejects(pulse.getDailyBrief());
    await rejects(pulse.getHeartbeat('30d', false));
    await rejects(pulse.getActivationFunnel('30d', false));
    await rejects(pulse.getActivationFunnelDrilldownUsers('signup_completed', '30d', false));
    await rejects(pulse.getActivationTrackingStartDate());
    await rejects(pulse.getOnboardingInsights('30d', false));
    await rejects(pulse.getOnboardingDrilldownRows('path', '30d', false));
    await rejects(pulse.getWriterProgress('30d', false));
    await rejects(pulse.getCampaignPerformance('30d', false));
    await rejects(pulse.getCampaignDrilldownUsers('x', '30d', false));
    await rejects(pulse.getDrilldownUsers('reached_100_words', '30d', false));
    await rejects(pulse.searchRecentWriters('ada', 'all', true));
    await rejects(pulse.getUserDrawerData(A));
    await rejects(pulse.listFounderNotes());
    await rejects(pulse.deleteFounderNote(W(700)));
    await rejects(pulse.listExcludedUsers());
    await rejects(pulse.removeExcludedUser(A));
    assert.equal((await pulse.createFounderNote('a note')).error, 'Not authorized');
    assert.equal((await pulse.addExcludedUser(A, 'internal')).error, 'Not authorized');
    assert.equal((await beta.approveBetaEmail('friend@example.com')).error, 'Not authorized');
    assert.equal((await beta.getBetaOverview()).error, 'Not authorized');
    assert.equal((await one(db, `select count(*)::int as n from public.beta_access where email = 'friend@example.com'`)).n, 0);
    assert.equal((await one(db, `select count(*)::int as n from public.founder_notes`)).n, 0);
    assert.equal((await one(db, `select count(*)::int as n from public.analytics_excluded_users`)).n, 0);

    // Signed out: the same.
    signIn(db, null);
    await rejects(pulse.getUserDrawerData(A));
    assert.equal((await beta.approveBetaEmail('friend@example.com')).error, 'Not authorized');
  } finally {
    globalThis.__runeServiceClient = null;
    if (hadKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = hadKey;
  }
});

test('admin and beta state cannot be granted by a forged request: is_admin stays, beta_access is not writable, an unapproved email claims nothing', async () => {
  const { db } = await twoWriters();
  const sb = signIn(db, B);

  // profiles.is_admin: the owner may update their row, and the trigger keeps the flag.
  const flip = await sb.from('profiles').update({ is_admin: true }).eq('id', B);
  assert.equal(flip.error, null, flip.error?.message);
  assert.equal((await one(db, `select is_admin from public.profiles where id = $1`, [B])).is_admin, false);
  assert.equal(await betaAccess.claimBetaAccess(sb, B), 'member', 'and the claim reports a member, not an admin');

  // beta_access: no client policy at all. An account whose email is not approved claims nothing.
  const C = W(3);
  await createAuthUser(db, C, { display_name: 'Carl Nobody' }, { beta: false, email: 'carl@example.com' });
  const sc = signIn(db, C);
  const grant = await sc.from('beta_access').insert({ email: 'carl@example.com' });
  assert.notEqual(grant.error, null, 'insert refused');
  assert.deepEqual(await sc.from('beta_access').select('email').then((r) => r.data ?? []), [], 'nothing of the list is readable');
  assert.equal(await betaAccess.claimBetaAccess(sc, C), 'none');
  assert.equal((await one(db, `select count(*)::int as n from public.beta_access where email = 'carl@example.com'`)).n, 0);

  // Another email's approval is not theirs to claim: claim_beta_access uses
  // the account's own auth.users email, never a parameter.
  await db.query(`insert into public.beta_access (email) values ('friend@example.com')`);
  assert.equal(await betaAccess.claimBetaAccess(sc, C), 'none');
  assert.equal((await one(db, `select user_id from public.beta_access where email = 'friend@example.com'`)).user_id, null);
  assert.equal(code('src/lib/betaAccess.ts').includes('supabase.rpc("claim_beta_access")'), true, 'no argument to forge');
  assert.doesNotMatch(code('src/lib/supabase/schema.sql'), /FUNCTION public\.claim_beta_access\([^)]/, 'claim_beta_access takes no parameters');

  // The waitlist grants nothing either.
  await db.query(`insert into public.beta_waitlist (email) values ('carl@example.com')`);
  assert.equal(await betaAccess.claimBetaAccess(sc, C), 'waitlisted');
  assert.equal((await one(db, `select count(*)::int as n from public.projects where user_id = $1`, [C])).n, 0);
});

test('Pulse is admin-gated at the layout and the page, decides admin from profiles.is_admin, and never selects prose', () => {
  assert.match(code('src/app/(app)/layout.tsx'), /await requireAdmin\(\)/);
  assert.match(code('src/app/(app)/pulse/page.tsx'), /await requireAdmin\(\)/);
  const admin = code('src/lib/actions/admin.ts');
  assert.match(admin, /\.from\("profiles"\)[\s\S]*?\.select\("is_admin"\)[\s\S]*?\.eq\("id", user\.id\)/);
  assert.doesNotMatch(admin, /ADMIN_EMAILS|process\.env/, 'the flag is the database column, not an environment allowlist');
  const pulseSrc = code('src/lib/actions/pulse.ts');
  for (const m of pulseSrc.matchAll(/export async function (\w+)/g)) {
    const body = pulseSrc.slice(m.index, pulseSrc.indexOf('\nexport async function', m.index + 1) === -1 ? undefined : pulseSrc.indexOf('\nexport async function', m.index + 1));
    assert.match(body, /requireAdminService\(\)|getCurrentAdmin\(\)/, `${m[1]} re-checks admin`);
  }
  for (const src of [pulseSrc, code('src/lib/actions/beta.ts')]) {
    assert.doesNotMatch(src, /select\([^)]*\bcontent\b/, 'no Scene, Page or Canvas content is selected');
  }
  assert.doesNotMatch(code('src/lib/actions/beta.ts'), /from\("scenes"\)|from\("workspace_documents"\)/);
});

// ── 3. Auth: the callback's destination ─────────────────────────────────────

test('safeNextPath keeps only a path of this app', () => {
  const { safeNextPath } = authRedirect;
  assert.equal(safeNextPath('/projects'), '/projects');
  assert.equal(safeNextPath('/projects/abc?open=def#x'), '/projects/abc?open=def#x');
  assert.equal(safeNextPath('/onboarding'), '/onboarding');
  for (const bad of [
    '//evil.example', '//evil.example/projects', '/\\evil.example', '\\\\evil.example', '/\\/evil.example',
    'https://evil.example', 'http://evil.example/', 'javascript:alert(1)', 'data:text/html,x',
    '@evil.example', '@evil.example/projects', ':443@evil.example', 'evil.example', 'projects',
    '/projects\r\nSet-Cookie: a=b', '/projects\u0000', ' //evil.example', '', null, undefined, 42,
  ]) {
    assert.equal(safeNextPath(bad), '/projects', `${JSON.stringify(bad)} falls back`);
  }
  assert.equal(safeNextPath('//evil.example', '/onboarding'), '/onboarding');
  // Appended to the origin, as the callback does, every answer stays on it.
  for (const raw of ['@evil.example', '//evil.example', 'https://evil.example', '/projects']) {
    assert.equal(new URL(`https://rune.app${safeNextPath(raw)}`).host, 'rune.app');
  }
});

async function callbackGet(query) {
  const res = await callback.GET(new NextRequest(`http://localhost:3000/auth/callback?${query}`));
  return { status: res.status, location: res.headers.get('location') };
}

test('the real callback never leaves the app for a forged `next`, and a link cannot forge a destination past the profile gate', async () => {
  const db = await freshDb();
  await createAuthUser(db, A, { display_name: 'Ada Quill' }, { email: 'ada@example.com' });
  signIn(db, A);
  globalThis.__ssrLinks = { 'good-code': A, 'good-hash': A };

  for (const next of ['@evil.example', '//evil.example', 'https://evil.example', '/\\evil.example', 'javascript:alert(1)']) {
    const r = await callbackGet(`code=good-code&next=${encodeURIComponent(next)}`);
    assert.equal(r.location, 'http://localhost:3000/projects', `${next} → Projects`);
  }
  assert.equal((await callbackGet(`code=good-code&next=${encodeURIComponent('/projects/abc?open=def')}`)).location,
    'http://localhost:3000/projects/abc?open=def', 'a real path of the app is kept');
  assert.equal((await callbackGet(`token_hash=good-hash&type=magiclink&next=%2F%2Fevil.example`)).location,
    'http://localhost:3000/projects', 'the token-hash form, with an encoded protocol-relative URL');

  // A spent or forged link signs nobody in and goes to the sign-in page.
  assert.equal((await callbackGet(`code=forged&next=%2F%2Fevil.example`)).location, 'http://localhost:3000/login?error=confirmation_failed');
  assert.equal((await callbackGet(`next=%2F%2Fevil.example`)).location, 'http://localhost:3000/login?error=confirmation_failed');

  // The profile invariant (053): an account without a profile goes to
  // /complete-profile whatever the link says.
  await db.query(`delete from public.user_pricing_entitlements where user_id = $1`, [A]);
  await db.query(`delete from public.profiles where id = $1`, [A]);
  for (const q of ['code=good-code&next=%2Fprojects', 'code=good-code&intent=signup&next=%2Fonboarding', 'code=good-code&next=%40evil.example']) {
    assert.match((await callbackGet(q)).location, /^http:\/\/localhost:3000\/complete-profile(\?registered=1)?$/, q);
  }
  delete globalThis.__ssrLinks;
});

// ── 4. What the browser can call ────────────────────────────────────────────

test('a module that writes analytics for a caller-named user id is not a Server Action module; the browser’s one signup event has its own narrow action', () => {
  assert.doesNotMatch(read('src/lib/actions/analytics.ts'), /^\s*["']use server["']/m, 'analytics.ts is a plain server module');
  assert.match(read('src/lib/actions/signupAnalytics.ts'), /^["']use server["']/);
  assert.match(code('src/lib/actions/signupAnalytics.ts'), /eventName: "signup_completed"/);
  assert.doesNotMatch(code('src/lib/actions/signupAnalytics.ts'), /eventName: input|eventName: name/, 'only that one event');
  assert.match(read('src/app/(auth)/signup/SignupClient.tsx'), /from "@\/lib\/actions\/signupAnalytics"/);
  // No client component imports the plain module (it would not be an action endpoint, but it must not bundle either).
  const src = path.join(REPO_DIR, 'src');
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
  for (const f of walk(src).filter((f) => /\.tsx?$/.test(f))) {
    const s = fs.readFileSync(f, 'utf8');
    if (!/^\s*["']use client["']/m.test(s)) continue;
    assert.doesNotMatch(s, /from "@\/lib\/actions\/analytics"/, `${path.relative(REPO_DIR, f)} imports the service-role analytics writer`);
  }
});
