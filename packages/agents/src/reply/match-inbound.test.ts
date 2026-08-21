import { beforeEach, describe, expect, it } from "vitest";
import {
  createTestDb,
  eq,
  inboundEmails,
  leads,
  markets,
  outreachMessages,
  threads,
  type Db,
} from "@outreach/db";
import { extractLeadIdFromPlusAddress } from "@outreach/email";
import { matchInbound } from "./match-inbound";
import { stripQuotedHistory } from "./strip-quotes";
import {
  GMAIL_HTML_ONLY,
  NEW_REPLY_TEXT,
  ORIGINAL_OUTBOUND_SNIPPET,
  OUTLOOK_UNDERSCORE_REPLY_BODY,
  REPLY_FIXTURES,
  withLeadId,
} from "./fixtures/inbound-replies";

const OUTBOUND_PROVIDER_ID = "outbound-msg-id@mail.yourdomain.com";

describe("stripQuotedHistory fixtures", () => {
  it.each(REPLY_FIXTURES.map((f) => [f.name, f] as const))(
    "%s keeps new text and drops quoted history",
    (_name, fixture) => {
      const stripped = stripQuotedHistory(fixture.bodyText, fixture.bodyHtml);
      expect(stripped).toBe(NEW_REPLY_TEXT);
      expect(stripped).not.toContain(ORIGINAL_OUTBOUND_SNIPPET);
      expect(stripped).not.toContain("On Tue, Aug 18");
      expect(stripped).not.toContain("Original Message");
      expect(stripped).not.toContain("Sent from my iPhone");
    },
  );

  it("strips Outlook underscore + From/Sent separator", () => {
    expect(stripQuotedHistory(OUTLOOK_UNDERSCORE_REPLY_BODY)).toBe(NEW_REPLY_TEXT);
    expect(stripQuotedHistory(OUTLOOK_UNDERSCORE_REPLY_BODY)).not.toContain(ORIGINAL_OUTBOUND_SNIPPET);
  });

  it("strips Gmail HTML when plain text is missing", () => {
    expect(stripQuotedHistory(null, GMAIL_HTML_ONLY)).toBe(NEW_REPLY_TEXT);
    expect(stripQuotedHistory(null, GMAIL_HTML_ONLY)).not.toContain(ORIGINAL_OUTBOUND_SNIPPET);
  });
});

describe("matchInbound", () => {
  let db: Db;
  let leadId: string;
  let threadId: string;

  beforeEach(async () => {
    db = await createTestDb();
    const [market] = await db
      .insert(markets)
      .values({ city: "Austin", state: "TX", slug: "matcher-austin" })
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
      .values({ leadId, subject: "Quick website idea for Bella Nails", status: "active" })
      .returning();
    threadId = thread!.id;
    await db.insert(outreachMessages).values({
      threadId,
      leadId,
      direction: "outbound",
      source: "sequence",
      sequenceStep: 0,
      providerMessageId: OUTBOUND_PROVIDER_ID,
      subject: "Quick website idea for Bella Nails",
      bodyText: ORIGINAL_OUTBOUND_SNIPPET,
      status: "sent",
    });
  });

  it.each(REPLY_FIXTURES.map((f) => [f.name, f] as const))(
    "%s fixture matches via In-Reply-To and quote-strips",
    async (_name, fixture) => {
      const reply = withLeadId(fixture, leadId);
      const [inbound] = await db
        .insert(inboundEmails)
        .values({
          fromEmail: reply.fromEmail,
          toEmail: reply.toEmail,
          subject: reply.subject,
          messageId: `<reply-${reply.name}@bellanails.test>`,
          inReplyTo: reply.inReplyTo,
          referencesHeader: reply.referencesHeader,
          bodyText: reply.bodyText,
          matchStatus: "pending",
        })
        .returning();

      const result = await matchInbound(db, inbound!);
      expect(result.matched).toBe(true);
      expect(result.matchMethod).toBe("in_reply_to");
      expect(result.leadId).toBe(leadId);
      expect(result.threadId).toBe(threadId);
      expect(result.strippedBody).toBe(NEW_REPLY_TEXT);
      expect(result.strippedBody).not.toContain(ORIGINAL_OUTBOUND_SNIPPET);

      const [stored] = await db.select().from(inboundEmails).where(eq(inboundEmails.id, inbound!.id));
      expect(stored?.matchStatus).toBe("matched");
      expect(stored?.matchedLeadId).toBe(leadId);
      expect(stored?.matchedThreadId).toBe(threadId);
      expect(stored?.bodyText).toBe(NEW_REPLY_TEXT);
      expect(stored?.processedAt).toBeTruthy();

      const inboundMsgs = await db
        .select()
        .from(outreachMessages)
        .where(eq(outreachMessages.direction, "inbound"));
      expect(inboundMsgs).toHaveLength(1);
      expect(inboundMsgs[0]?.bodyText).toBe(NEW_REPLY_TEXT);
    },
  );

  it("matches via References when In-Reply-To is absent", async () => {
    const [inbound] = await db
      .insert(inboundEmails)
      .values({
        fromEmail: "unknown@elsewhere.test",
        toEmail: "hello@mail.yourdomain.com",
        inReplyTo: null,
        referencesHeader: `<older@mail.yourdomain.com> <${OUTBOUND_PROVIDER_ID}>`,
        bodyText: NEW_REPLY_TEXT,
      })
      .returning();

    const result = await matchInbound(db, inbound!);
    expect(result.matched).toBe(true);
    expect(result.matchMethod).toBe("references");
    expect(result.leadId).toBe(leadId);
    expect(result.threadId).toBe(threadId);
  });

  it("matches hello+lead_<id>@ plus-address when headers do not match", async () => {
    const toEmail = `hello+lead_${leadId}@mail.yourdomain.com`;
    expect(extractLeadIdFromPlusAddress(toEmail)).toBe(leadId);

    const [inbound] = await db
      .insert(inboundEmails)
      .values({
        fromEmail: "other-owner@bellanails.test",
        toEmail,
        inReplyTo: "<never-sent@mail.yourdomain.com>",
        bodyText: NEW_REPLY_TEXT,
      })
      .returning();

    const result = await matchInbound(db, inbound!);
    expect(result.matched).toBe(true);
    expect(result.matchMethod).toBe("plus_address");
    expect(result.leadId).toBe(leadId);
    expect(result.threadId).toBe(threadId);
  });

  it("matches sender email when headers and plus-address miss", async () => {
    const [inbound] = await db
      .insert(inboundEmails)
      .values({
        fromEmail: "Maria Owner <MARIA@bellanails.test>",
        toEmail: "hello@mail.yourdomain.com",
        bodyText: NEW_REPLY_TEXT,
      })
      .returning();

    // Persist stores bare emails; matcher still lowercases the from field.
    await db
      .update(inboundEmails)
      .set({ fromEmail: "MARIA@bellanails.test" })
      .where(eq(inboundEmails.id, inbound!.id));
    const [row] = await db.select().from(inboundEmails).where(eq(inboundEmails.id, inbound!.id));

    const result = await matchInbound(db, row!);
    expect(result.matched).toBe(true);
    expect(result.matchMethod).toBe("sender");
    expect(result.leadId).toBe(leadId);
  });

  it("prefers In-Reply-To over plus-address and sender when they disagree", async () => {
    const [market] = await db
      .insert(markets)
      .values({ city: "Dallas", state: "TX", slug: "matcher-dallas" })
      .returning();
    const [other] = await db
      .insert(leads)
      .values({
        marketId: market!.id,
        zip: "75201",
        businessName: "Other Biz",
        email: "other@biz.test",
        status: "sequenced",
      })
      .returning();

    const [inbound] = await db
      .insert(inboundEmails)
      .values({
        fromEmail: other!.email,
        toEmail: `hello+lead_${other!.id}@mail.yourdomain.com`,
        inReplyTo: `<${OUTBOUND_PROVIDER_ID}>`,
        bodyText: NEW_REPLY_TEXT,
      })
      .returning();

    const result = await matchInbound(db, inbound!);
    expect(result.matchMethod).toBe("in_reply_to");
    expect(result.leadId).toBe(leadId);
    expect(result.leadId).not.toBe(other!.id);
  });

  it("queues unmatched inbound on a thread with unmatched status", async () => {
    const [inbound] = await db
      .insert(inboundEmails)
      .values({
        fromEmail: "stranger@unknown.test",
        toEmail: "hello@mail.yourdomain.com",
        subject: "Who are you?",
        bodyText: `${NEW_REPLY_TEXT}\n\n-----Original Message-----\nFrom: Sam\nSent: yesterday\n\n${ORIGINAL_OUTBOUND_SNIPPET}`,
      })
      .returning();

    const result = await matchInbound(db, inbound!);
    expect(result.matched).toBe(false);
    expect(result.matchMethod).toBe("unmatched");
    expect(result.leadId).toBeUndefined();
    expect(result.threadId).toBeTruthy();
    expect(result.strippedBody).toBe(NEW_REPLY_TEXT);

    const [stored] = await db.select().from(inboundEmails).where(eq(inboundEmails.id, inbound!.id));
    expect(stored?.matchStatus).toBe("unmatched");
    expect(stored?.matchedLeadId).toBeNull();
    expect(stored?.matchedThreadId).toBe(result.threadId);
    expect(stored?.bodyText).toBe(NEW_REPLY_TEXT);

    const [thread] = await db.select().from(threads).where(eq(threads.id, result.threadId!));
    expect(thread?.status).toBe("unmatched");
    expect(thread?.leadId).toBeNull();
  });

  it("does not insert a duplicate inbound message on rematch", async () => {
    const [inbound] = await db
      .insert(inboundEmails)
      .values({
        fromEmail: "maria@bellanails.test",
        inReplyTo: `<${OUTBOUND_PROVIDER_ID}>`,
        messageId: "<reply-once@bellanails.test>",
        bodyText: NEW_REPLY_TEXT,
      })
      .returning();

    await matchInbound(db, inbound!);
    const [pending] = await db.select().from(inboundEmails).where(eq(inboundEmails.id, inbound!.id));
    await matchInbound(db, pending!);

    const inboundMsgs = await db
      .select()
      .from(outreachMessages)
      .where(eq(outreachMessages.direction, "inbound"));
    expect(inboundMsgs).toHaveLength(1);
  });
});
