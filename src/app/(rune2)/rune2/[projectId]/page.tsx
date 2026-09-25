import { notFound } from "next/navigation";
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
    <div className="mx-auto max-w-2xl px-8 pb-16 pt-14">
      <h1 className="text-2xl font-semibold tracking-tight">{manuscript.project.title}</h1>

      <dl className="mt-8 grid grid-cols-[auto_1fr] gap-x-8 gap-y-1.5 text-sm">
        <dt style={{ color: "var(--r2-muted)" }}>Manuscript</dt>
        <dd className="tabular-nums">{plural(manuscript.manuscriptWords, "word")}</dd>
        {manuscript.unplaced.length > 0 && (
          <>
            <dt style={{ color: "var(--r2-muted)" }}>Unplaced Scenes</dt>
            <dd className="tabular-nums">
              {plural(manuscript.unplacedWords, "word")}
              <span style={{ color: "var(--r2-faint)" }}>
                {" "}· {plural(manuscript.unplaced.length, "scene")}
              </span>
            </dd>
          </>
        )}
        <dt style={{ color: "var(--r2-muted)" }}>Structure</dt>
        <dd>{structure.join(" · ")}</dd>
      </dl>
    </div>
  );
}
