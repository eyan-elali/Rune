import type { ReactNode } from "react";
import { PublicFrame } from "@/components/front/PublicFrame";
import "./legal.css";

// The Privacy Policy and the Terms: Sutura's public frame (the wordmark in
// the head, the trust links at the foot), locked to Sutura Light — a public
// page with one appearance, as the front door and the feature pages are.
// The document is one readable column (legal.css).
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <PublicFrame variant="front" theme="light">
      <div className="r2-legal">{children}</div>
    </PublicFrame>
  );
}
