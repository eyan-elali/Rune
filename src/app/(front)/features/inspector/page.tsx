import type { Metadata } from "next";
import Link from "next/link";
import { PublicFrame } from "@/components/front/PublicFrame";
import "../../front.css";

// A placeholder for the closer look the landing page's Inspector section
// (FrontDetails) leads to: /features/inspector. One page in the public
// frame — the section's line, a note that the closer look is on its way,
// and the way into Sutura — until the real page replaces it. The route
// exists so the link leads somewhere true, and so the real page has its
// address. It is one page, not a feature-page system.

const TITLE = "The Inspector";
const LINE = "See what a scene needs without leaving the writing.";

export const metadata: Metadata = {
  title: TITLE,
  description: LINE,
  alternates: { canonical: "/features/inspector" },
};

export default function InspectorFeaturePage() {
  return (
    <PublicFrame variant="front" theme="light">
      <div className="r2-lp-ws-stub">
        <p className="r2-lp-eyebrow">The manuscript</p>
        <h1 className="r2-lp-h2">{TITLE}</h1>
        <p className="r2-lp-lede">{LINE}</p>
        <p className="r2-lp-ws-stub-note">A closer look at the Inspector is on its way.</p>
        <div className="r2-lp-ws-stub-actions">
          <Link href="/signup" className="r2-button r2-button--primary r2-button--lg">
            Start writing free
          </Link>
          <Link href="/#inspector" className="r2-lp-ws-stub-back">
            Back to the front door
          </Link>
        </div>
      </div>
    </PublicFrame>
  );
}
