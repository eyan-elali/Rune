import Link from "next/link";
import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/actions/admin";

// What remains of the Rune 1.x application frame: Pulse, the founder's
// private analytics, admin-only. The writer-facing Rune 1.x surfaces
// (Dashboard, Projects, editor, Profile, Arena, Settings) are retired —
// Rune 2.0 owns /projects and /settings, and next.config.ts redirects the
// old addresses. Pulse keeps the legacy page styles it was built with.
export default async function PulseFrameLayout({ children }: { children: ReactNode }) {
  await requireAdmin();

  return (
    <div className="flex min-h-screen w-full flex-col" style={{ background: "var(--bg-primary)" }}>
      <div className="px-10 pt-6 text-sm">
        <Link href="/projects" style={{ color: "var(--color-mist)" }}>
          ← Projects
        </Link>
      </div>
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}
