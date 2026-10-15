import type { CSSProperties, ReactNode } from "react";
import { useCurrentFrame } from "remotion";
import { mix, presence, progress } from "./time";

// An editorial caption: one line of Sutura's voice, set as the landing
// page's statements are (front.css: .r2-lp-h2 / .r2-lp-title — the
// manuscript serif, regular weight, tight leading, a little negative
// tracking, the first ink). It arrives with the landing page's one settle —
// a short rise and fade — and leaves by fading alone. Nothing is typed out.

export type CaptionStyle = {
  /** px */
  size: number;
  align?: "left" | "center";
  /** The caption's box width, px. */
  width: number;
};

export function Caption({
  children,
  inAt,
  outAt,
  style,
  italic = false,
  tone = "ink",
}: {
  children: ReactNode;
  /** Seconds. 0 or less: already standing at frame 0. */
  inAt: number;
  /** Seconds: gone by then. */
  outAt: number;
  style: CaptionStyle;
  italic?: boolean;
  /** "accent": the hero's second-line ink (--r2-accent-ink). */
  tone?: "ink" | "accent";
}) {
  const frame = useCurrentFrame();
  const opacity = presence(frame, inAt, outAt, 0.5, 0.32);
  const rise = inAt <= 0 ? 1 : progress(frame, inAt, 0.64);
  return (
    <p
      style={
        {
          width: style.width,
          fontFamily: "var(--r2-prose-font)",
          fontSize: style.size,
          fontWeight: 400,
          fontStyle: italic ? "italic" : "normal",
          lineHeight: 1.06,
          letterSpacing: "-0.024em",
          textWrap: "balance",
          textAlign: style.align ?? "left",
          color: tone === "accent" ? "var(--r2-accent-ink)" : "var(--r2-ink-1)",
          opacity,
          transform: `translateY(${mix(14, 0, rise)}px)`,
        } as CSSProperties
      }
    >
      {children}
    </p>
  );
}
