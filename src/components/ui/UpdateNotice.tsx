"use client";

import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useProfileStore } from "@/store/profileStore";
import { updatePreferences, getRecentEditorChapter } from "@/lib/actions/settings";

type Stage = "modal" | "help-card" | "dismissed";

export function UpdateNotice() {
  const router = useRouter();
  const setPreferences = useProfileStore((s) => s.setPreferences);
  const [stage, setStage] = useState<Stage>("modal");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

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
          width: "420px",
          maxWidth: "calc(100vw - 32px)",
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
          Rune has changed.
        </p>
        <p
          className="font-rune-serif text-sm leading-relaxed"
          style={{ color: "var(--color-mist)", marginBottom: "28px" }}
        >
          We&apos;ve rebuilt onboarding, added page guides, and improved the
          writing experience. You can take a short editor guide now, or skip it
          and keep writing.
        </p>
        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
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
      </div>
    </>,
    document.body
  );
}
