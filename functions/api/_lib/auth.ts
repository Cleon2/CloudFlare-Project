/**
 * Resolve a stable user identifier for the incoming request.
 *
 * Production (Cloudflare Access enabled):
 *   CF Access injects a signed JWT in the `Cf-Access-Jwt-Assertion` header.
 *   We decode the payload (without verifying the signature — Access already
 *   validated it at the edge) to extract the user's email address.
 *
 * Local dev (wrangler dev, no Access):
 *   Fall back to a UUID stored in an `HttpOnly` cookie.  The cookie is issued
 *   on the first page load (see index.ts) and sent automatically on subsequent
 *   fetch() calls from the same origin.
 */
export function getUserId(request: Request): string | null {
  // --- Cloudflare Access JWT ---
  const jwt = request.headers.get('Cf-Access-Jwt-Assertion');
  if (jwt) {
    try {
      const payloadB64 = jwt.split('.')[1];
      // base64url → base64
      const padded = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
      const json   = atob(padded);
      const payload = JSON.parse(json) as Record<string, unknown>;
      if (typeof payload['email'] === 'string') return payload['email'];
    } catch {
      // malformed JWT — fall through
    }
  }

  // --- Cookie fallback ---
  const cookie = request.headers.get('Cookie') ?? '';
  const match  = cookie.match(/digest_uid=([a-f0-9-]{36})/);
  return match ? match[1] : null;
}

/** Generate a fresh anonymous UUID for first-time visitors. */
export function newAnonymousId(): string {
  return crypto.randomUUID();
}
