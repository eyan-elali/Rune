# Sutura product film — Motion language exploration

**Status:** motion R&D complete (§9). Nothing here is the film. The first pass built three studies (`ProductFilmStudyA`, `B`, `C`); the final pass revised them and added the Board (`ProductFilmStudyAV2`, `BV2`, `CV2`, `D`). **§9 supersedes §1–8 wherever they disagree.** The 14 storyboard keyframes (`PRODUCT_FILM_STORYBOARD.md`) are the map of **product states**. This document proposes how the film moves between them.

**Read with:** `PRODUCT_FILM_STORYBOARD.md` (beats, states, demo content), `marketing/src/creatives/product-film/` (keyframes and studies), and `marketing/src/data/salt-house.ts` (the invented novel).

---

## 0. The idea underneath everything

Sutura's architecture already contains the motion language. Section 21 of the architecture document reads:

> A Character Entry called Nerai exists once. Displayed in Table, displayed on Board, referenced from Scene, referenced from Page, represented on Canvas. **These are representations of one object, not copies.**

This film is a chain of representations of a few objects:

| Object | Its representations in the film |
|---|---|
| *"Seventeen was empty."* | a line of prose → an anchored Revision Note excerpt → a Canvas Scene card's preview → a line of prose again |
| *The Key Cabinet* | a navigator row → a Scene title → a tab → a backlink on the ledger → a Canvas Scene card |
| *1998 Guest Ledger* | a Research relationship in the Inspector → a Page → a navigator row → a Canvas Page card |
| *Elias Vale* | a Cast value → an inline reference → a Board card → an Entry → a Canvas card |

So the core rule of the brief (*if two states share a semantic object, persist it*) shows a true thing about the product. It isn't a stylistic choice laid on top. When an object keeps its identity across a transition, the film shows something real: **one object, many representations, all connected**. That is "the manuscript participates in the Workspace without becoming the Workspace" (§1), made visible.

Two constraints in the product model shape the motion as much as the opportunity does:

1. **The manuscript never gives anything up.** A Revision Note's excerpt is a *quotation*: the sentence stays in the Scene. A Canvas Scene card is a *representation*: the Scene stays in the manuscript. The film must never show prose *leaving* the manuscript. Only its representations travel, and the source stays inked. (Manuscript integrity, as visual grammar.)
2. **Nothing is ever written for the writer.** The ledger's *23:40, T.V.* must never fly into the prose. The writer types it. (See rejected transformation R1.)

---

## 1. Three motion language directions

### Direction I — **Identity** ("one object, many representations")

**Core philosophy.** The camera follows *objects*, not *places*. Every transition hands the viewer's eye from one representation of an object to the next, and the destination interface assembles around the object as it arrives. The object is the protagonist of each shot. The UI is the room it walks into.

**Camera.** A *tracked* camera. During a carry, the camera's target is the carried object (its centre and a framing scale), lagging it slightly, the way a head follows the eye. Between carries it's still, or makes a single slow move. The one big camera move (the pull-back to the full window) is anchored on an object, so the move has a fixed point.

**Objects.** One carrier at a time, never a swarm. A carrier is a film-only surrogate: an exact replica of the source text with the source's computed type, and a replica of the destination text with the destination's computed type, laid over one shared box. The box interpolates position linearly along an arc and size in log space. At the endpoints the replica is pixel-identical to the real element, so the swap to the authentic state is invisible.

**Transition grammar.**
- *lift*: the carrier separates (the source either stays, for a quotation or representation, or yields its slot).
- *carry*: an arc between the two representations, with the camera following.
- *dock*: arrival, a swap to the authentic element, and a 3–5 frame settle.
- *resolve*: the destination's surroundings finish around it.

A spatial **unfold** (a clip mask growing from the carrier's bounds) changes the world under the carrier, instead of a crossfade.

**Typography.** Text is optically stable. Its scale changes by transform, never by animating `font-size`, so glyphs never re-hint mid-move. Where the face changes (Inter 13 → Inter 23 semibold), two replicas cross-dissolve inside the fastest third of the move, where the eye can't resolve the weight. Where the face is shared (EB Garamond prose → excerpt → Canvas preview), there's no swap at all.

**Blur and masks.** Subframe-sampled motion blur on the carrier and camera only above a speed threshold. Masks are the unfold: rounded-rect insets in world space that grow from an object's bounds to a region's bounds.

**Authentic UI.** Every endpoint is a real state, drawn with the app's markup. Everything between endpoints is labelled film-only.

**The dark stage.** It appears when the camera has pulled back far enough for the window to become an object itself. It means "you're seeing the whole thing now".

**Wide vs close.** Close while carrying (meaning). Wide when an object docks somewhere whose context matters (architecture).

**Strengths.** Explains the product model without words. Gives every transition a reason. Honest by construction: it never invents a destination.
**Risks.** Repetition: the same lift-carry-dock three times feels like a template. Each carry must differ in distance, scale ratio and camera behaviour. A carrier too large or too slow reads as "magic UI".
**Fit.** Highest. This is Sutura's architecture expressed as motion.

### Direction II — **Rack Focus** ("attention as depth of field")

**Core philosophy.** Sutura protects attention. The film shows attention as *focus*. The product sits on a few orthographic planes (manuscript in front, workspace behind, the stage beyond). Transitions are focus pulls: the plane the writer is thinking about sharpens, and what they've set aside softens. Nothing rotates. Depth is scale plus blur, as a long lens would give it.

**Camera.** A long lens with very little travel. Moves are push-ins measured in percent, not in panels. The lens "breathes" (a slight scale change) during a focus pull, as real lenses do.

**Objects.** Planes, not objects. The panel, the page and the Canvas are planes that come to focus. A single object can be "pulled" between planes (it sharpens as it moves forward).

**Transition grammar.** *focus pull* (A softens and B sharpens, on one curve), *plane slide* (a plane enters at depth, already soft, and comes to focus), and *rack* (two planes swap focus while overlapping).

**Typography.** Text out of focus is blurred, never faded. The focused line is the only fully sharp text in frame during the pause.

**Blur and masks.** Blur is the language here. It must always mean "not in attention", and never hide an interpolation.

**Authentic UI.** The planes are real states. The depth arrangement (manuscript floating in front of the workspace) is film-only.

**The dark stage.** The deepest plane: the void behind the work.

**Wide vs close.** Wide means everything in focus (rare: the reveal). Close means a shallow focus plane.

**Strengths.** The most emotionally precise for the *pause*. Calm and cinematic, never busy.
**Risks.** Pseudo-3D and blur everywhere: the brief's two named dangers. Stacked planes suggest an app architecture Sutura doesn't have (its panels are side by side, not layered). Many-layer blur is also expensive to render.
**Fit.** Medium. Excellent for one beat (the pause), wrong as a system.

### Direction III — **The Seam** ("sutura: a stitch")

**Core philosophy.** *Sutura* is Latin for a seam, a stitch. The film is stitched by one thread: a single hairline that carries the viewer between states. Each time, it's a line the product already draws: the excerpt's 2px left rule, a relationship link's underline, the navigator's selection edge, a Canvas connection, the panel's edge. The thread underlines the sentence, runs right to become the Revision Notes panel's edge, drops to the Research link's underline, opens into the Page, traces the Canvas's lines, and finally underlines the new sentence and retracts. Editorial, typographic, book-made.

**Camera.** Orthogonal moves only, in reading direction: right along a line, down a page. Like an eye reading, never diagonal.

**Objects.** Lines first, then the objects they lead to. Objects appear at the end of a stroke.

**Transition grammar.** *draw* (a stroke extends with a constant-speed head and an eased tail), *hand-off* (a stroke ends in a real product line, which takes over), and *retract*.

**Typography.** Stable. The line does the moving.

**Blur and masks.** No blur. Masks are stroke-reveals (`stroke-dashoffset`) and edge wipes that follow the stroke.

**Authentic UI.** Every line it lands on is real. The stroke between them is film-only.

**The dark stage.** The thread may cross the stage once, in the wide shot, stitching window to window or panel to panel.

**Wide vs close.** Wide shows where the thread has been. Close shows the needle.

**Strengths.** Brand-meaningful (the name), distinctive, and restrained by nature. It ties directly to Canvas connections and relationships.
**Risks.** A line that crosses prose is ugly. A line too often is a motif that becomes a logo animation. It edges toward "graphic overlay on a UI" (agency showreel).
**Fit.** High as an *accent*, risky as the whole grammar.

### Recommended direction

**Identity as the grammar, with one Seam and one Rack.**

- Identity carries every transition where an object persists (most of the film).
- The Seam appears **once**, where the product's own line is the meaning: the Canvas connections drawing between objects that just arrived (Study C).
- Rack Focus appears **once**, as a gentler version: at the pause, attention narrows by ink steps to a single sentence, timed to the thinking motif (Study A). It's de-emphasis by ink, not by blur. Blur stays reserved for speed.

---

## 2. Semantic transformations

Ratings are *difficulty / impact / Sutura fit*.

### T1 · The quotation lifts
- **Source:** the Scene, the caret resting after *"Seventeen was empty."* (frame 05).
- **Destination:** Revision Notes, the first note's anchored excerpt (frame 06).
- **Persists:** the sentence.
- **Transforms:** a *copy* of the line lifts from the prose (the original stays inked), scales from 18.5px to 13.5px EB Garamond (same face: a pure scale), and arcs into the excerpt's slot. The excerpt's 2px left rule draws down behind it.
- **Camera:** settles from frame 05's framing to frame 06's while the panel opens (the panel's own 300ms width ease; the prose re-centres, both real).
- **Technique:** text carrier (replica + transform), arc path, carrier-only subframe blur.
- **Why it helps:** shows that a note is *about* that sentence, which is the whole point of anchored notes.
- **Gimmick risk:** low-medium. It turns magical if the sentence leaves the manuscript, so it mustn't.
- **Ratings:** medium / medium-high / **high**.

### T2 · The link opens into the Page
- **Source:** Inspector → Research → *1998 Guest Ledger* (frame 07).
- **Destination:** the Page, then the full window (frame 08).
- **Persists:** the title *1998 Guest Ledger*.
- **Transforms:** the link's text becomes the Page title (Inter 13 → 23 semibold, accent ink → ink, underline retracts). The link's hover pill becomes a mask that grows to the content region, then the whole window, revealing the destination state under it. The camera pulls back to the stage.
- **Camera:** pinned to the word, then a long pull-back with the word as the fixed point.
- **Technique:** text carrier with a cross-dissolved weight, a world-space clip-path mask, an anchored dolly, subframe camera blur at peak.
- **Why it helps:** discovery → expansion → clarity in one gesture. The Page grows out of the relationship that points to it.
- **Gimmick risk:** medium (it must not look like the app zooms).
- **Ratings:** high / **high** / high.

### T3 · The caret is the metronome
- **Source and destination:** the same Scene (frame 05).
- **Persists:** the caret.
- **Transforms:** the thinking motif's *tick… tick…* is the caret's blink. Each tick lands on a blink-on, and each takes the surrounding prose one ink step down, until only *"Seventeen was empty."* reads at full ink.
- **Camera:** a two-percent push on each tick, nearly subliminal.
- **Technique:** per-paragraph ink, an event grid tied to the sound.
- **Why it helps:** gives the sound a visible source. The pause becomes thinking, not waiting.
- **Gimmick risk:** low.
- **Ratings:** low / medium / **very high**.

### T4 · "1998" carries across the panel
- **Source:** the note's details: *"Something she saw — or was told — in 1998."*
- **Destination:** the Inspector's Research → *1998 Guest Ledger*.
- **Persists:** the token *1998*. (A semantic rhyme, not a product relation.)
- **Transforms:** when the panel's subject changes from Revision Notes to Inspector (the same sheet, a real swap), *1998* holds its ink while the rest of the panel exchanges, then slides to become the first word of the Research link.
- **Technique:** text-run carrier, staggered exchange.
- **Why it helps:** the question's *when* leads straight to the evidence.
- **Gimmick risk:** **high**. It implies Sutura matches text. It's a film-only rhyme and must be read as editing, not as product behaviour.
- **Ratings:** medium / medium-high / medium-low.

### T5 · The row becomes the title
- **Source:** the navigator row *The Key Cabinet*, clicked at the end of the time-lapse (frame 04).
- **Destination:** the Scene's title in the editor (frame 05).
- **Persists:** the Scene.
- **Transforms:** the row label (Inter 13) travels to the doc title (Inter 24 semibold) while the editor resolves under it and the navigator retracts.
- **Technique:** text carrier, navigator collapse (a real state).
- **Why it helps:** replaces the cut out of the lapse with a continuous return.
- **Gimmick risk:** low.
- **Ratings:** low-medium / medium / high.

### T6 · One Scene, lit everywhere
- **Source and destination:** the wide shot (frame 08).
- **Persists:** *The Key Cabinet*.
- **Transforms:** as the motif resolves, the Scene's representations take the accent tint together: the navigator row, the first tab, and *Referenced by → The East Stair · The Key Cabinet* in the ledger's Inspector. Then they let go.
- **Technique:** synchronised state tint (all three use the app's own selected/hover fills).
- **Why it helps:** "connected both ways" without a word.
- **Gimmick risk:** low-medium (it must stay one beat, once).
- **Ratings:** low / medium / high.

### T7 · The name finds its card
- **Source:** the ledger's inline reference *@Elias Vale* (frame 09).
- **Destination:** the Characters Board, the Missing lane (frame 10).
- **Persists:** Elias.
- **Transforms:** the reference lifts, the Board assembles wide behind it, and the name docks as the card's title.
- **Why it helps:** replaces the navigator hunt with a thread of thought.
- **Gimmick risk:** **honesty**. Clicking a reference opens the Entry, not a Board. Only acceptable if the film then opens the card and doesn't imply the reference opened the Board.
- **Ratings:** medium / medium / medium-low.

### T8 · The card opens into the Entry
- **Source:** the *Elias Vale* card on the Board (frame 10).
- **Destination:** the Entry (frame 11).
- **Persists:** Elias.
- **Transforms:** the card's bounds become the Entry's content mask, its title becomes the Entry title, and its meta *Brother* docks as the Role value.
- **Technique:** rect FLIP, clip-path mask, two text carriers.
- **Why it helps:** the card *is* the Entry, a different representation.
- **Gimmick risk:** low.
- **Ratings:** medium / medium / high.

### T9 · Relationships take their places
- **Source:** the Entry's *Connected to: Mara Vale, Thomas Vale, 1998 Guest Ledger* and its title *Elias Vale* (frame 11).
- **Destination:** the Canvas *The Night of the Fire*, wide (frame 12, wider).
- **Persists:** the four objects (Canvas Entry and Page cards are representations of them).
- **Transforms:** the inline values detach and grow into their Canvas cards at their Canvas positions. The Entry recedes, and the Canvas ground and the other cards resolve. Then the **Canvas's own connections draw** between them (the one Seam).
- **Camera:** pulls back to a wide Canvas, then travels the network to the Scene card.
- **Technique:** four text carriers plus morphing rounded-rect surrogates (pill → card), stroke-draw on the real connection SVG.
- **Why it helps:** structured information → freeform thinking, literally.
- **Gimmick risk:** medium. Four movers is the upper limit. The lines must be the Canvas's real lines, not new "relationship" lines.
- **Ratings:** high / **high** / high.

### T10 · The Scene card opens into the Scene
- **Source:** the Canvas Scene card *The Key Cabinet*, preview *"Seventeen was empty."* (frame 12).
- **Destination:** the manuscript (frame 13).
- **Persists:** the Scene and the sentence.
- **Transforms:** the card's bounds expand into the writing column, and the Canvas recedes outside it. The card title becomes the Scene title. The preview *"Seventeen was empty."*, already set in EB Garamond, becomes the line in the prose (13px → 18.5px, same face). The prose resolves around them. The caret arrives below and typing begins.
- **Camera:** a push-in that ends tighter than the opening.
- **Technique:** two carriers, a rect mask, a manuscript ink-in.
- **Why it helps:** the sentence that raised the question is where the answer is written. It bookends T1.
- **Gimmick risk:** low.
- **Ratings:** medium-high / **high** / **very high**.

### T11 · The book's length
- **Source and destination:** the time-lapse navigator (frames 03–04).
- **Persists:** the Chapters.
- **Transforms:** as each Chapter row lands, a hairline extends from it to the right, proportional to its words (manuscript length becoming visible). At the lapse's end the lines retract into the rows.
- **Why it helps:** shows growth as *writing*.
- **Gimmick risk:** **analytics look**: bars read as a dashboard, and Pulse is not the product.
- **Ratings:** medium / medium / medium-low.

### T12 · One vector
- **Source and destination:** the time-lapse (frames 02–04).
- **Persists:** the writing position.
- **Transforms:** the selection highlight descends the navigator row by row like a pen moving down the book. Each landing opens the next row, and the prose beside it scrolls in the *same direction at the same rhythm*, so structure and text move as one downward vector. At the end the selection climbs back up in one long stroke to *The Key Cabinet* (the return), and the scroll reverses with it.
- **Why it helps:** the lapse reads as one motion, not two simultaneous effects. The climb back is the revision.
- **Gimmick risk:** low.
- **Ratings:** medium / medium-high / high.

### R1 · Rejected: the ledger fact writes the sentence
*"23:40, T.V."* lifting off the Research Page and landing in the prose is the most "obvious" persistence in the film. It's also a lie about Sutura. It shows the product carrying words into the manuscript, a hair's breadth from the AI-writing promise Sutura makes. The writer types it. The film's final typing is the payoff *because* nothing carries it.

### Ranking

| Rank | Transformation | Why here |
|---|---|---|
| 1 | **T10** Scene card → Scene | Highest fit. The bookend: the same sentence, same face, back home. |
| 2 | **T2** Link → Page → window | The film's one big expansion. Earns the only wide shot. |
| 3 | **T9** Relationships take their places | Shows the Workspace's freedom. Hardest to do well. |
| 4 | **T1** The quotation lifts | Explains anchored notes in one second. |
| 5 | **T3** The caret is the metronome | Cheap, honest, makes the sound visible. |
| 6 | **T12** One vector | Fixes the time-lapse's split attention. |
| 7 | **T8** Card → Entry | Clear identity, modest impact. |
| 8 | **T6** One Scene, lit everywhere | The reveal's hold, with meaning. |
| 9 | **T5** Row → title | Small, useful, replaces a cut. |
| 10 | **T4** "1998" carries | Lovely if it works. Most likely to read as product magic. |
| 11 | **T7** The name finds its card | Honesty cost too high as specified. |
| 12 | **T11** The book's length | Drifts toward a dashboard. |
| — | **R1** | Rejected on principle. |

---

## 3. Signature shots

### S1 · The fixed word *(Study B; see the revision under "Recommended")*
**Shot (as first proposed).** Close on the Inspector, Research → *1998 Guest Ledger*. ⌘-click. The words don't move. They grow, from a link into a title, and a Page opens out of their pill, then the content area, then the whole window. The camera pulls back until the window sits on the dark stage, Manuscript on the left and Workspace around it, the ledger held in the middle of everything.
**Why memorable.** A single word holds still while an entire product assembles around it. It's the one moment the film shows its scale.
**Why Sutura.** The Page grows *out of* the Scene's relationship to it. The manuscript points outward, and the Workspace opens.
**Technique.** Text carrier, world-space mask from pill to window, a dolly anchored on the word, subframe camera blur at peak.
**Difficulty.** High.
**Could fail if** the pull-back reads as "the app zoomed", the mask edge reads as a wipe, or the type swap jumps.

### S2 · Seventeen, twice *(Study C's end)*
**Shot.** The Canvas Scene card *The Key Cabinet*, its preview *"Seventeen was empty."* in the manuscript's face. Click. The card's bounds become the writing column, and the Canvas falls away outside it. The preview line grows into the prose, and the prose resolves around it. The camera ends close, and below that same line the caret begins: *Beneath it, in pencil…*
**Why memorable.** The film's question and its answer, one line apart, in the same type.
**Why Sutura.** The Workspace served the writing, then got out of the way.
**Difficulty.** Medium-high.
**Could fail if** the card-to-column growth feels like a modal opening (generic SaaS), or the line jumps when it swaps.

### S3 · One Scene, everywhere
**Shot.** The wide hold. On the motif's resolving note, *The Key Cabinet* takes the accent tint in the navigator, in its tab and in the ledger's *Referenced by*, three representations of one Scene lit at once, then released.
**Why memorable.** A quiet constellation on a full product.
**Why Sutura.** Universal identity and backlinks, wordless.
**Difficulty.** Low.
**Could fail if** it's too faint to see, or too strong (a highlight effect).

### S4 · The seam
**Shot.** In the wide shot, a single hairline stitches the ledger's backlink to the Scene's row in the navigator, crossing the window above the Page's body. It holds for a breath and retracts into the backlink's own underline.
**Why memorable.** The brand's name, drawn.
**Why Sutura.** Connections both ways.
**Difficulty.** Low-medium.
**Could fail if** it crosses text or reads as decoration. It's the most "agency" of the four.

### S5 · Everything gets out of the way
**Shot.** The last typed word, *himself.* The camera pulls back from the prose to the whole window as the navigator retracts and the panel closes (real states). The window holds with only the manuscript in it, then dims into the stage, and the wordmark resolves where the window was.
**Why memorable.** It's the thesis's last line, performed.
**Difficulty.** Medium.
**Could fail if** it repeats S1's pull-back (two pull-backs dilute both).

### Recommended signature shot

**S1, as Study B revised it: the Page unfolds out of its link.** It's the only shot that shows the whole product, and it earns the wide by growing out of a single relationship. S2 is the emotional payoff, but it works because S1 has already shown the Workspace's scale. S3 lives inside S1's hold. S4 and S5 are not recommended for the film.

**What the study changed.** The "fixed word" version failed. Pinning the camera to the travelling word dragged the whole world ~1,700px across the frame in a second, and blur only turned that into ghosting. The layout supplied the fix: the Research link sits almost exactly where the final wide framing puts it. So the shot became **one continuous pull-back pivoting on the click point**. The world only contracts toward the pointer, slowly. The one thing that travels is the title, from the Inspector's margin to the centre of the work, with the Page unfolding out of it. The pointer never moves.

---

## 4. Motion principles

1. **One object leads at a time.** Each moment has exactly one thing the eye should follow. Secondary motion starts after the lead has made its intent clear (≥4 frames) and ends before it lands.
2. **Persistence before dissolve.** If a successor exists in the next state, the object moves to it. Opacity is for content without a successor (incidental chrome, de-emphasised prose), never for an object with one.
3. **The manuscript never yields.** Prose is quoted or represented, never removed. A carrier leaving prose is always a copy, and the original stays inked.
4. **Endpoints are authentic, frame-exact.** Every carry begins and ends pixel-identical to a real product state. The swap is invisible or it isn't done.
5. **Scale changes by transform, in log space.** No `font-size` animation (glyphs re-hint and shimmer). A ×2 and a ×½ take the same time.
6. **Weight changes at peak speed.** When a carrier changes weight or colour, the cross-dissolve lives in the middle third of the move, where the eye can't resolve type.
7. **Arcs, not lines.** Carried objects travel a shallow arc (a 6–10% lift of the travel distance), as a hand moves. Cameras travel straight.
8. **The camera is the viewer's head.** It starts 3–5 frames *after* the object it follows and arrives 4–8 frames after it lands (follow-through). It never leads an object into a frame.
9. **Product transitions run at product speed.** A panel opens in 300ms on Sutura's own curve (`--r2-ease-frame`). The film does not slow the app down to look cinematic.
10. **Film choreography runs on film curves.** Carries use a critically-damped feel (no overshoot, no bounce). Cameras use a long symmetric ease. Nothing in the film bounces, ever.
11. **Blur means speed.** Motion blur only above ~25 px/frame on screen, sampled from real subframes and never applied to a still object. If blur is needed to hide a seam, the seam is wrong.
12. **De-emphasis by ink, focus by sharpness.** Stepping text down is ink (it stays sharp). Blur never means "unimportant".
13. **Wide establishes architecture; close establishes meaning.** The film goes wide only to answer *where am I*, and close only to answer *what matters*. Medium is the workflow.
14. **Silence is a beat.** Every sound event is preceded by at least 6 frames without one. Nothing moves on a tick unless the tick caused it.
15. **No zero.** Nothing scales from 0, fades from 0 at the same time as it moves from off-screen, or rotates.
16. **Settle is part of the shot.** Every move ends with 6–12 frames of stillness before the next begins. Overlapping actions (principle 8) are the exception, not the habit.

---

## 5. Technical approach

Everything lives in `marketing/`. The production app is never modified for the film.

- **Pure frames.** Each study is a pure function of time: `Frame({ t })`. Composition, contact strip and motion blur all call it. Nothing reads the clock, and CSS transitions are off on the stage.
- **Probes (measured anchors).** Each authentic endpoint state is rendered once, hidden and untransformed, in the same window. The study reads exact text-run boxes (DOM `Range`) and computed type (`font-family`, `weight`, `size`, `letter-spacing`, `color`) for named anchors. It holds the render (`delayRender`) until fonts are ready. No hand-measured coordinates.
- **Text carriers.** Two replicas (source type and destination type) share one interpolated box: left edge and vertical centre along a quadratic arc, size in log space. Each replica is drawn at its own natural font size and scaled to the box, so both endpoints are pixel-identical to the real element.
- **Shape surrogates.** A pill or card that grows into a container is a film-only rounded rect interpolating x, y, w, h, radius and fill, swapped for the real container at its endpoint.
- **Masks.** `clip-path: inset(… round r)` in world space (inside the camera), so a mask scales with the camera and its edge stays sharp at any zoom.
- **Camera.** The existing `foundation/Camera` (a world point pinned to a screen anchor at a scale). Anchored dollies keep a world point fixed on screen while scale changes.
- **Motion blur.** A running average of N re-renders of the pure frame at subframe times (layer k at opacity 1/(k+1)). N rises only with on-screen speed, so it's free when nothing moves.
- **Labels.** Each study declares phases as `authentic` or `film-only`. The `…-Annotated` variant of each composition prints the current phase in the corner for review.

---

## 6. Sound and the event grid

No music. Time is kept by **events**, not a BPM grid. The grid is the order in which things happen and the silences between them.

| Event | Frames @30 | Sound | Rule |
|---|---|---|---|
| **type** | per character, 1.3–2.4 (seeded hand) | soft key; a heavier key on a period | never under a camera move faster than a drift |
| **settle** | 6–12 | — | after every landing |
| **click** | 1 (press) | one click, 2 frames before the press | only where a choice is made |
| **tick** | pairs, 16–17 apart | the thinking motif, a small tactile pulse | ≥12 frames of silence before the first. Tied to the caret blink. |
| **open** | 9 (300ms, the product's own) | — (the click covers it) | product speed |
| **lift / carry** | 18–26 | none, or a barely-there air movement | the eye is busy, so let it be |
| **unfold / pull-back** | 45–75 | one quiet spatial movement, low | never a riser, never a whoosh |
| **resolve** | at the camera's *arrival* | one tonal step (the motif resolving) | once in the film |
| **silence** | ≥15 | — | before the pause, after the reveal, before the return |

---

## 7. The studies

Each study is three compositions: `ProductFilmStudy<X>` (picture and sound), `…-Annotated` (silent, every moment labelled **AUTHENTIC PRODUCT STATE** or **FILM-ONLY TRANSITION**) and `…-Strip` (a review strip). Source: `marketing/src/creatives/product-film/studies/`. Previews (1280 × 720 MP4 with sound) are written to `marketing/out/studies/`, and the strips to `marketing/product-film/studies/`, by `npm run film:studies`. 800px GIFs of this round are in `marketing/out/studies/` as well.

**Shared machinery** (`studies/`):

- `probe.tsx` renders each authentic endpoint once, hidden, and measures named anchors: exact text runs (DOM `Range`) and computed type, including the drawn scale under a Canvas viewport.
- `Carrier.tsx` holds the film-only surrogates: text carriers (two replicas sharing one box, pixel-identical to the real element at both ends), the slip, shape surrogates, rect masks, directional blur and subframe motion blur.
- `motion.ts` holds the curves and the arc and level paths.
- `Study.tsx` holds the stage, the per-frame CSS scope (`frameScope`: every frame's staging rules carry their own key, so frames drawn side by side in a strip can't leak into each other), the phase annotation and the cue sheet.

Two new synthesised sounds, both deterministic: `pulse-1/2.wav` (the thinking motif, a felt knock, deliberately not the navigator's wooden tick) and `resolve.wav` (one rolled open fifth).

**Continuity check.** Every preview was decoded and its consecutive-frame difference measured. No study has an isolated spike: every hand-off (carrier → real element, sheet → shell, card → Scene) is invisible. Each gesture is a single rise and fall.

### Study A · The pause → Revision Notes (5.9s)

| | |
|---|---|
| **Semantic object** | *"Seventeen was empty."* |
| **Authentic source** | Frame 05: the Scene, the caret after the sentence. |
| **Authentic destination** | Frame 06: Revision Notes, the first note anchored to the sentence. |
| **Film-only** | The motif: the caret blinks *on* each tick, and each tick takes the rest of the Scene one ink step down (1 → 0.58 → 0.28), with a 1.5% lean about the sentence. The quotation: a copy of the line is picked up as a **slip of the page** (the writing surface's own `--r2-ms-bg` with the product's lifted-surface `--r2-shadow-pop`, +2.5% scale) while the page slides out from under it as the panel opens. It carries on an arc into the excerpt's slot, where the quotation marks close around it and the excerpt's 2px rule draws down. Then the hand-off to the real excerpt, and the Scene re-inks. |
| **Authentic motion** | The panel opens in 300ms on `--r2-ease-frame`, its content fading in after 40ms. The prose re-centres by the real clamp (`--r2-doc-offset`, reproduced exactly as `min(closed, open + (320 − w))`). |
| **Easing** | Carry `bezier(.38,.04,.22,1)` over 1.1s (peak ≈ 2.6× average, ~89 px/frame). Ink steps and landing on a settle curve. The camera starts 0.08s after the carry and lands ~0.13s after it. |
| **Masks** | None. The slip occludes the dimmed prose it passes over, so the words never cross text naked. |
| **Camera** | The two framings (05 and 06) re-expressed about the sentence and interpolated about it. |
| **Blur** | Directional (an SVG Gaussian along the screen velocity), σ = min(3px, 4% of px/frame), carrier only. |
| **Sound** | Pulse 0.62s, pulse 1.18s, click 1.95s, then silence while the note is read, then pulse 4.12s and 4.68s. |
| **Iterations** | A plain arc crossed the paragraph above. A level, reading-direction path smeared over its own original. The slip solved both. The first blur (σ ≈ 11% of speed) made the line an unreadable streak. |
| **Risks** | For ~5 frames two copies of the line are visible as the page slides from under the slip: true to quotation semantics, but a viewer may read it as a glitch. The slip's shadow is depth the editor never shows. It's the longest object travel in the set (~1,150px on screen for a 13.5px destination), so a tighter frame-06 crop would shorten it. |

### Study B · Inspector → Research Page → the whole window (6.0s, signature)

| | |
|---|---|
| **Semantic object** | The title *1998 Guest Ledger*. |
| **Authentic source** | Frame 07: Inspector → Research → *1998 Guest Ledger*, hovered. |
| **Authentic destination** | Frame 08: the Page in its own tab, its Inspector, the whole window on the stage. |
| **Film-only** | The Page is **pinned to its carried title**, scaled with it (k = size / 23px), and revealed through a mask that starts as the link's own hover pill (still grey, clearing) and grows to the content column, the Page's own territory and never further, with the product's lifted-surface shadow at its edge. When the sheet lands, the shadow settles away and the sheet *is* the column. On the motif's resolve, the Scene's three representations (navigator row, tab, *Referenced by*) take the app's soft accent together, then let go. |
| **Authentic motion** | ⌘-click opens a new tab. The tab, the trail and the Inspector change in place, the Inspector body sequentially: old out 0.12s, new in 0.2s, never both. This is the study's one dissolve, because a Scene's Inspector and a Page's share no object. |
| **Easing** | Lean on a camera ease, 0 → 1.12s. Carry 1.3s. The pull-back `bezier(.62,0,.1,1)` over 2.5s. |
| **Masks** | `clip-path: inset(… round r)` in the Page's own coordinates, so it contains the title by construction. |
| **Camera** | One move pivoting on the click point, ×1.75 → ×2.1 (lean) → ×1.14 (wide). The pointer stays where it clicked the whole time. |
| **Blur** | None. The pivot keeps even the window's far edge under ~30 px/frame. |
| **Sound** | Pulse 0.24s and 0.80s under the hover, the ⌘-click at 1.09s, one quiet spatial movement at 1.76s (whoosh-soft at 10%), and the **resolve** at 3.62s as the camera arrives. |
| **Iterations** | (1) The camera pinned to the word, plus whole-frame subframe blur: the world whipped across the frame in multi-exposure ghosts. Rejected. (2) The mask opening to the whole window: its edge wiped through the Inspector (half old, half new) and the two status lines overlapped. Rejected. The final grammar stops the mask at the column. |
| **Risks** | Around 1.4–1.6s the small sheet can read as a hover preview, a feature Sutura doesn't have. Starting the mask from a slightly larger pill or holding the pill tone longer would help. The identity glow is film-only (the app doesn't highlight representations together) and subtle: it may vanish on a phone. |

### Study C · Entry → Canvas → back to the Scene (7.4s)

| | |
|---|---|
| **Semantic objects** | *Elias Vale* (the Entry's title), *Mara Vale*, *Thomas Vale*, *1998 Guest Ledger* (his Connected to values); *The Key Cabinet* Scene card; *"Seventeen was empty."* |
| **Authentic states** | Frame 11, but wider (×1.45, so the navigator's Canvas row is in frame); the Canvas *The Night of the Fire* **at a real 62% zoom** (new); frame 12 (the Scene card, hovered); frame 13 (the new paragraph begun). |
| **Film-only** | Elias leads (0.74s) and his three relationships follow as a group 0.12s later. Each grows from its place in the Entry (title, or link pill) into its Canvas card (a surface surrogate, transparent → raised, carrying its title), while the Entry dissolves beneath the Canvas: a true dissolve, the Entry kept opaque under it. The rest of the map then inks in, and the Canvas's **own** connections draw (stroke-dash per line, arrowheads only once complete, labels after): the film's one Seam. Then the Scene card opens: its preview line, already in the manuscript's face, carries into the prose line. The Scene is pinned to it and revealed through the card's growing surface. The card's own title leaves with the card, because its successor (the Scene title) is out of frame. |
| **Easing** | Carries 1.1s. Travel through the stations ledger → *plant it* → Scene card is a Catmull–Rom path with log-scale zoom, on a camera ease, over 1.5s. The card opening runs 1.12s. |
| **Camera** | ×1.45 → ×1.55 (the whole story map, the window's edges just out of frame) → down the thread to ×2.7 on the Scene card → riding the preview line into frame 13's ×2.45. |
| **Blur** | None. |
| **Sound** | Click 0.65s, open air under the Canvas (22%), click 4.43s, Return 5.77s, then the typing hand. |
| **Iterations** | The card surface rendered grey (drawn outside a light root, so `--r2-surface-raised` resolved to Dark). A carried card title crossed the prose to a destination outside the frame, so it was removed. The sheet stopped at `.r2-main` and showed Canvas dots under the status zone, so it now runs to the window's edges. |
| **Risks** | Four movers is the upper limit (principle 1 is bent: Elias leads by only 4 frames). The travel slows as it passes the ledger (uniform spline parameterisation). It reads as a linger, and a chord-length parameterisation would remove it. Text in the 62% wide is small: it's architecture, not reading. At 7.4s it's long; in the film, the Entry hold and the travel compress. |

---

## 8. Final report

**Strongest: Study B.** One gesture, and every frame is either authentic or explains itself. The Page visibly comes *from* the Scene's relationship to it. The pivot camera needs no blur. The resolve tone lands on the camera's arrival, with the Scene lit in three places. It earns the film's only wide shot.

**Weakest: Study A.** It's honest and it works. The caret-as-metronome (T3) is the best idea in it, and it should carry straight into the film. But the quotation carry is long and small (a 13.5px destination crossing ~1,150px of screen), and the moment two copies of the line are visible is the most "effect-like" frame in the set. Recommended change: keep the ticks and the slip, and frame frame 06 tighter, so the carry is half the distance.

**What surprised me.**
1. **The layout wrote the signature shot.** The Research link sits almost exactly where the wide framing puts it. Pivoting on the click point turned a whip-pan into a calm contraction.
2. **Motion blur never helped.** Each time a move seemed to need blur, the right answer was a different move. The blur machinery stays in the toolkit, and the principle stands: if a move needs blur to look acceptable, the move is wrong.
3. **The product already believes in the sentence.** The Revision Note excerpt and the Canvas Scene card's preview are both set in EB Garamond, the manuscript's own face. Sutura already treats them as the same sentence, so the film's bookend (A ↔ C) needs no type change at all.
4. **A mask must stop at the territory of the thing that grows.** Opened past its object, it becomes a wipe through unrelated UI. The chrome around an object changes the way the product changes it, in place.
5. **The two hinges rhyme mechanically.** B (link → Page) and C's ending (card → Scene) are the same machinery: a layer pinned to a carried line, revealed through its source's own shape. The film can use that rhyme on purpose: the way out to the Workspace and the way back to the manuscript are the same gesture, reversed in meaning.

**Carry into the full film.**
- The Identity grammar.
- The pinned-layer unfold, for both hinges.
- The caret as metronome.
- The pivot camera for big moves.
- The slip for quotations.
- The Canvas lines drawing once.
- One dissolve, only where no object persists.
- The event grid, with the resolve on the camera's arrival.
- The probe/carrier toolkit, measured rather than hand-placed, which keeps every endpoint authentic.

**Reject.**
- Whole-frame subframe blur for camera moves.
- Any mask that opens past its object.
- Carriers whose successor is outside the frame.
- T4 ("1998" carries: it reads as product magic).
- T7 (a reference opening a Board isn't true).
- T11 (it reads as a dashboard).
- R1 (it breaks the authorship promise).
- S4, the seam across the window (agency-graphic).

**Does the storyboard need a narrative change?** No. The beats hold, and the studies made each hinge stronger, not different. Two *structural* changes follow:
- Frames 07 → 08 become **one continuous shot**: the unfold is the transition, and frame 08 is where it lands.
- Frame 12 → 13 is no longer a click-then-push. The card opens into the Scene, so the push-in is part of that gesture.

**Does it need new anchor states?** Yes, three. All are real states, only framed differently:
1. **Frame 11′, the Entry wide (×1.45)** with the navigator's Workspace rows in frame, so the click that opens the Canvas is seen.
2. **Frame 12a, *The Night of the Fire* at 62%**, the whole story map. This is the wide state the brief asked for, and it's the Canvas's real zoom, not a camera trick.
3. **Frame 13′, the new paragraph's empty line with the caret**, the instant before *"Beneath it…"*, so the return has a still to land on.

The one beat no study exercised is **frame 10, the Characters Board**. Per the brief, it should open wide as a real Board and push in. T8 (card → Entry) is the natural next study, using the same pinned-layer machinery as B.

---

## 9. Final R&D pass

Four studies: three revisions and one new. Each is a Remotion composition (also `-Annotated` and `-Strip`). Previews are in `out/studies/study-{a-v2,b-v2,c-v2,d}-preview.mp4` and strips in `product-film/studies/`.

| Study | Length | Transition type | Verdict |
|---|---|---|---|
| `ProductFilmStudyBV2` · Inspector → ledger Page → whole window | 5.2s (was 6.0) | Identity expansion | Strongest. Still the signature shot. |
| `ProductFilmStudyD` · Characters Board → Elias Vale's Entry | 5.0s | Object expansion | New, and the clearest statement of §21. |
| `ProductFilmStudyCV2` · Entry → Canvas → back to the Scene | 8.7s (was 7.4) | Representation transformation, then return to manuscript | The first half now reads as persistence. It has the most moving parts. |
| `ProductFilmStudyAV2` · the pause → Revision Notes | 4.2s (was 5.9) | Quiet product interaction | Better for being plain. |

### What changed

**One new structural idea: split every state into environment and document** (`studies/layers.tsx`). The *environment* is the window: navigator, tabs, context bar, panel, and the content column's empty ground. The *document* is what the column holds. In a transition, one environment is laid over the other at the same geometry, so only what differs changes. The document resolves element by element in reading order. The semantic object travels above both. This is what removed V1's "floating panel": nothing is ever a sheet laid over old UI.

- **A V2** has no carrier. The last keystrokes land ("…emp**ty.**"). The caret holds, then blinks, and each blink is a tick that takes the rest of the Scene one step quieter (ink 1 → 0.7 → 0.5) while the line stays at full ink. The click returns the page to full ink. The panel opens at the product's own 300ms. The one echo is the product's anchor tone (`--r2-accent-soft-hover`, the colour Reading Mode uses for anchored text), on the line and on its quotation together, for under a second. The viewer makes the connection by recognition.
- **B V2** has no sheet. Only the words "1998 Guest Ledger" travel, with the link's grey hover pill under them for their first steps. The Scene's prose steps back to a trace and clears. The words land as the Page's title, and the Page's body resolves beneath them block by block. The Inspector re-subjects as the words leave its row. The tab, trail and selection change in place, and text that differs (the trail, the word count) swaps in sequence, never overlapping. Duration is 6.0 → 5.2s, with the peak screen speed of the words cut from ~180 to ~120 px/frame. The lean is shallower (×1.9), the carry is longer (1.2s), and the pull-back starts with the words instead of DOLLY's slow start, so the room appears while they travel.
- **C V2.** On the click, each of the three relationships gathers a card's surface around itself and lifts off the page. They leave in the order that avoids crossings (Thomas left, ledger up, Mara right and last) and grow into their cards. The Entry *is* Elias: the whole page contracts into his card, his title riding it and its notes folding in as it closes. The Canvas resolves in place where the page leaves: Sections first, the other cards only once the four have landed, then its connections. The second half is V1's, retimed. The camera's thread is now parameterised by arc length (no slowing at stations). After the card opens into the Scene, the caret holds still for 0.3s before Return, and the typing is the writer's.
- **D** is new. The scale runs WIDE (the whole window, three lanes) → MEDIUM (the Missing lane) → CLOSE (the card, at the click) → MEDIUM (the Entry), with the camera pivoting on the card. On the click the Board steps back in place. The card carries its name into the title, "Brother" into Role and "Greyhaven ferry, 3 March" into Last seen. Its surface grows to hold them until they are nearly home, then dissolves into the page. The Collection's title steps up into the Entry's eyebrow. Then the rest resolves around him: Whereabouts first, then the labels and other values, then his notes.

**Data fix (authenticity).** A Board card's second line is, in the app, the Entry's own property values (`CollectionViewBodies` → BoardView). The demo data had prose there ("Said he was 'in seventeen'"), which no property holds. `CHARACTERS_BOARD` now shows Role · Last seen, so Elias's card says what his Entry says. Storyboard frame 10's PNG predates this and will change on its next render.

**Sound.** Two new synthesised cues, with the existing files byte-identical: `sheet.wav` (a 0.24s brush of paper, for the panel opening) and `settle.wav` (a felt-soft low touch, for one object set down). No music, risers, booms or whoosh beyond B's single quiet one.

### What worked

- **Environment over environment.** Changing the chrome in place reads as the product responding rather than as an effect, and it is the reason B no longer looks like a card wipe.
- **The document resolving in reading order under an arriving title.** The Page seems to be written out from its name.
- **D's carried values.** "Brother" and "Greyhaven ferry, 3 March" landing beside labels that are not there yet, then the labels arriving, says *that card was the character* without a word.
- **Order as choreography.** Primary object first, the world a beat later, secondary UI last. Applied with judgement, not mechanically: A uses almost none of it.
- **Holding a surface to its words** (`HeldSurface`). A container interpolated on its own straight line drifted off an arcing title.

### What failed (tried in this pass, then removed)

- **Carrying "Missing" from the Board lane into Whereabouts (D).** It's semantically exact, since the Board is grouped by Whereabouts, but its path must cross Role's, and the two words collide. It now resolves in place, first.
- **B V2's first cut** cleared the prose fully on the click. That left half a second of empty paper with one title in it. The fix: a trace stays until the body arrives.
- **Overlapping crossfades of differing text** (the trail and the word count). They read as garbled type. Such text now swaps in sequence.
- **Chips leaving in reading order (C)**: Mara crossed Thomas. Departure order is now chosen to avoid crossings.

### Approved grammar for the full film

Five kinds of transition, and no others:

| Vocabulary | Where | Rule |
|---|---|---|
| **Quiet product interaction** | the pause → Revision Notes; navigator clicks; tabs; the Inspector opening; frame 09's close read; the time-lapse | The product at its own speed. The film adds only framing, the caret-as-metronome and, at most, one shared anchor tone. |
| **Identity expansion** | Inspector → Research Page (B) | The clicked words become the destination's title; the column clears and resolves beneath them; the camera pivots on the click point to the one wide reveal. |
| **Object expansion** | Board → Entry (D) | The card's surface holds what it carries into the Entry's places, then settles into the page; the rest resolves around it. |
| **Representation transformation** | Entry → Canvas (C, first half) | Objects lift off as chips and become cards; the page contracts into its own card; connections draw only after positions settle. |
| **Return to manuscript** | Canvas Scene card → the Scene (C, second half) | The preview line carries into its prose line; the Scene resolves through the card's shape; the caret holds still before the writer types. |

These rules hold for all five:
- Only the semantic object travels.
- The environment changes in place.
- A document resolves in reading order.
- Differing text swaps in sequence.
- No motion blur. No bounce. No eased crossfade where an object persists.
- Carried text stays at or under ~120 px/frame on a 1080p screen.
- Nothing is ever carried *into* the prose that the writer did not write.

**Superseded from §8:**
- The pinned-layer unfold is now used for the return only, not for B.
- The slip and the quotation carry are rejected (A).
- Add one anchor state, **frame 10′: the Board, wide** (the whole window, three lanes), ahead of frame 10's closer framing.

### Is motion R&D complete?

Yes. Every hinge in the storyboard now has a study, and the vocabulary is closed. What remains is tuning inside assembly, not new language.

Two things to watch when the full film is cut:
- **C's page contraction.** It could read as a window minimising if it runs fast. Keep its 1.16s.
- **The A → B hand-off.** The pointer leaves Revision Notes for the Inspector, and that move is ordinary navigation, not a transformation.

These checks were made on rendered stills (full size and contact strips) and on a frame-difference analysis of each MP4, which found no isolated spikes: every hand-off is continuous. Pacing and sound still need a person to watch them in real time.

