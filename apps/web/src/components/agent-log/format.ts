/**
 * Pure display helpers for the Agent Log. Kept dependency-free so they can be
 * unit-tested without the Next.js runtime.
 */

/** Keys whose values must never reach the browser. */
const SECRET_KEY_RE = /(api[_-]?key|secret|token|password|passwd|authorization|credential|ssn|bank)/i;

/** Keys that hold email bodies / transcripts, which we never render in full. */
const BODY_KEY_RE = /^(body|body_?text|body_?html|html|raw|transcript|messages?|email_?body|content|text)$/i;

const MAX_STRING_LENGTH = 300;
const MAX_ARRAY_ITEMS = 50;
const MAX_DEPTH = 6;

export function redactValue(value: unknown, key?: string, depth = 0): unknown {
  if (key && SECRET_KEY_RE.test(key)) return "[redacted]";
  if (key && BODY_KEY_RE.test(key)) return "[content hidden]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}… [truncated]`
      : value;
  }
  if (typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[max depth]";
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((v) => redactValue(v, undefined, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) items.push(`[+${value.length - MAX_ARRAY_ITEMS} more]`);
    return items;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = redactValue(v, k, depth + 1);
  }
  return out;
}

/** Pretty-prints a JSON payload with secrets and email bodies stripped. */
export function toPrettyJson(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  try {
    return JSON.stringify(redactValue(value), null, 2);
  } catch {
    return "[unserializable payload]";
  }
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/** costMicroUsd is stored in millionths of a dollar. */
export function formatCost(microUsd: number | null | undefined): string {
  if (microUsd === null || microUsd === undefined) return "—";
  const dollars = microUsd / 1_000_000;
  if (dollars === 0) return "$0.00";
  if (dollars < 0.01) return `$${dollars.toFixed(4)}`;
  return `$${dollars.toFixed(2)}`;
}

export function formatTokens(
  tokensIn: number | null | undefined,
  tokensOut: number | null | undefined,
): string | null {
  if (tokensIn === null || tokensIn === undefined) {
    if (tokensOut === null || tokensOut === undefined) return null;
    return `–/${tokensOut}`;
  }
  return `${tokensIn}/${tokensOut ?? "–"}`;
}
