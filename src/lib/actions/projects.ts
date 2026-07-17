"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Project, Chapter, Page } from "@/lib/types";
import { calculateChapterWordCount } from "@/lib/manuscript";

type ActionResult<T> = { data: T; error: null } | { data: null; error: string };

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function getProjects(): Promise<ActionResult<Project[]>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", user.id)
    .order("is_pinned", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data: data ?? [], error: null };
}

export async function createProject(
  title: string,
  description?: string,
  coverColor?: string
): Promise<ActionResult<Project>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      title: title.trim(),
      description: description?.trim() || null,
      cover_color: coverColor ?? null,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/projects");
  return { data, error: null };
}

export async function updateProject(
  id: string,
  fields: Partial<Pick<Project, "title" | "description" | "cover_color" | "chapter_goal">>
): Promise<ActionResult<Project>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data, error } = await supabase
    .from("projects")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  return { data, error: null };
}

export async function duplicateProject(
  projectId: string
): Promise<ActionResult<Project>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  // Fetch original project
  const { data: original, error: projErr } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  if (projErr || !original) return { data: null, error: "Project not found" };

  // Duplication adds a full copy of the original's words to the account —
  // check that against the account-wide free-tier limit before writing
  // anything, now that free users are no longer capped at one project. The
  // duplicate mirrors the original's chapters/pages (including is_canonical)
  // 1:1, so the original's own canonical-aware total — the same definition
  // account_word_total() uses, see migration 011 — is exactly how many
  // words the duplicate will add to the account.
  //
  // This remains a check-then-write rather than a single atomic database
  // call (unlike the single-page save/insert paths in pages.ts/games.ts):
  // duplication creates many rows across many chapters in one user action,
  // which doesn't fit that shape without a much larger change. A double-
  // click racing this check is a narrower, lower-frequency risk than the
  // multi-tab editor race the atomic paths close, and is already mitigated
  // client-side (the confirm button disables while the request is in flight).
  const { data: originalChapters } = await supabase
    .from("chapters")
    .select("id")
    .eq("project_id", projectId);

  const originalChapterIds = (originalChapters ?? []).map((c: { id: string }) => c.id);
  let originalWordTotal = 0;
  if (originalChapterIds.length > 0) {
    const { data: originalPages } = await supabase
      .from("pages")
      .select("chapter_id, word_count, is_canonical")
      .in("chapter_id", originalChapterIds);

    for (const chapterId of originalChapterIds) {
      const chapterPages = (originalPages ?? []).filter(
        (p: { chapter_id: string }) => p.chapter_id === chapterId
      );
      originalWordTotal += calculateChapterWordCount({ pages: chapterPages });
    }
  }

  if (originalWordTotal > 0) {
    const { data: limitData } = await supabase.rpc("free_word_limit_for_caller");
    const limit = limitData as number | null;
    if (limit !== null) {
      const { data: totalData } = await supabase.rpc("account_word_total");
      const accountTotal = (totalData as number | null) ?? 0;
      if (accountTotal + originalWordTotal > limit) {
        return {
          data: null,
          error: `Duplicating this project would put you over your ${limit.toLocaleString()}-word free limit. Upgrade to Scribe to keep writing.`,
        };
      }
    }
  }

  // Find a unique draft title
  const { data: existingTitles } = await supabase
    .from("projects")
    .select("title")
    .eq("user_id", user.id)
    .ilike("title", `${original.title} — Draft%`);

  const usedNumbers = new Set<number>();
  for (const { title } of existingTitles ?? []) {
    const match = title.match(/— Draft (\d+)$/);
    if (match) usedNumbers.add(parseInt(match[1], 10));
  }
  let draftNum = 2;
  while (usedNumbers.has(draftNum)) draftNum++;
  const newTitle = `${original.title} — Draft ${draftNum}`;

  // Create new project
  const { data: newProject, error: createErr } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      title: newTitle,
      description: original.description,
      cover_color: original.cover_color,
      word_count: 0,
    })
    .select()
    .single();

  if (createErr || !newProject) return { data: null, error: createErr?.message ?? "Failed to create project" };

  // Fetch chapters in order
  const { data: chapters } = await supabase
    .from("chapters")
    .select("*")
    .eq("project_id", projectId)
    .order("position", { ascending: true });

  for (const chapter of chapters ?? []) {
    const { data: newChapter, error: chapErr } = await supabase
      .from("chapters")
      .insert({
        project_id: newProject.id,
        title: chapter.title,
        position: chapter.position,
      })
      .select()
      .single();

    if (chapErr || !newChapter) continue;

    // Fetch pages in order
    const { data: pages } = await supabase
      .from("pages")
      .select("*")
      .eq("chapter_id", chapter.id)
      .order("position", { ascending: true });

    for (const page of pages ?? []) {
      await supabase.from("pages").insert({
        chapter_id: newChapter.id,
        title: page.title,
        content: page.content,
        word_count: page.word_count,
        position: page.position,
        is_canonical: page.is_canonical,
      });
    }
  }

  // Recalculate word count for new project
  const { data: newChapters } = await supabase
    .from("chapters")
    .select("id")
    .eq("project_id", newProject.id);

  const newChapterIds = (newChapters ?? []).map((c: { id: string }) => c.id);
  let totalWords = 0;
  if (newChapterIds.length > 0) {
    const { data: allPages } = await supabase
      .from("pages")
      .select("word_count, is_canonical, chapter_id")
      .in("chapter_id", newChapterIds);

    for (const chapId of newChapterIds) {
      const chapterPages = (allPages ?? []).filter((p: { chapter_id: string }) => p.chapter_id === chapId);
      const canonical = chapterPages.find((p: { is_canonical: boolean }) => p.is_canonical);
      if (canonical) {
        totalWords += canonical.word_count;
      } else {
        totalWords += chapterPages.reduce((s: number, p: { word_count: number }) => s + (p.word_count ?? 0), 0);
      }
    }

    await supabase
      .from("projects")
      .update({ word_count: totalWords })
      .eq("id", newProject.id);
  }

  revalidatePath("/projects");
  // No XP awarded for duplication — only manual typing earns progression.
  return { data: { ...newProject, word_count: totalWords }, error: null };
}

export async function toggleProjectPin(
  id: string,
  isPinned: boolean
): Promise<{ error: string | null }> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("projects")
    .update({ is_pinned: isPinned })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/projects");
  return { error: null };
}

export async function deleteProject(id: string): Promise<{ error: string | null }> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/projects");
  return { error: null };
}

export async function getProjectStats(
  projectId: string
): Promise<{ chapterCount: number; totalCanonicalWords: number }> {
  const { supabase } = await getUser();

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id")
    .eq("project_id", projectId);

  const chapterIds = (chapters ?? []).map((c: { id: string }) => c.id);
  if (chapterIds.length === 0) return { chapterCount: 0, totalCanonicalWords: 0 };

  const { data: pages } = await supabase
    .from("pages")
    .select("chapter_id, word_count, is_canonical")
    .in("chapter_id", chapterIds);

  let totalWords = 0;
  for (const chapterId of chapterIds) {
    const chapterPages = (pages ?? []).filter(
      (p: { chapter_id: string }) => p.chapter_id === chapterId
    );
    const canonical = chapterPages.find((p: { is_canonical: boolean }) => p.is_canonical);
    if (canonical) {
      totalWords += (canonical as { word_count: number }).word_count ?? 0;
    } else {
      totalWords += chapterPages.reduce(
        (s: number, p: { word_count: number }) => s + (p.word_count ?? 0),
        0
      );
    }
  }

  return { chapterCount: chapterIds.length, totalCanonicalWords: totalWords };
}

export async function createProjectWithDraft(
  title: string,
  coverColor?: string
): Promise<ActionResult<{ projectId: string; chapterId: string; page: Page; chapter: Chapter; project: Project }>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      title: title.trim(),
      cover_color: coverColor ?? null,
    })
    .select()
    .single();

  if (projectError || !project) {
    return { data: null, error: projectError?.message ?? "Failed to create project" };
  }

  const { data: chapter, error: chapterError } = await supabase
    .from("chapters")
    .insert({ project_id: project.id, title: "Chapter 1", position: 1 })
    .select()
    .single();

  if (chapterError || !chapter) {
    return { data: null, error: chapterError?.message ?? "Failed to create chapter" };
  }

  const { data: page, error: pageError } = await supabase
    .from("pages")
    .insert({
      chapter_id: chapter.id,
      title: "Page 1",
      content: null,
      word_count: 0,
      position: 0,
      is_canonical: false,
    })
    .select()
    .single();

  if (pageError || !page) {
    return { data: null, error: pageError?.message ?? "Failed to create page" };
  }

  revalidatePath("/projects");
  revalidatePath("/dashboard");

  return { data: { projectId: project.id, chapterId: chapter.id, page, chapter, project }, error: null };
}

export async function getProjectChaptersForDrawer(
  projectId: string
): Promise<{ id: string; title: string; wordCount: number }[]> {
  const { supabase, user } = await getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("chapters")
    .select("id, title, pages(word_count, is_canonical)")
    .eq("project_id", projectId)
    .order("position", { ascending: true });

  if (!data) return [];

  type RawChapter = {
    id: string;
    title: string;
    pages: { word_count: number; is_canonical: boolean }[];
  };

  return (data as unknown as RawChapter[]).map((c) => ({
    id: c.id,
    title: c.title,
    wordCount: calculateChapterWordCount(c),
  }));
}
