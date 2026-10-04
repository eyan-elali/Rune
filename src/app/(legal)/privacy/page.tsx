import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Rune",
  description: "How Rune, a writing companion for novelists, collects, uses, stores and deletes your information.",
};

// Closed-beta Privacy Policy (pre-beta audit, section V). Every statement
// here is checked against the code: Supabase (auth, Postgres, private
// storage bucket), Vercel hosting, the first-party analytics_events and
// acquisition_attribution tables, the Meta Pixel and PromoteKit scripts in
// app/layout.tsx, the beta waitlist and feedback (migration 052), account
// deletion (lib/actions/settings.ts), and the two exports. Where a fact
// cannot be read from the repository (hosting regions, backup retention,
// the Meta "advanced matching" dashboard setting) the text says so in
// general terms rather than guessing.
//
// This is not legal advice. It needs review by a professional familiar with
// Québec's Law 25 and PIPEDA before the beta opens widely.

const LAST_UPDATED = "October 4, 2026";
const PRIVACY_EMAIL = "privacy@rune-app.com";
const SUPPORT_EMAIL = "support@rune-app.com";

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
        <p>
          Rune is a writing companion for novelists, operated from Québec, Canada. This policy explains what
          information Rune collects while you use it, why, where it is kept, who processes it on our behalf, and how
          to see, export or delete it. Rune is currently in a free, invite-only closed beta; this policy describes
          the beta as it works today and will be updated before anything changes.
        </p>

        <Section title="1. The short version">
          <p>
            <Em>Your words remain your own.</Em> Rune will never use AI to write, rewrite, or complete your story.
            Your manuscript is stored so that Rune can show it back to you, keep it in sync between your devices,
            back it up and export it. It is never sold, never shared with advertisers, and never used to train
            artificial-intelligence or machine-learning models.
          </p>
        </Section>

        <Section title="2. What Rune collects, and why">
          <p>
            <Em>Account.</Em> Your email address and a password (stored only in hashed form by our authentication
            provider), or a sign-in link sent to your email. Needed to create and secure your account and to send
            account emails such as confirmation and sign-in links.
          </p>
          <p>
            <Em>Profile.</Em> The pen name you choose, and your preferences (theme, writing font, interface
            settings). Shown to you inside Rune; the pen name is also shown to us next to any feedback you send.
          </p>
          <p>
            <Em>Your writing.</Em> Everything you create in Rune: projects, manuscripts, groups, chapters and
            scenes (stored as structured editor data), revision history checkpoints and milestones, revision
            notes, workspace pages, folders, collections and their entries and properties, canvases, references
            between objects, and anything you move to Trash until you delete it. Images you add to a canvas are
            stored as files in a private storage bucket, together with a smaller display copy. All of this is
            collected for one purpose: to give it back to you.
          </p>
          <p>
            <Em>Imported manuscripts.</Em> When you import a Word, Markdown or text file, the file is read on your
            own device. The file itself is not uploaded. Only the chapters, scenes and prose you confirm are sent to
            Rune, where they become a new project like any other.
          </p>
          <p>
            <Em>Writing history.</Em> How many words you added on each day, per project and scene, and any goals
            you set. Used for Today’s Words, progress and writing-day history. Deleting a scene keeps that day’s
            word total as project-level history; deleting a project deletes its history.
          </p>
          <p>
            <Em>Product analytics.</Em> A small set of named events about how Rune is used (for example that an
            account signed up, opened its first project, completed onboarding, reached a word milestone, exported,
            or sent feedback), with the date, the project involved and a few non-identifying details such as a
            feedback category. These events never contain manuscript text, titles, notes, feedback text or email
            addresses. If you arrive from a link carrying campaign parameters (UTM fields or a Meta click
            identifier), those parameters and the page you landed on are kept in a cookie for up to 30 days and,
            if you then sign up, recorded once against your account so we can tell where writers came from.
          </p>
          <p>
            <Em>Feedback.</Em> What you write in the feedback form, the category you pick, and context about where
            you were: the page path (identifiers only, never anything you typed), the surface (for example
            “scene” or “canvas”), your device class, browser family, window size and the build of Rune. Nothing
            from your manuscript or workspace is read or attached.
          </p>
          <p>
            <Em>Beta waitlist.</Em> If you join the waitlist: your email address, and if you choose to give them,
            your name and a line about what you write, with the time you joined. Used only to invite you to the
            beta and to write to you about it.
          </p>
          <p>
            <Em>Technical information.</Em> Like any website, our hosting provider and authentication provider
            receive your IP address, browser type and the pages requested as part of serving them, and keep
            short-lived request logs. Rune does not build profiles from these logs.
          </p>
        </Section>

        <Section title="3. What Rune does not do with your writing">
          <p>
            Rune only processes your writing to provide the product: storing it, displaying it to you, syncing it,
            producing the exports and backups you ask for, and counting words for your own progress. Rune does not
            sell your writing, share it with advertisers, use it to train artificial-intelligence or
            machine-learning models, or send it to any AI service. Rune will never use AI to write, rewrite, or
            complete your story.
          </p>
          <p>
            <Em>Who at Rune can see it.</Em> Rune is run by a very small team. Our internal product dashboard is
            built so that it never displays manuscript prose, notes or private writing; it shows account-level
            facts such as sign-up dates, word counts and the feedback you send us. Separately, as the operator of
            the database, we do hold administrative credentials that could technically read stored content. We
            use that access only to keep the service running, to investigate a problem you report, or when the law
            requires it, and never to read your writing out of curiosity or for any other purpose.
          </p>
        </Section>

        <Section title="4. Who processes your information">
          <p>
            Rune does not sell or rent personal information. The following providers process it on our behalf,
            under their own terms and privacy policies, to run the service:
          </p>
          <p>
            <Em>Supabase</Em> — authentication, the database that holds your account and writing, the private file
            storage for images, and the emails Rune sends for account confirmation and sign-in links.
          </p>
          <p>
            <Em>Vercel</Em> — hosts the Rune application and serves it to your browser, and keeps the request
            logs described above.
          </p>
          <p>
            <Em>Meta (Meta Pixel)</Em> — a measurement script from Meta is currently included on Rune’s pages. It
            reports page views to Meta, and a one-time “registration completed” signal after sign-up, so that we
            can measure whether people who see Rune mentioned on Meta platforms go on to join. It sets Meta’s own
            cookies in your browser. It never receives manuscript content, titles, notes or feedback.
          </p>
          <p>
            <Em>PromoteKit</Em> — a referral-tracking script is currently included on Rune’s pages. It records
            whether you arrived through a referral link. Rune does not currently offer paid plans or a referral
            programme, so this script has no effect on your account during the beta.
          </p>
          <p>
            <Em>Stripe</Em> — Rune’s code contains payment integration for a future paid plan. During the closed
            beta no payment is requested, no card details are collected, and nothing is sent to Stripe.
          </p>
          <p>
            Rune does not use AI or machine-learning services on your data.
          </p>
        </Section>

        <Section title="5. Where your information is stored">
          <p>
            Rune is operated from Québec, Canada. Our providers store and process information on servers that may
            be located outside Québec and outside Canada, including in the United States, where it is subject to
            the laws of those places. By using Rune you understand that your information, including your writing,
            may be stored and processed there.
          </p>
        </Section>

        <Section title="6. Security">
          <p>
            Your writing is kept in a database with row-level security, so that the application can only ever read
            and write the rows belonging to the signed-in account. Images are kept in a private bucket that is
            never addressed from the browser. Connections use TLS, and our providers report that stored data is
            encrypted at rest. Rune never logs manuscript content.
          </p>
          <p>
            No service can promise absolute security, and Rune is a small, early product in beta. Use a strong,
            unique password, sign out on shared devices, and keep your own backups (see Section 8). If we learn of
            a breach that presents a risk of serious injury to you, we will notify you and the Commission d’accès
            à l’information du Québec as the law requires.
          </p>
        </Section>

        <Section title="7. Cookies and storage in your browser">
          <p>
            <Em>Necessary.</Em> Session cookies from our authentication provider keep you signed in. A cookie
            named <code>rune_attribution</code> holds the campaign parameters described in Section 2 for up to
            30 days, only if you arrived through a tagged link. Rune also keeps data in your browser’s local
            storage (preferences, a tutorial flag, the one-time registration marker) and in IndexedDB, where
            unsaved writing is held so that it survives an offline moment and is sent when you reconnect.
            Blocking these will stop Rune from working properly.
          </p>
          <p>
            <Em>Measurement.</Em> The Meta Pixel and PromoteKit scripts described in Section 4 set their own
            cookies. Blocking them does not affect your ability to use Rune.
          </p>
        </Section>

        <Section title="8. Your copies: export and backup">
          <p>
            You never need to ask us for a copy of your writing. From inside Rune you can export a manuscript as
            Word, PDF, Markdown or plain text; download a complete backup of a project (every chapter, scene,
            note, page, collection, canvas and image, including what is in Trash, as a ZIP archive built on your
            own device); and download every project’s manuscript as one JSON file from Settings. If you need a
            copy of information that is not in those exports, write to us.
          </p>
        </Section>

        <Section title="9. Deleting your account">
          <p>
            You can delete your account yourself in Settings. Deletion is immediate: your account, profile,
            preferences, every project (including Trash) and everything in them, your writing history, feedback,
            analytics events and attribution record are deleted from the live database, and the image files
            belonging to your projects are removed from storage. Deleted writing cannot be recovered by us, so
            export first.
          </p>
          <p>
            What remains after deletion: a minimal record that the account existed (your email address, pen name,
            and the date of deletion), kept so that we can answer later questions about the deletion and keep
            account statistics honest; if you had joined the beta waitlist or been invited, your email address on
            that list; and copies in our providers’ routine backups, which are kept for a limited period for
            disaster recovery and then expire. We cannot promise instant erasure from every backup.
          </p>
        </Section>

        <Section title="10. How long we keep information">
          <p>
            Your account and writing are kept for as long as your account exists. Scene history checkpoints are
            thinned automatically as new ones are made, so older checkpoints are not kept forever. The beta
            waitlist is kept while the beta is invite-only. Product analytics events and the deletion record are
            kept in identifiable form until the account is deleted and in the minimal form described in Section 9
            afterwards. We may keep aggregated statistics that identify no one indefinitely.
          </p>
        </Section>

        <Section title="11. Your rights">
          <p>
            You may ask to see the personal information Rune holds about you, to correct it, to receive it in a
            portable form, to withdraw consent to optional uses, and to have it deleted. Québec’s privacy law and
            Canada’s federal privacy law also give you the right to complain to a supervisory authority (in
            Québec, the Commission d’accès à l’information). Write to{" "}
            <MailLink address={PRIVACY_EMAIL} /> and we will answer within 30 days. We will need to confirm that
            the request comes from the account holder.
          </p>
        </Section>

        <Section title="12. Children">
          <p>
            Rune is written for adult novelists. You must be at least 13 years old to use it, and under Québec law
            a person under 14 needs a parent or guardian to consent on their behalf. If you believe a child has
            created an account, write to <MailLink address={PRIVACY_EMAIL} /> and we will delete it.
          </p>
        </Section>

        <Section title="13. Changes to this policy">
          <p>
            Rune is in beta and this policy will change as the product does, in particular before any paid plan
            is introduced. When we make a material change we will update the date at the top of this page and
            tell signed-in writers inside Rune or by email. Continued use after a change means you accept the
            updated policy; if you do not, you can export your writing and delete your account.
          </p>
        </Section>

        <Section title="14. Who is responsible, and how to reach us">
          <p>
            Rune is operated by its founder in Québec, Canada, who is the person in charge of the protection of
            personal information for the purposes of Québec’s privacy law. For anything about this policy or your
            information, write to <MailLink address={PRIVACY_EMAIL} />. For help with your account or your
            writing, write to <MailLink address={SUPPORT_EMAIL} />.
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

function Em({ children }: { children: React.ReactNode }) {
  return <strong style={{ color: "var(--color-parchment)" }}>{children}</strong>;
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
