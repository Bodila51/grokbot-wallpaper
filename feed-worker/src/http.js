// Pure helpers for the private feed Worker: CORS, bearer auth, JSON replies.
// Kept free of Cloudflare imports so Node can unit-test the rules.

const MAX_BODY = 4096;

export function parseOrigins(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isLocalOrigin(origin) {
  try {
    const u = new URL(origin);
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

/** Allow listed Pages origins, plus localhost for local dashboard testing. */
export function corsHeaders(origin, allowed) {
  const headers = {
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'Authorization, Content-Type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
  if (!origin) return headers;
  if (isLocalOrigin(origin) || allowed.includes(origin)) {
    headers['access-control-allow-origin'] = origin;
  }
  return headers;
}

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });
}

export function fail(status, message, extra = {}) {
  return json({ error: message }, status, extra);
}

/** Constant-time compare of two equal-length byte arrays. */
export function timingSafeEqual(a, b) {
  if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array) || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return new Uint8Array(buf);
}

/** Bearer token against a secret. Empty secret → reject (503). */
export async function checkBearer(request, secret) {
  if (!secret) return { ok: false, status: 503, message: 'feed keys are not configured' };
  const header = request.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) return { ok: false, status: 401, message: 'missing bearer token' };
  const got = await sha256(m[1]);
  const want = await sha256(secret);
  if (!timingSafeEqual(got, want)) return { ok: false, status: 401, message: 'invalid token' };
  return { ok: true };
}

export async function readBodyCapped(request, max = MAX_BODY) {
  const buf = await request.arrayBuffer();
  if (buf.byteLength > max) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return null;
  }
}

export { MAX_BODY };
