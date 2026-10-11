import { notFound } from "next/navigation";
import { renderFeatureArticle } from "@/components/front/feature/articles";

// A feature opened from the landing page: the same article as
// features/<slug>/page.tsx, read inside the Center Peek (the (open) layout).
export default async function PeekFeature({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = renderFeatureArticle(slug);
  if (!article) notFound();
  return article;
}
