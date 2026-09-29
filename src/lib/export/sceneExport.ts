import type { Scene, Project } from "@/lib/types";
import { defaultExportName, exportFileName } from "./formats";
import { layoutPdf, newPdf } from "./pdf";
import { planExport } from "./plan";

// One Scene as a PDF, for the Rune 1.x editor's "Export Scene" button — the
// one export pipeline (plan.ts), Scene scope: the Scene's prose only.
export async function exportSceneAsPdf(scene: Scene, project: Project): Promise<void> {
  const document = planExport(
    { projectTitle: project.title, groups: [], chapters: [], scenes: [scene] },
    { kind: "scene", sceneId: scene.id }
  );
  const doc = await newPdf();
  layoutPdf(doc, document);
  doc.save(exportFileName(defaultExportName(document), "pdf"));
}
