import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordAnalyticsEvent, type RecordAnalyticsEventInput } from "@/lib/actions/analytics";
import { revalidateProjectTotals } from "@/lib/projectWordCount";
import { createProjectChecked } from "@/lib/projectCreation";

// The only two themes every account has unlocked. Onboarding never shows
// (or trusts the client to send) anything beyond these — validated again
// here since the request body is client-controlled.
const FREE_ONBOARDING_THEMES = new Set(["parchment", "candlelight"]);
const DEFAULT_ONBOARDING_THEME = "parchment";

const LETTER_MAX_LENGTH = 2000;

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

  let body: { title?: string; firstSentence?: string; theme?: string; letter?: string; requestId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const title = body.title?.trim();
  const firstSentence = body.firstSentence?.trim() ?? "";
  const theme = FREE_ONBOARDING_THEMES.has(body.theme ?? "")
    ? (body.theme as string)
    : DEFAULT_ONBOARDING_THEME;
  const letter = (body.letter?.trim() ?? "").slice(0, LETTER_MAX_LENGTH);

  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("subscription_tier, preferences")
    .eq("id", user.id)
    .single();

  const sceneContent = firstSentence
    ? sentenceToTiptapContent(firstSentence)
    : null;
  const wordCount = firstSentence ? countWords(firstSentence) : 0;

  // Project, Manuscript, "Chapter 1" and its first Scene in ONE database
  // transaction (create_project_checked, migration 021), which also checks the
  // account-wide free-word limit — this is the writer's very first Scene, so
  // it's also the first content-adding path any account ever goes through.
  // Nothing is left behind if any step fails, and a retry carrying the same
  // requestId returns the Project the first attempt created (created: false)
  // instead of creating a second one.
  const result = await createProjectChecked(supabase, {
    title,
    firstSceneContent: sceneContent,
    firstSceneWordCount: wordCount,
    requestId: body.requestId,
  });

  if (result.status === "word_limit_blocked") {
    return NextResponse.json(
      {
        error: `Your first sentence is longer than your ${result.limit.toLocaleString()}-word free allowance.`,
        code: "FREE_WORD_LIMIT_REACHED",
      },
      { status: 403 }
    );
  }
  if (result.status === "error") {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  const { project, chapter, created } = result;

  // projects.word_count already includes the first-sentence Scene: the
  // database updates it in the same transaction (migration 020), without the
  // editor's save path (syncSceneWithLimitCheck) — that path is where the
  // one-time "first_save" analytics event fires, and it must only fire once
  // the writer adds words beyond what onboarding itself created.
  revalidateProjectTotals(project.id);

  // The manuscript itself (project/manuscript/chapter/scene) is now safely persisted.
  // Theme preference and the future letter are secondary — best-effort
  // from here so a hiccup in either never throws away the writer's project.
  const currentPrefs = (profileRow?.preferences as Record<string, unknown>) ?? {};
  await supabase
    .from("profiles")
    .update({
      has_written_first_words: true,
      preferences: { ...currentPrefs, activeTheme: theme, has_seen_guides_update_notice: true },
    })
    .eq("id", user.id);

  // On a retry (created: false) the first attempt may already have saved the
  // letter; never store it twice.
  const letterAlreadySaved =
    !created &&
    Boolean(
      (
        await supabase
          .from("future_letters")
          .select("id", { count: "exact", head: true })
          .eq("project_id", project.id)
      ).count
    );
  if (letter && !letterAlreadySaved) {
    const { error: letterError } = await supabase.from("future_letters").insert({
      user_id: user.id,
      project_id: project.id,
      content: letter,
    });
    if (letterError) {
      console.error("[api/onboarding] Failed to save future letter:", letterError.message);
    }
  }

  // Project, manuscript, chapter, and scene all persisted successfully above — this is the
  // authoritative completion point for onboarding's data model, and the
  // client unconditionally navigates to the editor immediately after this
  // response, so recording completion here (rather than waiting for the
  // editor to mount client-side) captures the same moment with a server-
  // verified user id instead of a client-asserted one. A retry records
  // nothing new: project_created is keyed by the Project, and the other two
  // are one-time events per writer.
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
  // Metadata is limited to two booleans describing onboarding *behavior*,
  // never manuscript content — no letter text, title, first sentence, theme,
  // pen name, or AI-related content ever gets written to analytics_events.
  await safeRecordEvent({
    userId: user.id,
    eventName: "onboarding_completed",
    projectId: project.id,
    metadata: {
      firstSentenceSkipped: wordCount === 0,
      letterWritten: Boolean(letter),
    },
  });

  // chapter is null only on a retry whose Project has since lost its first
  // Chapter; the client then opens the Project instead.
  return NextResponse.json({
    data: { projectId: project.id, chapterId: chapter?.id ?? null },
  });
}
