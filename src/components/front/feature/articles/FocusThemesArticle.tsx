import { Aside, FeatureHead, FeatureSection, Principle, Prose, Visual } from "../FeaturePage";
import { AppearanceRows, ChromeRecedes } from "../visuals/WritingVisuals";

// Focus and themes: the short closer look the landing's strip leads to
// (FrontMore), treating the two as one feature — the writing environment —
// in two figures and two short passages. Focus is not a switch in Sutura:
// the interface recedes as the writer types and returns when they reach
// for it (rune2.css: "Chrome that recedes while writing"; useWritingChrome).
// Themes are System, Light, Candlelight and Dark; the Writing surface is a
// separate choice for the manuscript's page, and the accent a third
// (themes.ts; RuneSettings.tsx). Nothing here changes the manuscript. The
// value is an environment that recedes, not one that is decorated.

export const FOCUS_LINE = "The interface recedes as you write. Choose your writing surface, and keep only what helps.";

export function FocusThemesArticle() {
  return (
    <>
      <FeatureHead eyebrow="Focus & themes" title="Make room for the page." lede={`${FOCUS_LINE} A desk that feels right, without touching the manuscript itself.`} />

      <FeatureSection labelledBy="fp-ft-focus">
        <Visual
          size="chrome"
          label="The writing column twice. At rest: the tab band with the open scene, the breadcrumb Part One, The Letters, The Thursday Boat, and the scene's prose beneath. While you write: the same column with the tab band and the breadcrumb faded to nothing in place, and only the prose on the page."
        >
          <ChromeRecedes />
        </Visual>
        <Prose>
          <h2 id="fp-ft-focus">The interface steps back</h2>
          <p>
            There is no focus mode to switch on. Start typing and the tabs, the breadcrumb and the actions fade where they stand,
            leaving the page and your words. Nothing moves and nothing collapses, so the line you are writing stays exactly where
            it was. Reach for the interface and it is back a little faster than it left.
          </p>
        </Prose>
      </FeatureSection>

      <Principle>The best writing environment is the one you stop noticing.</Principle>

      <FeatureSection layout="visual-right" labelledBy="fp-ft-desk">
        <Prose>
          <h2 id="fp-ft-desk">A desk that feels right</h2>
          <p>
            Sutura comes in Light, Candlelight and Dark, or follows your system between light and dark. The writing surface is
            a separate choice: the page your manuscript is written and read on, from white to paper, warm, soft gray or charcoal,
            the same in every theme. Your preferences follow your account to every device.
          </p>
          <p>None of it touches the manuscript. The words and the export are the same on every desk.</p>
          <Aside href="/features/reading-mode" cue="Reading Mode">
            When even the desk is too much, read the manuscript on a page with nothing else on it.
          </Aside>
        </Prose>
        <Visual
          size="appearance"
          label="Two rows of Sutura's Settings. Theme: System, Light, Candlelight and Dark, with Light chosen. Writing surface: six small pages, Default, White, Paper, Warm, Soft gray and Charcoal, each in its own colour with the letters Aa, with Paper chosen."
        >
          <AppearanceRows />
        </Visual>
      </FeatureSection>
    </>
  );
}
