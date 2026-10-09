import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PublicFrame } from "@/components/front/PublicFrame";
import { MarketingTrackers } from "@/components/MarketingTrackers";
import { COMPLETE_PROFILE_PATH, needsProfileCompletion, readProfileState } from "@/lib/accountGate";

export const metadata: Metadata = {
  title: { absolute: "Sutura — A home for writing novels" },
  description:
    "Sutura keeps your manuscript at the center, with a workspace that grows around it only when you need it. Now in Early Access, and free for now.",
  // Resolved against metadataBase: https://writesutura.com/
  alternates: { canonical: "/" },
};

// The front door: not a launch site — what Sutura is, that it is in Early
// Access and free for now, and the way in. Two states:
//   * a visitor: Start writing free (Create account) and Sign in
//   * a signed-in writer: Open Sutura
// Anyone may create an account (Early Access, migration 056): there is no
// invitation, approval or waitlist. Nothing here sells: no pricing, no plans,
// no checkout.

export default async function FrontDoor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // A signed-in account finishes its profile before anything else
  // (lib/accountGate.ts). A failed lookup is not a refusal.
  if (user && needsProfileCompletion(await readProfileState(supabase, user.id, "display_name"))) {
    redirect(COMPLETE_PROFILE_PATH);
  }
  const member = user !== null;

  return (
    <PublicFrame
      nav={
        member ? (
          <Link href="/projects" className="r2-button r2-button--sm">
            Open Sutura
          </Link>
        ) : (
          <Link href="/login" className="r2-button r2-button--quiet r2-button--sm">
            Sign in
          </Link>
        )
      }
    >
      <section className="r2-front" aria-labelledby="front-title">
        <p className="r2-front-kind">A writing companion for novelists</p>
        <h1 id="front-title">A home for writing novels.</h1>
        <p className="r2-front-lede">
          Sutura keeps your manuscript at the center — chapters, scenes and the prose itself — with a workspace that grows
          around it only when you need it: notes, characters, research, a canvas for thinking.
        </p>
        <p className="r2-front-promise">
          <strong>Your words remain your own.</strong> Sutura will never use AI to write, rewrite, or complete your story.
        </p>

        {member ? (
          <div className="r2-front-actions">
            <Link href="/projects" className="r2-button r2-button--primary r2-button--lg">
              Open Sutura
            </Link>
          </div>
        ) : (
          <>
            <div className="r2-material r2-front-panel">
              <div className="r2-front-panel-head">
                <p className="r2-front-access">
                  <strong>Sutura is now available in Early Access.</strong> It’s free while we finish the first release.
                </p>
                <Link href="/signup" className="r2-button r2-button--primary r2-button--lg">
                  Start writing free
                </Link>
              </div>
            </div>
            <p className="r2-front-small">
              Already have an account? <Link href="/login">Sign in</Link>
            </p>
          </>
        )}
      </section>
      {/* Marketing attribution for signed-out visitors only — never for a signed-in account. */}
      {user === null && <MarketingTrackers />}
    </PublicFrame>
  );
}
