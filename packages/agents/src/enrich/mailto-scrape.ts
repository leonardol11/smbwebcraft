const MAILTO_RE = /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
const FETCH_TIMEOUT_MS = 5000;

export async function scrapeMailtoFromWebsite(
  websiteUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ email: string; confidence: number } | null> {
  let url: URL;
  try {
    url = new URL(websiteUrl.includes("://") ? websiteUrl : `https://${websiteUrl}`);
  } catch {
    return null;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetchImpl(url.toString(), { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return null;
    const html = await res.text();
    const matches = [...html.matchAll(MAILTO_RE)].map((m) => m[1]!.toLowerCase());
    const email = matches.find((e) => !e.includes("example.com"));
    if (!email) return null;
    return { email, confidence: 40 };
  } catch {
    return null;
  }
}
