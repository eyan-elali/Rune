import type { FormatId } from "../../foundation/formats";

// Where Creative A's pieces sit in each format. The shell is drawn at a
// narrow logical window (its navigator docked) and scaled up so the
// manuscript reads on a phone; the window runs to the canvas's right edge
// and off its bottom, so the shot is a crop of the app, not a device.

export type CreativeALayout = {
  caption: { left: number; top: number; bottom: number; width: number; size: number };
  shot: { x: number; y: number; width: number; height: number; scale: number };
  shell: { width: number; height: number; navWidth: number };
  end: { centreY: number; titleSize: number; wordmarkWidth: number; noteSize: number; gap: number };
};

export const LAYOUTS: Record<FormatId, CreativeALayout> = {
  vertical: {
    caption: { left: 72, top: 270, bottom: 560, width: 900, size: 100 },
    shot: { x: 72, y: 600, width: 1008, height: 1320, scale: 1.75 },
    shell: { width: 576, height: 760, navWidth: 212 },
    end: { centreY: 860, titleSize: 128, wordmarkWidth: 300, noteSize: 30, gap: 72 },
  },
  feed: {
    caption: { left: 64, top: 60, bottom: 266, width: 920, size: 80 },
    shot: { x: 64, y: 300, width: 1016, height: 1050, scale: 1.6 },
    shell: { width: 636, height: 660, navWidth: 212 },
    end: { centreY: 675, titleSize: 108, wordmarkWidth: 260, noteSize: 27, gap: 58 },
  },
};
