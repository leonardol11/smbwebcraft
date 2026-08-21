import { and, eq, gte, inArray, sql } from "drizzle-orm";
import {
  campaigns,
  campaignZips,
  deals,
  leads,
  markets,
  outreachMessages,
  type Db,
} from "@outreach/db";

export type MarketStats = {
  market: typeof markets.$inferSelect;
  campaigns: (typeof campaigns.$inferSelect)[];
  zipCount: number;
  leadCount: number;
  emailedCount: number;
  repliedCount: number;
  paidCount: number;
  mrrCents: number;
  sendsByDay: { day: string; sends: number }[];
};

export async function getMarketStats(db: Db): Promise<MarketStats[]> {
  const allMarkets = await db.select().from(markets).orderBy(markets.city);
  const allCampaigns = await db.select().from(campaigns);
  const zipCounts = await db
    .select({
      marketId: campaigns.marketId,
      count: sql<number>`count(distinct ${campaignZips.zip})::int`,
    })
    .from(campaignZips)
    .innerJoin(campaigns, eq(campaignZips.campaignId, campaigns.id))
    .groupBy(campaigns.marketId);

  const leadCounts = await db
    .select({ marketId: leads.marketId, count: sql<number>`count(*)::int` })
    .from(leads)
    .groupBy(leads.marketId);

  const emailedCounts = await db
    .select({ marketId: leads.marketId, count: sql<number>`count(distinct ${leads.id})::int` })
    .from(leads)
    .innerJoin(outreachMessages, eq(outreachMessages.leadId, leads.id))
    .where(eq(outreachMessages.direction, "outbound"))
    .groupBy(leads.marketId);

  const repliedCounts = await db
    .select({ marketId: leads.marketId, count: sql<number>`count(*)::int` })
    .from(leads)
    .where(inArray(leads.status, ["replied", "interested", "customer"]))
    .groupBy(leads.marketId);

  const paidRows = await db
    .select({
      marketId: leads.marketId,
      count: sql<number>`count(*)::int`,
      mrr: sql<number>`coalesce(sum(${deals.mrrCents}), 0)::int`,
    })
    .from(deals)
    .innerJoin(leads, eq(deals.leadId, leads.id))
    .where(inArray(deals.status, ["paid", "past_due"]))
    .groupBy(leads.marketId);

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const sendRows = await db
    .select({
      marketId: leads.marketId,
      day: sql<string>`to_char(${outreachMessages.createdAt}, 'YYYY-MM-DD')`,
      sends: sql<number>`count(*)::int`,
    })
    .from(outreachMessages)
    .innerJoin(leads, eq(outreachMessages.leadId, leads.id))
    .where(
      and(eq(outreachMessages.direction, "outbound"), gte(outreachMessages.createdAt, since)),
    )
    .groupBy(leads.marketId, sql`to_char(${outreachMessages.createdAt}, 'YYYY-MM-DD')`);

  const byId = <T extends { marketId: string | null }>(rows: T[]) => {
    const m = new Map<string, T>();
    for (const r of rows) if (r.marketId) m.set(r.marketId, r);
    return m;
  };

  const zipMap = byId(zipCounts);
  const leadMap = byId(leadCounts);
  const emailedMap = byId(emailedCounts);
  const repliedMap = byId(repliedCounts);
  const paidMap = byId(paidRows);

  return allMarkets.map((market) => {
    const days: { day: string; sends: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      const row = sendRows.find((r) => r.marketId === market.id && r.day === key);
      days.push({ day: key, sends: row?.sends ?? 0 });
    }
    return {
      market,
      campaigns: allCampaigns.filter((c) => c.marketId === market.id),
      zipCount: zipMap.get(market.id)?.count ?? 0,
      leadCount: leadMap.get(market.id)?.count ?? 0,
      emailedCount: emailedMap.get(market.id)?.count ?? 0,
      repliedCount: repliedMap.get(market.id)?.count ?? 0,
      paidCount: paidMap.get(market.id)?.count ?? 0,
      mrrCents: paidMap.get(market.id)?.mrr ?? 0,
      sendsByDay: days,
    };
  });
}
