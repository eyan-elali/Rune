# Sutura product film: fourth (focused) pass

**Status:** for human review. Not approved, not shippable.

**Runtime:** 39.33 s (1920 × 1080, 30 fps).
- Renders: `out/film/sutura-product-film-{1080p,540p}.mp4`.
- Strips: `product-film/film/strip-{film,opening,thinking,entry-canvas,canvas,ending}.png`.
- Entry → Canvas midpoint: `product-film/film/entry-canvas-midpoint.png`.
- Stills: `review/01–37`.

**Unchanged:** everything outside the items below. That includes the time-lapse core, B, the Canvas trail and the brand.

## Opening

- The writer types " long" → "after there was any reason to." (30 characters) at normal speed, from 0.12 to about 2.06 s.
- The push settles by 1.25 s. Measured, the camera is then still while the writer types (1.30–2.03).
- The lapse now begins at 2.22 (was 1.72), and the camera starts opening at 2.02, on the line's last words.
- That adds 0.5 s of normal time. The rest point moves to 4.99.

## Thinking

| Event | Time |
|---|---|
| Tick 1 | 7.34 (measured 7.37) |
| Tick 2 | 8.04 (measured 8.07) |
| Voice audible | ≈8.65 |
| Voice gone | ≈9.15 (breath to ≈9.3) |
| Hand moves | 9.51 |
| Revision Notes | 9.95 |

- The ticks are now 0.70 s apart (was 0.54).
- The voice starts 0.61 s after tick 2, which is about 0.45 s of silence after the tick's own sound (was about 0.24).
- After the voice there is about 0.36 s of quiet before the hand moves.

## Voice

**Asset:** `src/audio/voice-mmh.wav`.
- Source: the voice memo `out/film/1210 Boul de Maisonneuve Ouest 5.m4a`, copied unchanged as `product-film/audio-source/voice-memo-mmh-raw.m4a`. The copy has a neutral name and the file has no location tags.
- The memo holds one take, so no take selection was needed.

**Cut:** memo 1.20–2.06 s (0.86 s).
- The voiced "mm" is 1.35–1.85, with pitch falling from about 144 to 87 Hz.
- The cut includes the breath on either side.

**Processing:**
- Mono.
- 2nd-order high-pass at 60 Hz, which removes room rumble and leaves the 87 Hz fundamental untouched.
- 30 ms in / 150 ms out raised-cosine fades.
- Gain only.
- No EQ shaping, denoise, compression, pitch or time change.

**Mix:** cue volume 0.14. Measured −38.3 dBFS RMS, about 10 dB under the typing (−28.5) and 15 dB under a tick.

The synthesized `hum.wav` is no longer used.

## Resolving piano tone (`src/audio/resolve.wav`, at the full-window reveal, 14.35 s)

**Before:** the film cut the cue at 2.43 s while the chord was still at about −20 dB, an audible stop.

**Now:**
- The file runs to 3.6 s, and its first 2.35 s are sample-identical to before.
- After that, the notes continue with their own decay (piano partials, as synthesized) under a Gaussian release, σ ≈ 0.42 s.
- It falls to −60 dB at 3.2 s and −82 dB at 3.4 s.
- The cue plays the whole file.

**Method:** source decay plus a gain envelope; no reverb.

## Entry → Canvas (rebuilt; 21.69 → 26.19, 4.5 s)

1. **The click (+0.06):** the chrome changes in place.
2. **The ground (+0.22–1.52):** the Canvas's dotted ground grows from "Thomas Vale" behind a soft circular boundary, 190 px feather. The Entry is never dimmed as a layer: each block disappears wholly, in 0.11 s, when the boundary reaches it.
3. **Three objects lift as the ground passes them:**
   - Thomas (+0.52), Ledger (+0.70) and Elias's title (+0.80).
   - Each gathers a card surface around itself and lands in its real place in the "14 November 1998" Section.
   - The camera, at medium scale, pans to that Section (+0.70–2.40).
4. **The destination:**
   - The Canvas title and tools arrive (+0.70) and the Section frame forms (+0.86).
   - The rest of the row resolves (+1.45): 23:40 first, then the contradiction, "Who was in seventeen?" and Clara.
   - The row's lines draw (+2.20–2.70).
5. **Wide (+2.90–4.50):** the camera opens to composition A. "Now" and "The hotel" resolve as they come into frame, then their lines.
6. **Hold:** 0.95 s, then the dive (unchanged).

**Mara is not carried.** She appears in her Section when the camera goes wide.

**Midpoint (23.94):** the whole 1998 Section composed, every card legible, the first relationship drawing.

## Disappearance

- The pull-back path is unchanged. The fade starts at 37% of frame width (was 34%).
- Over 0.6 s the window keeps its own shape: two soft-edged masks, across and down, close its edges and chrome inward toward the manuscript. Then the page's light goes quickly.
- **Measured:**
  - full brightness to 33% width (37.10);
  - edges absorbed 37.10–37.23 with the centre still white;
  - core gone 37.27–37.40;
  - empty stage about 0.46 s;
  - brand at 37.89.
