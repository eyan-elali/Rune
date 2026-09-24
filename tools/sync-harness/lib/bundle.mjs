// Bundles a REAL Rune TypeScript module (server action, route handler, lib
// helper) for use in a node:test file, replacing only framework/network
// boundaries with mocks:
//
//   '@/lib/supabase/server' → mocks/supabaseServer.js  (setServerClient)
//   'next/cache'            → mocks/nextCache.js       (revalidateCalls)
//   'next/server'           → mocks/nextServer.js      (NextResponse)
//
// Every other '@/…' import resolves to the real file under src/. Extra
// aliases can be passed per bundle. The returned module re-exports the target
// module's exports plus `setServerClient` and `revalidateCalls`, so a test
// drives one shared mock instance.
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { HARNESS_DIR, REPO_DIR } from './pg.mjs';

const DEFAULT_ALIASES = {
  '@/lib/supabase/server': path.join(HARNESS_DIR, 'mocks/supabaseServer.js'),
  'next/cache': path.join(HARNESS_DIR, 'mocks/nextCache.js'),
  'next/server': path.join(HARNESS_DIR, 'mocks/nextServer.js'),
};

function resolveRepoSrc(spec) {
  const rel = spec.replace(/^@\//, '');
  for (const ext of ['.ts', '.tsx', '.js', '/index.ts', '/index.tsx']) {
    const p = path.join(REPO_DIR, 'src', rel + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function aliasPlugin(aliases) {
  return {
    name: 'rune-test-alias',
    setup(build) {
      build.onResolve({ filter: /^(@\/|next\/)/ }, (args) => {
        if (aliases[args.path]) return { path: aliases[args.path] };
        if (args.path.startsWith('@/')) {
          const p = resolveRepoSrc(args.path);
          if (p) return { path: p };
          return { errors: [{ text: `cannot resolve ${args.path} under src/` }] };
        }
        return undefined; // other next/* imports: let esbuild fail loudly if used
      });
    },
  };
}

/**
 * @param {string} entry  repo-relative path, e.g. 'src/lib/projectWordCount.ts'
 * @param {{ name?: string, aliases?: Record<string,string> }} [opts]
 * @returns {Promise<Record<string, any>>} the imported bundle
 */
export async function bundleForTest(entry, { name, aliases = {} } = {}) {
  const target = path.join(REPO_DIR, entry);
  if (!fs.existsSync(target)) throw new Error(`bundleForTest: no such file ${entry}`);
  const outName = name ?? entry.replace(/[^a-zA-Z0-9]+/g, '_');
  const outfile = path.join(HARNESS_DIR, 'dist/tests', `${outName}.mjs`);
  const allAliases = { ...DEFAULT_ALIASES, ...aliases };

  await esbuild.build({
    stdin: {
      contents: [
        `export * from ${JSON.stringify(target)};`,
        `export { setServerClient } from ${JSON.stringify(allAliases['@/lib/supabase/server'])};`,
        `export { revalidateCalls } from ${JSON.stringify(allAliases['next/cache'])};`,
      ].join('\n'),
      resolveDir: REPO_DIR,
      loader: 'js',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    plugins: [aliasPlugin(allAliases)],
    absWorkingDir: REPO_DIR, // third-party imports resolve from the app's node_modules
    logLevel: 'warning',
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  });

  // Cache-bust so re-bundling in the same process picks up the new file.
  return import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
}
