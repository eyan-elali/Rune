import type { Metadata } from "next";
import { FeaturePage } from "@/components/front/feature/FeaturePage";
import { NO_AI_PROMISE, NoAiArticle } from "@/components/front/feature/articles/NoAiArticle";
import { NO_AI_PATH } from "@/components/front/FrontTrust";
import "../../front.css";
import "../../feature.css";

// The authorship principle, on its own route (the essay: components/front/feature/articles/NoAiArticle).
// From the landing page the same essay opens in the Center Peek instead (@peek).

export const metadata: Metadata = {
  title: NO_AI_PROMISE.title,
  description: `${NO_AI_PROMISE.line} Why Sutura draws that line, and what it means in practice.`,
  alternates: { canonical: NO_AI_PATH },
};

export default function NoAiPrinciplePage() {
  return (
    <FeaturePage current="no-ai">
      <NoAiArticle />
    </FeaturePage>
  );
}
