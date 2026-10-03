import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { storeImageAttachment } from "@/lib/attachments/server";
import { supabaseAttachmentStorage } from "@/lib/attachments/storage";
import { MAX_IMAGE_BYTES } from "@/lib/rune2/attachments";

// Image upload (Milestone 22C): multipart form data —
//   projectId, file (the image), width, height,
//   display? (a browser-sized derivative), displayWidth?, displayHeight?
// → the attachment row. The bytes go to the private bucket and the row is
// registered as the writer (lib/attachments/server.ts). Never logs the body.

export const runtime = "nodejs";

const MAX_BODY_BYTES = MAX_IMAGE_BYTES * 2 + 64 * 1024;

const num = (v: FormDataEntryValue | null) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return NextResponse.json({ error: "An image can be up to 10 MB." }, { status: 413 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "The upload couldn’t be read." }, { status: 400 });
  }
  const file = form.get("file");
  const projectId = String(form.get("projectId") ?? "");
  if (!(file instanceof Blob)) return NextResponse.json({ error: "No image was sent." }, { status: 400 });
  if (file.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: "An image can be up to 10 MB." }, { status: 413 });
  const display = form.get("display");

  const result = await storeImageAttachment(supabase, supabaseAttachmentStorage(), {
    projectId,
    fileName: file instanceof File ? file.name : "image",
    mimeType: file.type,
    bytes: new Uint8Array(await file.arrayBuffer()),
    width: num(form.get("width")),
    height: num(form.get("height")),
    display:
      display instanceof Blob && display.size > 0
        ? { bytes: new Uint8Array(await display.arrayBuffer()), mimeType: display.type, width: num(form.get("displayWidth")), height: num(form.get("displayHeight")) }
        : null,
  });
  if (result.error !== null) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ attachment: result.data });
}
