// Where an auth link may send a writer afterwards (the callback's `next`):
// only a path of this app. Anything that would leave it — another host
// ("//evil.example", "https://evil.example"), a scheme ("javascript:"), or a
// form that turns the origin into user-info when appended to it
// ("@evil.example" → https://rune.app@evil.example) — falls back to Projects.
// Pure, so the callback and the tests agree.

export const DEFAULT_NEXT_PATH = "/projects";

export function safeNextPath(raw: string | null | undefined, fallback = DEFAULT_NEXT_PATH): string {
  if (typeof raw !== "string") return fallback;
  const value = raw.trim();
  // An absolute path of this app: one leading slash, not a second slash or
  // backslash (a protocol-relative URL either way in browsers).
  if (!value.startsWith("/") || /^\/[/\\]/.test(value)) return fallback;
  // Nothing a header or a browser could read as another destination.
  if (/[\s\u0000-\u001f\u007f]/.test(value)) return fallback;
  let url: URL;
  try {
    url = new URL(value, "https://rune.invalid");
  } catch {
    return fallback;
  }
  if (url.origin !== "https://rune.invalid" || url.username || url.password) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}
