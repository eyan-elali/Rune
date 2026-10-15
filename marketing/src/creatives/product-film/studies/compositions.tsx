import { Fragment } from "react";
import { Composition } from "remotion";
import { FPS } from "../../../foundation/formats";
import { FILM } from "../frames";
import { StudyComposition, StudyStrip, stripSize, type StudyDef } from "./Study";
import { STUDY_A, STUDY_A_STRIP } from "./StudyA";
import { STUDY_B, STUDY_B_STRIP } from "./StudyB";
import { STUDY_C, STUDY_C_STRIP } from "./StudyC";
import { STUDY_AV2, STUDY_AV2_STRIP } from "./StudyAV2";
import { STUDY_BV2, STUDY_BV2_STRIP } from "./StudyBV2";
import { STUDY_CV2, STUDY_CV2_STRIP } from "./StudyCV2";
import { STUDY_D, STUDY_D_STRIP } from "./StudyD";

// The motion studies' compositions: ProductFilmStudy<X> (picture and sound),
// ProductFilmStudy<X>-Annotated (each moment labelled AUTHENTIC PRODUCT STATE
// or FILM-ONLY TRANSITION, silent) and ProductFilmStudy<X>-Strip (a review
// strip of chosen moments). Props name the study; definitions hold functions.

const STUDIES: Record<string, { def: StudyDef; strip: number[] }> = {
  A: { def: STUDY_A, strip: STUDY_A_STRIP },
  B: { def: STUDY_B, strip: STUDY_B_STRIP },
  C: { def: STUDY_C, strip: STUDY_C_STRIP },
  // The final R&D pass (§9).
  AV2: { def: STUDY_AV2, strip: STUDY_AV2_STRIP },
  BV2: { def: STUDY_BV2, strip: STUDY_BV2_STRIP },
  CV2: { def: STUDY_CV2, strip: STUDY_CV2_STRIP },
  D: { def: STUDY_D, strip: STUDY_D_STRIP },
};

function Study({ study, annotate, sound }: { study: string; annotate: boolean; sound: boolean }) {
  return <StudyComposition def={STUDIES[study].def} annotate={annotate} sound={sound} />;
}
function Strip({ study }: { study: string }) {
  return <StudyStrip def={STUDIES[study].def} times={STUDIES[study].strip} />;
}

export function StudyCompositions() {
  return (
    <>
      {Object.entries(STUDIES).map(([id, { def, strip }]) => {
        const frames = Math.round(def.duration * FPS);
        const size = stripSize(strip.length);
        return (
          <Fragment key={id}>
            <Composition id={`ProductFilmStudy${id}`} component={Study} width={FILM.width} height={FILM.height} fps={FPS} durationInFrames={frames} defaultProps={{ study: id, annotate: false, sound: true }} />
            <Composition id={`ProductFilmStudy${id}-Annotated`} component={Study} width={FILM.width} height={FILM.height} fps={FPS} durationInFrames={frames} defaultProps={{ study: id, annotate: true, sound: false }} />
            <Composition id={`ProductFilmStudy${id}-Strip`} component={Strip} width={size.width} height={size.height} fps={FPS} durationInFrames={1} defaultProps={{ study: id }} />
          </Fragment>
        );
      })}
    </>
  );
}
