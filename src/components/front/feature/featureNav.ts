import {
  BookOpen,
  Feather,
  File,
  Flag,
  Frame,
  LayoutGrid,
  Library,
  PanelRight,
  SlidersHorizontal,
  StickyNote,
  SunMedium,
  type LucideIcon,
} from "lucide-react";

// What the feature shell's navigator lists (FeatureNavigator, FeatureSwitcher):
// the closer looks and the authorship principle, in three groups, as the
// Project navigator lists the Manuscript and the Workspace: the six features
// the landing's major sections lead to; the four smaller things for the
// writing itself (FrontMore); and the principle. The routes are the ones the
// landing page links to (FrontWorkspace, FrontDetails, FrontMore, FrontTrust)
// and proxy.ts keeps public; a page names itself by its slug.

export type FeatureSlug =
  | "pages"
  | "collections"
  | "scene-properties"
  | "canvas"
  | "inspector"
  | "revision-notes"
  | "widgets"
  | "milestones"
  | "reading-mode"
  | "focus-and-themes"
  | "no-ai";

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
      { slug: "revision-notes", title: "Revision notes", href: "/features/revision-notes", icon: StickyNote },
    ],
  },
  {
    label: "The writing",
    items: [
      { slug: "widgets", title: "Widgets & goals", href: "/features/widgets", icon: LayoutGrid },
      { slug: "milestones", title: "Milestones", href: "/features/milestones", icon: Flag },
      { slug: "reading-mode", title: "Reading Mode", href: "/features/reading-mode", icon: BookOpen },
      { slug: "focus-and-themes", title: "Focus & themes", href: "/features/focus-and-themes", icon: SunMedium },
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

/** The page a route belongs to, by its path (the peek reads the pathname), or null. */
export function featureSlugForPath(pathname: string): FeatureSlug | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  return FEATURE_NAV.flatMap((g) => g.items).find((i) => i.href === path)?.slug ?? null;
}
