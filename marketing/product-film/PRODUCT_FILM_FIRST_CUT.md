# Sutura product film: refined cut

**Status:** the second pass on the first complete cut, for human review. It is not approved and not shippable.

**Composition:** `SuturaProductFilm`.
- Also `-Annotated`, which labels every moment AUTHENTIC or FILM-ONLY.
- Strips: `-Strip-film`, `-Strip-growth`, `-Strip-canvas`, `-Strip-ending`.

**Format:** 1920 × 1080, 30 fps, **34.6 s**. No music and no voiceover.

**Source:** `marketing/src/creatives/product-film/film/`
- `timeline.ts` is the event grid.
- `seq1.tsx` to `seq5.tsx` are the five sequences.
- `states.tsx` holds the authentic states and probes.
- `common.tsx` holds the writing chrome.
- `Film.tsx` holds the cue sheet, the phases and the compositions.

**Render:** `npm run film:cut` produces:
- `out/film/sutura-product-film-1080p.mp4` and a 540p review copy;
- `product-film/film/strip-{film,growth,canvas,ending}.png` (`film` is one frame per second);
- `product-film/film/review/*.png` (22 named stills).

## The story, as the film now tells it

1. The writer writes, and the book grows to 51,996 words.
2. The writer returns to revise The Key Cabinet and stops at one line: *tick… tick… "hm"*.
3. Revision Notes, then the Inspector, then the ledger: key 17 went out at 23:40, signed T.V., to a room recorded as "vacant". Who was in seventeen?
4. Elias's Entry: *"Dad gave him the key."* Thomas Vale is Dad, and Dad is T.V.
5. The writer deliberately opens *The Night of the Fire* Canvas and lays it out. The conclusion: *"Plant it: pencil under hook 17. Her father's initials."*
6. Back to the Scene, where the writer types it. Sutura recedes. Sutura.

## Timeline (seconds)

| # | Sequence | Time | Beats |
|---|---|---|---|
| 1 | The book grows | 0.0–5.9 | Typing ends the line. A drift to the navigator. The lapse (1.85–4.0): the navigator holds still while rows arrive and the count climbs, and the editor writes three Chapters, filling and scrolling. The pointer moves (the chrome returns) and climbs to The Key Cabinet (click 4.86). A horizontal move to the writer's view. |
| 2 | The writer thinks | 5.9–10.1 | **Tick 6.10 · tick 6.64 · "hm" 6.94 (0.4 s) · Revision Notes click 7.86.** The shared highlight follows (8.24). The Inspector opens (9.02), is scrolled to Research, and attention narrows on 1998 Guest Ledger. |
| 3 | The world opens | 10.1–15.4 | ⌘-click (10.14): identity expansion. The Page resolves beneath its travelling title. The wide reveal arrives at 12.26 with the resolving tone. Then the close read: 23:40, T.V. → the contradiction → "in seventeen". Back out to the navigator: Characters (15.38). |
| 4 | The thinking space | 15.4–26.8 | The Board opens wide, and the camera moves to Missing and Elias (click 16.68). The card becomes the Entry, which forms around it at once. The writer selects *"Dad gave him the key"*, rests on Thomas Vale, then goes to the navigator: The Night of the Fire (click 19.60). Entry → Canvas follows in phases (below). The wide view holds, then one pan (23.92–26.27) to "Plant it". The pointer rests there, then follows its arrow to the Scene card (click 26.82). |
| 5 | Back to the book | 26.8–34.6 | The card opens into the Scene. The caret holds at "Seventeen was empty." for 0.3 s. The writer types (28.3–30.9) while the chrome leaves. The retreat: the window stays light while it shrinks and goes only at the end. Then Sutura (32.7). |

### Entry → Canvas (from the click at 19.60)

1. **The Entry holds** (+0–0.25). The chrome changes in place.
2. **One at a time** (+0.25–2.0). **Thomas** leaves first, then **the 1998 Guest Ledger**, the two that motivated the Canvas, then Mara. They leave 0.42 s apart, and no paths cross.
3. **The Canvas comes through** (from +0.7). Its grid and Sections emerge under the thinning Entry, to about a third, so the cards land on a space rather than floating over a ghosted page.
4. **The page becomes Elias's card** (+1.6–2.8, 1.2 s). The Canvas's title and tools arrive with it.
5. **Once all four have landed:** the other cards (+2.75), then the connections (+2.9–3.5).
6. **The wide view holds** for about 0.8 s, still.

### The Canvas camera

- **Removed:** the line-following thread (ledger → contradiction → plant → Scene, a 5-station spline).
- **Now:** a wide hold, then **one** quadratic move over 2.35 s with one ease and an even arc-length pace. It leans into the 1998 row (Thomas, 23:40, the ledger) as the frame tightens from 1.55× to 2.25×, then carries on, right and down, to land beside "Plant it" and the Scene card.
- **No reversals, no stops.** The pan's per-second motion energy is about half that of the previous cut's thread.

## What changed in this pass

- **Opening growth.** The camera holds still on the whole navigator, so the accumulation stays readable:
  - the count climbs, and Part I fills;
  - Part II appears and fills;
  - the Research Pages, the Unplaced Scenes and the Canvas arrive.

  The editor changes Chapter **3 times** (Low Tide, What the Ledger Kept, Seventeen) instead of 7, and each fills and scrolls as it is written. The selection moves with it. The tab and breadcrumb stay hidden throughout, because the writer is writing.
- **The "hm".** One human sound, after the second tick, with silence on both sides.
- **The writing chrome**, which is authentic (below), wherever manuscript writing happens.
- **Inspector trimmed:** a shorter Notes read (0.9 s), a 0.55 s scroll, and a click sooner.
- **The B transition.** The Page's body and eyebrow now resolve 0.2 s sooner, under the still-travelling title (eyebrow +0.44, body +0.40, the old prose clearing from +0.36). The near-empty white phase is gone.
- **Board → Entry.** Labels start 0.27 s sooner and the notes 0.4 s sooner, and the Board recedes in 0.22 s. The card is never alone in white space. The values the card does not carry still wait until the carried words have passed through their rows.
- **The Entry's purpose.** The writer selects "Dad gave him the key", rests on Thomas Vale, and only then goes to the navigator. The Canvas is opened because of what was read.
- **Revision Note wording:** "Seed why Mara recognizes the room number earlier." (`salt-house.ts`).
- **The retreat.** The camera pulls back to the reveal's wide (1.1 s), then recedes to two-thirds of that size. The window stays light and whole the whole way. It fades only from +1.2 s, over 0.4 s, when small. Then the brand, in a tighter stagger.

## The human sound

`src/audio/hum.wav` (0.46 s) is generated by `scripts/synth-audio.mjs` → `hum()`.
- **The voice:** a closed-mouth "hm" on a glottal pulse train, with jitter and shimmer so it is not a pure tone.
- **Pitch:** about 176 Hz falling about 2 semitones.
- **Nasal colour:** a strong resonance near 270 Hz, faint ones near 1.3 and 2.4 kHz (about 97% of the energy is below 600 Hz).
- **Envelope:** a 50 ms nasal breath before the voice and a dry, unfinished release.
- **Level:** −29 dBFS in the mix, about 7 dB under a keystroke's peak.

**It is a placeholder.** Nobody has listened to it: it was checked only by measurement, which cannot judge whether it sounds human. Before release, replace it with a real recorded "hm" (one take, close-miked, 0.3–0.45 s, same timing). If it reads as synthetic or acted, remove it rather than push it.

## The writing chrome is authentic

The app has this behaviour: `useWritingChrome` together with rune2.css `.r2-shell[data-writing]`.
- **When it starts.** After 700 ms of sustained typing in prose, the tab band takes the writing surface and loses its hairline, the tabs, breadcrumb and actions fade to nothing over 460 ms, and the status drops to half. Nothing moves.
- **When it ends.** A pointer movement of 14 px or more, a press, Escape/Tab, or focus leaving the prose brings everything back in 200 ms.

The film draws exactly that, frame by frame (`writingCss`):
- In the opening, the chrome is already away (the writer has been writing). It stays away through the lapse and returns when the hand moves for the climb.
- On the return, it leaves 0.7 s after typing begins.
- During the retreat it stays away, because nothing reaches for the interface.

**Stopping typing alone does not bring the chrome back**, in the app or in the film.

## Sound map

| Time | Sound |
|---|---|
| 0.2–1.6 | Typing |
| 1.9–4.0 | Soft compressed typing and sparse row ticks |
| 4.86 | Click |
| 6.10 / 6.64 | Tick, tick |
| 6.94 | "hm" |
| 7.86 | Click, then a soft panel brush |
| 9.02 | Click |
| 10.14 | ⌘-click, then one very quiet spatial texture |
| 12.26 | The resolving tone |
| 15.38 / 16.68 | Clicks |
| 17.8 | Settle |
| 19.60 | Click |
| 20.3 | One soft spatial opening, very low |
| 22.4–26.8 | **Silence** across the wide hold and the pan |
| 26.82 | Click on the Scene card |
| 28.0 | Quiet settle |
| 28.3–30.9 | Typing |
| 31.3 to the end | Silence |

**Typing balance.** The closing typing was lowered about 3.4 dB. Measured: opening RMS −28.4 dBFS, closing −28.5. Per keystroke, the closing peaks are 1.5 dB softer.

## Authenticity approximations

1. **The lapse** (rows revealed, three Chapters written at an impossible rate).
2. **The caret position** on opening a Scene.
3. **Revision Notes → Inspector** as a 0.16 s fade.
4. **Hover and press states** are held for the film.
5. **An arrow pointer over editable text.** The real one is an I-beam, including while selecting "Dad gave him the key".
6. **The Canvas card click** opens the Scene the first tab already holds.

## Film-only choreography

- The ink steps and the leans on the ticks, and the shared highlight.
- **Inspector → Research Page:** the travelling title and pill, the column resolving, and the Scene lit in three places.
- **Board card → Entry:** the card's values and surface carrying into the Entry.
- **Entry → Canvas:**
  - the chips;
  - the Canvas emerging under the Entry;
  - the page contracting into Elias's card;
  - the staged Canvas, and the lines drawing.
- **Canvas Scene card → Scene:** the card opening into the Scene.
- The window receding into the stage.

**The writer types every new word.** Only "Seventeen was empty." is ever carried into the prose, and that line is already the writer's.

## QC

- **Frame differences.** Spikes appear only at deliberate cuts on action (the clicks on The Key Cabinet and Characters) and at one line wrap while typing.
- **Sound.** Every cue's onset sits on its event.
- **Silence** holds in four places:
  - the thinking beat (4.96–6.14);
  - after the "hm" (7.41–7.87);
  - across the Canvas (22.4–26.8);
  - after the last key (31.35 to the end).
- **These checks were made on rendered frames and signal analysis.** A person still needs to watch and listen in real time, especially for the "hm".
