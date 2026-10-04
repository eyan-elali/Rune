// Mock of `next/server` for bundling Rune route handlers outside Next.js.
// NextResponse.json returns a standard Response (Node 18+), so tests read
// `res.status` and `await res.json()` exactly as a real client would.
// Requests and responses carry a minimal cookie jar (get/getAll/set/delete),
// the part of Next's RequestCookies/ResponseCookies route handlers use.
class CookieJar {
  constructor(entries = []) {
    this.map = new Map(entries.map(([name, value]) => [name, { name, value }]));
  }
  get(name) { return this.map.get(name); }
  getAll() { return [...this.map.values()]; }
  has(name) { return this.map.has(name); }
  set(nameOrCookie, value, options = {}) {
    const c = typeof nameOrCookie === 'string' ? { ...options, name: nameOrCookie, value } : { ...nameOrCookie };
    this.map.set(c.name, c);
    return this;
  }
  delete(name) { this.map.delete(name); return this; }
}

export class NextResponse extends Response {
  constructor(body, init) {
    super(body, init);
    this.cookies = new CookieJar();
  }

  static redirect(url, init = 307) {
    const status = typeof init === 'number' ? init : (init.status ?? 307);
    return new NextResponse(null, { status, headers: { location: String(url) } });
  }

  static json(body, init = {}) {
    const headers = new Headers(init.headers);
    if (!headers.has('content-type')) headers.set('content-type', 'application/json');
    return new NextResponse(JSON.stringify(body), { ...init, headers });
  }
}

export class NextRequest extends Request {
  constructor(input, init) {
    super(input, init);
    const header = this.headers.get('cookie') ?? '';
    this.cookies = new CookieJar(header.split(';').map((p) => p.trim()).filter(Boolean).map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i), decodeURIComponent(p.slice(i + 1))];
    }));
  }
}
