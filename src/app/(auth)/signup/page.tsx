import type { Metadata } from "next";
import SignupClient from "./SignupClient";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Sutura is in closed beta. Create your account with the email your invitation was sent to.",
};

export default function SignupPage() {
  return <SignupClient />;
}
