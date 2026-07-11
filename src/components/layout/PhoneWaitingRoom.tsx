"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToastStore } from "@/store/toastStore";
import { Button } from "@/components/ui/Button";

export type WaitingRoomVariant = "new" | "returning";

const COPY: Record<
  WaitingRoomVariant,
  { heading: string; body: string; supporting: string }
> = {
  new: {
    heading: "Welcome to Rune.",
    body: "Your account is ready. Rune is designed for long-form writing, so onboarding begins on a desktop or tablet.",
    supporting: "Open Rune there and sign in to begin your story.",
  },
  returning: {
    heading: "Welcome back.",
    body: "Rune is built for focused writing on a desktop or tablet.",
    supporting: "Your manuscripts are safe and waiting when you return at a larger screen.",
  },
};

interface PhoneWaitingRoomProps {
  variant: WaitingRoomVariant;
}

export function PhoneWaitingRoom({ variant }: PhoneWaitingRoomProps) {
  const router = useRouter();
  const showToast = useToastStore((s) => s.showToast);
  const [signingOut, setSigningOut] = useState(false);
  const copy = COPY[variant];

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
      showToast("Link copied", "success");
    } catch {
      showToast("Couldn't copy the link", "error");
    }
  }

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-6"
      style={{ background: "var(--bg-primary)" }}
    >
      <main className="w-full max-w-[440px] text-center">
        <span
          className="mb-10 inline-block select-none font-rune-serif text-2xl"
          style={{ color: "var(--color-gold)", letterSpacing: "0.3em", fontStyle: "italic" }}
          aria-hidden="true"
        >
          Rune
        </span>

        <h1
          className="font-rune-serif text-4xl font-semibold leading-tight"
          style={{ color: "var(--color-ink)" }}
        >
          {copy.heading}
        </h1>

        <p
          className="mt-5 font-rune-serif text-lg leading-relaxed"
          style={{ color: "var(--color-ink)", opacity: 0.85 }}
        >
          {copy.body}
        </p>

        <p className="mt-3 text-base italic" style={{ color: "var(--color-mist)" }}>
          {copy.supporting}
        </p>

        <div
          className="mx-auto mt-10 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs uppercase tracking-widest"
          style={{
            border: "1px solid var(--color-border-strong)",
            color: "var(--color-mist)",
          }}
        >
          Desktop or tablet recommended
        </div>

        <p className="mt-8 text-sm leading-relaxed" style={{ color: "var(--color-mist)" }}>
          Open <span style={{ color: "var(--color-ink)" }}>rune-app.com</span> on your
          computer or tablet and sign in with the same account.
        </p>

        <p className="mt-2 text-sm italic" style={{ color: "var(--color-mist)" }}>
          Your account is ready and your work will be waiting.
        </p>

        <div className="mt-12 flex flex-col items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={handleCopyLink}
            className="w-full max-w-[240px]"
          >
            Copy Rune&rsquo;s Link
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={handleSignOut}
            loading={signingOut}
            className="w-full max-w-[240px]"
          >
            Sign Out
          </Button>
        </div>
      </main>
    </div>
  );
}
