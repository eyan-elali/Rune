import { notFound } from "next/navigation";
import { ImportManuscriptLauncher } from "@/components/rune2/ManuscriptImport";
import { ProjectExportLaunchers } from "@/components/rune2/ProjectExport";
import { loadProjectManuscript } from "@/lib/rune2/projectManuscript";

// Manuscript overview — the content region until the editor arrives.
// Placed and Unplaced words are shown separately, never summed.

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

  const structure = [
    manuscript.groupCount > 0 ? plural(manuscript.groupCount, "group") : null,
    plural(manuscript.chapterCount, "chapter"),
    plural(manuscript.placedSceneCount, "scene"),
  ].filter(Boolean);

  return (
    <div className="r2-overview">
      <p className="r2-overview-kind">Manuscript</p>
      <h1>{manuscript.project.title}</h1>

      <dl>
        <dt>Manuscript</dt>
        <dd>{plural(manuscript.manuscriptWords, "word")}</dd>
        {manuscript.unplaced.length > 0 && (
          <>
            <dt>Unplaced Scenes</dt>
            <dd>
              {plural(manuscript.unplacedWords, "word")}
              <span> · {plural(manuscript.unplaced.length, "scene")}</span>
            </dd>
          </>
        )}
        <dt>Structure</dt>
        <dd>{structure.join(" · ")}</dd>
      </dl>

      {/* Export and backup only read; import creates a new Project. This one is never changed. */}
      <ProjectExportLaunchers />
      <ImportManuscriptLauncher />
    </div>
  );
}
