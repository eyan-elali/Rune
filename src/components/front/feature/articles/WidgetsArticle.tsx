import { Aside, FeatureHead, FeatureSection, Principle, Prose, Visual } from "../FeaturePage";
import { WidgetsBoard } from "../visuals/WritingVisuals";

// Widgets and goals: the short closer look the landing's strip leads to
// (FrontMore). One idea — progress that reflects the writing, without
// turning the writing into a game — in one figure and two short passages:
// the board itself (Widgets.tsx: Today's words, the Streak, the Daily goal
// with its ring, Writing activity, a Milestone, the Project goal), and what
// it counts; then that the board is the writer's to arrange, and to leave
// closed. No XP, no levels, no achievements, no pressure to keep a streak:
// a record of showing up, there when it helps.

export const WIDGETS_LINE = "Today’s words, a daily goal, a streak, and a quiet record of the days you showed up.";

export function WidgetsArticle() {
  return (
    <>
      <FeatureHead eyebrow="Widgets & goals" title="See the writing add up." lede={`${WIDGETS_LINE} Keep track when it helps. Hide it when it doesn’t.`} />

      <FeatureSection labelledBy="fp-wg-what">
        <Visual
          size="widgets"
          label="The Widgets panel in Sutura, for the project The Lantern Road. On its board: Today, 412 words, this project; Streak, 6 days, best 11 days; Daily goal, a ring part filled, 412 of 500, 88 words to go; Writing activity, a calendar of the last sixteen weeks with writing days shaded in the accent, 63 writing days; Milestone, Draft one, 12 March; Goal, 56,554 of 80,000 words on a thin progress line, 23,446 words to go. At the foot, Edit widgets."
        >
          <WidgetsBoard />
        </Visual>
        <Prose>
          <h2 id="fp-wg-what">What the board counts</h2>
          <p>
            Widgets open from the tab band and close to leave everything as it was. Today&rsquo;s words is what you wrote today,
            in this project: words you typed, not words you pasted in or brought back from history. The Daily goal is one number
            for every project and a ring that fills toward it. The Streak is days in a row with writing. Writing activity is the
            last sixteen weeks, a cell a day, shaded by how much was written.
          </p>
          <p>
            None of it scores you. There are no levels, no badges, and nothing is marked missed. A quiet day is a quiet cell.
          </p>
        </Prose>
      </FeatureSection>

      <Principle>Progress should reflect the writing, not manufacture it.</Principle>

      <FeatureSection labelledBy="fp-wg-yours">
        <Prose>
          <h2 id="fp-wg-yours">A board that is yours</h2>
          <p>
            The board is the writer&rsquo;s. Add the widgets you want from a short catalog, drag them into the order you read
            them in, make one wide, remove the ones you never look at. Or leave the panel closed, and write.
          </p>
          <Aside href="/features/milestones" cue="Milestones">
            The Milestone widget shows the latest named picture of the manuscript, and what has been written since.
          </Aside>
        </Prose>
      </FeatureSection>
    </>
  );
}
