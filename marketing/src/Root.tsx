import { Composition } from "remotion";
import { CreativeA } from "./creatives/creative-a/CreativeA";
import { DURATION } from "./creatives/creative-a/script";
import { CreativeAVertical } from "./creatives/creative-a/vertical/CreativeAVertical";
import { DURATION as VERTICAL_DURATION } from "./creatives/creative-a/vertical/script";
import { FORMATS, FPS } from "./foundation/formats";
import { FILM, KEYFRAMES } from "./creatives/product-film/frames";
import { ProductFilmContactSheet, ProductFilmStoryboard, SHEET } from "./creatives/product-film/ProductFilmStoryboard";
import { StudyCompositions } from "./creatives/product-film/studies/compositions";
import { SuturaProductFilmCompositions } from "./creatives/product-film/film/Film";
import { CarouselCompositions } from "./creatives/carousel/Carousel";

// Every composition the marketing system renders. Studio (npm run studio)
// lists them with a scrubbable timeline; `remotion render` / `remotion still`
// take them by id (package.json scripts).

export function Root() {
  return (
    <>
      {/* 9:16 — its own cut, made for a phone (creatives/creative-a/vertical). */}
      <Composition
        id="CreativeA-Vertical"
        component={CreativeAVertical}
        width={FORMATS.vertical.width}
        height={FORMATS.vertical.height}
        fps={FPS}
        durationInFrames={VERTICAL_DURATION * FPS}
        defaultProps={{ sound: true }}
      />
      {/* Development: the vertical cut's shell at 1:1, logging its geometry (scripts/measure.mjs). */}
      <Composition
        id="CreativeA-Vertical-Measure"
        component={CreativeAVertical}
        width={FORMATS.vertical.width}
        height={FORMATS.vertical.height}
        fps={FPS}
        durationInFrames={VERTICAL_DURATION * FPS}
        defaultProps={{ measure: true, sound: false }}
      />
      <Composition
        id="CreativeA-Feed"
        component={CreativeA}
        width={FORMATS.feed.width}
        height={FORMATS.feed.height}
        fps={FPS}
        durationInFrames={DURATION * FPS}
        defaultProps={{ format: "feed" }}
      />
      {/* The product film, 16:9 — storyboard keyframes only (one per frame), and their contact sheet. */}
      <Composition
        id="ProductFilm-Storyboard"
        component={ProductFilmStoryboard}
        width={FILM.width}
        height={FILM.height}
        fps={FPS}
        durationInFrames={KEYFRAMES.length}
        defaultProps={{ debug: false }}
      />
      <Composition
        id="ProductFilm-Storyboard-Debug"
        component={ProductFilmStoryboard}
        width={FILM.width}
        height={FILM.height}
        fps={FPS}
        durationInFrames={KEYFRAMES.length}
        defaultProps={{ debug: true }}
      />
      <Composition id="ProductFilm-ContactSheet" component={ProductFilmContactSheet} width={SHEET.width} height={SHEET.height} fps={FPS} durationInFrames={1} />
      {/* The product film's motion studies (MOTION_LANGUAGE_EXPLORATION.md): each as itself, annotated, and as a review strip. */}
      <StudyCompositions />
      <SuturaProductFilmCompositions />
      {/* The Instagram carousel: six 1080×1350 stills, a contact sheet and a swipe strip (marketing/carousel/). */}
      <CarouselCompositions />
    </>
  );
}
