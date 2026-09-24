// Mock of `next/server` for bundling Rune route handlers outside Next.js.
// NextResponse.json returns a standard Response (Node 18+), so tests read
// `res.status` and `await res.json()` exactly as a real client would.
export class NextResponse extends Response {
  static json(body, init = {}) {
    const headers = new Headers(init.headers);
    if (!headers.has('content-type')) headers.set('content-type', 'application/json');
    return new NextResponse(JSON.stringify(body), { ...init, headers });
  }
}

export class NextRequest extends Request {}
