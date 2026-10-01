import { notFound } from "next/navigation";
import { ImportManuscriptLauncher } from "@/components/rune2/ManuscriptImport";
import { ProjectExportLaunchers } from "@/components/rune2/ProjectExport";
import { loadProjectManuscript } from "@/lib/rune2/projectManuscript";

// The Manuscript overview: orientation and access, not analytics. The
// manuscript's name, its size and shape in one quiet line, the few actions
// that read it whole (export, backup) or bring another in (import), and under
// it — ManuscriptScenes, in the shell — the Manuscript's Scene Views. Placed
// and Unplaced words are shown separately, never summed.

function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

export default async function Rune2ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const manuscript = await loadProjectManuscript(projectId);
  if (!manuscript) notFound();

  const facts = [
    plural(manuscript.manuscriptWords, "word"),
    manuscript.groupCount > 0 ? plural(manuscript.groupCount, "group") : null,
    plural(manuscript.chapterCount, "chapter"),
    plural(manuscript.placedSceneCount, "scene"),
  ].filter((f): f is string => f !== null);

  return (
    <div className="r2-overview">
      <p className="r2-overview-kind">Manuscript</p>
      <h1>{manuscript.project.title}</h1>

      <p className="r2-overview-facts">
        {facts.map((f) => (
          <span key={f}>{f}</span>
        ))}
      </p>
      {manuscript.unplaced.length > 0 && (
        <p className="r2-overview-more">
          Unplaced: {plural(manuscript.unplaced.length, "scene")} · {plural(manuscript.unplacedWords, "word")} — outside the
          manuscript’s total and export
        </p>
      )}

      {/* Export and backup only read; import creates a new Project. This one is never changed. */}
      <div className="r2-overview-actions">
        <ProjectExportLaunchers />
        <ImportManuscriptLauncher />
      </div>
    </div>
  );
}
