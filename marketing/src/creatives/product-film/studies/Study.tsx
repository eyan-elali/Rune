import type { ReactNode } from "react";
import { Html5Audio, Sequence, useCurrentFrame } from "remotion";
import { FPS } from "../../../foundation/formats";
import { Stage } from "../../../foundation/Stage";
import { FILM } from "../frames";
import { STAGE_INK } from "../ProductFilmStoryboard";
import { WithProbes, type ProbeSpec, type Probes } from "./probe";

// A motion study, run: the stage (the storyboard's ink field, the Dark theme
// root), the study's probes measured once, and its frame drawn as a pure
// function of time. Optional: the phase annotation (AUTHENTIC PRODUCT STATE vs
// FILM-ONLY TRANSITION, for review) and the cue sheet of sound.

export type Phase = { from: number; to: number; kind: "authentic" | "film-only"; label: string };
export type Cue = { at: number; src: string; volume: number; seconds: number; note: string };

export type StudyDef = {
  id: string;
  duration: number;
  probes: ProbeSpec[];
  phases: Phase[];
  cues: Cue[];
  /** The picture at t seconds, drawn on an opaque field (so motion blur can average it). */
  frame: (t: number, m: Probes) => ReactNode;
};

/**
 * A frame's own CSS scope. A study stages the real shell with scoped rules
 * (<style> in the frame); the strip draws many frames in one document, so
 * every frame's selectors carry its own key and never reach another's.
 */
export const frameScope = (t: number) => `f${Math.round(t * 10000)}`;

/** A light Sutura root without a window's shape: for film-only surfaces that must paint in the product's own tokens. */
export function LightRoot({ children }: { children: ReactNode }) {
  return (
    <div className="r2" data-theme="light" data-accent="blue" data-surface="theme" style={{ position: "absolute", left: 0, top: 0, background: "none" }}>
      {children}
    </div>
  );
}

/** The study's opaque ground: every frame (and every motion-blur subframe) starts here. */
export function Field({ children }: { children: ReactNode }) {
  return <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: STAGE_INK }}>{children}</div>;
}

function Annotation({ def, t }: { def: StudyDef; t: number }) {
  const phase = def.phases.find((p) => t >= p.from && t < p.to) ?? def.phases[def.phases.length - 1];
  const film = phase.kind === "film-only";
  return (
    <div
      style={{
        position: "absolute",
        left: 28,
        bottom: 24,
        display: "flex",
        gap: 12,
        alignItems: "center",
        padding: "8px 12px",
        borderRadius: 6,
        background: "rgba(0 0 0 / 0.72)",
        fontFamily: "Inter",
        fontSize: 17,
        color: "#fff",
        zIndex: 100,
      }}
    >
      <span style={{ fontWeight: 600, letterSpacing: "0.06em", color: film ? "#f4c56a" : "#8fd3a6" }}>{film ? "FILM-ONLY TRANSITION" : "AUTHENTIC PRODUCT STATE"}</span>
      <span style={{ opacity: 0.85 }}>{phase.label}</span>
      <span style={{ opacity: 0.55, fontVariantNumeric: "tabular-nums" }}>{t.toFixed(2)}s</span>
    </div>
  );
}

function Sound({ cues }: { cues: Cue[] }) {
  return (
    <>
      {cues.map((c, i) => (
        <Sequence key={i} from={Math.max(0, Math.round(c.at * FPS))} durationInFrames={Math.ceil(c.seconds * FPS) + 1} layout="none">
          <Html5Audio src={c.src} volume={c.volume} />
        </Sequence>
      ))}
    </>
  );
}

export function StudyComposition({ def, annotate = false, sound = true }: { def: StudyDef; annotate?: boolean; sound?: boolean }) {
  const t = useCurrentFrame() / FPS;
  return (
    <Stage appearance={{ theme: "dark", surface: "theme", accent: "blue" }} background={STAGE_INK}>
      <WithProbes probes={def.probes}>
        {(m) => (
          <>
            {def.frame(t, m)}
            {annotate && <Annotation def={def} t={t} />}
          </>
        )}
      </WithProbes>
      {sound && <Sound cues={def.cues} />}
    </Stage>
  );
}

/** A study's review strip: chosen moments side by side, each labelled with its time and phase. */
export const STRIP = { cols: 4, scale: 0.25, gap: 24, pad: 40 } as const;
export const stripSize = (n: number) => {
  const rows = Math.ceil(n / STRIP.cols);
  const w = FILM.width * STRIP.scale;
  const h = FILM.height * STRIP.scale;
  return { width: STRIP.pad * 2 + STRIP.cols * w + (STRIP.cols - 1) * STRIP.gap, height: STRIP.pad * 2 + rows * (h + 34) + (rows - 1) * STRIP.gap };
};

export function StudyStrip({ def, times }: { def: StudyDef; times: number[] }) {
  const w = FILM.width * STRIP.scale;
  const h = FILM.height * STRIP.scale;
  return (
    <Stage appearance={{ theme: "dark", surface: "theme", accent: "blue" }} background="#0b0c0f">
      <WithProbes probes={def.probes}>
        {(m) => (
          <div style={{ position: "absolute", inset: 0, padding: STRIP.pad, display: "grid", gridTemplateColumns: `repeat(${STRIP.cols}, ${w}px)`, gap: STRIP.gap, fontFamily: "Inter" }}>
            {times.map((t) => {
              const phase = def.phases.find((p) => t >= p.from && t < p.to) ?? def.phases[def.phases.length - 1];
              return (
                <figure key={t}>
                  <div style={{ position: "relative", width: w, height: h, overflow: "hidden", borderRadius: 4 }}>
                    <div style={{ position: "absolute", left: 0, top: 0, width: FILM.width, height: FILM.height, transform: `scale(${STRIP.scale})`, transformOrigin: "0 0" }}>{def.frame(t, m)}</div>
                  </div>
                  <figcaption style={{ marginTop: 8, fontSize: 15, color: "#cfd3da", display: "flex", gap: 10 }}>
                    <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{t.toFixed(2)}s</span>
                    <span style={{ color: phase.kind === "film-only" ? "#f4c56a" : "#8fd3a6" }}>{phase.kind}</span>
                    <span style={{ opacity: 0.7, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{phase.label}</span>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        )}
      </WithProbes>
    </Stage>
  );
}
