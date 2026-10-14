import type { Metadata } from "next";
import SignupClient from "./SignupClient";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Create your Sutura account. Sutura is in Early Access and free to use.",
};

export default function SignupPage() {
  return <SignupClient />;
}
