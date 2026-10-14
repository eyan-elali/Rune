// Mock of `next/headers` whose cookies() reads the test's jar
// (globalThis.__testCookies: a Map of name → value).
export async function headers() {
  return new Headers();
}

export async function cookies() {
  const jar = (globalThis.__testCookies ??= new Map());
  return {
    get: (name) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set: (name, value) => jar.set(name, value),
    delete: (name) => jar.delete(name),
  };
}
