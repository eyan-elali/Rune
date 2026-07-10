import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordAnalyticsEvent, type RecordAnalyticsEventInput } from "@/lib/actions/analytics";

// Best-effort — analytics must never block onboarding completion.
async function safeRecordEvent(input: RecordAnalyticsEventInput) {
  try {
    const { error } = await recordAnalyticsEvent(input);
    if (error) {
      console.error(`[api/onboarding] recordAnalyticsEvent(${input.eventName}) failed:`, error);
    }
  } catch (err) {
    console.error(`[api/onboarding] analytics event ${input.eventName} threw:`, err);
  }
}

function sentenceToTiptapContent(sentence: string): Record<string, unknown> {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: sentence.trim() }],
      },
    ],
  };
}

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length >= 2).length;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { title?: string; firstSentence?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const title = body.title?.trim();
  const firstSentence = body.firstSentence?.trim() ?? "";

  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("subscription_tier, preferences")
    .eq("id", user.id)
    .single();

  const tier = profileRow?.subscription_tier ?? "free";
  if (tier === "free") {
    const { count } = await supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    if ((count ?? 0) >= 1) {
      return NextResponse.json(
        {
          error: "Upgrade to Scribe to create unlimited projects",
          code: "UPGRADE_REQUIRED",
        },
        { status: 403 }
      );
    }
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({ user_id: user.id, title, cover_color: null })
    .select()
    .single();
  if (projectError || !project) {
    return NextResponse.json(
      { error: projectError?.message ?? "Failed to create project" },
      { status: 500 }
    );
  }

  const { data: chapter, error: chapterError } = await supabase
    .from("chapters")
    .insert({ project_id: project.id, title: "Chapter 1", position: 1 })
    .select()
    .single();
  if (chapterError || !chapter) {
    return NextResponse.json(
      { error: chapterError?.message ?? "Failed to create chapter" },
      { status: 500 }
    );
  }

  const pageContent = firstSentence
    ? sentenceToTiptapContent(firstSentence)
    : null;
  const wordCount = firstSentence ? countWords(firstSentence) : 0;

  const { data: page, error: pageError } = await supabase
    .from("pages")
    .insert({
      chapter_id: chapter.id,
      title: "Page 1",
      content: pageContent,
      word_count: wordCount,
      position: 0,
      is_canonical: false,
    })
    .select()
    .single();
  if (pageError || !page) {
    return NextResponse.json(
      { error: pageError?.message ?? "Failed to create page" },
      { status: 500 }
    );
  }

  const currentPrefs = (profileRow?.preferences as Record<string, unknown>) ?? {};
  await supabase
    .from("profiles")
    .update({
      has_written_first_words: true,
      preferences: { ...currentPrefs, has_seen_guides_update_notice: true },
    })
    .eq("id", user.id);

  // Project, chapter, and page all persisted successfully above — this is the
  // authoritative completion point for onboarding's data model, and the
  // client unconditionally navigates to the editor immediately after this
  // response, so recording completion here (rather than waiting for the
  // editor to mount client-side) captures the same moment with a server-
  // verified user id instead of a client-asserted one.
  await safeRecordEvent({
    userId: user.id,
    eventName: "project_created",
    projectId: project.id,
    dedupeKey: project.id,
  });
  if (wordCount > 0) {
    await safeRecordEvent({
      userId: user.id,
      eventName: "first_sentence_written",
      projectId: project.id,
      metadata: { wordCount, characterCount: firstSentence.length },
    });
  }
  await safeRecordEvent({
    userId: user.id,
    eventName: "onboarding_completed",
    projectId: project.id,
  });

  return NextResponse.json({
    data: { projectId: project.id, chapterId: chapter.id },
  });
}
