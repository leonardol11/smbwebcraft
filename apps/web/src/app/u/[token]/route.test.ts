import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { env, loadEnv, resetEnvForTests } from "@outreach/env";
import { createTestDb, eq, leads, markets, setDbForTests, suppressions, type Db } from "@outreach/db";
import { createUnsubscribeToken } from "@outreach/email";
import { GET, POST } from "./route";

let db: Db;
const ctx = (token: string) => ({ params: Promise.resolve({ token }) });

beforeEach(async () => {
  process.env.PROVIDER_MODE = "fake";
  resetEnvForTests();
  loadEnv(process.env);
  db = await createTestDb();
  setDbForTests(db);
});

async function seedLead(email: string) {
  const [market] = await db.insert(markets).values({ city: "Austin", state: "TX", slug: "t14" }).returning();
  await db.insert(leads).values({ marketId: market!.id, zip: "78701", businessName: "Biz", email, status: "sequenced" });
}

describe("/u/[token]", () => {
  it("GET shows a confirmation page and does NOT suppress", async () => {
    await seedLead("owner@biz.com");
    const token = createUnsubscribeToken("owner@biz.com", env().SESSION_SECRET);
    const res = await GET(new NextRequest(`http://localhost/u/${token}`), ctx(token));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Yes, unsubscribe");
    expect(await db.select().from(suppressions)).toHaveLength(0);
  });

  it("POST (one-click) suppresses the email and marks the lead", async () => {
    await seedLead("owner@biz.com");
    const token = createUnsubscribeToken("owner@biz.com", env().SESSION_SECRET);
    const res = await POST(
      new NextRequest(`http://localhost/u/${token}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      }),
      ctx(token),
    );
    expect(res.status).toBe(200);
    const rows = await db.select().from(suppressions);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.reason).toBe("unsubscribed");
    const [lead] = await db.select().from(leads).where(eq(leads.email, "owner@biz.com"));
    expect(lead!.status).toBe("suppressed");
    // Idempotent
    await POST(new NextRequest(`http://localhost/u/${token}`, { method: "POST" }), ctx(token));
    expect(await db.select().from(suppressions)).toHaveLength(1);
  });

  it("rejects bad tokens", async () => {
    const res = await POST(new NextRequest("http://localhost/u/nope", { method: "POST" }), ctx("nope"));
    expect(res.status).toBe(400);
    const get = await GET(new NextRequest("http://localhost/u/nope"), ctx("nope"));
    expect(get.status).toBe(400);
  });
});
