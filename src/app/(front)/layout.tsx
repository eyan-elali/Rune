import type { ReactNode } from "react";

// The front door's layout: the page, and over it the Center Peek slot
// (@peek). From the landing page, a feature's link is intercepted
// (@peek/(open)/(.)features/[slug], (.)principles/no-ai) and the feature
// opens as a large peek over the landing, which stays exactly as it was —
// the `children` slot keeps its state while only this slot changes. A
// direct visit, a refresh or a search engine gets the feature's own page
// (features/<slug>/page.tsx) and an empty slot (@peek/default.tsx).
export default function FrontLayout({ children, peek }: { children: ReactNode; peek: ReactNode }) {
  return (
    <>
      {children}
      {peek}
    </>
  );
}
