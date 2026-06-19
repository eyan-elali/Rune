"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface FieldErrors {
  password?: string;
  confirmPassword?: string;
}

export default function SignupClient() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const errors: FieldErrors = {};
    if (password.length < 8) {
      errors.password = "Password must be at least 8 characters.";
    }
    if (password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match.";
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: (() => {
          const u = new URL('/auth/callback', window.location.origin)
          u.searchParams.set('next', '/dashboard')
          u.searchParams.set('intent', 'signup')
          return u.toString()
        })(),
      },
    });

    if (error) {
      setError(error.message);
    } else {
      setConfirmed(true);
    }
    setLoading(false);
  }

  if (confirmed) {
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
            Check your email
          </p>
          <p className="mt-2 text-sm text-stone-100">
            We sent a confirmation link to{" "}
            <span className="text-rune-gold">{email}</span>. Click it to
            activate your account.
          </p>
        </div>
        <p className="mt-5 text-center text-xs text-stone-100">
          <Link
            href="/login"
            className="text-rune-gold transition-colors hover:text-rune-gold-dim"
          >
            Back to sign in
          </Link>
        </p>
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
        <h1 className="!mb-6 font-rune-serif text-xl text-stone-100">
          Create your account
        </h1>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <Input
            label="Display Name"
            type="text"
            id="signup-display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="name"
            required
            placeholder="Your pen name"
            authContrast
          />
          <Input
            label="Email"
            type="email"
            id="signup-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            placeholder="you@example.com"
            authContrast
          />
          <Input
            label="Password"
            type="password"
            id="signup-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            placeholder="At least 8 characters"
            error={fieldErrors.password}
            authContrast
          />
          <Input
            label="Confirm Password"
            type="password"
            id="signup-confirm-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
            placeholder="••••••••"
            error={fieldErrors.confirmPassword}
            authContrast
          />

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
            Create Account
          </Button>
        </form>
      </div>

      <p className="mt-5 text-center text-xs text-stone-100">
        Already have an account?{" "}
        <Link
          href="/login"
          className="text-rune-gold transition-colors hover:text-rune-gold-dim"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
