/**
 * One server-log line when a creation the writer asked for is refused.
 *
 * The writer sees a plain message ("Couldn’t create the page."); this keeps
 * what refused it — the operation, the database's SQLSTATE when it raised, its
 * message, and the ids involved — so a trigger refusal, a constraint, a missing
 * migration and a lost connection can be told apart. Never a title, a name or
 * any writing.
 */
export function logCreateFailure(
  operation: string,
  failure: { code?: string | null; message: string },
  context: Record<string, string | null | undefined> = {}
): void {
  console.error(`[create] ${operation} failed`, { code: failure.code ?? null, message: failure.message, ...context });
}
