import { beforeAll, describe, expect, it } from "vitest";
import {
  agentActions,
  clientSites,
  createTestDb,
  deals,
  emailEvents,
  inboundEmails,
  leads,
  markets,
  setDbForTests,
  threads,
  type Db,
} from "@outreach/db";
import { BOUNCE_SPIKE_RATE, getActivityFeed, getNeedsAttention } from "./data";

let db: Db;
let leadId: string;
let threadId: string;

beforeAll(async () => {
  db = await createTestDb();
  setDbForTests(db);

  const [market] = await db
    .insert(markets)
    .values({ city: "Austin", state: "TX", slug: "austin-feed" })
    .returning();
  const [lead] = await db
    .insert(leads)
    .values({
      marketId: market!.id,
      zip: "78704",
      businessName: "Bella Nails",
      city: "Austin",
      status: "replied",
    })
    .returning();
  leadId = lead!.id;
  const [thread] = await db
    .insert(threads)
    .values({ leadId, subject: "Quick website idea", status: "active" })
    .returning();
  threadId = thread!.id;
});

describe("live activity feed", () => {
  it("surfaces a newly inserted agent action at the top, linked to the thread", async () => {
    await db.insert(agentActions).values({
      agent: "outreach",
      action: "send_day_0",
      detail: "day 0 sent",
      status: "ok",
      leadId,
      threadId,
      createdAt: new Date(Date.now() - 60_000),
    });

    const first = await getActivityFeed();
    expect(first.length).toBeGreaterThanOrEqual(1);

    const [newest] = await db
      .insert(agentActions)
      .values({
        agent: "reply",
        action: "run_reply_agent",
        detail: "send_payment_link",
        intent: "ready_to_buy",
        status: "ok",
        leadId,
        threadId,
      })
      .returning();

    const feed = await getActivityFeed();
    expect(feed[0]!.id).toBe(newest!.id);
    expect(feed[0]!.summary).toBe("replied to Bella Nails — sent checkout link");
    expect(feed[0]!.cityTag).toBe("Austin 78704");
    expect(feed[0]!.href).toBe(`/inbox?thread=${threadId}`);
    expect(feed[0]!.id).not.toBe(first[0]!.id);
  });
});

describe("needs attention", () => {
  it("starts empty when nothing is broken", async () => {
    const emptyDb = await createTestDb();
    setDbForTests(emptyDb);
    const attention = await getNeedsAttention();
    expect(attention.items).toEqual([]);
    expect(Object.values(attention.counts).every((n) => n === 0)).toBe(true);
    setDbForTests(db);
  });

  it("lists escalations, unmatched inbound, failed deploys, and failed charges", async () => {
    await db.insert(agentActions).values({
      agent: "reply",
      action: "run_reply_agent",
      detail: "escalate_to_human",
      intent: "legal_threat",
      status: "escalated",
      leadId,
      threadId,
    });
    await db.insert(inboundEmails).values({
      fromEmail: "stranger@example.com",
      subject: "who is this",
      matchStatus: "unmatched",
    });
    await db.insert(clientSites).values({
      leadId,
      slug: "bella-nails",
      deployStatus: "failed",
      deployError: "DNS timeout",
    });
    await db.insert(deals).values({
      leadId,
      status: "past_due",
      failedSince: new Date(),
      mrrCents: 2500,
    });

    const attention = await getNeedsAttention();
    expect(attention.counts.escalation).toBe(1);
    expect(attention.counts.unmatched_inbound).toBe(1);
    expect(attention.counts.failed_deploy).toBe(1);
    expect(attention.counts.failed_charge).toBe(1);
    expect(attention.items.some((i) => i.kind === "escalation" && i.href.includes(threadId))).toBe(
      true,
    );
    expect(attention.items.some((i) => i.kind === "unmatched_inbound" && i.title === "who is this")).toBe(
      true,
    );
    expect(attention.items.some((i) => i.kind === "failed_deploy" && i.subtitle === "DNS timeout")).toBe(
      true,
    );
    expect(attention.items.some((i) => i.kind === "failed_charge")).toBe(true);
  });

  it("flags a bounce spike above 5%", async () => {
    expect(BOUNCE_SPIKE_RATE).toBe(0.05);
    for (let i = 0; i < 10; i++) {
      await db.insert(emailEvents).values({
        type: i < 2 ? "bounced" : "delivered",
        providerMessageId: `msg-${i}`,
      });
    }
    const attention = await getNeedsAttention();
    expect(attention.counts.bounce_spike).toBe(1);
    const spike = attention.items.find((i) => i.kind === "bounce_spike");
    expect(spike?.title).toBe("Bounce rate spike");
    expect(spike?.subtitle).toMatch(/20\.0%/);
  });
});
