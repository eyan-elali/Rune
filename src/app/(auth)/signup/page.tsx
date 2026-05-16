import type { Metadata } from "next";
import SignupClient from "./SignupClient";

export const metadata: Metadata = {
  title: "Create account — Rune",
  description: "Create a free Rune account and start writing today.",
};

export default function SignupPage() {
  return <SignupClient />;
}
