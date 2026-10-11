import type { Metadata } from "next";
import { FeaturePage } from "@/components/front/feature/FeaturePage";
import { REVISION_NOTES_LINE, RevisionNotesArticle } from "@/components/front/feature/articles/RevisionNotesArticle";
import "../../front.css";
import "../../feature.css";

// Revision Notes, on its own route (the article: components/front/feature/articles/RevisionNotesArticle).
// From the landing page the same article opens in the Center Peek instead (@peek).

export const metadata: Metadata = {
  title: "Revision Notes",
  description: `${REVISION_NOTES_LINE} Revise the book without writing over it.`,
  alternates: { canonical: "/features/revision-notes" },
};

export default function RevisionNotesFeature() {
  return (
    <FeaturePage current="revision-notes">
      <RevisionNotesArticle />
    </FeaturePage>
  );
}
