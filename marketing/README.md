# Sutura marketing renders

Launch creatives drawn from the real Sutura shell, rendered with Remotion.
Isolated from the app: its own package and lockfile, excluded from the app's
`tsconfig.json`; nothing in `src/` imports it.

```bash
cd marketing && npm install
npm run studio          # preview: every composition, scrubbable timeline
npm run render:a        # out/creative-a-1080x1920.mp4 (9:16, with sound)
npm run render:a-feed   # out/creative-a-1080x1350.mp4
npm run still:a         # out/creative-a-1080x1920.png (end frame)
npm run stills:a        # out/stills/: the 9:16 cut's review frames
npm run film:storyboard # the product film's 14 keyframes + contact sheet (product-film/)
npm run film:cut        # the film's first complete cut: out/film/*.mp4 + product-film/film/ (strips, review frames)
npm run film:studies    # its motion studies: out/studies/*.mp4 + product-film/studies/*-strip.png
npm run film:studies -- BV2 D --strip-only   # chosen studies (A B C AV2 BV2 CV2 D), strips only
node scripts/film-frames.mjs ProductFilmStudyBV2 out/review 0.9 1.4 2.9   # full-size review stills
npm run audio           # regenerate src/audio/*.wav (synthesised, deterministic)
npm run measure:a -- 0 200   # where the 9:16 shell puts things, for geometry.ts
node scripts/stills.mjs CreativeA-Vertical out/stills 0 120 300   # contact sheet
```

## How it is built

- `src/foundation/` — formats and safe zones, frame-pure timing (`time.ts`),
  bundled fonts, the `.r2` stage (the app's `rune2.css` + `buildThemeCss()`),
  captions, the shot (a crop of the app, scaled), cursor, end frame.
- `src/ui/` — the shell drawn with the app's own markup and classes:
  navigator, tab band, context bar, manuscript surface, Collection table.
- `src/data/hollow.ts` — the fictional demo book. Never real writing.
- `src/creatives/<name>/` — a creative's script (timings, in seconds),
  per-format layout, and composition. Creative A's 9:16 cut has its own
  folder (`creative-a/vertical/`): made for a phone, it treats the shell as
  footage — `foundation/Camera.tsx` crops into it and moves between regions
  (`geometry.ts` says where they are, read with `npm run measure:a`) — and
  carries a cue sheet of sound (`Soundtrack.tsx`). The 4:5 cut is still
  `creative-a/CreativeA.tsx`.

The product film (`src/creatives/product-film/`) has a first complete cut,
`SuturaProductFilm` (`film/`: one clock in `timeline.ts`, five sequences,
notes in `PRODUCT_FILM_FIRST_CUT.md`). `PRODUCT_FILM_STORYBOARD.md` holds its authentic product states, and
`MOTION_LANGUAGE_EXPLORATION.md` the motion language and its studies
(`studies/`: the first pass `ProductFilmStudyA|B|C`; the final pass
`ProductFilmStudyAV2|BV2|CV2|D` — each also `-Annotated`, which labels every
moment AUTHENTIC PRODUCT STATE or FILM-ONLY TRANSITION, and `-Strip`).
Studies measure the real states they connect (`studies/probe.tsx`) instead
of hand-placing coordinates; everything film-only lives in `studies/Carrier.tsx`;
`studies/layers.tsx` splits a state into its environment (changed in place)
and its document (resolved in reading order).

Every frame is a function of the frame number: CSS transitions/animations are
off on the stage, there is no clock and no unseeded randomness.

## Sound

Every creative works muted. The 9:16 cut lays a cue sheet under the picture
(keystrokes, navigator ticks, clicks, camera moves, air over the Canvas, a
bed). Every sound is synthesised by `scripts/synth-audio.mjs` — no samples,
no downloads, nothing to license. The bed (`bed-placeholder.wav`) is a
placeholder for timing review only: pass a licensed track as `music` to
`CreativeAVertical` before release. The 4:5 cut takes an optional
`soundtrack` (a file in `public/`).

Remotion's license is free for individuals and companies of up to three
people; larger teams need a company license (remotion.dev/license).
