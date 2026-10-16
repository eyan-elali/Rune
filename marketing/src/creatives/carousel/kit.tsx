import type { CSSProperties, ReactNode } from "react";
import { Img, staticFile } from "remotion";
import { WORDMARK } from "@/lib/brand";
import { Camera, type CameraState } from "../../foundation/Camera";
import { Navigator, type NavSectionSpec } from "../../ui/Navigator";
import { ContextBar, Shell, TabBand, type TabSpec } from "../../ui/Shell";
import { PEN_NAME, PROJECT } from "./content";

// The carousel's kit: the format, its grid, its two type voices, and the
// product drawn exactly as the film draws it — one light Sutura root (the
// real shell: ui/*, the app's markup and rune2.css) placed on the film's dark
// stage. Only the window's size and the camera are the carousel's.

/** Instagram portrait, 4:5. */
export const SLIDE = { width: 1080, height: 1350 } as const;

/**
 * The grid every slide shares. One left margin — the line all copy hangs
 * from, and where product edges land when they are not bleeding. The profile
 * grid crops a 4:5 post to 3:4 (about 34px off each side), so nothing that
 * must be read sits outside the margin.
 */
export const GRID = {
  left: 88,
  right: 88,
  top: 96,
  bottom: 96,
} as const;

// ── Type ───────────────────────────────────────────────────────────────────
// Two voices, both Sutura's own: the manuscript serif (EB Garamond) speaks;
// the interface sans (Inter) labels. The statement is roman; its answer is
// italic in the accent's ink — the film's end card and the landing hero.

export const SERIF = "var(--r2-prose-font)";
export const SANS = "var(--r2-font-ui)";

export function Statement({ children, size = 96, style }: { children: ReactNode; size?: number; style?: CSSProperties }) {
  return (
    <h1
      style={{
        fontFamily: SERIF,
        fontWeight: 400,
        fontSize: size,
        lineHeight: 1.04,
        letterSpacing: "-0.022em",
        color: "var(--r2-ink-1)",
        textWrap: "balance",
        ...style,
      }}
    >
      {children}
    </h1>
  );
}

export function Answer({ children, size = 48, style }: { children: ReactNode; size?: number; style?: CSSProperties }) {
  return (
    <p
      style={{
        fontFamily: SERIF,
        fontStyle: "italic",
        fontWeight: 400,
        fontSize: size,
        lineHeight: 1.18,
        letterSpacing: "-0.008em",
        color: "var(--r2-accent-ink)",
        textWrap: "balance",
        ...style,
      }}
    >
      {children}
    </p>
  );
}

export function Label({ children, size = 26, style }: { children: ReactNode; size?: number; style?: CSSProperties }) {
  return (
    <p style={{ fontFamily: SANS, fontWeight: 500, fontSize: size, letterSpacing: "0.02em", color: "var(--r2-ink-2)", ...style }}>{children}</p>
  );
}

export function Wordmark({ width = 180, onLight = false, style }: { width?: number; onLight?: boolean; style?: CSSProperties }) {
  return <Img src={staticFile((onLight ? WORDMARK.onLight : WORDMARK.onDark).replace(/^\//, ""))} style={{ width, height: "auto", ...style }} alt="Sutura" />;
}

// ── The product ────────────────────────────────────────────────────────────

/** A light Sutura root shaped as a window (Keyframes' Window, at any size). */
export function LightWindow({
  width,
  height,
  radius = 12,
  shadow = true,
  children,
}: {
  width: number;
  height: number;
  radius?: number;
  shadow?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className="r2"
      data-theme="light"
      data-accent="blue"
      data-surface="theme"
      style={{
        position: "relative",
        width,
        height,
        borderRadius: radius,
        overflow: "hidden",
        background: "var(--r2-shell-bg)",
        boxShadow: shadow ? "0 0 0 1px rgba(var(--r2-palette-ink) / 0.10), 0 30px 90px rgba(0 0 0 / 0.45)" : undefined,
      }}
    >
      {children}
    </div>
  );
}

export type ShellState = {
  width: number;
  height: number;
  nav?: NavSectionSpec[];
  navWidth?: number;
  navCollapsed?: boolean;
  tabs: TabSpec[];
  trail: string[];
  manuscript: boolean;
  add?: "Scene" | "Entry";
  panelAction?: "notes" | "inspector";
  main: ReactNode;
  panel?: ReactNode;
  status?: ReactNode;
  /** Extra CSS scoped to this shell (a still's emphasis), keyed by data-cs. */
  css?: string;
  scope?: string;
};

/** The real shell (ui/Shell) for one still. */
export function ShellView({ s }: { s: ShellState }) {
  return (
    <div data-cs={s.scope} style={{ width: s.width, height: s.height }}>
      {s.css && <style>{s.css}</style>}
      <Shell
        width={s.width}
        height={s.height}
        navWidth={s.navWidth ?? 252}
        manuscript={s.manuscript}
        navCollapsed={s.navCollapsed}
        nav={<Navigator project={PROJECT} sections={s.nav ?? []} penName={PEN_NAME} />}
        tabs={<TabBand tabs={s.tabs} />}
        contextBar={<ContextBar project={PROJECT} trail={s.trail} read={s.manuscript} add={s.add} panel={s.panelAction} />}
        main={s.main}
        panel={s.panel}
        status={s.status}
      />
    </div>
  );
}

/**
 * The product, framed on the slide: a clip rectangle (the slide's region the
 * window shows through) and a camera inside it. Edges that run off the slide
 * read as a larger screen; edges inside it are the window's own.
 */
export function Frame({
  clip,
  camera,
  children,
  style,
}: {
  clip: { x: number; y: number; w: number; h: number; radius?: number | string };
  camera: CameraState;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div style={{ position: "absolute", left: clip.x, top: clip.y, width: clip.w, height: clip.h, overflow: "hidden", borderRadius: clip.radius, ...style }}>
      <Camera state={camera}>{children}</Camera>
    </div>
  );
}

/** A camera state: logical point (x, y) pinned to (ax, ay) of its frame, at scale s. */
export const at = (x: number, y: number, s: number, ax = 0, ay = 0): CameraState => ({ x, y, s, ax, ay });

/** A caret in the writing surface's own colour. */
export const caretStyle: CSSProperties = {
  display: "inline-block",
  width: 2,
  height: "1.08em",
  marginLeft: 1,
  marginRight: -3,
  verticalAlign: "-0.18em",
  background: "var(--r2-ms-caret)",
};
