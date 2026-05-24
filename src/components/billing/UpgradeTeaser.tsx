import Link from "next/link"
import { Lock } from "lucide-react"

interface UpgradeTeaserProps {
  feature: string
  description: string
  tier: 'scribe'
}

export function UpgradeTeaser({ feature, description, tier }: UpgradeTeaserProps) {
  return (
    <div
      className="flex flex-col gap-3 rounded-lg p-5"
      style={{
        background: "rgba(201, 168, 76, 0.03)",
        border: "1px dashed rgba(201, 168, 76, 0.25)",
      }}
    >
      <div className="flex items-center gap-2">
        <Lock
          size={13}
          style={{ color: "var(--color-gold)", opacity: 0.65 }}
          aria-hidden
        />
        <h3
          className="font-rune-serif text-sm"
          style={{ color: "var(--text-primary)" }}
        >
          {feature}
        </h3>
      </div>
      <p
        className="text-xs leading-relaxed"
        style={{ color: "var(--color-mist)" }}
      >
        {description}
      </p>
      <Link
        href="/settings?tab=billing"
        className="text-xs font-medium transition-opacity hover:opacity-70"
        style={{ color: "var(--color-gold)" }}
      >
        Upgrade to Scribe →
      </Link>
    </div>
  )
}
