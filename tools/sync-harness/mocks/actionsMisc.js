// Mocks for games/xp/writingStats server actions imported by syncEngine.ts.
export const recordWordsWrittenCalls = [];
export async function recordWordsWritten(projectId, words, pageId, sessionDate) {
  recordWordsWrittenCalls.push({ projectId, words, pageId, sessionDate });
}
export async function createGameSession() { return { error: null }; }
export async function awardProjectXp() { return { data: null }; }
