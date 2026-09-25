// Offline storage compatibility (Rune 2.0 Phase 1, Task 5B): application code
// speaks of Scenes, but the IndexedDB names persisted in writers' browsers keep
// their Rune 1.x spelling — the `page_cache` store and the `pageId` field of
// pending_writing_credits. This pins those names, and proves that data a
// browser wrote before the rename (raw rows in a version-3 `rune-offline`
// database) is still read by the renamed code: no upgrade runs, and no cached
// content, queued write or writing credit is orphaned.
import 'fake-indexeddb/auto';
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { bundleForTest } from '../lib/bundle.mjs';

const SCENE = 'scene-legacy-1';
const CHAPTER = 'chapter-legacy-1';
const PROJECT = 'project-legacy-1';
const DOC = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'kept prose' }] }] };

// Opens `rune-offline` v3 with the raw IndexedDB API — exactly the stores and
// row shapes an earlier client created — and seeds one row of each kind.
function seedLegacyBrowser() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('rune-offline', 3);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const store of ['pending_writes', 'page_cache', 'pending_game_sessions', 'chapter_meta', 'pending_writing_credits']) {
        db.createObjectStore(store, { keyPath: 'id' });
      }
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(['pending_writes', 'page_cache', 'pending_writing_credits'], 'readwrite');
      tx.objectStore('page_cache').put({
        id: SCENE, content: DOC, wordCount: 2, serverUpdatedAt: '2026-09-01T00:00:00Z', serverVersion: 4,
        serverWordCount: 2, serverContent: DOC, cachedAt: 1, chapter_id: CHAPTER, project_id: PROJECT,
        manuscript_id: 'ms-1', title: 'Old Scene', position: 0, created_at: '2026-08-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
      });
      tx.objectStore('pending_writes').put({
        id: SCENE, userId: 'user-1', content: DOC, wordCount: 2, localUpdatedAt: 2, syncStatus: 'conflict', retryCount: 0,
      });
      tx.objectStore('pending_writing_credits').put({
        id: 'credit-1', pageId: SCENE, projectId: PROJECT, wordsAdded: 2, sessionDate: '2026-09-01',
      });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  });
}

let offline;
before(async () => {
  await seedLegacyBrowser();
  offline = await bundleForTest('src/lib/offline/db.ts', { name: 'compat_offline_db' });
});

test('persisted names keep their Rune 1.x spelling', async () => {
  assert.equal(offline.SCENE_CACHE_STORE, 'page_cache');
  const db = await offline.getOfflineDB();
  assert.equal(db.name, 'rune-offline');
  assert.equal(db.version, 3);
  assert.deepEqual([...db.objectStoreNames].sort(), [
    'chapter_meta', 'page_cache', 'pending_game_sessions', 'pending_writes', 'pending_writing_credits',
  ]);
});

test('a Scene cached, queued and credited before the rename is still read', async () => {
  const scene = await offline.getCachedScene(SCENE);
  assert.equal(scene?.title, 'Old Scene');
  assert.deepEqual(scene?.content, DOC);
  assert.deepEqual((await offline.getCachedScenesForChapter(CHAPTER)).map((s) => s.id), [SCENE]);
  assert.equal(await offline.getCachedServerUpdatedAt(SCENE), '2026-09-01T00:00:00Z');

  const pending = await offline.getPendingWrite(SCENE);
  assert.equal(pending?.syncStatus, 'conflict', 'queued write and its conflict state survive');
  assert.deepEqual(pending?.content, DOC);

  const summary = await offline.getOfflineStorageSummary();
  assert.deepEqual(summary, { pending: 0, conflicts: 1, cached: 1 });

  // Clearing the Scene cache never drops an entry with a pending write.
  assert.equal(await offline.clearSceneCache(), 0);
  assert.ok(await offline.getCachedScene(SCENE));

  const db = await offline.getOfflineDB();
  assert.deepEqual((await db.getAll('pending_writing_credits')).map((c) => c.pageId), [SCENE]);
});

test('new writing credits are still serialized under the legacy pageId field', async () => {
  await offline.storeOfflineWritingCredit(PROJECT, 'scene-new', 5);
  const db = await offline.getOfflineDB();
  const credit = (await db.getAll('pending_writing_credits')).find((c) => c.pageId === 'scene-new');
  assert.ok(credit, 'credit stored with pageId');
  assert.equal('sceneId' in credit, false);
  assert.equal(credit.wordsAdded, 5);
});
