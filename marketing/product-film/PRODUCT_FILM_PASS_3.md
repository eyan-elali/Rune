# Sutura product film: third refinement pass

**Status:** for human review. Not approved, not shippable. Supersedes the timings in PRODUCT_FILM_FIRST_CUT.md (its sound/authenticity notes still apply except where changed below).

**Runtime:** 38.29 s (1920 × 1080, 30 fps). Renders: `out/film/sutura-product-film-{1080p,540p}.mp4`. Strips: `product-film/film/strip-{film,opening,thinking,entry-canvas,canvas,ending}.png`. Stills: `product-film/film/review/01–33`. `npm run film:cut` (`STRIPS=opening,… node scripts/film-cut.mjs --strips` for a subset).

## What changed

| Area | Now |
|---|---|
| Opening | Medium-wide first frame (s 1.40: navigator, chrome, manuscript centred). The push is under way from frame 0 and is close by ~1 s. The chrome recedes authentically (data-writing, 0.82–1.28 s). The navigator falls back to 68% (film-only) during the push and returns sharp for the lapse. |
| Growth | `film/growth.tsx`. The editor becomes a temporal layer: one continuous stream (Key Cabinet → Room 17 → June → Low Tide → The Inquest → What the Ledger Kept → The Cliff Path → Seventeen), revealed only above a fixed writing front (mask). It moves on one inertial curve (beta-shaped speed: peak 2.81 s), then 7 px of residual drift (3.87–4.49), then rest. Vertical blur σ = 0.16 × speed (column px/frame), capped at 11, zero below 0.8 px/frame. The navigator, count and status are never blurred. Rows arrive as the front reaches what they hold; the count climbs with the writing itself. No pointer from frame 0 until 4.86. |
| Rest → hand | Measured: still from ~4.47; the pointer appears 4.78, moves from 4.86, chrome returns, climbs to The Key Cabinet (click 5.60). |
| "mmh" | `src/audio/hum.wav`, **TEMPORARY HUMAN VOCAL PLACEHOLDER**. Starts 7.78, file 0.94 s, audible ~7.84–8.62 (voice ~0.6 s, then breath). |
| Entry → Canvas | 4.5 s (was 3.5). Ground first (21.30), then Thomas (21.74→22.74), Ledger (22.32→23.32), Mara (22.90→23.90), Elias (23.45–24.85), others (24.55), lines (24.85–25.50). Camera answers Thomas: opens 21.9–25.3. |
| Canvas | Canvas viewport 56% (all three Sections fit). A wide hold (≈0.85 s), then one Catmull-Rom path through four compositions, A → B → trail → C, then a small D drift. Off-trail cards and lines recede; trail lines take the app's hover strength. |
| Retreat | Camera first. The window stays at full brightness to 34% of frame width (36.27). It fades in ~0.2 s, the stage is empty ~0.37 s, and the brand arrives at 36.80. |

## Canvas compositions

- **A:** the whole window at s 1.22.
- **B:** the 1998 row (Thomas · 23:40 · Ledger · contradiction) at s 2.6, reached at 27.45 and passed through at a third of the speed.
- **C:** Plant it, low-left of centre, with the ledger and the trail behind it and the Scene card to the right. s 2.5, arrives 29.10.
- **D:** a small lean toward the Scene card (29.40–30.35).

## Still film-only (disclosed)

- The continuous stream: the app holds one Scene per editor.
- The navigator's recession during the push.
- The trail emphasis.
- Everything listed in PRODUCT_FILM_FIRST_CUT.md.
