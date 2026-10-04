"use client";

import Link from "next/link";
import { useRuneRootProps } from "@/components/rune2/RunePreferences";

// A Project (or Project Trash) could not be loaded. Nothing was changed; the
// writer can try again or go back to Projects. (Projects itself has its own,
// in (home).)
export default function ProjectError({ reset }: { error: Error; reset: () => void }) {
  const rootProps = useRuneRootProps();
  return (
    <div className="r2 r2-page-state" {...rootProps} role="alert">
      <p>This project couldn’t be loaded. Nothing has been changed.</p>
      <div className="r2-page-state-actions">
        <button type="button" className="r2-button" onClick={reset}>
          Try again
        </button>
        <Link href="/projects" className="r2-button r2-button--quiet">
          Back to Projects
        </Link>
      </div>
    </div>
  );
}
