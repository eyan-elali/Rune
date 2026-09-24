// Runs every existing sync-engine scenario (entry.js, bundled by build.mjs
// from the REAL syncEngine.ts + db.ts) as a node:test subtest. Each scenario
// needs its own process because db.ts caches the IndexedDB handle
// module-globally. `npm test` builds dist/bundle.mjs first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { HARNESS_DIR } from '../lib/pg.mjs';
import { SCENARIOS } from '../scenarios.mjs';

const BUNDLE = path.join(HARNESS_DIR, 'dist/bundle.mjs');

test('sync bundle is built', () => {
  assert.ok(fs.existsSync(BUNDLE), 'dist/bundle.mjs missing — run `node build.mjs` (npm test does this)');
});

for (const scenario of SCENARIOS) {
  test(`sync scenario ${scenario}`, () => {
    const res = spawnSync(process.execPath, [BUNDLE], {
      env: { ...process.env, SCENARIO: scenario },
      encoding: 'utf8',
    });
    const output = `${res.stdout ?? ''}${res.stderr ?? ''}`;
    const failures = output.split('\n').filter((l) => l.startsWith('FAIL'));
    assert.equal(res.status, 0, `scenario ${scenario} failed:\n${failures.join('\n') || output}`);
    assert.ok(output.includes('PASS'), `scenario ${scenario} reported no checks:\n${output}`);
  });
}
