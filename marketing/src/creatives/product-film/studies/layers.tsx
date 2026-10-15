import type { ReactNode } from "react";
import { SHELL, ShellFor, Window, type Plan } from "../Keyframes";

// One authentic state, drawn as two separable layers (the V2 studies:
// MOTION_LANGUAGE_EXPLORATION.md §9). The ENVIRONMENT — the window, its
// navigator, tabs, context bar, panel and the content column's empty ground —
// and the DOCUMENT — what the content column holds. A transition changes the
// environment in place (one environment over the other, same geometry, so
// only what differs changes) and resolves the document element by element,
// while the one semantic object travels above both. Nothing here sweeps.

/** CSS for one layer: `rules` maps a selector (inside the layer) to declarations. */
export const scoped = (scope: string, rules: Record<string, string>) =>
  Object.entries(rules)
    .map(([sel, decl]) => sel.split(",").map((s) => `[data-pf="${scope}"] ${s.trim()}`).join(", ") + ` { ${decl} }`)
    .join("\n");

/** The window without its document: the content column's ground stays, its contents are not drawn. */
export function Environment({ scope, plan, css = "", opacity = 1, hide = ".r2-main .r2-writing", children }: { scope: string; plan: Plan; css?: string; opacity?: number; /** What counts as the document (a Canvas holds no .r2-writing: ".r2-main > *"). */ hide?: string; children?: ReactNode }) {
  if (opacity <= 0.001) return null;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, opacity }}>
      <Window width={plan.window?.width} bare>
        <div data-pf={scope}>
          <style>{scoped(scope, { [hide]: "visibility: hidden;" }) + css}</style>
          <ShellFor plan={plan} />
          {children}
        </div>
      </Window>
    </div>
  );
}

/**
 * The document alone, exactly where the window puts it: every other part of
 * the shell is laid out (so the geometry is the window's) but not painted.
 */
export function Document({ scope, plan, css = "", opacity = 1, region = ".r2-main .r2-writing" }: { scope: string; plan: Plan; css?: string; opacity?: number; /** The document's element (a Canvas: ".r2-main > *"). */ region?: string }) {
  if (opacity <= 0.001) return null;
  return (
    <div
      className="r2"
      data-theme="light"
      data-accent="blue"
      data-surface="theme"
      style={{ position: "absolute", left: 0, top: 0, width: plan.window?.width ?? SHELL.width, height: SHELL.height, overflow: "hidden", borderRadius: 12, background: "none", opacity }}
    >
      <div data-pf={scope}>
        <style>
          {scoped(scope, {
            ".r2-shell, .r2-shell *": "visibility: hidden;",
            [`${region}, ${region} *`]: "visibility: visible;",
            // The column's ground belongs to the environment beneath: the document is ink only.
            ".r2-main .r2-writing": "background: none !important;",
          }) + css}
        </style>
        <ShellFor plan={plan} />
      </div>
    </div>
  );
}

/** A whole authentic window (the source, before anything moves). */
export function Whole({ scope, plan, css = "", children }: { scope: string; plan: Plan; css?: string; children?: ReactNode }) {
  return (
    <Window width={plan.window?.width}>
      <div data-pf={scope}>
        <style>{css}</style>
        <ShellFor plan={plan} />
        {children}
      </div>
    </Window>
  );
}

/** A staggered resolve, in reading order: element i arrives at `at + i × gap`, over `dur`. */
export const resolveAt = (t: number, at: number, i: number, gap: number, dur: number, curve: (p: number) => number) =>
  curve(Math.min(1, Math.max(0, (t - (at + i * gap)) / dur)));
