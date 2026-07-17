"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { getPenNameValidationError } from "@/lib/penName";
import { completePenName } from "@/lib/actions/profile";

export default function CompleteProfileClient() {
  const router = useRouter();
  const [penName, setPenName] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const validationError = getPenNameValidationError(penName);
    if (validationError) {
      setFieldError(validationError);
      return;
    }
    setFieldError(undefined);
    setLoading(true);

    const result = await completePenName(penName);

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    const redirectTo = result.redirectTo ?? "/dashboard";
    if (redirectTo === "/auth/continue") {
      // /auth/continue is a route handler, not a page — a full navigation
      // ensures it actually runs server-side rather than 404ing under
      // client-side RSC navigation.
      window.location.href = redirectTo;
      return;
    }
    router.push(redirectTo);
    router.refresh();
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
        <h1 className="!mb-2 font-rune-serif text-xl text-stone-100">
          Choose your pen name.
        </h1>
        <p className="!mb-6 text-sm text-stone-100/80">
          This is the name Rune will use throughout your writing space.
        </p>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <Input
            label="Pen name"
            type="text"
            id="complete-profile-pen-name"
            value={penName}
            onChange={(e) => setPenName(e.target.value)}
            autoComplete="name"
            autoFocus
            required
            maxLength={40}
            placeholder="Your pen name"
            error={fieldError}
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
            Continue
          </Button>
        </form>
      </div>
    </div>
  );
}
