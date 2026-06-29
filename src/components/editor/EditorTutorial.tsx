"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useProfileStore } from "@/store/profileStore";
import { updatePreferences } from "@/lib/actions/settings";

interface Step {
  spotlightId: string;
  heading: string;
  copy: string;
  side: "right" | "bottom";
}

const STEPS: Step[] = [
  {
    spotlightId: "pages-sidebar",
    heading: "Pages",
    copy: "Each page is a place to write. Create as many as you need for a chapter.",
    side: "right",
  },
  {
    spotlightId: "chapter-switch-btn",
    heading: "Quick Chapter Switch",
    copy: "Switch between chapters without leaving the editor.",
    side: "right",
  },
  {
    spotlightId: "canonical-control",
    heading: "Canonical Page",
    copy: "Choose which page represents the current version of this chapter.",
    side: "right",
  },
  {
    spotlightId: "focus-mode-btn",
    heading: "Focus Mode",
    copy: "Hide the interface so you can focus only on your writing.",
    side: "bottom",
  },
  {
    spotlightId: "export-btn",
    heading: "Export",
    copy: "Export your manuscript whenever you're ready.",
    side: "bottom",
  },
];

const PAD = 10;
const TOOLTIP_GAP = 14;
const OVERLAY_BG = "rgba(26,22,20,0.72)";

interface Props {
  active: boolean;
  forceRun?: boolean;
}

export function EditorTutorial({ active, forceRun = false }: Props) {
  const profile = useProfileStore((s) => s.profile);
  const setPreferences = useProfileStore((s) => s.setPreferences);

  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [showHelpCard, setShowHelpCard] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const alreadyCompleted = !!(
    (profile?.preferences as Record<string, unknown> | null)
      ?.has_completed_editor_tutorial
  );

  useEffect(() => {
    if (!active || (!forceRun && alreadyCompleted) || !mounted) return;
    const t = setTimeout(() => setRunning(true), 800);
    return () => clearTimeout(t);
  }, [active, forceRun, alreadyCompleted, mounted]);

  const markComplete = useCallback(async () => {
    setRunning(false);
    setStep(0);
    setRect(null);
    setPreferences({ has_completed_editor_tutorial: true });
    await updatePreferences({ has_completed_editor_tutorial: true });
  }, [setPreferences]);

  const handleComplete = useCallback(() => {
    setRunning(false);
    setStep(0);
    setRect(null);
    setShowHelpCard(true);
  }, []);

  const handleSkip = useCallback(() => {
    setRunning(false);
    setStep(0);
    setRect(null);
    setShowHelpCard(true);
  }, []);

  const handleHelpCardDismiss = useCallback(async () => {
    setShowHelpCard(false);
    await markComplete();
    setDone(true);
    setTimeout(() => setDone(false), 2600);
  }, [markComplete]);

  const advance = useCallback(() => {
    if (step >= STEPS.length - 1) {
      handleComplete();
    } else {
      setStep((s) => s + 1);
    }
  }, [step, handleComplete]);

  // Keyboard: Enter/Space advance, Escape skip
  useEffect(() => {
    if (!running) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        advance();
      } else if (e.key === "Escape") {
        handleSkip();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, advance, handleSkip]);

  const currentStep = STEPS[step];

  // Measure spotlight target after each step change
  useEffect(() => {
    if (!running || !currentStep) return;

    function measure() {
      const el = document.querySelector<HTMLElement>(
        `[data-tutorial-id="${currentStep.spotlightId}"]`
      );
      setRect(el ? el.getBoundingClientRect() : null);
    }

    const t = setTimeout(measure, 60);
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
    };
  }, [running, step, currentStep]);

  if (!mounted || (!running && !done && !showHelpCard)) return null;

  // ── Help card (shown after complete or skip) ─────────────────────────────────

  if (showHelpCard) {
    return createPortal(
      <>
        <div aria-hidden style={{ position: "fixed", inset: 0, background: "rgba(26,22,20,0.72)", zIndex: 199, pointerEvents: "none" }} />
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
            Many pages in Rune have a small <strong style={{ color: "var(--color-gold)" }}>?</strong> button. Click it anytime to replay a short guide for that page.
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

  // ── Done state ───────────────────────────────────────────────────────────────

  if (done) {
    return createPortal(
      <div
        role="status"
        aria-live="polite"
        className="rune-tutorial-rise"
        style={{
          position: "fixed",
          bottom: "44px",
          left: "50%",
          zIndex: 300,
          background: "var(--color-sepia)",
          border: "1px solid var(--color-border-strong)",
          borderRadius: "8px",
          padding: "13px 22px",
          boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
        }}
      >
        <p
          className="font-rune-serif text-base italic"
          style={{ color: "var(--color-mist)", whiteSpace: "nowrap" }}
        >
          You&apos;re ready. Keep writing.
        </p>
      </div>,
      document.body
    );
  }

  // ── Spotlight geometry ───────────────────────────────────────────────────────

  const sTop = rect ? rect.top - PAD : 0;
  const sLeft = rect ? rect.left - PAD : 0;
  const sRight = rect ? rect.right + PAD : 0;
  const sBottom = rect ? rect.bottom + PAD : 0;
  const sW = sRight - sLeft;
  const sH = sBottom - sTop;

  // ── Tooltip position ─────────────────────────────────────────────────────────

  const tooltipBase: React.CSSProperties = {
    position: "fixed",
    zIndex: 202,
    minWidth: "340px",
    maxWidth: "420px",
    width: "max-content",
    background: "var(--color-sepia)",
    border: "1px solid var(--color-border-strong)",
    borderRadius: "8px",
    padding: "16px 18px",
    boxShadow: "0 6px 28px rgba(0,0,0,0.38)",
    pointerEvents: "auto",
  };

  let tooltipPos: React.CSSProperties;
  if (!rect) {
    // No target found — center-bottom fallback
    tooltipPos = { bottom: "60px", left: "50%", transform: "translateX(-50%)" };
  } else if (currentStep.side === "right") {
    tooltipPos = {
      top: `${sTop + sH / 2}px`,
      left: `${sRight + TOOLTIP_GAP}px`,
      transform: "translateY(-50%)",
    };
  } else {
    const vw = window.innerWidth;
    const MARGIN = 8;
    const MAX_W = 420;
    const centerX = sLeft + sW / 2;
    const left = Math.max(MARGIN, Math.min(centerX - MAX_W / 2, vw - MAX_W - MARGIN));
    tooltipPos = {
      top: `${sBottom + TOOLTIP_GAP}px`,
      left: `${left}px`,
    };
  }

  const isLastStep = step >= STEPS.length - 1;

  return createPortal(
    <div role="region" aria-label="Editor tutorial">
      {/*
       * ── Visual darkening panels (z-index 199, pointer-events: none) ──────────
       * Four panels leave a rectangular spotlight hole so the target remains
       * visible. These panels do NOT intercept clicks — that is handled by the
       * transparent interceptor below.
       */}
      {rect ? (
        <>
          <div aria-hidden style={{ position: "fixed", top: 0, left: 0, right: 0, height: `${sTop}px`, background: OVERLAY_BG, zIndex: 199, pointerEvents: "none" }} />
          <div aria-hidden style={{ position: "fixed", top: `${sBottom}px`, left: 0, right: 0, bottom: 0, background: OVERLAY_BG, zIndex: 199, pointerEvents: "none" }} />
          <div aria-hidden style={{ position: "fixed", top: `${sTop}px`, left: 0, width: `${sLeft}px`, height: `${sH}px`, background: OVERLAY_BG, zIndex: 199, pointerEvents: "none" }} />
          <div aria-hidden style={{ position: "fixed", top: `${sTop}px`, left: `${sRight}px`, right: 0, height: `${sH}px`, background: OVERLAY_BG, zIndex: 199, pointerEvents: "none" }} />
        </>
      ) : (
        // Target not in DOM — full-screen dark fallback
        <div aria-hidden style={{ position: "fixed", inset: 0, background: OVERLAY_BG, zIndex: 199, pointerEvents: "none" }} />
      )}

      {/*
       * ── Transparent full-screen click interceptor (z-index 200) ─────────────
       * Sits above the visual panels AND above all app UI elements (which have
       * no explicit z-index). Every pointer event is captured here; nothing
       * reaches the underlying controls. Clicking anywhere advances the step.
       */}
      <div
        onClick={advance}
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 200,
          cursor: "pointer",
          background: "transparent",
        }}
      />

      {/* ── Gold spotlight ring (z-index 201, pointer-events: none) ─────────── */}
      {rect && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            top: `${sTop}px`,
            left: `${sLeft}px`,
            width: `${sW}px`,
            height: `${sH}px`,
            border: "1.5px solid rgba(201,168,76,0.65)",
            borderRadius: "6px",
            boxShadow: "0 0 0 1px rgba(201,168,76,0.10), 0 0 20px rgba(201,168,76,0.16)",
            zIndex: 201,
            pointerEvents: "none",
          }}
        />
      )}

      {/*
       * ── Tooltip card (z-index 202, pointer-events: auto) ────────────────────
       * Sits above the interceptor. Skip and Next buttons receive clicks
       * normally; Skip uses stopPropagation so it does not also trigger the
       * interceptor's advance handler.
       */}
      <div style={{ ...tooltipBase, ...tooltipPos }}>
        <p
          className="font-rune-serif text-xs font-medium"
          style={{ color: "var(--color-gold)", marginBottom: "4px", letterSpacing: "0.04em", textTransform: "uppercase" }}
        >
          {currentStep.heading}
        </p>
        <p
          className="font-rune-serif text-sm leading-relaxed"
          style={{ color: "var(--text-primary)", marginBottom: "14px" }}
        >
          {currentStep.copy}
        </p>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <span
            className="text-xs tabular-nums"
            style={{ color: "var(--color-mist)", opacity: 0.5 }}
          >
            {step + 1} / {STEPS.length}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleSkip();
              }}
              className="text-xs transition-opacity duration-150"
              style={{ color: "var(--color-mist)", opacity: 0.5, cursor: "pointer" }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.opacity = "0.9")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.opacity = "0.5")
              }
            >
              Skip
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                advance();
              }}
              className="text-xs font-medium transition-opacity duration-150"
              style={{ color: "var(--color-gold)", cursor: "pointer" }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.opacity = "0.7")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.opacity = "1")
              }
            >
              {isLastStep ? "Done" : "Next →"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
