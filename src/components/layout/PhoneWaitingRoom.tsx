"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PublicFrame } from "@/components/front/PublicFrame";
import "./waiting-room.css";
import {
  requestDesktopLinkEmail,
  triggerAutomaticDesktopLinkEmail,
  recordPhoneWaitingRoomViewed,
} from "@/lib/actions/waitingRoom";

export type WaitingRoomVariant = "new" | "returning";

// Mirrors the server-side cooldown in waitingRoom.ts. Display-only — the
// server remains the authority on whether a resend actually goes through.
const RESEND_COOLDOWN_MS = 45_000;

// What the onboarding journey on a desktop holds (lib/onboarding.ts).
const ANTICIPATION_STEPS = [
  "Name your story, or bring in a manuscript",
  "See how the Manuscript and the Workspace fit together",
  "Choose how Sutura looks",
  "Begin writing",
];

type CopyState = "idle" | "copied" | "error";

interface PhoneWaitingRoomProps {
  variant: WaitingRoomVariant;
  initialEmailSentAt: string | null;
}

type SendState = "idle" | "sending" | "sent" | "error";

export function PhoneWaitingRoom({ variant, initialEmailSentAt }: PhoneWaitingRoomProps) {
  const router = useRouter();
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
  const hasTriggeredAuto = useRef(false);
  const hasTrackedView = useRef(false);

  // Deduped server-side (analytics_events unique index), so a StrictMode
  // double-invoke or a fast refresh never produces more than one row.
  useEffect(() => {
    if (hasTrackedView.current) return;
    hasTrackedView.current = true;
    recordPhoneWaitingRoomViewed().catch(() => {});
  }, []);

  // Automatic desktop-link email: only for a brand-new, zero-project account
  // that has never received one before. The server independently re-checks
  // both conditions and claims the send atomically, so this effect firing
  // twice (or on every mount across repeat visits) can never double-send.
  useEffect(() => {
    if (hasTriggeredAuto.current) return;
    if (variant !== "new" || initialEmailSentAt) return;
    hasTriggeredAuto.current = true;
    triggerAutomaticDesktopLinkEmail()
      .then((result) => {
        if (result.sent) {
          setLastSentAt(new Date().toISOString());
          setCanResend(false);
          setSendState("sent");
        }
      })
      .catch(() => {
        // A failed automatic send must never block the waiting room.
      });
  }, [variant, initialEmailSentAt]);

  // Schedules the flip back to resendable once the cooldown window (started
  // by lastSentAt) elapses. lastSentAt changes always set canResend false
  // synchronously at the call site, so this effect only ever needs to
  // subscribe to the future transition, not assert the current state.
  // The copy confirmation is the button's own label for a moment, not a toast.
  useEffect(() => {
    if (copyState === "idle") return;
    const timeout = setTimeout(() => setCopyState("idle"), 2400);
    return () => clearTimeout(timeout);
  }, [copyState]);

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
    const result = await requestDesktopLinkEmail();
    if (result.ok) {
      setLastSentAt(new Date().toISOString());
      setCanResend(false);
      setSendState("sent");
    } else {
      setSendState("error");
      setSendError(result.error ?? "Couldn't send the email. Try again in a moment.");
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

  // Sutura's public frame, locked to Sutura Light: the wordmark leading one
  // material card, the trust links at the foot. The writer's own theme is a
  // desk preference; this is a door.
  return (
    <PublicFrame variant="auth" theme="light">
      <div className="r2-auth r2-wait">
        <div className="r2-auth-card r2-wait-card">
          <h1>{variant === "new" ? "Welcome to Sutura." : "Welcome back."}</h1>

          {variant === "new" ? (
            <div className="r2-wait-copy">
              <p>Your account is ready.</p>
              <p>
                Sutura is designed for long-form writing, so your first writing session begins on a desktop or
                supported tablet.
              </p>
            </div>
          ) : (
            <div className="r2-wait-copy">
              <p>
                Sutura is designed for long-form writing, so your manuscript stays on a desktop or supported
                tablet — pick up exactly where you left off.
              </p>
            </div>
          )}

          {variant === "new" && (
            <section className="r2-wait-steps" aria-labelledby="r2-wait-steps-label">
              <p id="r2-wait-steps-label" className="r2-wait-eyebrow">
                When you open Sutura, you&rsquo;ll
              </p>
              <ol>
                {ANTICIPATION_STEPS.map((step, i) => (
                  <li key={step}>
                    <span className="r2-wait-step-n" aria-hidden="true">
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <p className="r2-wait-desk">Your writing desk will be waiting.</p>

          <div className="r2-wait-actions">
            {showConfirmation ? (
              <div className="r2-notice r2-wait-sent" data-tone="success" role="status">
                <strong>Sent.</strong> Open the email on your computer when you&rsquo;re ready to begin.
              </div>
            ) : (
              <button
                type="button"
                className="r2-button r2-button--primary r2-button--lg r2-wait-button"
                onClick={handleSendLink}
                disabled={sending || (hasSentBefore && !canResend)}
                aria-busy={sending || undefined}
              >
                {sending ? "Sending…" : hasSentBefore ? "Send again" : "Email me my desktop link"}
              </button>
            )}

            {sendState === "error" && sendError && (
              <p role="alert" className="r2-notice r2-wait-error" data-tone="danger">
                {sendError}
              </p>
            )}

            <button type="button" className="r2-button r2-button--lg r2-wait-button" onClick={handleCopyLink}>
              {copyState === "copied"
                ? "Desktop link copied"
                : copyState === "error"
                  ? "Couldn\u2019t copy the link"
                  : "Copy desktop link"}
            </button>
            <p className="r2-wait-live" role="status" aria-live="polite">
              {copyState === "copied"
                ? "Desktop link copied."
                : copyState === "error"
                  ? "Couldn’t copy the link."
                  : ""}
            </p>
          </div>

          <div className="r2-auth-card-foot r2-wait-foot">
            <button
              type="button"
              className="r2-button r2-button--quiet r2-wait-signout"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      </div>
    </PublicFrame>
  );
}
