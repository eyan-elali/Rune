import type { Metadata } from "next";
import { FeaturePage } from "@/components/front/feature/FeaturePage";
import { PagesArticle } from "@/components/front/feature/articles/PagesArticle";
import "../../front.css";
import "../../feature.css";

// Pages, on its own route (the article: components/front/feature/articles/PagesArticle).
// From the landing page the same article opens in the Center Peek instead (@peek).

export const metadata: Metadata = {
  title: "Pages",
  description:
    "Pages are flexible supporting documents around your manuscript: research, questions, worldbuilding, ideas. Sutura keeps them in the project and never in the prose.",
  alternates: { canonical: "/features/pages" },
};

export default function PagesFeature() {
  return (
    <FeaturePage current="pages">
      <PagesArticle />
    </FeaturePage>
  );
}
