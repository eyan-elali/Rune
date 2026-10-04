import { recordAnalyticsEvent } from "@/lib/actions/analytics";
import { readBetaAccessState, type BetaAccessState } from "@/lib/beta";

// The closed-beta check on the server (Beta Completion E): the database's
// answer for the signed-in account (claim_beta_access, migration 052), which
// also accepts an approved email the first time its account arrives.
//
// The boundary that cannot be bypassed is the database's: without access an
// account cannot create a Project (projects_require_beta_access). This check
// is the front of it — the pages that keep an account without access out of
// onboarding and Projects. When the database cannot be asked (an error, not
// an answer), it reports null: the caller lets the writer through rather
// than lock an accepted writer out of their manuscript over a hiccup, and
// the database still refuses anything an account without access would make.

// Works with the server Supabase client (pages, actions and route handlers).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export async function claimBetaAccess(supabase: SupabaseLike, userId: string): Promise<BetaAccessState | null> {
  const { data, error } = await supabase.rpc("claim_beta_access");
  if (error) {
    console.error("[beta] claim_beta_access failed:", error.message);
    return null;
  }
  const state = readBetaAccessState(data);
  if (state === "accepted") {
    // Best-effort: analytics never blocks entry.
    try {
      await recordAnalyticsEvent({ userId, eventName: "beta_access_accepted" });
    } catch {
      // Ignored.
    }
  }
  return state;
}
