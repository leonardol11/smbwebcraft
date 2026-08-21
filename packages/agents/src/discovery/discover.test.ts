import { describe, expect, it, beforeEach } from "vitest";
import {
  eq,
  createTestDb,
  campaigns,
  campaignZips,
  leads,
  markets,
  setSetting,
  PausedError,
  type Db,
} from "@outreach/db";
import { discoverCampaign, FakePlacesClient } from "./index";
import type { PlaceBusiness, PlacesClient, SearchNearbyResult } from "./places-client";

function biz(overrides: Partial<PlaceBusiness> & Pick<PlaceBusiness, "place_id" | "name">): PlaceBusiness {
  return {
    phone: null,
    website: null,
    address: "100 Main St, Austin 78701",
    city: "Austin",
    state: "TX",
    zip: "78701",
    types: ["plumber"],
    rating: 4,
    reviewCount: 10,
    photoUrls: [],
    hours: null,
    ...overrides,
  };
}

function scriptedClient(pages: PlaceBusiness[][]): PlacesClient {
  return {
    async geocodeZip() {
      return { lat: 30.2672, lng: -97.7431 };
    },
    async searchNearby({ pageToken }): Promise<SearchNearbyResult> {
      const idx = pageToken ? Number.parseInt(pageToken, 10) : 0;
      return {
        businesses: pages[idx] ?? [],
        nextPageToken: idx + 1 < pages.length ? String(idx + 1) : undefined,
      };
    },
  };
}

describe("discoverCampaign", () => {
  let db: Db;
  let campaignId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await setSetting(db, "discovery_paused", false);
    const [market] = await db
      .insert(markets)
      .values({ city: "Austin", state: "TX", slug: "austin-disc" })
      .returning();
    const [campaign] = await db
      .insert(campaigns)
      .values({
        marketId: market!.id,
        name: "Test",
        categories: ["plumber", "nail_salon"],
        status: "running",
      })
      .returning();
    campaignId = campaign!.id;
    await db.insert(campaignZips).values({ campaignId, zip: "78701" });
  });

  it("creates leads from fake places client", async () => {
    const result = await discoverCampaign(db, campaignId, { placesClient: new FakePlacesClient() });
    expect(result.created).toBeGreaterThanOrEqual(5);
    expect(result.requests).toBeGreaterThan(0);

    const rows = await db.select().from(leads).where(eq(leads.campaignId, campaignId));
    expect(rows.length).toBe(result.created);
    expect(rows.every((r) => r.status === "discovered")).toBe(true);
  });

  it("creates leads on one ZIP and a second run creates zero duplicates", async () => {
    const first = await discoverCampaign(db, campaignId, { placesClient: new FakePlacesClient() });
    expect(first.created).toBeGreaterThan(0);

    const countAfterFirst = (await db.select().from(leads).where(eq(leads.campaignId, campaignId))).length;
    expect(countAfterFirst).toBe(first.created);

    const second = await discoverCampaign(db, campaignId, { placesClient: new FakePlacesClient() });
    expect(second.created).toBe(0);
    expect(second.skippedDuplicates).toBeGreaterThan(0);

    const countAfterSecond = (await db.select().from(leads).where(eq(leads.campaignId, campaignId))).length;
    expect(countAfterSecond).toBe(countAfterFirst);
  });

  it("respects request cap including geocode", async () => {
    const result = await discoverCampaign(db, campaignId, {
      maxRequestsPerRun: 2,
      placesClient: new FakePlacesClient(),
    });
    expect(result.requests).toBeLessThanOrEqual(2);
  });

  it("paginates search results until pages are exhausted", async () => {
    const client = scriptedClient([
      [biz({ place_id: "p1", name: "Page One A" }), biz({ place_id: "p2", name: "Page One B" })],
      [biz({ place_id: "p3", name: "Page Two A" })],
    ]);
    await db.update(campaigns).set({ categories: ["plumber"] }).where(eq(campaigns.id, campaignId));

    const result = await discoverCampaign(db, campaignId, { placesClient: client });
    // 1 geocode + 2 search pages
    expect(result.requests).toBe(3);
    expect(result.created).toBe(3);
  });

  it("dedupes by phone across different place_ids", async () => {
    const client = scriptedClient([
      [
        biz({ place_id: "a", name: "Alpha Plumbing", phone: "+1 (512) 555-0100" }),
        biz({ place_id: "b", name: "Beta Plumbing", phone: "512-555-0100" }),
      ],
    ]);
    await db.update(campaigns).set({ categories: ["plumber"] }).where(eq(campaigns.id, campaignId));

    const result = await discoverCampaign(db, campaignId, { placesClient: client });
    expect(result.created).toBe(1);
    expect(result.skippedDuplicates).toBe(1);
  });

  it("dedupes by normalized name and address when phones differ", async () => {
    const client = scriptedClient([
      [
        biz({
          place_id: "a",
          name: "Joe's Plumbing",
          phone: "+15125550100",
          address: "100 Main St.",
        }),
        biz({
          place_id: "b",
          name: "Joes Plumbing",
          phone: "+15125550999",
          address: "100 Main St",
        }),
      ],
    ]);
    await db.update(campaigns).set({ categories: ["plumber"] }).where(eq(campaigns.id, campaignId));

    const result = await discoverCampaign(db, campaignId, { placesClient: client });
    expect(result.created).toBe(1);
    expect(result.skippedDuplicates).toBe(1);
  });

  it("aborts when discovery is paused", async () => {
    await setSetting(db, "discovery_paused", true);
    await expect(
      discoverCampaign(db, campaignId, { placesClient: new FakePlacesClient() }),
    ).rejects.toThrow(PausedError);
  });
});
