import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Rune",
  description: "Read the Privacy Policy for Rune, the gamified writing environment.",
};

const LAST_UPDATED = "June 20, 2026";

export default function PrivacyPage() {
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
          Privacy Policy
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
        <Section title="1. Information We Collect">
          <p>
            When you create a Rune account, we collect your email address and any
            display name you choose to provide. During your use of the Service, we
            also collect the content you write (stored as structured JSON), your
            project and chapter metadata, word counts, game session results, and XP
            and level data associated with your account.
          </p>
          <p>
            We also automatically collect certain technical information when you
            access the Service, including your IP address, browser type, operating
            system, referring URLs, and pages visited. This information is used
            for operating and improving the Service.
          </p>
          <p>
            If you interact with our advertising campaigns, we may also receive
            event data from Meta (such as PageView and CompleteRegistration events)
            to help us understand how visitors reach and engage with Rune. This is
            described further in Sections 4 and 6. Your manuscript content is never
            included in any advertising event data.
          </p>
        </Section>

        <Section title="2. How We Use Your Information">
          <p>
            We use the information we collect to operate and maintain the Service,
            authenticate your account, calculate and display your XP and progression,
            process subscription payments, and send transactional emails such as
            magic-link sign-ins and billing receipts.
          </p>
          <p>
            We may also use certain account information (such as whether you
            completed registration) to measure the performance of advertising
            campaigns and improve the relevance of ads shown to prospective users.
            This measurement uses aggregated signals and does not involve sharing
            your writing content with any advertising platform.
          </p>
          <p>
            We do not use your writing content for any purpose other than storing and
            displaying it back to you. We will never use your User Content to train
            machine learning models, generate AI outputs, or share it with third
            parties for any reason other than those required by law.
          </p>
        </Section>

        <Section title="3. Your Writing Belongs to You">
          <p>
            Your manuscripts, chapters, and pages are entirely yours. Rune claims no
            ownership over anything you write in the Service.
          </p>
          <p>
            We do not sell your writing. We do not share your manuscripts with
            advertisers. We do not use your writing to train artificial intelligence
            or machine learning models — not now, not in the future. Rune only
            processes your writing content to provide you with the product: storing
            it, displaying it back to you, and syncing it across your devices.
          </p>
        </Section>

        <Section title="4. Third-Party Services">
          <p>
            Rune uses <strong style={{ color: "var(--color-parchment)" }}>Supabase</strong> for authentication and database storage. Your
            email address and account data are processed and stored by Supabase in
            accordance with their own privacy policy. Supabase is GDPR-compliant and
            SOC 2 Type II certified.
          </p>
          <p>
            Rune uses <strong style={{ color: "var(--color-parchment)" }}>Stripe</strong> to process all subscription payments. When you
            subscribe to a paid plan, your payment card details are collected and
            stored directly by Stripe — Rune never sees or stores raw card numbers.
            Stripe&apos;s handling of your payment data is governed by their own
            privacy policy and PCI DSS compliance program.
          </p>
          <p>
            Rune is hosted on <strong style={{ color: "var(--color-parchment)" }}>Vercel</strong>, a cloud deployment platform. Vercel
            may process request logs and infrastructure data as part of delivering
            the Service. Vercel&apos;s data handling is governed by their own privacy
            policy.
          </p>
          <p>
            Rune uses <strong style={{ color: "var(--color-parchment)" }}>Meta Pixel</strong> and related Meta business tools to measure
            advertising performance, understand how visitors interact with our
            website, and improve the relevance of our advertising campaigns. Meta
            Pixel may track events such as PageView and CompleteRegistration. Rune
            does not share manuscript content, chapter data, or writing with Meta.
            Meta&apos;s use of this data is governed by Meta&apos;s own privacy policy.
          </p>
          <p>
            We have also enabled Automatic Advanced Matching, which allows Meta to
            use information provided during signup — such as your email address —
            to help match website events to Meta accounts for advertising measurement
            purposes. This is used solely for campaign analytics, not for targeting
            ads based on what you write.
          </p>
        </Section>

        <Section title="5. Data Storage and Security">
          <p>
            Your data is stored in a Supabase-managed PostgreSQL database with
            row-level security enabled, ensuring that no user can access another
            user&apos;s data through the application layer. All data is encrypted at
            rest and in transit using industry-standard TLS encryption.
          </p>
          <p>
            While we implement reasonable administrative, technical, and physical
            safeguards, no method of transmission over the internet is 100% secure.
            We cannot guarantee absolute security and encourage you to use a strong,
            unique password and to sign out of shared devices when finished.
          </p>
        </Section>

        <Section title="6. Cookies">
          <p>
            Rune uses two categories of cookies and similar technologies:
          </p>
          <p>
            <strong style={{ color: "var(--color-parchment)" }}>Essential cookies</strong> are required for the Service to function.
            These include authentication cookies set by Supabase to maintain your
            signed-in session, session management tokens, and security cookies that
            protect against unauthorized access. Disabling these cookies will
            prevent you from remaining signed in to Rune.
          </p>
          <p>
            <strong style={{ color: "var(--color-parchment)" }}>Analytics and advertising technologies</strong> include the Meta Pixel,
            which places cookies or uses browser storage to measure advertising
            performance and track conversion events (such as CompleteRegistration).
            These technologies help us understand how users discover Rune and
            improve our advertising campaigns. They are active on our marketing
            pages and on signup and login flows.
          </p>
          <p>
            You may configure your browser to refuse or delete cookies. Blocking
            essential cookies will prevent Rune from functioning. Blocking
            advertising cookies will limit our ability to measure campaign
            performance but will not affect your ability to use the Service once
            signed in.
          </p>
        </Section>

        <Section title="7. Your Rights">
          <p>
            Depending on your location, you may have certain rights regarding your
            personal data, including the right to access the data we hold about you,
            correct inaccurate information, request deletion of your account and
            associated data, and obtain a portable copy of your writing content.
          </p>
          <p>
            You can export your writing at any time from your account settings.
            To request account deletion or a full data export, contact us at{" "}
            <a
              href="mailto:privacy@rune.app"
              className="transition-colors duration-150"
              style={{ color: "var(--color-gold)" }}
            >
              privacy@rune.app
            </a>
            . We will fulfill verified requests within 30 days.
          </p>
        </Section>

        <Section title="8. Data Retention">
          <p>
            We retain your account data and writing content for as long as your
            account remains active. If you delete your account, we will permanently
            delete your data within 30 days of the deletion request, except where we
            are required by law to retain certain records (such as billing
            transaction logs, which are retained for a minimum of 7 years).
          </p>
          <p>
            Anonymized and aggregated data — such as total words written across the
            platform or aggregate game session statistics with no personally
            identifying information — may be retained indefinitely for the purpose
            of improving the Service.
          </p>
        </Section>

        <Section title="9. Children's Privacy">
          <p>
            The Service is not directed to children under the age of 13. We do not
            knowingly collect personal information from children under 13. If you
            become aware that a child has provided us with personal information
            without parental consent, please contact us at{" "}
            <a
              href="mailto:privacy@rune.app"
              className="transition-colors duration-150"
              style={{ color: "var(--color-gold)" }}
            >
              privacy@rune.app
            </a>{" "}
            and we will take steps to delete such information promptly.
          </p>
          <p>
            If you are between 13 and 18 years of age, you should review these terms
            with a parent or guardian before creating an account or providing any
            personal information through the Service.
          </p>
        </Section>

        <Section title="10. Changes to This Policy">
          <p>
            We may update this Privacy Policy from time to time to reflect changes
            in our practices or for legal, regulatory, or operational reasons. When
            we make material changes, we will update the &quot;Last updated&quot;
            date at the top of this page and, where appropriate, notify you by email.
          </p>
          <p>
            We encourage you to review this Privacy Policy periodically. Your
            continued use of the Service following the posting of changes constitutes
            your acceptance of those changes. If you object to any changes, you may
            close your account.
          </p>
        </Section>

        <Section title="11. Contact">
          <p>
            If you have any questions, concerns, or requests regarding this Privacy
            Policy or your personal data, please contact us at{" "}
            <a
              href="mailto:privacy@rune.app"
              className="transition-colors duration-150"
              style={{ color: "var(--color-gold)" }}
            >
              privacy@rune.app
            </a>
            . We are committed to resolving privacy-related concerns transparently
            and within a reasonable timeframe.
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
