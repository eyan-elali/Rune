import type { CSSProperties } from "react";
import { Img, staticFile, useCurrentFrame } from "remotion";
import { WORDMARK } from "@/lib/brand";
import { mix, progress } from "./time";

// The close: the landing page's hero, still (FrontHero) — the approved
// wordmark, the statement in the manuscript serif with its second line
// italic in the accent's deep ink, and the small Early Access note. No
// button: the platform supplies the call to action.

export function EndFrame({
  inAt,
  titleSize,
  wordmarkWidth,
  noteSize,
  gap,
}: {
  /** Seconds. */
  inAt: number;
  titleSize: number;
  wordmarkWidth: number;
  noteSize: number;
  /** px between the wordmark and the statement. */
  gap: number;
}) {
  const frame = useCurrentFrame();
  const mark = progress(frame, inAt, 0.7);
  const title = progress(frame, inAt + 0.14, 0.7);
  const note = progress(frame, inAt + 0.42, 0.6);
  const rise = (t: number): CSSProperties => ({ opacity: t, transform: `translateY(${mix(12, 0, t)}px)` });
  // The ink for a light surface (Stage paints Light): the dark wordmark.
  const src = staticFile(WORDMARK.onLight.replace(/^\//, ""));
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
      <Img src={src} style={{ width: wordmarkWidth, height: "auto", ...rise(mark) }} alt="Sutura" />
      <h1
        style={{
          marginTop: gap,
          fontFamily: "var(--r2-prose-font)",
          fontSize: titleSize,
          fontWeight: 400,
          lineHeight: 1,
          letterSpacing: "-0.03em",
          color: "var(--r2-ink-1)",
          ...rise(title),
        }}
      >
        <span style={{ display: "block" }}>Write the book.</span>
        <span
          style={{
            display: "block",
            marginTop: "0.22em",
            fontSize: "0.5em",
            fontStyle: "italic",
            lineHeight: 1.12,
            letterSpacing: "-0.012em",
            color: "var(--r2-accent-ink)",
          }}
        >
          Build only what it asks for.
        </span>
      </h1>
      <p
        style={{
          marginTop: Math.round(gap * 0.9),
          fontFamily: "var(--r2-font-ui)",
          fontSize: noteSize,
          letterSpacing: "0.01em",
          color: "var(--r2-ink-3)",
          ...rise(note),
        }}
      >
        Early Access<span style={{ margin: "0 0.35em" }}>·</span>Free
      </p>
    </div>
  );
}
