import { beforeEach, describe, expect, it } from "vitest";
import { loadEnv, resetEnvForTests } from "@outreach/env";
import {
  agentActions,
  createTestDb,
  eq,
  inboundEmails,
  leads,
  markets,
  outreachMessages,
  setDbForTests,
  setSetting,
  suppressions,
  threads,
  type Db,
} from "@outreach/db";
import { clearFakeSentEmails, getFakeSentEmails } from "@outreach/email";
import { runJob } from "./core";
import "./reply";
import "./agent-reply";

describe("inbound → agent.reply pipeline", () => {
  let db: Db;
  let leadId: string;
  let threadId: string;

  beforeEach(async () => {
    process.env.PROVIDER_MODE = "fake";
    resetEnvForTests();
    loadEnv(process.env);
    clearFakeSentEmails();
    db = await createTestDb();
    setDbForTests(db);
    await setSetting(db, "reply_agent_paused", false);
    await setSetting(db, "sending_paused", false);
    const [market] = await db.insert(markets).values({ city: "Austin", state: "TX", slug: "t18" }).returning();
    const [lead] = await db
      .insert(leads)
      .values({ marketId: market!.id, zip: "78704", businessName: "Bella Nails", email: "maria@bellanails.test", status: "sequenced" })
      .returning();
    leadId = lead!.id;
    const [thread] = await db.insert(threads).values({ leadId, subject: "A website for Bella Nails", status: "active" }).returning();
    threadId = thread!.id;
    await db.insert(outreachMessages).values({
      threadId,
      leadId,
      direction: "outbound",
      source: "sequence",
      sequenceStep: 0,
      providerMessageId: "<out-1@mail.yourdomain.com>",
      subject: "A website for Bella Nails",
      bodyText: "Hi Maria — noticed Bella Nails has no site…",
      status: "sent",
    });
  });

  async function inbound(body: string, extra: Partial<typeof inboundEmails.$inferInsert> = {}) {
    const [row] = await db
      .insert(inboundEmails)
      .values({
        fromEmail: "maria@bellanails.test",
        toEmail: `hello+lead_${leadId}@mail.yourdomain.com`,
        inReplyTo: "<out-1@mail.yourdomain.com>",
        messageId: `<in-${Math.random()}@gmail.com>`,
        subject: "Re: A website for Bella Nails",
        bodyText: body,
        matchStatus: "pending",
        ...extra,
      })
      .returning();
    return row!;
  }

  it("matches, then the agent replies through the email client with threading headers", async () => {
    const row = await inbound("How much does it cost?\n\nOn Tue, you wrote:\n> Hi Maria");
    const res = await runJob("email.process_inbound", { inboundEmailId: row.id });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result).toMatchObject({ matched: true, agentQueued: true });

    const sent = getFakeSentEmails();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("maria@bellanails.test");
    expect(sent[0]!.replyTo).toContain(`lead_${leadId}`);
    expect(sent[0]!.subject).toBe("Re: A website for Bella Nails");
    expect(sent[0]!.headers?.["In-Reply-To"]).toBe(row.messageId);
    expect(sent[0]!.headers?.References).toContain("<out-1@mail.yourdomain.com>");
    expect(sent[0]!.text).toContain("Pay here:");

    const msgs = await db.select().from(outreachMessages).where(eq(outreachMessages.source, "reply_agent"));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.status).toBe("sent");
    expect(msgs[0]!.providerMessageId).toBe(sent[0]!.messageId);

    const [action] = await db.select().from(agentActions).where(eq(agentActions.threadId, threadId));
    expect(action?.agent).toBe("reply");
    // quoted history is stripped before the model sees it
    expect((action?.input as { body: string }).body).not.toContain("Hi Maria");

    const [stored] = await db.select().from(inboundEmails).where(eq(inboundEmails.id, row.id));
    expect(stored?.processedAt).toBeTruthy();
  });

  it("drafts instead of sending when the reply agent is paused", async () => {
    await setSetting(db, "reply_agent_paused", true);
    const row = await inbound("Yes, interested — tell me more.");
    await runJob("email.process_inbound", { inboundEmailId: row.id });
    expect(getFakeSentEmails()).toHaveLength(0);
    const msgs = await db.select().from(outreachMessages).where(eq(outreachMessages.source, "reply_agent"));
    expect(msgs[0]?.status).toBe("draft");
  });

  it("does nothing when a human has taken over the thread", async () => {
    await db.update(threads).set({ agentPaused: true }).where(eq(threads.id, threadId));
    const row = await inbound("Yes, interested.");
    const res = await runJob("agent.reply", { inboundEmailId: row.id });
    // matcher didn't run here, so set matched fields manually for the direct call
    expect(res.ok).toBe(false); // unmatched inbound → error surfaced on job_run
    await db.update(inboundEmails).set({ matchStatus: "matched", matchedLeadId: leadId, matchedThreadId: threadId }).where(eq(inboundEmails.id, row.id));
    const res2 = await runJob("agent.reply", { inboundEmailId: row.id });
    expect(res2.ok).toBe(true);
    if (!res2.ok) return;
    expect(res2.result).toEqual({ skipped: true, reason: "thread_agent_paused" });
    expect(getFakeSentEmails()).toHaveLength(0);
  });

  it("never replies to a suppressed address, and never twice to one inbound", async () => {
    const row = await inbound("Not interested, stop.");
    await runJob("email.process_inbound", { inboundEmailId: row.id });
    expect(getFakeSentEmails()).toHaveLength(0);
    expect(await db.select().from(suppressions)).toHaveLength(1);

    const again = await runJob("agent.reply", { inboundEmailId: row.id });
    expect(again.ok && (again.result as { skipped: boolean }).skipped).toBe(true);

    const row2 = await inbound("Actually how much?");
    const res = await runJob("agent.reply", { inboundEmailId: row2.id });
    // matched by process_inbound? no — call matcher first
    void res;
    await runJob("email.process_inbound", { inboundEmailId: row2.id });
    expect(getFakeSentEmails()).toHaveLength(0);
  });
});
