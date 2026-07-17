import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PURCHASE_INTENT_COOKIE, parsePurchaseIntent } from "@/lib/purchaseIntent";
import SignupClient from "./SignupClient";

export const metadata: Metadata = {
  title: "Create account — Rune",
  description: "Create a free Rune account and start writing today.",
};

export default async function SignupPage() {
  const cookieStore = await cookies();
  const intent = parsePurchaseIntent(cookieStore.get(PURCHASE_INTENT_COOKIE)?.value);

  return <SignupClient hasScribeIntent={intent !== null} />;
}
