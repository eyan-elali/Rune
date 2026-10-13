import { Aside, FeatureHead, FeatureSection, Principle, Prose, Visual } from "../FeaturePage";
import { MilestonesSheet, MilestoneWidget } from "../visuals/WritingVisuals";

// Milestones: the short closer look the landing's strip leads to
// (FrontMore). A Milestone is a named picture of the whole manuscript
// (ManuscriptMilestones.tsx, migration 036): "Draft one", "Sent to Nell".
// Saving one keeps the manuscript as it is now — its parts, chapters,
// scenes and prose — and changes nothing; opening one shows that
// manuscript, read-only, to return to; and the Milestone widget says what
// has been written since. Two figures, one job each: the Manuscript's
// Inspector on its Milestones, beside the first passage, and the widget's
// line under the second. Writer-facing: a picture to return to, never a
// branch, and not version control.

export const MILESTONES_LINE = "Mark a meaningful point in the manuscript and see how the work has changed since.";

export function MilestonesArticle() {
  return (
    <>
      <FeatureHead eyebrow="Milestones" title="Remember where the draft has been." lede={`${MILESTONES_LINE} A picture of the whole manuscript, named by you, kept as it was.`} />

      <FeatureSection layout="visual-left" labelledBy="fp-ml-mark">
        <Visual
          size="milestones"
          label="The Inspector for the manuscript The Lantern Road: 14 chapters, 56,554 words. Under Milestones, with a Save a milestone action and the caption Named pictures of the whole manuscript, kept as it was: Before the ending changed, Tuesday at 17:52, 55,102 words; Sent to Nell, 2 June, 51,870 words; Draft one, 12 March, 48,214 words."
        >
          <MilestonesSheet />
        </Visual>
        <Prose>
          <h2 id="fp-ml-mark">Mark a point worth keeping</h2>
          <p>
            Some moments in a draft deserve a name: the day the first draft is done, the version that went to a reader, the
            evening before you changed the ending. From the manuscript&rsquo;s Inspector, save a Milestone and name it. Sutura
            keeps the whole manuscript as it stands in that moment, every part, chapter and scene, and changes nothing in it.
          </p>
          <p>
            Open a Milestone later and you can read that manuscript as it was, with its own contents to go straight to a part of
            it. It cannot be edited, and the live manuscript does not move. A Milestone is a picture to return to, not a branch to
            manage.
          </p>
        </Prose>
      </FeatureSection>

      <Principle>A draft should be able to look back without going back.</Principle>

      <FeatureSection labelledBy="fp-ml-since">
        <Prose>
          <h2 id="fp-ml-since">See what has changed since</h2>
          <p>
            Each Milestone remembers how many words the manuscript had. Put the Milestone widget on your board and it names the
            latest one, when you saved it, and how far the manuscript has come since.
          </p>
        </Prose>
        <Visual
          size="milestone-widget"
          label="The Milestone widget, wide: Milestone, Draft one, 12 March, 48,214 words, 8,340 since."
        >
          <MilestoneWidget />
        </Visual>
        <Prose>
          <Aside href="/features/inspector" cue="The Inspector">
            A single scene&rsquo;s earlier versions live in its own History, in the Inspector.
          </Aside>
        </Prose>
      </FeatureSection>
    </>
  );
}
