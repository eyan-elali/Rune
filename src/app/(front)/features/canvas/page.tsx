import type { Metadata } from "next";
import { Aside, FeatureHead, FeaturePage, FeatureSection, Principle, Prose, Visual } from "@/components/front/feature/FeaturePage";
import { CanvasPlane } from "@/components/front/feature/visuals/CanvasVisual";
import "../../front.css";
import "../../feature.css";

// Canvas: the closer look the landing page's wide workspace card leads to,
// read as a Page inside Sutura, and the most visual of the feature pages.
// The idea — spatial thinking, for when lists and pages are not enough —
// in four passages: when linear notes stop being enough, arranging things
// in space, the Canvas as part of the same project, and a surface used
// only when the book asks. One figure, the largest on any feature page,
// first: the plane as wide as the content column allows, with the room a
// canvas wants, and the writing under it.

export const metadata: Metadata = {
  title: "Canvas",
  description:
    "A quiet surface inside your project for the parts of a book that will not sit in a list: relationships, plot threads, scene connections and research clusters, arranged in space with the book's own pieces.",
  alternates: { canonical: "/features/canvas" },
};

export default function CanvasFeature() {
  return (
    <FeaturePage current="canvas">
      <FeatureHead
        eyebrow="Canvas"
        title="Sometimes the shape of the idea matters."
        lede="For the parts of a book that will not sit in a list: who is tied to whom, which scene answers which, where a cluster of research belongs. A quiet surface for arranging things in space."
      />

      <FeatureSection labelledBy="fp-cv-when">
        <Visual
          frame="material"
          size="canvas"
          width="bleed"
          label="A Canvas in Sutura titled The crossing. On a faint dot grid, a tinted Section named The Letters holds three scene cards: The Ferry; The Thursday Boat, selected, with its opening line and word count; and High Water. Across the plane: Entry cards for Ada Marsh and Tomas Reyes from the Characters Collection; Page cards for The house and Why the letters wait; a note asking why she waits a whole day to open the letters; and at the lower right a Section named Research holding the Pages The island ferries and Letters, 1950s. Fine lines connect The Thursday Boat to Ada Marsh, labelled point of view, and to The house; High Water to The house; The Ferry to Tomas Reyes, labelled point of view; Ada Marsh to Why the letters wait; and that page to the note and to Letters, 1950s. Most of the plane is empty."
        >
          <CanvasPlane />
        </Visual>
        <Prose>
          <h2 id="fp-cv-when">When linear notes stop being enough</h2>
          <p>
            Most thinking about a novel is linear enough for a Page. Some of it is not. The relationships among a cast, the way
            three plot threads cross in the middle of the book, a question with four possible answers and a note under each: these
            have a shape, and the shape is part of what you are working out.
          </p>
          <p>
            A Canvas is an open plane inside the project. Put the book&rsquo;s own pieces on it, a Scene, a Page, an Entry, a
            Chapter, alongside notes and images, and draw the lines between them. The pieces are the real objects, not copies; the
            card for a scene shows the scene&rsquo;s opening and its length.
          </p>
        </Prose>
      </FeatureSection>

      <FeatureSection labelledBy="fp-cv-arrange">
        <Prose>
          <h2 id="fp-cv-arrange">Arrange ideas spatially</h2>
          <p>
            Cards go where you put them. Gather some into a Section, a quietly tinted region with a title, and move them as one.
            Connect two cards with a line, and give the line a word if it needs one. Zoom out and the small text falls away so the
            board stays readable; zoom in and it returns.
          </p>
          <p>There is no diagram grammar to learn. No node types, no required layout, no arrows unless you want them.</p>
        </Prose>
      </FeatureSection>

      <Principle>Some ideas are easier to see than to list.</Principle>

      <FeatureSection labelledBy="fp-cv-project">
        <Prose>
          <h2 id="fp-cv-project">Keep the Canvas part of the same project</h2>
          <p>
            A Canvas lives in the Workspace, beside the Pages and Collections, and the things on it stay the same things. Open the
            card for a scene and you are in the scene. Rename a character in their Entry and the card on the Canvas changes with
            it.
          </p>
          <p>
            Arranging the Canvas never touches the manuscript. Moving a scene&rsquo;s card across the plane does not move the scene
            in the book; it only moves the card.
          </p>
        </Prose>
      </FeatureSection>

      <FeatureSection labelledBy="fp-cv-only">
        <Prose>
          <h2 id="fp-cv-only">Use it only when the book asks for it</h2>
          <p>
            Many novels never need a Canvas, and nothing in Sutura suggests you should make one. It is there for the moment a
            problem turns out to be spatial, and it is as easy to leave as to open.
          </p>
          <Aside href="/features/pages" cue="Pages">
            For thinking that is linear after all, a Page is enough.
          </Aside>
        </Prose>
      </FeatureSection>
    </FeaturePage>
  );
}
