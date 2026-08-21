import { beforeEach, describe, expect, it } from "vitest";
import {
  campaigns,
  campaignZips,
  createTestDb,
  leads,
  markets,
  setDbForTests,
  setSetting,
  eq,
  type Db,
} from "@outreach/db";
import { runJob } from "./core";
import "./discovery";

describe("discovery.run job", () => {
  let db: Db;
  let campaignId: string;

  beforeEach(async () => {
    db = await createTestDb();
    setDbForTests(db);
    await setSetting(db, "discovery_paused", false);
    const [market] = await db
      .insert(markets)
      .values({ city: "Austin", state: "TX", slug: "austin-job-disc" })
      .returning();
    const [campaign] = await db
      .insert(campaigns)
      .values({
        marketId: market!.id,
        name: "Job discovery",
        categories: ["plumber"],
        status: "running",
      })
      .returning();
    campaignId = campaign!.id;
    await db.insert(campaignZips).values({ campaignId, zip: "78701" });
  });

  it("creates leads on one ZIP and a second run creates zero duplicates", async () => {
    const first = await runJob("discovery.run", { campaignId });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const firstResult = first.result as { created: number; skippedDuplicates: number };
    expect(firstResult.created).toBeGreaterThan(0);

    const afterFirst = await db.select().from(leads).where(eq(leads.campaignId, campaignId));
    expect(afterFirst.length).toBe(firstResult.created);
    expect(afterFirst.every((r) => r.status === "discovered")).toBe(true);

    const second = await runJob("discovery.run", { campaignId });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const secondResult = second.result as { created: number; skippedDuplicates: number };
    expect(secondResult.created).toBe(0);
    expect(secondResult.skippedDuplicates).toBeGreaterThan(0);

    const afterSecond = await db.select().from(leads).where(eq(leads.campaignId, campaignId));
    expect(afterSecond.length).toBe(afterFirst.length);
  });
});
