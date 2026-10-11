import type { Metadata } from "next";
import { FeaturePage } from "@/components/front/feature/FeaturePage";
import { CollectionsArticle } from "@/components/front/feature/articles/CollectionsArticle";
import "../../front.css";
import "../../feature.css";

// Collections, on its own route (the article: components/front/feature/articles/CollectionsArticle).
// From the landing page the same article opens in the Center Peek instead (@peek).

export const metadata: Metadata = {
  title: "Collections",
  description:
    "Collections give the things you keep returning to — characters, places, sources, clues — a shared shape: typed properties on each entry, room to write, and several views of the same objects.",
  alternates: { canonical: "/features/collections" },
};

export default function CollectionsFeature() {
  return (
    <FeaturePage current="collections">
      <CollectionsArticle />
    </FeaturePage>
  );
}
