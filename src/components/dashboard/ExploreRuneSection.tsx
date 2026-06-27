import Link from "next/link";

interface ExploreCardData {
  title: string;
  tagline: string;
  body: string;
  cta: string;
  href: string;
}

const EXPLORE_CARDS: ExploreCardData[] = [
  {
    title: "Arena",
    tagline: "Words become weapons.",
    body: "Battle Writer's Block, race yourself, and turn writing into a challenge.",
    cta: "Enter the Arena",
    href: "/games",
  },
  {
    title: "Goals",
    tagline: "Build momentum.",
    body: "Set manuscript targets and keep your story moving forward.",
    cta: "View Goals",
    href: "/profile",
  },
  {
    title: "Insights",
    tagline: "Understand your writing.",
    body: "See how your manuscript grows and discover your writing habits.",
    cta: "View Insights",
    href: "/profile",
  },
];

function ExploreCard({ title, tagline, body, cta, href }: ExploreCardData) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-lg p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--color-border)",
        borderLeft: "2px solid rgba(201, 168, 76, 0.3)",
      }}
      aria-label={`${title}: ${cta}`}
    >
      <h3
        className="font-rune-serif text-base leading-snug transition-colors duration-150 group-hover:text-rune-gold"
        style={{ color: "var(--text-primary)" }}
      >
        {title}
      </h3>
      <p
        className="mt-1 font-rune-serif text-xs italic"
        style={{ color: "rgba(201, 168, 76, 0.6)" }}
      >
        {tagline}
      </p>
      <p
        className="mt-3 text-xs leading-relaxed"
        style={{ color: "var(--color-mist)" }}
      >
        {body}
      </p>
      <p
        className="mt-auto pt-3 text-xs transition-colors duration-150 group-hover:text-rune-gold"
        style={{ color: "var(--color-gold-dim)" }}
      >
        {cta} →
      </p>
    </Link>
  );
}

export function ExploreRuneSection() {
  return (
    <section aria-label="Explore Rune">
      <p
        className="mb-4 text-xs font-semibold uppercase tracking-widest"
        style={{ color: "var(--color-mist)" }}
      >
        Explore Rune
      </p>
      <nav
        aria-label="Rune features"
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      >
        {EXPLORE_CARDS.map((card) => (
          <ExploreCard key={card.href + card.title} {...card} />
        ))}
      </nav>
    </section>
  );
}
