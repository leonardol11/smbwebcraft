import { describe, expect, it, beforeEach } from "vitest";
import {
  desc,
  eq,
  createTestDb,
  inboundEmails,
  leads,
  markets,
  outreachMessages,
  setSetting,
  threads,
  type Db,
} from "@outreach/db";
import { classifyInboundFake } from "./fake-llm";
import type { ReplyToolName } from "./tools";
import { runReplyAgent } from "./index";

type EvalCase = {
  name: string;
  subject: string;
  body: string;
  expectedTool: ReplyToolName;
};

const EVAL_CASES: EvalCase[] = [
  { name: "not interested", subject: "Re:", body: "Not interested, please stop.", expectedTool: "mark_not_interested" },
  { name: "unsubscribe", subject: "Re:", body: "Unsubscribe me from this list.", expectedTool: "mark_not_interested" },
  { name: "human request", subject: "Re:", body: "Can I speak to a human?", expectedTool: "escalate_to_human" },
  { name: "call me", subject: "Re:", body: "Please call me about this.", expectedTool: "escalate_to_human" },
  { name: "pricing", subject: "Re:", body: "How much does it cost?", expectedTool: "send_payment_link" },
  { name: "ready to pay", subject: "Re:", body: "I'm ready to pay, send the link.", expectedTool: "send_payment_link" },
  { name: "preview", subject: "Re:", body: "Can I see a preview of the site?", expectedTool: "send_preview" },
  { name: "show me", subject: "Re:", body: "Show me what it would look like.", expectedTool: "send_preview" },
  { name: "discount", subject: "Re:", body: "Any discount available?", expectedTool: "send_reply" },
  { name: "interested", subject: "Re:", body: "Yes, I'm interested. Tell me more.", expectedTool: "send_reply" },
  { name: "who are you", subject: "Re:", body: "Who are you and what company is this?", expectedTool: "send_reply" },
  { name: "timeline", subject: "Re:", body: "How long would it take?", expectedTool: "send_reply" },
  { name: "domain", subject: "Re:", body: "What about my domain and URL?", expectedTool: "send_reply" },
  { name: "features", subject: "Re:", body: "What features are included?", expectedTool: "send_reply" },
  { name: "competitor", subject: "Re:", body: "We already have a site with a competitor.", expectedTool: "send_reply" },
  { name: "wrong email", subject: "Re:", body: "Wrong email address.", expectedTool: "mark_not_interested" },
  { name: "legal", subject: "Re:", body: "I'm contacting my lawyer.", expectedTool: "escalate_to_human" },
  { name: "thanks", subject: "Re:", body: "Thanks for reaching out!", expectedTool: "send_reply" },
  { name: "maybe later", subject: "Re:", body: "Maybe — I need to think about it.", expectedTool: "send_reply" },
  { name: "busy", subject: "Re:", body: "I'm busy, follow up later.", expectedTool: "send_reply" },
];

describe("reply agent eval", () => {
  it.each(EVAL_CASES.map((c) => [c.name, c] as const))("%s → %s", (_name, c) => {
    const result = classifyInboundFake(c.subject, c.body);
    expect(result.tool).toBe(c.expectedTool);
  });
});

describe("runReplyAgent integration", () => {
  let db: Db;
  let leadId: string;
  let threadId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await setSetting(db, "reply_agent_paused", false);
    const [m] = await db.insert(markets).values({ city: "A", state: "TX", slug: "reply-a" }).returning();
    const [lead] = await db
      .insert(leads)
      .values({
        marketId: m!.id,
        zip: "78701",
        businessName: "Reply Biz",
        email: "owner@replybiz.com",
        status: "sequenced",
      })
      .returning();
    leadId = lead!.id;
    const [thread] = await db
      .insert(threads)
      .values({ leadId, subject: "Website offer", status: "active" })
      .returning();
    threadId = thread!.id;
  });

  it("executes tool and logs agent action", async () => {
    const [inbound] = await db
      .insert(inboundEmails)
      .values({
        fromEmail: "owner@replybiz.com",
        subject: "Re: Website",
        bodyText: "How much does it cost?",
        matchStatus: "matched",
        matchedLeadId: leadId,
        matchedThreadId: threadId,
      })
      .returning();

    const result = await runReplyAgent(db, { inboundEmailId: inbound!.id });
    expect(result.skipped).toBe(false);
    if (result.skipped) return;
    expect(result.tool).toBe("send_payment_link");
    expect(result.draft).toBe(false);

    const msgs = await db.select().from(outreachMessages).where(eq(outreachMessages.leadId, leadId));
    expect(msgs.length).toBe(1);
    expect(msgs[0]?.status).toBe("sent");
  });

  it("creates draft when reply agent paused", async () => {
    await setSetting(db, "reply_agent_paused", true);
    const [inbound] = await db
      .insert(inboundEmails)
      .values({
        bodyText: "Yes interested",
        matchStatus: "matched",
        matchedLeadId: leadId,
        matchedThreadId: threadId,
      })
      .returning();

    const result = await runReplyAgent(db, { inboundEmailId: inbound!.id });
    expect(result.skipped).toBe(false);
    if (result.skipped) return;
    expect(result.draft).toBe(true);
    const msgs = await db.select().from(outreachMessages).where(eq(outreachMessages.leadId, leadId));
    expect(msgs[0]?.status).toBe("draft");
  });
});
