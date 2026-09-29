import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { importManuscript } from "@/lib/manuscriptImport";
import type { ImportPayload } from "@/lib/import/types";

// Manuscript Import confirmation: { payload, requestId } → a new Project.
// See lib/manuscriptImport.ts. The body is the confirmed structure only (the
// file itself never leaves the writer's device), capped well inside the
// hosting platform's request limit. Never logs the body: it is prose.

const MAX_BODY_BYTES = 4 * 1024 * 1024;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "This manuscript is too large to import in one go. Nothing was created." }, { status: 413 });
  }
  let body: { payload?: ImportPayload; requestId?: string };
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "This manuscript is too large to import in one go. Nothing was created." }, { status: 413 });
    }
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "The import couldn’t be read. Nothing was created." }, { status: 400 });
  }

  const result = await importManuscript(supabase, body.payload as ImportPayload, body.requestId ?? "");
  if (result.error !== null) {
    return NextResponse.json(
      { error: result.error, wordLimitBlocked: result.wordLimitBlocked ?? false },
      { status: result.wordLimitBlocked ? 402 : 422 }
    );
  }
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  return NextResponse.json(result.data);
}
