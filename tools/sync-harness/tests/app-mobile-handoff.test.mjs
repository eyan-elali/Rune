// The mobile acquisition journey (Early Access): a phone may sign up, choose a
// pen name and complete onboarding, and then gets a desktop handoff; the
// workspace itself stays desktop and supported tablet.
//
//   * the account's stage for the device gate comes from the server's
//     onboarding record by the same rule as onboarding and Projects
//     (lib/onboarding.ts accountStage) — "unknown" when a read failed
//   * the gate (components/layout/SupportedDeviceGate.tsx) opens only
//     onboarding to phones; every other route is gated by default, and an
//     unfinished journey is sent to onboarding by a full navigation
//   * the handoff (PhoneWaitingRoom.tsx) says Early Access once, never
//     "Welcome back", never an apology, never a Project title
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readRepoFile } from '../lib/pg.mjs';
import { bundleForTest } from '../lib/bundle.mjs';

let lib, device;
before(async () => {
  lib = await bundleForTest('src/lib/onboarding.ts', { name: 'mh_onboarding' });
  device = await bundleForTest('src/lib/device.ts', { name: 'mh_device' });
});

const code = (f) => readRepoFile(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const row = (r) => ({ path: null, project_id: null, completed_at: null, ...r });

test('stage: a new account belongs in onboarding; a finished journey and a writer from before onboarding are returning; a failed read is unknown', () => {
  const fresh = { projectsEver: 0, hasWritten: false };
  assert.equal(lib.accountStage(null, fresh), 'onboarding', 'no record, nothing made: onboarding');
  assert.equal(lib.accountStage(row({ path: 'new' }), { projectsEver: 1, hasWritten: false }), 'onboarding', 'a Project made on the phone, journey unfinished');
  assert.equal(lib.accountStage(row({ path: 'import' }), fresh), 'onboarding', 'an import still to come keeps the journey open');
  assert.equal(lib.accountStage(row({ path: 'new', project_id: 'p', completed_at: '2026-10-13T00:00:00Z' }), { projectsEver: 1, hasWritten: false }), 'returning');
  assert.equal(lib.accountStage(null, { projectsEver: 3, hasWritten: true }), 'returning', 'a writer from before onboarding is never sent back');
  assert.equal(lib.accountStage(null, { projectsEver: 0, hasWritten: true }), 'returning');
  assert.equal(lib.accountStage(row({}), null), 'unknown');
  assert.equal(lib.accountStage(null, null), 'unknown');
});

test('stage agrees with needsOnboarding for every account, so the gate and onboarding never bounce a phone between them', () => {
  const rows = [null, row({}), row({ path: 'new' }), row({ path: 'import' }), row({ path: 'new', project_id: 'p' }), row({ completed_at: '2026-01-01T00:00:00Z' })];
  for (const r of rows) {
    for (const projectsEver of [0, 1]) {
      for (const hasWritten of [false, true]) {
        const a = { projectsEver, hasWritten };
        assert.equal(lib.accountStage(r, a) === 'onboarding', lib.needsOnboarding(r, a), JSON.stringify({ r, a }));
      }
    }
  }
});

test('a phone that chose import resumes at the importer, with no Project, until the import is done on a computer', () => {
  const r = row({ path: 'import' });
  assert.equal(lib.onboardingStep(r, false), 'import');
  assert.equal(lib.needsOnboarding(r, { projectsEver: 0, hasWritten: false }), true);
});

test('gate: only onboarding is open to phones; an unfinished journey goes to onboarding by a full navigation', () => {
  const gate = code('src/components/layout/SupportedDeviceGate.tsx');
  assert.match(gate, /const PHONE_ROUTES = \["\/onboarding"\];/, 'exactly one phone route');
  assert.match(gate, /window\.location\.replace\("\/onboarding"\)/, 'a full navigation, so the layout re-reads the stage');
  assert.doesNotMatch(gate, /router\.(push|replace)/, 'never a client-side bounce');
  const layout = code('src/app/(rune2)/layout.tsx');
  assert.match(layout, /<SupportedDeviceGate[\s\S]*stage=\{stage\}/, 'the layout passes the server-read stage');
  assert.match(layout, /accountStage\(/);
  assert.doesNotMatch(layout, /variant="returning"/, 'no hardcoded returning variant');
});

test('handoff: Early Access is said once, the copy is completion not rejection, and no Project title reaches it', () => {
  const room = code('src/components/layout/PhoneWaitingRoom.tsx');
  assert.equal(room.match(/Early Access/g)?.length, 1, 'Early Access, once');
  assert.doesNotMatch(room, /open beta|public beta/i, 'never "open beta"');
  assert.match(room, /Sutura is currently in Early Access\. The full writing workspace is available on desktop, with mobile support on\s+the way\./);
  for (const h of ['Your desk is ready.', 'Your writing is waiting.', 'Sutura is ready on desktop.']) assert.ok(room.includes(h), h);
  for (const banned of [/Welcome back/i, /unsupported/i, /isn.t supported/i, /sorry/i, /come back later/i, /still building/i]) {
    assert.doesNotMatch(room, banned, String(banned));
  }
  assert.doesNotMatch(room, /project/i, 'the handoff never takes a Project or its title');
  assert.doesNotMatch(room, /MarketingTrackers|meta-pixel|promotekit/i, 'no marketing trackers behind sign-in');
  const onb = code('src/components/rune2/Onboarding.tsx');
  assert.match(onb, /<DesktopHandoff\b/, 'arrival on a phone is the same handoff');
  assert.doesNotMatch(onb, /beta/i, 'onboarding itself carries no beta disclaimer');
});

test('device: a phone is a phone in portrait and landscape; tablets and desktops are not phones', () => {
  const phone = (coarsePointer, screenWidth, screenHeight) => device.isPhoneDevice({ coarsePointer, screenWidth, screenHeight });
  // Phones, either orientation (the screen's short side decides, not the viewport).
  for (const [w, h] of [[375, 667], [390, 844], [430, 932], [440, 956], [412, 915], [384, 854], [360, 780]]) {
    assert.equal(phone(true, w, h), true, `phone ${w}x${h} portrait`);
    assert.equal(phone(true, h, w), true, `phone ${h}x${w} landscape`);
  }
  // Tablets: coarse, but tablet-sized in both orientations.
  for (const [w, h] of [[744, 1133], [768, 1024], [820, 1180], [834, 1194], [1024, 1366], [800, 1280], [600, 960]]) {
    assert.equal(phone(true, w, h), false, `tablet ${w}x${h}`);
    assert.equal(phone(true, h, w), false, `tablet ${h}x${w}`);
  }
  // Desktops and laptops, touchscreen or not: a fine primary pointer is never a phone.
  for (const [w, h] of [[1512, 982], [1920, 1080], [1366, 768], [1280, 800]]) assert.equal(phone(false, w, h), false);
  assert.equal(phone(false, 390, 844), false, 'a narrow fine-pointer screen keeps the width rule only');
  const gate = code('src/components/layout/SupportedDeviceGate.tsx');
  assert.match(gate, /setIsSupported\(wide\.matches && !phone\)/, 'supported = wide enough AND not a phone');
  assert.match(gate, /window\.screen\.width/, 'the screen, which does not rotate, not the viewport');
});

test('the handoff on a gated route does not keep the route\'s title (a Project title) in the tab', () => {
  assert.match(code('src/components/layout/PhoneWaitingRoom.tsx'), /HANDOFF_TITLE = "Sutura"[\s\S]*MutationObserver\(hold\)/);
});
