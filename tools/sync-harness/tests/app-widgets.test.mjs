// Widgets: the global glance surface (components/rune2/Widgets.tsx over
// lib/rune2/widgets.ts).
//
//   * one board per writer, two sizes, order is the whole of the layout
//   * a stored layout is read defensively: unknown ids, duplicates and
//     unsupported sizes never reach the board; nothing stored is the default
//   * ACTIVITY widgets are gated: never offered, dropped from a stored layout
//   * reorder / move / add / remove / resize are pure and stable
//   * the goal maths and the goal field's parsing
//   * source contracts: the control is in the tab band and fades with the
//     chrome; live words are mirrored from the editor's own report; no XP,
//     Level, streak or Arena language anywhere on the surface; tokens only
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_DIR } from '../lib/pg.mjs';
import { bundleForTest } from '../lib/bundle.mjs';

const read = (f) => fs.readFileSync(path.join(REPO_DIR, f), 'utf8');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

let w;
before(async () => {
  w = await bundleForTest('src/lib/rune2/widgets.ts', { name: 'widgets' });
});

// ── Catalog ─────────────────────────────────────────────────────────────────

test('every widget has a name, a group and at least one size; the default size is its first', () => {
  for (const def of w.WIDGETS) {
    assert.ok(def.name && def.description, def.id);
    assert.ok(['project', 'writing', 'activity'].includes(def.group), def.id);
    assert.ok(def.sizes.length >= 1, def.id);
    for (const s of def.sizes) assert.ok(['small', 'wide'].includes(s), `${def.id}: ${s}`);
    assert.equal(w.widgetDefinition(def.id), def);
  }
});

test('activity widgets are available (migration 057 made the credit trustworthy); nothing is gated', () => {
  assert.deepEqual(w.gatedWidgets(), []);
  const activity = w.WIDGETS.filter((d) => d.group === 'activity').map((d) => d.id).sort();
  assert.deepEqual(activity, ['dailyGoal', 'todayWords', 'writingActivity', 'writingStreak']);
  assert.deepEqual(w.widgetDefinition('dailyGoal').sizes, ['wide', 'small']);
  assert.deepEqual(w.widgetDefinition('todayWords').sizes, ['small', 'wide']);
  assert.deepEqual(w.widgetDefinition('writingStreak').sizes, ['small']);
  assert.deepEqual(w.widgetDefinition('writingActivity').sizes, ['wide']);
  const offered = w.availableWidgets({ widgets: [] }).map((d) => d.id);
  for (const id of activity) assert.ok(offered.includes(id), id);
});

test('the default board uses only trustworthy widgets, each at a size it supports', () => {
  const ids = w.DEFAULT_WIDGET_LAYOUT.widgets.map((p) => p.id);
  // Today's Words is on the default board; the streak and the calendar are opt-in.
  assert.deepEqual(ids, ['projectWords', 'todayWords', 'goal', 'currentScene', 'revisionNotes', 'milestone', 'recent']);
  assert.ok(!ids.includes('writingStreak') && !ids.includes('writingActivity') && !ids.includes('dailyGoal'), 'opt-in');
  // No hole in the two-column grid: every Small is paired before a Wide.
  let col = 0;
  for (const p of w.DEFAULT_WIDGET_LAYOUT.widgets) {
    if (p.size === 'wide') assert.equal(col, 0, `${p.id} would leave a hole`);
    col = p.size === 'wide' ? 0 : (col + 1) % 2;
  }
  assert.equal(new Set(ids).size, ids.length);
  for (const p of w.DEFAULT_WIDGET_LAYOUT.widgets) {
    const def = w.widgetDefinition(p.id);
    assert.ok(def.available, p.id);
    assert.ok(def.sizes.includes(p.size), `${p.id} at ${p.size}`);
  }
  // Goal is wide by default — a line needs room; Revision Notes is small only.
  assert.equal(w.DEFAULT_WIDGET_LAYOUT.widgets.find((p) => p.id === 'goal').size, 'wide');
  assert.deepEqual(w.widgetDefinition('revisionNotes').sizes, ['small']);
});

// ── Reading a stored layout ─────────────────────────────────────────────────

test('nothing stored reads as the default board; a stored empty board stays empty', () => {
  assert.equal(w.readWidgetLayout(null), w.DEFAULT_WIDGET_LAYOUT);
  assert.equal(w.readWidgetLayout(undefined), w.DEFAULT_WIDGET_LAYOUT);
  assert.equal(w.readWidgetLayout('junk'), w.DEFAULT_WIDGET_LAYOUT);
  assert.equal(w.readWidgetLayout({ widgets: 'junk' }), w.DEFAULT_WIDGET_LAYOUT);
  assert.deepEqual(w.readWidgetLayout({ v: 1, widgets: [] }), { widgets: [] });
});

test('a stored layout is read defensively: unknown, duplicate, gated and mis-sized widgets', () => {
  const stored = {
    v: 1,
    widgets: [
      { id: 'goal', size: 'small' },
      { id: 'nope', size: 'wide' },
      { id: 'goal', size: 'wide' }, // duplicate: the first stands
      { id: 'writingHistory', size: 'wide' }, // a withdrawn id: dropped
      { id: 'revisionNotes', size: 'wide' }, // unsupported size: its default
      { id: 'recent' }, // no size: its default
      'projectWords', // a bare id
      42,
    ],
  };
  assert.deepEqual(w.readWidgetLayout(stored).widgets, [
    { id: 'goal', size: 'small' },
    { id: 'revisionNotes', size: 'small' },
    { id: 'recent', size: 'wide' },
    { id: 'projectWords', size: 'small' },
  ]);
});

test('what is stored is what is read back', () => {
  const layout = { widgets: [{ id: 'recent', size: 'wide' }, { id: 'milestone', size: 'wide' }] };
  const stored = w.serializeWidgetLayout(layout);
  assert.equal(stored.v, w.WIDGET_LAYOUT_VERSION);
  assert.deepEqual(w.readWidgetLayout(JSON.parse(JSON.stringify(stored))), layout);
});

// ── Arranging ───────────────────────────────────────────────────────────────

const board = () => ({
  widgets: [
    { id: 'projectWords', size: 'small' },
    { id: 'goal', size: 'wide' },
    { id: 'recent', size: 'wide' },
  ],
});
const ids = (l) => l.widgets.map((p) => p.id);

test('reorderWidget puts a widget at an index, clamped, and is a no-op in place', () => {
  const b = board();
  assert.deepEqual(ids(w.reorderWidget(b, 'recent', 0)), ['recent', 'projectWords', 'goal']);
  assert.deepEqual(ids(w.reorderWidget(b, 'projectWords', 99)), ['goal', 'recent', 'projectWords']);
  assert.deepEqual(ids(w.reorderWidget(b, 'goal', -5)), ['goal', 'projectWords', 'recent']);
  assert.equal(w.reorderWidget(b, 'goal', 1), b);
  assert.equal(w.reorderWidget(b, 'milestone', 0), b);
});

test('moveWidget steps one place earlier or later and stops at the ends', () => {
  const b = board();
  assert.deepEqual(ids(w.moveWidget(b, 'goal', 'earlier')), ['goal', 'projectWords', 'recent']);
  assert.deepEqual(ids(w.moveWidget(b, 'goal', 'later')), ['projectWords', 'recent', 'goal']);
  assert.equal(w.moveWidget(b, 'projectWords', 'earlier'), b);
  assert.equal(w.moveWidget(b, 'recent', 'later'), b);
});

test('addWidget appends at the default size, once, and never an unknown widget', () => {
  const b = board();
  const added = w.addWidget(b, 'milestone');
  assert.deepEqual(added.widgets[3], { id: 'milestone', size: 'small' });
  assert.equal(w.addWidget(added, 'milestone'), added);
  assert.deepEqual(
    w.availableWidgets(added).map((d) => d.id),
    ['revisionNotes', 'currentScene', 'timer', 'todayWords', 'dailyGoal', 'writingStreak', 'writingActivity']
  );
});

test('removeWidget and setWidgetSize', () => {
  const b = board();
  assert.deepEqual(ids(w.removeWidget(b, 'goal')), ['projectWords', 'recent']);
  assert.equal(w.removeWidget(b, 'milestone'), b);
  assert.equal(w.setWidgetSize(b, 'goal', 'small').widgets[1].size, 'small');
  assert.equal(w.setWidgetSize(b, 'goal', 'wide'), b, 'same size: same layout');
  assert.equal(w.setWidgetSize(b, 'recent', 'small'), b, 'Recent is wide only');
});

// ── Recents ─────────────────────────────────────────────────────────────────

test('pushRecent keeps newest first, once each, to the limit', () => {
  let r = [];
  for (let i = 0; i < 12; i++) r = w.pushRecent(r, `o${i}`);
  assert.equal(r.length, w.RECENT_LIMIT);
  assert.equal(r[0], 'o11');
  r = w.pushRecent(r, 'o5');
  assert.equal(r[0], 'o5');
  assert.equal(r.filter((x) => x === 'o5').length, 1);
  assert.deepEqual(w.readRecent(['a', 'a', 3, 'b']), ['a', 'b']);
  assert.deepEqual(w.readRecent('junk'), []);
});

// ── Goal ────────────────────────────────────────────────────────────────────

test('goalProgress: a share capped at the whole, a floor percent, words to go', () => {
  assert.deepEqual(w.goalProgress(41208, 80000), { share: 0.5151, percent: 51, remaining: 38792 });
  assert.deepEqual(w.goalProgress(90000, 80000), { share: 1, percent: 100, remaining: 0 });
  assert.deepEqual(w.goalProgress(0, 80000), { share: 0, percent: 0, remaining: 80000 });
  assert.deepEqual(w.goalProgress(100, 0), { share: 0, percent: 0, remaining: 0 });
});

test('parseGoalTarget accepts typed numbers with separators and refuses the rest', () => {
  assert.deepEqual(w.parseGoalTarget('80,000'), { target: 80000, error: null });
  assert.deepEqual(w.parseGoalTarget(' 80 000 '), { target: 80000, error: null });
  assert.equal(w.parseGoalTarget('').target, null);
  assert.equal(w.parseGoalTarget('eighty').target, null);
  assert.equal(w.parseGoalTarget('0').target, null);
  assert.equal(w.parseGoalTarget('99999999').target, null);
});

// ── Source contracts ────────────────────────────────────────────────────────

test('the Widgets control is in the tab band, at its far right, and fades with the chrome', () => {
  const tabs = code(read('src/components/rune2/Rune2Tabs.tsx'));
  assert.match(tabs, /<WidgetsControl \/>/);
  const css = read('src/app/(rune2)/rune2.css');
  assert.match(css, /\.r2-tabs-widgets \{[^}]*margin-left: auto/);
  assert.match(css, /\.r2-shell\[data-writing\] \.r2-tabs-widgets/);
  const widgets = code(read('src/components/rune2/Widgets.tsx'));
  assert.match(widgets, /aria-label="Widgets"/);
  assert.match(widgets, /aria-haspopup="dialog"/);
  assert.match(widgets, /role="dialog"/);
  assert.doesNotMatch(widgets, /aria-modal/, 'a non-modal surface: the app stays usable beneath');
});

test('live words are mirrored from the editor\'s own per-Scene report, never from a second count', () => {
  const editor = code(read('src/components/rune2/Rune2Editor.tsx'));
  assert.match(editor, /reportLiveWords\(sceneId, state\?\.words \?\? null\)/);
  const widgets = code(read('src/components/rune2/Widgets.tsx'));
  assert.match(widgets, /useLiveWords\(\)/);
  // Never on the save path: the save engine is never imported; the device
  // store is only read (the queued credit ids, to reconcile Today's Words).
  assert.doesNotMatch(widgets, /lib\/offline\/syncEngine/);
  assert.doesNotMatch(widgets, /useSceneEditor/);
  assert.match(widgets, /getAll\("pending_writing_credits"\)/);
  assert.doesNotMatch(widgets, /\.(put|delete|clear)\("pending_writing_credits"/);
});

test('no gamification on the surface: activity reads its own ledger action, never XP, levels, Arena or the legacy stats reads', () => {
  const widgets = code(read('src/components/rune2/Widgets.tsx'));
  for (const word of ['XP', 'Level', 'Arena', 'ticket', 'unlock', 'badge', 'getTodayWords', 'getWordsByDay', 'getWritingStreak', 'getContributionHistory', 'lib/xp', 'pulse']) {
    assert.doesNotMatch(widgets, new RegExp(`\\b${word}\\b`), word);
  }
  assert.match(widgets, /readWritingActivity/);
  // The streak is information: no flames, warnings or guilt.
  for (const word of ['flame', 'fire', '🔥', "Don’t lose", "Don't lose", 'keep it up', 'missed']) assert.doesNotMatch(widgets, new RegExp(word, 'i'), word);
});

test('the Widgets styles read tokens only — no hardcoded colour, no accent frame', () => {
  const css = read('src/app/(rune2)/rune2.css');
  const section = css.slice(css.indexOf('Widgets (the global glance surface)'));
  assert.ok(section.length > 1000);
  assert.doesNotMatch(code(section), /#[0-9a-fA-F]{3,8}\b/, 'no hex colours');
  assert.doesNotMatch(code(section), /rgba?\(/, 'no literal colours');
  // The accent says state (the progress line, the chosen size) and never frames a card.
  assert.doesNotMatch(code(section), /\.r2-widget \{[^}]*--r2-accent/);
  assert.match(section, /\.r2-widget-progress-fill \{[^}]*var\(--r2-accent\)/);
});

test('persistence is device-local per writer, with no migration', () => {
  const storage = read('src/lib/rune2/widgetStorage.ts');
  assert.match(storage, /rune:widgets:/);
  assert.match(storage, /localStorage/);
  const migrations = fs.readdirSync(path.join(REPO_DIR, 'src/lib/supabase/migrations'));
  assert.ok(!migrations.some((f) => /widget/i.test(f)), 'no widget migration');
});

test('the Writing Activity display is a widget option: stored only when it is "goal", read back, dropped for any other widget or value', () => {
  const b = { widgets: [{ id: 'writingActivity', size: 'wide' }, { id: 'todayWords', size: 'small' }] };
  const goal = w.setActivityDisplay(b, 'goal');
  assert.deepEqual(goal.widgets[0], { id: 'writingActivity', size: 'wide', options: { display: 'goal' } });
  assert.equal(w.activityDisplayOf(goal.widgets[0]), 'goal');
  assert.equal(w.activityDisplayOf(b.widgets[0]), 'words');
  assert.equal(w.setActivityDisplay(goal, 'goal'), goal, 'same: same layout');
  assert.deepEqual(w.setActivityDisplay(goal, 'words').widgets[0], { id: 'writingActivity', size: 'wide' }, 'the default is stored as nothing');
  assert.equal(w.setActivityDisplay({ widgets: [{ id: 'todayWords', size: 'small' }] }, 'goal').widgets[0].options, undefined, 'not on the board: nothing');
  // Persisted with the layout, read back; a size change keeps it; junk is dropped.
  const stored = JSON.parse(JSON.stringify(w.serializeWidgetLayout(goal)));
  assert.deepEqual(w.readWidgetLayout(stored), goal);
  assert.deepEqual(w.setWidgetSize(goal, 'writingActivity', 'wide'), goal);
  assert.deepEqual(w.readWidgetLayout({ v: 1, widgets: [{ id: 'writingActivity', size: 'wide', options: { display: 'rainbow' } }, { id: 'todayWords', size: 'small', options: { display: 'goal' } }] }).widgets,
    [{ id: 'writingActivity', size: 'wide' }, { id: 'todayWords', size: 'small' }]);
});
