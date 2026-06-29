"use client";

import Link from "next/link";

interface ExploreCardData {
  title: string;
  tagline: string;
  body: string;
  cta: string;
  href: string;
  onClick?: () => void;
  dataGuide?: string;
}

const cardBaseStyle = {
  background: "var(--surface-card)",
  border: "1px solid var(--color-border)",
  borderLeft: "2px solid rgba(201, 168, 76, 0.3)",
} as const;

function ExploreCard({ title, tagline, body, cta, href, onClick, dataGuide }: ExploreCardData) {
  const inner = (
    <>
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
        {cta}
      </p>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="group flex w-full flex-col rounded-lg p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
        style={cardBaseStyle}
        aria-label={`${title}: ${cta}`}
        data-guide={dataGuide}
      >
        {inner}
      </button>
    );
  }

  return (
    <Link
      href={href}
      className="group flex flex-col rounded-lg p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
      style={cardBaseStyle}
      aria-label={`${title}: ${cta}`}
      data-guide={dataGuide}
    >
      {inner}
    </Link>
  );
}

interface ExploreRuneSectionProps {
  onProgressClick?: () => void;
  hideArena?: boolean;
}

export function ExploreRuneSection({ onProgressClick, hideArena = false }: ExploreRuneSectionProps) {
  const allCards: ExploreCardData[] = [
    {
      title: "Arena",
      tagline: "Words become weapons.",
      body: "Every word deals damage. Battle the blank page and turn writing into momentum.",
      cta: "Enter the Arena →",
      href: "/games",
    },
    {
      title: "Progress",
      tagline: "See how far you've come.",
      body: "Track milestones, manuscript progress, and the shape of your writing journey.",
      cta: "View Progress →",
      href: "/profile",
      onClick: onProgressClick,
      dataGuide: "dashboard-progress",
    },
    {
      title: "Insights",
      tagline: "Discover your rhythm.",
      body: "Understand when you write best and how your manuscript grows over time.",
      cta: "View Insights →",
      href: "/profile",
    },
  ];

  const cards = hideArena ? allCards.filter((c) => c.title !== "Arena") : allCards;

  return (
    <section aria-label="Explore Rune" data-guide="dashboard-explore">
      <p
        className="mb-4 text-xs font-semibold uppercase tracking-widest"
        style={{ color: "var(--color-mist)" }}
      >
        Explore Rune
      </p>
      <nav
        aria-label="Rune features"
        className={`grid grid-cols-1 gap-4 ${cards.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}
      >
        {cards.map((card) => (
          <ExploreCard key={card.title} {...card} />
        ))}
      </nav>
    </section>
  );
}
