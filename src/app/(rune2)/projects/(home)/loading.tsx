import { RuneRoot } from "@/components/rune2/RunePreferences";

// Projects, while the list is read: the page's frame in the writer's theme,
// and in the list's place a few quiet rows of the list's own shape (never
// more than the list will be), with a status for assistive technology.
export default function ProjectsLoading() {
  return (
    <RuneRoot className="r2-home">
      <div className="r2-appbar" aria-hidden>
        <span className="r2-wordmark">Rune</span>
      </div>
      <main className="r2-home-main">
        <div className="r2-home-head">
          <h1>Projects</h1>
        </div>
        <p role="status" className="r2-visually-hidden">
          Loading your projects…
        </p>
        <div className="r2-home-list r2-skeleton-list" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="r2-home-row">
              <span className="r2-home-row-main">
                <span className="r2-home-cover r2-skeleton" />
                <span className="r2-home-row-text">
                  <span className="r2-skeleton r2-skeleton-line" style={{ width: `${46 - i * 9}%` }} />
                  <span className="r2-skeleton r2-skeleton-line r2-skeleton-line--meta" />
                </span>
              </span>
            </div>
          ))}
        </div>
      </main>
    </RuneRoot>
  );
}
