// Mocks for games/xp/writingStats server actions imported by syncEngine.ts.
export const recordWordsWrittenCalls = [];
export async function recordWordsWritten(projectId, words, sceneId, sessionDate, creditId) {
  recordWordsWrittenCalls.push({ projectId, words, sceneId, sessionDate, creditId });
}
export async function createGameSession() { return { error: null }; }
export async function awardProjectXp() { return { data: null }; }
