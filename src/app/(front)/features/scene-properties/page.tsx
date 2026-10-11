import type { Metadata } from "next";
import { FeaturePage } from "@/components/front/feature/FeaturePage";
import { ScenePropertiesArticle } from "@/components/front/feature/articles/ScenePropertiesArticle";
import "../../front.css";
import "../../feature.css";

// Scene properties, on its own route (the article: components/front/feature/articles/ScenePropertiesArticle).
// From the landing page the same article opens in the Center Peek instead (@peek).

export const metadata: Metadata = {
  title: "Scene properties",
  description:
    "Track point of view, place, time, status or anything else about a scene beside the writing, never in it. Writer-defined scene properties in Sutura keep the manuscript looking like a manuscript.",
  alternates: { canonical: "/features/scene-properties" },
};

export default function ScenePropertiesFeature() {
  return (
    <FeaturePage current="scene-properties">
      <ScenePropertiesArticle />
    </FeaturePage>
  );
}
