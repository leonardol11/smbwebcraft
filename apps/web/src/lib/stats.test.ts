import { beforeAll, describe, expect, it } from "vitest";
import {
  createTestDb,
  deals,
  leads,
  markets,
  outreachMessages,
  type Db,
} from "@outreach/db";
import {
  currentMrrCents,
  dealsClosedMtd,
  getFunnelStats,
  getOverviewKpis,
  replyRate7d,
  sendsToday,
} from "./stats";

let db: Db;
let marketId: string;
let leadA: string;
let leadB: string;
let leadC: string;

beforeAll(async () => {
  db = await createTestDb();
  const [market] = await db
    .insert(markets)
    .values({ city: "Austin", state: "TX", slug: "austin-ov" })
    .returning();
  marketId = market!.id;

  const inserted = await db
    .insert(leads)
    .values([
      {
        marketId,
        zip: "78704",
        businessName: "Bella Nails",
        city: "Austin",
        status: "replied",
      },
      {
        marketId,
        zip: "78701",
        businessName: "Tony's Plumbing",
        city: "Austin",
        status: "sequenced",
      },
      {
        marketId,
        zip: "78745",
        businessName: "Skipped Shop",
        city: "Austin",
        status: "skipped",
      },
    ])
    .returning();
  leadA = inserted[0]!.id;
  leadB = inserted[1]!.id;
  leadC = inserted[2]!.id;

  await db.insert(outreachMessages).values([
    { leadId: leadA, direction: "outbound", status: "sent" },
    { leadId: leadA, direction: "inbound", status: "received" },
    { leadId: leadB, direction: "outbound", status: "delivered" },
  ]);

  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth() - 1);

  await db.insert(deals).values([
    { leadId: leadA, status: "paid", mrrCents: 2500, paidAt: new Date(), setupCents: 10000 },
    { leadId: leadB, status: "paid", mrrCents: 2500, paidAt: lastMonth, setupCents: 10000 },
  ]);
});

describe("overview KPIs", () => {
  it("counts emails sent today", async () => {
    expect(await sendsToday(db)).toBe(2);
  });

  it("computes unique-lead reply rate over 7d", async () => {
    const rate = await replyRate7d(db);
    expect(rate).toEqual({ emailed: 2, replied: 1, rate: 0.5 });
  });

  it("counts deals closed this month only", async () => {
    expect(await dealsClosedMtd(db)).toBe(1);
  });

  it("sums MRR from paid + past_due deals", async () => {
    expect(await currentMrrCents(db)).toBe(5000);
  });

  it("bundles the four overview KPIs", async () => {
    const kpis = await getOverviewKpis(db);
    expect(kpis.emailsSentToday).toBe(2);
    expect(kpis.replyRate.rate).toBe(0.5);
    expect(kpis.dealsClosedMtd).toBe(1);
    expect(kpis.mrrCents).toBe(5000);
  });
});

describe("funnel", () => {
  it("counts discovered → qualified → emailed → replied → paid → live", async () => {
    const funnel = await getFunnelStats(db);
    expect(funnel.discovered).toBe(3);
    expect(funnel.qualified).toBe(2); // skipped excluded
    expect(funnel.emailed).toBe(2);
    expect(funnel.replied).toBe(1);
    expect(funnel.paid).toBe(2);
    expect(funnel.live).toBe(0);
    expect(leadC).toBeTruthy();
  });
});
