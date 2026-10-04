import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/actions/admin";
import { RunePreferencesProvider, RuneRoot } from "@/components/rune2/RunePreferences";
import { ICON } from "@/components/rune2/icons";
import { createClient } from "@/lib/supabase/server";
import { buildThemeCss } from "@/lib/rune2/themes";
import "@/app/(rune2)/rune2.css";

// What remains of the Rune 1.x application frame: Pulse, the founder's
// private analytics, admin-only. The writer-facing Rune 1.x surfaces
// (Dashboard, Projects, editor, Profile, Arena, Settings) are retired —
// Rune 2.0 owns /projects and /settings, and next.config.ts redirects the
// old addresses.
//
// Pulse is Rune's private operational room, so it is framed as Rune 2 is
// (Beta Completion E): the same tokens, the founder's own theme and accent
// (RunePreferences), and the themes stylesheet before anything paints. The
// legacy variable names its sections were built with are mapped onto the
// semantic tokens inside .r2-pulse (rune2.css), so nothing here carries a
// palette of its own.

const THEME_CSS = buildThemeCss();

export default async function PulseFrameLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("preferences").eq("id", admin.id).maybeSingle();

  return (
    <RunePreferencesProvider initial={profile?.preferences ?? null}>
      <style id="r2-themes" dangerouslySetInnerHTML={{ __html: THEME_CSS }} />
      <RuneRoot className="r2-pulse">
        <header className="r2-appbar r2-pulse-bar">
          <Link href="/projects" className="r2-pulse-back">
            <ArrowLeft {...ICON} aria-hidden />
            Projects
          </Link>
          <span className="r2-wordmark" aria-hidden>
            Rune
          </span>
        </header>
        <main className="r2-pulse-main">{children}</main>
      </RuneRoot>
    </RunePreferencesProvider>
  );
}
