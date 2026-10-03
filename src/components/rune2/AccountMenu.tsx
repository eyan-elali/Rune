"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, ChevronDown, LogOut, Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getOfflineStorageSummary } from "@/lib/offline/db";
import { flushPendingQueue } from "@/lib/offline/syncEngine";
import type { Account } from "@/lib/rune2/account";
import { ICON_SM_BOLD } from "./icons";
import { NavigatorMenu, type NavigatorMenuItem } from "./NavigatorMenu";

// The account menu (Beta Completion A): who is signed in, and the three
// places an account goes — Projects, Settings, and out. Nothing else: no
// plan, no upgrade, no profile.

/**
 * Logging out, safely: first any writing still waiting on this device is
 * sent. If some cannot be (offline, or a conflict to resolve), the writer is
 * told before anything happens — it stays on this device and is sent the
 * next time they sign in here; logging out never discards it. Returns the
 * action, its progress, and the question to render when there is one.
 */
export function useLogOut(): { logOut: () => void; busy: boolean; error: string | null; dialog: ReactNode } {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "out" | { waiting: number } | null>(null);
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
      await flushPendingQueue();
    } catch {
      // Counted below either way.
    }
    const { pending, conflicts } = await getOfflineStorageSummary();
    if (pending + conflicts > 0) {
      setState({ waiting: pending + conflicts });
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
            {state.waiting === 1 ? "One scene has" : `${state.waiting} scenes have`} writing that is only on this device.
            It stays here if you log out, and is saved the next time you sign in on this device.
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

  const items: NavigatorMenuItem[] = [
    // Who is signed in, as a quiet label over the list.
    { label: "Projects", icon: BookOpen, section: name, onSelect: () => router.push("/projects") },
    { label: "Settings", icon: Settings, onSelect: () => router.push("/settings") },
    { label: "Log out", icon: LogOut, separator: true, onSelect: logOut },
  ];

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
      {at && <NavigatorMenu label="Account" at={at} items={items} onClose={() => setAt(null)} />}
      {error && (
        <p role="alert" className="r2-notice r2-account-notice" data-tone="danger">
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
