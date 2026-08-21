import type { EmailEnricher, EnrichResult } from "./enricher";

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export class FakeEmailEnricher implements EmailEnricher {
  readonly lookupCostMicroUsd = 0;

  async findEmail(domainOrBusiness: string): Promise<EnrichResult | null> {
    const key = domainOrBusiness.toLowerCase().replace(/^www\./, "");
    if (key.includes("noemail") || key.includes("facebook")) return null;
    const h = hash(key);
    const domain = key.includes(".") ? key : `${key.replace(/\s+/g, "").toLowerCase()}.example.com`;
    return {
      email: `contact@${domain.replace(/^https?:\/\//, "")}`,
      confidence: 60 + (h % 35),
    };
  }
}
