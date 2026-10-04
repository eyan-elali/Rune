import type { Metadata } from "next";
import LoginClient from "./LoginClient";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Sutura and get back to your manuscript.",
};

export default function LoginPage() {
  return <LoginClient />;
}
