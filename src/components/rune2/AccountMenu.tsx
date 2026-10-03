"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, ChevronDown, ChevronsUpDown, LogOut, Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getOfflineStorageSummary } from "@/lib/offline/db";
import { flushPendingQueue } from "@/lib/offline/syncEngine";
import type { Account } from "@/lib/rune2/account";
import { countUnsentWorkspaceWork } from "@/lib/rune2/workspaceDrafts";
import { useProfileStore } from "@/store/profileStore";
import { ICON_SM_BOLD } from "./icons";
import { NavigatorMenu, type NavigatorMenuItem } from "./NavigatorMenu";
import { useRuneAccount } from "./RunePreferences";

// The account menu (Beta Completion A): who is signed in, and the three
// places an account goes — Projects, Settings, and out. Nothing else: no
// plan, no upgrade, no profile.
//
// Two places show it (Beta Completion C): the slim bar over the pages outside
// a Project, and — so Settings never means leaving the book — the foot of a
// Project's navigator (AccountControl), where it opens upwards and Settings
// opens in a Center Peek over the Project (SettingsPeek) instead of leaving
// it. It is Rune's control, not the Project's: the Project's own actions stay
// under its title.

/**
 * Logging out, safely: first any writing still waiting on this device is
 * sent. If some cannot be (offline, or a conflict to resolve), the writer is
 * told before anything happens — it stays on this device and is sent the
 * next time they sign in here; logging out never discards it. Returns the
 * action, its progress, and the question to render when there is one.
 */
export function useLogOut(): { logOut: () => void; busy: boolean; error: string | null; dialog: ReactNode } {
  const router = useRouter();
  const userId = useProfileStore((s) => s.profile?.id);
  const [state, setState] = useState<"checking" | "out" | { waiting: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    setState("out");
    setError(null);
    const { error: e } = await createClient().auth.signOut();
    if (e) {
      setState(null);
      setError("You couldn’t be logged out. Check your connection and try again.");
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  async function logOut() {
    setState("checking");
    setError(null);
    try {
      await flushPendingQueue({ includeUnsupported: true });
    } catch {
      // Counted below either way.
    }
    // Every kind of unsent writing this writer has on this device, not only
    // the manuscript's queue: Pages and Entries, Revision Notes, Canvases
    // (their open sessions save on their own; what is still unsent is in
    // the device store either way).
    const [scenes, workspace] = await Promise.all([
      getOfflineStorageSummary(userId),
      userId ? countUnsentWorkspaceWork(userId) : { documents: 0, notes: 0, canvases: 0 },
    ]);
    const plural = (n: number, one: string, many = `${one}s`) => (n > 0 ? `${n} ${n === 1 ? one : many}` : null);
    const waiting = [
      plural(scenes.pending + scenes.conflicts, "scene"),
      plural(workspace.documents, "page or entry", "pages or entries"),
      plural(workspace.notes, "revision note"),
      plural(workspace.canvases, "canvas", "canvases"),
    ].filter((p): p is string => p !== null);
    if (waiting.length > 0) {
      setState({ waiting });
      return;
    }
    await signOut();
  }

  const dialog =
    state !== null && typeof state === "object" ? (
      <div className="r2-dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setState(null)}>
        <div className="r2-dialog" role="alertdialog" aria-modal="true" aria-labelledby="r2-logout-title">
          <h2 id="r2-logout-title">Some writing hasn’t been saved to Rune yet</h2>
          <p>
            Writing in {state.waiting.join(", ")} is only on this device so far. It stays here if you log out, and is
            saved the next time you sign in on this device.
          </p>
          <div className="r2-dialog-actions">
            <button type="button" className="r2-button" onClick={() => setState(null)} autoFocus>
              Stay signed in
            </button>
            <button type="button" className="r2-button r2-button--primary" onClick={() => void signOut()}>
              Log out anyway
            </button>
          </div>
        </div>
      </div>
    ) : null;

  return { logOut: () => void logOut(), busy: state === "checking" || state === "out", error, dialog };
}

/**
 * The account's menu items: Projects, Settings, Log out. Inside a Project
 * (`openSettings` given) Settings opens over it; elsewhere it is the page.
 */
function accountItems(
  name: string,
  push: (href: string) => void,
  logOut: () => void,
  openSettings: (() => void) | null
): NavigatorMenuItem[] {
  return [
    // Who is signed in, as a quiet label over the list.
    { label: openSettings ? "All projects" : "Projects", icon: BookOpen, section: name, onSelect: () => push("/projects") },
    { label: "Settings", icon: Settings, onSelect: openSettings ?? (() => push("/settings")) },
    { label: "Log out", icon: LogOut, separator: true, onSelect: logOut },
  ];
}

/** The writer's initial, for the account control. */
function initialOf(name: string): string {
  return [...name.trim()][0]?.toLocaleUpperCase() ?? "";
}

export function AccountMenu({ account }: { account: Account }) {
  const router = useRouter();
  const button = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const { logOut, busy, error, dialog } = useLogOut();
  const name = account.penName || account.email;

  function open() {
    const r = button.current?.getBoundingClientRect();
    if (r) setAt({ x: r.right - 200, y: r.bottom + 4 });
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        className="r2-account"
        aria-haspopup="menu"
        aria-expanded={at !== null}
        onClick={() => (at ? setAt(null) : open())}
        disabled={busy}
      >
        <span className="r2-account-name">{busy ? "Logging out…" : name}</span>
        <ChevronDown {...ICON_SM_BOLD} aria-hidden />
      </button>
      {at && (
        <NavigatorMenu label="Account" at={at} items={accountItems(name, (href) => router.push(href), logOut, null)} onClose={() => setAt(null)} />
      )}
      {error && (
        <p role="alert" className="r2-notice r2-account-notice" data-tone="danger">
          {error}
        </p>
      )}
      {dialog}
    </>
  );
}

/**
 * The account at the foot of a Project's navigator: the writer's initial and
 * name, opening upwards to All projects, Settings (in a Center Peek over the
 * Project) and Log out.
 */
export function AccountControl({ onOpenSettings }: { onOpenSettings: () => void }) {
  const account = useRuneAccount();
  const router = useRouter();
  const button = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const { logOut, busy, error, dialog } = useLogOut();
  const name = account ? account.penName || account.email : "Account";

  function open() {
    const r = button.current?.getBoundingClientRect();
    if (r) setAt({ x: r.left, y: r.top - 4 });
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        className="r2-account r2-account--nav"
        aria-haspopup="menu"
        aria-expanded={at !== null}
        aria-label={`Account — ${name}`}
        onClick={() => (at ? setAt(null) : open())}
        disabled={busy}
      >
        <span className="r2-account-mark" aria-hidden>
          {initialOf(name)}
        </span>
        <span className="r2-account-name">{busy ? "Logging out…" : name}</span>
        <ChevronsUpDown {...ICON_SM_BOLD} aria-hidden />
      </button>
      {at && (
        <NavigatorMenu
          label="Account"
          at={at}
          above
          items={accountItems(account?.email ?? name, (href) => router.push(href), logOut, onOpenSettings)}
          onClose={() => setAt(null)}
        />
      )}
      {error && (
        <p role="alert" className="r2-notice r2-nav-notice" data-tone="danger">
          {error}
        </p>
      )}
      {dialog}
    </>
  );
}

/** The quiet top bar of the pages outside a Project: the wordmark (home) and the account. */
export function AppBar({ account }: { account: Account }) {
  return (
    <header className="r2-appbar">
      <Link href="/projects" className="r2-wordmark" aria-label="Rune — Projects">
        Rune
      </Link>
      <AccountMenu account={account} />
    </header>
  );
}
