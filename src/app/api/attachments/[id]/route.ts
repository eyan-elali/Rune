import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readAttachment } from "@/lib/attachments/server";
import { supabaseAttachmentStorage } from "@/lib/attachments/storage";

// An attachment's bytes for its owner (Milestone 22C): the row is read as the
// signed-in writer (RLS: their own Project's only), then the bytes from the
// private bucket. ?variant=display serves the browser-sized derivative when
// there is one. An attachment's bytes never change, so the answer is cached
// privately for a long time; a missing or foreign id is 404 either way.

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const { id } = await params;
  const variant = new URL(req.url).searchParams.get("variant") === "display" ? "display" : "original";
  const found = await readAttachment(supabase, supabaseAttachmentStorage(), id, variant);
  if (!found) return new NextResponse(null, { status: 404 });
  return new NextResponse(found.bytes as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": found.contentType,
      "Content-Length": String(found.bytes.byteLength),
      "Cache-Control": "private, max-age=31536000, immutable",
      // RFC 5987 ext-value: percent-encoded, including the characters
      // encodeURIComponent leaves alone that the grammar does not ("'" is its delimiter).
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(found.fileName).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`,
      "X-Content-Type-Options": "nosniff",
      // Defence in depth: whatever the bytes are, they run nothing and load nothing.
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
