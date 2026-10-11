import type { Metadata } from "next";
import { FeaturePage } from "@/components/front/feature/FeaturePage";
import { INSPECTOR_LINE, InspectorArticle } from "@/components/front/feature/articles/InspectorArticle";
import "../../front.css";
import "../../feature.css";

// The Inspector, on its own route (the article: components/front/feature/articles/InspectorArticle).
// From the landing page the same article opens in the Center Peek instead (@peek).

export const metadata: Metadata = {
  title: "The Inspector",
  description: `${INSPECTOR_LINE} There when you need context, gone when you do not.`,
  alternates: { canonical: "/features/inspector" },
};

export default function InspectorFeature() {
  return (
    <FeaturePage current="inspector">
      <InspectorArticle />
    </FeaturePage>
  );
}
