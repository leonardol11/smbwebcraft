import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  campaigns,
  campaignZips,
  createTestDb,
  markets,
  setDbForTests,
  type Db,
} from "@outreach/db";
import { createCampaign, createMarket, setCampaignStatus } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

let db: Db;

function form(fields: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    for (const v of Array.isArray(value) ? value : [value]) fd.append(key, v);
  }
  return fd;
}

beforeAll(async () => {
  db = await createTestDb();
  setDbForTests(db);
});

describe("createMarket", () => {
  it("creates Austin with a slugified id and normalized state", async () => {
    await createMarket(form({ city: "Austin", state: "tx" }));
    const [m] = await db.select().from(markets).where(eq(markets.slug, "austin-tx"));
    expect(m).toMatchObject({ city: "Austin", state: "TX", slug: "austin-tx" });
  });

  it("rejects invalid state codes", async () => {
    await createMarket(form({ city: "Nowhere", state: "Texas" }));
    const rows = await db.select().from(markets).where(eq(markets.city, "Nowhere"));
    expect(rows).toHaveLength(0);
  });
});

describe("createCampaign", () => {
  async function austinId(): Promise<string> {
    const [m] = await db.select().from(markets).where(eq(markets.slug, "austin-tx"));
    return m!.id;
  }

  it("persists a 5-ZIP campaign with categories as draft", async () => {
    await createCampaign(
      form({
        marketId: await austinId(),
        slug: "austin-tx",
        name: "Austin pilot",
        dailyCap: "30",
        categories: ["nail_salon", "plumber"],
        zips: "78701, 78702 78703\n78704;78705",
      }),
    );
    const [c] = await db.select().from(campaigns).where(eq(campaigns.name, "Austin pilot"));
    expect(c).toMatchObject({
      status: "draft",
      dailyCap: 30,
      categories: ["nail_salon", "plumber"],
    });
    const zips = await db
      .select()
      .from(campaignZips)
      .where(eq(campaignZips.campaignId, c!.id));
    expect(zips.map((z) => z.zip).sort()).toEqual(["78701", "78702", "78703", "78704", "78705"]);
  });

  it("dedupes ZIPs and drops malformed ones", async () => {
    await createCampaign(
      form({
        marketId: await austinId(),
        slug: "austin-tx",
        name: "Dedupe test",
        zips: "78701 78701 787 abcde 78702",
      }),
    );
    const [c] = await db.select().from(campaigns).where(eq(campaigns.name, "Dedupe test"));
    const zips = await db
      .select()
      .from(campaignZips)
      .where(eq(campaignZips.campaignId, c!.id));
    expect(zips.map((z) => z.zip).sort()).toEqual(["78701", "78702"]);
  });

  it("clamps the daily cap to the 450 global maximum", async () => {
    await createCampaign(
      form({
        marketId: await austinId(),
        slug: "austin-tx",
        name: "Cap test",
        dailyCap: "10000",
        zips: "78701",
      }),
    );
    const [c] = await db.select().from(campaigns).where(eq(campaigns.name, "Cap test"));
    expect(c!.dailyCap).toBe(450);
  });

  it("defaults the daily cap to 25 when omitted", async () => {
    await createCampaign(
      form({ marketId: await austinId(), slug: "austin-tx", name: "Default cap", zips: "78701" }),
    );
    const [c] = await db.select().from(campaigns).where(eq(campaigns.name, "Default cap"));
    expect(c!.dailyCap).toBe(25);
  });

  it("refuses a campaign without any valid ZIPs", async () => {
    await createCampaign(
      form({ marketId: await austinId(), slug: "austin-tx", name: "No zips", zips: "not-a-zip" }),
    );
    const rows = await db.select().from(campaigns).where(eq(campaigns.name, "No zips"));
    expect(rows).toHaveLength(0);
  });
});

describe("setCampaignStatus", () => {
  it("runs draft -> running -> paused -> running, persisted across re-reads", async () => {
    const [c] = await db.select().from(campaigns).where(eq(campaigns.name, "Austin pilot"));
    const id = c!.id;

    await setCampaignStatus(id, "running", "austin-tx");
    // Re-selecting from the DB is the "survives reload" check: the page
    // re-reads campaign status on every render.
    let [row] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    expect(row!.status).toBe("running");

    await setCampaignStatus(id, "paused", "austin-tx");
    [row] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    expect(row!.status).toBe("paused");

    await setCampaignStatus(id, "running", "austin-tx");
    [row] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    expect(row!.status).toBe("running");
  });

  it("rejects invalid transitions", async () => {
    const [c] = await db.select().from(campaigns).where(eq(campaigns.name, "Cap test"));
    const id = c!.id;

    // draft -> paused is not allowed
    await setCampaignStatus(id, "paused", "austin-tx");
    let [row] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    expect(row!.status).toBe("draft");

    // running -> draft is not allowed
    await setCampaignStatus(id, "running", "austin-tx");
    await setCampaignStatus(id, "draft", "austin-tx");
    [row] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    expect(row!.status).toBe("running");
  });
});
