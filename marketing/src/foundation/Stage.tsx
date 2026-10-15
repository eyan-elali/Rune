import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { buildThemeCss, writingSurface, type AccentId, type ResolvedThemeId, type WritingSurfaceId } from "@/lib/rune2/themes";
import { useFontsReady } from "./fonts";
import "@/app/(rune2)/rune2.css";
import "./stage.css";

// The stage every creative is drawn on: one Sutura root (`.r2`), exactly as
// the app's RuneRoot makes it — the theme registry's own stylesheet
// (buildThemeCss, the one source of every colour) and the writer's
// appearance as data attributes — with the application's own rune2.css
// loaded beneath. Nothing here restyles the product: a creative chooses an
// appearance the way a writer does in Settings.

const THEME_CSS = buildThemeCss();

export type Appearance = {
  theme: ResolvedThemeId;
  surface: WritingSurfaceId;
  accent: AccentId;
};

/** What a new account sees: Light, the theme's own page, Sutura Blue. */
export const DEFAULT_APPEARANCE: Appearance = { theme: "light", surface: "theme", accent: "blue" };

export function Stage({
  appearance = DEFAULT_APPEARANCE,
  background = "var(--r2-page-bg)",
  children,
}: {
  appearance?: Appearance;
  /** The field the creative sits on: a semantic token, never a colour. */
  background?: string;
  children: ReactNode;
}) {
  const ready = useFontsReady();
  const scheme = writingSurface(appearance.surface).scheme;
  return (
    <AbsoluteFill>
      <style>{THEME_CSS}</style>
      <div
        className="r2 mk-stage"
        data-theme={appearance.theme}
        data-accent={appearance.accent}
        data-surface={appearance.surface}
        {...(scheme ? { "data-surface-scheme": scheme } : {})}
        style={{ background, visibility: ready ? "visible" : "hidden" } as CSSProperties}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
}
