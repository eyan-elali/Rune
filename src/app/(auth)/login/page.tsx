import type { Metadata } from "next";
import LoginClient from "./LoginClient";

export const metadata: Metadata = {
  title: "Sign in — Rune",
  description: "Sign in to your Rune account and get back to writing.",
};

export default function LoginPage() {
  return <LoginClient />;
}
