// The marketing boundary (closed beta): Meta Pixel and PromoteKit load only
// on the public front door for signed-out visitors, never in the
// authenticated writing product, and no pixel event is sent from an app path
// even if a script loaded on the front door survives a client-side
// navigation. Source-level checks plus the real path gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { readRepoFile, REPO_DIR } from '../lib/pg.mjs';
import { bundleForTest } from '../lib/bundle.mjs';

const TRACKER_MARKERS = [/promotekit\.com/, /connect\.facebook\.net/, /<MetaPixel\b/, /<MarketingTrackers\b/];

function sourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test('marketing scripts: only MarketingTrackers / MetaPixel carry them, and only the front door mounts them', () => {
  const allowed = new Map([
    ['src/components/MarketingTrackers.tsx', [0, 2]], // the PromoteKit script and <MetaPixel />
    ['src/components/MetaPixel.tsx', [1]], // the pixel loader itself
    ['src/app/(front)/page.tsx', [3]], // mounts <MarketingTrackers />
  ]);
  for (const file of sourceFiles(path.join(REPO_DIR, 'src'))) {
    const rel = path.relative(REPO_DIR, file).split(path.sep).join('/');
    const text = fs.readFileSync(file, 'utf8');
    TRACKER_MARKERS.forEach((marker, i) => {
      if (!marker.test(text)) return;
      assert.ok(allowed.get(rel)?.includes(i), `${rel} carries a marketing script (${marker})`);
    });
  }
  assert.doesNotMatch(readRepoFile('src/app/layout.tsx'), /promotekit\.com|<MetaPixel|<MarketingTrackers|from ['"]@\/components\/(MetaPixel|MarketingTrackers)['"]/);
  assert.match(readRepoFile('src/app/(front)/page.tsx'), /user === null && <MarketingTrackers \/>/);
  assert.match(readRepoFile('src/components/MetaPixel.tsx'), /disablePushState\s*=\s*true/);
});

test('marketing scripts: pixel events are sent only on a marketing path', async () => {
  const mod = await bundleForTest('src/lib/meta-pixel.ts', { name: 'marketing_meta_pixel' });
  assert.equal(mod.isMarketingPath('/'), true);
  for (const p of ['/projects', '/projects/abc', '/settings', '/onboarding', '/pulse', '/login', '/signup', null, undefined]) {
    assert.equal(mod.isMarketingPath(p), false, String(p));
  }

  const sent = [];
  const prior = globalThis.window;
  globalThis.window = { location: { pathname: '/projects' }, fbq: (...args) => sent.push(args) };
  try {
    mod.trackPixelEvent('CompleteRegistration');
    assert.deepEqual(sent, []);
    globalThis.window.location.pathname = '/';
    mod.trackPixelEvent('Lead');
    assert.deepEqual(sent, [['track', 'Lead', undefined]]);
  } finally {
    if (prior === undefined) delete globalThis.window;
    else globalThis.window = prior;
  }
});
