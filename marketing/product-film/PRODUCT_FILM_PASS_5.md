# Sutura product film: fifth (narrow) pass

**Status:** for human review. Not approved, not shippable.

**Runtime:** 39.33 s, unchanged.

**Changed:** only the first second of Entry → Canvas, the Thomas/Ledger/Elias label hand-off, and the last ~0.2 s of the disappearance.

**Deliverables:**
- MP4s: `out/film/sutura-product-film-{1080p,540p}.mp4`.
- Strips: `product-film/film/strip-{film,entry-canvas,ending}.png` (Entry → Canvas every ≈0.12 s, ending every ≈0.09 s).
- Stills: `product-film/film/pass5/*.png`.

## Entry → Canvas, first second (K = 21.69)

**Removed:** the spreading circular boundary.

**Now:**

| Time | What happens |
|---|---|
| +0.12 / +0.20 | The relationship lifts: Thomas Vale (the anchor), then the 1998 Guest Ledger, each gathering a card surface where it stands in "Connected to". |
| +0.26 (≈0.18 s) | The page lets go of every other block in one short breath (≈3–4 partial frames). No stagger shape, no translucent page. |
| +0.38 | The Canvas surface (its faint dots) comes up evenly beneath. |
| +0.50 / +0.55 | The Section and the Canvas title begin forming. |
| +0.52 | Thomas leaves for his card, as before. |

**Unchanged:** everything from +0.52 on (carriers, medium pan, row, lines, the wide pull at +2.9, the hold) and the total duration.

**One identity:** `OneIdentity` in seq4 draws a single text run per object.
- Its colour leaves the link accent and its underline fades while still in link type (p 0.06–0.40).
- At p = 0.5, mid-flight, at matched size and place, it takes the card's type in one frame. Thomas swaps at 22.567.
- Applied to Thomas, Ledger and Elias.

## Disappearance

- **Path:** the pull-back is unchanged.
- **Start:** 30.5% of frame width (FADE_AT 37.206). It is visibly fully bright through 37.27.
- **Method (0.30 s, `Absorb` in seq5):**
  - the whole window's luminance eases down 38% first;
  - opacity follows late;
  - the edges soften by about 5% of the window size.
  - The rectangle keeps its shape; there is no core, aperture or oval.
- **Measured:** dimming 37.30–37.40, gone at 37.433, brand begins at 37.90. The empty stage lasts 0.47 s (pass 4: 0.46).

## Locked material

**Verified against pass 4.** Locked passages differ only at H.264 encoder-noise level: mean 0.2–0.4 of 255, max pixel ≤ 30.

**Side effect:** the audio differs only between 21.9 and 24.2 s. The soft "air" cue tied to this transition now starts 0.16 s later (at +0.38, with the Canvas surface). The voice and the piano are bit-identical.
