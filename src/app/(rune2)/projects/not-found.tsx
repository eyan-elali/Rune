import Link from "next/link";

// A Project that doesn't exist or isn't the writer's (the two are not told apart).
export default function ProjectNotFound() {
  return (
    <div className="r2 r2-page-state">
      <p>This project isn’t here. It may have been deleted, or the link may be wrong.</p>
      <div className="r2-page-state-actions">
        <Link href="/projects" className="r2-button">
          Back to Projects
        </Link>
      </div>
    </div>
  );
}
