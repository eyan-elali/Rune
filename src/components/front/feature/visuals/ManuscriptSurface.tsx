import { PROSE, SceneProse } from "./shell";

// The authorship page's one picture: the writing surface with nothing on it
// but the writing — the chapter's eyebrow, the scene's title, the prose in
// the manuscript's type, as the editor shows it while the writer writes
// (rune2.css: "Writing surface"; the chrome recedes). No panel, no
// suggestion, no second voice on the page.

export function ManuscriptSurface() {
  return (
    <div className="r2-fp-surface">
      <SceneProse paragraphs={PROSE} />
    </div>
  );
}
