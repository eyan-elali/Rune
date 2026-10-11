import { Aside, FeatureHead, FeatureSection, Principle, Prose, Visual } from "../FeaturePage";
import { PageDocument, WorkspaceNavigator } from "../visuals/PageVisuals";

// Pages: the closer look the landing page's first workspace card leads to.
// The one idea — a Page is a flexible supporting document around the
// manuscript, never part of it — in three passages: why Pages exist (the
// boundary with Scenes), when a Page is the right amount of structure, and
// how Pages stay inside the project. Two figures, each one job: an open
// Page of thinking about the book (what a Page is), and the navigator with
// the Workspace open beneath the manuscript and the same Page's empty head
// beside it (where Pages live). Characters are the Collections page's
// example, so the two kinds of object never blur here.

export function PagesArticle() {
  return (
    <>
      <FeatureHead
        eyebrow="Pages"
        title="A place for everything that belongs around the book."
        lede="Research, the history of a house, a question you are still answering, the ending you are not sure of yet. A Page is a plain document that lives in the project without being part of the manuscript."
      />

      <FeatureSection labelledBy="fp-pages-why">
        <Prose>
          <h2 id="fp-pages-why">Why Pages exist</h2>
          <p>
            A novel generates more writing than the novel. A question about a character&rsquo;s choice that will never appear on
            the page. A description of a house that three scenes draw on. Reasons you are still weighing. Most of this thinking
            belongs near the manuscript, and none of it belongs in it.
          </p>
          <p>
            Sutura keeps that boundary firm. Prose lives in Scenes, placed in Chapters or kept aside as Unplaced Scenes, and the
            ordered manuscript is made only of those. Everything else that helps you write it has somewhere to go: a Page.
          </p>
        </Prose>
        <Visual
          size="page"
          label="A Page open in Sutura, titled Why the letters wait, in the Workspace. It holds a paragraph asking why Ada waits a day to open the letters, a heading Possible reasons with three bullet points, a heading What the delay buys the book with a paragraph, and a quoted rule for the chapter: the letters are weather, not a plot device."
        >
          <PageDocument />
        </Visual>
        <Prose>
          <p>
            A Page is a document in the plain sense: headings, lists, paragraphs, a line you want to keep. It is set in the
            interface&rsquo;s type rather than the manuscript&rsquo;s, so you always know which kind of writing you are looking at.
          </p>
        </Prose>
      </FeatureSection>

      <FeatureSection labelledBy="fp-pages-when">
        <Prose>
          <h2 id="fp-pages-when">Use a Page when structure would be overkill</h2>
          <p>
            Sutura does not decide what a Page is for. There is no research template, no location form, no fields waiting to be
            filled. A Page called <em>The house</em> and a Page called <em>Ending ideas</em> are the same kind of object; only you
            know that one is a place and the other a worry.
          </p>
          <p>
            That is deliberate. Early in a book, most of what you know is provisional, and a system that asks you to classify a
            thought before you have understood it gets in the way of having it. Write the note. Give it a title. Move on.
          </p>
          <Aside href="/features/collections" cue="Collections">
            When the same kind of information starts to repeat, a Collection may fit better.
          </Aside>
        </Prose>
      </FeatureSection>

      <Principle>Not every thought needs a schema.</Principle>

      <FeatureSection labelledBy="fp-pages-project">
        <Prose>
          <h2 id="fp-pages-project">Pages stay part of the project</h2>
          <p>
            Pages live in the Workspace, beneath the manuscript in the same navigator, so the thinking stays beside the book rather
            than in another app or a document you will not find again. Arrange them however you think: loose, in Folders, or
            nested under one another. The arrangement is navigation only; moving a Page never changes what it is.
          </p>
        </Prose>
        <Visual
          size="navigator"
          label="Sutura's navigator for the project The Lantern Road. Manuscript and Unplaced Scenes are collapsed, with their word counts. Workspace is open: a folder Research holding the Pages The island ferries, Letters, 1950s and Tide tables; a folder Places; the Pages Why the letters wait, selected, and Ending ideas; two Collections, Characters and Threads; and a Canvas, The crossing. Beside the navigator, the Page Why the letters wait is open with nothing written under its title."
        >
          <WorkspaceNavigator />
        </Visual>
        <Prose>
          <p>
            A Page can refer to a Scene, an Entry or another Page, and the thing referred to knows it. The note about the house is
            one step from the scene set in the house, in either direction.
          </p>
          <Aside href="/features/inspector" cue="The Inspector">
            Those references appear beside the writing.
          </Aside>
        </Prose>
      </FeatureSection>
    </>
  );
}
