import { beforeEach, describe, expect, it } from "vitest";
import {
  campaigns,
  createTestDb,
  leads,
  markets,
  outreachMessages,
  setDbForTests,
  setSetting,
  eq,
  sql,
  type Db,
} from "@outreach/db";
import {
  clearFakeSentEmails,
  getFakeSentEmails,
  HARD_GLOBAL_DAILY_CAP,
  resetEmailClientForTests,
} from "@outreach/email";
import { loadEnv, resetEnvForTests } from "@outreach/env";
import { runJob } from "./core";
import "./outreach";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

describe("outreach.tick sequence job", () => {
  let db: Db;
  let leadId: string;

  beforeEach(async () => {
    resetEnvForTests();
    process.env.PROVIDER_MODE = "fake";
    process.env.APP_URL = "http://localhost:3000";
    process.env.PHYSICAL_ADDRESS = "123 Example Street, Anytown, ST 00000";
    loadEnv(process.env);
    resetEmailClientForTests();
    clearFakeSentEmails();

    db = await createTestDb();
    setDbForTests(db);
    await setSetting(db, "sending_paused", false);
    await setSetting(db, "global_daily_send_cap", HARD_GLOBAL_DAILY_CAP);

    const [market] = await db
      .insert(markets)
      .values({ city: "Austin", state: "TX", slug: "austin-seq" })
      .returning();
    const [campaign] = await db
      .insert(campaigns)
      .values({
        marketId: market!.id,
        name: "Sequence",
        categories: ["nail_salon"],
        status: "running",
        dailyCap: 25,
      })
      .returning();
    const [lead] = await db
      .insert(leads)
      .values({
        marketId: market!.id,
        campaignId: campaign!.id,
        zip: "78704",
        businessName: "BELLA NAILS",
        ownerFirstName: "Maria",
        email: "maria@bella-nails.example",
        city: "Austin",
        category: "nail_salon",
        status: "ready",
      })
      .returning();
    leadId = lead!.id;
  });

  async function tick(now: Date) {
    return runJob("outreach.tick", { now: now.toISOString() });
  }

  it("sends exactly three emails on a simulated Day 0 / +3 / +7 clock", async () => {
    const start = new Date("2026-01-01T00:00:00Z");

    for (let day = 0; day <= 7; day++) {
      const result = await tick(new Date(start.getTime() + day * MS_PER_DAY));
      expect(result.ok).toBe(true);
    }

    const fake = getFakeSentEmails();
    expect(fake).toHaveLength(3);

    const rows = await db
      .select()
      .from(outreachMessages)
      .where(eq(outreachMessages.leadId, leadId));
    const steps = rows.map((r) => r.sequenceStep).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(steps).toEqual([0, 3, 7]);

    expect(fake[0]?.text).toMatch(/^Hi there,/m);
    expect(fake[0]?.text).toContain("Bella Nails");
    expect(fake[0]?.headers?.["List-Unsubscribe"]).toMatch(/^<http:\/\/localhost:3000\/u\//);
    expect(fake[0]?.idempotencyKey).toBe(`lead:${leadId}:step:0`);
    expect(fake[1]?.headers?.["In-Reply-To"]).toBe(fake[0]?.messageId);
  });

  it("cancels the remainder when a reply is injected after step one", async () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const first = await tick(start);
    expect(first.ok).toBe(true);
    if (first.ok) expect((first.result as { sent: number }).sent).toBe(1);

    await db.insert(outreachMessages).values({
      leadId,
      direction: "inbound",
      source: "system",
      status: "received",
      bodyText: "Not interested, thanks.",
      createdAt: new Date(start.getTime() + 60_000),
    });
    await db
      .update(leads)
      .set({ status: "replied", updatedAt: new Date() })
      .where(eq(leads.id, leadId));

    const day3 = await tick(new Date(start.getTime() + 3 * MS_PER_DAY));
    const day7 = await tick(new Date(start.getTime() + 7 * MS_PER_DAY));
    expect(day3.ok).toBe(true);
    expect(day7.ok).toBe(true);
    if (day3.ok) expect((day3.result as { sent: number }).sent).toBe(0);
    if (day7.ok) expect((day7.result as { sent: number }).sent).toBe(0);

    expect(getFakeSentEmails()).toHaveLength(1);
    const rows = await db
      .select()
      .from(outreachMessages)
      .where(eq(outreachMessages.leadId, leadId));
    expect(rows.filter((r) => r.direction === "outbound")).toHaveLength(1);
  });

  it("refuses a job that would exceed 450 sends in the current UTC day", async () => {
    const now = new Date("2026-03-01T12:00:00Z");
    await db.execute(sql`
      INSERT INTO outreach_messages (lead_id, direction, source, status, created_at)
      SELECT ${leadId}, 'outbound', 'manual', 'sent', ${now}
      FROM generate_series(1, ${HARD_GLOBAL_DAILY_CAP})
    `);

    const result = await tick(now);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result).toEqual({ sent: 0, reason: "global_cap" });
    }
    expect(getFakeSentEmails()).toHaveLength(0);
  });
});
