// Mock of '@/lib/actions/analytics': records every event a bundled module
// asks for, so a test can check what is (and is never) sent — names,
// metadata, project ids — without a service-role key.
// One list for every bundle that includes this mock.
export const analyticsCalls = (globalThis.__analyticsCalls ??= []);

export async function recordAnalyticsEvent(input) {
  analyticsCalls.push(JSON.parse(JSON.stringify(input)));
  return { error: null };
}

export async function recordSignupCompletedEvent() {
  return { error: null };
}
