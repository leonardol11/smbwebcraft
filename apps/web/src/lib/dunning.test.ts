import { beforeEach, describe, expect, it } from "vitest";
import { loadEnv, resetEnvForTests } from "@outreach/env";
import {
  createTestDb,
  deals,
  eq,
  jobRuns,
  leads,
  markets,
  setDbForTests,
  setSetting,
  type Db,
} from "@outreach/db";
import { clearFakeSentEmails, getFakeSentEmails } from "@outreach/email";
import { defineJob, listJobs } from "@/jobs";
import { computeMrr, processDunning } from "./dunning";

let db: Db;
const DAY = 86_400_000;

beforeEach(async () => {
  process.env.PROVIDER_MODE = "fake";
  process.env.STRIPE_CUSTOMER_PORTAL_URL = "https://billing.stripe.com/p/login/test_portal";
  resetEnvForTests();
  loadEnv(process.env);
  db = await createTestDb();
  setDbForTests(db);
  clearFakeSentEmails();
  if (!listJobs().includes("site.suspend")) defineJob("site.suspend", async () => ({ stub: true }));
});

async function seedPastDue(daysAgo: number, suffix = "a") {
  const [market] = await db
    .insert(markets)
    .values({ city: "Austin", state: "TX", slug: `t25-${suffix}` })
    .returning();
  const [lead] = await db
    .insert(leads)
    .values({
      marketId: market!.id,
      zip: "78701",
      businessName: `Dunning Dental ${suffix}`,
      email: `dunning-${suffix}@example.com`,
      status: "customer",
    })
    .returning();
  const [deal] = await db
    .insert(deals)
    .values({
      leadId: lead!.id,
      status: "past_due",
      stripeCustomerId: `cus_${suffix}`,
      stripeSubscriptionId: `sub_${suffix}`,
      failedSince: new Date(Date.now() - daysAgo * DAY),
    })
    .returning();
  return { lead: lead!, deal: deal! };
}

describe("processDunning", () => {
  it("sends exactly one day-3 email with the portal link and is idempotent on rerun", async () => {
    const { lead, deal } = await seedPastDue(3);

    const first = await processDunning(db);
    expect(first.emailed).toBe(1);
    let sent = getFakeSentEmails().filter((e) => e.to === lead.email);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.text).toContain("https://billing.stripe.com/p/login/test_portal?prefilled_email=");

    const second = await processDunning(db);
    expect(second.emailed).toBe(0);
    sent = getFakeSentEmails().filter((e) => e.to === lead.email);
    expect(sent).toHaveLength(1);

    const [row] = await db.select().from(deals).where(eq(deals.id, deal.id));
    expect(row?.dunningStage).toBe(3);
    expect(row?.status).toBe("past_due");
  });

  it("sends the day-7 email after day 3 was sent, but never re-sends day 3", async () => {
    const { lead, deal } = await seedPastDue(3);
    await processDunning(db);
    // Advance the clock 4 days.
    const later = new Date(Date.now() + 4 * DAY);
    const res = await processDunning(db, later);
    expect(res.emailed).toBe(1);
    expect(getFakeSentEmails().filter((e) => e.to === lead.email)).toHaveLength(2);
    const [row] = await db.select().from(deals).where(eq(deals.id, deal.id));
    expect(row?.dunningStage).toBe(7);
  });

  it("suspends past the threshold and enqueues site.suspend", async () => {
    await setSetting(db, "suspend_after_days_past_due", 10);
    const { lead, deal } = await seedPastDue(11, "s");

    const res = await processDunning(db);
    expect(res.suspended).toBe(1);
    expect(res.emailed).toBe(0);

    const [row] = await db.select().from(deals).where(eq(deals.id, deal.id));
    expect(row?.status).toBe("suspended");
    const runs = await db.select().from(jobRuns).where(eq(jobRuns.name, "site.suspend"));
    expect(runs).toHaveLength(1);
    expect(runs[0]?.input).toMatchObject({ leadId: lead.id, suspended: true });

    // Rerun: already suspended, nothing more happens.
    const again = await processDunning(db);
    expect(again.suspended).toBe(0);
    expect(await db.select().from(jobRuns).where(eq(jobRuns.name, "site.suspend"))).toHaveLength(1);
  });
});

describe("computeMrr", () => {
  it("sums monthly price of paid + past_due deals only", async () => {
    const { deal } = await seedPastDue(1, "m");
    expect(await computeMrr(db)).toBe(2500);
    await db.update(deals).set({ status: "canceled" }).where(eq(deals.id, deal.id));
    expect(await computeMrr(db)).toBe(0);
  });
});
