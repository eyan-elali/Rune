"use client";

import { useState } from "react";
import { PageGuide, type GuideStep } from "@/components/ui/PageGuide";
import { GuideButton } from "@/components/ui/GuideButton";

const STEPS: GuideStep[] = [
  {
    target: "profile-xp",
    heading: "Level and XP",
    copy: "Earn XP by writing and level up as you build your habit.",
    side: "right",
  },
  {
    target: "profile-heatmap",
    heading: "Writing Activity",
    copy: "The heatmap shows which days you wrote.",
    side: "bottom",
  },
  {
    target: "profile-stats",
    heading: "Stats",
    copy: "Stats summarize your writing activity, progress, and writing records.",
    side: "bottom",
  },
  {
    target: "profile-unlockables",
    heading: "Unlockables",
    copy: "Unlockables are earned by reaching writing milestones.",
    side: "bottom",
  },
];

export function ProfileGuideMount() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <GuideButton onClick={() => setOpen(true)} />
      <PageGuide steps={STEPS} isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}
