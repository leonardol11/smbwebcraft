import { beforeEach, describe, expect, it } from "vitest";
import { loadEnv, resetEnvForTests } from "@outreach/env";
import {
  createTestDb,
  eq,
  inboundEmails,
  leads,
  markets,
  outreachMessages,
  setSetting,
  threads,
  type Db,
} from "@outreach/db";
import { clearFakeSentEmails, getFakeSentEmails } from "@outreach/email";
import {
  assignThreadToLead,
  listInboxThreads,
  loadThreadDetail,
  mergeTranscript,
  sendThreadReply,
  toggleThreadTakeover,
} from "./inbox";

describe("inbox", () => {
  let db: Db;
  let leadId: string;
  let threadId: string;

  beforeEach(async () => {
    process.env.PROVIDER_MODE = "fake";
    resetEnvForTests();
    loadEnv(process.env);
    clearFakeSentEmails();
    db = await createTestDb();
    await setSetting(db, "sending_paused", false);
    const [market] = await db
      .insert(markets)
      .values({ city: "Austin", state: "TX", slug: "austin-inbox" })
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
      .values({ leadId, subject: "A website for Bella Nails", status: "active" })
      .returning();
    threadId = thread!.id;
    await db.insert(outreachMessages).values({
      threadId,
      leadId,
      direction: "outbound",
      source: "sequence",
      sequenceStep: 0,
      status: "sent",
      providerMessageId: "<out-1@test>",
      subject: "A website for Bella Nails",
      bodyText: "Hi Maria",
      createdAt: new Date("2026-08-01T10:00:00Z"),
    });
    await db.insert(inboundEmails).values({
      fromEmail: "maria@bellanails.test",
      subject: "Re: A website for Bella Nails",
      bodyText: "How much?",
      messageId: "<in-1@test>",
      matchStatus: "matched",
      matchedThreadId: threadId,
      matchedLeadId: leadId,
      createdAt: new Date("2026-08-02T10:00:00Z"),
    });
  });

  it("merges outbound and inbound into chronological order", () => {
    const merged = mergeTranscript(
      [
        {
          id: "o2",
          direction: "outbound",
          source: "reply_agent",
          status: "sent",
          subject: null,
          bodyText: "b",
          providerMessageId: null,
          createdAt: new Date("2026-08-03T00:00:00Z"),
        },
        {
          id: "o1",
          direction: "outbound",
          source: "sequence",
          status: "sent",
          subject: null,
          bodyText: "a",
          providerMessageId: null,
          createdAt: new Date("2026-08-01T00:00:00Z"),
        },
      ],
      [
        {
          id: "i1",
          fromEmail: "x@y.z",
          subject: null,
          bodyText: "reply",
          messageId: "<m>",
          matchStatus: "matched",
          createdAt: new Date("2026-08-02T00:00:00Z"),
        },
      ],
    );
    expect(merged.map((m) => m.id)).toEqual(["o1", "i1", "o2"]);
    expect(merged[1]!.kind).toBe("inbound");
  });

  it("loads a thread detail with merged transcript", async () => {
    const detail = await loadThreadDetail(db, threadId);
    expect(detail?.lead?.businessName).toBe("Bella Nails");
    expect(detail?.transcript.map((t) => t.kind)).toEqual(["outbound", "inbound"]);
  });

  it("sends a manual reply with threading headers and flips lead to replied", async () => {
    const result = await sendThreadReply(db, { threadId, bodyText: "It's $25/mo." });
    expect(result.outcome).toBe("sent");
    const sent = getFakeSentEmails();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toBe("Re: A website for Bella Nails");
    expect(sent[0]!.headers?.["In-Reply-To"]).toBe("<in-1@test>");
    expect(sent[0]!.headers?.References).toBe("<out-1@test>");
    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
    expect(lead!.status).toBe("replied");
    const msgs = await db
      .select()
      .from(outreachMessages)
      .where(eq(outreachMessages.threadId, threadId));
    const manual = msgs.find((m) => m.source === "manual")!;
    expect(manual.status).toBe("sent");
    expect(manual.providerMessageId).toBe(sent[0]!.messageId);
  });

  it("stores a draft instead of sending when sending_paused", async () => {
    await setSetting(db, "sending_paused", true);
    const result = await sendThreadReply(db, { threadId, bodyText: "hold on" });
    expect(result.outcome).toBe("draft");
    expect(getFakeSentEmails()).toHaveLength(0);
    const list = await listInboxThreads(db, { status: "active", needsHuman: false });
    expect(list[0]!.draftCount).toBe(1);
  });

  it("sendDraft marks an existing draft sent with provider id", async () => {
    const [draft] = await db
      .insert(outreachMessages)
      .values({
        threadId,
        leadId,
        direction: "outbound",
        source: "reply_agent",
        status: "draft",
        subject: "Re: A website for Bella Nails",
        bodyText: "Agent draft",
      })
      .returning();
    const result = await sendThreadReply(db, { threadId, draftMessageId: draft!.id });
    expect(result.outcome).toBe("sent");
    const [row] = await db
      .select()
      .from(outreachMessages)
      .where(eq(outreachMessages.id, draft!.id));
    expect(row!.status).toBe("sent");
    expect(row!.providerMessageId).toBe(getFakeSentEmails()[0]!.messageId);
    expect(row!.source).toBe("reply_agent");
  });

  it("toggles take-over and surfaces in needs_human filter", async () => {
    expect(await toggleThreadTakeover(db, threadId)).toBe(true);
    const list = await listInboxThreads(db, { status: "all", needsHuman: true });
    expect(list.map((t) => t.id)).toEqual([threadId]);
    expect(await toggleThreadTakeover(db, threadId)).toBe(false);
    expect(await listInboxThreads(db, { status: "all", needsHuman: true })).toHaveLength(0);
  });

  it("assigns an unmatched thread to a lead", async () => {
    const [t] = await db.insert(threads).values({ status: "unmatched", subject: "hi" }).returning();
    await db.insert(inboundEmails).values({
      fromEmail: "someone@else.test",
      matchStatus: "unmatched",
      matchedThreadId: t!.id,
    });
    const before = await listInboxThreads(db, { status: "unmatched", needsHuman: false });
    expect(before[0]!.fromEmail).toBe("someone@else.test");
    await assignThreadToLead(db, t!.id, leadId);
    const [thread] = await db.select().from(threads).where(eq(threads.id, t!.id));
    expect(thread!.leadId).toBe(leadId);
    expect(thread!.status).toBe("active");
    const [ie] = await db.select().from(inboundEmails).where(eq(inboundEmails.matchedThreadId, t!.id));
    expect(ie!.matchStatus).toBe("matched");
    expect(ie!.matchedLeadId).toBe(leadId);
  });
});
