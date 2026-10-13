import type { Metadata } from "next";
import { FeaturePage } from "@/components/front/feature/FeaturePage";
import { MILESTONES_LINE, MilestonesArticle } from "@/components/front/feature/articles/MilestonesArticle";
import "../../front.css";
import "../../feature.css";

// Milestones, on its own route (the article: components/front/feature/articles/MilestonesArticle).
// From the landing page the same article opens in the Center Peek instead (@peek).

export const metadata: Metadata = {
  title: "Milestones",
  description: `${MILESTONES_LINE} A picture of the whole manuscript, named by you, kept as it was.`,
  alternates: { canonical: "/features/milestones" },
};

export default function MilestonesFeature() {
  return (
    <FeaturePage current="milestones">
      <MilestonesArticle />
    </FeaturePage>
  );
}
