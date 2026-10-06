import type { ReactNode } from "react";
import { PublicFrame } from "@/components/front/PublicFrame";

// Sign in, sign up and the pen name (Beta Completion E): in Rune 2.0's own
// frame, the front door's, composed for a form — the wordmark leading one
// material card, centred in the viewport.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <PublicFrame variant="auth">
      <div className="r2-auth">{children}</div>
    </PublicFrame>
  );
}
