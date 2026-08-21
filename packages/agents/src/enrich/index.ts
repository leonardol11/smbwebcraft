import { eq, leads, type Db } from "@outreach/db";
import { env } from "@outreach/env";
import { hostnameFromUrl } from "../shared/normalize";
import { logAgentAction } from "../shared/log-action";
import type { EmailEnricher, EnrichResult } from "./enricher";
import { FakeEmailEnricher } from "./fake-enricher";
import { HunterEmailEnricher } from "./live-enricher";
import { scrapeMailtoFromWebsite } from "./mailto-scrape";

export type { EmailEnricher, EnrichResult } from "./enricher";
export { FakeEmailEnricher } from "./fake-enricher";
export { HunterEmailEnricher, HUNTER_LOOKUP_COST_MICRO_USD } from "./live-enricher";
export { scrapeMailtoFromWebsite } from "./mailto-scrape";

const domainCache = new Map<string, EnrichResult | null>();

export function clearEnrichCacheForTests(): void {
  domainCache.clear();
}

export function createEmailEnricher(
  enricher?: EmailEnricher,
  fetchImpl?: typeof fetch,
): EmailEnricher {
  if (enricher) return enricher;
  return env().PROVIDER_MODE === "live"
    ? new HunterEmailEnricher(fetchImpl)
    : new FakeEmailEnricher();
}

export type EnrichLeadResult =
  | { leadId: string; skipped: true; reason: "has_email" | "not_found" }
  | { leadId: string; skipped: false; email: string; confidence: number; source: string };

export async function enrichLead(
  db: Db,
  leadId: string,
  options: { enricher?: EmailEnricher; fetchImpl?: typeof fetch } = {},
): Promise<EnrichLeadResult> {
  const started = Date.now();
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
  if (!lead) throw new Error(`Lead not found: ${leadId}`);

  if (lead.email) {
    return { leadId, skipped: true, reason: "has_email" };
  }

  const domain =
    hostnameFromUrl(lead.websiteUrl) ??
    lead.businessName.toLowerCase().replace(/\s+/g, "");

  let result: EnrichResult | null;
  let source: string;
  let costMicroUsd = 0;

  if (domainCache.has(domain)) {
    result = domainCache.get(domain) ?? null;
    source = "cache";
  } else {
    const enricher = createEmailEnricher(options.enricher, options.fetchImpl);
    result = await enricher.findEmail(domain);
    costMicroUsd = enricher.lookupCostMicroUsd;
    source = result ? "hunter" : "none";

    if (!result && lead.websiteUrl) {
      result = await scrapeMailtoFromWebsite(lead.websiteUrl, options.fetchImpl);
      if (result) source = "mailto";
    }

    domainCache.set(domain, result);
  }

  if (!result) {
    await logAgentAction(db, {
      agent: "enrich",
      action: "enrich_lead",
      leadId,
      marketId: lead.marketId,
      input: { domain },
      output: { found: false, source },
      costMicroUsd,
      durationMs: Date.now() - started,
    });
    return { leadId, skipped: true, reason: "not_found" };
  }

  await db
    .update(leads)
    .set({
      email: result.email,
      emailConfidence: result.confidence,
      updatedAt: new Date(),
    })
    .where(eq(leads.id, leadId));

  await logAgentAction(db, {
    agent: "enrich",
    action: "enrich_lead",
    leadId,
    marketId: lead.marketId,
    input: { domain },
    output: { email: result.email, confidence: result.confidence, source },
    costMicroUsd,
    durationMs: Date.now() - started,
  });

  return { leadId, skipped: false, email: result.email, confidence: result.confidence, source };
}
