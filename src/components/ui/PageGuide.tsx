"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";

export interface GuideStep {
  target?: string;
  heading: string;
  copy: string;
  side?: "right" | "bottom" | "left" | "center";
  measureDelay?: number;
}

interface PageGuideProps {
  steps: GuideStep[];
  isOpen: boolean;
  onClose: () => void;
  onStepChange?: (stepIndex: number) => void;
}

interface MeasuredRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const PAD = 10;
const TOOLTIP_GAP = 14;
const OVERLAY_BG = "rgba(26,22,20,0.72)";
const MAX_W = 400;
const MARGIN = 8;
const TOOLTIP_H = 160;

export function PageGuide({ steps, isOpen, onClose, onStepChange }: PageGuideProps) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<MeasuredRect | null>(null);
  const [highlightRadius, setHighlightRadius] = useState("8px");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) setStep(0);
  }, [isOpen]);

  // Notify parent of step changes
  useEffect(() => {
    if (!isOpen) return;
    onStepChange?.(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, step]);

  const currentStep = steps[step];

  // Measure target element
  useEffect(() => {
    if (!isOpen || !currentStep) {
      setRect(null);
      return;
    }
    if (!currentStep.target || currentStep.side === "center") {
      setRect(null);
      return;
    }

    const delay = currentStep.measureDelay ?? 80;
    const target = currentStep.target;

    // Scroll the target into view immediately so the delayed measure reads a stable position
    const targetEl = document.querySelector<HTMLElement>(`[data-guide="${target}"]`);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "instant" as ScrollBehavior, block: "nearest" });
    }

    function measure() {
      const el = document.querySelector<HTMLElement>(`[data-guide="${target}"]`);
      if (!el) {
        setRect(null);
        setHighlightRadius("8px");
        return;
      }

      const raw = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const vw = window.innerWidth;

      // Clip rect to viewport so the spotlight never extends off-screen
      setRect({
        top: Math.max(0, raw.top),
        bottom: Math.min(vh, raw.bottom),
        left: Math.max(0, raw.left),
        right: Math.min(vw, raw.right),
      });

      // Match highlight border radius to the target element
      const br = window.getComputedStyle(el).borderRadius;
      setHighlightRadius(br && br !== "0px" ? br : "8px");
    }

    const t = setTimeout(measure, delay);
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
    };
  }, [isOpen, step, currentStep]);

  const advance = useCallback(() => {
    if (step >= steps.length - 1) {
      onClose();
    } else {
      setStep((s) => s + 1);
    }
  }, [step, steps.length, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        advance();
      } else if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, advance, onClose]);

  if (!mounted || !isOpen || !currentStep) return null;

  const sTop = rect ? rect.top - PAD : 0;
  const sLeft = rect ? rect.left - PAD : 0;
  const sRight = rect ? rect.right + PAD : 0;
  const sBottom = rect ? rect.bottom + PAD : 0;
  const sW = sRight - sLeft;
  const sH = sBottom - sTop;

  const tooltipBase: React.CSSProperties = {
    position: "fixed",
    zIndex: 202,
    minWidth: "300px",
    maxWidth: "400px",
    width: "max-content",
    background: "var(--color-sepia)",
    border: "1px solid var(--color-border-strong)",
    borderRadius: "8px",
    padding: "16px 18px",
    boxShadow: "0 6px 28px rgba(0,0,0,0.38)",
    pointerEvents: "auto",
  };

  let tooltipPos: React.CSSProperties;

  if (!rect || currentStep.side === "center") {
    tooltipPos = { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  } else if (currentStep.side === "right") {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const top = Math.max(MARGIN, Math.min(sTop + sH / 2, vh - 120));
    const left = Math.min(sRight + TOOLTIP_GAP, vw - MAX_W - MARGIN);
    tooltipPos = {
      top: `${top}px`,
      left: `${Math.max(MARGIN, left)}px`,
      transform: "translateY(-50%)",
    };
  } else if (currentStep.side === "left") {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const top = Math.max(MARGIN, Math.min(sTop + sH / 2, vh - 120));
    // If there isn't enough horizontal room to the left, center instead
    const spaceOnLeft = sLeft - TOOLTIP_GAP;
    if (spaceOnLeft < MAX_W + MARGIN) {
      tooltipPos = { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
    } else {
      tooltipPos = {
        top: `${top}px`,
        right: `${vw - sLeft + TOOLTIP_GAP}px`,
        transform: "translateY(-50%)",
      };
    }
  } else {
    // bottom (default) — flip above when the tooltip would clip off-screen
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const centerX = sLeft + sW / 2;
    const left = Math.max(MARGIN, Math.min(centerX - MAX_W / 2, vw - MAX_W - MARGIN));
    const wouldClipBottom = sBottom + TOOLTIP_GAP + TOOLTIP_H > vh;
    const canFlipAbove = sTop - TOOLTIP_GAP - TOOLTIP_H >= MARGIN;
    if (wouldClipBottom && canFlipAbove) {
      tooltipPos = { bottom: `${vh - sTop + TOOLTIP_GAP}px`, left: `${left}px` };
    } else if (wouldClipBottom) {
      // No room above or below — center
      tooltipPos = { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
    } else {
      tooltipPos = { top: `${sBottom + TOOLTIP_GAP}px`, left: `${left}px` };
    }
  }

  const isLastStep = step >= steps.length - 1;

  return createPortal(
    <div role="region" aria-label="Page guide">
      {rect ? (
        <>
          <div aria-hidden style={{ position: "fixed", top: 0, left: 0, right: 0, height: `${sTop}px`, background: OVERLAY_BG, zIndex: 199, pointerEvents: "none" }} />
          <div aria-hidden style={{ position: "fixed", top: `${sBottom}px`, left: 0, right: 0, bottom: 0, background: OVERLAY_BG, zIndex: 199, pointerEvents: "none" }} />
          <div aria-hidden style={{ position: "fixed", top: `${sTop}px`, left: 0, width: `${sLeft}px`, height: `${sH}px`, background: OVERLAY_BG, zIndex: 199, pointerEvents: "none" }} />
          <div aria-hidden style={{ position: "fixed", top: `${sTop}px`, left: `${sRight}px`, right: 0, height: `${sH}px`, background: OVERLAY_BG, zIndex: 199, pointerEvents: "none" }} />
        </>
      ) : (
        <div aria-hidden style={{ position: "fixed", inset: 0, background: OVERLAY_BG, zIndex: 199, pointerEvents: "none" }} />
      )}

      {/* Full-screen click interceptor — blocks all underlying UI clicks */}
      <div
        onClick={advance}
        aria-hidden
        style={{ position: "fixed", inset: 0, zIndex: 200, cursor: "pointer", background: "transparent" }}
      />

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
            borderRadius: highlightRadius,
            boxShadow: "0 0 0 1px rgba(201,168,76,0.10), 0 0 20px rgba(201,168,76,0.16)",
            zIndex: 201,
            pointerEvents: "none",
          }}
        />
      )}

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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <span className="text-xs tabular-nums" style={{ color: "var(--color-mist)", opacity: 0.5 }}>
            {step + 1} / {steps.length}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="text-xs transition-opacity duration-150"
              style={{ color: "var(--color-mist)", opacity: 0.5, cursor: "pointer" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = "0.9")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = "0.5")}
            >
              Close
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); advance(); }}
              className="text-xs font-medium transition-opacity duration-150"
              style={{ color: "var(--color-gold)", cursor: "pointer" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = "0.7")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = "1")}
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
