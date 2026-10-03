// Rune 2.0 is the application (Beta Completion A). Its Projects live at
// /projects and /projects/:id, its Settings at /settings. The addresses of
// the retired Rune 1.x surfaces — and of the temporary /rune2 preview — lead
// to their modern equivalent where there is one: a Rune 1.x chapter or
// Unplaced page opens its Project (the Rune 2.0 shell has no per-Chapter
// address). Profile's statistics and unlockables and Arena are retired; they
// lead to Settings and to Projects. Read by next.config.ts, which makes them
// temporary (307) redirects — the mapping may still change before launch —
// carrying the query string over.
//
// Plain data with no imports: next.config.ts loads this file directly.

export type LegacyRedirect = { source: string; destination: string };

export const LEGACY_REDIRECTS: readonly LegacyRedirect[] = [
  { source: "/dashboard", destination: "/projects" },
  { source: "/rune2", destination: "/projects" },
  { source: "/rune2/:projectId", destination: "/projects/:projectId" },
  { source: "/projects/:projectId/chapters/:chapterId", destination: "/projects/:projectId" },
  { source: "/projects/:projectId/unplaced", destination: "/projects/:projectId" },
  { source: "/profile", destination: "/settings" },
  { source: "/profile/:path*", destination: "/settings" },
  { source: "/games", destination: "/projects" },
  { source: "/games/:path*", destination: "/projects" },
];

/**
 * Where a pathname is sent, or null when it is not a legacy address — the
 * same matching as Next's (":name" one segment, ":name*" any remainder),
 * for tests and for anything else that must agree with the redirects.
 */
export function legacyDestination(pathname: string): string | null {
  for (const r of LEGACY_REDIRECTS) {
    const params: Record<string, string> = {};
    const src = r.source.split("/").filter(Boolean);
    const path = pathname.split("/").filter(Boolean);
    let matched = true;
    for (let i = 0; i < src.length; i++) {
      const seg = src[i];
      if (seg.endsWith("*")) {
        params[seg.slice(1, -1)] = path.slice(i).join("/");
        path.length = i;
        src.length = i;
        break;
      }
      if (i >= path.length) { matched = false; break; }
      if (seg.startsWith(":")) params[seg.slice(1)] = path[i];
      else if (seg !== path[i]) { matched = false; break; }
    }
    if (!matched || path.length !== src.length) continue;
    return r.destination.replace(/:(\w+)\*?/g, (_, name: string) => params[name] ?? "");
  }
  return null;
}
