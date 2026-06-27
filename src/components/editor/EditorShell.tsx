"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { PageList } from "./PageList";
import { ExportButton } from "./ExportButton";
import type { Page, Chapter, Project } from "@/lib/types";
import {
  createPage,
  deletePage,
  setCanonicalPage,
  clearCanonicalPage,
} from "@/lib/actions/pages";
import { cachePage, cacheChapterMeta } from "@/lib/offline/db";
import { useEditorStore } from "@/store/editorStore";
import { useModeStore } from "@/store/modeStore";
import { useOnboardingStore } from "@/store/onboardingStore";
import { useProfileStore } from "@/store/profileStore";
import { markFirstWordsSaved } from "@/lib/actions/settings";

type ChapterWithStats = Chapter & { pages: { id: string; word_count: number }[] };

const RuneEditor = dynamic(() => import("./RuneEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center">
      <span className="text-sm" style={{ color: "var(--color-mist)" }}>
        Loading editor…
      </span>
    </div>
  ),
});

interface EditorShellProps {
  projectId: string;
  chapterId: string;
  initialPages: Page[];
  chapter: Chapter;
  project: Project;
  allChapters: ChapterWithStats[];
  isOnboarding?: boolean;
}

export function EditorShell({
  projectId,
  chapterId,
  initialPages,
  chapter,
  project,
  allChapters,
  isOnboarding = false,
}: EditorShellProps) {
  const [pages, setPages] = useState<Page[]>(initialPages);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(
    initialPages[0]?.id ?? null
  );
  const setCurrentPage = useEditorStore((s) => s.setCurrentPage);
  const pathname = usePathname();
  const mode = useModeStore((s) => s.mode);
  const shouldHideFocusUI = mode === "focus" && pathname.includes("/chapters/");

  const { phase, setPhase } = useOnboardingStore();
  const setProfile = useProfileStore((s) => s.setProfile);
  const profile = useProfileStore((s) => s.profile);

  // Acknowledgement is shown once, for ~2.8s, after first save fires.
  const [showAck, setShowAck] = useState(false);
  const ackTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Mount/unmount: activate onboarding phase; reset on leave.
  useEffect(() => {
    if (isOnboarding) {
      setPhase("writing");
    }
    return () => {
      setPhase("done");
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedPageId) {
      setCurrentPage(projectId, chapterId, selectedPageId);
    }
  }, [selectedPageId, projectId, chapterId, setCurrentPage]);

  useEffect(() => {
    void (async () => {
      try {
        await cacheChapterMeta(chapter, project);
        await Promise.all(initialPages.map((p) => cachePage(p, projectId)));
      } catch {
        // best-effort
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentPage = pages.find((p) => p.id === selectedPageId) ?? null;

  const handleSelectPage = useCallback((pageId: string) => {
    setSelectedPageId(pageId);
  }, []);

  const handleAddPage = useCallback(async () => {
    const { data, error } = await createPage(
      chapterId,
      `Page ${pages.length + 1}`
    );
    if (data && !error) {
      await cachePage(data, projectId);
      setPages((prev) => [...prev, data]);
      setSelectedPageId(data.id);
    }
  }, [chapterId, pages.length, projectId]);

  const handleDeletePage = useCallback(
    async (pageId: string) => {
      const { error } = await deletePage(pageId);
      if (!error) {
        setPages((prev) => {
          const remaining = prev.filter((p) => p.id !== pageId);
          if (selectedPageId === pageId && remaining.length > 0) {
            setSelectedPageId(remaining[0].id);
          }
          return remaining;
        });
      }
    },
    [selectedPageId]
  );

  const handleRenamePage = useCallback((pageId: string, title: string) => {
    setPages((prev) =>
      prev.map((p) => (p.id === pageId ? { ...p, title } : p))
    );
  }, []);

  const handlePageUpdated = useCallback(
    (pageId: string, updates: Partial<Page>) => {
      setPages((prev) =>
        prev.map((p) => (p.id === pageId ? { ...p, ...updates } : p))
      );
    },
    []
  );

  const handleSetCanonical = useCallback(
    async (pageId: string) => {
      setPages((prev) =>
        prev.map((p) => ({ ...p, is_canonical: p.id === pageId }))
      );
      await setCanonicalPage(pageId, chapterId);
    },
    [chapterId]
  );

  const handleClearCanonical = useCallback(async () => {
    setPages((prev) => prev.map((p) => ({ ...p, is_canonical: false })));
    await clearCanonicalPage(chapterId);
  }, [chapterId]);

  // Called by RuneEditor after the first successful save with words > 0.
  const handleFirstSave = useCallback(() => {
    // Mark in DB (fire-and-forget — reveal doesn't wait for this)
    void markFirstWordsSaved();
    // Update local profile store immediately so subsequent navigations are correct
    if (profile) {
      setProfile({ ...profile, has_written_first_words: true });
    }

    // Start the reveal sequence
    setPhase("revealing");

    // Show the one-time acknowledgement
    setShowAck(true);
    ackTimerRef.current = setTimeout(() => {
      setShowAck(false);
    }, 2900);

    // Transition to done after animations complete (~650ms)
    setTimeout(() => {
      setPhase("done");
    }, 700);
  }, [profile, setPhase, setProfile]);

  useEffect(() => {
    return () => clearTimeout(ackTimerRef.current);
  }, []);

  // Page list visibility during onboarding:
  // hidden (but in DOM) while writing; fades in during reveal.
  const isOnboardingWriting = isOnboarding && phase === "writing";
  const isOnboardingRevealing = isOnboarding && phase === "revealing";

  const pageListStyle: React.CSSProperties = isOnboardingWriting
    ? { opacity: 0, pointerEvents: "none", transition: "none" }
    : isOnboardingRevealing
    ? { opacity: 1, transition: "opacity 0.45s ease 0.35s" }
    : {};

  // Export toolbar visibility
  const showExportToolbar =
    !shouldHideFocusUI && !isOnboardingWriting;
  const exportToolbarStyle: React.CSSProperties = isOnboardingRevealing
    ? { opacity: 1, transition: "opacity 0.4s ease 0.3s" }
    : isOnboardingWriting
    ? { opacity: 0, pointerEvents: "none" }
    : {};

  // During focus mode or onboarding writing phase, hide the page list from DOM
  // (focus mode) or make it invisible but present (onboarding — needed for animation).
  const renderPageList = !shouldHideFocusUI;

  return (
    <div className="flex min-h-0 h-full overflow-hidden">
      {renderPageList && (
        <div style={pageListStyle}>
          <PageList
            pages={pages}
            selectedPageId={selectedPageId}
            onSelectPage={handleSelectPage}
            onAddPage={handleAddPage}
            onDeletePage={handleDeletePage}
            onRenamePage={handleRenamePage}
            onSetCanonical={handleSetCanonical}
            onClearCanonical={handleClearCanonical}
            allChapters={allChapters}
            currentChapterId={chapterId}
            projectId={projectId}
          />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {showExportToolbar && (
          <div
            className="flex shrink-0 items-center justify-end px-4 py-1.5"
            style={{
              borderBottom: "1px solid var(--color-border)",
              background: "var(--surface-editor)",
              ...exportToolbarStyle,
            }}
          >
            <ExportButton page={currentPage} chapter={chapter} project={project} />
          </div>
        )}
        <RuneEditor
          projectId={projectId}
          chapterId={chapterId}
          currentPage={currentPage}
          onPageUpdated={handlePageUpdated}
          onRenamePage={handleRenamePage}
          isOnboarding={isOnboarding}
          onboardingProjectTitle={isOnboarding ? project.title : undefined}
          onFirstSave={isOnboarding ? handleFirstSave : undefined}
        />
      </div>

      {/* One-time acknowledgement after first save */}
      {showAck && (
        <p className="rune-onboarding-ack" aria-live="polite">
          Your story has begun.
        </p>
      )}
    </div>
  );
}
