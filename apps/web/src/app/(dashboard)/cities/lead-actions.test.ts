import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  createTestDb,
  leads,
  markets,
  setDbForTests,
  suppressions,
  type Db,
} from "@outreach/db";
import { bulkSuppressLeads } from "./lead-actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let db: Db;
let marketId: string;

beforeAll(async () => {
  db = await createTestDb();
  setDbForTests(db);
  const [market] = await db
    .insert(markets)
    .values({ city: "Austin", state: "TX", slug: "t10-suppress" })
    .returning();
  marketId = market!.id;
});

describe("bulkSuppressLeads", () => {
  it("writes the suppressions table (lowercased) and marks leads suppressed", async () => {
    const inserted = await db
      .insert(leads)
      .values([
        {
          marketId,
          zip: "78701",
          businessName: "With Email",
          email: "Owner@Example.COM",
          placesId: "t10-sup-1",
          status: "ready",
        },
        {
          marketId,
          zip: "78701",
          businessName: "Also Email",
          email: "second@example.com",
          placesId: "t10-sup-2",
          status: "qualified",
        },
        {
          marketId,
          zip: "78701",
          businessName: "No Email",
          email: null,
          placesId: "t10-sup-3",
          status: "qualified",
        },
      ])
      .returning();

    const ids = inserted.map((r) => r.id);
    await bulkSuppressLeads(ids, "t10-suppress");

    const updated = await db.select().from(leads).where(eq(leads.marketId, marketId));
    expect(updated.every((r) => r.status === "suppressed")).toBe(true);

    const rows = await db.select().from(suppressions);
    const emails = rows.map((r) => r.email).sort();
    expect(emails).toEqual(["owner@example.com", "second@example.com"]);
    expect(rows.every((r) => r.reason === "manual")).toBe(true);

    // Same lookup the outreach send path uses: suppressed address must match.
    const [hit] = await db
      .select()
      .from(suppressions)
      .where(eq(suppressions.email, "Owner@Example.COM".toLowerCase()));
    expect(hit).toBeTruthy();
  });

  it("is idempotent when the address is already suppressed", async () => {
    const [lead] = await db
      .insert(leads)
      .values({
        marketId,
        zip: "78704",
        businessName: "Already listed",
        email: "repeat@example.com",
        placesId: "t10-sup-repeat",
        status: "sequenced",
      })
      .returning();
    await bulkSuppressLeads([lead!.id], "t10-suppress");
    await bulkSuppressLeads([lead!.id], "t10-suppress");
    const rows = await db
      .select()
      .from(suppressions)
      .where(eq(suppressions.email, "repeat@example.com"));
    expect(rows).toHaveLength(1);
  });
});
