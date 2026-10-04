import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { ATTACHMENT_BUCKET } from "@/lib/rune2/attachments";
import type { AttachmentStorage, StoredBytes } from "./server";

// The platform's object storage as an AttachmentStorage (server only). A
// private bucket, addressed with the service role — never from the browser,
// and never before the attachment's row was read as the writer (server.ts).
// The bucket is created the first time it is needed, so no manual step and
// no storage policy is part of the rollout.

let client: SupabaseClient | null = null;
let bucketReady: Promise<void> | null = null;

function service(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Attachment storage is not configured.");
  client ??= createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

async function ensureBucket(): Promise<void> {
  bucketReady ??= (async () => {
    const { data } = await service().storage.getBucket(ATTACHMENT_BUCKET);
    if (data) return;
    const { error } = await service().storage.createBucket(ATTACHMENT_BUCKET, { public: false });
    if (error && !/already exists/i.test(error.message)) throw error;
  })().catch((e) => {
    bucketReady = null; // tried again next time
    throw e;
  });
  await bucketReady;
}

export function supabaseAttachmentStorage(): AttachmentStorage {
  return {
    async upload(key, bytes, contentType) {
      await ensureBucket();
      const { error } = await service().storage.from(ATTACHMENT_BUCKET).upload(key, bytes as BodyInit extends never ? never : Uint8Array, { contentType, upsert: false });
      if (error) throw new Error(error.message);
    },
    async download(key): Promise<StoredBytes | null> {
      await ensureBucket();
      const { data, error } = await service().storage.from(ATTACHMENT_BUCKET).download(key);
      if (error || !data) return null;
      return { bytes: new Uint8Array(await data.arrayBuffer()), contentType: data.type };
    },
    async remove(keys) {
      if (keys.length === 0) return;
      await ensureBucket();
      const { error } = await service().storage.from(ATTACHMENT_BUCKET).remove([...keys]);
      if (error) throw new Error(error.message);
    },
  };
}
