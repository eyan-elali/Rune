import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PublicFrame } from "@/components/front/PublicFrame";
import { FrontHeader } from "@/components/front/FrontHeader";
import { FrontHero } from "@/components/front/FrontHero";
import { MarketingTrackers } from "@/components/MarketingTrackers";
import { COMPLETE_PROFILE_PATH, needsProfileCompletion, readProfileState } from "@/lib/accountGate";
import "./front.css";

export const metadata: Metadata = {
  title: { absolute: "Sutura — A home for writing novels" },
  description:
    "Sutura keeps your manuscript at the center, with a workspace that grows around it only when you need it. Now in Early Access, and free for now.",
  // Resolved against metadataBase: https://writesutura.com/
  alternates: { canonical: "/" },
};

// The front door: the landing page's header and hero (components/front).
// Two states:
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
    <PublicFrame variant="landing">
      <div className="r2-lp">
        <FrontHeader member={member} />
        <main>
          <FrontHero member={member} />
        </main>
      </div>
      {/* Marketing attribution for signed-out visitors only — never for a signed-in account. */}
      {user === null && <MarketingTrackers />}
    </PublicFrame>
  );
}
