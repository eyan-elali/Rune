"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type Mode = "password" | "magic-link";

export default function LoginClient() {
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
      const { error } = await supabase.auth.signInWithOtp({ email });
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
          <p className="mt-2 text-sm text-rune-mist">
            We sent a magic link to{" "}
            <span className="text-rune-gold">{email}</span>.
          </p>
          <button
            type="button"
            onClick={() => setMagicSent(false)}
            className="mt-5 text-xs text-rune-mist underline-offset-2 hover:text-rune-gold transition-colors hover:underline"
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
        <h1 className="!mb-4 font-rune-serif text-xl text-rune-parchment">
          {mode === "password" ? "Sign in" : "Sign in with magic link"}
        </h1>

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
            {mode === "magic-link" ? "Send Magic Link" : "Sign In"}
          </Button>
        </form>

        <div
          className="mt-5 border-t pt-5"
          style={{ borderColor: "var(--color-border)" }}
        >
          <button
            type="button"
            onClick={toggleMode}
            className="w-full text-center text-xs text-rune-mist transition-colors hover:text-rune-gold"
          >
            {mode === "password"
              ? "Sign in with a magic link instead"
              : "Sign in with a password instead"}
          </button>
        </div>
      </div>

      <p className="mt-5 text-center text-xs text-rune-mist">
        No account?{" "}
        <Link
          href="/signup"
          className="text-rune-gold transition-colors hover:text-rune-gold-dim"
        >
          Create one
        </Link>
      </p>
    </div>
  );
}
