import { recordAnalyticsEvent } from "@/lib/actions/analytics";

// first_workspace_object_created (Beta Completion E): whether writers discover
// the Workspace. Once per account — the analytics write deduplicates — with
// only the kind of object; never a title or content. Best-effort.
export async function recordWorkspaceActivation(
  userId: string,
  projectId: string,
  kind: "page" | "collection" | "canvas"
): Promise<void> {
  try {
    await recordAnalyticsEvent({ userId, eventName: "first_workspace_object_created", projectId, metadata: { kind } });
  } catch {
    // Analytics never blocks the writer.
  }
}
