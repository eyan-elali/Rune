"use server";

import { createClient } from "@/lib/supabase/server";
import { sweepUnreferencedAttachments } from "@/lib/attachments/server";
import { supabaseAttachmentStorage } from "@/lib/attachments/storage";

// Project attachments (migration 047). Uploads and reads are route handlers
// (app/api/attachments): bytes don't travel well through a server action.
// This is the housekeeping: the sweep of attachments nothing references any
// more, after the grace period — run quietly when a Project's Canvases are
// first shown in a window. Never touches a referenced attachment.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function sweepProjectAttachments(projectId: string): Promise<{ removed: number }> {
  if (!UUID.test(projectId)) return { removed: 0 };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { removed: 0 };
  try {
    return await sweepUnreferencedAttachments(supabase, supabaseAttachmentStorage(), projectId);
  } catch {
    return { removed: 0 };
  }
}
