import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PURCHASE_INTENT_COOKIE, parsePurchaseIntent } from "@/lib/purchaseIntent";
import LoginClient from "./LoginClient";

export const metadata: Metadata = {
  title: "Sign in — Rune",
  description: "Sign in to your Rune account and get back to writing.",
};

export default async function LoginPage() {
  const cookieStore = await cookies();
  const intent = parsePurchaseIntent(cookieStore.get(PURCHASE_INTENT_COOKIE)?.value);

  return <LoginClient hasScribeIntent={intent !== null} />;
}
