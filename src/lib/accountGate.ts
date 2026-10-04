import { isPenNameMissing } from "@/lib/penName";

// Where a signed-in account stands before it may use Rune, in order:
//   verified email (the session) → a profile with a pen name → beta access
// Every entry point (the auth callback, the front door, /complete-profile and
// the (rune2) layout) asks this one place, so none of them can let an account
// without a profile reach Projects, onboarding or import.
//
// "missing" is an account with no profiles row at all (its signup trigger did
// not run). It is never treated as an answer we failed to get: it goes to
// /complete-profile, which creates the profile with the pen name the writer
// chooses (complete_profile, migration 053). Only a failed lookup is
// "unknown" — then the caller decides, and the database still refuses a
// Project to an account without a profile (projects_require_beta_access).

// Works with the server Supabase client (pages, actions and route handlers).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export type ProfileState<P> =
  | { status: "complete"; profile: P }
  | { status: "missing" }
  | { status: "incomplete"; profile: P }
  | { status: "unknown" };

export const COMPLETE_PROFILE_PATH = "/complete-profile";

export async function readProfileState<P extends { display_name?: string | null }>(
  supabase: SupabaseLike,
  userId: string,
  columns = "*"
): Promise<ProfileState<P>> {
  const { data, error } = await supabase.from("profiles").select(columns).eq("id", userId).maybeSingle();
  if (error) return { status: "unknown" };
  if (!data) return { status: "missing" };
  const profile = data as P;
  return isPenNameMissing(profile.display_name) ? { status: "incomplete", profile } : { status: "complete", profile };
}

/** Whether the account must complete its profile before anything else. */
export function needsProfileCompletion(state: ProfileState<unknown>): boolean {
  return state.status === "missing" || state.status === "incomplete";
}
