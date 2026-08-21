import { beforeEach, describe, expect, it } from "vitest";
import {
  createTestDb,
  emailEvents,
  jobRuns,
  leads,
  markets,
  outreachMessages,
  setDbForTests,
  setSetting,
  getSetting,
  threads,
  agentActions,
  type Db,
} from "@outreach/db";
import { getFakeSentEmails, resetEmailClientForTests } from "@outreach/email";
import { loadEnv, resetEnvForTests } from "@outreach/env";
import { computeHealth, readLastHealthAlert, shouldSendAlert, ALERT_COOLDOWN_MS } from "./health";
import { runJob } from "@/jobs/core";
import "@/jobs/health";

async function seedLead(db: Db): Promise<string> {
  const [m] = await db.insert(markets).values({ city: "Austin", state: "TX", slug: `austin-${Math.random()}` }).returning();
  const [l] = await db
    .insert(leads)
    .values({ marketId: m!.id, businessName: "Biz", zip: "78701", city: "Austin", state: "TX", status: "qualified" })
    .returning();
  return l!.id;
}

async function seedSends(db: Db, leadId: string, sent: number, bounced: number, complained = 0) {
  for (let i = 0; i < sent; i++) {
    const pid = `msg-${i}-${Math.random()}`;
    await db.insert(outreachMessages).values({ leadId, direction: "outbound", status: "sent", providerMessageId: pid });
    await db.insert(emailEvents).values({ type: "delivered", providerMessageId: pid });
    if (i < bounced) await db.insert(emailEvents).values({ type: "bounced", providerMessageId: pid });
    else if (i < bounced + complained) await db.insert(emailEvents).values({ type: "complained", providerMessageId: pid });
  }
}

describe("computeHealth", () => {
  let db: Db;

  beforeEach(async () => {
    resetEnvForTests();
    process.env.PROVIDER_MODE = "fake";
    delete process.env.ALERT_EMAIL;
    loadEnv(process.env);
    resetEmailClientForTests();
    db = await createTestDb();
    setDbForTests(db);
  });

  it("is green on a clean database", async () => {
    const h = await computeHealth(db);
    expect(h.status).toBe("green");
    expect(h.reasons).toEqual([]);
    expect(h.checks.length).toBeGreaterThan(0);
  });

  it("is red when bounce rate > 5% with >= 20 sends", async () => {
    const leadId = await seedLead(db);
    await seedSends(db, leadId, 20, 2); // 10%
    const h = await computeHealth(db);
    expect(h.status).toBe("red");
    expect(h.bounceRed).toBe(true);
    expect(h.reasons[0]).toMatch(/Bounce rate 10\.0%/);
  });

  it("is amber when bounce rate is between 2% and 5%", async () => {
    const leadId = await seedLead(db);
    await seedSends(db, leadId, 100, 3);
    const h = await computeHealth(db);
    expect(h.status).toBe("amber");
    expect(h.bounceRed).toBe(false);
  });

  it("ignores bounce rate under 20 sends", async () => {
    const leadId = await seedLead(db);
    await seedSends(db, leadId, 10, 5);
    expect((await computeHealth(db)).status).toBe("green");
  });

  it("is red when a job fails 3 times in an hour", async () => {
    for (let i = 0; i < 3; i++) {
      await db.insert(jobRuns).values({ name: "outreach.tick", status: "failed", error: "boom" });
    }
    await db.insert(jobRuns).values({ name: "other", status: "failed" });
    const h = await computeHealth(db);
    expect(h.status).toBe("red");
    expect(h.reasons[0]).toMatch(/outreach\.tick \(3x in 1h\)/);
  });

  it("is amber when a kill switch is paused", async () => {
    await setSetting(db, "discovery_paused", true);
    const h = await computeHealth(db);
    expect(h.status).toBe("amber");
    expect(h.reasons).toContain("Paused: discovery");
  });

  it("is amber with unmatched threads or unhandled escalations", async () => {
    await db.insert(threads).values({ status: "unmatched", subject: "???" });
    let h = await computeHealth(db);
    expect(h.status).toBe("amber");
    expect(h.reasons.join(" ")).toMatch(/1 unmatched thread awaiting triage/);

    const leadId = await seedLead(db);
    const [t] = await db.insert(threads).values({ leadId, agentPaused: true }).returning();
    await db.insert(agentActions).values({ agent: "reply" as never, action: "escalate", status: "escalated", threadId: t!.id });
    h = await computeHealth(db);
    expect(h.reasons.join(" ")).toMatch(/1 agent escalation awaiting a human reply/);
  });
});

describe("health.check job", () => {
  let db: Db;

  beforeEach(async () => {
    resetEnvForTests();
    process.env.PROVIDER_MODE = "fake";
    process.env.ALERT_EMAIL = "ops@example.com";
    loadEnv(process.env);
    resetEmailClientForTests();
    db = await createTestDb();
    setDbForTests(db);
  });

  it("does nothing when green", async () => {
    const r = await runJob("health.check", {});
    expect(r.ok).toBe(true);
    expect((r as { result: { alerted: boolean } }).result.alerted).toBe(false);
    expect(getFakeSentEmails()).toHaveLength(0);
  });

  it("auto-pauses sending and alerts once per 6h for the same reasons", async () => {
    const leadId = await seedLead(db);
    await seedSends(db, leadId, 20, 3);

    const first = await runJob("health.check", {});
    expect(first.ok).toBe(true);
    const res1 = (first as { result: { alerted: boolean; autoPausedSending: boolean } }).result;
    expect(res1.autoPausedSending).toBe(true);
    expect(res1.alerted).toBe(true);
    expect(await getSetting(db, "sending_paused")).toBe(true);
    const mails = getFakeSentEmails();
    expect(mails).toHaveLength(1);
    expect(mails[0]!.to).toBe("ops@example.com");
    expect(mails[0]!.text).toMatch(/AUTOMATICALLY PAUSED/);
    expect(mails[0]!.text).toMatch(/Bounce rate/);

    const second = await runJob("health.check", {});
    const res2 = (second as { result: { alerted: boolean; skippedReason?: string } }).result;
    expect(res2.alerted).toBe(false);
    expect(res2.skippedReason).toBe("rate-limited");
    expect(getFakeSentEmails()).toHaveLength(1);

    // New distinct reason-set (a failing job joins) -> alert again.
    for (let i = 0; i < 3; i++) await db.insert(jobRuns).values({ name: "x", status: "failed" });
    const third = await runJob("health.check", {});
    expect((third as { result: { alerted: boolean } }).result.alerted).toBe(true);
    expect(getFakeSentEmails()).toHaveLength(2);

    const last = await readLastHealthAlert(db);
    expect(last?.reasonsKey).toBe("Bounce rate|Jobs");
    // After the cooldown it fires again.
    expect(shouldSendAlert(last, last!.reasonsKey, new Date(Date.now() + ALERT_COOLDOWN_MS + 1))).toBe(true);
  });

  it("skips the email when ALERT_EMAIL is unset but still pauses sending", async () => {
    resetEnvForTests();
    delete process.env.ALERT_EMAIL;
    loadEnv(process.env);
    const leadId = await seedLead(db);
    await seedSends(db, leadId, 20, 3);
    const r = await runJob("health.check", {});
    const res = (r as { result: { alerted: boolean; skippedReason?: string } }).result;
    expect(res.alerted).toBe(false);
    expect(res.skippedReason).toBe("ALERT_EMAIL not set");
    expect(await getSetting(db, "sending_paused")).toBe(true);
  });
});
