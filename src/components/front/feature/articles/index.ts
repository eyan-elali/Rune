import { createElement, type ComponentType, type ReactElement } from "react";
import type { FeatureSlug } from "../featureNav";
import { PagesArticle } from "./PagesArticle";
import { CollectionsArticle } from "./CollectionsArticle";
import { ScenePropertiesArticle } from "./ScenePropertiesArticle";
import { CanvasArticle } from "./CanvasArticle";
import { InspectorArticle } from "./InspectorArticle";
import { NoAiArticle } from "./NoAiArticle";

// The feature articles, one per page, by slug: what features/<slug>/page.tsx
// renders in the standalone shell and what the Center Peek renders over the
// landing page (@peek/(open)/(.)features/[slug]) — the one copy of each.

export const FEATURE_ARTICLES: Record<FeatureSlug, ComponentType> = {
  pages: PagesArticle,
  collections: CollectionsArticle,
  "scene-properties": ScenePropertiesArticle,
  canvas: CanvasArticle,
  inspector: InspectorArticle,
  "no-ai": NoAiArticle,
};

/** The article for a /features/<slug> route, rendered, or null for a slug that is not a feature. */
export function renderFeatureArticle(slug: string): ReactElement | null {
  if (slug === "no-ai") return null; // a principle, under /principles
  return Object.hasOwn(FEATURE_ARTICLES, slug) ? createElement(FEATURE_ARTICLES[slug as FeatureSlug]) : null;
}
