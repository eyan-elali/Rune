# Sutura — Performance Ad #1, Variant B: *Structure emerges from the writing*

**Status:** experiment, first cut, for A/B review against the Control. Not approved. Not ready to spend money on.
**Control:** `Ad01StartSimple` (`marketing/ads/ad-01-start-simple/`), untouched and reproducible (`npm run ad:01`).
**Variant B:** `Ad01StartSimpleVariantB` (`marketing/src/creatives/ad-01-start-simple-variant-b/`), rendered by `npm run ad:01b` into this folder.
**Format:** 9:16, 1080 × 1920, 30 fps. Works muted. Same book (*Equal Temperament*), same hook, same close.

---

## 1. What Variant B is testing

The Control proves **the book grew**. At phone size its Workspace rows (Characters, Research, the Canvas) are too small to say *why* a Workspace exists, so the Control risks reading as "watch a manuscript become long".

Variant B tests the fuller proposition:

> You start with the writing. The book creates new needs. You give those needs structure.

So the middle must show *both*: the manuscript becoming substantial **and** the surrounding structure gaining meaningful content, visibly derived from the writing.

## 2. How it differs from the Control

| | Control | Variant B |
|---|---|---|
| Opening (0–2.25 s) | hook, Chapter 1, typing, chrome leaves, push | **identical** (same timeline values, same schedules, same sound) |
| Book growth | temporal stream, spine from Chapter 1, count climbs | **same mechanism**; the Upright's Scenes stay folded so the spine fits at a larger scale |
| Product scale in the middle | 1.15×, window top at 560–600 | **1.22×, window top at 440–470**: the product is larger and higher |
| Workspace during the lapse | rows arrive in the navigator mid-lapse (too small to read) | **none**. The Workspace stays folded and empty while the book is written |
| New: thought-objects | — | **three** loosen from the page while their passage is written and rest beside it: *Character · Rui Carvalho*, *Research · Pitch, 1971*, *Note · Why has he kept the A flat?* |
| New: organisation moment | — | once the page is still and the chrome has returned, the writer puts them away one at a time (0.3 s apart, 0.72 s each): each travels to the navigator and **becomes its row** (surface shrinks to the row, title carries into the label's type, the row opens beneath it, the folder arrives a breath before) |
| Middle copy | "Start simple." (3.3 s) + "Build outward when the book asks for it." (5.2 s) | **no "Start simple."**; only "Build outward when / the book asks for it." (5.9 s), larger (62 px) |
| Return, retreat, CTA | | **identical in kind**; shifted later by the organisation beat |
| Runtime | 11.47 s | ≈ 11.6 s |
| Sound | real keys, lapse texture, settle, resolve | **same cues**; the thoughts travel and dock in silence |

## 3. The three objects and where they live

Each is one real Workspace object: a **Page**. (Collection Entries are not navigator rows in Sutura, so Rui is a Page in a *Characters* folder, a structure a writer genuinely builds; the eyebrow is what the writer would call it, the title is the Page's title, the destination is its row.)

| Object | Eyebrow | Loosens while writing | Rests | Becomes |
|---|---|---|---|---|
| Rui Carvalho | Character | *Dust Cover* (the first chapter in his flat) | upper right, on the stage beside the page | Workspace › Characters › **Rui Carvalho** |
| Pitch, 1971 | Research | *The Hall* (the orchestra, the organ's pitch) | mid right, over the page's edge | Workspace › Research › **Pitch, 1971** |
| Why has he kept the A flat? | Note | *The Flat A* (the question the Scene raises) | lower right | Workspace › **Why has he kept the A flat?** (a Page) |

They are also the working set: the tab band shows *Rui Carvalho* and *Pitch, 1971* open beside *The Flat A* once they are put away.

## 4. Why the emerging-object idea may improve comprehension

- The viewer sees three **legible** things (30 px titles, ≈ 11 px on a phone) come out of the writing, not a texture of tiny rows.
- Their **order** is the book's order: character, then research, then a question. The complexity is narrative, not taxonomic.
- Their **destination** is the same word in the navigator: "the same thing found its place". The Workspace is explained by continuity, without a label.
- The line "Build outward when the book asks for it." lands as the last one is put away, so copy and picture say one thing.

## 5. The risk: implying AI / automation

The literal reading of "information comes out of the writing" is entity extraction. If a name appeared in prose and flew into a sidebar, Sutura would look like it reads manuscripts. That contradicts the product promise and the brand.

## 6. How the risk is handled

- **No text leaves the prose.** The objects do not lift a word off the page. They appear *over* the column, at the writing front, as a small light surface already carrying the writer's own title (a Page title, not a quotation), while the prose beneath is a moving texture. Nothing is highlighted, selected or scanned.
- **Writer-time, not instant.** They loosen during the lapse (months), with inertia (0.8 s, CARRY ease), and then *wait*: unresolved, beside the book, for the rest of the writing. Nothing happens to them while the book is being written.
- **Organisation is deliberate and sequential.** It begins only after the page is still and the chrome has returned (the writer reached for the interface), one object at a time, each on its own 0.72 s move, with its folder arriving a breath before it. That is a person filing, not a system sorting.
- **Containers are made, not generated.** The Workspace stays folded and empty until the first thing is put in it; Characters and Research folders appear as the writer needs them.
- **No sound on the objects.** No whoosh, pop or dock plink: nothing announces the software doing something.
- **Nothing is written for the writer.** The return typing is the writer's, as in the Control.

If the film-time abstraction still reads as automation, the lever is timing: a longer wait between rest and the first put-away, or a longer gap between objects.

## 7. Compositions (vertical)

- **A, B** — the Control's.
- **C · Growth with thoughts** — the window at 1.22×, top at 470, the navigator spine on the left, the stream beside it; the thoughts rest in a loose column on the right, straddling the page's edge and the stage (x 606–1000, y 310–1250), never a tidy stack.
- **D · Put away** — the window at 1.22×, top at 440; the objects travel down-left into the Workspace at the foot of the spine (rows between y ≈ 1,150 and 1,330, inside the phone's clear zone); the copy line in the slot above.
- **E, F** — the Control's.

## 8. Authentic vs film-only

**Authentic:** everything the Control lists, plus the final Workspace (two folders, three Pages) and the working set in the tabs.
**Film-only:** the thought-objects themselves (surrogates of the three Pages), their release, rest and travel; the title carrying into the row label; the chrome's return without a visible pointer; the temporal stream; the camera.

## 9. Sound

The Control's cue sheet, unchanged in kind: real keystrokes (0.2–2.1), the lapse texture (2.4–4.6), one settle at rest (4.85), the return typing (7.65–9.0), one quiet resolve at the brand (0.09). The organisation moment is silent.
