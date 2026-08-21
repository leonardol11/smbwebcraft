import { beforeEach, describe, expect, it } from "vitest";
import {
  agentActions,
  clientSites,
  createTestDb,
  eq,
  leads,
  markets,
  setDbForTests,
  type Db,
} from "@outreach/db";
import { loadEnv, resetEnvForTests } from "@outreach/env";
import { getFakeDeployedHtml, isFakeSuspended, resetFakeDeployStore } from "@outreach/sites";
import { runJob } from "./core";
import "./site";

describe("site jobs", () => {
  let db: Db;
  let leadId: string;

  beforeEach(async () => {
    resetEnvForTests();
    process.env.PROVIDER_MODE = "fake";
    loadEnv(process.env);
    resetFakeDeployStore();
    db = await createTestDb();
    setDbForTests(db);
    const [market] = await db
      .insert(markets)
      .values({ city: "Austin", state: "TX", slug: "site-job-austin" })
      .returning();
    const [lead] = await db
      .insert(leads)
      .values({
        marketId: market!.id,
        zip: "78704",
        businessName: "Bella Nails",
        category: "nail_salon",
        city: "Austin",
        state: "TX",
        phone: "(512) 555-0123",
        address: "500 S Lamar Blvd",
        email: "maria@bellanails.test",
        status: "customer",
        placesData: { types: ["nail_salon"], rating: 4.8, reviewCount: 40, hours: { Mon: "9-6" } },
      })
      .returning();
    leadId = lead!.id;
  });

  it("build_and_deploy generates, deploys, and marks the row live", async () => {
    const result = await runJob("site.build_and_deploy", { leadId, preview: false });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const out = result.result as { siteId: string; slug: string; url: string };
    expect(out.slug).toBe("bella-nails-austin");
    expect(out.url).toBe("http://bella-nails-austin.localhost:3000");

    const [site] = await db.select().from(clientSites).where(eq(clientSites.id, out.siteId));
    expect(site?.deployStatus).toBe("live");
    expect(site?.liveUrl).toBe(out.url);
    expect(site?.isPreview).toBe(false);
    expect(site?.lastDeployedAt).toBeInstanceOf(Date);
    expect(site?.deployError).toBeNull();

    const html = getFakeDeployedHtml(out.slug);
    expect(html).toContain("Bella Nails");
    expect(html).toContain("(512) 555-0123");

    const actions = await db.select().from(agentActions).where(eq(agentActions.leadId, leadId));
    expect(actions.map((a) => a.agent).sort()).toEqual(["deploy", "sitegen"]);
  });

  it("preview deploy uses a separate row with preview status", async () => {
    const preview = await runJob("site.build_and_deploy", { leadId, preview: true });
    expect(preview.ok).toBe(true);
    const live = await runJob("site.build_and_deploy", { leadId, preview: false });
    expect(live.ok).toBe(true);

    const rows = await db.select().from(clientSites).where(eq(clientSites.leadId, leadId));
    expect(rows).toHaveLength(2);
    const previewRow = rows.find((r) => r.isPreview)!;
    const liveRow = rows.find((r) => !r.isPreview)!;
    expect(previewRow.deployStatus).toBe("preview");
    expect(previewRow.liveUrl).toBeNull();
    expect(previewRow.previewUrl).toContain("preview-bella-nails-austin");
    expect(liveRow.deployStatus).toBe("live");
  });

  it("site.suspend flips the fake flag and deploy status both ways", async () => {
    await runJob("site.build_and_deploy", { leadId, preview: false });

    const suspended = await runJob("site.suspend", { leadId, suspended: true });
    expect(suspended.ok).toBe(true);
    expect(isFakeSuspended("bella-nails-austin")).toBe(true);
    let [site] = await db.select().from(clientSites).where(eq(clientSites.leadId, leadId));
    expect(site?.deployStatus).toBe("suspended");
    expect(getFakeDeployedHtml("bella-nails-austin")).toContain("temporarily unavailable");

    const restored = await runJob("site.suspend", { leadId, suspended: false });
    expect(restored.ok).toBe(true);
    expect(isFakeSuspended("bella-nails-austin")).toBe(false);
    [site] = await db.select().from(clientSites).where(eq(clientSites.leadId, leadId));
    expect(site?.deployStatus).toBe("live");
    expect(getFakeDeployedHtml("bella-nails-austin")).toContain("Bella Nails");
  });

  it("fails the row when the lead is missing", async () => {
    const result = await runJob("site.build_and_deploy", { leadId: "missing" });
    expect(result.ok).toBe(false);
  });
});
