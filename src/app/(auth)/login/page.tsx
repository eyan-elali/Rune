import type { Metadata } from "next";
import LoginClient from "./LoginClient";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Sutura and get back to your manuscript.",
};

// The auth callback sends a confirmation or sign-in link that could not be
// used (expired, already used, opened in another browser) here with
// ?error=confirmation_failed; Sign in says so in a sentence.
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const { error } = await searchParams;
  return <LoginClient linkFailed={error === "confirmation_failed"} />;
}
