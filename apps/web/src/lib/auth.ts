const SESSION_COOKIE = "outreach_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function te(s: string): BufferSource {
  return new TextEncoder().encode(s) as unknown as BufferSource;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    te(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, te(payload));
  return toHex(sig);
}

/** Creates a signed session token: "admin.<expiresAtMs>.<hmac>" */
export async function createSessionToken(secret: string): Promise<string> {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = `admin.${expires}`;
  const sig = await hmac(secret, payload);
  return `${payload}.${sig}`;
}

/** Verifies signature and expiry. Runs in both Node and edge middleware. */
export async function verifySessionToken(
  token: string | undefined,
  secret: string,
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "admin") return false;
  const expires = Number(parts[1]);
  if (!Number.isFinite(expires) || expires < Date.now()) return false;
  const expected = await hmac(secret, `${parts[0]}.${parts[1]}`);
  // constant-time-ish compare
  if (expected.length !== parts[2]!.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ parts[2]!.charCodeAt(i);
  }
  return diff === 0;
}

export { SESSION_COOKIE };
