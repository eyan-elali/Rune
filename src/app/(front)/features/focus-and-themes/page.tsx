import type { Metadata } from "next";
import { FeaturePage } from "@/components/front/feature/FeaturePage";
import { FOCUS_LINE, FocusThemesArticle } from "@/components/front/feature/articles/FocusThemesArticle";
import "../../front.css";
import "../../feature.css";

// Focus & themes, on its own route (the article: components/front/feature/articles/FocusThemesArticle).
// From the landing page the same article opens in the Center Peek instead (@peek).

export const metadata: Metadata = {
  title: "Focus & themes",
  description: `${FOCUS_LINE} A desk that feels right, without touching the manuscript itself.`,
  alternates: { canonical: "/features/focus-and-themes" },
};

export default function FocusThemesFeature() {
  return (
    <FeaturePage current="focus-and-themes">
      <FocusThemesArticle />
    </FeaturePage>
  );
}
