import {
  agentActions,
  and,
  desc,
  eq,
  getSetting,
  inArray,
  inboundEmails,
  leads,
  markets,
  or,
  outreachMessages,
  sql,
  threads,
  type Db,
  type InboundMatchStatus,
  type LeadStatus,
  type MessageSource,
  type MessageStatus,
  type ThreadStatus,
} from "@outreach/db";
import {
  buildThreadingHeaders,
  createEmailClient,
  fromAddress,
  plusAddress,
} from "@outreach/email";

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export {
  THREAD_STATUS_FILTERS,
  parseInboxFilters,
  inboxHref,
  type ThreadStatusFilter,
  type InboxFilters,
} from "./inbox-filters";
import { type InboxFilters, type ThreadStatusFilter } from "./inbox-filters";

// ---------------------------------------------------------------------------
// Thread list
// ---------------------------------------------------------------------------

export type ThreadListRow = {
  id: string;
  leadId: string | null;
  subject: string | null;
  status: ThreadStatus;
  agentPaused: boolean;
  lastMessageAt: Date | null;
  businessName: string | null;
  leadStatus: LeadStatus | null;
  city: string | null;
  fromEmail: string | null;
  draftCount: number;
  escalated: boolean;
};

export async function listInboxThreads(
  db: Db,
  filters: InboxFilters,
  limit = 200,
): Promise<ThreadListRow[]> {
  const conds = [];
  if (filters.status !== "all") conds.push(eq(threads.status, filters.status));
  if (filters.market) {
    const m = filters.market;
    conds.push(or(eq(markets.slug, m), sql`lower(${markets.city}) = lower(${m})`));
  }

  const rows = await db
    .select({
      id: threads.id,
      leadId: threads.leadId,
      subject: threads.subject,
      status: threads.status,
      agentPaused: threads.agentPaused,
      lastMessageAt: threads.lastMessageAt,
      businessName: leads.businessName,
      leadStatus: leads.status,
      city: markets.city,
    })
    .from(threads)
    .leftJoin(leads, eq(threads.leadId, leads.id))
    .leftJoin(markets, eq(leads.marketId, markets.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(sql`coalesce(${threads.lastMessageAt}, ${threads.createdAt})`))
    .limit(limit);

  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const [draftRows, escalatedRows, inboundRows] = await Promise.all([
    db
      .select({ threadId: outreachMessages.threadId, count: sql<number>`count(*)::int` })
      .from(outreachMessages)
      .where(and(inArray(outreachMessages.threadId, ids), eq(outreachMessages.status, "draft")))
      .groupBy(outreachMessages.threadId),
    db
      .select({ threadId: agentActions.threadId, status: agentActions.status })
      .from(agentActions)
      .where(inArray(agentActions.threadId, ids))
      .orderBy(desc(agentActions.createdAt)),
    db
      .select({ threadId: inboundEmails.matchedThreadId, fromEmail: inboundEmails.fromEmail })
      .from(inboundEmails)
      .where(inArray(inboundEmails.matchedThreadId, ids))
      .orderBy(desc(inboundEmails.createdAt)),
  ]);

  const drafts = new Map(draftRows.map((d) => [d.threadId, d.count]));
  const latestAction = new Map<string, string>();
  for (const r of escalatedRows) {
    if (r.threadId && !latestAction.has(r.threadId)) latestAction.set(r.threadId, r.status);
  }
  const escalated = new Set(
    [...latestAction.entries()].filter(([, st]) => st === "escalated").map(([t]) => t),
  );
  const fromByThread = new Map<string, string>();
  for (const r of inboundRows) {
    if (r.threadId && r.fromEmail && !fromByThread.has(r.threadId)) {
      fromByThread.set(r.threadId, r.fromEmail);
    }
  }

  const out: ThreadListRow[] = rows.map((r) => ({
    ...r,
    fromEmail: fromByThread.get(r.id) ?? null,
    draftCount: drafts.get(r.id) ?? 0,
    escalated: escalated.has(r.id),
  }));

  return filters.needsHuman ? out.filter(needsHuman) : out;
}

export function needsHuman(row: Pick<ThreadListRow, "agentPaused" | "escalated" | "status">) {
  return row.agentPaused || row.escalated || row.status === "unmatched";
}

// ---------------------------------------------------------------------------
// Transcript
// ---------------------------------------------------------------------------

export type TranscriptItem = {
  id: string;
  kind: "outbound" | "inbound";
  direction: "outbound" | "inbound";
  source: MessageSource | "inbound";
  status: MessageStatus | InboundMatchStatus;
  subject: string | null;
  bodyText: string | null;
  fromEmail?: string | null;
  providerMessageId?: string | null;
  messageId?: string | null;
  createdAt: Date;
};

type OutboundLike = {
  id: string;
  direction: "outbound" | "inbound";
  source: MessageSource;
  status: MessageStatus;
  subject: string | null;
  bodyText: string | null;
  providerMessageId: string | null;
  createdAt: Date;
};

type InboundLike = {
  id: string;
  fromEmail: string | null;
  subject: string | null;
  bodyText: string | null;
  messageId: string | null;
  matchStatus: InboundMatchStatus;
  createdAt: Date;
};

/** Pure merge of outreach_messages + inbound_emails into one chronological list. */
export function mergeTranscript(
  outbound: OutboundLike[],
  inbound: InboundLike[],
): TranscriptItem[] {
  const items: TranscriptItem[] = [
    ...outbound.map<TranscriptItem>((m) => ({
      id: m.id,
      kind: "outbound",
      direction: m.direction,
      source: m.source,
      status: m.status,
      subject: m.subject,
      bodyText: m.bodyText,
      providerMessageId: m.providerMessageId,
      createdAt: new Date(m.createdAt),
    })),
    ...inbound.map<TranscriptItem>((m) => ({
      id: m.id,
      kind: "inbound",
      direction: "inbound",
      source: "inbound",
      status: m.matchStatus,
      subject: m.subject,
      bodyText: m.bodyText,
      fromEmail: m.fromEmail,
      messageId: m.messageId,
      createdAt: new Date(m.createdAt),
    })),
  ];
  return items.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export type ThreadDetail = {
  thread: typeof threads.$inferSelect;
  lead: (typeof leads.$inferSelect & { city: string | null; marketSlug: string | null; marketId: string }) | null;
  transcript: TranscriptItem[];
};

export async function loadThreadDetail(db: Db, threadId: string): Promise<ThreadDetail | null> {
  const [thread] = await db.select().from(threads).where(eq(threads.id, threadId));
  if (!thread) return null;

  let lead: ThreadDetail["lead"] = null;
  if (thread.leadId) {
    const [row] = await db
      .select({ lead: leads, city: markets.city, marketSlug: markets.slug })
      .from(leads)
      .leftJoin(markets, eq(leads.marketId, markets.id))
      .where(eq(leads.id, thread.leadId));
    if (row) lead = { ...row.lead, city: row.city, marketSlug: row.marketSlug };
  }

  const [outbound, inbound] = await Promise.all([
    db.select().from(outreachMessages).where(eq(outreachMessages.threadId, threadId)),
    db.select().from(inboundEmails).where(eq(inboundEmails.matchedThreadId, threadId)),
  ]);

  return { thread, lead, transcript: mergeTranscript(outbound, inbound) };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function toggleThreadTakeover(db: Db, threadId: string): Promise<boolean> {
  const [thread] = await db.select().from(threads).where(eq(threads.id, threadId));
  if (!thread) throw new Error("Thread not found");
  const next = !thread.agentPaused;
  await db.update(threads).set({ agentPaused: next }).where(eq(threads.id, threadId));
  return next;
}

export async function setThreadStatus(db: Db, threadId: string, status: ThreadStatus) {
  await db.update(threads).set({ status }).where(eq(threads.id, threadId));
}

export function replySubject(subject: string | null | undefined): string {
  const s = (subject ?? "").trim();
  if (!s) return "Re: your website";
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function textToHtml(text: string): string {
  return `<div style="font-family:sans-serif;white-space:pre-wrap">${escapeHtml(text)}</div>`;
}

export type SendReplyResult =
  | { outcome: "sent"; messageId: string; providerMessageId: string }
  | { outcome: "draft"; messageId: string; reason: "sending_paused" }
  | { outcome: "error"; error: string };

/**
 * Send a manual reply on a thread. Either composes a new message (`bodyText`)
 * or sends an existing draft row (`draftMessageId`). When the sending kill
 * switch is on the message is stored (or left) as a draft.
 */
export async function sendThreadReply(
  db: Db,
  opts: { threadId: string; bodyText?: string; draftMessageId?: string; source?: MessageSource },
): Promise<SendReplyResult> {
  const [thread] = await db.select().from(threads).where(eq(threads.id, opts.threadId));
  if (!thread) return { outcome: "error", error: "Thread not found" };
  if (!thread.leadId) return { outcome: "error", error: "Thread is not assigned to a lead" };
  const [lead] = await db.select().from(leads).where(eq(leads.id, thread.leadId));
  if (!lead?.email) return { outcome: "error", error: "Lead has no email address" };

  let draft: typeof outreachMessages.$inferSelect | undefined;
  if (opts.draftMessageId) {
    [draft] = await db
      .select()
      .from(outreachMessages)
      .where(eq(outreachMessages.id, opts.draftMessageId));
    if (!draft) return { outcome: "error", error: "Draft not found" };
    if (draft.status !== "draft") return { outcome: "error", error: "Message is not a draft" };
  }

  const bodyText = (draft?.bodyText ?? opts.bodyText ?? "").trim();
  if (!bodyText) return { outcome: "error", error: "Reply body is empty" };
  const subject = draft?.subject ?? replySubject(thread.subject);
  const html = draft?.bodyHtml ?? textToHtml(bodyText);
  const source: MessageSource = draft?.source ?? opts.source ?? "manual";

  const paused = await getSetting(db, "sending_paused");
  if (paused) {
    if (draft) return { outcome: "draft", messageId: draft.id, reason: "sending_paused" };
    const [row] = await db
      .insert(outreachMessages)
      .values({
        threadId: thread.id,
        leadId: lead.id,
        direction: "outbound",
        source,
        subject,
        bodyText,
        bodyHtml: html,
        status: "draft",
      })
      .returning();
    return { outcome: "draft", messageId: row!.id, reason: "sending_paused" };
  }

  const [priorOutbound, latestInbound] = await Promise.all([
    db
      .select({ providerMessageId: outreachMessages.providerMessageId })
      .from(outreachMessages)
      .where(
        and(
          eq(outreachMessages.threadId, thread.id),
          eq(outreachMessages.direction, "outbound"),
          sql`${outreachMessages.providerMessageId} is not null`,
        ),
      )
      .orderBy(outreachMessages.createdAt),
    db
      .select({ messageId: inboundEmails.messageId })
      .from(inboundEmails)
      .where(eq(inboundEmails.matchedThreadId, thread.id))
      .orderBy(desc(inboundEmails.createdAt))
      .limit(1),
  ]);
  const references = priorOutbound.map((m) => m.providerMessageId!).filter(Boolean);
  const inReplyTo = latestInbound[0]?.messageId ?? references.at(-1);

  const client = createEmailClient();
  const result = await client.send({
    to: lead.email,
    from: fromAddress(),
    replyTo: plusAddress(lead.id),
    subject,
    html,
    text: bodyText,
    headers: buildThreadingHeaders({ inReplyTo, references }),
  });

  const now = new Date();
  let messageId: string;
  if (draft) {
    await db
      .update(outreachMessages)
      .set({ status: "sent", providerMessageId: result.messageId, inReplyTo: inReplyTo ?? null })
      .where(eq(outreachMessages.id, draft.id));
    messageId = draft.id;
  } else {
    const [row] = await db
      .insert(outreachMessages)
      .values({
        threadId: thread.id,
        leadId: lead.id,
        direction: "outbound",
        source,
        subject,
        bodyText,
        bodyHtml: html,
        status: "sent",
        providerMessageId: result.messageId,
        inReplyTo: inReplyTo ?? null,
        createdAt: now,
      })
      .returning();
    messageId = row!.id;
  }

  await db.update(threads).set({ lastMessageAt: now }).where(eq(threads.id, thread.id));
  await db
    .update(leads)
    .set({
      lastTouchAt: now,
      updatedAt: now,
      ...(lead.status === "sequenced" ? { status: "replied" as LeadStatus } : {}),
    })
    .where(eq(leads.id, lead.id));

  return { outcome: "sent", messageId, providerMessageId: result.messageId };
}

export async function discardDraft(db: Db, messageId: string): Promise<void> {
  await db
    .delete(outreachMessages)
    .where(and(eq(outreachMessages.id, messageId), eq(outreachMessages.status, "draft")));
}

export async function assignThreadToLead(db: Db, threadId: string, leadId: string) {
  const [lead] = await db.select({ id: leads.id }).from(leads).where(eq(leads.id, leadId));
  if (!lead) throw new Error("Lead not found");
  await db
    .update(threads)
    .set({ leadId, status: "active" })
    .where(eq(threads.id, threadId));
  await db
    .update(inboundEmails)
    .set({ matchedLeadId: leadId, matchStatus: "matched" })
    .where(eq(inboundEmails.matchedThreadId, threadId));
}

export async function searchLeads(
  db: Db,
  q: string,
  market?: string,
  limit = 10,
): Promise<{ id: string; businessName: string; email: string | null; city: string | null }[]> {
  const term = q.trim();
  if (!term) return [];
  const like = `%${term.toLowerCase()}%`;
  const conds = [
    or(sql`lower(${leads.businessName}) like ${like}`, sql`lower(${leads.email}) like ${like}`),
  ];
  if (market) {
    conds.push(or(eq(markets.slug, market), sql`lower(${markets.city}) = lower(${market})`));
  }
  return db
    .select({ id: leads.id, businessName: leads.businessName, email: leads.email, city: markets.city })
    .from(leads)
    .leftJoin(markets, eq(leads.marketId, markets.id))
    .where(and(...conds))
    .limit(limit);
}
