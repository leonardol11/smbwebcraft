import { beforeAll, describe, expect, it } from "vitest";
import { clientSites, createTestDb, deals, leads, markets, type Db } from "@outreach/db";
import { computeClientStats, daysPastDue, dealStatusVariant, listClients } from "./clients";

describe("computeClientStats", () => {
  it("counts active, past-due, suspended and derives MRR from the monthly price", () => {
    const stats = computeClientStats(
      [
        { dealStatus: "paid" },
        { dealStatus: "paid" },
        { dealStatus: "past_due" },
        { dealStatus: "suspended" },
        { dealStatus: "canceled" },
        { dealStatus: "pending" },
      ],
      2500,
    );
    expect(stats).toEqual({ activeCustomers: 2, mrrCents: 7500, pastDue: 1, suspended: 1 });
  });

  it("returns zeros for no customers", () => {
    expect(computeClientStats([], 2500)).toEqual({
      activeCustomers: 0,
      mrrCents: 0,
      pastDue: 0,
      suspended: 0,
    });
  });
});

describe("helpers", () => {
  it("computes whole days past due", () => {
    const now = new Date("2026-08-20T12:00:00Z");
    expect(daysPastDue(new Date("2026-08-15T06:00:00Z"), now)).toBe(5);
    expect(daysPastDue(null, now)).toBeNull();
  });

  it("maps deal status to badge variant", () => {
    expect(dealStatusVariant("paid")).toBe("success");
    expect(dealStatusVariant("past_due")).toBe("warning");
    expect(dealStatusVariant("suspended")).toBe("destructive");
    expect(dealStatusVariant("canceled")).toBe("destructive");
    expect(dealStatusVariant("pending")).toBe("muted");
  });
});

describe("listClients", () => {
  let db: Db;

  beforeAll(async () => {
    db = await createTestDb();
    const [austin] = await db
      .insert(markets)
      .values({ city: "Austin", state: "TX", slug: "austin-cl" })
      .returning();
    const [denver] = await db
      .insert(markets)
      .values({ city: "Denver", state: "CO", slug: "denver-cl" })
      .returning();
    const [a, b, c] = await db
      .insert(leads)
      .values([
        { marketId: austin!.id, zip: "78704", businessName: "Bella Nails", status: "customer" },
        { marketId: denver!.id, zip: "80202", businessName: "Mile High Plumbing", status: "customer" },
        { marketId: austin!.id, zip: "78701", businessName: "Pending Co", status: "interested" },
      ])
      .returning();
    await db.insert(deals).values([
      { leadId: a!.id, status: "paid", paidAt: new Date(), stripeCustomerId: "cus_1" },
      { leadId: b!.id, status: "past_due", failedSince: new Date() },
      { leadId: c!.id, status: "checkout_sent" },
    ]);
    await db.insert(clientSites).values({
      leadId: a!.id,
      slug: "bella-nails",
      liveUrl: "https://bella-nails.example.com",
      deployStatus: "live",
    });
  });

  it("returns only customer-stage deals with joined site info", async () => {
    const rows = await listClients(db);
    expect(rows.map((r) => r.businessName).sort()).toEqual(["Bella Nails", "Mile High Plumbing"]);
    const bella = rows.find((r) => r.businessName === "Bella Nails")!;
    expect(bella.liveUrl).toBe("https://bella-nails.example.com");
    expect(bella.deployStatus).toBe("live");
    expect(bella.city).toBe("Austin");
  });

  it("filters by market slug or city", async () => {
    expect((await listClients(db, "denver-cl")).map((r) => r.businessName)).toEqual([
      "Mile High Plumbing",
    ]);
    expect((await listClients(db, "austin")).map((r) => r.businessName)).toEqual(["Bella Nails"]);
  });
});
