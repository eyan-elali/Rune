import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicFrame } from "@/components/front/PublicFrame";
import { WORKSPACE_FEATURES, type WorkspaceFeatureSlug } from "@/components/front/FrontWorkspace";
import "../../front.css";

// A placeholder for the closer looks the landing page's workspace cards
// (FrontWorkspace) lead to: /workspace/pages, /workspace/collections,
// /workspace/canvas, /workspace/scene-properties. Each is one page in the
// public frame — the feature's title and line, a note that the closer look
// is on its way, and the way into Sutura — until the real page replaces it.
// Nothing here is a product page yet; the route exists so the cards lead
// somewhere true, and so the real pages have their addresses.

function find(slug: string) {
  return WORKSPACE_FEATURES.find((f) => f.slug === (slug as WorkspaceFeatureSlug));
}

export function generateStaticParams() {
  return WORKSPACE_FEATURES.map((f) => ({ feature: f.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ feature: string }> }): Promise<Metadata> {
  const feature = find((await params).feature);
  if (!feature) return {};
  return {
    title: feature.title,
    description: feature.line,
    alternates: { canonical: `/workspace/${feature.slug}` },
  };
}

export default async function WorkspaceFeaturePage({ params }: { params: Promise<{ feature: string }> }) {
  const feature = find((await params).feature);
  if (!feature) notFound();

  return (
    <PublicFrame variant="front" theme="light">
      <div className="r2-lp-ws-stub">
        <p className="r2-lp-eyebrow">The workspace</p>
        <h1 className="r2-lp-h2">{feature.title}</h1>
        <p className="r2-lp-lede">{feature.line}</p>
        <p className="r2-lp-ws-stub-note">A closer look at {feature.title.toLowerCase()} is on its way.</p>
        <div className="r2-lp-ws-stub-actions">
          <Link href="/signup" className="r2-button r2-button--primary r2-button--lg">
            Start writing free
          </Link>
          <Link href="/#workspace" className="r2-lp-ws-stub-back">
            Back to the front door
          </Link>
        </div>
      </div>
    </PublicFrame>
  );
}
