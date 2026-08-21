import { hostnameFromUrl } from "../shared/normalize";

export const SOCIAL_HOSTS = [
  "facebook.com",
  "instagram.com",
  "yelp.com",
  "linktr.ee",
  "business.site",
] as const;

export type QualificationReason =
  | "no_website"
  | "social_only"
  | "dead_site"
  | "parked"
  | "has_website";

export type QualifyResult = { qualifies: boolean; reason: QualificationReason };

const FETCH_TIMEOUT_MS = 5000;

const PARKED_MARKERS = [
  "parked",
  "coming soon",
  "this domain is for sale",
  "domain is for sale",
  "buy this domain",
  "sedoparking",
  "hugedomains",
  "parkingcrew",
];

const FETCH_HEADERS = {
  accept: "text/html,application/xhtml+xml",
  "user-agent": "OutreachQualify/1.0",
};

function outcome(reason: QualificationReason): QualifyResult {
  return { qualifies: reason !== "has_website", reason };
}

export function isSocialOnlyHost(host: string): boolean {
  const h = host.replace(/^www\./, "").toLowerCase();
  return SOCIAL_HOSTS.some((social) => h === social || h.endsWith(`.${social}`));
}

function looksParked(html: string): boolean {
  const lower = html.toLowerCase();
  return PARKED_MARKERS.some((marker) => lower.includes(marker));
}

function toAbsoluteUrl(url: string): URL | null {
  try {
    return new URL(url.includes("://") ? url : `https://${url}`);
  } catch {
    return null;
  }
}

async function fetchWithTimeout(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: FETCH_HEADERS,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function qualifyWebsite(
  url: string | null | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<QualifyResult> {
  if (!url?.trim()) return outcome("no_website");

  const parsed = toAbsoluteUrl(url.trim());
  const host = hostnameFromUrl(url.trim());
  if (!parsed || !host || !host.includes(".")) {
    return outcome("no_website");
  }
  if (isSocialOnlyHost(host)) return outcome("social_only");

  try {
    const res = await fetchWithTimeout(parsed.toString(), fetchImpl, FETCH_TIMEOUT_MS);
    const finalHost = hostnameFromUrl(res.url || parsed.toString());
    if (finalHost && isSocialOnlyHost(finalHost)) return outcome("social_only");
    if (!res.ok) return outcome("dead_site");
    const html = await res.text();
    if (looksParked(html)) return outcome("parked");
    return outcome("has_website");
  } catch {
    return outcome("dead_site");
  }
}
