# Sutura — Instagram carousel: creative direction

**Status:** composition pass 2.1, for review: pass 2 with slide 5 redesigned (slides 1–4 and 6 are pixel-identical to pass 2). Not final and not approved for posting.
**Format:** 6 slides, 1080 × 1350 (4:5).
**Book shown:** *Equal Temperament*, the carousel's own fictional novel (`CAROUSEL_DEMO_PROJECT.md`). Nothing from *The Salt House*.

**Deliverables:**
- `slides/01-thesis.png` … `slides/06-close.png`
- `contact-sheet.png`
- `phone-sheet.png`: every slide at 390px wide, its size in the feed on a 390-pt phone. This is the sheet to judge legibility from.
- `strip.png`: the swipe, edge to edge.
- `slide-05-phone.png`: slide 5 alone at 390px.
- `slide-05-comparison.png`: pass 2 slide 5 vs pass 2.1, full size and at phone size.
- `CAROUSEL_REFERENCE_RESEARCH.md`: references studied and the principles below.
- `CAROUSEL_DEMO_PROJECT.md`: the new fictional project.

**Source:** `marketing/src/creatives/carousel/`:
- `content.ts`: the book and the Canvas
- `Slides.tsx`: the six slides
- `kit.tsx`: grid, type, window
- `Carousel.tsx`: compositions and sheets

**Re-render:** `cd marketing && npm run carousel`.

Every product surface is the app's own markup and `rune2.css`, through the film's `ui/*`. Only the data is invented. The app is untouched.

---

## The concept (unchanged from pass 1)

> **The film showed Sutura through time. The carousel shows it through scale.**

The film's dark ink stage and light Sutura window are kept. The six slides move through the film's three distances: close = meaning, medium = relationship, wide = world.

## What research changed (`CAROUSEL_REFERENCE_RESEARCH.md`)

Research covered nine official sites: Linear, iA Writer, Granola, Things, Stripe Press, Dia, Day One, Craft and Notion. It changed the *craft*, not the look. The principles applied in this pass:

1. **One idea per slide, carried by one disproportionately large element.**
2. **Attention by ink, not by boxes.** Context recedes; it is never deleted.
3. **Crop to meaning, judged at phone size.** If a detail can't be read on a phone and doesn't shape the composition, it leaves the frame.
4. **Product edges are compositional lines** on the shared margin.
5. **Vary the geometry; repeat the system.**
6. **Weight through accumulation, not numbers.**
7. **Repetition with variation can carry a story across slides.**
8. **Credible content.** The writing is part of the product image.

**Rejected** as wrong for Sutura: glow and gradient floors, device mockups, collage and paper, bento grids, perspective UI, decorative display type.

## The system

- **Margin:** every line of copy hangs from one left margin (88px).
- **Type:** EB Garamond roman for the statement, its italic in the accent ink for the answer, Inter for the closing labels only.
- **Copy never sits on product chrome.**
- **Tone:** dark stage = stepping back. Full-bleed light = inside the work (slide 2, the page; slide 5, the Canvas).
- **Scale per slide:** 1 medium (1.6×), 2 close (2.16×), 3 medium (1.96×), 4 medium (1.6×), 5 medium (Canvas at 180%), 6 close fragment (1.9×).
- **The shared corner:** slides 1 and 4 use the *same* window corner, on the same margin, at the same scale.

---

## Slide by slide

### 1 · The thesis — *Write the book. / Build only what it asks for.*

- **Kept:** the composition. The statement is large on the stage; the corner of a window sits on the margin.
- **Changed:**
  - The window holds *Equal Temperament* on its first day: Manuscript (90 words) → Chapter 1, its first lines.
  - The Workspace is **folded and empty**, which is how the navigator keeps it until something is in it.
  - Scale went from 1.42× to 1.6× for phone legibility.
- **Authenticity check:**
  - Pass 1 showed the Workspace opened while empty, with its line *"Build only what the book asks for — notes, characters, research, a map of ideas."* That line **is real production UI**, the navigator's first-use teaching in `src/components/rune2/ProjectNavigator.tsx` (~line 1428), not inserted marketing copy.
  - Even so, it pre-empted the headline. This pass uses the default state, where it isn't visible, and lets the headline carry the thesis alone.

### 2 · The manuscript — *Sutura starts with the manuscript. / Open the draft. Start writing.*

- **Pass 1 problem:** a page above a dark caption band read as screenshot + caption.
- **Now:** one image. The whole slide is the writing surface.
  - "Chapter 1" and three paragraphs at reading size (2.16×), with the caret after *"…as if he were reading it off a card."*
  - The statement sits at the foot of **the same page, on the same left margin as the prose**, as the page's last word rather than a label under it.
  - No band, no split; the writing chrome is away.
- **Research applied:**
  - iA Writer: prose and caret are the image.
  - Dia: type and product share one plane.
- **Product state:** Chapter 1 in a narrow window (480px logical). The prose uses the app's own narrow-container gutter.

### 3 · The book grows — *Then the book gets bigger. / Scenes. Characters. Research. Questions. Connections.*

- **Kept:** the idea. The navigator alone, tall, at reading size, running off the frame (Stripe Press: weight by accumulation; Things: navigation as type).
- **Changed:**
  - New book: 58,420 words; Part One (5 Chapters, *The Upright*'s three Scenes); Part Two (*The Second Visit*'s three Scenes, *Equal Temperament* selected).
  - Unplaced Scenes are folded (2,000), so the Workspace (Characters, Research) enters at the foot, where the list's "Characters. Research." points.
- **The list:** checked at phone size. It reads at about 16px with a clear rhythm, so it's unchanged apart from its size (42 → 44px).

### 4 · The workspace grows around the writing — *So the workspace grows around the writing. / Only when the story asks for it.*

- **Pass 1 problem:**
  - A whole window at 0.75×. At phone size every label became noise.
  - It said "here is the interface", not "the workspace grew around the writing".
- **New concept: the cover's frame, later.** Slide 4 uses slide 1's exact corner (same margin, same 1.6× scale, same window language), so the eye compares the two.
  - **Slide 1:** one Chapter, a folded empty Workspace, one tab.
  - **Slide 4:** the Scene being revised (*The Flat A*) is open at the centre. Above it in the navigator are the book's Parts; beneath it is the Workspace that grew: Characters, a Research folder with three Pages, and the Canvas *Rui's piano*. The working set runs across the tabs.
  - The growth is told by the difference between two frames, with no motion and no collage.
- **Why it works better:**
  - At 1.6× everything in the frame is readable on a phone: navigator, tabs and prose.
  - The manuscript stays the anchor: the page has the largest type and is centred in the visible window.
  - The Workspace is present, readable and clearly *beside and beneath* the book, not a dashboard.
- **Research applied:**
  - Things / Notion: crop until the structure is legible.
  - Linear: the frame cuts the product, so it reads as a larger world.
- **Honest limit:** the Inspector is off-frame. "Around" is shown as left (the Workspace in the navigator) and above (tabs), not on all four sides. Showing all four is geometrically impossible at a phone-legible scale in a portrait frame; I tried the full ring in pass 1.

### 5 · Thinking through the book — *Follow the thought. / Get back to the sentence.*

**Pass 2.1 redesign (composition only; the thought, the copy and the book are unchanged).**

- **The thought, inside the Canvas *Rui's piano* at 180%:**
  > **"Why has he kept / the A flat?"** → **Pitch, 1971** (Research Page: *Porto's orchestra tuned to the hall organ, a little under A440*) → **Rui Carvalho** (Characters) → **"Don't correct it. / She tunes the piano to him."** → ***The Flat A*** (Scene · The Second Visit), selected.
- **Pass 2 problem:** it read as a flowchart.
  - Five cards of nearly equal size sat in a two-column zigzag.
  - Three edge labels (*where from?*, *his ear*, *let it stand*) and four arrowheads explained every step.
  - The Scene was just one more box, with a hover ring and a one-line preview.
- **What changed:**
  - **No edge labels at all.** The cards carry the meaning.
  - **Arrowheads:** one, into the Scene. The other path connections are undirected Canvas lines (directed is a per-connection choice in the app). Reading order supplies the direction.
  - **Hierarchy by size, room and ink, using only real Canvas states and writer-sized cards:**
    - The **question** is a small two-line note, sized like a jotted thought.
    - **Pitch, 1971** and **Rui Carvalho** are mid-sized object cards, with Rui the larger.
    - The **decision** is a wide note with a line break the writer typed, so it reads as two clean lines in the warmer note paper. It is the largest text on the board.
    - ***The Flat A*** is the largest card. It is **selected** (the app's accent hairline and halo, the same pale blue as the answer line beneath it) and shows its real four-line prose preview in the manuscript serif, clamped with the app's ellipsis.
  - **Off-grid:** no two path cards share a left edge (88 / 150 / 478 / 540 / 560), and the gaps vary (a long reach from question to evidence, a short drop to Rui, the decision close above its Scene).
  - **Bigger than the frame:** two receded cards (opacity 0.36) are cut by the slide's edges. *Dona Amélia Reis* is cut on the left, joined to Rui by a faint line. ***Aphasia notes*** (new, Research) is cut on the right.
  - **Lines:** default Canvas weight. The path is in 58% ink, the peripheral line at half strength. No glow, tracer or labels.
- **How the eye travels:** headline → the small question beneath it → right to the evidence → back left and down to Rui → right to the decision → down the one arrow into the selected Scene → the answer line.
- **Phone size:**
  - The path, every card title, the decision and the selected Scene all read at 390px.
  - The peripheral cards read as context.
  - The lines show but are thin.
- **Honest limit:** the Canvas has one zoom, so there is no per-card *text* scale. Hierarchy comes from card size, note vs object type, white space, selection and recession.
- **What is still open:** see the judgment notes below.

### 6 · The close — *A writing workspace built around the book. / Early Access is open / writesutura.com*

- **Kept:** the composition.
- **New payoff, in *The Flat A* after the Canvas:**
  - The lever paragraph stays, dimmed.
  - The new sentence is in full ink with the caret: *"She took it off again. She left his A where it was, and tuned the other eighty-seven keys to meet it."*
  - It answers slide 5's decision note in the writer's own prose. Sutura organised the thinking; the writer wrote the sentence.
- **Changes for phone size:**
  - The fragment went from 1.62× to 1.9× so the sentence reads on a phone.
  - The clipped half-line at its top edge is gone.
- **CTA:** "Early Access is open" and the address went from 26px in secondary ink to **30px in primary ink**. Still quiet, now legible on a phone.

---

## Phone review: changes made because full size passed but phone failed

- **Slides 1 and 4:** 1.42× → 1.6×. Navigator labels were about 7px on a phone.
- **Slide 5 (pass 2):** the 150% Canvas with eight cards became a 180% Canvas with six; the question note was widened; labels were shortened. **Pass 2.1** removed all labels, so nothing collides, and checked the redesign at 390px (`slide-05-phone.png`).
- **Slide 6:** 1.62× → 1.9×, CTA enlarged and brightened.
- **Edges:** each bleed edge was audited. Slide 1's window was moved until the bottom edge fell between prose lines.

## Copy changes in pass 2

None to the headlines or answers. Small layout changes only:
- Slide 5's answer is now one line beneath the Scene.
- Slide 2's statement is larger (74px) because it now lives on the page.

## Continuity

- **1 ↔ 4:** the same frame, the book grown.
- **1 → 2:** the push into the same page.
- **2 ↔ 6:** first lines ↔ the sentence the thinking produced.
- **5 → 6:** the decision note becomes prose; the selected Scene on 5 is the page that opens on 6.
- **Light carries across the 1→2 and 4→5 joins** in the swipe.

## Strongest and weakest

- **Strongest: 3.** Unchanged in idea, still the most legible and most "Sutura". **Close second: 4**, which moved from weakest to one of the clearest because of the rhyme with 1.
- **Weakest (pass 2): 5.** Pass 2.1 is the response. It still follows a left–right alternation (the brief's own suggested placement), but with unequal sizes and gaps, no labels, one arrow and a selected destination it reads as a board rather than a chart. Whether it is still the weakest is for review.

## For human judgment

1. **Slide 4.** Does the rhyme with slide 1 read as "it grew", or as a repeat? The alternative is a less legible wide view.
2. **Slide 5 (2.1):** whether the left–right alternation still feels like a zigzag; whether the four-line Scene preview is welcome or too much text; whether *Aphasia notes* earns its place.
3. ***Equal Temperament*:** the premise, the names (Porto, Portuguese diacritics) and the prose itself.
4. **Slide 2:** caret-to-statement spacing; the statement could sit closer to the prose.
5. **The wordmark on the cover** (still open from pass 1), and **"Early Access is open" vs "Early Access · Free"**.

## Pass 1, briefly (for the record)

- Pass 1 used *The Salt House* (the film's book).
- Its slide 4 was a whole window at 0.75×.
- Its slide 5 rearranged the film's Canvas.
- Its slide 2 split page and caption.
- Pass 1 renders were overwritten by pass 2; the source history is in this conversation, as nothing is committed.
