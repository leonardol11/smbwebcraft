import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { loadEnv, resetEnvForTests } from "@outreach/env";
import { clientSites, createTestDb, eq, leads, markets, setDbForTests, type Db } from "@outreach/db";
import { runJob } from "@/jobs";
import { GET } from "./route";

let db: Db;
const ctx = (leadId: string) => ({ params: Promise.resolve({ leadId }) });
const get = (leadId: string) => GET(new NextRequest(`http://localhost/preview/${leadId}`), ctx(leadId));

beforeEach(async () => {
  process.env.PROVIDER_MODE = "fake";
  process.env.APP_URL = "http://localhost:3000";
  resetEnvForTests();
  loadEnv(process.env);
  db = await createTestDb();
  setDbForTests(db);
});

async function seedLead() {
  const [market] = await db
    .insert(markets)
    .values({ city: "Austin", state: "TX", slug: "t24-austin" })
    .returning();
  const [lead] = await db
    .insert(leads)
    .values({
      marketId: market!.id,
      zip: "78701",
      businessName: "Sunrise Bakery",
      email: "owner@example.com",
      category: "bakery",
      city: "Austin",
      status: "replied",
    })
    .returning();
  return lead!;
}

describe("GET /preview/[leadId]", () => {
  it("serves preview HTML with the business name and pay link, generating on the fly", async () => {
    const lead = await seedLead();
    const res = await get(lead.id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("Sunrise Bakery");
    expect(html).toContain(`http://localhost:3000/pay/${lead.id}`);
    expect(html).toContain("This is a preview for");

    // Cached for next time.
    const [site] = await db.select().from(clientSites).where(eq(clientSites.leadId, lead.id));
    expect(site?.isPreview).toBe(true);
    expect(site?.html).toContain("Sunrise Bakery");
  });

  it("site.build_preview pre-generates and the route serves the cached copy", async () => {
    const lead = await seedLead();
    const run = await runJob("site.build_preview", { leadId: lead.id });
    expect(run.ok).toBe(true);
    const [site] = await db.select().from(clientSites).where(eq(clientSites.leadId, lead.id));
    expect(site?.html).toBeTruthy();
    const res = await get(lead.id);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Sunrise Bakery");
  });

  it("returns 404 for an unknown lead", async () => {
    const res = await get("00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });
});
