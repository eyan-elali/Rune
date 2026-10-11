import { Check, X } from "lucide-react";
import { ICON, ICON_SM_BOLD } from "@/components/rune2/icons";
import { CHAPTER, ContextBar, GROUP, PROSE, SCENE, SceneProse, Tabs } from "./shell";

// The Revision Notes page's drawings: the real panel (Rune2Panel.tsx, view
// "notes"; RevisionNotes.tsx; rune2.css: ".r2-panel", ".r2-rnotes"), open
// as the inset side sheet beside the writing — the same region the
// Inspector takes, which is the point: one sheet beside the writing, and
// this is the other thing it can hold. What the real panel shows for a
// Scene: the trail of levels above it (Manuscript / Part / Chapter /
// Scene); the composer, at rest one quiet line; then the notes, each with
// its circle (open, or resolved), and under one of them the passage it was
// written about, quoted. The notes are the kind a writer leaves for
// themself while revising, and nothing else: no properties, no history, no
// connections — those are the Inspector's. The sheet alone, further into
// a revision, is the second figure: some notes resolved and greyed, one
// still open, and the way to see or hide what is done.

type Note = {
  body: string;
  /** The passage the note was written about, from Reading Mode. */
  excerpt?: string;
  resolved?: boolean;
};

/** The scene's open notes, mid-revision. */
const OPEN_NOTES: ReadonlyArray<Note> = [
  { body: "Seed Tomas’s warning one scene earlier." },
  { body: "Ada already knows about the roof by High Water. Fix the continuity here." },
  { body: "Cut the repeated description of the house.", excerpt: "By the time she reached the house the wind had turned." },
  { body: "Hold the letter reveal until after Tomas arrives." },
  { body: "This exchange needs more pressure." },
];

/** The same scene, later: most of it done. */
const LATER_NOTES: ReadonlyArray<Note> = [
  { body: "Seed Tomas’s warning one scene earlier.", resolved: true },
  { body: "Cut the repeated description of the house.", resolved: true },
  { body: "Hold the letter reveal until after Tomas arrives." },
];

function Trail() {
  const steps = ["Manuscript", GROUP, CHAPTER, SCENE];
  return (
    <nav className="r2-rnotes-trail">
      {steps.map((step, i) => (
        <span key={step} className="r2-rnotes-trail-step">
          {i > 0 && <span className="r2-rnotes-trail-sep">/</span>}
          <span className="r2-rnotes-trail-link" aria-current={i === steps.length - 1 ? "location" : undefined}>
            {step}
          </span>
        </span>
      ))}
    </nav>
  );
}

/** The composer at rest: one line to write on, nothing drawn around it. */
function Composer() {
  return (
    <div className="r2-composer r2-rnotes-composer">
      <span className="r2-composer-input r2-fp-composer-rest">Note for this scene…</span>
    </div>
  );
}

function NoteRow({ note }: { note: Note }) {
  return (
    <li className="r2-rnote" data-resolved={note.resolved || undefined} data-anchored={note.excerpt ? "" : undefined}>
      <span className="r2-rnote-check" aria-checked={note.resolved ? "true" : "false"}>
        {note.resolved && <Check {...ICON_SM_BOLD} />}
      </span>
      <div className="r2-rnote-main">
        <span className="r2-rnote-body">{note.body}</span>
        {note.excerpt && (
          <div className="r2-rnote-anchor">
            <span className="r2-rnote-excerpt">“{note.excerpt}”</span>
          </div>
        )}
      </div>
    </li>
  );
}

function Panel({ notes, resolvedShown }: { notes: ReadonlyArray<Note>; resolvedShown?: boolean }) {
  const resolved = notes.filter((n) => n.resolved).length;
  return (
    <aside className="r2-panel" data-open="">
      <div className="r2-panel-inner">
        <div className="r2-panel-head">
          <h2>Revision Notes</h2>
          <span className="r2-icon-button">
            <X {...ICON} />
          </span>
        </div>
        <div className="r2-panel-body">
          <div className="r2-rnotes">
            <Trail />
            <Composer />
            <div className="r2-rnotes-body">
              <ul className="r2-rnotes-list">
                {notes.map((n) => (
                  <NoteRow key={n.body} note={n} />
                ))}
              </ul>
            </div>
            {resolved > 0 && (
              <p className="r2-rnotes-resolved-toggle">
                <span className="r2-panel-link">
                  {resolvedShown ? "Hide resolved" : `Show ${resolved === 1 ? "1 resolved note" : `${resolved} resolved notes`}`}
                </span>
              </p>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

/** The shell with the scene open and Revision Notes beside it: the page's main picture. */
export function RevisionNotesBesideWriting() {
  return (
    <div className="r2-fp-shell r2-fp-shell--split r2-fp-shell--notes">
      <Tabs context={CHAPTER} label={SCENE} />
      <ContextBar crumbs={["Manuscript", GROUP, CHAPTER, SCENE]} notesOpen />
      <div className="r2-fp-body">
        <div className="r2-lp-shot-content">
          <SceneProse paragraphs={PROSE.slice(0, 2)} />
        </div>
        <Panel notes={OPEN_NOTES} />
      </div>
    </div>
  );
}

/** The sheet alone, later in the revision: most notes resolved, one still open. */
export function RevisionNotesLater() {
  return (
    <div className="r2-fp-sheet">
      <Panel notes={LATER_NOTES} resolvedShown />
    </div>
  );
}
