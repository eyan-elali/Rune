// Sutura (the product Rune 2.0 became): one canonical identity — the apex
// address, the writesutura.com mailboxes, the approved wordmark and icons —
// and no old public host left in the application. Internal names that only
// look like the old brand (rune2, rune-offline, rune-project-backup) are
// compatibility identifiers and are deliberately not checked here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { readRepoFile, REPO_DIR } from '../lib/pg.mjs';

function sourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(tsx?|jsx?|css)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test('brand: one canonical identity, the apex host and the writesutura.com mailboxes', () => {
  const brand = readRepoFile('src/lib/brand.ts');
  assert.match(brand, /PRODUCT_NAME = "Sutura"/);
  assert.match(brand, /SITE_URL = "https:\/\/writesutura\.com"/, 'the apex, not www');
  assert.match(brand, /SUPPORT_EMAIL = "support@writesutura\.com"/);
  assert.match(brand, /PRIVACY_EMAIL = "privacy@writesutura\.com"/);
  const layout = readRepoFile('src/app/layout.tsx');
  assert.match(layout, /metadataBase: new URL\(SITE_URL\)/);
  assert.match(readRepoFile('next.config.ts'), /value: "www\.writesutura\.com"[\s\S]*destination: "https:\/\/writesutura\.com\/:path\*"/, 'www redirects to the apex');
});

test('brand: no old public host or mailbox anywhere in the application', () => {
  for (const file of [...sourceFiles(path.join(REPO_DIR, 'src')), path.join(REPO_DIR, 'next.config.ts')]) {
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(!/rune-app\.com/.test(text), `${path.relative(REPO_DIR, file)} still names rune-app.com`);
  }
});

test('brand: the approved wordmark and icons are the ones served', () => {
  // Exact case: macOS forgives /brand/Sutura for /brand/sutura, Vercel (Linux) serves a 404.
  assert.deepEqual(fs.readdirSync(path.join(REPO_DIR, 'public/brand')).filter((n) => !n.startsWith('.')), ['sutura'], 'the brand folder is lowercase, as the code references it');
  assert.ok(fs.readdirSync(path.join(REPO_DIR, 'public/brand/sutura/web')).includes('sutura-wordmark-dark.png'));
  for (const f of [
    'public/brand/sutura/web/sutura-wordmark-dark.png',
    'public/brand/sutura/web/sutura-wordmark-light.png',
    'public/brand/sutura/web/icon-32.png',
    'public/brand/sutura/web/icon-dark-32.png',
    'public/brand/sutura/web/icon-192.png',
    'public/brand/sutura/web/icon-512.png',
    'public/brand/sutura/web/apple-touch-icon.png',
    'public/favicon.ico',
  ]) assert.ok(fs.existsSync(path.join(REPO_DIR, f)), `${f} exists`);
  assert.ok(!fs.existsSync(path.join(REPO_DIR, 'src/app/icon.png')), 'the old Rune icon no longer overrides metadata.icons');
  // Each surface that shows the product mark uses the image, not a typed name.
  for (const f of ['src/components/front/PublicFrame.tsx', 'src/components/rune2/AccountMenu.tsx', 'src/components/rune2/Onboarding.tsx', 'src/app/(legal)/layout.tsx']) {
    assert.match(readRepoFile(f), /<Wordmark\b/, `${f} shows the wordmark`);
  }
});

test('brand: compatibility identifiers keep their original names (renaming would strand writing or backups)', () => {
  assert.match(readRepoFile('src/lib/offline/db.ts'), /openDB<RuneOfflineDB>\('rune-offline', 3/);
  assert.match(readRepoFile('src/lib/rune2/workspaceDrafts.ts'), /DB_NAME = "rune-workspace"/);
  assert.match(readRepoFile('src/lib/backup/projectBackup.ts'), /BACKUP_FORMAT = "rune-project-backup"/);
});
