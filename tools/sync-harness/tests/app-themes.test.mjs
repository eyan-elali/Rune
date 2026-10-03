// Themes, writing surfaces and Settings access (Beta Completion C).
//
//   * preferences: the four themes (System, Light, Candlelight, Dark) and the
//     curated writing surfaces are the only values accepted; unknown stored
//     values read as the defaults; theme and surface are saved and read
//     independently, merged into the writer's other preferences
//   * themes.ts: System resolves to Light or Dark; every palette defines every
//     colour token; text, accents and every surface in every theme keep
//     their contrast
//   * the stylesheet: one generated stylesheet, rendered by the (rune2)
//     layout before any root paints; System is pure CSS; rune2.css holds no
//     colour of its own; every Rune root carries the theme and surface
//   * navigation: Settings is reachable from inside a Project (the account
//     control at the navigator's foot) and comes back to it; the Project's
//     menu holds only the Project's own actions
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
const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const read = (f) => fs.readFileSync(path.join(REPO_DIR, f), 'utf8');
/** Without comments, so a description is not mistaken for code. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

let prefs, themes, settings, legacy;
before(async () => {
  prefs = await bundleForTest('src/lib/rune2/preferences.ts', { name: 'th_prefs' });
  themes = await bundleForTest('src/lib/rune2/themes.ts', { name: 'th_themes' });
  settings = await bundleForTest('src/lib/actions/settings.ts', { name: 'th_settings' });
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
});

// ── Preferences ───────────────────────────────────────────────────────────────

test('preferences: the four themes and the curated writing surfaces are the only values', () => {
  assert.deepEqual(prefs.APPEARANCES.map((t) => t.id), ['system', 'light', 'candlelight', 'dark']);
  assert.deepEqual(prefs.WRITING_SURFACES.map((s) => s.id), ['theme', 'white', 'paper', 'warm', 'gray', 'charcoal']);
  assert.equal(prefs.DEFAULT_APPEARANCE, 'light');
  assert.equal(prefs.DEFAULT_WRITING_SURFACE, 'theme');

  for (const id of ['system', 'light', 'candlelight', 'dark']) {
    assert.deepEqual(prefs.validatePreferenceChange({ appearance: id }), { patch: { rune2Appearance: id }, error: null });
    assert.equal(prefs.readRunePreferences({ rune2Appearance: id }).appearance, id);
  }
  for (const id of ['theme', 'white', 'paper', 'warm', 'gray', 'charcoal']) {
    assert.deepEqual(prefs.validatePreferenceChange({ writingSurface: id }), { patch: { rune2WritingSurface: id }, error: null });
    assert.equal(prefs.readRunePreferences({ rune2WritingSurface: id }).writingSurface, id);
  }
  for (const bad of [{ appearance: 'sepia' }, { appearance: 'Dark' }, { appearance: 'parchment' }, { writingSurface: '#ffffff' },
    { writingSurface: 'Charcoal' }, { writingSurface: { bg: '#000' } }, { writingSurface: null }, { appearance: 'dark', writingSurface: 'neon' }]) {
    assert.equal(prefs.validatePreferenceChange(bad).patch, null, JSON.stringify(bad));
  }
  // Read leniently: a withdrawn or unknown value is the default, never an error.
  assert.deepEqual(prefs.readRunePreferences({ rune2Appearance: 'midnight', rune2WritingSurface: 'parchment' }),
    { editorFont: 'serif', spellcheck: true, appearance: 'light', writingSurface: 'theme', accent: 'blue' });
});

test('updateRunePreferences: theme and writing surface are saved and kept independently', async () => {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  await prototypeLegacyToRune2(legacy, db);
  await db.query(`update public.profiles set preferences = '{"activeTheme":"candlelight","rune2EditorFont":"sans"}'::jsonb where id = $1`, [ALICE]);
  settings.setServerClient(createSupabaseAdapter(db, { userId: ALICE }));
  const stored = async () => (await one(db, `select preferences from public.profiles where id = $1`, [ALICE])).preferences;

  let r = await settings.updateRunePreferences({ appearance: 'dark' });
  assert.equal(r.error, null);
  assert.equal(r.data.appearance, 'dark');
  assert.equal(r.data.writingSurface, 'theme', 'the surface is untouched by a theme change');

  r = await settings.updateRunePreferences({ writingSurface: 'paper' });
  assert.deepEqual(r.data, { editorFont: 'sans', spellcheck: true, appearance: 'dark', writingSurface: 'paper', accent: 'blue' }, 'the theme is untouched by a surface change');

  r = await settings.updateRunePreferences({ appearance: 'system' });
  assert.deepEqual(await stored(), { activeTheme: 'candlelight', rune2EditorFont: 'sans', rune2Appearance: 'system', rune2WritingSurface: 'paper' },
    'System is stored as System; the legacy keys are left alone');

  for (const bad of [{ appearance: 'sepia' }, { writingSurface: '#000000' }]) {
    const rejected = await settings.updateRunePreferences(bad);
    assert.equal(rejected.data, null);
    assert.ok(rejected.error);
  }
  assert.equal((await stored()).rune2WritingSurface, 'paper', 'a rejected change writes nothing');
});

// ── Themes ────────────────────────────────────────────────────────────────────

test('System resolves to Light or Dark; the others are themselves', () => {
  assert.equal(themes.resolveTheme('system', true), 'dark');
  assert.equal(themes.resolveTheme('system', false), 'light');
  for (const id of ['light', 'candlelight', 'dark']) {
    assert.equal(themes.resolveTheme(id, true), id);
    assert.equal(themes.resolveTheme(id, false), id);
  }
  assert.deepEqual(themes.THEME_SCHEME, { light: 'light', candlelight: 'light', dark: 'dark' });
});

test('every palette defines exactly the colour tokens; every surface defines the manuscript tokens', () => {
  for (const [id, palette] of Object.entries(themes.PALETTES)) {
    assert.deepEqual(Object.keys(palette).sort(), [...themes.PALETTE_TOKENS].sort(), id);
    for (const [k, v] of Object.entries(palette)) assert.ok(typeof v === 'string' && v.length > 0, `${id}.${k}`);
  }
  for (const s of themes.WRITING_SURFACES) {
    if (s.id === 'theme') {
      assert.equal(s.tokens, null, 'Default takes the theme’s own');
      continue;
    }
    assert.deepEqual(Object.keys(s.tokens).sort(), [...themes.SURFACE_TOKENS].sort(), s.id);
    assert.ok(s.scheme === 'light' || s.scheme === 'dark', s.id);
  }
});

const colour = (palette, token, backdrop) => themes.parseColour(themes.resolveToken(palette, palette[token]), backdrop);

test('contrast: text, accents and states stay legible on every surface of every theme', () => {
  const surfaces = ['bg', 'shell-bg', 'panel-bg', 'page-bg', 'group-bg', 'overlay-bg', 'surface-raised'];
  for (const [id, p] of Object.entries(themes.PALETTES)) {
    for (const s of surfaces) {
      const bg = colour(p, s);
      assert.ok(bg, `${id}.${s} is opaque`);
      const ratio = (t) => themes.contrastRatio(colour(p, t), bg);
      assert.ok(ratio('ink-1') >= 10, `${id}: ink-1 on ${s} (${ratio('ink-1').toFixed(2)})`);
      assert.ok(ratio('ink-2') >= 5.5, `${id}: ink-2 on ${s} (${ratio('ink-2').toFixed(2)})`);
      assert.ok(ratio('ink-3') >= 3.4, `${id}: ink-3 on ${s} (${ratio('ink-3').toFixed(2)})`);
      for (const t of ['accent', 'danger', 'warning', 'success']) assert.ok(ratio(t) >= 4.5, `${id}: ${t} on ${s} (${ratio(t).toFixed(2)})`);
    }
    for (const on of ['accent', 'danger']) {
      const r = themes.contrastRatio(colour(p, 'ink-inverse'), colour(p, on));
      assert.ok(r >= 4.5, `${id}: text on ${on} (${r.toFixed(2)})`);
    }
    assert.ok(themes.contrastRatio(colour(p, 'tooltip-ink'), colour(p, 'tooltip-bg')) >= 7, `${id}: tooltip`);
  }
});

test('contrast: every writing surface in every theme keeps prose, placeholder and caret legible', () => {
  for (const theme of ['light', 'candlelight', 'dark']) {
    for (const s of themes.WRITING_SURFACES) {
      const c = themes.surfaceColours(s.id, theme);
      const bg = themes.parseColour(c['ms-bg']);
      assert.ok(bg, `${theme}/${s.id}: an opaque page`);
      const r = (t) => themes.contrastRatio(themes.parseColour(c[t], bg), bg);
      assert.ok(r('ms-ink') >= 10, `${theme}/${s.id}: prose (${r('ms-ink').toFixed(2)})`);
      assert.ok(r('ms-faint') >= 3, `${theme}/${s.id}: placeholder (${r('ms-faint').toFixed(2)})`);
      assert.ok(r('ms-caret') >= 4.5, `${theme}/${s.id}: caret (${r('ms-caret').toFixed(2)})`);
    }
  }
  // A curated surface is the same page in every theme; Default follows the theme.
  assert.deepEqual(themes.surfaceColours('charcoal', 'light'), themes.surfaceColours('charcoal', 'dark'));
  assert.notDeepEqual(themes.surfaceColours('theme', 'light'), themes.surfaceColours('theme', 'dark'));
  // The scheme of a surface matches its page.
  for (const s of themes.WRITING_SURFACES.filter((x) => x.tokens)) {
    const bg = themes.parseColour(s.tokens['ms-bg']);
    const dark = themes.contrastRatio(bg, [0, 0, 0]) < themes.contrastRatio(bg, [255, 255, 255]);
    assert.equal(s.scheme, dark ? 'dark' : 'light', s.id);
  }
});

// ── The stylesheet ────────────────────────────────────────────────────────────

test('the theme stylesheet: themes, System in CSS, surfaces on the root, a surface’s scheme for its region', () => {
  const css = themes.buildThemeCss();
  const block = (selector) => {
    const at = css.indexOf(`${selector}{`);
    assert.ok(at >= 0, `has ${selector}`);
    return css.slice(at + selector.length + 1, css.indexOf('}', at));
  };
  assert.match(block('.r2'), /--r2-bg:#fbfbfa;/);
  assert.match(block('.r2'), /color-scheme:light;/);
  assert.match(block('.r2[data-theme="dark"]'), /color-scheme:dark;/);
  assert.match(block('.r2[data-theme="candlelight"]'), /--r2-bg:#f8f5ee;/);
  // System is Light by default, Dark under the operating system's dark preference — the same palette as Dark.
  const media = css.slice(css.indexOf('@media (prefers-color-scheme: dark){.r2[data-theme="system"]{'));
  assert.ok(media.length > 0);
  assert.equal(block('@media (prefers-color-scheme: dark){.r2[data-theme="system"]'), block('.r2[data-theme="dark"]'));
  assert.ok(!/\.r2\[data-theme="light"\]/.test(css), 'Light is the root palette, not a separate block');

  for (const s of themes.WRITING_SURFACES.filter((x) => x.tokens)) {
    assert.match(block(`.r2[data-surface="${s.id}"]`), new RegExp(`--r2-ms-bg:${s.tokens['ms-bg']};`));
  }
  // Order: themes, then surfaces, then the scheme of a surface's region, then the region reading the page.
  const at = (needle) => css.indexOf(needle);
  assert.ok(at('.r2[data-theme="dark"]{') < at('.r2[data-surface="white"]{'));
  assert.ok(at('.r2[data-surface="charcoal"]{') < at('.r2[data-surface-scheme="dark"]'));
  assert.ok(at('.r2[data-surface-scheme="dark"]') < at('--r2-prose-bg:var(--r2-ms-bg)'));
  // A region's interface ink never overrides the writer's page.
  const reset = css.slice(at('.r2[data-surface-scheme="dark"]'), css.indexOf('}', at('.r2[data-surface-scheme="dark"]')));
  assert.ok(!/--r2-ms-/.test(reset) && !/--r2-selection:/.test(reset) && !/--r2-prose-bg:/.test(reset));
  // The page behind Rune follows the theme as painted.
  assert.match(css, /html\[data-r2-theme="dark"\],html\[data-r2-theme="dark"\] body\{background:#18191d;color-scheme:dark;\}/);
});

test('rune2.css holds no colour of its own: every colour comes from a theme', () => {
  const css = code(read('src/app/(rune2)/rune2.css'));
  const hex = css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
  assert.deepEqual(hex, [], 'no hex colours');
  const raw = (css.match(/rgba?\([^)]*\)/g) ?? []).filter((m) => !/var\(--r2-palette-/.test(m));
  assert.deepEqual(raw, [], 'no raw rgb()');
  for (const t of ['bg', 'shell-bg', 'ink-1', 'accent', 'danger', 'tooltip-bg', 'ms-bg', 'prose-bg']) {
    assert.ok(!new RegExp(`--r2-${t}\\s*:`).test(css), `--r2-${t} is defined by themes.ts only`);
  }
  // The manuscript reads the writing surface.
  assert.match(css, /caret-color: var\(--r2-ms-caret\)/);
  assert.match(css, /\.r2-content-layer\[data-manuscript\] \.r2-body \{[^}]*background: var\(--r2-ms-bg\)/);
});

test('first paint: the layout renders the stylesheet and seeds the preferences; every Rune root carries theme and surface', () => {
  const layout = read('src/app/(rune2)/layout.tsx');
  assert.match(layout, /const THEME_CSS = buildThemeCss\(\);/);
  assert.match(layout, /<style id="r2-themes" dangerouslySetInnerHTML=\{\{ __html: THEME_CSS \}\} \/>/);
  assert.match(layout, /<RunePreferencesProvider initial=\{profile\?\.preferences \?\? null\} account=\{accountOf\(user, profile\)\}>/);

  // Every element that opens a Rune root spreads the root props (or is a RuneRoot); none names a theme itself.
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx$/.test(e.name)) files.push(p);
    }
  };
  walk(path.join(REPO_DIR, 'src/components/rune2'));
  walk(path.join(REPO_DIR, 'src/app/(rune2)'));
  const offenders = [];
  for (const f of files) {
    const src = code(fs.readFileSync(f, 'utf8'));
    for (const m of src.matchAll(/<div\b[^>]*className=["{`]+r2 [^>]*>/g)) {
      if (!/\{\.\.\.rootProps\}|data-theme=\{root\?\.theme\}/.test(m[0])) offenders.push(`${path.relative(REPO_DIR, f)}: ${m[0].slice(0, 60)}`);
    }
    if (/data-theme=["'](light|dark|candlelight|system)["']/.test(src)) offenders.push(`${path.relative(REPO_DIR, f)}: a fixed theme`);
  }
  // The shell's root spreads them across lines.
  assert.match(read('src/components/rune2/Rune2Shell.tsx'), /className="r2 r2-shell"[\s\S]{0,400}\{\.\.\.rootProps\}/);
  assert.deepEqual(offenders.filter((o) => !o.includes('Rune2Shell.tsx')), []);
  // Loading and not-found render a themed root too.
  for (const f of ['src/app/(rune2)/projects/loading.tsx', 'src/app/(rune2)/projects/(home)/loading.tsx', 'src/app/(rune2)/projects/not-found.tsx']) {
    assert.match(read(f), /<RuneRoot className=/, f);
  }
});

test('the writing surface paints the manuscript only while the manuscript is written', () => {
  const shell = read('src/components/rune2/Rune2Shell.tsx');
  assert.match(shell, /const writingManuscript = writingTargetFor\(selected, index\) !== null;/);
  assert.match(shell, /data-manuscript=\{writingManuscript \|\| undefined\}/);
});

// ── Navigation ────────────────────────────────────────────────────────────────

test('Settings is reachable from inside a Project and comes back to it; the Project menu is the Project’s own', () => {
  const nav = read('src/components/rune2/ProjectNavigator.tsx');
  const items = nav.slice(nav.indexOf('function projectItems()'), nav.indexOf('async function moveProjectToTrash'));
  assert.ok(items.length > 0);
  for (const label of ['Rename project', 'Export manuscript…', 'Download project backup…', 'Move project to Trash']) assert.ok(items.includes(`"${label}"`), label);
  for (const foreign of ['"Settings"', '"All projects"', '"Log out"', 'router.push']) assert.ok(!items.includes(foreign), `the Project menu has no ${foreign}`);
  assert.match(nav, /<div className="r2-nav-footer">\s*<AccountControl onOpenSettings=\{\(\) => setSettingsOpen\(true\)\} \/>/,
    'the account sits at the navigator’s foot and opens Settings over the Project');

  const account = read('src/components/rune2/AccountMenu.tsx');
  assert.match(account, /\{ label: "Settings", icon: Settings, onSelect: openSettings \?\? \(\(\) => push\("\/settings"\)\) \}/,
    'inside a Project Settings opens over it; elsewhere it is the page');
  assert.match(account, /label: openSettings \? "All projects" : "Projects"/);
  assert.match(account, /\{ label: "Log out", icon: LogOut, separator: true, onSelect: logOut \}/);
  assert.match(account, /<NavigatorMenu\s+label="Account"\s+at=\{at\}\s+above/);

  const page = read('src/app/(rune2)/settings/page.tsx');
  assert.match(page, /const fromId = typeof from === "string" && UUID\.test\(from\) \? from : null;/, 'only a project id is honoured');
  assert.match(page, /\.from\("projects"\)\.select\("id, title"\)\.eq\("id", fromId\)\.is\("trashed_at", null\)\.maybeSingle\(\)/,
    'read under the writer’s own access; a Project in Trash offers Projects instead');
  assert.match(read('src/components/rune2/RuneSettings.tsx'), /href=\{returnTo \? `\/projects\/\$\{returnTo\.id\}` : "\/projects"\}/);
});
