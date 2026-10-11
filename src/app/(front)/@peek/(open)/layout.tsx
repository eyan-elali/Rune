import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { FeaturePeek } from "@/components/front/feature/FeaturePeek";
import "../../front.css";
import "../../feature.css";

// The Center Peek's frame (FeaturePeek), shared by every intercepted
// feature route under this group, so switching between features inside the
// peek keeps the one dialog, its navigator and its scroll container, and
// only the article changes. Reads whether a writer is signed in, as the
// standalone shell does, so the one action leads to Projects for them and
// to Create account for a visitor.
export default async function PeekLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return <FeaturePeek member={user !== null}>{children}</FeaturePeek>;
}
