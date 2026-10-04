"use client";

import { useRuneRootProps } from "@/components/rune2/RunePreferences";

// Projects could not be shown (an unexpected failure — an ordinary read
// failure is shown by the page itself). Nothing was changed.
export default function ProjectsError({ reset }: { error: Error; reset: () => void }) {
  const rootProps = useRuneRootProps();
  return (
    <div className="r2 r2-home" {...rootProps}>
      <main className="r2-home-main">
        <div className="r2-home-head">
          <h1>Projects</h1>
        </div>
        <div className="r2-home-state" role="alert">
          <p>Your projects couldn’t be loaded. Nothing has been changed.</p>
          <button type="button" className="r2-button" onClick={reset}>
            Try again
          </button>
        </div>
      </main>
    </div>
  );
}
