import * as esbuild from 'esbuild';
import path from 'node:path';
import fs from 'node:fs';

const SCRATCH = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(SCRATCH, '../..');

// Bundle the REAL syncEngine.ts + db.ts from the repo, substituting only the
// network/server-action boundaries with mocks.
const aliasPlugin = {
  name: 'rune-alias',
  setup(build) {
    const map = {
      '@/lib/supabase/client': path.join(SCRATCH, 'mocks/supabaseClient.js'),
      '@/lib/actions/pages': path.join(SCRATCH, 'mocks/actionsPages.js'),
      '@/lib/actions/games': path.join(SCRATCH, 'mocks/actionsMisc.js'),
      '@/lib/actions/xp': path.join(SCRATCH, 'mocks/actionsMisc.js'),
      '@/lib/actions/writingStats': path.join(SCRATCH, 'mocks/actionsMisc.js'),
    };
    build.onResolve({ filter: /^@\// }, (args) => {
      if (map[args.path]) return { path: map[args.path] };
      // real repo module
      const rel = args.path.replace(/^@\//, '');
      for (const ext of ['.ts', '.tsx', '.js']) {
        const p = path.join(REPO, 'src', rel + ext);
        if (fs.existsSync(p)) return { path: p };
      }
      return { path: path.join(REPO, 'src', rel + '.ts') };
    });
  },
};

await esbuild.build({
  entryPoints: [path.join(SCRATCH, 'entry.js')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: path.join(SCRATCH, 'dist/bundle.mjs'),
  plugins: [aliasPlugin],
  absWorkingDir: REPO, // resolve idb/clsx/etc from the repo's node_modules
  logLevel: 'warning',
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
console.log('built');
