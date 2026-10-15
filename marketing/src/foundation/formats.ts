// The placements a creative is made for. Each is a canvas size and the zones
// the platform's own interface lies over, so the composition keeps what must
// be read clear of them. The figures are conservative readings of Meta's and
// TikTok's published safe zones (Reels/Stories: ~14% top, ~35% bottom with
// caption and CTA, a column of actions at the right; Feed 4:5: the image is
// clear, only the edges are trimmed on some surfaces).

export const FPS = 30;

export type FormatId = "vertical" | "feed";

export type Format = {
  id: FormatId;
  width: number;
  height: number;
  /** Interface the platform draws over the creative, in px from each edge. */
  safe: { top: number; bottom: number; left: number; right: number };
};

export const FORMATS: Record<FormatId, Format> = {
  // 9:16 — Reels, Stories, TikTok.
  vertical: { id: "vertical", width: 1080, height: 1920, safe: { top: 250, bottom: 440, left: 60, right: 140 } },
  // 4:5 — Instagram and Facebook feed.
  feed: { id: "feed", width: 1080, height: 1350, safe: { top: 60, bottom: 60, left: 60, right: 60 } },
};
