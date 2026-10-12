import { SUPPORT_EMAIL } from "@/lib/brand";

// Where the public surfaces lead (the landing page, the feature pages, the
// Center Peek): one list, so the header, the hero, the close, the feature
// shell's end and the trust links agree on every destination. The routes
// are the real ones (app/(auth)/login, app/(auth)/signup, app/(legal)/...;
// proxy.ts keeps them public). Feature destinations live with the feature
// registry (feature/featureNav.ts).

export const PUBLIC_ROUTES = {
  /** The front door. */
  home: "/",
  /** The header's "Manuscript": the landing's manuscript section (FrontManuscript). Its id
   *  stays "features", which the No AI article's aside also links to. */
  manuscript: "/#features",
  /** The header's "Workspace": the landing's workspace section (FrontWorkspace). */
  workspace: "/#workspace",
  /** The header's "Principles": the landing's trust and authorship section (FrontTrust). */
  principles: "/#trust",
  /** Sign in (app/(auth)/login). */
  signIn: "/login",
  /** Create account (app/(auth)/signup). */
  signUp: "/signup",
  /** A signed-in writer's home. */
  projects: "/projects",
  privacy: "/privacy",
  terms: "/terms",
  support: `mailto:${SUPPORT_EMAIL}`,
} as const;

/**
 * The one action, "Start writing free", on every public surface: Create
 * account for a visitor, Projects for a signed-in writer.
 */
export function startPath(member: boolean): string {
  return member ? PUBLIC_ROUTES.projects : PUBLIC_ROUTES.signUp;
}
