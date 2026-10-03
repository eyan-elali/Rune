// Mock of '@/lib/attachments/storage' for bundled route handlers: an
// in-memory store in place of the platform's bucket. Kept on globalThis so
// every bundle (each route is bundled apart) and the test share one store.
class MemoryStore {
  constructor() { this.objects = new Map(); }
  async upload(key, bytes, contentType) { this.objects.set(key, { bytes, contentType }); }
  async download(key) { return this.objects.get(key) ?? null; }
  async remove(keys) { for (const k of keys) this.objects.delete(k); }
}

export const memory = (globalThis.__runeAttachmentMemory ??= new MemoryStore());

export function supabaseAttachmentStorage() {
  return memory;
}
