import type { Metadata } from "next";
import { FeaturePage } from "@/components/front/feature/FeaturePage";
import { READING_LINE, ReadingModeArticle } from "@/components/front/feature/articles/ReadingModeArticle";
import "../../front.css";
import "../../feature.css";

// Reading Mode, on its own route (the article: components/front/feature/articles/ReadingModeArticle).
// From the landing page the same article opens in the Center Peek instead (@peek).

export const metadata: Metadata = {
  title: "Reading Mode",
  description: `${READING_LINE} A chapter, a part, or the whole book, on a page with nothing else on it.`,
  alternates: { canonical: "/features/reading-mode" },
};

export default function ReadingModeFeature() {
  return (
    <FeaturePage current="reading-mode">
      <ReadingModeArticle />
    </FeaturePage>
  );
}
