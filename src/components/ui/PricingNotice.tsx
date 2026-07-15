"use client";

import { useState, useCallback, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { declinePricingNotice, createFoundingCheckoutSession } from "@/lib/actions/pricing";

type Stage = "notice" | "dismissed";

// createPortal needs `document`, which doesn't exist during SSR (this
// component is server-rendered as part of the client-component tree, then
// hydrated) — so the very first client render must still produce the same
// "nothing rendered" output the server did, or React logs a hydration
// mismatch. A `useState(false) + useEffect(() => setState(true), [])` pair
// works but trips react-hooks/set-state-in-effect; useSyncExternalStore is
// the mechanism React itself recommends for exactly this "differs between
// server and client, flips once after hydration commits" case — the
// subscribe callback never fires (the value never changes again after
// mount), so this is a read, not a mutation loop.
const subscribeNever = () => () => {};
function useIsClient(): boolean {
  return useSyncExternalStore(subscribeNever, () => true, () => false);
}

export function PricingNotice() {
  const [stage, setStage] = useState<Stage>("notice");
  const mounted = useIsClient();
  const [decliningLoading, setDecliningLoading] = useState(false);
  const [foundingLoading, setFoundingLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleKeepFree = useCallback(async () => {
    if (decliningLoading || foundingLoading) return;
    setDecliningLoading(true);
    setErrorMsg("");
    const { error } = await declinePricingNotice();
    setDecliningLoading(false);
    if (error) {
      setErrorMsg("Something went wrong — please try again.");
      return;
    }
    setStage("dismissed");
  }, [decliningLoading, foundingLoading]);

  const handleBecomeFounder = useCallback(async () => {
    if (decliningLoading || foundingLoading) return;
    setFoundingLoading(true);
    setErrorMsg("");
    const { url, error } = await createFoundingCheckoutSession();
    if (error || !url) {
      setFoundingLoading(false);
      setErrorMsg(error ?? "Couldn't start checkout — please try again.");
      return;
    }
    window.location.href = url;
    // Deliberately not resetting foundingLoading — the page is navigating
    // away to Stripe Checkout.
  }, [decliningLoading, foundingLoading]);

  if (!mounted || stage === "dismissed") return null;

  return createPortal(
    <>
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(26,22,20,0.72)",
          zIndex: 199,
          pointerEvents: "none",
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pricing-notice-heading"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 202,
          width: "480px",
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "calc(100vh - 64px)",
          overflowY: "auto",
          background: "var(--color-sepia)",
          border: "1px solid var(--color-border-strong)",
          borderRadius: "10px",
          padding: "32px 28px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
        }}
      >
        <p
          className="font-rune-sans text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--color-gold)", marginBottom: "10px", letterSpacing: "0.12em" }}
        >
          A note for early writers
        </p>

        <h2
          id="pricing-notice-heading"
          className="font-rune-serif text-2xl"
          style={{ color: "var(--text-primary)", marginBottom: "16px" }}
        >
          Rune&rsquo;s free plan is changing.
        </h2>

        <p
          className="font-rune-serif text-sm leading-relaxed"
          style={{ color: "var(--color-mist)", marginBottom: "12px" }}
        >
          New writers will now be able to write their first 2,000 words free before choosing
          Scribe.
        </p>
        <p
          className="font-rune-serif text-sm leading-relaxed"
          style={{ color: "var(--color-mist)", marginBottom: "20px" }}
        >
          You joined Rune early, so your account will keep its original 15,000-word allowance.
          Nothing is being taken away.
        </p>

        <div
          style={{
            borderTop: "1px solid var(--color-border)",
            paddingTop: "20px",
            marginBottom: "8px",
          }}
        >
          <p
            className="font-rune-serif text-sm leading-relaxed"
            style={{ color: "var(--text-primary)", marginBottom: "10px" }}
          >
            Because you were here at the beginning, this is your one opportunity to become a
            Founding Scribe for <strong style={{ color: "var(--color-gold)" }}>$6.99/month</strong>.
          </p>
          <p
            className="font-rune-serif text-sm leading-relaxed"
            style={{ color: "var(--color-mist)", marginBottom: "12px" }}
          >
            Your founding price remains yours for as long as your subscription stays active.
            Standard Scribe is $9.99/month.
          </p>
          <p
            className="font-rune-sans text-xs italic"
            style={{ color: "var(--color-mist)", opacity: 0.75, marginBottom: "22px" }}
          >
            This founding offer is available only through this notice.
          </p>
        </div>

        {errorMsg && (
          <p
            className="font-rune-sans text-xs"
            style={{ color: "var(--color-crimson)", marginBottom: "16px" }}
          >
            {errorMsg}
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <button
            type="button"
            onClick={handleBecomeFounder}
            disabled={decliningLoading || foundingLoading}
            className="font-rune-serif text-sm font-medium transition-opacity duration-150"
            style={{
              background: "var(--color-gold)",
              color: "var(--color-ink)",
              padding: "12px 20px",
              borderRadius: "6px",
              opacity: decliningLoading || foundingLoading ? 0.6 : 1,
              cursor: decliningLoading || foundingLoading ? "default" : "pointer",
            }}
          >
            {foundingLoading ? "Opening checkout…" : "Become a Founding Scribe — $6.99/month"}
          </button>

          <button
            type="button"
            onClick={handleKeepFree}
            disabled={decliningLoading || foundingLoading}
            className="font-rune-serif text-sm transition-opacity duration-150"
            style={{
              background: "transparent",
              border: "1px solid var(--color-border-strong)",
              color: "var(--text-primary)",
              padding: "12px 20px",
              borderRadius: "6px",
              opacity: decliningLoading || foundingLoading ? 0.5 : 0.9,
              cursor: decliningLoading || foundingLoading ? "default" : "pointer",
            }}
          >
            {decliningLoading ? "One moment…" : "Keep my 15,000 free words"}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
