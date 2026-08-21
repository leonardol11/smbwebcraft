import { and, eq, inArray } from "drizzle-orm";
import { assertNotPaused, campaigns, campaignZips, leads, type Db } from "@outreach/db";
import { discoverCampaign } from "@outreach/agents/discovery";
import { qualifyLead } from "@outreach/agents/qualify";
import { enrichLead } from "@outreach/agents/enrich";
import { defineJob } from "./core";

defineJob(
  "discovery.run",
  async (input: { campaignId: string; maxRequestsPerRun?: number }, { db }) => {
    await assertNotPaused(db, "discovery_paused");
    const result = await discoverCampaign(db, input.campaignId, {
      maxRequestsPerRun: input.maxRequestsPerRun,
    });

    const discovered = await db
      .select()
      .from(leads)
      .where(and(eq(leads.campaignId, input.campaignId), eq(leads.status, "discovered")))
      .limit(200);

    let qualified = 0;
    let enriched = 0;
    for (const lead of discovered) {
      const q = await qualifyLead(db, lead.id);
      if (q.status !== "qualified") continue;
      qualified += 1;
      const e = await enrichLead(db, lead.id);
      if (!e.skipped) enriched += 1;
    }

    return { ...result, qualified, enriched };
  },
);

export async function listRunningCampaigns(db: Db) {
  return db.select().from(campaigns).where(eq(campaigns.status, "running"));
}

export async function getCampaignZips(db: Db, campaignId: string) {
  return db.select().from(campaignZips).where(eq(campaignZips.campaignId, campaignId));
}

export async function readyLeadsForCampaign(db: Db, campaignId: string) {
  return db
    .select()
    .from(leads)
    .where(and(eq(leads.campaignId, campaignId), inArray(leads.status, ["qualified", "ready"])));
}
