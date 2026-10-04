import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PublicFrame } from "@/components/front/PublicFrame";
import { SignOutButton, WaitlistForm } from "@/components/front/FrontDoor";
import { hasBetaAccess } from "@/lib/beta";
import { claimBetaAccess } from "@/lib/betaAccess";
import { COMPLETE_PROFILE_PATH, needsProfileCompletion, readProfileState } from "@/lib/accountGate";

export const metadata: Metadata = {
  title: { absolute: "Rune — A home for writing novels" },
  description:
    "Rune keeps your manuscript at the center, with a workspace that grows around it only when you need it. Currently in closed beta.",
};

// The front door (Beta Completion E): not a launch site — what Rune is, that
// it is in closed beta, and the way in. Three states:
//   * a visitor: Join the beta (the waitlist) and "Already invited? Sign in"
//   * a signed-in writer with access: Open Rune
//   * a signed-in account without access (the (rune2) layout sends it here):
//     the closed-beta note, and the waitlist — or, already on it, a quiet
//     word that it is
// Nothing here sells: no pricing, no plans, no checkout.

export default async function FrontDoor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // A signed-in account finishes its profile before anything else — beta
  // access included (lib/accountGate.ts). A failed lookup is not a refusal.
  if (user && needsProfileCompletion(await readProfileState(supabase, user.id, "display_name"))) {
    redirect(COMPLETE_PROFILE_PATH);
  }
  const access = user ? await claimBetaAccess(supabase, user.id) : null;
  // A failed check (null) for a signed-in writer is not a refusal: they may try to open Rune.
  const member = user !== null && (access === null || hasBetaAccess(access));

  if (user && !member) {
    return (
      <PublicFrame nav={<SignOutButton />}>
        <section className="r2-front" aria-labelledby="front-title">
          <h1 id="front-title">Rune is currently in closed beta.</h1>
          <p className="r2-front-lede">We’re inviting writers in gradually while we finish the first release.</p>
          {access === "waitlisted" ? (
            <p className="r2-front-note" role="status">
              You’re on the list. We’ll write to <strong>{user.email}</strong> when there’s a place for you — there’s nothing
              else you need to do.
            </p>
          ) : (
            <WaitlistForm defaultEmail={user.email ?? ""} />
          )}
          <p className="r2-front-small">Signed in as {user.email}.</p>
        </section>
      </PublicFrame>
    );
  }

  return (
    <PublicFrame
      nav={
        member ? (
          <Link href="/projects" className="r2-button r2-button--sm">
            Open Rune
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
          Rune keeps your manuscript at the center — chapters, scenes and the prose itself — with a workspace that grows
          around it only when you need it: notes, characters, research, a canvas for thinking.
        </p>
        <p className="r2-front-promise">
          <strong>Your words remain your own.</strong> Rune will never use AI to write, rewrite, or complete your story.
        </p>

        {member ? (
          <div className="r2-front-actions">
            <Link href="/projects" className="r2-button r2-button--primary r2-front-primary">
              Open Rune
            </Link>
          </div>
        ) : (
          <>
            <p className="r2-front-beta">
              <strong>Rune is currently in closed beta.</strong> We’re inviting writers in gradually while we finish the
              first release.
            </p>
            <WaitlistForm collapsed />
            <p className="r2-front-small">
              Already invited? <Link href="/login">Sign in</Link>
            </p>
          </>
        )}
      </section>
    </PublicFrame>
  );
}
