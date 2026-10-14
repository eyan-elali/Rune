import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PublicFrame } from "@/components/front/PublicFrame";
import { FrontHeader } from "@/components/front/FrontHeader";
import { FrontHero } from "@/components/front/FrontHero";
import { FrontManuscript } from "@/components/front/FrontManuscript";
import { FrontWorkspace } from "@/components/front/FrontWorkspace";
import { FrontDetails } from "@/components/front/FrontDetails";
import { FrontMore } from "@/components/front/FrontMore";
import { FrontTrust } from "@/components/front/FrontTrust";
import { FrontClose } from "@/components/front/FrontClose";
import { MarketingTrackers } from "@/components/MarketingTrackers";
import { FrontAnalytics } from "@/components/front/FrontAnalytics";
import { COMPLETE_PROFILE_PATH, needsProfileCompletion, readProfileState } from "@/lib/accountGate";
import "./front.css";

export const metadata: Metadata = {
  title: { absolute: "Sutura — A home for writing novels" },
  description:
    "Sutura keeps your manuscript at the center, with a workspace that grows around it only when you need it. Now in Early Access, and free for now.",
  // Resolved against metadataBase: https://writesutura.com/
  alternates: { canonical: "/" },
};

// The front door: the landing page's header and hero (components/front): one
// statement, one action — then the manuscript section (FrontManuscript): the
// Project shell with a manuscript open, as proof of the statement — then the
// workspace section (FrontWorkspace): the four ways it grows around the book
// — then the Inspector section (FrontDetails): one idea, the supporting
// details of a scene stay close to the writing, with a link to the closer
// look (/features/inspector) — then the trust section (FrontTrust): the
// four promises underneath the product, the No AI card leading to
// /principles/no-ai, the emotional conclusion of the story — then the
// strip (FrontMore): four smaller things for the writing itself, a final
// quiet reveal after the story has been told, each leading to its own
// short closer look (/features/widgets, /features/milestones,
// /features/reading-mode, /features/focus-and-themes) — then the close
// (FrontClose): the public beta said plainly, free during beta, and the
// one action once more, before the frame's footer.
// One wording for the one action, "Start writing free":
//   * a visitor is sent to Create account, and may Sign in
//   * a signed-in writer is sent to their Projects
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
          <FrontManuscript />
          <FrontWorkspace />
          <FrontDetails />
          <FrontTrust />
          <FrontMore />
          <FrontClose member={member} />
        </main>
      </div>
      {/* Marketing attribution for signed-out visitors only — never for a signed-in account. */}
      {user === null && <MarketingTrackers />}
      {/* First-party: the landing view and "Start writing free" clicks (api/front-event), signed-out only. */}
      {user === null && <FrontAnalytics view />}
    </PublicFrame>
  );
}
