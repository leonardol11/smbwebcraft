import { and, eq, inArray, or, sql } from "@outreach/db";
import {
  inboundEmails,
  leads,
  outreachMessages,
  threads,
  type Db,
} from "@outreach/db";
import { extractLeadIdFromPlusAddress } from "@outreach/email";
import { normalizeMessageId, parseMessageIds, stripQuotedHistory } from "./strip-quotes";

export type InboundMatchMethod = "in_reply_to" | "references" | "plus_address" | "sender" | "unmatched";

export type InboundMatchResult = {
  matched: boolean;
  leadId?: string;
  threadId?: string;
  matchMethod: InboundMatchMethod;
  strippedBody: string;
};

type InboundRow = typeof inboundEmails.$inferSelect;
type OutreachRow = typeof outreachMessages.$inferSelect;

/**
 * Match inbound mail in plan order: In-Reply-To / References, plus-address
 * token, sender email, then unmatched queue. Persists match status, stripped
 * body, and thread rows. Does not call the reply LLM.
 */
export async function matchInbound(db: Db, inbound: InboundRow): Promise<InboundMatchResult> {
  const strippedBody = stripQuotedHistory(inbound.bodyText, inbound.bodyHtml);

  const headerMatch = await matchByThreadingHeaders(db, inbound);
  if (headerMatch) {
    return persistMatched(db, inbound, headerMatch, strippedBody);
  }

  const plusMatch = await matchByPlusAddress(db, inbound);
  if (plusMatch) {
    return persistMatched(db, inbound, plusMatch, strippedBody);
  }

  const senderMatch = await matchBySender(db, inbound);
  if (senderMatch) {
    return persistMatched(db, inbound, senderMatch, strippedBody);
  }

  return persistUnmatched(db, inbound, strippedBody);
}

async function matchByThreadingHeaders(
  db: Db,
  inbound: InboundRow,
): Promise<{ leadId: string; threadId: string; matchMethod: "in_reply_to" | "references" } | null> {
  const replyToIds = parseMessageIds(inbound.inReplyTo);
  const referenceIds = [...parseMessageIds(inbound.referencesHeader)].reverse();

  const replyToMsg = await findOutreachByMessageIds(db, replyToIds);
  if (replyToMsg?.leadId) {
    const threadId = await resolveThreadId(db, replyToMsg, inbound.subject);
    return { leadId: replyToMsg.leadId, threadId, matchMethod: "in_reply_to" };
  }

  const refsMsg = await findOutreachByMessageIds(db, referenceIds);
  if (refsMsg?.leadId) {
    const threadId = await resolveThreadId(db, refsMsg, inbound.subject);
    return { leadId: refsMsg.leadId, threadId, matchMethod: "references" };
  }

  return null;
}

async function matchByPlusAddress(
  db: Db,
  inbound: InboundRow,
): Promise<{ leadId: string; threadId: string; matchMethod: "plus_address" } | null> {
  const leadId = extractLeadIdFromPlusAddress(inbound.toEmail);
  if (!leadId) return null;
  const [lead] = await db.select({ id: leads.id }).from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) return null;
  const threadId = await findOrCreateActiveThread(db, lead.id, inbound.subject);
  return { leadId: lead.id, threadId, matchMethod: "plus_address" };
}

async function matchBySender(
  db: Db,
  inbound: InboundRow,
): Promise<{ leadId: string; threadId: string; matchMethod: "sender" } | null> {
  const fromEmail = inbound.fromEmail?.toLowerCase().trim();
  if (!fromEmail) return null;
  const [lead] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(sql`lower(${leads.email}) = ${fromEmail}`)
    .limit(1);
  if (!lead) return null;
  const threadId = await findOrCreateActiveThread(db, lead.id, inbound.subject);
  return { leadId: lead.id, threadId, matchMethod: "sender" };
}

async function findOutreachByMessageIds(db: Db, ids: string[]): Promise<OutreachRow | undefined> {
  const variants = new Set<string>();
  for (const raw of ids) {
    const normalized = normalizeMessageId(raw);
    if (!normalized) continue;
    variants.add(normalized);
    variants.add(`<${normalized}>`);
  }
  const list = [...variants];
  if (!list.length) return undefined;

  const [byProvider] = await db
    .select()
    .from(outreachMessages)
    .where(
      or(
        inArray(outreachMessages.providerMessageId, list),
        sql`lower(trim(both '<>' from coalesce(${outreachMessages.providerMessageId}, ''))) in (${sql.join(
          list.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      ),
    )
    .limit(1);
  if (byProvider) return byProvider;

  const [byId] = await db
    .select()
    .from(outreachMessages)
    .where(inArray(outreachMessages.id, list))
    .limit(1);
  return byId;
}

async function resolveThreadId(db: Db, msg: OutreachRow, subject: string | null): Promise<string> {
  if (msg.threadId) {
    await db
      .update(threads)
      .set({ lastMessageAt: new Date() })
      .where(eq(threads.id, msg.threadId));
    return msg.threadId;
  }
  return findOrCreateActiveThread(db, msg.leadId, subject);
}

async function findOrCreateActiveThread(db: Db, leadId: string, subject: string | null): Promise<string> {
  const [existing] = await db
    .select({ id: threads.id })
    .from(threads)
    .where(and(eq(threads.leadId, leadId), eq(threads.status, "active")))
    .limit(1);
  if (existing) {
    await db.update(threads).set({ lastMessageAt: new Date() }).where(eq(threads.id, existing.id));
    return existing.id;
  }
  const [created] = await db
    .insert(threads)
    .values({
      leadId,
      subject,
      status: "active",
      lastMessageAt: new Date(),
    })
    .returning({ id: threads.id });
  return created!.id;
}

async function persistMatched(
  db: Db,
  inbound: InboundRow,
  match: { leadId: string; threadId: string; matchMethod: Exclude<InboundMatchMethod, "unmatched"> },
  strippedBody: string,
): Promise<InboundMatchResult> {
  await db
    .update(inboundEmails)
    .set({
      matchStatus: "matched",
      matchedLeadId: match.leadId,
      matchedThreadId: match.threadId,
      bodyText: strippedBody,
      processedAt: new Date(),
    })
    .where(eq(inboundEmails.id, inbound.id));

  await insertInboundMessage(db, inbound, match.leadId, match.threadId, strippedBody);

  return {
    matched: true,
    leadId: match.leadId,
    threadId: match.threadId,
    matchMethod: match.matchMethod,
    strippedBody,
  };
}

async function persistUnmatched(
  db: Db,
  inbound: InboundRow,
  strippedBody: string,
): Promise<InboundMatchResult> {
  const threadId = await findOrCreateUnmatchedThread(db, inbound);

  await db
    .update(inboundEmails)
    .set({
      matchStatus: "unmatched",
      matchedLeadId: null,
      matchedThreadId: threadId,
      bodyText: strippedBody,
      processedAt: new Date(),
    })
    .where(eq(inboundEmails.id, inbound.id));

  return {
    matched: false,
    threadId,
    matchMethod: "unmatched",
    strippedBody,
  };
}

async function findOrCreateUnmatchedThread(db: Db, inbound: InboundRow): Promise<string> {
  if (inbound.matchedThreadId) {
    const [existing] = await db
      .select({ id: threads.id, leadId: threads.leadId, status: threads.status })
      .from(threads)
      .where(eq(threads.id, inbound.matchedThreadId))
      .limit(1);
    if (existing && existing.status === "unmatched" && !existing.leadId) {
      await db
        .update(threads)
        .set({ lastMessageAt: new Date(), subject: inbound.subject ?? undefined })
        .where(eq(threads.id, existing.id));
      return existing.id;
    }
  }

  const [created] = await db
    .insert(threads)
    .values({
      leadId: null,
      subject: inbound.subject,
      status: "unmatched",
      lastMessageAt: new Date(),
    })
    .returning({ id: threads.id });
  return created!.id;
}

async function insertInboundMessage(
  db: Db,
  inbound: InboundRow,
  leadId: string,
  threadId: string,
  strippedBody: string,
): Promise<void> {
  const providerMessageId = inbound.messageId ?? `inbound:${inbound.id}`;
  const variants = [
    providerMessageId,
    `<${normalizeMessageId(providerMessageId)}>`,
    normalizeMessageId(providerMessageId),
  ];
  const [existing] = await db
    .select({ id: outreachMessages.id })
    .from(outreachMessages)
    .where(inArray(outreachMessages.providerMessageId, variants))
    .limit(1);
  if (existing) return;

  await db.insert(outreachMessages).values({
    threadId,
    leadId,
    direction: "inbound",
    source: "system",
    providerMessageId,
    inReplyTo: inbound.inReplyTo,
    subject: inbound.subject,
    bodyText: strippedBody,
    bodyHtml: inbound.bodyHtml,
    status: "received",
  });
}
