import type { Metadata } from "next";
import Link from "next/link";
import { PublicFrame } from "@/components/front/PublicFrame";
import { NO_AI_PATH, TRUST_PROMISES } from "@/components/front/FrontTrust";
import "../../front.css";

// A placeholder for the editorial page the landing page's No AI writing
// card (FrontTrust) leads to: /principles/no-ai. One page in the public
// frame — the promise, a note that the piece is on its way, and the way
// into Sutura — until the article replaces it. The route exists so the
// card leads somewhere true, and so the article has its address. It is one
// page, not an article system.

const PROMISE = TRUST_PROMISES.find((p) => p.id === "no-ai")!;

export const metadata: Metadata = {
  title: PROMISE.label,
  description: PROMISE.line,
  alternates: { canonical: NO_AI_PATH },
};

export default function NoAiPrinciplePage() {
  return (
    <PublicFrame variant="front" theme="light">
      <div className="r2-lp-ws-stub">
        <p className="r2-lp-eyebrow">Our principles</p>
        <h1 className="r2-lp-h2">{PROMISE.title}</h1>
        <p className="r2-lp-lede">{PROMISE.line}</p>
        <p className="r2-lp-ws-stub-note">Our approach to AI, written out in full, is on its way.</p>
        <div className="r2-lp-ws-stub-actions">
          <Link href="/signup" className="r2-button r2-button--primary r2-button--lg">
            Start writing free
          </Link>
          <Link href="/#trust" className="r2-lp-ws-stub-back">
            Back to the front door
          </Link>
        </div>
      </div>
    </PublicFrame>
  );
}
