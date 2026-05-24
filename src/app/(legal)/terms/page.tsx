import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Rune",
  description: "Read the Terms of Service for Rune, the gamified writing environment.",
};

const LAST_UPDATED = "May 24, 2026";

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
        <Section title="1. Acceptance of Terms">
          <p>
            By accessing or using Rune (the &quot;Service&quot;), you agree to be
            bound by these Terms of Service and all applicable laws and regulations.
            If you do not agree with any of these terms, you are prohibited from
            using or accessing the Service.
          </p>
          <p>
            These Terms apply to all visitors, users, and others who access or use
            Rune. We reserve the right to update these Terms at any time, and your
            continued use of the Service after changes constitutes your acceptance of
            the revised Terms.
          </p>
        </Section>

        <Section title="2. Description of Service">
          <p>
            Rune is a web-based, gamified writing environment designed to help writers
            produce first drafts through structured focus tools, competitive game
            modes, and a progression system. The Service includes a distraction-free
            text editor, project and chapter management, game sessions (Race Yourself
            and Battle Mode), and an XP and unlockables system.
          </p>
          <p>
            Rune is provided &quot;as is&quot; and we reserve the right to modify,
            suspend, or discontinue any part of the Service at any time with
            reasonable notice. New features or tools added to the current Service
            shall also be subject to these Terms.
          </p>
        </Section>

        <Section title="3. User Accounts">
          <p>
            To access certain features of the Service, you must register for an
            account. You agree to provide accurate, current, and complete information
            during registration, and to update that information to keep it accurate.
            You are responsible for maintaining the confidentiality of your account
            credentials and for all activities that occur under your account.
          </p>
          <p>
            You must be at least 13 years of age to use the Service. By creating an
            account, you represent that you meet this requirement. We reserve the
            right to terminate accounts that we determine, in our sole discretion,
            to be in violation of these Terms.
          </p>
        </Section>

        <Section title="4. Subscription and Billing">
          <p>
            Rune offers a free tier and paid subscription plans (&quot;Scribe&quot;
            and &quot;Arcane&quot;). Paid plans are billed on a recurring monthly
            basis via Stripe. By subscribing, you authorize Rune to charge your
            payment method on the billing cycle selected at checkout.
          </p>
          <p>
            You may cancel your subscription at any time through your account
            settings. Cancellation takes effect at the end of the current billing
            period; no refunds are issued for partial periods. We reserve the right
            to modify pricing with at least 30 days' notice to active subscribers.
          </p>
        </Section>

        <Section title="5. User Content">
          <p>
            You retain full ownership of all writing and content you create within
            Rune (your &quot;User Content&quot;). By using the Service, you grant Rune
            a limited, non-exclusive, royalty-free license solely to store, display,
            and transmit your User Content for the purpose of operating the Service
            and no other purpose.
          </p>
          <p>
            You are solely responsible for your User Content and the consequences of
            sharing or publishing it. You represent that you own or have the necessary
            rights to your User Content and that it does not violate any third-party
            rights or applicable laws. Rune will never use your User Content to train
            machine learning models or for any AI-related purpose.
          </p>
        </Section>

        <Section title="6. Intellectual Property">
          <p>
            The Service and its original content — including the application
            interface, branding, game mechanics, visual design, and underlying
            code — are and will remain the exclusive property of Rune and its
            licensors. These materials are protected by copyright, trademark, and
            other intellectual property laws.
          </p>
          <p>
            You may not reproduce, distribute, modify, create derivative works of, or
            publicly display any part of the Service without our express prior written
            consent. The Rune name, wordmark, and associated trade dress are
            trademarks and may not be used in connection with any product or service
            without our prior written permission.
          </p>
        </Section>

        <Section title="7. Prohibited Conduct">
          <p>
            You agree not to use the Service to: upload or transmit malicious code;
            attempt to gain unauthorized access to any part of the Service or its
            related systems; reverse engineer, decompile, or disassemble any portion
            of the Service; or use the Service in any manner that could damage,
            disable, or impair it.
          </p>
          <p>
            You also agree not to use automated tools to access the Service at a rate
            exceeding what a human user could reasonably generate, to harvest or
            collect user information, or to interfere with the game integrity systems
            (including artificial word-count inflation). Violations may result in
            immediate account termination.
          </p>
        </Section>

        <Section title="8. Termination">
          <p>
            We may terminate or suspend your account immediately, without prior notice
            or liability, for any reason, including if you breach these Terms. Upon
            termination, your right to use the Service ceases immediately. You may
            export your writing at any time from your account settings; we will retain
            your data for 30 days following termination to facilitate recovery before
            permanent deletion.
          </p>
          <p>
            You may also terminate your account at any time by contacting us or using
            the account deletion feature in your settings. Termination does not entitle
            you to any refund of prepaid subscription fees.
          </p>
        </Section>

        <Section title="9. Disclaimer of Warranties">
          <p>
            The Service is provided on an &quot;as is&quot; and &quot;as
            available&quot; basis without warranties of any kind, either express or
            implied, including but not limited to implied warranties of
            merchantability, fitness for a particular purpose, and
            non-infringement. We do not warrant that the Service will be
            uninterrupted, error-free, or free of harmful components.
          </p>
          <p>
            We make no warranties or representations about the accuracy or
            completeness of the Service&apos;s content. Any reliance you place on
            the Service is strictly at your own risk. Some jurisdictions do not allow
            the exclusion of implied warranties, so the above exclusion may not apply
            to you.
          </p>
        </Section>

        <Section title="10. Limitation of Liability">
          <p>
            To the fullest extent permitted by law, Rune and its officers, directors,
            employees, and agents shall not be liable for any indirect, incidental,
            special, consequential, or punitive damages, including loss of profits,
            data, or goodwill, arising out of or in connection with your use of the
            Service, even if we have been advised of the possibility of such damages.
          </p>
          <p>
            Our total liability to you for all claims arising out of or relating to
            these Terms or your use of the Service shall not exceed the greater of
            (a) the total fees paid by you to Rune in the twelve months preceding the
            claim, or (b) one hundred US dollars ($100).
          </p>
        </Section>

        <Section title="11. Governing Law">
          <p>
            These Terms shall be governed by and construed in accordance with the laws
            of the jurisdiction in which Rune is incorporated, without regard to its
            conflict of law provisions. Any disputes arising under these Terms shall
            be subject to the exclusive jurisdiction of the courts located in that
            jurisdiction.
          </p>
          <p>
            If any provision of these Terms is found to be unenforceable or invalid,
            that provision shall be limited or eliminated to the minimum extent
            necessary so that these Terms shall otherwise remain in full force and
            effect and enforceable.
          </p>
        </Section>

        <Section title="12. Changes to Terms">
          <p>
            We reserve the right to modify these Terms at any time. When we make
            material changes, we will notify you by updating the &quot;Last
            updated&quot; date at the top of this page and, where appropriate, by
            sending a notice to the email address associated with your account.
          </p>
          <p>
            Your continued use of the Service after any changes become effective
            constitutes your acceptance of the revised Terms. We encourage you to
            review these Terms periodically. If you do not agree to the updated Terms,
            you must stop using the Service.
          </p>
        </Section>

        <Section title="13. Contact">
          <p>
            If you have any questions about these Terms of Service, please contact us
            at{" "}
            <a
              href="mailto:legal@rune.app"
              className="transition-colors duration-150"
              style={{ color: "var(--color-gold)" }}
            >
              legal@rune.app
            </a>
            . We aim to respond to all legal inquiries within five business days.
          </p>
          <p>
            For general support or account questions, please reach out through your
            account settings or at{" "}
            <a
              href="mailto:support@rune.app"
              className="transition-colors duration-150"
              style={{ color: "var(--color-gold)" }}
            >
              support@rune.app
            </a>
            .
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
