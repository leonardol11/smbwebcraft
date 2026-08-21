import { createHmac, timingSafeEqual } from "node:crypto";

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Create an HMAC-signed unsubscribe token for an email address. */
export function createUnsubscribeToken(email: string, secret: string): string {
  const normalized = email.trim().toLowerCase();
  const sig = sign(normalized, secret);
  return Buffer.from(`${normalized}:${sig}`).toString("base64url");
}

/** Verify token and return the email address, or null if invalid. */
export function verifyUnsubscribeToken(token: string, secret: string): string | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const colon = decoded.lastIndexOf(":");
    if (colon <= 0) return null;

    const email = decoded.slice(0, colon);
    const sig = decoded.slice(colon + 1);
    const expected = sign(email, secret);

    if (sig.length !== expected.length) return null;
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

    const expectedToken = createUnsubscribeToken(email, secret);
    if (token !== expectedToken) return null;

    return email;
  } catch {
    return null;
  }
}

export function unsubscribeUrl(token: string, appUrl: string): string {
  return `${appUrl.replace(/\/$/, "")}/u/${token}`;
}
