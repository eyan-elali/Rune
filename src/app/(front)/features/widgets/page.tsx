import type { Metadata } from "next";
import { FeaturePage } from "@/components/front/feature/FeaturePage";
import { WIDGETS_LINE, WidgetsArticle } from "@/components/front/feature/articles/WidgetsArticle";
import "../../front.css";
import "../../feature.css";

// Widgets & goals, on its own route (the article: components/front/feature/articles/WidgetsArticle).
// From the landing page the same article opens in the Center Peek instead (@peek).

export const metadata: Metadata = {
  title: "Widgets & goals",
  description: `${WIDGETS_LINE} Keep track when it helps. Hide it when it doesn’t.`,
  alternates: { canonical: "/features/widgets" },
};

export default function WidgetsFeature() {
  return (
    <FeaturePage current="widgets">
      <WidgetsArticle />
    </FeaturePage>
  );
}
