"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useProfileStore } from "@/store/profileStore";
import { useModeStore } from "@/store/modeStore";
import { updatePreferences } from "@/lib/actions/settings";

interface Step {
  spotlightId: string;
  listenerId: string | null;
  copy: string;
  side: "right" | "bottom";
  forceMenuVisible?: boolean;
}

const STEPS: Step[] = [
  {
    spotlightId: "pages-sidebar",
    listenerId: "pages-sidebar",
    copy: "Pages live here. Your manuscript is built one page at a time.",
    side: "right",
  },
  {
    spotlightId: "chapter-switch-btn",
    listenerId: "chapter-switch-btn",
    copy: "Move between chapters without leaving the editor.",
    side: "right",
  },
  {
    spotlightId: "pages-sidebar",
    listenerId: "page-menu-btn",
    copy: "Mark the page that counts toward your manuscript.",
    side: "right",
    forceMenuVisible: true,
  },
  {
    spotlightId: "focus-mode-btn",
    listenerId: null,
    copy: "When you want only the page, enter Focus Mode.",
    side: "bottom",
  },
  {
    spotlightId: "export-btn",
    listenerId: "export-btn",
    copy: "When you're ready, export your pages from here.",
    side: "bottom",
  },
];

const PAD = 10;
const TOOLTIP_GAP = 14;
const OVERLAY_BG = "rgba(26,22,20,0.72)";

interface Props {
  active: boolean;
}

export function EditorTutorial({ active }: Props) {
  const profile = useProfileStore((s) => s.profile);
  const setPreferences = useProfileStore((s) => s.setPreferences);
  const setMode = useModeStore((s) => s.setMode);

  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [mounted, setMounted] = useState(false);

  const stepRef = useRef(step);
  stepRef.current = step;
  const runningRef = useRef(running);
  runningRef.current = running;

  useEffect(() => {
    setMounted(true);
  }, []);

  const alreadyCompleted = !!(
    (profile?.preferences as Record<string, unknown> | null)
      ?.has_completed_editor_tutorial
  );

  useEffect(() => {
    if (!active || alreadyCompleted || !mounted) return;
    const t = setTimeout(() => setRunning(true), 800);
    return () => clearTimeout(t);
  }, [active, alreadyCompleted, mounted]);

  const markComplete = useCallback(async () => {
    setRunning(false);
    setStep(0);
    setRect(null);
    delete document.documentElement.dataset.tutorialStep;
    setPreferences({ has_completed_editor_tutorial: true });
    await updatePreferences({ has_completed_editor_tutorial: true });
  }, [setPreferences]);

  const handleComplete = useCallback(async () => {
    await markComplete();
    setDone(true);
    setTimeout(() => setDone(false), 2600);
  }, [markComplete]);

  const handleSkip = useCallback(async () => {
    await markComplete();
  }, [markComplete]);

  // Expose current step index on <html> for CSS overrides (e.g. force page-menu visible)
  useEffect(() => {
    if (running) {
      document.documentElement.dataset.tutorialStep = String(step);
    } else {
      delete document.documentElement.dataset.tutorialStep;
    }
    return () => {
      delete document.documentElement.dataset.tutorialStep;
    };
  }, [running, step]);

  const currentStep = STEPS[step];

  // Measure spotlight target rect
  useEffect(() => {
    if (!running || !currentStep) return;

    function measure() {
      const el = document.querySelector<HTMLElement>(
        `[data-tutorial-id="${currentStep.spotlightId}"]`
      );
      if (el) {
        setRect(el.getBoundingClientRect());
      } else {
        setRect(null);
      }
    }

    const t = setTimeout(measure, 60);
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
    };
  }, [running, step, currentStep]);

  // Click listener for all steps except focus-mode (step 3)
  useEffect(() => {
    if (!running || !currentStep || currentStep.listenerId === null) return;

    const el = document.querySelector<HTMLElement>(
      `[data-tutorial-id="${currentStep.listenerId}"]`
    );
    if (!el) return;

    function handleClick() {
      if (stepRef.current >= STEPS.length - 1) {
        handleComplete();
      } else {
        setStep((s) => s + 1);
      }
    }

    el.addEventListener("click", handleClick, { once: true });
    return () => el.removeEventListener("click", handleClick);
  }, [running, step, currentStep, handleComplete]);

  // Focus Mode step: subscribe to mode store instead of a click listener
  useEffect(() => {
    if (!running || step !== 3) return;

    const unsub = useModeStore.subscribe((state) => {
      if (state.mode === "focus") {
        unsub();
        // Brief pause so the user sees focus mode, then restore and show export step
        setTimeout(() => {
          setMode("normal");
          setStep(4);
        }, 650);
      }
    });

    return unsub;
  }, [running, step, setMode]);

  if (!mounted) return null;
  if (!running && !done) return null;

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

  if (!rect) return null;

  // ── Spotlight geometry ───────────────────────────────────────────────────────

  const sTop = rect.top - PAD;
  const sLeft = rect.left - PAD;
  const sRight = rect.right + PAD;
  const sBottom = rect.bottom + PAD;
  const sW = sRight - sLeft;
  const sH = sBottom - sTop;

  // ── Tooltip position ─────────────────────────────────────────────────────────

  const tooltipBase: React.CSSProperties = {
    position: "fixed",
    zIndex: 202,
    maxWidth: "260px",
    background: "var(--color-sepia)",
    border: "1px solid var(--color-border-strong)",
    borderRadius: "8px",
    padding: "16px 18px",
    boxShadow: "0 6px 28px rgba(0,0,0,0.38)",
    pointerEvents: "auto",
  };

  const tooltipPos: React.CSSProperties =
    currentStep.side === "right"
      ? {
          top: `${sTop + sH / 2}px`,
          left: `${sRight + TOOLTIP_GAP}px`,
          transform: "translateY(-50%)",
        }
      : {
          top: `${sBottom + TOOLTIP_GAP}px`,
          left: `${sLeft + sW / 2}px`,
          transform: "translateX(-50%)",
        };

  return createPortal(
    <div role="region" aria-label="Editor tutorial">
      {/* Four-panel dark overlay — leaves spotlight hole uncovered */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: `${sTop}px`,
          background: OVERLAY_BG,
          zIndex: 200,
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "fixed",
          top: `${sBottom}px`,
          left: 0,
          right: 0,
          bottom: 0,
          background: OVERLAY_BG,
          zIndex: 200,
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "fixed",
          top: `${sTop}px`,
          left: 0,
          width: `${sLeft}px`,
          height: `${sH}px`,
          background: OVERLAY_BG,
          zIndex: 200,
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "fixed",
          top: `${sTop}px`,
          left: `${sRight}px`,
          right: 0,
          height: `${sH}px`,
          background: OVERLAY_BG,
          zIndex: 200,
          pointerEvents: "none",
        }}
      />

      {/* Gold ring around spotlight */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          top: `${sTop}px`,
          left: `${sLeft}px`,
          width: `${sW}px`,
          height: `${sH}px`,
          border: "1.5px solid rgba(201,168,76,0.6)",
          borderRadius: "6px",
          boxShadow:
            "0 0 0 1px rgba(201,168,76,0.10), 0 0 20px rgba(201,168,76,0.16)",
          zIndex: 201,
          pointerEvents: "none",
        }}
      />

      {/* Tooltip card */}
      <div style={{ ...tooltipBase, ...tooltipPos }}>
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
          }}
        >
          <span
            className="text-xs tabular-nums"
            style={{ color: "var(--color-mist)", opacity: 0.55 }}
          >
            {step + 1} / {STEPS.length}
          </span>
          <button
            type="button"
            onClick={handleSkip}
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
        </div>
      </div>
    </div>,
    document.body
  );
}
