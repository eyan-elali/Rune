import { Aside, FeatureHead, FeatureSection, Principle, Prose, Visual } from "../FeaturePage";
import { ReadingPeek } from "../visuals/WritingVisuals";

// Reading Mode: the short closer look the landing's strip leads to
// (FrontMore). Particularly visual, and the copy minimal: one figure of the
// transition — the workspace dimmed under the scrim, the manuscript on a
// clean reading surface over it (ReadingMode.tsx: the Reading Peek; Full
// Reading Mode takes the whole window) — and two short passages: the
// perspective it gives, and that a thought on the way can be left in the
// margin as a Revision Note without leaving the reading.

export const READING_LINE = "Step away from the workspace and meet the manuscript without everything around it.";

export function ReadingModeArticle() {
  return (
    <>
      <FeatureHead eyebrow="Reading Mode" title="Read it like a reader." lede={`${READING_LINE} A chapter, a part, or the whole book, on a page with nothing else on it.`} />

      <FeatureSection labelledBy="fp-rd-read">
        <Visual
          size="reading"
          label="Sutura with the chapter The Letters selected in the navigator and open in the workspace. Over it, dimmed, the Reading Peek: a clean reading surface with a bar that says Reading, Part One, The Letters, with Add comment, a full-screen action and a close. On the page: Part One, the chapter title The Letters, the scene's prose in the manuscript serif, a scene break, and the next scene's opening."
        >
          <ReadingPeek />
        </Visual>
        <Prose>
          <h2 id="fp-rd-read">The book, without the desk</h2>
          <p>
            Choose Read on a scene, a chapter, a part or the manuscript, and the workspace steps back. What is left is the
            writing, set as a book sets it: the part, the chapter, the scenes one after another with a break between them. No
            tabs, no panels, no cursor.
          </p>
          <p>
            Read it over the workspace, or take the whole window. Either way you are reading what a reader will read, in the
            order they will read it.
          </p>
        </Prose>
      </FeatureSection>

      <Principle>The draft reads differently when you are not holding the pen.</Principle>

      <FeatureSection labelledBy="fp-rd-notes">
        <Prose>
          <h2 id="fp-rd-notes">A thought on the way</h2>
          <p>
            Reading is where you notice things. Select a passage and add a comment, and it becomes a Revision Note on that scene,
            anchored to the words, waiting for you when you come back to write.
          </p>
          <Aside href="/features/revision-notes" cue="Revision Notes">
            The thinking of a draft being revised, kept beside the writing.
          </Aside>
        </Prose>
      </FeatureSection>
    </>
  );
}
