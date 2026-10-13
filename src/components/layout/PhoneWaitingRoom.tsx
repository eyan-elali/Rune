"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PublicFrame } from "@/components/front/PublicFrame";
import { SITE_URL } from "@/lib/brand";
import "./waiting-room.css";
import { requestDesktopLinkEmail, recordPhoneWaitingRoomViewed } from "@/lib/actions/waitingRoom";

// The desktop handoff on a phone: the full workspace is a desktop (and
// supported tablet) experience, so a phone ends here. One surface, four
// headlines, chosen from server state — never from this device's history:
//
//   ready         onboarding just finished on this phone      Your desk is ready.
//   ready-import  the same, the manuscript still to bring in  Your desk is ready.
//   returning     a finished journey (or an account from      Your writing is waiting.
//                 before onboarding existed)
//   neutral       the account's stage could not be read       Sutura is ready on desktop.
//
// The open beta is said once, here. The arrival renders <DesktopHandoff> in
// onboarding's own frame and theme (components/rune2/Onboarding.tsx); a gated
// route renders <PhoneWaitingRoom>, the same body in the public frame.

export type WaitingRoomVariant = "ready" | "ready-import" | "returning" | "neutral";

const HEADLINES: Record<WaitingRoomVariant, string> = {
  ready: "Your desk is ready.",
  "ready-import": "Your desk is ready.",
  returning: "Your writing is waiting.",
  neutral: "Sutura is ready on desktop.",
};

const NEXT_STEP: Record<WaitingRoomVariant, string> = {
  ready: " on your computer to begin.",
  "ready-import": " on your computer to bring in your manuscript.",
  returning: " on your computer to continue.",
  neutral: " on your computer.",
};

const SITE_HOST = new URL(SITE_URL).host;

// Mirrors the server-side cooldown in waitingRoom.ts. Display-only — the
// server remains the authority on whether a resend actually goes through.
const RESEND_COOLDOWN_MS = 45_000;

type CopyState = "idle" | "copied" | "error";
type SendState = "idle" | "sending" | "sent" | "error";

interface DesktopHandoffProps {
  variant: WaitingRoomVariant;
  initialEmailSentAt: string | null;
  /** Focus the heading as it appears (a step change inside onboarding). */
  focusHeading?: boolean;
}

export function DesktopHandoff({ variant, initialEmailSentAt, focusHeading = false }: DesktopHandoffProps) {
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [sendState, setSendState] = useState<SendState>("idle");
  const [sendError, setSendError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [lastSentAt, setLastSentAt] = useState<string | null>(initialEmailSentAt);
  const [canResend, setCanResend] = useState(() =>
    initialEmailSentAt
      ? Date.now() - new Date(initialEmailSentAt).getTime() >= RESEND_COOLDOWN_MS
      : true
  );
  const hasTrackedView = useRef(false);

  useEffect(() => {
    if (focusHeading) heading.current?.focus({ preventScroll: true });
  }, [focusHeading]);

  // Deduped server-side (analytics_events unique index), so a StrictMode
  // double-invoke or a fast refresh never produces more than one row.
  useEffect(() => {
    if (hasTrackedView.current) return;
    hasTrackedView.current = true;
    recordPhoneWaitingRoomViewed().catch(() => {});
  }, []);

  // The copy confirmation is the button's own label for a moment, not a toast.
  useEffect(() => {
    if (copyState === "idle") return;
    const timeout = setTimeout(() => setCopyState("idle"), 2400);
    return () => clearTimeout(timeout);
  }, [copyState]);

  // Schedules the flip back to resendable once the cooldown window (started
  // by lastSentAt) elapses. lastSentAt changes always set canResend false
  // synchronously at the call site, so this effect only ever needs to
  // subscribe to the future transition, not assert the current state.
  useEffect(() => {
    if (!lastSentAt) return;
    const remaining = RESEND_COOLDOWN_MS - (Date.now() - new Date(lastSentAt).getTime());
    if (remaining <= 0) return;
    const timeout = setTimeout(() => setCanResend(true), remaining);
    return () => clearTimeout(timeout);
  }, [lastSentAt]);

  async function handleSendLink() {
    setSendState("sending");
    setSendError(null);
    try {
      const result = await requestDesktopLinkEmail();
      if (result.ok) {
        setLastSentAt(new Date().toISOString());
        setCanResend(false);
        setSendState("sent");
      } else {
        setSendState("error");
        setSendError(result.error ?? "Couldn’t send the email. Try again in a moment.");
      }
    } catch {
      setSendState("error");
      setSendError("You appear to be offline. Try again when you’re connected.");
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  async function handleCopyLink() {
    const url = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    try {
      await navigator.clipboard.writeText(url);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  const hasSentBefore = Boolean(lastSentAt);
  const showConfirmation = sendState === "sent" && !canResend;
  const sending = sendState === "sending";

  return (
    <section className="r2-handoff" aria-labelledby="r2-handoff-title">
      <h1 id="r2-handoff-title" ref={heading} tabIndex={-1}>
        {HEADLINES[variant]}
      </h1>
      <p className="r2-handoff-note">
        Sutura is currently in open beta. The full writing workspace is available on desktop, with mobile support on
        the way.
      </p>
      <p className="r2-handoff-next">
        Open <span className="r2-handoff-host">{SITE_HOST}</span>
        {NEXT_STEP[variant]}
      </p>

      <div className="r2-handoff-actions">
        {showConfirmation ? (
          <p className="r2-notice r2-handoff-sent" data-tone="success" role="status">
            <strong>Sent.</strong> Open the email on your computer when you&rsquo;re ready.
          </p>
        ) : (
          <button
            type="button"
            className="r2-button r2-button--primary r2-button--lg r2-handoff-button"
            onClick={handleSendLink}
            disabled={sending || (hasSentBefore && !canResend)}
            aria-busy={sending || undefined}
          >
            {sending ? "Sending…" : hasSentBefore ? "Email the link again" : "Email me a desktop link"}
          </button>
        )}

        {sendState === "error" && sendError && (
          <p role="alert" className="r2-notice r2-handoff-error" data-tone="danger">
            {sendError}
          </p>
        )}

        <button type="button" className="r2-button r2-button--lg r2-handoff-button" onClick={handleCopyLink}>
          {copyState === "copied" ? "Link copied" : copyState === "error" ? "Couldn’t copy the link" : "Copy link"}
        </button>
        <p className="r2-handoff-live" role="status" aria-live="polite">
          {copyState === "copied" ? "Link copied." : copyState === "error" ? "Couldn’t copy the link." : ""}
        </p>
      </div>

      <button
        type="button"
        className="r2-button r2-button--quiet r2-handoff-signout"
        onClick={handleSignOut}
        disabled={signingOut}
      >
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
    </section>
  );
}

const HANDOFF_TITLE = "Sutura";

interface PhoneWaitingRoomProps {
  variant: WaitingRoomVariant;
  initialEmailSentAt: string | null;
}

// A gated route on a phone: the handoff in Sutura's public frame, locked to
// Sutura Light — the wordmark above, the trust links at the foot. The
// writer's own theme is a desk preference; this is a door.
export function PhoneWaitingRoom({ variant, initialEmailSentAt }: PhoneWaitingRoomProps) {
  // The route's own metadata (a Project's title, "Settings") names a page the
  // phone is not showing; the tab says what is shown. The metadata streams in
  // after this mounts, so the title is held while the handoff stands.
  useEffect(() => {
    const hold = () => {
      if (document.title !== HANDOFF_TITLE) document.title = HANDOFF_TITLE;
    };
    hold();
    const observer = new MutationObserver(hold);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);
  return (
    <PublicFrame variant="auth" theme="light">
      <div className="r2-auth r2-wait">
        <DesktopHandoff variant={variant} initialEmailSentAt={initialEmailSentAt} />
      </div>
    </PublicFrame>
  );
}
