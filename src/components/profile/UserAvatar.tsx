"use client";

import {
  Skull,
  Eye,
  Compass,
  Feather,
  Crown,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const AVATAR_SYMBOL: Record<string, string> = {
  quill: "✒",
  "open-book": "◫",
  "crescent-moon": "☽",
  ouroboros: "∞",
  hourglass: "⌛",
  crow: "◉",
  lantern: "◈",
  "void-walker": "◼",
};

const AVATAR_LUCIDE: Record<string, LucideIcon> = {
  "skull-roses": Skull,
  "the-eye": Eye,
  compass: Compass,
  inkwell: Feather,
  sigil: Sparkles,
  crown: Crown,
};

export function AvatarGlyph({
  id,
  className,
  size = 18,
}: {
  id: string;
  className?: string;
  size?: number;
}) {
  const Lucide = AVATAR_LUCIDE[id];
  if (Lucide) {
    return (
      <Lucide
        size={size}
        className={cn("text-[var(--color-gold)] opacity-80", className)}
        aria-hidden
      />
    );
  }
  return (
    <span className={className} aria-hidden>
      {AVATAR_SYMBOL[id] ?? "✦"}
    </span>
  );
}

function isUnlockableAssetUrl(url: string) {
  return url.startsWith("/assets/avatars/");
}

interface UserAvatarProps {
  activeAvatarId: string;
  avatarUrl?: string | null;
  displayName: string;
  size?: "sm" | "md";
  className?: string;
  title?: string;
}

export function UserAvatar({
  activeAvatarId,
  avatarUrl,
  displayName,
  size = "sm",
  className,
  title,
}: UserAvatarProps) {
  const dimension = size === "sm" ? "h-8 w-8 text-base" : "h-16 w-16 text-2xl";
  const glyphSize = size === "sm" ? 18 : 28;
  const avatarSrc =
    avatarUrl && isUnlockableAssetUrl(avatarUrl)
      ? avatarUrl
      : null;

  if (avatarSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarSrc}
        alt={`${displayName} avatar`}
        title={title}
        className={cn("shrink-0 rounded-full object-cover", dimension, className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full",
        dimension,
        className
      )}
      style={{
        background: "rgba(201, 168, 76, 0.12)",
        border: "1px solid rgba(201, 168, 76, 0.25)",
        color: "var(--color-gold)",
      }}
      aria-label={`Avatar: ${activeAvatarId}`}
      title={title}
    >
      <AvatarGlyph id={activeAvatarId} size={glyphSize} />
    </div>
  );
}
