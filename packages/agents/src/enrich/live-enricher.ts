import { env } from "@outreach/env";
import type { EmailEnricher, EnrichResult } from "./enricher";

type FetchImpl = typeof fetch;

/** Hunter domain-search list price, ~$0.05 per lookup. */
export const HUNTER_LOOKUP_COST_MICRO_USD = 50_000;

export class HunterEmailEnricher implements EmailEnricher {
  readonly lookupCostMicroUsd = HUNTER_LOOKUP_COST_MICRO_USD;

  constructor(
    private readonly fetchImpl: FetchImpl = fetch,
    private readonly apiKey?: string,
  ) {}

  async findEmail(domainOrBusiness: string): Promise<EnrichResult | null> {
    const key = this.apiKey ?? env().HUNTER_API_KEY;
    if (!key) throw new Error("HUNTER_API_KEY is required in live mode");

    const domain = domainOrBusiness
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0]!;

    const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${key}`;
    const res = await this.fetchImpl(url);
    if (!res.ok) return null;

    const data = (await res.json()) as {
      data?: { emails?: Array<{ value: string; confidence?: number }> };
    };
    const emails = data.data?.emails ?? [];
    const top = [...emails].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
    if (!top?.value) return null;
    return { email: top.value, confidence: top.confidence ?? 50 };
  }
}
