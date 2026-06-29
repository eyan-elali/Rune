"use client";

import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useProfileStore } from "@/store/profileStore";
import { updatePreferences, getRecentEditorChapter } from "@/lib/actions/settings";

type Stage = "modal" | "help-card" | "dismissed";

const RELEASE_SECTIONS = [
  {
    title: "Free Plan",
    items: [
      "Goals are now free",
      "Notes are now free",
      "Progress tracking is now free",
      "Stats & Heatmap are now free",
      "Export is now free",
      "Focus Mode is now free",
      "The Free plan now includes the complete Rune writing experience",
    ],
  },
  {
    title: "Writing",
    items: [
      "New onboarding experience",
      "First-sentence introduction",
      "Guided editor tutorial",
      "Focus Mode improvements",
    ],
  },
  {
    title: "Organization",
    items: [
      "Progress drawer",
      "Goals for projects and chapters",
      "Revision Notes",
      "Pinned Today's Focus",
      "Canonical Pages improvements",
    ],
  },
  {
    title: "Profile",
    items: [
      "Completely redesigned statistics",
      "Better heatmap",
      "Writing records",
      "Unlockables",
    ],
  },
  {
    title: "Arena",
    items: [
      "Refined Race Yourself",
      "Improved Battle Mode",
      "Better writing environments",
    ],
  },
  {
    title: "Everywhere",
    items: [
      "Page Guides on major pages",
      "Cleaner navigation",
      "Faster onboarding",
      "Better offline writing",
      "Improved saving & syncing",
      "Numerous bug fixes and polish",
    ],
  },
];

export function UpdateNotice() {
  const router = useRouter();
  const setPreferences = useProfileStore((s) => s.setPreferences);
  const [stage, setStage] = useState<Stage>("modal");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const markSeen = useCallback(async () => {
    setPreferences({ has_seen_guides_update_notice: true });
    await updatePreferences({ has_seen_guides_update_notice: true });
  }, [setPreferences]);

  const handleShowMe = useCallback(async () => {
    setLoading(true);
    await markSeen();
    const chapter = await getRecentEditorChapter();
    setLoading(false);

    if (chapter) {
      setStage("dismissed");
      router.push(
        `/projects/${chapter.projectId}/chapters/${chapter.chapterId}?tutorial=returning`
      );
    } else {
      setStage("help-card");
    }
  }, [markSeen, router]);

  const handleSkip = useCallback(async () => {
    setLoading(true);
    await markSeen();
    setLoading(false);
    setStage("help-card");
  }, [markSeen]);

  const handleHelpCardDismiss = useCallback(() => {
    setStage("dismissed");
  }, []);

  if (!mounted || stage === "dismissed") return null;

  if (stage === "help-card") {
    return createPortal(
      <>
        <div
          aria-hidden
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(26,22,20,0.72)",
            zIndex: 199,
            pointerEvents: "none",
          }}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Guide help reminder"
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 202,
            width: "360px",
            maxWidth: "calc(100vw - 32px)",
            background: "var(--color-sepia)",
            border: "1px solid var(--color-border-strong)",
            borderRadius: "10px",
            padding: "28px 24px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
          }}
        >
          <p
            className="font-rune-serif text-xl"
            style={{ color: "var(--text-primary)", marginBottom: "10px" }}
          >
            Need help later?
          </p>
          <p
            className="font-rune-serif text-sm leading-relaxed"
            style={{ color: "var(--color-mist)", marginBottom: "22px" }}
          >
            Many pages in Rune have a small{" "}
            <strong style={{ color: "var(--color-gold)" }}>?</strong> button.
            Click it anytime to replay a short guide for that page.
          </p>
          <button
            type="button"
            onClick={handleHelpCardDismiss}
            className="text-sm font-medium transition-opacity duration-150 hover:opacity-70"
            style={{ color: "var(--color-gold)", cursor: "pointer" }}
          >
            Got it
          </button>
        </div>
      </>,
      document.body
    );
  }

  return createPortal(
    <>
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(26,22,20,0.72)",
          zIndex: 199,
          pointerEvents: "none",
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Rune update notice"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 202,
          width: "460px",
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "calc(100vh - 64px)",
          overflowY: "auto",
          background: "var(--color-sepia)",
          border: "1px solid var(--color-border-strong)",
          borderRadius: "10px",
          padding: "32px 28px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
        }}
      >
        <p
          className="font-rune-serif text-2xl"
          style={{ color: "var(--text-primary)", marginBottom: "12px" }}
        >
          Welcome back to Rune.
        </p>
        <p
          className="font-rune-serif text-sm leading-relaxed"
          style={{ color: "var(--color-mist)", marginBottom: "28px" }}
        >
          We&apos;ve made major improvements since your last visit. Rune now
          includes a new and improved dashboard, a guided onboarding experience,
          page guides, redesigned progress and stats, and a much more generous
          Free plan — with goals, notes, exports, stats, and more available to
          everyone.
        </p>

        <div style={{ display: "flex", gap: "16px", alignItems: "center", marginBottom: "20px" }}>
          <button
            type="button"
            onClick={handleShowMe}
            disabled={loading}
            className="font-rune-serif text-sm font-medium transition-opacity duration-150"
            style={{
              background: "var(--color-gold)",
              color: "var(--color-ink)",
              padding: "10px 22px",
              borderRadius: "6px",
              opacity: loading ? 0.6 : 1,
              cursor: loading ? "default" : "pointer",
            }}
          >
            {loading ? "Opening…" : "Show me"}
          </button>
          <button
            type="button"
            onClick={handleSkip}
            disabled={loading}
            className="font-rune-serif text-sm transition-opacity duration-150"
            style={{
              color: "var(--color-mist)",
              opacity: loading ? 0.3 : 0.65,
              cursor: loading ? "default" : "pointer",
            }}
            onMouseEnter={(e) => {
              if (!loading) (e.currentTarget as HTMLElement).style.opacity = "0.9";
            }}
            onMouseLeave={(e) => {
              if (!loading) (e.currentTarget as HTMLElement).style.opacity = "0.65";
            }}
          >
            Skip
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowNotes((v) => !v)}
          className="font-rune-serif text-sm transition-opacity duration-150"
          style={{
            color: "var(--color-gold)",
            opacity: 0.8,
            cursor: "pointer",
            background: "none",
            border: "none",
            padding: 0,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.opacity = "1";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.opacity = "0.8";
          }}
        >
          {showNotes ? "Hide release notes" : "View everything that's new"}
        </button>

        {showNotes && (
          <div
            style={{
              marginTop: "24px",
              paddingTop: "24px",
              borderTop: "1px solid var(--color-border)",
            }}
          >
            {RELEASE_SECTIONS.map((section) => (
              <div key={section.title} style={{ marginBottom: "20px" }}>
                <p
                  className="font-rune-serif text-xs font-semibold uppercase tracking-widest"
                  style={{
                    color: "var(--color-gold)",
                    marginBottom: "8px",
                    letterSpacing: "0.12em",
                  }}
                >
                  {section.title}
                </p>
                <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {section.items.map((item) => (
                    <li
                      key={item}
                      className="font-rune-serif text-sm"
                      style={{
                        color: "var(--color-mist)",
                        lineHeight: "1.7",
                        paddingLeft: "12px",
                        position: "relative",
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          position: "absolute",
                          left: 0,
                          top: "0.55em",
                          width: "4px",
                          height: "4px",
                          borderRadius: "50%",
                          background: "var(--color-gold)",
                          opacity: 0.5,
                          display: "block",
                        }}
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <p
              className="font-rune-serif text-sm"
              style={{
                color: "var(--color-mist)",
                opacity: 0.7,
                marginTop: "8px",
                fontStyle: "italic",
              }}
            >
              This is only the beginning. Thank you for helping shape Rune.
            </p>
          </div>
        )}
      </div>
    </>,
    document.body
  );
}
