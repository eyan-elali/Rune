"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useModeStore, type Mode } from "@/store/modeStore";
import { useGameStore } from "@/store/gameStore";
import { useToastStore } from "@/store/toastStore";
import { useProfileStore } from "@/store/profileStore";
import { useOnboardingStore } from "@/store/onboardingStore";
import { ModeToggle } from "@/components/ui/ModeToggle";
import { ThemeApplier } from "@/components/layout/ThemeApplier";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { LevelUpModal } from "@/components/ui/LevelUpModal";
import { useUIStore } from "@/store/uiStore";
import type { ReactNode } from "react";
import type { Profile } from "@/lib/types";

const MODE_TOAST: Record<Mode, string> = {
  focus: "Focus Mode",
  game: "Game Mode",
  normal: "Normal Mode",
};

interface AppShellProps {
  profile: Profile | null;
  children: ReactNode;
}

export function AppShell({ profile, children }: AppShellProps) {
  const pathname = usePathname();
  const { mode, setMode } = useModeStore();
  const showToast = useToastStore((s) => s.showToast);
  const setProfile = useProfileStore((s) => s.setProfile);
  const [hotzoneActive, setHotzoneActive] = useState(false);
  const modeRef = useRef<Mode>(mode);

  const displayName =
    profile?.display_name ?? profile?.username ?? "Writer";

  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const gameState = useGameStore((s) => s.gameState);
  const isRaceActive =
    pathname.includes("/games/race") && gameState === "active";
  const isBattleActive =
    pathname === "/games/battle" && gameState === "active";
  const shouldHideFocusUI =
    mode === "focus" && pathname.includes("/chapters/");
  const shouldHideUI = shouldHideFocusUI || isRaceActive || isBattleActive;

  const phase = useOnboardingStore((s) => s.phase);
  const isOnboardingPhase = phase === "writing" || phase === "revealing";

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useLayoutEffect(() => {
    if (profile) setProfile(profile);
  }, [profile, setProfile]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isCmdShiftF =
        (e.metaKey || e.ctrlKey) && e.shiftKey && e.code === "KeyF";

      if (isCmdShiftF) {
        e.preventDefault();
        const next: Mode = modeRef.current === "focus" ? "normal" : "focus";
        setMode(next);
        showToast(MODE_TOAST[next], "info");
        return;
      }

      if (e.key === "Escape" && modeRef.current === "focus") {
        e.preventDefault();
        setMode("normal");
        showToast(MODE_TOAST.normal, "info");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setMode, showToast]);

  // Sidebar visibility and animation:
  // - Onboarding writing: in DOM, width 0, clipped (no transition)
  // - Onboarding revealing: animates to full width
  // - Focus/race/battle: removed from DOM entirely (existing behaviour)
  // - Normal: standard collapsible sidebar
  const renderSidebar = isOnboardingPhase || !shouldHideUI;

  let sidebarStyle: React.CSSProperties;
  if (phase === "writing") {
    sidebarStyle = {
      width: "0px",
      minWidth: "0px",
      overflow: "hidden",
      flexShrink: 0,
      transition: "none",
    };
  } else if (phase === "revealing") {
    const targetWidth = sidebarCollapsed ? "64px" : "260px";
    const targetMin = sidebarCollapsed ? "64px" : "200px";
    sidebarStyle = {
      width: targetWidth,
      minWidth: targetMin,
      overflow: "hidden",
      flexShrink: 0,
      transition: "width 0.55s cubic-bezier(0.25, 0.46, 0.45, 0.94), min-width 0.55s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
    };
  } else {
    sidebarStyle = {
      width: sidebarCollapsed ? "64px" : "260px",
      minWidth: sidebarCollapsed ? "64px" : "200px",
      flexShrink: 0,
      transition: "width 0.25s ease, min-width 0.25s ease",
    };
  }

  // Header visibility and animation:
  // - Onboarding writing: in DOM, invisible, no pointer events
  // - Onboarding revealing: slides down + fades in (delayed 250ms)
  // - Focus/race/battle: removed from DOM entirely (existing behaviour)
  // - Normal: visible
  const renderHeader = isOnboardingPhase || !shouldHideUI;

  let headerStyle: React.CSSProperties = {};
  if (phase === "writing") {
    headerStyle = {
      opacity: 0,
      transform: "translateY(-100%)",
      pointerEvents: "none",
      transition: "none",
    };
  } else if (phase === "revealing") {
    headerStyle = {
      opacity: 1,
      transform: "translateY(0)",
      transition: "opacity 0.45s ease 0.25s, transform 0.45s ease 0.25s",
    };
  }

  return (
    <div
      className="flex h-screen w-full overflow-hidden"
      style={{ background: "var(--bg-sidebar)" }}
    >
      <ThemeApplier />
      {renderSidebar && (
        <div
          className="flex h-screen flex-col overflow-hidden"
          style={sidebarStyle}
        >
          <Sidebar displayName={displayName} />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {renderHeader && (
          <div style={headerStyle}>
            <Header />
          </div>
        )}
        <main
          className="relative min-h-0 flex-1 overflow-auto"
          style={{
            background: shouldHideUI && !isOnboardingPhase
              ? "var(--surface-editor)"
              : "var(--bg-primary)",
          }}
        >
          {children}
        </main>
      </div>

      <LevelUpModal />

      {shouldHideFocusUI && (
        <>
          <div
            className="pointer-events-none fixed inset-0 z-10"
            style={{
              background:
                "radial-gradient(ellipse at center, transparent 52%, rgba(20,16,14,0.15) 100%)",
            }}
            aria-hidden
          />

          <div
            className="fixed right-0 top-0 z-20 h-20 w-20"
            onMouseEnter={() => setHotzoneActive(true)}
            onMouseLeave={() => setHotzoneActive(false)}
          >
            <div
              className="pointer-events-auto absolute right-4 top-4 transition-all duration-300"
              style={{
                opacity: hotzoneActive ? 1 : 0,
                transform: hotzoneActive ? "translateY(0)" : "translateY(-6px)",
                pointerEvents: hotzoneActive ? "auto" : "none",
                background: "rgba(44, 36, 32, 0.72)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                borderRadius: "9999px",
                border: "1px solid var(--color-border-strong)",
                padding: "3px",
              }}
            >
              <ModeToggle />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
