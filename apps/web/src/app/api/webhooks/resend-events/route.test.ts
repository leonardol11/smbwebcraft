import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { loadEnv, resetEnvForTests } from "@outreach/env";
import {
  createTestDb,
  emailEvents,
  eq,
  leads,
  markets,
  outreachMessages,
  setDbForTests,
  suppressions,
  type Db,
} from "@outreach/db";
import { computeDeliveryRates, readRolledUpRates } from "@/lib/delivery-events";
import { POST } from "./route";

let db: Db;

function eventPayload(opts: {
  type: "email.delivered" | "email.bounced" | "email.complained" | "email.opened";
  email: string;
  messageId: string;
  bounceType?: string;
}) {
  return {
    type: opts.type,
    created_at: "2026-08-20T00:00:00.000Z",
    data: {
      email_id: opts.messageId,
      to: [opts.email],
      ...(opts.bounceType ? { bounce: { type: opts.bounceType, message: "simulated" } } : {}),
    },
  };
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new NextRequest("http://localhost/api/webhooks/resend-events", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

beforeEach(async () => {
  process.env.PROVIDER_MODE = "fake";
  resetEnvForTests();
  loadEnv(process.env);
  db = await createTestDb();
  setDbForTests(db);
});

async function seedLead(email: string, messageId: string) {
  const slug = `t15-${messageId.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const [market] = await db
    .insert(markets)
    .values({ city: "Austin", state: "TX", slug })
    .returning();
  const [lead] = await db
    .insert(leads)
    .values({
      marketId: market!.id,
      zip: "78701",
      businessName: "Bounce Salon",
      email,
      status: "sequenced",
    })
    .returning();
  const [msg] = await db
    .insert(outreachMessages)
    .values({
      leadId: lead!.id,
      direction: "outbound",
      source: "sequence",
      sequenceStep: 0,
      providerMessageId: messageId,
      status: "sent",
    })
    .returning();
  return { lead: lead!, msg: msg! };
}

describe("POST /api/webhooks/resend-events", () => {
  it("in fake mode, a simulated bounce suppresses the lead and moves the bounce rate", async () => {
    const email = "bounce@example.com";
    const messageId = "msg_t15_bounce";
    const { lead } = await seedLead(email, messageId);

    const before = await computeDeliveryRates(db);
    expect(before.bounceRate).toBe(0);
    const rolledBefore = await readRolledUpRates(db);
    expect(rolledBefore.bounceRate).toBe(0);

    const delivered = await post(
      eventPayload({ type: "email.delivered", email, messageId }),
    );
    expect(delivered.status).toBe(200);
    const afterDelivered = await computeDeliveryRates(db);
    expect(afterDelivered.bounceRate).toBe(0);
    expect(afterDelivered.sent).toBeGreaterThan(0);

    // Empty signature is accepted in PROVIDER_MODE=fake (verify returns true).
    const bounced = await post(
      eventPayload({ type: "email.bounced", email, messageId, bounceType: "hard" }),
    );
    expect(bounced.status).toBe(200);
    const body = (await bounced.json()) as { ok: boolean; suppressed: boolean };
    expect(body.ok).toBe(true);
    expect(body.suppressed).toBe(true);

    const [updatedLead] = await db.select().from(leads).where(eq(leads.id, lead.id));
    expect(updatedLead?.status).toBe("suppressed");

    const [sup] = await db.select().from(suppressions).where(eq(suppressions.email, email));
    expect(sup?.reason).toBe("bounced");
    expect(sup?.leadId).toBe(lead.id);

    const [msg] = await db
      .select()
      .from(outreachMessages)
      .where(eq(outreachMessages.providerMessageId, messageId));
    expect(msg?.status).toBe("bounced");

    const events = await db
      .select()
      .from(emailEvents)
      .where(eq(emailEvents.providerMessageId, messageId));
    expect(events.map((e) => e.type).sort()).toEqual(["bounced", "delivered"]);

    const after = await computeDeliveryRates(db);
    expect(after.bounced).toBeGreaterThan(before.bounced);
    expect(after.bounceRate).toBeGreaterThan(afterDelivered.bounceRate);

    const rolledAfter = await readRolledUpRates(db);
    expect(rolledAfter.bounceRate).toBeGreaterThan(rolledBefore.bounceRate);
    expect(rolledAfter.bounceRate).toBe(after.bounceRate);
  });

  it("does not suppress on a soft bounce", async () => {
    const email = "soft@example.com";
    const messageId = "msg_t15_soft";
    const { lead } = await seedLead(email, messageId);

    const res = await post(
      eventPayload({ type: "email.bounced", email, messageId, bounceType: "transient" }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { suppressed: boolean };
    expect(body.suppressed).toBe(false);

    const [updatedLead] = await db.select().from(leads).where(eq(leads.id, lead.id));
    expect(updatedLead?.status).toBe("sequenced");
    const sup = await db.select().from(suppressions).where(eq(suppressions.email, email));
    expect(sup).toHaveLength(0);
  });

  it("suppresses on complaint and rolls up complaint rate", async () => {
    const email = "complain@example.com";
    const messageId = "msg_t15_complaint";
    const { lead } = await seedLead(email, messageId);

    await post(eventPayload({ type: "email.delivered", email, messageId }));
    const before = await computeDeliveryRates(db);

    const res = await post(eventPayload({ type: "email.complained", email, messageId }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { suppressed: boolean };
    expect(body.suppressed).toBe(true);

    const [updatedLead] = await db.select().from(leads).where(eq(leads.id, lead.id));
    expect(updatedLead?.status).toBe("suppressed");

    const after = await computeDeliveryRates(db);
    expect(after.complaintRate).toBeGreaterThan(before.complaintRate);
    const rolled = await readRolledUpRates(db);
    expect(rolled.complaintRate).toBe(after.complaintRate);
  });

  it("records opened without suppressing", async () => {
    const email = "opened@example.com";
    const messageId = "msg_t15_opened";
    const { lead } = await seedLead(email, messageId);

    const res = await post(eventPayload({ type: "email.opened", email, messageId }));
    expect(res.status).toBe(200);

    const [updatedLead] = await db.select().from(leads).where(eq(leads.id, lead.id));
    expect(updatedLead?.status).toBe("sequenced");
    const [msg] = await db
      .select()
      .from(outreachMessages)
      .where(eq(outreachMessages.providerMessageId, messageId));
    expect(msg?.status).toBe("opened");
  });

  it("returns 400 for invalid JSON", async () => {
    const res = await post("not-json");
    expect(res.status).toBe(400);
  });

  it("acks unknown event types without writing events", async () => {
    const before = await db.select().from(emailEvents);
    const res = await post({ type: "email.clicked", data: { email_id: "msg_ignore" } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ignored: boolean };
    expect(body.ignored).toBe(true);
    const after = await db.select().from(emailEvents);
    expect(after).toHaveLength(before.length);
  });
});
