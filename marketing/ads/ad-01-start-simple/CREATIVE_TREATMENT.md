# Sutura — Performance Ad #1: *Start simple*

**Status:** first cut, for creative review. Not approved. Not ready to spend money on.
**Format:** 9:16, 1080 × 1920, 30 fps. Made to work muted.
**Source:** `marketing/src/creatives/ad-01-start-simple/` · **Render:** `cd marketing && npm run ad:01`
**Book:** *Equal Temperament* (the carousel's novel, `creatives/carousel/content.ts`), with five short new passages written for the time-lapse (`content.ts` here). Never real writing.

---

## 1. Hypothesis

> Writers do not want to configure an entire writing system before they begin writing.

The ad tests one proposition and nothing else: **start with the manuscript; let the structure arrive when the book needs it.** No AI positioning, no Canvas explanation, no feature inventory, no revision workflow, no second value proposition.

## 2. Hook

> **You shouldn't have to build a system before you write.**

Set as three lines (*You shouldn't have to / build a system / before you write.*) so it reads at phone size; the wording is the brief's preferred line, unchanged. It is standing at frame 0, over a Sutura Project that is itself the evidence: one Chapter, a folded empty Workspace, a caret in the first lines.

The resolution is the same sentence answered in two steps, each landing on the visual that earns it:

> **Start simple.** — as the book begins to grow
> *Build outward when the book asks for it.* — as the Workspace is noticed

Close: **Sutura · Start writing free · writesutura.com · Early Access · Free.**

## 3. The signature transformation

**One frame, twice.** The ad opens and resolves on the *same* composition: the hook's slot on the ink stage above, the Sutura window hanging from the same left margin below (the carousel's cover and its slide 4, now continuous). Between the two the camera never cuts:

- **Open:** the window holds a Project that is *Manuscript → Chapter 1*. Nothing else.
- **Resolve:** the same window holds *Part One, Part Two, Chapters, Scenes, 58,420 words, Unplaced Scenes, Characters, Research, a Canvas*, and the Scene being revised.

The thing that changes between them is the **navigator as a spine**: the Chapter 1 row is the anchor object. It never leaves. *Part One* arrives above it and Chapter 1 steps one indent to the right — the first real structural act, done in place — and everything else grows *downward* from it while the manuscript column beside it streams months of prose through a fixed writing front. Structure and text move as one downward vector; the word count climbs with the writing.

So the conceptual transformation *Chapter 1 becomes a novel* is literally the Chapter 1 row acquiring a book beneath it.

## 4. Narrative shape and timing (seconds)

| Beat | Time | What happens |
|---|---|---|
| 1 · Almost nothing | 0.00–1.55 | Composition A. Hook standing. The writer is typing the end of Chapter 1's third paragraph at a natural pace. After 0.7 s of sustained typing the tab band, breadcrumb and actions fade (the app's own `data-writing`): Sutura gets out of the way. |
| 2 · Writing | 1.55–2.50 | The hook fades (gone by 1.78). The camera pushes into the prose until the page fills the frame; the last words land. |
| 3 · Time compresses | 2.25–4.98 | The editor becomes a temporal layer: the book's prose streams up through a fixed writing front, blurred only by its own speed (fast → long deceleration → 7 px of drift → still). The camera opens back to the medium framing; the navigator spine grows from Chapter 1 (Part One, Chapters, Scenes, Part Two) and the count climbs to 58,420. **"Start simple."** lands at 3.3, over the growing book. In the second half of the lapse, Characters, Research and the Canvas arrive at the foot of the spine: the writer added them as the book got complicated. |
| 4 · Substantial | 4.98–5.20 | Rest. The Flat A (Part Two · The Second Visit) is open; the chrome returns with the working set in the tab band (The Flat A · Rui Carvalho · Pitch, 1971 · Rui's piano). |
| 5 · The Workspace is noticed | 5.20–6.95 | **"Build outward when the book asks for it."** lands. The frame holds: the same corner as the opening, now a novel with a Workspace beneath it. No card flies in. |
| 6 · Return to writing | 6.95–9.20 | The copy leaves; the camera pushes into The Flat A's prose (the same close framing as beat 2). The writer types *"She took it off again."* The chrome leaves after 0.7 s. The caret holds. |
| 7 · CTA | 9.20–11.47 | The window recedes into the ink stage, light and whole, and is removed in four frames when small. Sutura. Start writing free. writesutura.com. Early Access · Free. |

Runtime 11.47 s (344 frames). Brand standing from ≈10.4 s.

## 5. Compositions

- **A · Simple Chapter 1 + hook** — ink stage, hook at the top (x = 88, y ≈ 280), the window's top-left corner at (88, 580) at 1.45× (near the carousel cover's 1.6×, pulled back a touch so the prose measure is not cut mid-word). Navigator: Manuscript 90 / Chapter 1 (selected) / Workspace folded. Tab, breadcrumb, "Chapter 1", the first lines, the caret.
- **B · Close prose** — the window full bleed, 2.25×: the paragraph being written with the caret, the navigator out of frame to the left. Prose 42 px on the 1080 frame → ~15 px on a phone.
- **C · Growth** — the window at 1.15×, top-left (88, 600 → 560): the navigator full height at the left as the spine; the streaming column beside it; "Start simple." in the slot above.
- **D · Substantial + Workspace** — the same framing, at rest: the whole book in the spine, the Workspace at its foot, the working set in the tabs, The Flat A in the editor; the second line in the slot.
- **E · Return** — composition B again, on The Flat A; the writer types.
- **F · CTA** — the window receding to ~30% width, gone; the wordmark and the three lines centred in the platform's clear zone.

## 6. The vertical frame

The 9:16 frame is used as a **column**: copy above, product below; inside the product, the navigator is a tall spine on the left and the manuscript a tall narrow column on the right (the shell is drawn at a narrow 720-px logical window, 1,500 px tall — a real layout state the app's narrow-container rules produce — so the prose measure is tall rather than wide). Growth travels **down** the spine and **up** through the column. Nothing is the desktop app scaled to fit.

Platform safe zones (`foundation/formats.ts`: top 250, bottom 440, right 140): all copy sits in y 280–560; the CTA block is centred at y ≈ 880; the spine's Workspace rows end near y ≈ 1,470.

## 7. Prompt Motion techniques used

- **Semantic object persistence:** the Chapter 1 row is one element from first frame to resolution; it changes depth in place (fractional `depth`) when Part One arrives.
- **Temporary temporal layer:** the editor column streams the book through a fixed writing front (a mask in the column's own coordinates), with **speed-proportional vertical blur**, on one inertial curve (accelerate → peak → long tail → drift → rest). Months in three seconds, never a scroll, never Scene-switching, no pointer.
- **Authored camera path:** medium → close → medium (opening slightly as the project gains scale, drifting down with the growth) → close → recede. Six moves, no punch, no whip.
- **Environment changed in place:** the chrome leaves and returns by the app's own `data-writing` rules, drawn frame by frame.
- **Shared frame:** compositions A and D are the same geometry, so the eye compares.
- **Non-literal time compression** that resolves into an authentic product state at rest.

Not used: particles, glow, 3D, morphing cards, FLIP of Workspace objects (they would read as Sutura building the Workspace), clicks.

## 8. Authentic vs film-only

**Authentic product states** (the app's own markup and `rune2.css`, only the data invented):
- the new Project exactly as `create_project_checked` makes it (Manuscript → Chapter 1, Workspace folded while empty);
- the writing chrome receding after 0.7 s of typing and returning when the writer reaches for the interface;
- the finished navigator (two Parts, nine Chapters, Scenes, 58,420 words, Unplaced Scenes folded at 2,000, Characters, a Research folder with two Pages, the Canvas *Rui's piano*);
- The Flat A open with its tab, breadcrumb and status;
- typing, the caret, "Saving… / Saved".

**Film-only choreography:**
- the time compression (stream, writing front, speed blur, rows arriving on the front's own clock, the count climbing);
- Chapter 1's indent move (the real app re-parents in one frame);
- the chrome's return at rest without a visible pointer (in the app a pointer movement brings it back; the pointer is off-frame);
- the camera; the window receding into the stage; the copy.

**Approximations to flag:** the tab band at rest shows four tabs the writer opened off-screen; Chapters after The Flat A (Tea, Beats, Viola, Equal Temperament) arrive in the lapse's tail as rows although the stream does not pass through their prose (a writer laying out chapters ahead); the lapse implies chronological drafting that no one would audit.

## 9. Sound

No music. The ad works muted.

| Time | Sound |
|---|---|
| 0.2–2.1 | Real keystrokes (the approved CC0 recording, `src/audio/typing-real/`) on each character typed |
| 2.4–4.7 | The same keys as a compressed texture, dense at the lapse's peak, thinning with its deceleration, silent before the page is still |
| 4.98 | One quiet felt settle (`settle.wav`) as the page comes to rest |
| 7.45–8.9 | Real keystrokes, ~4 dB under the opening (measured RMS −34.6 vs −30.5 dBFS) |
| 10.4 | One quiet tonal resolve under the wordmark (`resolve.wav` at 0.09, about −10 dB from the film's level) — optional, remove if it reads as a sting |

No clicks (there is no pointer), no whoosh, no sheet, no riser.

## 10. Why this should work as an ad

- The first frame is the whole argument: a plain Project, a caret, and a sentence that names the objection.
- The contrast is made by *one* object growing, not by the interface changing: it reads as "the book grew".
- The Workspace is a consequence, found at the foot of the spine after the book is big, with the line that explains it. Nothing is sold feature by feature.
- It ends on writing, so the product's role is unmistakable: the tool serves the book.
- Every surface is the real product, so the landing page delivers what the ad showed.
