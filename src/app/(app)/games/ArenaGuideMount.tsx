"use client";

import { useState } from "react";
import { PageGuide, type GuideStep } from "@/components/ui/PageGuide";
import { GuideButton } from "@/components/ui/GuideButton";

const STEPS: GuideStep[] = [
  {
    target: "arena-race",
    heading: "Race Yourself",
    copy: "Race Yourself challenges you to write as much as you can before time runs out.",
    side: "bottom",
  },
  {
    target: "arena-battle",
    heading: "Battle Mode",
    copy: "Battle Mode turns writing into combat. Every word damages the enemy.",
    side: "bottom",
  },
  {
    target: "sidebar-settings",
    heading: "Hide Arena",
    copy: "If you do not want Arena in Rune, you can hide it from Settings.",
    side: "right",
  },
];

export function ArenaGuideMount() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <GuideButton onClick={() => setOpen(true)} />
      <PageGuide steps={STEPS} isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}
