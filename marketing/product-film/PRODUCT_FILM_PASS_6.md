# Sutura product film: sixth (narrow) pass

**Status:** for human review. Not approved, not shippable.

**Runtime:** 40.27 s (was 39.33).
- +7 frames in the Canvas trail; everything after it moves by exactly 7 frames.
- The title card holds 0.7 s longer (brandHold 1.45 → 2.15 s, a follow-up request).

**Deliverables:**
- MP4s: `out/film/sutura-product-film-{1080p,540p}.mp4`.
- Strips: `product-film/film/strip-{film,opening,entry-canvas,canvas,ending}.png`.
- Stills: `product-film/film/pass6/*.png`.

## Opening

The writing chrome is away from frame 0 (`writing` = 1 until the climb). The tab band and breadcrumb are never seen, so no header fades after typing begins. The composition, the push, the typing and the navigator's film-only recession are unchanged.

## Entry → Canvas (K = 21.69)

- **Irrelevant Entry content is removed, not faded.** Every block disappears in one frame (21.967); only Elias's name and the Thomas/Ledger relationship persist.
- **One world.**
  - All three Sections appear together (+0.5).
  - The "Now" and "The hotel" cards resolve with the 1998 row (+1.70, which also covers the off-screen ones).
  - All lines draw before the camera opens (+2.1 / +2.2).
  - The pull to wide starts at +2.35 and overlaps the end of the medium pan (which runs to +2.6), so the camera never stops. Nothing is created after it begins: it only reveals.
  - Full Canvas at +4.5, then the same hold (0.95 s).
- **Unchanged:** total duration, semantic carriers and `OneIdentity` (Thomas single).

## Canvas trail

| Composition | Before | Now |
|---|---|---|
| B | 2.60× | 2.98× (+15%), centred on the Thomas → Ledger span |
| Trail point | 2.50× | 2.86× |
| C | 2.50× | 2.86× |
| D | 2.54× | 2.90× |

- The path shape and the 2 major direction changes are unchanged.
- The dive is 2.75 s → 2.98 s, so on-screen speed doesn't rise.
- The trail emphasis is unchanged.
- **Side effect:** the Scene card → manuscript morph starts from the tighter framing and converges to the same final shot.

## Ending

- The pull-back path is unchanged.
- **Before (pass 5):** a 0.30 s luminance + opacity dissolve, with frames at about 77% and 47% brightness.
- **Now:** full brightness until the window begins to go. Then it is removed in 4 frame-aligned steps with opacity 1 − u²: ≈94%, 75%, 44%, gone (37.567 → 37.667).
- **Measured:** the last frame at full brightness is 37.533; the first empty frame is 37.667.
- The empty stage is about 0.47 s, unchanged.

## Locked material

**Visually:** the passages before 21.69 differ from pass 5 only at encoder-noise level (mean ≤ 0.2), apart from the opening's chrome.

**Audio:**
- 0–29.9 s is bit-identical.
- After that, the audio is the same content 7 frames later. Its loudness envelope matches (median 0.35 dB); sample-level differences come only from AAC re-encoding at a new alignment.
