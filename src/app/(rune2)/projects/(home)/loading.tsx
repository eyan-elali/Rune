// Projects, while the list is read: the page's frame, quiet, with a status for assistive technology.
export default function ProjectsLoading() {
  return (
    <div className="r2 r2-home">
      <div className="r2-appbar" aria-hidden>
        <span className="r2-wordmark">Rune</span>
      </div>
      <main className="r2-home-main">
        <div className="r2-home-head">
          <h1>Projects</h1>
        </div>
        <p role="status" className="r2-home-loading">
          Loading your projects…
        </p>
      </main>
    </div>
  );
}
