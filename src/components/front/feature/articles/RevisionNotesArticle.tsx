import { Aside, FeatureHead, FeatureSection, Principle, Prose, Visual } from "../FeaturePage";
import { RevisionNotesBesideWriting, RevisionNotesLater } from "../visuals/RevisionNotesVisuals";

// Revision Notes: the closer look the landing page's Inspector section
// leads to with its second link. The idea — revision creates another layer
// of thinking, and that thinking should not have to live inside the prose
// — in four passages: why Revision Notes exist, the manuscript kept clean,
// the notes kept close to the scene they are about, and their temporary
// nature. Two figures, each one job: the shell with the scene open and the
// Revision Notes sheet beside it, every note whole (the one picture of
// revision thinking beside the writing, which this page owns); and the
// sheet alone later in the revision, most of it resolved. By the end the
// line between this and the rest of Sutura should be plain: Pages hold the
// book's durable thinking, Scene properties its structured facts, the
// Inspector its context, Revision Notes the passing thoughts of a draft
// being changed.

export const REVISION_NOTES_LINE =
  "The questions, reminders and problems of a revision, kept beside the manuscript and never written into it.";

export function RevisionNotesArticle() {
  return (
    <>
      <FeatureHead
        eyebrow="Revision Notes"
        title="Revise the book without writing over it."
        lede={`${REVISION_NOTES_LINE} On a scene, a chapter or the whole book, and cleared when the draft has moved on.`}
      />

      <FeatureSection labelledBy="fp-rn-why">
        <Visual
          size="notes"
          label="Sutura with the scene The Thursday Boat open: the chapter's name, the scene's title and its prose in the writing column. Beside it, running to the foot of the window, the Revision Notes panel for the scene: its place, Manuscript, Part One, The Letters, The Thursday Boat; a line to write a new note; then five open notes: Seed Tomas's warning one scene earlier. Ada already knows about the roof by High Water, fix the continuity here. Cut the repeated description of the house, written about the passage By the time she reached the house the wind had turned. Hold the letter reveal until after Tomas arrives. This exchange needs more pressure."
        >
          <RevisionNotesBesideWriting />
        </Visual>
        <Prose>
          <h2 id="fp-rn-why">Why Revision Notes exist</h2>
          <p>
            Revising a book makes a second kind of writing: the questions, reminders and small alarms that come up while you read
            what you have. Tighten this exchange. Seed this earlier. Does Ada know this yet? They matter now, and none of them
            belong in the manuscript. Revision Notes are where that thinking goes, so the prose does not have to carry it.
          </p>
          <p>
            A note is written on a scene, a chapter, a part or the whole book, and the panel shows the notes for whatever you have
            open, shaped like the manuscript itself.
          </p>
        </Prose>
      </FeatureSection>

      <FeatureSection labelledBy="fp-rn-clean">
        <Prose>
          <h2 id="fp-rn-clean">Keep the manuscript clean</h2>
          <p>
            Without a place for them, revision thoughts end up in the draft: a bracketed TODO, a line in capitals, a reminder left
            at the top of a scene to be deleted later. Each one is a small debt, and each one shows up in the word count, the
            export and the next read-through. With Revision Notes, the manuscript holds only the book.
          </p>
          <p>
            Reading Mode can take a note about a passage as you read. The note keeps the passage it was written about, quoted, and
            leads back to it when you return to work.
          </p>
        </Prose>
      </FeatureSection>

      <Principle>Think about the draft without writing on it.</Principle>

      <FeatureSection layout="visual-left" labelledBy="fp-rn-later">
        <Visual
          size="notes-sheet"
          label="The Revision Notes panel alone, for the scene The Thursday Boat, later in the revision. Two notes are resolved and set in a quieter ink: Seed Tomas's warning one scene earlier, and Cut the repeated description of the house. One is still open: Hold the letter reveal until after Tomas arrives. Beneath them, Hide resolved."
        >
          <RevisionNotesLater />
        </Visual>
        <Prose>
          <h2 id="fp-rn-later">Temporary by nature</h2>
          <p>
            A revision note is made to be finished with. Mark it resolved and it steps back; hide the resolved and the panel shows
            only what is still open; delete a note and nothing about the manuscript changes. The draft moves on and the notes move
            with it, or go.
          </p>
          <p>
            This is what sets them apart. Thinking the book keeps, a character, a place, a question of research, belongs in a Page.
            Facts about a scene, its point of view or status, belong in its properties. Revision Notes are for the thinking that is
            only true of this draft.
          </p>
          <Aside href="/features/pages" cue="Pages">
            Thinking the book keeps belongs in a Page.
          </Aside>
        </Prose>
      </FeatureSection>

      <FeatureSection labelledBy="fp-rn-close">
        <Prose>
          <h2 id="fp-rn-close">Close to the scene, never in it</h2>
          <p>
            Revision Notes open beside the writing, in the same region the Inspector uses, so there is never more than one sheet
            beside the manuscript. The Inspector describes a scene: its place, its properties, its history, its connections.
            Revision Notes are what you mean to do about it. Both stay beside the writing, and both close when you are done.
          </p>
          <Aside href="/features/inspector" cue="The Inspector">
            The scene&rsquo;s context and properties are the Inspector&rsquo;s.
          </Aside>
        </Prose>
      </FeatureSection>
    </>
  );
}
