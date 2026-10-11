import type { Metadata } from "next";
import { Aside, FeatureHero, FeaturePage, FeatureSection, Principle, Prose, Visual } from "@/components/front/feature/FeaturePage";
import { CollectionBoard, CollectionTable, EntryDocument } from "@/components/front/feature/visuals/CollectionVisuals";
import "../../front.css";
import "../../feature.css";

// Collections: the closer look the landing page's second workspace card
// leads to. The idea — repeated things that benefit from one shape, held
// without turning the book into a database — in four movements: when a
// set deserves structure, an Entry as a document with properties, Views as
// ways of reading the same Entries, and structure as a choice. Three
// drawings: the Collection as a Table, one Entry, and the Board.

export const metadata: Metadata = {
  title: "Collections",
  description:
    "Collections give the things you keep returning to — characters, places, sources, clues — a shared shape: typed properties on each entry, room to write, and several views of the same objects.",
  alternates: { canonical: "/features/collections" },
};

export default function CollectionsFeature() {
  return (
    <FeaturePage kind="feature">
      <FeatureHero
        eyebrow="Collections"
        title="Structure the things you keep returning to."
        lede="Characters, places, factions, sources, clues. When one kind of thing appears again and again, a Collection gives each one the same shape, without turning the book into a database."
      />

      <FeatureSection layout="visual-right" labelledBy="fp-col-when">
        <Prose lead>
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
        <Visual
          size="table"
          label="A Collection in Sutura titled Characters, holding 5 entries, 3 properties and 2 views. Its Table view, All characters, lists Ada Marsh, Tomas Reyes, Mrs. Hale, Ines Marsh and Daniel Croft with their Role, their Affiliation as a link to a place, and a Status of Drafted, Sketched or Revised."
        >
          <CollectionTable />
        </Visual>
      </FeatureSection>

      <FeatureSection layout="visual-left" labelledBy="fp-col-props">
        <Prose>
          <h2 id="fp-col-props">Properties without turning the book into a database</h2>
          <p>
            An Entry is not a row. Open one and it is a document: its properties stand in a compact block under the title, parted
            from the body by a single line, and beneath them is room to write as much as the subject needs. Role, Affiliation and
            Status for a character, then the pages of notes that <em>are</em> the character.
          </p>
          <p>
            Properties are typed. Text, number, select, multi-select, status, date, checkbox, and relationship, which points at
            another object in the project: the character&rsquo;s affiliation is the place itself, not its name typed again. Rename
            the place and every link holds.
          </p>
          <p>None of it is required. An Entry with nothing filled in is still an Entry.</p>
        </Prose>
        <Visual
          size="entry"
          label="One Entry of the Characters Collection, Ada Marsh, open as a document. Under the title, a block of three properties: Role, Protagonist; Affiliation, The house, as a link; Status, Drafted. Beneath a hairline, two paragraphs of notes."
        >
          <EntryDocument />
        </Visual>
      </FeatureSection>

      <FeatureSection layout="wide" labelledBy="fp-col-views">
        <Visual
          size="board"
          label="The same Characters Collection read as a Board, By status: three lanes, Sketched with two cards, Drafted with two, Revised with one. Each card shows a character's name and, beneath it, their role and affiliation."
        >
          <CollectionBoard />
        </Visual>
        <Prose>
          <h2 id="fp-col-views">Different views, same underlying objects</h2>
          <p>
            A Collection can be read as a List, a Table, a Board or a Timeline, and it may keep several saved Views at once: all
            characters as a table, the cast by status as a board. Each View has its own filters, sort, grouping and visible
            properties.
          </p>
          <p>
            A View never duplicates anything. Move a card between the lanes of a Board and you have changed that Entry&rsquo;s
            status; open it from the Table and it is the same Entry. There is one Ada Marsh, however many ways you look at her.
          </p>
        </Prose>
      </FeatureSection>

      <FeatureSection layout="column" labelledBy="fp-col-optional">
        <Prose>
          <h2 id="fp-col-optional">Structure remains optional</h2>
          <p>
            Nothing in Sutura asks you to build a Collection. Many books never need one, and a Page is the right home for a
            character until it is not. When a set does form, a Collection should make it easier to see, not heavier to carry. Add a
            property when you find yourself wanting the answer across every Entry. Leave it out when you do not.
          </p>
          <Aside href="/features/scene-properties" cue="Scene properties">
            Scenes can carry their own writer-defined properties too.
          </Aside>
        </Prose>
      </FeatureSection>

      <Principle>Structure should clarify the work, not become the work.</Principle>
    </FeaturePage>
  );
}
