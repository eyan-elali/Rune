"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type Mode = "password" | "magic-link";

interface LoginClientProps {
  /** True when a pending "Continue with Scribe" intent cookie is present. */
  hasScribeIntent?: boolean;
}

export default function LoginClient({ hasScribeIntent = false }: LoginClientProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();

    if (mode === "magic-link") {
      // Only override the redirect when a Scribe intent is pending — every
      // other magic-link sign-in keeps using the project's default
      // redirect, unchanged.
      const { error } = await supabase.auth.signInWithOtp({
        email,
        ...(hasScribeIntent && {
          options: {
            emailRedirectTo: (() => {
              const u = new URL("/auth/callback", window.location.origin);
              u.searchParams.set("next", "/auth/continue");
              return u.toString();
            })(),
          },
        }),
      });
      if (error) {
        setError(error.message);
      } else {
        setMagicSent(true);
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message);
      } else if (hasScribeIntent) {
        // A full navigation, not router.push: /auth/continue is a route
        // handler (no page.tsx), and it needs the session cookie
        // signInWithPassword just set to already be on the request.
        window.location.href = "/auth/continue";
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    }

    setLoading(false);
  }

  function toggleMode() {
    setMode((m) => (m === "password" ? "magic-link" : "password"));
    setError(null);
  }

  if (magicSent) {
    return (
      <div className="w-full max-w-sm">
        <div
          className="rounded-lg border px-8 py-10 text-center shadow-2xl"
          style={{
            background: "rgba(44, 36, 32, 0.55)",
            borderColor: "var(--color-border)",
          }}
        >
          <p className="font-rune-serif text-lg text-rune-parchment">
            Check your inbox
          </p>
          <p className="mt-2 text-sm text-stone-100">
            We sent a link to{" "}
            <span className="text-rune-gold">{email}</span>.
          </p>
          <button
            type="button"
            onClick={() => setMagicSent(false)}
            className="mt-5 text-xs text-stone-100 underline-offset-2 transition-colors hover:text-rune-gold hover:underline"
          >
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <div
        className="rounded-lg border px-8 py-8 shadow-2xl"
        style={{
          background: "rgba(44, 36, 32, 0.55)",
          borderColor: "var(--color-border)",
        }}
      >
        <h1
          className={`font-rune-serif text-xl text-stone-100 ${hasScribeIntent ? "!mb-1" : "!mb-4"}`}
        >
          {mode === "password" ? "Sign in" : "Sign in with link"}
        </h1>
        {hasScribeIntent && (
          <p className="!mb-4 text-xs text-stone-100/80">
            Sign in to continue with Scribe.
          </p>
        )}

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <Input
            label="Email"
            type="email"
            id="login-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            placeholder="you@example.com"
            authContrast
          />

          {mode === "password" && (
            <Input
              label="Password"
              type="password"
              id="login-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              placeholder="••••••••"
              authContrast
            />
          )}

          {error && (
            <p role="alert" aria-live="polite" className="text-xs text-rune-crimson">
              {error}
            </p>
          )}

          <Button
            type="submit"
            variant="primary"
            loading={loading}
            className="mt-1 w-full"
          >
            {mode === "magic-link" ? "Send Link" : "Sign In"}
          </Button>
        </form>

        <div
          className="mt-5 border-t pt-5"
          style={{ borderColor: "var(--color-border)" }}
        >
          <button
            type="button"
            onClick={toggleMode}
            className="w-full text-center text-xs text-stone-100 transition-colors hover:text-rune-gold"
          >
            {mode === "password"
              ? "Sign in with a link instead"
              : "Sign in with a password instead"}
          </button>
        </div>
      </div>

      <p className="mt-5 text-center text-xs text-stone-100">
        No account?{" "}
        <Link
          href="/signup"
          className="text-rune-gold transition-colors hover:text-rune-gold-dim"
        >
          Create one
        </Link>
      </p>

      <p
        className="mt-4 text-center leading-relaxed"
        style={{ fontSize: "0.7rem", color: "var(--color-mist)", opacity: 0.5 }}
      >
        By signing in you agree to our{" "}
        <Link
          href="/terms"
          className="transition-opacity duration-150 hover:opacity-100"
          style={{ color: "var(--color-gold)" }}
        >
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link
          href="/privacy"
          className="transition-opacity duration-150 hover:opacity-100"
          style={{ color: "var(--color-gold)" }}
        >
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
