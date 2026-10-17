// The writing timer (the Timer widget: lib/rune2/timer.ts, lib/rune2/
// timerStorage.ts, components/rune2/useWritingTimer.ts, Widgets.tsx).
//
//   * timestamps are the truth: start, pause, resume, reset and completion
//     resolve from `now`, so a throttled tab, a sleeping device or a long
//     absence all land on the right remaining time — or on "finished"
//   * the stored shape round-trips and is read defensively
//   * the widget is in the catalog, in the Writing group, at both sizes
//   * the control carries a quiet mark while running and a warm, one-time
//     attention when finished; opening Widgets acknowledges it; reduced
//     motion keeps the mark alone
//   * it is a tool: no writing credit, no sessions, no goal, no analytics,
//     no sound, no dialog, no Project data, no migration
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_DIR } from '../lib/pg.mjs';
import { bundleForTest } from '../lib/bundle.mjs';

const read = (f) => fs.readFileSync(path.join(REPO_DIR, f), 'utf8');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const MIN = 60_000;

let t, storage, w;
before(async () => {
  t = await bundleForTest('src/lib/rune2/timer.ts', { name: 'timer' });
  storage = await bundleForTest('src/lib/rune2/timerStorage.ts', { name: 'timer_storage' });
  w = await bundleForTest('src/lib/rune2/widgets.ts', { name: 'timer_widgets' });
});

// ── The model ────────────────────────────────────────────────────────────────

test('the default is an idle 25-minute timer; a duration is whole minutes within 1–120, chosen only while idle', () => {
  assert.deepEqual(t.DEFAULT_TIMER, { status: 'idle', durationMs: 25 * MIN });
  assert.equal(t.TIMER_MAX_MINUTES, 120);
  assert.deepEqual(t.setDuration(t.DEFAULT_TIMER, 45), { status: 'idle', durationMs: 45 * MIN });
  assert.deepEqual(t.setDuration(t.DEFAULT_TIMER, 0), { status: 'idle', durationMs: 1 * MIN });
  assert.deepEqual(t.setDuration(t.DEFAULT_TIMER, 999), { status: 'idle', durationMs: 120 * MIN });
  assert.deepEqual(t.setDuration(t.DEFAULT_TIMER, 12.4), { status: 'idle', durationMs: 12 * MIN });
  assert.equal(t.setDuration(t.DEFAULT_TIMER, 25), t.DEFAULT_TIMER, 'the same duration is the same state');
  const running = t.start(t.DEFAULT_TIMER, 1000);
  assert.equal(t.setDuration(running, 10), running, 'a running timer keeps its duration');
  assert.equal(t.TIMER_PRESETS_MIN, undefined, 'no preset keypad');
  assert.equal(t.parseMinutes, undefined, 'no typed-duration form');
});

test('the scale: a press chooses the nearest five minutes (never below five, never past 120); the keyboard steps to the next five, or by one with Shift; positions are shares of 120', () => {
  assert.equal(t.SCALE_MAX_MINUTES, 120);
  assert.equal(t.SCALE_STEP_MINUTES, 5);
  assert.equal(t.scaleShare(30), 0.25);
  assert.equal(t.scaleShare(0), 0);
  assert.equal(t.scaleShare(500), 1);
  assert.equal(t.minutesAtShare(0), 5);
  assert.equal(t.minutesAtShare(-3), 5);
  assert.equal(t.minutesAtShare(1), 120);
  assert.equal(t.minutesAtShare(2), 120);
  assert.equal(t.minutesAtShare(25 / 120), 25);
  assert.equal(t.minutesAtShare(27 / 120), 25);
  assert.equal(t.minutesAtShare(28 / 120), 30);
  assert.equal(t.minutesAtShare(NaN), 5);
  assert.equal(t.stepMinutes(25, 1), 30);
  assert.equal(t.stepMinutes(25, -1), 20);
  assert.equal(t.stepMinutes(7, 1), 10, 'off the grid: to the next five');
  assert.equal(t.stepMinutes(7, -1), 5);
  assert.equal(t.stepMinutes(25, 1, true), 26);
  assert.equal(t.stepMinutes(25, -1, true), 24);
  assert.equal(t.stepMinutes(5, -1), 1, 'never below a minute');
  assert.equal(t.stepMinutes(1, -1, true), 1);
  assert.equal(t.stepMinutes(120, 1), 120);
});

test('start → running with an end time; remaining is end − now; pause keeps what remains; resume sets a new end from what remained; reset is idle with the duration kept', () => {
  const s0 = t.setDuration(t.DEFAULT_TIMER, 10);
  const s1 = t.start(s0, 1_000_000);
  assert.deepEqual(s1, { status: 'running', durationMs: 10 * MIN, startedAt: 1_000_000, endsAt: 1_000_000 + 10 * MIN });
  assert.equal(t.remainingMs(s1, 1_000_000), 10 * MIN);
  assert.equal(t.remainingMs(s1, 1_000_000 + 4 * MIN), 6 * MIN);
  assert.equal(t.remainingShare(s1, 1_000_000 + 4 * MIN), 0.6);
  const s2 = t.pause(s1, 1_000_000 + 4 * MIN);
  assert.deepEqual(s2, { status: 'paused', durationMs: 10 * MIN, startedAt: 1_000_000, remainingMs: 6 * MIN });
  assert.equal(t.remainingMs(s2, 1_000_000 + 60 * MIN), 6 * MIN, 'paused: time does not pass');
  const s3 = t.resume(s2, 2_000_000);
  assert.deepEqual(s3, { status: 'running', durationMs: 10 * MIN, startedAt: 1_000_000, endsAt: 2_000_000 + 6 * MIN });
  assert.deepEqual(t.reset(s3), { status: 'idle', durationMs: 10 * MIN });
  assert.equal(t.reset(s0), s0);
  // Wrong-state transitions are no-ops.
  assert.equal(t.pause(s0, 0), s0);
  assert.equal(t.resume(s1, 0), s1);
  assert.equal(t.start(s1, 0), s1);
});

test('completion: resolve turns a running timer past its end into complete AS OF the moment it ended (a background tab, a sleeping device, an hour away); pause past the end completes too; start again from complete; acknowledge once', () => {
  const s1 = t.start(t.setDuration(t.DEFAULT_TIMER, 25), 100_000);
  assert.equal(t.resolve(s1, 100_000 + 25 * MIN - 1), s1, 'not yet');
  const done = t.resolve(s1, 100_000 + 25 * MIN + 47 * MIN);
  assert.deepEqual(done, { status: 'complete', durationMs: 25 * MIN, startedAt: 100_000, completedAt: 100_000 + 25 * MIN, acknowledged: false, notified: false });
  assert.equal(t.owesNotice(done), true, 'a fresh finish owes its note');
  assert.equal(t.remainingMs(done, 0), 0);
  assert.equal(t.remainingShare(done, 0), 0);
  assert.equal(t.resolve(done, 999_999_999), done);
  const paused = t.pause(s1, 100_000 + 25 * MIN + 5);
  assert.equal(paused.status, 'complete');
  const ack = t.acknowledge(done);
  assert.equal(ack.acknowledged, true);
  assert.equal(ack.notified, true, 'opening Widgets is seeing it: no note is owed any more');
  assert.equal(t.owesNotice(ack), false);
  assert.equal(t.acknowledge(ack), ack);
  const noticed = t.markNotified(done);
  assert.deepEqual([noticed.notified, noticed.acknowledged], [true, false], 'the note shown: the Widgets dot stays');
  assert.equal(t.owesNotice(noticed), false);
  assert.equal(t.markNotified(noticed), noticed);
  assert.equal(t.markNotified(s1), s1);
  assert.equal(t.acknowledge(s1), s1);
  const again = t.start(done, 5_000_000);
  assert.deepEqual(again, { status: 'running', durationMs: 25 * MIN, startedAt: 5_000_000, endsAt: 5_000_000 + 25 * MIN });
  // Exactly at the end: complete (never a running 0:00).
  assert.equal(t.resolve(s1, 100_000 + 25 * MIN).status, 'complete');
});

test('display: m:ss rounded up so a running timer never shows 0:00, h:mm:ss past an hour; the duration in words; the screen-reader text changes by the minute, never by the second; the tick lands on the next whole second', () => {
  assert.equal(t.formatRemaining(25 * MIN), '25:00');
  assert.equal(t.formatRemaining(4 * MIN + 7_000), '4:07');
  assert.equal(t.formatRemaining(999), '0:01');
  assert.equal(t.formatRemaining(1), '0:01');
  assert.equal(t.formatRemaining(0), '0:00');
  assert.equal(t.formatRemaining(60 * MIN), '1:00:00');
  assert.equal(t.formatRemaining(75 * MIN + 3_000), '1:15:03');
  assert.equal(t.formatDuration(25 * MIN), '25 minutes');
  assert.equal(t.formatDuration(1 * MIN), '1 minute');
  assert.equal(t.formatDuration(60 * MIN), '1 hour');
  assert.equal(t.formatDuration(75 * MIN), '1 hour 15 minutes');
  assert.equal(t.describeRemaining(24 * MIN + 59_000), '25 minutes remaining');
  assert.equal(t.describeRemaining(24 * MIN + 1), '25 minutes remaining');
  assert.equal(t.describeRemaining(24 * MIN), '24 minutes remaining');
  assert.equal(t.describeRemaining(30_000), 'Under a minute remaining');
  assert.equal(t.describeRemaining(0), 'Finished');
  const s = t.start(t.DEFAULT_TIMER, 10_000);
  assert.equal(t.msUntilNextSecond(s, 10_000), 1000);
  assert.equal(t.msUntilNextSecond(s, 10_350), 650);
  assert.equal(t.msUntilNextSecond(s, 10_000 + 25 * MIN), 0);
  assert.equal(t.msUntilNextSecond(t.DEFAULT_TIMER, 0), 0);
});

// ── The stored shape ─────────────────────────────────────────────────────────

test('the note says the duration in words: "Twenty-five minutes", "One minute", "An hour and ten minutes", "Two hours"', () => {
  assert.equal(t.durationInWords(25 * MIN), 'Twenty-five minutes');
  assert.equal(t.durationInWords(1 * MIN), 'One minute');
  assert.equal(t.durationInWords(5 * MIN), 'Five minutes');
  assert.equal(t.durationInWords(15 * MIN), 'Fifteen minutes');
  assert.equal(t.durationInWords(40 * MIN), 'Forty minutes');
  assert.equal(t.durationInWords(60 * MIN), 'An hour');
  assert.equal(t.durationInWords(70 * MIN), 'An hour and ten minutes');
  assert.equal(t.durationInWords(91 * MIN), 'An hour and thirty-one minutes');
  assert.equal(t.durationInWords(120 * MIN), 'Two hours');
});

test('what is stored is what is read back, for every state; anything odd reads as the default or as idle with the duration; the key is per writer', () => {
  const states = [
    t.DEFAULT_TIMER,
    t.start(t.setDuration(t.DEFAULT_TIMER, 45), 1000),
    t.pause(t.start(t.DEFAULT_TIMER, 1000), 61_000),
    t.resolve(t.start(t.DEFAULT_TIMER, 1000), 99_999_999),
    t.acknowledge(t.resolve(t.start(t.DEFAULT_TIMER, 1000), 99_999_999)),
    t.markNotified(t.resolve(t.start(t.DEFAULT_TIMER, 1000), 99_999_999)),
  ];
  for (const s of states) {
    const stored = JSON.parse(JSON.stringify(t.serializeTimer(s)));
    assert.equal(stored.v, t.TIMER_STORAGE_VERSION);
    assert.deepEqual(t.readTimer(stored), s);
  }
  assert.deepEqual(t.readTimer(null), t.DEFAULT_TIMER);
  const old = t.readTimer({ v: 1, status: 'complete', durationMs: 10 * MIN, startedAt: 1, completedAt: 2, acknowledged: false });
  assert.equal(old.notified, true, 'a finish stored before the note existed never surfaces as a note');
  assert.deepEqual(t.readTimer('nonsense'), t.DEFAULT_TIMER);
  assert.deepEqual(t.readTimer({ v: 1, status: 'running' }), t.DEFAULT_TIMER, 'no duration: the default');
  assert.deepEqual(t.readTimer({ v: 1, status: 'running', durationMs: 10 * MIN }), { status: 'idle', durationMs: 10 * MIN }, 'a running timer without its end: idle');
  assert.deepEqual(t.readTimer({ v: 1, status: 'paused', durationMs: 10 * MIN, startedAt: 1, remainingMs: 11 * MIN }), { status: 'idle', durationMs: 10 * MIN }, 'more remaining than the duration: idle');
  assert.deepEqual(t.readTimer({ v: 1, status: 'weird', durationMs: 10 * MIN }), { status: 'idle', durationMs: 10 * MIN });
  assert.deepEqual(t.readTimer({ v: 1, status: 'idle', durationMs: 5 * 60 * MIN }), t.DEFAULT_TIMER, 'out of range: the default');
  assert.equal(storage.timerKey('u1'), 'rune:timer:u1');
  assert.notEqual(storage.timerKey('u1'), storage.timerKey('u2'));

  // Through the device store, with a fake window: written, read back, resolved by the clock on read.
  const bag = new Map();
  globalThis.window = { localStorage: { getItem: (k) => bag.get(k) ?? null, setItem: (k, v) => bag.set(k, String(v)) } };
  try {
    const running = t.start(t.DEFAULT_TIMER, 1000);
    storage.writeStoredTimer('u1', running);
    assert.deepEqual(storage.readStoredTimer('u1'), running);
    assert.deepEqual(storage.readStoredTimer('u2'), t.DEFAULT_TIMER, 'another writer: the default');
    assert.deepEqual(t.resolve(storage.readStoredTimer('u1'), 1000 + 26 * MIN).status, 'complete', 'read after the end: finished');
    bag.set(storage.timerKey('u1'), '{not json');
    assert.deepEqual(storage.readStoredTimer('u1'), t.DEFAULT_TIMER);
    globalThis.window = { localStorage: { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } } };
    assert.deepEqual(storage.readStoredTimer('u1'), t.DEFAULT_TIMER);
    storage.writeStoredTimer('u1', running); // never throws
  } finally {
    delete globalThis.window;
  }
});

// ── The widget and the control ───────────────────────────────────────────────

test('the Timer is in the catalog: Writing group, small and wide, available, not on the default board; a stored board with it reads back', () => {
  const def = w.widgetDefinition('timer');
  assert.deepEqual([def.name, def.group, def.sizes, def.available], ['Timer', 'writing', ['small', 'wide'], true]);
  assert.ok(!w.DEFAULT_WIDGET_LAYOUT.widgets.some((p) => p.id === 'timer'), 'opt-in: the first board is unchanged');
  assert.ok(w.availableWidgets(w.DEFAULT_WIDGET_LAYOUT).some((d) => d.id === 'timer'));
  const added = w.addWidget(w.DEFAULT_WIDGET_LAYOUT, 'timer');
  assert.deepEqual(added.widgets.at(-1), { id: 'timer', size: 'small' });
  assert.deepEqual(w.readWidgetLayout(w.serializeWidgetLayout(w.setWidgetSize(added, 'timer', 'wide'))).widgets.at(-1), { id: 'timer', size: 'wide' });
});

test('the widget: the countdown is the anchor (role="timer", minute-level text); the duration is set on a scale whose marker is a labelled slider (press, drag, arrows, Shift, Home, End, Enter starts); one verb at a time and Reset only when there is something to reset; no presets, no form', () => {
  const widgets = code(read('src/components/rune2/Widgets.tsx'));
  const block = widgets.slice(widgets.indexOf('function TimerWidget'), widgets.indexOf('function DailyGoalWidget'));
  assert.match(widgets, /case "timer":\s*return <TimerWidget size=\{size\} \/>;/);
  assert.match(block, /className="r2-timer-count"\s+role="timer"/);
  assert.match(block, /aria-label=\{\s*idle\s*\?\s*`\$\{formatDuration\(shownMinutes \* MINUTE_MS\)\} set`\s*:\s*describeRemaining\(left\)\s*\}/);
  assert.match(block, /role: "slider"/);
  assert.match(block, /"aria-label": "Duration"/);
  assert.match(block, /"aria-valuetext": formatDuration\(shownMinutes \* MINUTE_MS\)/);
  assert.match(block, /setPointerCapture/);
  assert.match(block, /minutesAtShare\(/);
  assert.match(block, /stepMinutes\(minutes, 1, e\.shiftKey\)/);
  assert.match(block, /e\.key === "Home"/);
  assert.match(block, /e\.key === "End"/);
  assert.match(block, /e\.key === "Enter"[\s\S]{0,80}timer\.start\(\)/);
  for (const label of ['Start', 'Pause', 'Resume', 'Reset', 'Start again']) assert.match(block, new RegExp(`>\\s*${label}\\s*<`), label);
  assert.match(block, /state\.status !== "idle" && \(\s*<button[\s\S]{0,240}?timer\.reset\(\)[\s\S]{0,80}?>\s*Reset\s*</, 'Reset only once there is something to reset');
  assert.doesNotMatch(block, /<input|<form|r2-chip|r2-button|PRESETS|Custom/, 'no keypad, no form, no pills');
  // The drag is shown live and saved once, when the press ends.
  assert.match(block, /const onScaleUp = \(\) => \{\s*if \(draft === null\) return;\s*timer\.setMinutes\(draft\);/);
  const hook = code(read('src/components/rune2/useWritingTimer.ts'));
  assert.match(hook, /resolve\(store\.state, now\)/, 'resolved from the clock');
  assert.match(hook, /msUntilNextSecond/, 'a tick, not a counter');
  assert.match(hook, /visibilitychange/, 'a tab coming back to the front reads the clock');
  assert.match(hook, /addEventListener\("storage"/, 'another tab\'s change arrives');
  assert.match(hook, /writeStoredTimer\(store\.userId/);
  assert.doesNotMatch(hook, /setInterval/, 'never a decrementing counter');
});

test('the widget styles: the count in the book\'s serif with even figures; the scale is ink and hairline, never the accent; ticks fade when it runs and the marker travels a second at a time; Small and Wide compositions; reduced motion stills it', () => {
  const css = read('src/app/(rune2)/rune2.css');
  const block = code(css.slice(css.indexOf('/* ── Timer ──'), css.indexOf("/* ── The timer's quiet note")));
  assert.ok(block.length > 2000);
  assert.match(block, /--r2-timer-face: "EB Garamond"/);
  assert.match(block, /\.r2-timer-count \{[^}]*font-family: var\(--r2-timer-face\)[^}]*font-variant-numeric: lining-nums tabular-nums/);
  assert.doesNotMatch(block, /--r2-accent|--r2-danger|--r2-font-serif/);
  assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  assert.match(block, /:not\(\[data-state="idle"\]\) :is\(\.r2-timer-ticks, \.r2-timer-labels\) \{\s*opacity: 0;/);
  assert.match(block, /\[data-state="running"\] \.r2-timer-knob \{[^}]*transition: left 1s linear/);
  assert.match(block, /\[data-state="complete"\] \.r2-timer-count[^{]*\{\s*color: var\(--r2-complete\)/);
  assert.match(block, /\.r2-widget-face--timer \{[^}]*"head head"\s*"count count"\s*"scale scale"\s*"actions actions"/, 'Small: the verbs under the scale');
  assert.match(block, /\[data-size="wide"\] \{\s*grid-template-areas:\s*"head head"\s*"count actions"\s*"scale scale"/, 'Wide: the verbs beside the count');
  assert.match(block, /@media \(prefers-reduced-motion: reduce\) \{[^}]*\.r2-timer-knob[^}]*transition: none;/);
});

test('the control: a mark while running; finished → one attention animation (under a second, once), the warm completion tone, a dot that stays until Widgets is opened; a finish while the board is open is seen there; reduced motion keeps the dot alone', () => {
  const widgets = code(read('src/components/rune2/Widgets.tsx'));
  assert.match(widgets, /data-timer=\{timerMark\}/);
  assert.match(widgets, /data-timer-finished=\{\(timerMark === "complete" && timer\.finishedHere\) \|\| undefined\}/);
  assert.match(widgets, /const show = \(\) => \{\s*timer\.acknowledge\(\);/, 'opening Widgets clears the mark');
  assert.match(widgets, /if \(open && finishedUnseen\) acknowledge\(\);/);
  assert.doesNotMatch(widgets, /timer\.announcement|aria-live="assertive"/, 'the note announces, once; the control does not');
  const css = read('src/app/(rune2)/rune2.css');
  const section = css.slice(css.indexOf('Widgets (the global glance surface)'));
  assert.match(section, /\.r2-tabs-widgets-mark \{[^}]*background: var\(--r2-accent\)/);
  assert.match(section, /\.r2-tabs-widgets\[data-timer="complete"\] \.r2-tabs-widgets-mark \{[^}]*background: var\(--r2-complete\)/);
  const attention = /\.r2-tabs-widgets\[data-timer-finished\] \{\s*animation: r2-timer-attention ([\d.]+)s [^;]*? 1 both;/.exec(section);
  assert.ok(attention, 'one attention animation');
  assert.ok(parseFloat(attention[1]) < 1, 'under a second');
  assert.match(section, /@media \(prefers-reduced-motion: reduce\) \{\s*\.r2-tabs-widgets\[data-timer-finished\] \{\s*animation: none;/);
  assert.doesNotMatch(section.slice(section.indexOf('r2-timer-attention')), /infinite/, 'nothing repeats');
});

test('the note: mounted once for every signed-in page, outside the shell (so it shows with the chrome receded); shown once per finish, only with the window in front, marked at once so no other window or reload repeats it; never when the Timer card is open on the board', () => {
  const layout = code(read('src/app/(rune2)/layout.tsx'));
  assert.match(layout, /<HintsProvider[^>]*>\{children\}<\/HintsProvider>\s*(\{\}\s*)?<TimerNotice \/>/);
  const notice = code(read('src/components/rune2/TimerNotice.tsx'));
  assert.match(notice, /owesNotice\(state\)/);
  assert.match(notice, /if \(!owed \|\| !visible\) return;/, 'a finish in a background tab waits for the writer to come back');
  assert.match(notice, /document\.visibilityState === "visible"/);
  assert.match(notice, /requestAnimationFrame\(\(\) => \{\s*if \(document\.querySelector\('\.r2-widgets \[data-widget="timer"\]'\)\) markNotified\(\);\s*else showNotice\(\);/);
  // The note on screen lives in the timer store, not the component: a remount of the page (the device gate settling) never loses one already marked shown.
  const hook = code(read('src/components/rune2/useWritingTimer.ts'));
  assert.match(hook, /const showNotice = useCallback\(\(\) => \{\s*const st = store\.state;\s*if \(!owesNotice\(st\) \|\| st\.status !== "complete"\) return;\s*apply\(markTimerNotified\(st\)\);\s*set\(\{ notice: \{ completedAt: st\.completedAt, durationMs: st\.durationMs \} \}\);/);
  assert.doesNotMatch(notice, /useState<[^>]*Shown/, 'no component-local copy of the note');
  assert.match(notice, /state\.completedAt === shown\.completedAt && !state\.acknowledged/, 'gone when Widgets is opened, on a new run or a reset');
});

test('the note never interrupts: no focus taken (no autofocus, a press keeps the caret where it was), a quiet dismiss, one polite announcement, its time counted only while it can be seen and not while the pointer rests on it; no sound, no browser notification, no dialog', () => {
  const notice = code(read('src/components/rune2/TimerNotice.tsx'));
  assert.doesNotMatch(notice, /autoFocus|\.focus\(/, 'never takes focus');
  assert.match(notice, /onMouseDown=\{\(e\) => e\.preventDefault\(\)\}/, 'a press never moves the caret out of the editor');
  assert.match(notice, /aria-label="Dismiss"/);
  assert.match(notice, /<span role="status" className="sr-only">/);
  assert.doesNotMatch(notice, /role="alert"|role="dialog"|aria-live="assertive"|aria-modal/);
  assert.doesNotMatch(notice, /new Audio|\.play\(|Notification|requestPermission|alert\(|confirm\(/);
  assert.match(notice, /if \(!visible \|\| held\) return;/, 'held while hidden or hovered');
  assert.match(notice, /export const NOTICE_MS = 16_000;/);
  const css = read('src/app/(rune2)/rune2.css');
  const block = code(css.slice(css.indexOf("/* ── The timer's quiet note")));
  assert.match(block, /\.r2-timer-notice-layer \{[^}]*position: fixed;[^}]*width: 0;[^}]*height: 0;[^}]*pointer-events: none;/, 'takes no room: nothing shifts');
  assert.match(block, /\.r2-timer-notice \{[^}]*position: fixed;[^}]*top: 56px;[^}]*right: 16px;/, 'top right, under the tab band');
  assert.match(block, /\.r2-timer-notice-mark \{[^}]*background: var\(--r2-complete\)/);
  assert.match(block, /r2-timer-notice-breath [^;]* 1 both;/, 'the bead breathes once');
  assert.doesNotMatch(block.slice(0, block.indexOf('@media (prefers-reduced-motion')), /--r2-danger|infinite|--r2-accent/);
  assert.match(block, /@media \(prefers-reduced-motion: reduce\) \{\s*\.r2-timer-notice,\s*\.r2-timer-notice-mark \{\s*animation: none;/);
});

test('it is a tool: the timer never touches writing credit, sessions, goals, XP, analytics, sounds, notifications or Project data, and needs no migration', () => {
  for (const f of ['src/lib/rune2/timer.ts', 'src/lib/rune2/timerStorage.ts', 'src/components/rune2/useWritingTimer.ts', 'src/components/rune2/TimerNotice.tsx']) {
    const src = code(read(f));
    for (const word of ['writing_sessions', 'writingActivity', 'recordWordsWritten', 'writingCredit', 'dailyGoal', 'writing_goals', 'trackEvent', 'analytics', 'Notification', 'Audio', 'alert(', 'confirm(', 'XP', 'streak', 'projectId', 'project_id']) {
      assert.doesNotMatch(src, new RegExp(word.replace(/[()]/g, '\\$&')), `${f}: ${word}`);
    }
  }
  const widgets = code(read('src/components/rune2/Widgets.tsx'));
  const timerBlock = widgets.slice(widgets.indexOf('function TimerWidget'), widgets.indexOf('function DailyGoalWidget'));
  for (const word of ['useWritingActivity', 'recordWordsWritten', 'trackEvent', 'Notification', 'Audio', 'alert(', 'confirm(', 'session', 'Pomodoro', 'break', 'Focus session']) {
    assert.doesNotMatch(timerBlock, new RegExp(word.replace(/[()]/g, '\\$&'), 'i'), word);
  }
  assert.doesNotMatch(widgets, /new Audio|\.play\(\)|Notification\.requestPermission/);
  const migrations = fs.readdirSync(path.join(REPO_DIR, 'src/lib/supabase/migrations'));
  assert.ok(!migrations.some((f) => /timer/i.test(f)), 'no timer migration');
});
