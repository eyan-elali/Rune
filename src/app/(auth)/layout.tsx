import type { ReactNode } from "react";
import { PublicFrame } from "@/components/front/PublicFrame";

// Sign in, sign up and the pen name (Beta Completion E): in Rune 2.0's own
// frame, the same as the front door's.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <PublicFrame>
      <div className="r2-auth">{children}</div>
    </PublicFrame>
  );
}
