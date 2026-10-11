import type { Metadata } from "next";
import { FeaturePage } from "@/components/front/feature/FeaturePage";
import { CanvasArticle } from "@/components/front/feature/articles/CanvasArticle";
import "../../front.css";
import "../../feature.css";

// Canvas, on its own route (the article: components/front/feature/articles/CanvasArticle).
// From the landing page the same article opens in the Center Peek instead (@peek).

export const metadata: Metadata = {
  title: "Canvas",
  description:
    "A quiet surface inside your project for the parts of a book that will not sit in a list: relationships, plot threads, scene connections and research clusters, arranged in space with the book's own pieces.",
  alternates: { canonical: "/features/canvas" },
};

export default function CanvasFeature() {
  return (
    <FeaturePage current="canvas">
      <CanvasArticle />
    </FeaturePage>
  );
}
