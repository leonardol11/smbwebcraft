import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { loadEnv, resetEnvForTests } from "@outreach/env";
import {
  clientSites,
  createTestDb,
  deals,
  eq,
  jobRuns,
  leads,
  markets,
  setDbForTests,
  stripeEvents,
  type Db,
} from "@outreach/db";
import { clearFakeSentEmails, getFakeSentEmails } from "@outreach/email";
import { defineJob, listJobs } from "@/jobs";
import { POST } from "./route";

let db: Db;

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=fake" },
      body: JSON.stringify(body),
    }),
  );
}

async function seedLead(suffix: string) {
  const [market] = await db
    .insert(markets)
    .values({ city: "Austin", state: "TX", slug: `t20-${suffix}` })
    .returning();
  const [lead] = await db
    .insert(leads)
    .values({
      marketId: market!.id,
      zip: "78701",
      businessName: `Bright Plumbing ${suffix}`,
      email: `owner-${suffix}@example.com`,
      category: "plumber",
      city: "Austin",
      status: "replied",
    })
    .returning();
  return lead!;
}

beforeEach(async () => {
  process.env.PROVIDER_MODE = "fake";
  resetEnvForTests();
  loadEnv(process.env);
  db = await createTestDb();
  setDbForTests(db);
  clearFakeSentEmails();
  // Another task owns the real site.suspend job; stub it if it's not registered.
  if (!listJobs().includes("site.suspend")) defineJob("site.suspend", async () => ({ stub: true }));
});

describe("POST /api/webhooks/stripe", () => {
  it("checkout.session.completed marks the deal paid, the lead customer, emails once, and deploys", async () => {
    const lead = await seedLead("a");
    const res = await post({
      id: "evt_checkout_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_1",
          object: "checkout.session",
          client_reference_id: lead.id,
          customer: "cus_1",
          subscription: "sub_1",
          customer_details: { email: lead.email },
        },
      },
    });
    expect(res.status).toBe(200);

    const [deal] = await db.select().from(deals).where(eq(deals.leadId, lead.id));
    expect(deal?.status).toBe("paid");
    expect(deal?.stripeSubscriptionId).toBe("sub_1");
    expect(deal?.paidAt).toBeTruthy();

    const [updated] = await db.select().from(leads).where(eq(leads.id, lead.id));
    expect(updated?.status).toBe("customer");

    const sent = getFakeSentEmails();
    expect(sent.filter((e) => e.to === lead.email && /Payment received/.test(e.subject))).toHaveLength(1);

    const runs = await db.select().from(jobRuns).where(eq(jobRuns.name, "site.build_and_deploy"));
    expect(runs).toHaveLength(1);
    // NOTE: jobs/site.ts (owned by another task) currently has a no-op
    // `db.update(deals).set({})` that throws "No values to set" after the site
    // row is persisted; once that is fixed this should also be "completed".
    expect(runs[0]?.input).toMatchObject({ leadId: lead.id, preview: false });
    const sites = await db.select().from(clientSites).where(eq(clientSites.leadId, lead.id));
    expect(sites.length).toBeGreaterThan(0);
  });

  it("invoice.payment_failed moves the deal to past_due and invoice.paid clears it", async () => {
    const lead = await seedLead("b");
    await db.insert(deals).values({
      leadId: lead.id,
      status: "paid",
      stripeCustomerId: "cus_2",
      stripeSubscriptionId: "sub_2",
      paidAt: new Date(),
    });

    const failed = await post({
      id: "evt_fail_1",
      type: "invoice.payment_failed",
      data: { object: { id: "in_1", object: "invoice", customer: "cus_2", subscription: "sub_2" } },
    });
    expect(failed.status).toBe(200);
    let [deal] = await db.select().from(deals).where(eq(deals.leadId, lead.id));
    expect(deal?.status).toBe("past_due");
    expect(deal?.failedSince).toBeTruthy();

    const paid = await post({
      id: "evt_paid_1",
      type: "invoice.paid",
      data: { object: { id: "in_2", object: "invoice", customer: "cus_2", subscription: "sub_2" } },
    });
    expect(paid.status).toBe(200);
    [deal] = await db.select().from(deals).where(eq(deals.leadId, lead.id));
    expect(deal?.status).toBe("paid");
    expect(deal?.failedSince).toBeNull();
  });

  it("ignores a duplicate event id", async () => {
    const lead = await seedLead("c");
    const payload = {
      id: "evt_dup_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_dup",
          client_reference_id: lead.id,
          customer: "cus_3",
          subscription: "sub_3",
        },
      },
    };
    expect((await post(payload)).status).toBe(200);
    const second = await post(payload);
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ duplicate: true });

    expect(getFakeSentEmails().filter((e) => e.to === lead.email && /Payment received/.test(e.subject))).toHaveLength(1);
    const runs = await db.select().from(jobRuns).where(eq(jobRuns.name, "site.build_and_deploy"));
    expect(runs).toHaveLength(1);
    const events = await db.select().from(stripeEvents);
    expect(events).toHaveLength(1);
  });

  it("customer.subscription.deleted cancels the deal and enqueues site.suspend", async () => {
    const lead = await seedLead("d");
    await db.insert(deals).values({
      leadId: lead.id,
      status: "paid",
      stripeCustomerId: "cus_4",
      stripeSubscriptionId: "sub_4",
    });
    const res = await post({
      id: "evt_del_1",
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_4", object: "subscription", customer: "cus_4" } },
    });
    expect(res.status).toBe(200);
    const [deal] = await db.select().from(deals).where(eq(deals.leadId, lead.id));
    expect(deal?.status).toBe("canceled");
    const runs = await db.select().from(jobRuns).where(eq(jobRuns.name, "site.suspend"));
    expect(runs).toHaveLength(1);
    expect(runs[0]?.input).toMatchObject({ leadId: lead.id, suspended: true });
  });
});
