import { Aside, FeatureHead, FeatureSection, Principle, Prose, Visual } from "../FeaturePage";
import { CollectionBoard, CollectionTable, CollectionTimeline, EntryDocument } from "../visuals/CollectionVisuals";

// Collections: the closer look the landing page's second workspace card
// leads to. The idea — repeated things that benefit from one shape, held
// without turning the book into a database — in four passages: when a set
// deserves structure, an Entry as a document with properties, Views as ways
// of reading the same Entries (the Board, then the Timeline), and structure
// as a choice. Four figures of one cast, each one job: the Table (what
// repeated structure looks like), one Entry (structured, and still a
// document), the Board (the same objects, another view), the Timeline (the
// same objects through time) — all at the Page's width, every card and
// every lane whole.

export function CollectionsArticle() {
  return (
    <>
      <FeatureHead
        eyebrow="Collections"
        title="Structure the things you keep returning to."
        lede="Characters, places, factions, sources, clues. When one kind of thing appears again and again, a Collection gives each one the same shape, without turning the book into a database."
      />

      <FeatureSection labelledBy="fp-col-when">
        <Visual
          size="table"
          label="A Collection in Sutura titled Characters, holding 10 entries, 5 properties and 3 views. Its Table view, All characters, lists Ada Marsh, Tomas Reyes, Mrs. Hale, Ines Marsh, Daniel Croft, Agnes Doyle, Peter Marsh, Father Lyle, Nell Carrow and Dr. Osei, each with a Role, an Affiliation linked to a place, the scene they first appear in, and a Status of Drafted, Sketched or Revised."
        >
          <CollectionTable />
        </Visual>
        <Prose>
          <h2 id="fp-col-when">When repeated information deserves structure</h2>
          <p>
            Some of what surrounds a novel comes in sets. Twelve characters. Six locations. A list of revision issues that keeps
            growing. Each member of a set tends to want the same few facts recorded, and a loose stack of Pages stops being enough
            once you want to see those facts side by side.
          </p>
          <p>
            A Collection is a set of Entries that share properties. You name the Collection; you name the properties; you decide
            what each one means. Sutura does not know that <em>Characters</em> is different from <em>Clues</em>, and does not need
            to.
          </p>
        </Prose>
      </FeatureSection>

      <FeatureSection labelledBy="fp-col-props">
        <Prose>
          <h2 id="fp-col-props">Properties without turning the book into a database</h2>
          <p>
            An Entry is not a row. Open one and it is a document: its properties stand in a compact block under the title, parted
            from the body by a single line, and beneath them is room to write as much as the subject needs. Role, Affiliation and
            Status for a character, then the pages of notes that <em>are</em> the character.
          </p>
        </Prose>
        <Visual
          size="entry"
          label="One Entry of the Characters Collection, Ada Marsh, open as a document. Under the title, a block of five properties: Role, Protagonist; Affiliation, The house, as a link; First appears, 1.1 Arrival, as a link; Came to the island, 1983; Status, Drafted. Beneath a hairline, two paragraphs of notes."
        >
          <EntryDocument />
        </Visual>
        <Prose>
          <p>
            Properties are typed, and one type is a relationship: it points at another object in the project. The
            character&rsquo;s affiliation is the place itself, not its name typed again, and the scene she first appears in is the
            scene. Rename the place and every link holds.
          </p>
          <p>None of it is required. An Entry with nothing filled in is still an Entry.</p>
        </Prose>
      </FeatureSection>

      <FeatureSection labelledBy="fp-col-views">
        <Prose>
          <h2 id="fp-col-views">Different views, same underlying objects</h2>
          <p>
            A Collection can be read as a List, a Table, a Board or a Timeline, and it may keep several saved Views at once: all
            characters as a table, the cast by status as a board.
          </p>
        </Prose>
        <Visual
          size="board"
          label="The same Characters Collection read as a Board, By status: three lanes, Sketched with four cards, Drafted with four, Revised with two. Each card shows a character's name and, beneath it, their role and affiliation."
        >
          <CollectionBoard />
        </Visual>
        <Prose>
          <p>
            A View never duplicates anything. Move a card between the lanes of a Board and you have changed that Entry&rsquo;s
            status; open it from the Table and it is the same Entry. There is one Ada Marsh, however many ways you look at her.
          </p>
        </Prose>
        <Visual
          size="timeline"
          label="The same Characters Collection read as a Timeline named Arrivals, along the date property Came to the island, from 1960 to 2005, in lanes by Affiliation. The house: Ines Marsh, 1961, and Ada Marsh, 1983. The village: Mrs. Hale, 1968; Agnes Doyle, 1972; Father Lyle, 1979; Dr. Osei, 2001. The harbour: Tomas Reyes, 1989, and Nell Carrow, 1996. The mainland: Peter Marsh, 1985, and Daniel Croft, 2004. Each is a small mark on the axis with the name and role beside it."
        >
          <CollectionTimeline />
        </Visual>
        <Prose>
          <p>
            Give the Entries a date and the same cast can be read along it: who came to the island when, lane by lane. Nothing was
            entered twice to make this View.
          </p>
        </Prose>
      </FeatureSection>

      <FeatureSection labelledBy="fp-col-optional">
        <Prose>
          <h2 id="fp-col-optional">Structure remains optional</h2>
          <p>
            Nothing in Sutura asks you to build a Collection. Many books never need one, and a Page is the right home for a
            character until it is not. When a set does form, a Collection should make it easier to see, not heavier to carry. Add a
            property when you want the answer across every Entry, and not before.
          </p>
          <Aside href="/features/scene-properties" cue="Scene properties">
            Scenes can carry their own writer-defined properties too.
          </Aside>
        </Prose>
      </FeatureSection>

      <Principle>Structure should clarify the work, not become the work.</Principle>
    </>
  );
}
