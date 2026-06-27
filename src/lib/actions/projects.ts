"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Project } from "@/lib/types";
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

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", user.id)
    .single();

  const tier = profileRow?.subscription_tier ?? "free";

  if (tier === "free") {
    const { count } = await supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    if ((count ?? 0) >= 1) {
      return {
        data: null,
        error: Object.assign(
          new Error("Upgrade to Scribe to create unlimited projects"),
          { code: "UPGRADE_REQUIRED" }
        ).message,
      };
    }
  }

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
