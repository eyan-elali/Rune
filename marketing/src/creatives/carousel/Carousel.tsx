import { Composition, useCurrentFrame } from "remotion";
import { FPS } from "../../foundation/formats";
import { Stage } from "../../foundation/Stage";
import { STAGE_INK } from "../product-film/ProductFilmStoryboard";
import { SLIDE } from "./kit";
import { SLIDES } from "./Slides";

// The Instagram carousel (marketing/carousel/CAROUSEL_CREATIVE_DIRECTION.md):
// six 1080×1350 stills on the film's stage — Sutura's Dark page, a step
// deeper, a breath of its ink blue — with the light product inside it.
// Frame n of Carousel-Slides is slide n + 1 (npm run carousel renders them).

const DARK = { theme: "dark", surface: "theme", accent: "blue" } as const;

function SlideAt({ i }: { i: number }) {
  const { Slide } = SLIDES[i];
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: SLIDE.width, height: SLIDE.height, overflow: "hidden", background: STAGE_INK }}>
      <Slide />
    </div>
  );
}

export function CarouselSlides() {
  const frame = useCurrentFrame();
  return (
    <Stage appearance={DARK} background={STAGE_INK}>
      <SlideAt i={Math.min(frame, SLIDES.length - 1)} />
    </Stage>
  );
}

// ── Review sheets ──────────────────────────────────────────────────────────

const SHEET_SCALE = 0.42;
const SW = SLIDE.width * SHEET_SCALE;
const SH = SLIDE.height * SHEET_SCALE;
const GAP = 28;
const PAD = 72;

export const CONTACT = { width: PAD * 2 + 3 * SW + 2 * GAP, height: PAD * 2 + 92 + 2 * (SH + 64) + GAP } as const;

function Thumb({ i, scale }: { i: number; scale: number }) {
  return (
    <div style={{ position: "relative", width: SLIDE.width * scale, height: SLIDE.height * scale, overflow: "hidden", boxShadow: "0 0 0 1px rgba(var(--r2-palette-ink) / 0.16)" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: SLIDE.width, height: SLIDE.height, transform: `scale(${scale})`, transformOrigin: "0 0" }}>
        <SlideAt i={i} />
      </div>
    </div>
  );
}

/** All six in order, three by two, numbered. */
export function CarouselContactSheet() {
  return (
    <Stage appearance={DARK} background="var(--r2-page-bg)">
      <div style={{ position: "absolute", inset: 0, padding: PAD, fontFamily: "var(--r2-font-ui)" }}>
        <header style={{ display: "flex", alignItems: "baseline", gap: 24, height: 92 }}>
          <h1 style={{ fontFamily: "var(--r2-prose-font)", fontSize: 40, fontWeight: 400, color: "var(--r2-ink-1)" }}>Sutura — Instagram carousel</h1>
          <p style={{ fontSize: 18, color: "var(--r2-ink-3)" }}>Composition pass 2.1 (slide 5 revised) · Equal Temperament · six slides · 1080 × 1350 · for review</p>
        </header>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(3, ${SW}px)`, columnGap: GAP, rowGap: GAP }}>
          {SLIDES.map((s, i) => (
            <figure key={s.id}>
              <Thumb i={i} scale={SHEET_SCALE} />
              <figcaption style={{ display: "flex", gap: 12, alignItems: "baseline", marginTop: 14, height: 36 }}>
                <span style={{ fontSize: 20, fontWeight: 600, color: "var(--r2-ink-1)" }}>{String(s.n).padStart(2, "0")}</span>
                <span style={{ fontSize: 18, color: "var(--r2-ink-2)" }}>{s.title}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </Stage>
  );
}

/**
 * The swipe: all six edge to edge at phone scale, as the carousel's track
 * would lay them out — for judging rhythm and continuity across the joins.
 */
const STRIP_SCALE = 0.36;
export const STRIP = { width: 6 * SLIDE.width * STRIP_SCALE + 2 * 60, height: SLIDE.height * STRIP_SCALE + 2 * 60 } as const;

export function CarouselStrip() {
  return (
    <Stage appearance={DARK} background="var(--r2-page-bg)">
      <div style={{ position: "absolute", left: 60, top: 60, display: "flex" }}>
        {SLIDES.map((s, i) => (
          <div key={s.id} style={{ position: "relative", width: SLIDE.width * STRIP_SCALE, height: SLIDE.height * STRIP_SCALE, overflow: "hidden" }}>
            <div style={{ position: "absolute", left: 0, top: 0, width: SLIDE.width, height: SLIDE.height, transform: `scale(${STRIP_SCALE})`, transformOrigin: "0 0" }}>
              <SlideAt i={i} />
            </div>
          </div>
        ))}
      </div>
    </Stage>
  );
}

/**
 * The phone check: every slide at the width it takes in the Instagram feed on
 * a 390-point-wide phone (390 px here, so 1 screen pixel ≈ 1 point), in order,
 * with nothing around it but the feed's own dark ground.
 */
const PHONE_SCALE = 390 / SLIDE.width;
const PW = SLIDE.width * PHONE_SCALE;
const PH = SLIDE.height * PHONE_SCALE;
export const PHONE = { width: Math.round(48 * 2 + 3 * PW + 2 * 24), height: Math.round(48 * 2 + 40 + 2 * PH + 24 + 2 * 30) } as const;

export function CarouselPhoneSheet() {
  return (
    <Stage appearance={DARK} background="#000">
      <div style={{ position: "absolute", inset: 0, padding: 48, fontFamily: "var(--r2-font-ui)" }}>
        <p style={{ height: 40, fontSize: 14, color: "var(--r2-ink-3)" }}>Phone size · each slide 390 px wide, as on a 390-pt phone in the feed · pass 2</p>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(3, ${PW}px)`, columnGap: 24, rowGap: 24 }}>
          {SLIDES.map((s, i) => (
            <figure key={s.id}>
              <Thumb i={i} scale={PHONE_SCALE} />
              <figcaption style={{ marginTop: 8, height: 22, fontSize: 13, color: "var(--r2-ink-3)" }}>
                {s.n} · {s.title}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </Stage>
  );
}

export function CarouselCompositions() {
  return (
    <>
      <Composition id="Carousel-Slides" component={CarouselSlides} width={SLIDE.width} height={SLIDE.height} fps={FPS} durationInFrames={SLIDES.length} />
      <Composition id="Carousel-ContactSheet" component={CarouselContactSheet} width={Math.round(CONTACT.width)} height={Math.round(CONTACT.height)} fps={FPS} durationInFrames={1} />
      <Composition id="Carousel-Phone" component={CarouselPhoneSheet} width={PHONE.width} height={PHONE.height} fps={FPS} durationInFrames={1} />
      <Composition id="Carousel-Strip" component={CarouselStrip} width={Math.round(STRIP.width)} height={Math.round(STRIP.height)} fps={FPS} durationInFrames={1} />
    </>
  );
}
