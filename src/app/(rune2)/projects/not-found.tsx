import Link from "next/link";
import { RuneRoot } from "@/components/rune2/RunePreferences";

// A Project that doesn't exist or isn't the writer's (the two are not told apart).
export default function ProjectNotFound() {
  return (
    <RuneRoot className="r2-page-state">
      <strong>This project isn’t here.</strong>
      <p className="r2-page-state-detail">It may have been deleted, or the link may be wrong.</p>
      <div className="r2-page-state-actions">
        <Link href="/projects" className="r2-button">
          Back to Projects
        </Link>
      </div>
    </RuneRoot>
  );
}
