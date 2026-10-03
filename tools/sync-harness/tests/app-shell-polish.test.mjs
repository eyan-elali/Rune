// BC-C closeout: shell and personalization polish.
//
//   * Settings inside a Project opens in a Center Peek (the Reading Peek's
//     surface) over the shell, which stays mounted and inert; /settings is
//     still the full page; both render the one SettingsSections
//   * writing the manuscript, the vacated tab band takes the writing surface
//     on the chrome's own fade, and gives it back the same way
//   * one navigator toggle, at the start of the tab row, whatever the
//     navigator's state
//   * "+" after the last tab: Project Search, then the chosen object in a tab
//     of its own at the end — the others kept, an open object's tab reused
//   * Accent colour: a curated set, validated, persisted on its own, tuned
//     per theme (System → the OS's variant), legible everywhere
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
const read = (f) => fs.readFileSync(path.join(REPO_DIR, f), 'utf8');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

let prefs, themes, settings, ws, legacy;
before(async () => {
  prefs = await bundleForTest('src/lib/rune2/preferences.ts', { name: 'sp_prefs' });
  themes = await bundleForTest('src/lib/rune2/themes.ts', { name: 'sp_themes' });
  settings = await bundleForTest('src/lib/actions/settings.ts', { name: 'sp_settings' });
  ws = await bundleForTest('src/lib/rune2/workingSet.ts', { name: 'sp_working_set' });
  legacy = await createTestDb();
  await legacy.exec(readRepoFile(LEGACY_BASELINE));
  await seedFixture(legacy);
});

// ── Settings in a Center Peek ─────────────────────────────────────────────────

test('Settings from a Project opens in a Center Peek over the kept shell; /settings is the full page; one implementation', () => {
  const shell = read('src/components/rune2/Rune2Shell.tsx');
  assert.match(shell, /\{settingsOpen && <SettingsPeek onClose=\{\(\) => setSettingsOpen\(false\)\} \/>\}/);
  assert.match(shell, /const covered = reading !== null \|\| settingsOpen;/);
  assert.match(shell, /<div className="r2-nav-column" inert=\{covered \|\| navCollapsed \|\| undefined\}>/, 'the navigator stays mounted, inert beneath (and when retracted)');
  assert.match(shell, /<div className="r2-content" inert=\{covered \|\| undefined\}>/, 'tabs, editors and scroll stay mounted beneath');

  const s = code(read('src/components/rune2/RuneSettings.tsx'));
  // The one implementation, in both places.
  const uses = s.match(/<SettingsSections /g) ?? [];
  assert.equal(uses.length, 2, 'the page and the peek both render SettingsSections');
  assert.match(s, /export function SettingsSections\(/);
  for (const section of ['settings-writing', 'settings-appearance', 'settings-projects']) {
    assert.equal((s.match(new RegExp(`id="${section}"`, 'g')) ?? []).length, 1, `${section} is written once`);
  }
  assert.equal((s.match(/function DeviceSection\(/g) ?? []).length, 1);
  assert.equal((s.match(/function AccountSection\(/g) ?? []).length, 1);
  // The peek: the Reading Peek's scrim and surface; Escape, the scrim and × close it; focus returns.
  const peek = s.slice(s.indexOf('export function SettingsPeek'), s.indexOf('export function SettingsSections'));
  assert.match(peek, /className="r2-peek" role="dialog" aria-modal="true"/);
  assert.match(peek, /<div className="r2-reader-scrim" aria-hidden onMouseDown=\{close\} \/>/);
  assert.match(peek, /aria-label="Close Settings" autoFocus onClick=\{close\}/);
  assert.match(peek, /e\.key !== "Escape" \|\| e\.defaultPrevented/);
  assert.match(peek, /: document\.querySelector<HTMLElement>\("\.r2-account--nav"\);\s*if \(el\) requestAnimationFrame\(\(\) => el\.focus\(\)\);/,
    'focus returns to what opened it, else the account control');

  const css = read('src/app/(rune2)/rune2.css');
  assert.match(css, /\.r2-reader,\n\.r2-peek \{/, 'the peek shares the Reading Peek’s container');
  assert.match(css, /\.r2-reader\[data-mode="peek"\] \.r2-reader-surface,\n\.r2-peek-surface \{/, 'and its surface');
  // The peek is not the manuscript: never painted with the writing surface.
  assert.ok(!/r2-peek/.test(themes.buildThemeCss()));

  // The full page remains.
  assert.ok(fs.existsSync(path.join(REPO_DIR, 'src/app/(rune2)/settings/page.tsx')));
  assert.match(read('src/app/(rune2)/settings/page.tsx'), /<RuneSettings/);
});

// ── Writing: the band takes the page ──────────────────────────────────────────

test('typing the manuscript: the vacated tab band takes the writing surface on the chrome’s fade, and gives it back', () => {
  const css = read('src/app/(rune2)/rune2.css');
  // Only while writing (useWritingChrome's trigger is unchanged), only over the manuscript, only the centre column.
  assert.match(css, /\.r2-shell\[data-writing\] \.r2-content-layer\[data-manuscript\] > \.r2-tabs \{\s*background: var\(--r2-ms-bg\);\s*\}/);
  // The same fade as the tabs leaving (out) and returning (in).
  const tabs = css.slice(css.indexOf('.r2-tabs {'), css.indexOf('}', css.indexOf('.r2-tabs {')));
  assert.match(tabs, /transition: background-color var\(--r2-fade-in\) var\(--r2-ease-frame\)/);
  assert.match(css, /\.r2-shell\[data-writing\] \.r2-tabs \{[^}]*transition-duration: var\(--r2-fade-out\);/);
  // The surface is a token, so it is right for every theme × surface; Default is the theme's own page.
  for (const theme of ['light', 'candlelight', 'dark']) {
    for (const s of themes.WRITING_SURFACES) assert.ok(themes.parseColour(themes.surfaceColours(s.id, theme)['ms-bg']), `${theme}/${s.id}`);
  }
  // Reduced motion: every transition is instant, the state still changes.
  // (BC-D: the roots themselves too — the shell carries .r2.)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.r2,\s*\.r2::before,\s*\.r2::after,\s*\.r2 \*,\s*\.r2 \*::before,\s*\.r2 \*::after \{\s*transition-duration: 0ms !important;/);
  // The trigger itself is untouched: an attribute the hook sets.
  assert.match(read('src/components/rune2/useWritingChrome.ts'), /el\.setAttribute\("data-writing", ""\)/);
});

// ── The navigator toggle ──────────────────────────────────────────────────────

test('one navigator toggle, at the start of the tab row, whatever the navigator’s state', () => {
  const tabs = code(read('src/components/rune2/Rune2Tabs.tsx'));
  const nav = code(read('src/components/rune2/ProjectNavigator.tsx'));
  assert.ok(!/toggleNav|PanelLeft|r2-nav-toggle/.test(nav), 'none in the navigator');
  assert.ok(!/navCollapsed && \(/.test(tabs), 'not shown only when retracted');
  const strip = tabs.slice(tabs.indexOf('<nav className="r2-tabs"'), tabs.indexOf('</nav>'));
  assert.ok(strip.indexOf('r2-tabs-nav-toggle') < strip.indexOf('<ul'), 'before the first tab');
  assert.match(strip, /aria-label=\{navCollapsed \? "Show navigator" : "Hide navigator"\}/);
  assert.match(strip, /aria-expanded=\{!navCollapsed\}/);
  assert.match(strip, /onClick=\{toggleNav\}/);
  const all = ['src/components/rune2', 'src/app/(rune2)'].flatMap((d) => {
    const out = [];
    const walk = (p) => fs.readdirSync(p, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(p, e.name)) : out.push(path.join(p, e.name))));
    walk(path.join(REPO_DIR, d));
    return out;
  });
  const toggles = all.filter((f) => /\.tsx$/.test(f)).filter((f) => /onClick=\{toggleNav\}/.test(code(fs.readFileSync(f, 'utf8'))));
  assert.deepEqual(toggles.map((f) => path.basename(f)), ['Rune2Tabs.tsx'], 'one canonical control');
  assert.ok(!/\.r2-nav-toggle/.test(read('src/app/(rune2)/rune2.css')));
});

// ── "+": Open another ─────────────────────────────────────────────────────────

test('"+" opens Project Search; the chosen object joins at the end, the others kept; an open object’s tab is reused', () => {
  const M = ws.MANUSCRIPT_TAB;
  let s = { tabs: [M, 'a', 'b'], active: 'a' };
  s = ws.appendTab(s, 'c');
  assert.deepEqual(s, { tabs: [M, 'a', 'b', 'c'], active: 'c' }, 'at the end, after the last tab — not after the active one');
  assert.deepEqual(ws.appendTab(s, 'a'), { tabs: [M, 'a', 'b', 'c'], active: 'a' }, 'an open object goes to its tab; no duplicate');
  assert.equal(ws.appendTab(s, 'c'), s, 'already active: nothing changes');
  // Many tabs (overflow is the strip's scrolling, not the model's): every tab is kept.
  let many = { tabs: [M], active: M };
  for (let i = 0; i < 40; i++) many = ws.appendTab(many, `x${i}`);
  assert.equal(many.tabs.length, 41);
  assert.equal(many.active, 'x39');

  const tabs = code(read('src/components/rune2/Rune2Tabs.tsx'));
  const strip = tabs.slice(tabs.indexOf('<nav className="r2-tabs"'), tabs.indexOf('</nav>'));
  assert.ok(strip.indexOf('</ul>') < strip.indexOf('r2-tabs-add'), 'right after the last tab, outside the scrolling list');
  assert.match(strip, /aria-label="Open another in a new tab"/);
  assert.match(strip, /<Tooltip label="Open another">/);
  assert.match(strip, /onClick=\{openSearchToAdd\}/);

  const search = code(read('src/components/rune2/ProjectSearch.tsx'));
  assert.match(search, /const adding = searchIntent === "add";/);
  assert.match(search, /const go = \(id: string\) => \(adding \? appendToWorkingSet\(id\) : newTab \? openInNewTab\(id\) : select\(id\)\);/,
    'the existing search and its result rules, with the "+" intent');
  const sel = code(read('src/components/rune2/Rune2Selection.tsx'));
  assert.match(sel, /setTabState\(\(prev\) => appendTab\(resolveTabs\(prev, has\), id \?\? MANUSCRIPT_TAB\)\)/);
  assert.match(sel, /const setSearchOpen = useCallback\(\(open: boolean \| \(\(open: boolean\) => boolean\)\) => \{\s*setSearchIntent\("go"\);/,
    '⌘K and the navigator’s search stay plain searches');
});

// ── Accent colour ─────────────────────────────────────────────────────────────

test('accent: a curated set, validated; unknown values read as Rune Blue', () => {
  const ids = ['blue', 'graphite', 'forest', 'teal', 'violet', 'burgundy', 'terracotta'];
  assert.deepEqual(prefs.ACCENTS.map((a) => a.id), ids);
  assert.equal(prefs.DEFAULT_ACCENT, 'blue');
  for (const id of ids) assert.deepEqual(prefs.validatePreferenceChange({ accent: id }), { patch: { rune2Accent: id }, error: null });
  for (const bad of [{ accent: '#ff0000' }, { accent: 'Blue' }, { accent: 'red' }, { accent: null }, { accent: { h: 1 } }]) {
    assert.equal(prefs.validatePreferenceChange(bad).patch, null, JSON.stringify(bad));
  }
  assert.equal(prefs.readRunePreferences({ rune2Accent: 'neon' }).accent, 'blue');
  assert.equal(prefs.readRunePreferences(null).accent, 'blue');
});

test('accent: saved on its own; theme, accent and writing surface stay independent', async () => {
  const db = await createTestDb();
  await db.exec(readRepoFile(RUNE2_SCHEMA));
  await prototypeLegacyToRune2(legacy, db);
  settings.setServerClient(createSupabaseAdapter(db, { userId: ALICE }));
  await settings.updateRunePreferences({ appearance: 'candlelight', writingSurface: 'charcoal' });
  const r = await settings.updateRunePreferences({ accent: 'forest' });
  assert.equal(r.error, null);
  assert.deepEqual([r.data.appearance, r.data.writingSurface, r.data.accent], ['candlelight', 'charcoal', 'forest']);
  const t = await settings.updateRunePreferences({ appearance: 'dark' });
  assert.equal(t.data.accent, 'forest', 'a theme change keeps the accent');
  const stored = (await db.query(`select preferences from public.profiles where id = $1`, [ALICE])).rows[0].preferences;
  assert.equal(stored.rune2Accent, 'forest');
  assert.equal((await settings.updateRunePreferences({ accent: 'hotpink' })).data, null);
});

test('accent: every accent is legible in every theme; it never touches prose, surfaces or danger', () => {
  for (const a of themes.ACCENTS) {
    for (const theme of ['light', 'candlelight', 'dark']) {
      const p = themes.paletteWithAccent(theme, a.id);
      const col = (t) => themes.parseColour(themes.resolveToken(p, p[t]));
      for (const bg of ['bg', 'shell-bg', 'group-bg', 'overlay-bg', 'page-bg']) {
        const r = themes.contrastRatio(col('accent'), col(bg));
        assert.ok(r >= 4.5, `${a.id}/${theme}: accent on ${bg} (${r.toFixed(2)})`);
      }
      const inv = themes.contrastRatio(col('ink-inverse'), col('accent'));
      assert.ok(inv >= 4.5, `${a.id}/${theme}: text on the accent (${inv.toFixed(2)})`);
      const tint = themes.parseColour(`rgb(${p['palette-blue']})`);
      assert.ok(tint, `${a.id}/${theme}: a tint triplet`);
    }
    assert.deepEqual(Object.keys(a.values.light).sort(), [...themes.ACCENT_TOKENS].sort());
  }
  assert.deepEqual([...themes.ACCENT_TOKENS].sort(), ['accent', 'accent-ink', 'palette-blue']);
  for (const t of ['danger', 'warning', 'bg', 'ms-bg', 'ms-ink', 'prose-ink']) assert.ok(!themes.ACCENT_TOKENS.includes(t), t);
  // Rune Blue is the palettes' own.
  for (const theme of ['light', 'candlelight', 'dark']) assert.deepEqual(themes.paletteWithAccent(theme, 'blue'), themes.PALETTES[theme]);
});

test('accent: the stylesheet tunes it per theme, System by the OS, and in a writing surface’s region', () => {
  const css = themes.buildThemeCss();
  const forest = themes.ACCENTS.find((a) => a.id === 'forest').values;
  assert.ok(css.includes(`.r2[data-accent="forest"]{--r2-palette-blue:${forest.light['palette-blue']};--r2-accent:${forest.light.accent};`));
  assert.ok(css.includes(`.r2[data-theme="candlelight"][data-accent="forest"]{--r2-palette-blue:${forest.candlelight['palette-blue']};`));
  assert.ok(css.includes(`.r2[data-theme="dark"][data-accent="forest"]{--r2-palette-blue:${forest.dark['palette-blue']};`));
  assert.ok(css.includes(`@media (prefers-color-scheme: dark){.r2[data-theme="system"][data-accent="forest"]{--r2-palette-blue:${forest.dark['palette-blue']};`),
    'System takes the dark variant under a dark OS (and the light one otherwise, from the root rule)');
  assert.ok(css.includes(`.r2[data-surface-scheme="dark"][data-accent="forest"] :is(`), 'a dark page keeps the accent, in its dark variant');
  assert.ok(!css.includes('[data-accent="blue"]'), 'Rune Blue needs no block');
  // Accents follow the themes, so a theme rule never overrides them.
  assert.ok(css.indexOf('.r2[data-accent="forest"]{') > css.indexOf('.r2[data-theme="system"]{'));
  // Every root carries the accent.
  assert.match(read('src/components/rune2/RunePreferences.tsx'), /"data-accent": accent,/);
  assert.match(read('src/components/rune2/Tooltip.tsx'), /data-accent=\{root\?\.accent\}/);
});

test('Settings: Accent colour is offered beside Theme; the writing-surface previews are centred', () => {
  const s = code(read('src/components/rune2/RuneSettings.tsx'));
  assert.match(s, /label="Accent colour"/);
  assert.match(s, /<AccentPicker value=\{prefs\.accent\} onChange=\{\(id\) => void change\("accent", id\)\} \/>/);
  assert.match(s, /role="radiogroup" aria-labelledby="settings-accent-label"/);
  const css = read('src/app/(rune2)/rune2.css');
  assert.match(css, /\.r2-surfaces \{\s*display: flex;\s*flex-wrap: wrap;\s*justify-content: center;/);
});
