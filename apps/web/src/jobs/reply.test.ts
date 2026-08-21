import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createTestDb,
  eq,
  inboundEmails,
  leads,
  markets,
  outreachMessages,
  setDbForTests,
  setSetting,
  threads,
  type Db,
} from "@outreach/db";
import { runJob } from "./core";
import "./reply";
import "./agent-reply";

const dir = dirname(fileURLToPath(import.meta.url));

describe("email.process_inbound job", () => {
  let db: Db;
  let leadId: string;

  beforeEach(async () => {
    db = await createTestDb();
    setDbForTests(db);
    const [market] = await db
      .insert(markets)
      .values({ city: "Austin", state: "TX", slug: "job-matcher-austin" })
      .returning();
    const [lead] = await db
      .insert(leads)
      .values({
        marketId: market!.id,
        zip: "78704",
        businessName: "Bella Nails",
        email: "maria@bellanails.test",
        status: "sequenced",
      })
      .returning();
    leadId = lead!.id;
    const [thread] = await db
      .insert(threads)
      .values({ leadId, subject: "Website", status: "active" })
      .returning();
    await db.insert(outreachMessages).values({
      threadId: thread!.id,
      leadId,
      direction: "outbound",
      source: "sequence",
      sequenceStep: 0,
      providerMessageId: "outbound-job@mail.yourdomain.com",
      status: "sent",
    });
  });

  it("does not import or invoke the reply LLM", () => {
    const src = readFileSync(join(dir, "reply.ts"), "utf8");
    expect(src).toContain("matchInbound");
    expect(src).not.toMatch(/runReplyAgent/);
    expect(src).not.toMatch(/anthropic/i);
  });

  it("matches by In-Reply-To and queues the agent (draft-only while paused)", async () => {
    await setSetting(db, "reply_agent_paused", true);
    const [inbound] = await db
      .insert(inboundEmails)
      .values({
        fromEmail: "maria@bellanails.test",
        toEmail: `hello+lead_${leadId}@mail.yourdomain.com`,
        inReplyTo: "<outbound-job@mail.yourdomain.com>",
        bodyText: "Yes, I'd like a demo please.",
        matchStatus: "pending",
      })
      .returning();

    const result = await runJob("email.process_inbound", { inboundEmailId: inbound!.id });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result).toMatchObject({
      ok: true,
      matched: true,
      leadId,
      matchMethod: "in_reply_to",
    });

    const [stored] = await db.select().from(inboundEmails).where(eq(inboundEmails.id, inbound!.id));
    expect(stored?.matchStatus).toBe("matched");
    expect(stored?.matchedLeadId).toBe(leadId);

    const agentMsgs = await db
      .select()
      .from(outreachMessages)
      .where(eq(outreachMessages.source, "reply_agent"));
    expect(agentMsgs.every((m) => m.status === "draft")).toBe(true);
  });

  it("marks unmatched mail and attaches an unmatched thread", async () => {
    const [inbound] = await db
      .insert(inboundEmails)
      .values({
        fromEmail: "nobody@void.test",
        toEmail: "hello@mail.yourdomain.com",
        subject: "random",
        bodyText: "hello?",
        matchStatus: "pending",
      })
      .returning();

    const result = await runJob("email.process_inbound", { inboundEmailId: inbound!.id });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result).toMatchObject({ ok: true, matched: false, matchMethod: "unmatched" });

    const [stored] = await db.select().from(inboundEmails).where(eq(inboundEmails.id, inbound!.id));
    expect(stored?.matchStatus).toBe("unmatched");
    expect(stored?.matchedThreadId).toBeTruthy();

    const [thread] = await db.select().from(threads).where(eq(threads.id, stored!.matchedThreadId!));
    expect(thread?.status).toBe("unmatched");
    expect(thread?.leadId).toBeNull();
  });
});
