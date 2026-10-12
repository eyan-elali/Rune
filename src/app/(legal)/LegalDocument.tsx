import type { ReactNode } from "react";

// The pieces of a legal document (legal.css): its head, its numbered
// sections, a term set in bold, and a mail link. Shared by /privacy and /terms.

export function LegalHead({ title, updated }: { title: string; updated: string }) {
  return (
    <header className="r2-legal-head">
      <p className="r2-legal-eyebrow">Sutura</p>
      <h1 className="r2-legal-title">{title}</h1>
      <p className="r2-legal-updated">Last updated {updated}</p>
    </header>
  );
}

export function LegalBody({ children }: { children: ReactNode }) {
  return <div className="r2-legal-body">{children}</div>;
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="r2-legal-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function Em({ children }: { children: ReactNode }) {
  return <strong>{children}</strong>;
}

export function MailLink({ address }: { address: string }) {
  return <a href={`mailto:${address}`}>{address}</a>;
}
