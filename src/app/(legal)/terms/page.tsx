import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Rune",
  description: "The terms on which Rune, a writing companion for novelists, is offered during its closed beta.",
};

// Closed-beta Terms (pre-beta audit, sections W–Y). The Rune 1.x commercial
// language (Scribe/Arcane plans, word limits, refunds, 30-day retention after
// termination) is gone: billing is switched off in code (lib/beta.ts
// BILLING_OPEN) and account deletion is immediate (lib/actions/settings.ts).
// Positions that are business or legal decisions — governing law and forum,
// the liability cap, the age floor — are kept neutral or as they were and
// are listed in the audit report for the founder and professional review.
// This is not legal advice.

const LAST_UPDATED = "October 4, 2026";
const SUPPORT_EMAIL = "support@rune-app.com";
const PRIVACY_EMAIL = "privacy@rune-app.com";

export default function TermsPage() {
  return (
    <article>
      {/* Page header */}
      <header className="mb-14">
        <div
          className="mb-6 h-px w-10"
          style={{
            background: "linear-gradient(90deg, var(--color-gold), transparent)",
            opacity: 0.55,
          }}
          aria-hidden
        />
        <h1
          className="font-rune-serif leading-tight"
          style={{
            fontSize: "clamp(2rem, 5vw, 2.8rem)",
            color: "var(--color-gold)",
            letterSpacing: "0.02em",
          }}
        >
          Terms of Service
        </h1>
        <p
          className="mt-3 text-xs uppercase tracking-widest"
          style={{ color: "var(--color-mist)", opacity: 0.5, letterSpacing: "0.18em" }}
        >
          Last updated: {LAST_UPDATED}
        </p>
      </header>

      {/* Body */}
      <div
        className="space-y-12 font-rune-serif leading-[1.9]"
        style={{ fontSize: "1rem", color: "var(--color-mist)" }}
      >
        <p>
          These terms govern your use of Rune (the “Service”), a writing companion for novelists operated from
          Québec, Canada. By creating an account or using the Service you agree to them and to the{" "}
          <a href="/privacy" style={{ color: "var(--color-gold)" }}>
            Privacy Policy
          </a>
          . If you do not agree, please do not use Rune.
        </p>

        <Section title="1. Rune is in closed beta">
          <p>
            Rune is currently offered as a free, invite-only closed beta. Access is given by hand to the email
            addresses we invite; joining the waitlist does not create an account or guarantee an invitation.
            There is no paid plan, no trial and no charge of any kind during the beta.
          </p>
          <p>
            A beta is unfinished by definition. Features will change, be added, be removed or behave
            unexpectedly as we learn from the writers using it. We may change, pause or end the beta, or move
            the Service to a different model (including paid plans) in the future. Before any paid plan applies
            to you, we will tell you and ask you to accept new terms; nothing in these terms commits you to
            paying anything.
          </p>
        </Section>

        <Section title="2. Your account">
          <p>
            You need an account to use Rune. Keep your sign-in details to yourself; you are responsible for what
            happens under your account, and you should tell us at once if you believe it has been used without
            your permission. Give us an email address we can reach you at.
          </p>
          <p>
            You must be at least 13 years old to use Rune. Rune is written for adult novelists and is not
            directed at children; if you are a minor where you live, use Rune only with the agreement of a parent
            or guardian.
          </p>
        </Section>

        <Section title="3. Your writing is yours">
          <p>
            Everything you write or add to Rune — manuscripts, chapters, scenes, notes, workspace pages,
            collections, canvases, images and anything else you create (“your Content”) — belongs to you. Rune
            claims no ownership of it and no rights in it beyond the limited permission below.
          </p>
          <p>
            So that Rune can work, you give us permission to store your Content, keep it in sync between your
            devices, back it up, display it to you, count its words for your own progress, and produce the exports
            and backups you ask for. That permission exists only to operate the Service for you, lasts only while
            your Content is in Rune, and is the whole of it.
          </p>
          <p>
            Rune will never use your Content to train or improve artificial-intelligence or machine-learning
            models, never sell or license it, and never share it with third parties except the providers that
            host the Service for us (named in the Privacy Policy) or when the law requires. Rune will never use
            AI to write, rewrite, or complete your story.
          </p>
          <p>
            You are responsible for your Content. You confirm that you have the right to put it in Rune and that
            it does not infringe anyone else’s rights or break the law.
          </p>
        </Section>

        <Section title="4. Export, backups and your own copies">
          <p>
            You can export your manuscript, download a complete backup of a project and download your projects’
            manuscripts from Settings at any time, including after the beta ends and whatever your account’s
            standing. We will never hold your writing hostage: reading and exporting your Content stay available
            even if other parts of the Service are withdrawn.
          </p>
          <p>
            Rune saves your work automatically and keeps copies to recover from failures, but it is beta software
            run by a very small team. Keep your own backups. Rune is not a substitute for them, and you should not
            rely on Rune as the only copy of your manuscript.
          </p>
        </Section>

        <Section title="5. What you agree not to do">
          <p>
            Do not use Rune to store or share content that is unlawful, that infringes others’ rights, or that
            you have no right to use. Do not try to get into other accounts or parts of the Service you are not
            meant to reach, probe or overload the Service, upload malicious code, or use automated tools to use
            the Service at a rate no writer could. Do not resell access to Rune or let others use your
            invitation. Do not try to circumvent the beta’s invitation.
          </p>
        </Section>

        <Section title="6. Rune’s own material">
          <p>
            The Service itself — its design, interface, name, wordmark and code — belongs to Rune and its
            licensors and is protected by copyright and trademark law. You may not copy, modify, redistribute or
            reverse-engineer it, except where the law allows. Your Content is not Rune’s material.
          </p>
        </Section>

        <Section title="7. Feedback">
          <p>
            The beta exists to be improved by your feedback. Suggestions, bug reports and ideas you send us may
            be used freely to improve Rune without any obligation to you. This never extends to your Content,
            which Section 3 governs.
          </p>
        </Section>

        <Section title="8. Availability">
          <p>
            Rune is provided on an “as is” and “as available” basis. We do not promise that the Service will be
            uninterrupted, timely, error-free or available at any particular moment, and we may take it down for
            maintenance or to fix a problem without notice. Offline work in your browser is a convenience, not a
            guarantee.
          </p>
        </Section>

        <Section title="9. Ending your use">
          <p>
            You can delete your account at any time in Settings. Deletion is immediate and permanent: your
            account and every project in it, including Trash, are deleted and cannot be recovered by us. Export
            first. The Privacy Policy describes the minimal record that remains.
          </p>
          <p>
            We may suspend or close your account if you break these terms, if we must for legal or security
            reasons, or when the beta ends. Except where immediate action is needed, we will tell you and give
            you a reasonable chance to export your Content. Closing the beta or an account never makes you owe
            us anything.
          </p>
        </Section>

        <Section title="10. No warranties">
          <p>
            To the fullest extent the law allows, Rune disclaims all warranties, express or implied, including
            merchantability, fitness for a particular purpose and non-infringement. Some places do not allow
            certain warranties to be excluded, in which case those exclusions apply to you only as far as the law
            permits. Nothing in these terms limits any protection the law gives you as a consumer that cannot be
            waived.
          </p>
        </Section>

        <Section title="11. Limitation of liability">
          <p>
            To the fullest extent the law allows, Rune and the people who run it are not liable for indirect,
            incidental, special, consequential or punitive damages, or for loss of data, profits or goodwill,
            arising from your use of or inability to use the Service, even if we were told such loss was
            possible. Because the beta is free, Rune’s total liability to you for all claims relating to the
            Service is limited to the greater of the amount you paid Rune in the twelve months before the claim
            and one hundred dollars. This section does not limit liability that the law does not allow to be
            limited.
          </p>
        </Section>

        <Section title="12. Governing law and disputes">
          <p>
            These terms are governed by the laws of the Province of Québec and the federal laws of Canada that
            apply there, without regard to conflict-of-law rules, except where the law of the place you live gives
            you protections that cannot be set aside. If something goes wrong, write to us first at{" "}
            <MailLink address={SUPPORT_EMAIL} /> and we will try to resolve it with you. Any dispute we cannot
            resolve together will be brought before the courts of Québec, unless the law of the place you live
            requires otherwise.
          </p>
          <p>
            If any part of these terms is found unenforceable, the rest continues to apply, and that part is
            limited to the minimum extent needed.
          </p>
        </Section>

        <Section title="13. Changes to these terms">
          <p>
            We will update these terms as Rune moves out of beta, and in particular before introducing any paid
            plan. When we make a material change we will update the date at the top of this page and tell
            signed-in writers inside Rune or by email. Continued use after a change means you accept the updated
            terms; if you do not, export your writing and delete your account.
          </p>
        </Section>

        <Section title="14. Contact">
          <p>
            Questions about these terms, your account or your writing: <MailLink address={SUPPORT_EMAIL} />.
            Questions about your personal information: <MailLink address={PRIVACY_EMAIL} />.
          </p>
        </Section>

        {/* Closing ornament */}
        <div
          className="mt-16 flex items-center gap-4"
          aria-hidden
        >
          <div
            className="h-px flex-1"
            style={{ background: "var(--color-border)" }}
          />
          <span
            className="font-rune-serif text-lg"
            style={{ color: "var(--color-gold)", opacity: 0.25 }}
          >
            ✦
          </span>
          <div
            className="h-px flex-1"
            style={{ background: "var(--color-border)" }}
          />
        </div>
      </div>
    </article>
  );
}

function MailLink({ address }: { address: string }) {
  return (
    <a
      href={`mailto:${address}`}
      className="transition-colors duration-150"
      style={{ color: "var(--color-gold)" }}
    >
      {address}
    </a>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2
        className="mb-5 font-rune-serif leading-snug"
        style={{
          fontSize: "1.15rem",
          color: "var(--color-parchment)",
          letterSpacing: "0.01em",
        }}
      >
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
