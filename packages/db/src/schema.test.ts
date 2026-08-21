import { describe, expect, it, beforeAll } from "vitest";
import { createTestDb } from "./testing";
import type { Db } from "./client";
import { leads, markets, outreachMessages } from "./schema";
import { seed } from "./seed";
import { assertNotPaused, getSettings, PausedError, setSetting } from "./settings";

let db: Db;

beforeAll(async () => {
  db = await createTestDb();
});

describe("schema + migrations", () => {
  it("applies migrations and inserts a market", async () => {
    const [m] = await db
      .insert(markets)
      .values({ city: "Austin", state: "TX", slug: "austin-test" })
      .returning();
    expect(m?.id).toBeTruthy();
  });

  it("enforces sequence step idempotency per lead", async () => {
    const [m] = await db
      .insert(markets)
      .values({ city: "X", state: "TX", slug: "x-test" })
      .returning();
    const [lead] = await db
      .insert(leads)
      .values({ marketId: m!.id, zip: "78701", businessName: "Test Biz" })
      .returning();

    await db.insert(outreachMessages).values({
      leadId: lead!.id,
      direction: "outbound",
      sequenceStep: 0,
    });
    await expect(
      db.insert(outreachMessages).values({
        leadId: lead!.id,
        direction: "outbound",
        sequenceStep: 0,
      }),
    ).rejects.toThrow();
  });

  it("seeds two cities with leads", async () => {
    const fresh = await createTestDb();
    await seed(fresh, 25);
    const allLeads = await fresh.select().from(leads);
    const allMarkets = await fresh.select().from(markets);
    expect(allMarkets.length).toBe(2);
    expect(allLeads.length).toBe(50);
  });
});

describe("settings + kill switches", () => {
  it("returns defaults and persists overrides", async () => {
    const s = await getSettings(db);
    expect(s.sending_paused).toBe(false);
    await setSetting(db, "sending_paused", true);
    const s2 = await getSettings(db);
    expect(s2.sending_paused).toBe(true);
    await setSetting(db, "sending_paused", false);
  });

  it("assertNotPaused throws PausedError when flag is on", async () => {
    await setSetting(db, "discovery_paused", true);
    await expect(assertNotPaused(db, "discovery_paused")).rejects.toThrow(PausedError);
    await setSetting(db, "discovery_paused", false);
    await expect(assertNotPaused(db, "discovery_paused")).resolves.toBeUndefined();
  });
});
