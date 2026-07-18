// Runs every harness scenario, each in its own child process (db.ts caches
// the IndexedDB handle module-globally, so scenarios need process isolation).
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const SCENARIOS = ['r1', 'r2', 'r3', 'r6', 'r7', 'g1', 'g2', 'g3', 'w', 'f', 'i', 'm'];

let failed = 0;
for (const s of SCENARIOS) {
  console.log(`── ${s} ──`);
  const res = spawnSync('node', [path.join(HERE, 'dist/bundle.mjs')], {
    env: { ...process.env, SCENARIO: s },
    stdio: 'inherit',
  });
  if (res.status !== 0) failed++;
}
console.log(failed === 0 ? 'OVERALL: ALL PASS' : `OVERALL: ${failed} scenario(s) FAILED`);
process.exit(failed === 0 ? 0 : 1);
