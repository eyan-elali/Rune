// Rune 2.0 as the application (Beta Completion A): routing, the retirement of
// the Rune 1.x surfaces, and the writer's account-wide preferences.
//
//   * routes: /projects (Projects), /projects/:id (the Project shell),
//     /projects/trash, /settings — and the retired addresses redirect to
//     their modern equivalent (lib/legacyRedirects.ts, read by
//     next.config.ts) without loops; post-auth destinations are /projects
//   * no Rune 1.x user-facing path is linked to from the application, and
//     the retired pages, pricing and upgrade surfaces are gone
//   * preferences (lib/rune2/preferences.ts + updateRunePreferences): only
//     the known keys with valid values are written, merged into the
//     writer's other preferences, the writer's own only; stored values are
//     read leniently
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createTestDb, readRepoFile, REPO_DIR, LEGACY_BASELINE, RUNE2_SCHEMA } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';
import { prototypeLegacyToRune2 } from '../lib/legacy-to-rune2.mjs';
import { USERS, seedFixture } from '../fixtures/manuscript-fixture.mjs';

const ALICE = USERS.alice.id;
const BRAM = USERS.bram.id;
const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];

let redirects, prefs, settings, legacy;
before(async () => {
  redirects = await bundleForTest('src/lib/legacyRedirects.ts', { name: 'sr_redirects' });
  prefs = await bundleForTest('src/lib/rune2/preferences.ts', { name: 'sr_prefs' });
  settings = await bundleForTest('src/lib/actions/settings.ts', { name: 'sr_settings' });
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
});

/** Every source file under a directory of src/. */
function sources(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(tsx?|css)$/.test(e.name)) out.push(p);
    }
  };
  walk(path.join(REPO_DIR, 'src', dir));
  return out;
}
const rel = (p) => path.relative(REPO_DIR, p);
/** The file without its comments, so an explanation of a retired address is not mistaken for a link to it. */
const code = (p) => fs.readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// ── Routing ───────────────────────────────────────────────────────────────────

test('legacy addresses lead to their modern equivalent; modern addresses are left alone; no redirect leads to another', () => {
  const P = '0b000000-0000-4000-8000-000000000001';
  const C = '0c000000-0000-4000-8000-000000000001';
  const cases = {
    '/dashboard': '/projects',
    '/rune2': '/projects',
    [`/rune2/${P}`]: `/projects/${P}`,
    [`/projects/${P}/chapters/${C}`]: `/projects/${P}`,
    [`/projects/${P}/unplaced`]: `/projects/${P}`,
    '/profile': '/settings',
    '/profile/unlockables': '/settings',
    '/games': '/projects',
    '/games/race': '/projects',
    '/games/battle': '/projects',
  };
  for (const [from, to] of Object.entries(cases)) assert.equal(redirects.legacyDestination(from), to, from);
  for (const modern of ['/projects', `/projects/${P}`, '/projects/trash', '/settings', '/pulse', '/login', '/onboarding', '/']) {
    assert.equal(redirects.legacyDestination(modern), null, `${modern} is not redirected`);
  }
  for (const r of redirects.LEGACY_REDIRECTS) {
    const sample = r.destination.replace(':projectId', P);
    assert.equal(redirects.legacyDestination(sample), null, `${r.source} → ${r.destination} lands on a page, not another redirect`);
  }
  const config = fs.readFileSync(path.join(REPO_DIR, 'next.config.ts'), 'utf8');
  assert.match(config, /LEGACY_REDIRECTS\.map\(\(r\) => \(\{ \.\.\.r, permanent: false \}\)\)/, 'next.config.ts serves them as temporary redirects');
});

test('routes: Projects, a Project, Project Trash and Settings exist in the Rune shell; the retired Rune 1.x pages are gone', () => {
  const app = path.join(REPO_DIR, 'src/app');
  for (const f of ['(rune2)/projects/(home)/page.tsx', '(rune2)/projects/[projectId]/layout.tsx', '(rune2)/projects/[projectId]/page.tsx',
    '(rune2)/projects/trash/page.tsx', '(rune2)/settings/page.tsx', '(app)/pulse/page.tsx']) {
    assert.ok(fs.existsSync(path.join(app, f)), `${f} exists`);
  }
  for (const gone of ['(app)/dashboard', '(app)/projects', '(app)/settings', '(app)/profile', '(app)/games', '(rune2)/rune2']) {
    assert.ok(!fs.existsSync(path.join(app, gone)), `${gone} is retired`);
  }
});

test('after sign-in, every path lands on Projects (or onboarding for a new account); nothing sends a writer to a retired address', () => {
  const read = (f) => fs.readFileSync(path.join(REPO_DIR, f), 'utf8');
  assert.match(read('src/app/(front)/page.tsx'), /href="\/projects"[^>]*>\s*Open Sutura/, 'the front door opens Sutura for a writer with access');
  assert.match(read('src/app/(auth)/login/LoginClient.tsx'), /router\.push\("\/projects"\)/);
  assert.match(read('src/app/auth/callback/route.ts'), /searchParams\.get\('next'\) \?\? '\/projects'/);
  assert.match(read('src/app/auth/continue/route.ts'), /new URL\("\/projects", origin\)/);
  assert.match(read('src/lib/actions/profile.ts'), /redirectTo: "\/projects"/);
  assert.match(read('src/lib/actions/onboarding.ts'), /const href = `\/projects\/\$\{projectId\}`/);
  assert.match(read('src/components/rune2/Onboarding.tsx'), /router\.replace\(r\.data\.href\)/);
  assert.match(read('src/app/(rune2)/projects/(home)/page.tsx'), /redirect\(registered === "1" \? "\/onboarding\?registered=1" : "\/onboarding"\)/,
    'a brand-new account still goes to onboarding');

  const retired = /["'`]\/(dashboard|rune2|profile|games)(?=["'`/?])|\/chapters\/\$\{|\/unplaced(?=["'`?])/;
  const offenders = [...sources('app'), ...sources('components'), ...sources('lib'), ...sources('store')]
    .filter((f) => !f.endsWith('legacyRedirects.ts'))
    .filter((f) => retired.test(code(f)))
    .map(rel);
  assert.deepEqual(offenders, [], 'no link, redirect or navigation to a retired address');
});

test('the authenticated product shows no pricing, plan, upgrade, XP or unlock surface', () => {
  const ui = [...sources('app/(rune2)'), ...sources('components/rune2'), ...sources('components/editor'), ...sources('components/layout')];
  const offenders = ui.filter((f) => /PricingTable|UpgradeTeaser|PricingNotice|LevelUpModal|XpBar|unlockToastMessage|components\/billing|tab=billing/.test(code(f))).map(rel);
  assert.deepEqual(offenders, []);
  for (const gone of ['src/components/billing', 'src/components/dashboard', 'src/components/profile', 'src/components/games', 'src/components/projects']) {
    assert.ok(!fs.existsSync(path.join(REPO_DIR, gone)), `${gone} is retired`);
  }
  const stale = /\b(free words|word limit|upgrade|scribe|subscription|unlocked)\b/i;
  const copyOffenders = sources('components/rune2').filter((f) => stale.test(code(f))).map((f) => `${rel(f)}: ${code(f).match(stale)[0]}`);
  assert.deepEqual(copyOffenders, [], 'no stale word-limit, plan or unlock copy');
});

// ── Preferences ───────────────────────────────────────────────────────────────

test('preferences: stored values are read leniently; a change is checked key by key', () => {
  assert.deepEqual(prefs.readRunePreferences(null), { editorFont: 'serif', spellcheck: true, appearance: 'light', writingSurface: 'theme', accent: 'blue' });
  assert.deepEqual(prefs.readRunePreferences({ rune2EditorFont: 'sans', rune2Spellcheck: false, rune2Appearance: 'light', activeTheme: 'candlelight' }),
    { editorFont: 'sans', spellcheck: false, appearance: 'light', writingSurface: 'theme', accent: 'blue' },
    'the legacy activeTheme (onboarding’s) is not the Rune theme');
  assert.deepEqual(prefs.readRunePreferences({ rune2EditorFont: 'comic', rune2Spellcheck: 'no', rune2Appearance: 'neon', rune2WritingSurface: '#ff0000' }),
    { editorFont: 'serif', spellcheck: true, appearance: 'light', writingSurface: 'theme', accent: 'blue' }, 'unknown values read as the defaults');
  assert.deepEqual(prefs.readRunePreferences(['x']), prefs.readRunePreferences(null));

  assert.deepEqual(prefs.validatePreferenceChange({ editorFont: 'sans', spellcheck: false }),
    { patch: { rune2EditorFont: 'sans', rune2Spellcheck: false }, error: null });
  for (const bad of [null, [], {}, { editorFont: 'mono' }, { spellcheck: 'yes' }, { appearance: 'neon' }, { activeTheme: 'x' }, { xp: 9999 }]) {
    assert.equal(prefs.validatePreferenceChange(bad).patch, null, JSON.stringify(bad));
  }
  // The themes (Beta Completion C): System, Light, Candlelight, Dark; Light is the default.
  assert.deepEqual(prefs.APPEARANCES.map((a) => a.id), ['system', 'light', 'candlelight', 'dark']);
  assert.equal(prefs.DEFAULT_APPEARANCE, 'light');
});

test('updateRunePreferences: saves only valid Rune preferences, merged into the writer’s others, and only the writer’s own', async () => {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  await prototypeLegacyToRune2(legacy, db);
  await db.query(`update public.profiles set preferences = '{"activeTheme":"candlelight","fontSize":18}'::jsonb where id = $1`, [ALICE]);
  const bramBefore = (await one(db, `select preferences from public.profiles where id = $1`, [BRAM])).preferences;

  settings.setServerClient(createSupabaseAdapter(db, { userId: ALICE }));
  const saved = await settings.updateRunePreferences({ editorFont: 'sans', spellcheck: false });
  assert.deepEqual(saved, { data: { editorFont: 'sans', spellcheck: false, appearance: 'light', writingSurface: 'theme', accent: 'blue' }, error: null });
  assert.deepEqual((await one(db, `select preferences from public.profiles where id = $1`, [ALICE])).preferences,
    { activeTheme: 'candlelight', fontSize: 18, rune2EditorFont: 'sans', rune2Spellcheck: false }, 'merged; legacy keys untouched');

  for (const bad of [{ editorFont: 'mono' }, { activeTheme: 'obsidian' }, { appearance: 'midnight' }]) {
    const r = await settings.updateRunePreferences(bad);
    assert.equal(r.data, null);
    assert.ok(r.error);
  }
  assert.equal((await one(db, `select preferences->>'activeTheme' as t from public.profiles where id = $1`, [ALICE])).t, 'candlelight');
  assert.deepEqual((await one(db, `select preferences from public.profiles where id = $1`, [BRAM])).preferences, bramBefore, 'another writer is untouched');

  settings.setServerClient(createSupabaseAdapter(db, {}));
  assert.equal((await settings.updateRunePreferences({ spellcheck: true })).error, 'Not authenticated');
});
