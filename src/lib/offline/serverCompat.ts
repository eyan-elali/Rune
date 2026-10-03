// Whether a server answer means "this server doesn't have what this client
// is asking for" — a database function (or a signature of it) the client
// expects but the server lacks: an older server behind a newer client, or a
// deployment in the wrong order. Such a save is never valid later on THIS
// server and never invalid in itself: the writing is kept, not retried on a
// timer (the answer would not change), and the writer is asked to reload —
// a reloaded client, or an updated server, replays it.
//
// Shared by the Scene save engine (lib/offline/syncEngine.ts) and the Canvas
// session (lib/rune2/canvasSession.ts), which adds its own per-change
// patterns. Pure.
export function isMissingServerFunction(message: string | null | undefined): boolean {
  if (!message) return false;
  return /could not find the function|function .* does not exist|PGRST202|schema cache/i.test(message);
}
