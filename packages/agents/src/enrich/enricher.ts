export type EnrichResult = { email: string; confidence: number };

export interface EmailEnricher {
  /** Cost of one findEmail call in micro-USD, charged even on a miss. */
  readonly lookupCostMicroUsd: number;
  findEmail(domainOrBusiness: string): Promise<EnrichResult | null>;
}
