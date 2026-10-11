import { Feather, File, Frame, Library, PanelRight, SlidersHorizontal, type LucideIcon } from "lucide-react";

// What the feature shell's navigator lists (FeatureNavigator, FeatureSwitcher):
// the five closer looks and the authorship principle, in two groups, as the
// Project navigator lists the Manuscript and the Workspace. The routes are
// the ones the landing page links to (FrontWorkspace, FrontDetails,
// FrontTrust) and proxy.ts keeps public; a page names itself by its slug.

export type FeatureSlug = "pages" | "collections" | "scene-properties" | "canvas" | "inspector" | "no-ai";

export type FeatureNavItem = {
  slug: FeatureSlug;
  title: string;
  href: string;
  icon: LucideIcon;
};

export type FeatureNavGroup = {
  label: string;
  items: ReadonlyArray<FeatureNavItem>;
};

export const FEATURE_NAV: ReadonlyArray<FeatureNavGroup> = [
  {
    label: "Features",
    items: [
      { slug: "pages", title: "Pages", href: "/features/pages", icon: File },
      { slug: "collections", title: "Collections", href: "/features/collections", icon: Library },
      { slug: "scene-properties", title: "Scene properties", href: "/features/scene-properties", icon: SlidersHorizontal },
      { slug: "canvas", title: "Canvas", href: "/features/canvas", icon: Frame },
      { slug: "inspector", title: "Inspector", href: "/features/inspector", icon: PanelRight },
    ],
  },
  {
    label: "Principles",
    items: [{ slug: "no-ai", title: "The writing stays human", href: "/principles/no-ai", icon: Feather }],
  },
];

export function featureNavItem(slug: FeatureSlug): FeatureNavItem {
  return FEATURE_NAV.flatMap((g) => g.items).find((i) => i.slug === slug)!;
}
