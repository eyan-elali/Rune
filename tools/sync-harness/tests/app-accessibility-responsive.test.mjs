// BC-D: accessibility, responsive and performance hardening.
//
//   * one placement rule for every floating surface (lib/rune2/floating.ts):
//     flips, opens inward near the right edge, caps to the window — at any
//     width or browser zoom; pickers float over the page (useFloating) so an
//     Inspector or a Table never widens, scrolls or shifts under them
//   * one modal focus contract (useModalFocus): in, contained, back out
//   * Escape answers the nearest layer only; the Canvas's own chrome keeps its keys
//   * a status line that doesn't read every typed word aloud
//   * reduced motion covers every Rune root; focus indicators are ≥ 3:1
//   * reads that grow with the writer's work are paged past the API row cap,
//     and the manuscript loads in two round trips, not four
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createTestDb, REPO_DIR } from '../lib/pg.mjs';
import { createSupabaseAdapter } from '../lib/supabase-adapter.mjs';
import { bundleForTest } from '../lib/bundle.mjs';

const read = (f) => fs.readFileSync(path.join(REPO_DIR, f), 'utf8');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const css = () => read('src/app/(rune2)/rune2.css');
/** The declarations of the first rule whose whole selector list is `selector` (not one of a list). */
function rule(sheet, selector) {
  let at = -1;
  for (let i = sheet.indexOf(`${selector} {`); i >= 0; i = sheet.indexOf(`${selector} {`, i + 1)) {
    if (!/,\s*$/.test(sheet.slice(Math.max(0, i - 4), i))) { at = i; break; }
  }
  assert.ok(at >= 0, `rule ${selector}`);
  return sheet.slice(at, sheet.indexOf('}', at));
}

let floating, themes, rows;
before(async () => {
  floating = await bundleForTest('src/lib/rune2/floating.ts', { name: 'bcd_floating' });
  themes = await bundleForTest('src/lib/rune2/themes.ts', { name: 'bcd_themes' });
  rows = await bundleForTest('src/lib/readAllRows.ts', { name: 'bcd_rows' });
});

// ── One placement rule ─────────────────────────────────────────────────────────

const VIEW = { width: 1280, height: 800 };
const anchorAt = (left, top, width = 120, height = 28) => ({ left, top, right: left + width, bottom: top + height });

test('placeFloating: below its control, lined up with its start, when there is room', () => {
  const p = floating.placeFloating({ anchor: anchorAt(200, 100), size: { width: 280, height: 240 }, viewport: VIEW });
  assert.deepEqual(p, { x: 200, y: 132, side: 'bottom', align: 'start', maxHeight: null, maxWidth: null });
  // A picker lines its text up with the value's: its edge sits `inset` outside the control's.
  assert.equal(floating.placeFloating({ anchor: anchorAt(200, 100), size: { width: 280, height: 240 }, viewport: VIEW, inset: 6 }).x, 194);
});

test('placeFloating: near the right edge it opens inward (leftward), never off-screen', () => {
  // The Inspector's value column ends near the window's right edge.
  const anchor = anchorAt(1140, 300, 120);
  const p = floating.placeFloating({ anchor, size: { width: 280, height: 200 }, viewport: VIEW, inset: 6 });
  assert.equal(p.align, 'end');
  assert.equal(p.x, anchor.right + 6 - 280);
  assert.ok(p.x + 280 <= VIEW.width - 8);
  // Neither alignment fits (a wide surface on a narrow window): clamped inside, edge kept.
  const tight = floating.placeFloating({ anchor: anchorAt(150, 100), size: { width: 300, height: 100 }, viewport: { width: 390, height: 700 } });
  assert.ok(tight.x >= 8 && tight.x + 300 <= 390 - 8, JSON.stringify(tight));
});

test('placeFloating: flips above when there is no room below, and caps its height when neither side fits', () => {
  const low = floating.placeFloating({ anchor: anchorAt(100, 700), size: { width: 280, height: 240 }, viewport: VIEW });
  assert.equal(low.side, 'top');
  assert.equal(low.y, 700 - 4 - 240);
  assert.equal(low.maxHeight, null);
  // 200% zoom on a short window: 400 CSS px tall, a 360px list, the control in the middle.
  const zoomed = floating.placeFloating({ anchor: anchorAt(40, 180, 100, 24), size: { width: 280, height: 360 }, viewport: { width: 640, height: 400 } });
  assert.ok(zoomed.maxHeight !== null && zoomed.maxHeight > 0, 'capped');
  assert.ok(zoomed.y >= 8 && zoomed.y + zoomed.maxHeight <= 400 - 8, JSON.stringify(zoomed));
  assert.equal(zoomed.side, 'bottom', 'the roomier side');
});

test('placeFloating: a surface wider than the window is capped to it; a point (a right click) is an anchor', () => {
  const p = floating.placeFloating({ anchor: anchorAt(10, 10), size: { width: 440, height: 100 }, viewport: { width: 390, height: 700 } });
  assert.equal(p.maxWidth, 390 - 16);
  assert.equal(p.x, 8);
  const menu = floating.placeFloating({ anchor: floating.pointRect(380, 690), size: { width: 220, height: 160 }, viewport: { width: 390, height: 700 }, gap: 0 });
  // No room right of the point: it opens leftward from it, and upward.
  assert.deepEqual([menu.side, menu.align, menu.x, menu.y], ['top', 'end', 380 - 220, 690 - 160]);
});

// ── Floating surfaces never reshape what they open from ────────────────────────

test('Inspector property pickers float over the page: no width change, no sideways scroll, no off-screen edge', () => {
  const fields = code(read('src/components/rune2/PropertyFields.tsx'));
  const picker = code(read('src/components/rune2/ObjectPicker.tsx'));
  for (const [name, src] of [['OptionPicker', fields], ['ObjectPicker', picker]]) {
    assert.match(src, /useFloating\(ref, \{[^}]*onAway: \(\) => close\.current\(false\)/, `${name} is placed by useFloating`);
    const from = src.indexOf(name === 'OptionPicker' ? 'function OptionPicker' : 'export function ObjectPicker');
    const next = src.slice(from + 10).search(/\n(export )?function /);
    const body = next < 0 ? src.slice(from) : src.slice(from, from + 10 + next);
    assert.ok(!/autoFocus/.test(body), `${name}: no autoFocus (it scrolled the Inspector sideways to reveal the field)`);
    assert.match(src, /querySelector\("input"\)\?\.focus\(\{ preventScroll: true \}\)/, `${name}: focus without scrolling any container`);
    assert.ok(!/floating/.test(src), `${name}: one placement for every place it opens (no inline mode)`);
  }
  assert.ok(!/floating/.test(code(read('src/components/rune2/CollectionViewBodies.tsx'))), 'the Table no longer asks for a different picker');

  const sheet = css();
  const p = rule(sheet, '.r2-prop-picker');
  assert.match(p, /position: fixed;/);
  assert.match(p, /width: 280px;/);
  assert.ok(!/100%|min-width/.test(p), 'sized in pixels, never by the column it opened in');
  assert.ok(!sheet.includes('.r2-prop-picker[data-floating] {'), 'no second, Table-only placement');
  assert.match(rule(sheet, '.r2-prop-date'), /max-width: calc\(100% \+ 12px\);/, 'a date field never overflows a narrow value column');
  // The Inspector's column: shrinkable values, no sideways scroll, a stable gutter.
  assert.match(rule(sheet, '.r2-prop'), /grid-template-columns: minmax\(76px, 124px\) minmax\(0, 1fr\);/);
  assert.match(rule(sheet, '.r2-prop-value'), /min-width: 0;/);
  const body = rule(sheet, '.r2-panel-body');
  assert.match(body, /overflow-x: hidden;/);
  assert.match(body, /scrollbar-gutter: stable;/);
});

test('useFloating: fixed, placed before paint, re-placed on scroll, resize and its own growth; corrects for a reframing ancestor', () => {
  const hook = code(read('src/components/rune2/useFloating.ts'));
  assert.match(hook, /useLayoutEffect\(/, 'placed before the first paint');
  assert.match(hook, /el\.style\.position = "fixed";/);
  assert.match(hook, /placeFloating\(\{/);
  assert.match(hook, /new ResizeObserver\(/);
  assert.match(hook, /document\.addEventListener\("scroll", schedule, \{ capture: true, passive: true \}\)/);
  assert.match(hook, /window\.addEventListener\("resize", schedule\)/);
  assert.match(hook, /frameOrigin\(el\)/, 'a transformed or filtered ancestor (the Canvas toolbar) is measured, not assumed away');
  assert.match(hook, /el\.offsetWidth, height: el\.offsetHeight/, 'layout size, not an arriving animation\'s scaled box');
  assert.match(hook, /cancelAnimationFrame\(frame\);\s*sizes\.disconnect\(\);/, 'listeners and observers are cleaned up');
});

test('every anchored popover shares the rule: Add view, View toolbar, Canvas Add and Find, Link to; menus cap and flip', () => {
  const views = code(read('src/components/rune2/ViewControls.tsx'));
  assert.match(views, /useFloating\(menu, \{ open, anchor: \(\) => button\.current/);
  assert.match(views, /useFloating\(pop, \{ open, anchor: \(\) => button\.current, align: "end"/);
  for (const f of ['CanvasInsert', 'CanvasFind']) assert.match(code(read(`src/components/rune2/${f}.tsx`)), /useFloating\(ref, \{ align: "end", gap: 6 \}\)/, f);
  assert.match(code(read('src/components/rune2/ObjectLinks.tsx')), /align="end"/);
  const sheet = css();
  for (const sel of ['.r2-view-menu', '.r2-tool-pop', '.r2-canvas-insert']) {
    const r = rule(sheet, sel);
    assert.match(r, /position: fixed;/, sel);
    assert.ok(!/top: calc\(100%/.test(r), `${sel}: not hung inside its parent's box`);
  }
  assert.ok(!/top: calc\(100% \+/.test(sheet), 'no popover is positioned inside the layout any more');
  const menu = code(read('src/components/rune2/NavigatorMenu.tsx'));
  assert.match(menu, /placeFloating\(\{\s*anchor: pointRect\(at\.x, at\.y\)/);
  assert.match(menu, /maxHeight: pos\.maxHeight \?\? undefined, overflowY:/, 'a long "Move to" list scrolls inside the window');
  assert.match(sheet, /\.r2-menu\[data-side="top"\]/, 'opened upward, it settles from below');
});

// ── Keyboard: focus, Escape, traps ─────────────────────────────────────────────

test('useModalFocus: focus goes in, Tab stays in, focus comes back; every modal dialog uses it', () => {
  const hook = code(read('src/components/rune2/useModalFocus.ts'));
  assert.match(hook, /const opener = document\.activeElement/);
  assert.match(hook, /if \(e\.key !== "Tab"\) return;/);
  assert.match(hook, /last\.focus\(\)/);
  assert.match(hook, /first\.focus\(\)/);
  assert.match(hook, /opener\.focus\(\{ preventScroll: true \}\)/);
  assert.match(hook, /lost && opener\?\.isConnected/, 'never steals focus the writer has put somewhere on purpose');
  const uses = {
    'ProjectDialogs.tsx': /useModalFocus\(ref\)/,
    'ProjectExport.tsx': /useModalFocus\(ref\)/,
    'ManuscriptImport.tsx': /useModalFocus\(dialog\)/,
    'SceneHistory.tsx': /useModalFocus\(dialogRef\)/,
    'ManuscriptMilestones.tsx': /useModalFocus\(dialogRef\)/,
    'AccountMenu.tsx': /useModalFocus\(dialogRef, asking\)/,
  };
  for (const [f, re] of Object.entries(uses)) assert.match(code(read(`src/components/rune2/${f}`)), re, f);
  // Both Export dialogs attach it.
  assert.equal((read('src/components/rune2/ProjectExport.tsx').match(/<div ref=\{dialog\} className="r2-dialog r2-export"/g) ?? []).length, 2);
});

test('the log-out question: Escape answers it, it is described, and "Stay" puts the keyboard back on the account control', () => {
  const a = code(read('src/components/rune2/AccountMenu.tsx'));
  assert.match(a, /aria-describedby="r2-logout-detail"/);
  assert.match(a, /if \(e\.key === "Escape"\) \{\s*e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*stay\(\);/);
  assert.match(a, /returnFocus\?\.current\?\.focus\(\)/);
  assert.equal((a.match(/useLogOut\(button\)/g) ?? []).length, 2);
});

test('Escape answers the nearest layer only: a schema confirmation inside the Inspector never closes the panel', () => {
  const s = code(read('src/components/rune2/CollectionSchema.tsx'));
  const confirms = s.match(/role="alertdialog"[\s\S]*?onKeyDown=\{\(e\) => \{[\s\S]*?\}\}/g) ?? [];
  assert.equal(confirms.length, 2);
  for (const c of confirms) {
    assert.match(c, /e\.stopPropagation\(\)/);
    assert.match(c, /cancelRemove\(\)/);
    assert.match(c, /aria-describedby=\{confirmId\}/);
  }
  assert.match(s, /removeButton\.current\?\.focus\(\)/, 'focus back on the control that asked');
  // Scene History: leaving the confirm step keeps the keyboard in the dialog.
  assert.match(code(read('src/components/rune2/SceneHistory.tsx')), /function endConfirm\(\) \{\s*setConfirming\(false\);\s*dialogRef\.current\?\.focus\(\);/);
});

test('the Canvas: its toolbar and menus keep their own keys; Add returns focus to the board', () => {
  const c = code(read('src/components/rune2/CanvasSurface.tsx'));
  const handler = c.slice(c.indexOf('const onKeyDown = (e: KeyboardEvent<HTMLDivElement>)'));
  const guard = handler.indexOf('target.closest(".r2-canvas-ui, .r2-menu")');
  assert.ok(guard > 0, 'chrome controls are excluded');
  assert.ok(guard < handler.indexOf('if (e.key === " ")'), 'before Space is taken for panning');
  assert.ok(guard < handler.indexOf('e.key === "Delete"'), 'before Delete removes the selection');
  assert.ok(guard < handler.indexOf('e.key.startsWith("Arrow")'), 'before arrows nudge');
  assert.match(handler.slice(guard - 120, guard + 120), /e\.key !== "Escape" && !mod/, 'Escape and ⌘ shortcuts still reach the board');
  assert.match(c, /<CanvasInsert[\s\S]*?onClose=\{\(\) => \{\s*setInsert\(null\);\s*root\.current\?\.focus\(\{ preventScroll: true \}\);/);
});

test('the navigator: retracted it leaves the Tab order; lying over narrow content, Escape closes it onto its toggle', () => {
  const shell = code(read('src/components/rune2/Rune2Shell.tsx'));
  assert.match(shell, /<div className="r2-nav-column" inert=\{covered \|\| navCollapsed \|\| undefined\}>/);
  assert.match(shell, /if \(e\.key !== "Escape" \|\| e\.defaultPrevented\) return;\s*if \(!\(e\.target as Element \| null\)\?\.closest\?\.\("\.r2-nav-column"\)\) return;\s*setNavCollapsed\(true\);/);
  assert.match(shell, /querySelector<HTMLElement>\("\.r2-tabs-nav-toggle"\)\?\.focus\(\)/);
});

test('menu triggers say whether their menu is open; pickers keep the keyboard\'s row in sight', () => {
  assert.match(code(read('src/components/rune2/ProjectNavigator.tsx')), /aria-expanded=\{menu\?\.label === `\$\{manuscript\.project\.title\} actions`\}/);
  assert.match(code(read('src/components/rune2/ProjectsHome.tsx')), /aria-expanded=\{menu\?\.project\.id === p\.id\}/);
  for (const f of ['PropertyFields', 'ObjectPicker', 'CanvasInsert', 'CanvasFind']) {
    assert.match(code(read(`src/components/rune2/${f}.tsx`)), /getElementById\(`\$\{listId\}-\$\{[^}]+\}`\)\?\.scrollIntoView\(\{ block: "nearest" \}\)/, f);
  }
});

// ── Screen readers ─────────────────────────────────────────────────────────────

test('the status line is not read aloud on every word; problems and offline states are', () => {
  const d = code(read('src/components/rune2/DocStatus.tsx'));
  assert.ok(!/aria-live/.test(d), 'the count and routine "Saving…/Saved" are not a live region');
  assert.match(d, /<span role="status" className="sr-only">\s*\{announce\}\s*<\/span>/, 'a status region that stays mounted');
  assert.match(code(read('src/components/rune2/Rune2Editor.tsx')), /<DocStatus announce=\{syncStatus === "offline_dirty" \|\| syncStatus === "failed" \|\| !isOnline \? statusLabel : null\}>/);
  assert.match(code(read('src/components/rune2/WorkspacePageEditor.tsx')), /<DocStatus announce=\{/);
  assert.match(code(read('src/components/rune2/CanvasSurface.tsx')), /<DocStatus\s+announce=\{/);
  // Scene History announces which version opened, never its whole prose.
  const h = code(read('src/components/rune2/SceneHistory.tsx'));
  assert.ok(!/r2-history-preview" aria-live/.test(h));
  assert.match(h, /<p role="status" className="sr-only">/);
  // Search: the number of results, or none, is heard.
  assert.match(code(read('src/components/rune2/ProjectSearch.tsx')), /<p role="status" className="sr-only">[\s\S]*?No results for/);
});

test('a View toolbar button keeps its words as its name when the words are hidden for room', () => {
  const sheet = css();
  const at = sheet.indexOf('@container (max-width: 980px) {\n  /* Hidden from sight only');
  assert.ok(at > 0);
  const r = sheet.slice(at, sheet.indexOf('}', at));
  assert.ok(!/display: none/.test(r));
  assert.match(r, /clip-path: inset\(50%\);/);
});

test('Reading Mode: a scene\'s Edit is a Tab stop (shown on focus) — leaving the reader has a keyboard path', () => {
  const r = code(read('src/components/rune2/ReadingMode.tsx'));
  const edit = r.slice(r.lastIndexOf('<button', r.indexOf('r2-reading-mark r2-reading-mark--edit')), r.indexOf('r2-reading-mark r2-reading-mark--edit'));
  assert.ok(!/tabIndex=\{-1\}/.test(edit));
  assert.match(css(), /\.r2-reading-mark:focus-visible \{\s*opacity: 1;/);
});

// ── Reduced motion and contrast ────────────────────────────────────────────────

test('reduced motion: every Rune root and everything in it moves at once; smooth scrolls ask first', () => {
  const sheet = css();
  const at = sheet.indexOf('@media (prefers-reduced-motion: reduce) {\n  .r2,\n');
  assert.ok(at > 0, 'the roots themselves are covered');
  const block = sheet.slice(at, sheet.indexOf('}', at));
  for (const d of ['transition-duration: 0ms !important', 'animation-duration: 0ms !important', 'animation-iteration-count: 1 !important', 'scroll-behavior: auto !important']) {
    assert.ok(block.includes(d), d);
  }
  for (const f of ['ReadingMode', 'Rune2Editor', 'ManuscriptMilestones']) {
    const src = code(read(`src/components/rune2/${f}.tsx`));
    for (const m of src.matchAll(/behavior: [^,}]*"smooth"/g)) {
      const around = src.slice(Math.max(0, m.index - 600), m.index);
      assert.match(around, /prefers-reduced-motion: reduce/, `${f}: a smooth scroll checks reduced motion`);
    }
  }
});

test('focus indicators: the ring is the focus colour (≥ 3:1 on every surface, theme and accent); no indicator is a faint tint', () => {
  for (const a of themes.ACCENTS) {
    for (const theme of ['light', 'candlelight', 'dark']) {
      const p = themes.paletteWithAccent(theme, a.id);
      const col = (t, bg) => themes.parseColour(themes.resolveToken(p, p[t]), bg);
      for (const s of ['bg', 'shell-bg', 'panel-bg', 'overlay-bg', 'page-bg', 'group-bg']) {
        const bg = col(s);
        const r = themes.contrastRatio(col('focus', bg), bg);
        assert.ok(r >= 3, `${a.id}/${theme}: focus on ${s} (${r.toFixed(2)})`);
        // On a hovered row too (a menu's keyboard item is both).
        const hovered = col('hover', bg);
        assert.ok(themes.contrastRatio(col('focus', hovered), hovered) >= 3, `${a.id}/${theme}: focus on a hovered ${s}`);
      }
    }
  }
  // Every rule that removes the outline for keyboard focus draws something legible instead.
  const sheet = css();
  for (const m of sheet.matchAll(/([^{}]*:focus-visible[^{}]*)\{([^{}]*)\}/g)) {
    const [, sel, body] = m;
    assert.ok(!/accent-line/.test(body), `${sel.trim()}: a focus indicator in the faint accent line`);
  }
  for (const sel of ['.r2-menu-item:focus-visible', '.r2-view-menu-item:focus-visible']) {
    assert.match(rule(sheet, sel), /box-shadow: inset 0 0 0 1\.5px var\(--r2-focus\);/, sel);
  }
});

// ── Large Projects: paged reads, fewer round trips ─────────────────────────────

test('readAllRows: every row past the API row cap, one key or two, no repeats; the cap is real in the harness', async () => {
  const db = await createTestDb();
  await db.exec(`
    create table public.bcd_pairs (a uuid not null, b uuid not null, n int not null, primary key (a, b));
    create table public.bcd_items (id uuid primary key, n int not null);
    grant select on public.bcd_pairs, public.bcd_items to anon, authenticated;
  `);
  const hex = (i) => i.toString(16).padStart(12, '0');
  // 13 leading values with 1–4 rows each (a composite key like entry_id, property_id).
  let n = 0;
  for (let a = 0; a < 13; a++) {
    for (let b = 0; b <= a % 4; b++) {
      await db.query(`insert into public.bcd_pairs values ($1, $2, $3)`, [`00000000-0000-4000-8000-${hex(a)}`, `00000000-0000-4000-8000-${hex(b)}`, n++]);
    }
  }
  for (let i = 0; i < 23; i++) await db.query(`insert into public.bcd_items values ($1, $2)`, [`00000000-0000-4000-8000-${hex(i * 7919)}`, i]);

  const sb = createSupabaseAdapter(db, { maxRows: 5 });
  const capped = await sb.from('bcd_pairs').select('a, b, n');
  assert.equal(capped.data.length, 5, 'one request is cut short at the cap, silently — as the real API does');

  const pairs = await rows.readAllRows(() => sb.from('bcd_pairs').select('a, b, n'), ['a', 'b'], 4);
  assert.equal(pairs.length, n);
  assert.equal(new Set(pairs.map((r) => r.n)).size, n, 'no row repeated');
  const items = await rows.readAllRows(() => sb.from('bcd_items').select('id, n'), ['id'], 5);
  assert.deepEqual(items.map((r) => r.n).sort((x, y) => x - y), [...Array(23).keys()]);
  // Exactly a page's worth ends with one empty read; a failed read throws, never returns part.
  const at23 = createSupabaseAdapter(db, { maxRows: 23 });
  const exact = await rows.readAllRows(() => at23.from('bcd_items').select('id'), ['id'], 23);
  assert.equal(exact.length, 23);
  await assert.rejects(rows.readAllRows(() => sb.from('bcd_missing').select('id')));
  const reported = await rows.readAll(() => sb.from('bcd_missing').select('id'));
  assert.deepEqual(reported.data, []);
  assert.ok(reported.error?.message);
});

test('the Project loaders page what grows with the work, and read the manuscript in two round trips', () => {
  const w = code(read('src/lib/rune2/projectWorkspace.ts'));
  for (const [table, keys] of [
    ['workspace_documents', null], ['workspace_nodes', null], ['workspace_collection_entries', null],
    ['workspace_entry_values', '["entry_id", "property_id"]'], ['object_references', null],
    ['scene_property_values', '["scene_id", "property_id"]'],
  ]) {
    const m = new RegExp(`readAll<\\w+>\\(\\s*\\(\\) =>\\s*supabase\\.from\\("${table}"\\)[^\\n]*\\n?([^\\n]*)`).exec(w);
    assert.ok(m, `${table} is paged`);
    if (keys) assert.ok(m[0].includes(keys) || m[1].includes(keys), `${table} pages by its whole key`);
  }
  assert.match(w, /\.then\(inCreationOrder\)/, 'paged in key order, shown in creation order');
  const canvas = code(read('src/lib/actions/workspaceCanvas.ts'));
  assert.match(canvas, /readAll<CanvasItem>\(/);
  assert.match(canvas, /readAll<CanvasConnection>\(/);

  const q = code(read('src/lib/manuscriptQueries.ts'));
  const fn = q.slice(q.indexOf('export async function getChaptersWithScenesByProject'), q.indexOf('function byPosition'));
  assert.equal((fn.match(/await /g) ?? []).length, 2, 'Manuscripts, then Chapters + Groups + Scenes side by side');
  assert.match(fn, /await Promise\.all\(\[\s*readAllRows<Chapter>/);
  assert.match(fn, /from\("scenes"\)\.select\("id, chapter_id, title, word_count, version, position"\)\.in\("manuscript_id", manuscriptIds\)/);
  assert.match(fn, /s\.chapter_id === null \? undefined : scenesByChapter\.get\(s\.chapter_id\)/, 'Unplaced Scenes never join the ordered manuscript');
  // The export pipeline uses the same pager (one implementation).
  assert.match(code(read('src/lib/export/plan.ts')), /import \{ readAllRows \} from "@\/lib\/readAllRows";/);
});
