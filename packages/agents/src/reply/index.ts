import {
  agentActions,
  and,
  asc,
  desc,
  eq,
  getSetting,
  inboundEmails,
  leads,
  outreachMessages,
  sql,
  suppressions,
  threads,
  type Db,
} from "@outreach/db";
import type { EmailClient } from "@outreach/email";
import { logAgentAction } from "../shared/log-action";
import { executeReplyTool } from "./execute-tool";
import { createReplyLlm } from "./live-llm";
import type { ReplyLlm, ThreadTurn } from "./fake-llm";
import { stripQuotedHistory } from "./strip-quotes";
import { getReplyLimits } from "./policy";
import { parseToolInput, type ReplyToolName } from "./tools";

export type RunReplyAgentInput =
  | { inboundEmailId: string; leadId?: string; threadId?: string }
  | { threadId: string; leadId: string; inboundEmailId?: string };

export type ReplySkipReason =
  | "thread_agent_paused"
  | "thread_closed"
  | "lead_suppressed"
  | "lead_not_interested"
  | "already_processed"
  | "no_lead_email";

export type RunReplyAgentResult =
  | {
      skipped: false;
      tool: ReplyToolName;
      intent: string;
      draft: boolean;
      agentActionId: string;
      messageId?: string;
    }
  | { skipped: true; reason: ReplySkipReason };

async function resolveContext(
  db: Db,
  input: RunReplyAgentInput,
): Promise<{ inboundEmailId: string; leadId: string; threadId: string; subject: string; body: string }> {
  if ("inboundEmailId" in input && input.inboundEmailId) {
    const [inbound] = await db
      .select()
      .from(inboundEmails)
      .where(eq(inboundEmails.id, input.inboundEmailId));
    if (!inbound) throw new Error(`Inbound email not found: ${input.inboundEmailId}`);
    const leadId = input.leadId ?? inbound.matchedLeadId;
    const threadId = input.threadId ?? inbound.matchedThreadId;
    if (!leadId || !threadId) throw new Error("Inbound email is not matched to lead/thread");
    return {
      inboundEmailId: inbound.id,
      leadId,
      threadId,
      subject: inbound.subject ?? "",
      body: inbound.bodyText ?? "",
    };
  }

  if (!("threadId" in input) || !("leadId" in input) || !input.threadId || !input.leadId) {
    throw new Error("Either inboundEmailId or threadId+leadId is required");
  }

  const threadId = input.threadId;
  const leadId = input.leadId;
  const [thread] = await db.select().from(threads).where(eq(threads.id, threadId));
  if (!thread) throw new Error(`Thread not found: ${threadId}`);

  const [latestInbound] = await db
    .select()
    .from(inboundEmails)
    .where(eq(inboundEmails.matchedThreadId, threadId))
    .orderBy(desc(inboundEmails.createdAt))
    .limit(1);

  if (!latestInbound) throw new Error(`No inbound email for thread ${threadId}`);

  return {
    inboundEmailId: latestInbound.id,
    leadId,
    threadId,
    subject: latestInbound.subject ?? "",
    body: latestInbound.bodyText ?? "",
  };
}

export async function runReplyAgent(
  db: Db,
  input: RunReplyAgentInput,
  options: { llm?: ReplyLlm; emailClient?: EmailClient } = {},
): Promise<RunReplyAgentResult> {
  const started = Date.now();
  const ctx = await resolveContext(db, input);
  const limits = await getReplyLimits(db);
  // Either kill switch downgrades the agent to draft mode.
  const sendingPaused = await getSetting(db, "sending_paused");
  const draftOnly = limits.replyAgentPaused || sendingPaused;

  const [lead] = await db.select().from(leads).where(eq(leads.id, ctx.leadId));
  if (!lead) throw new Error(`Lead not found: ${ctx.leadId}`);
  if (!lead.email) return { skipped: true, reason: "no_lead_email" };

  // The matcher stamps processedAt, so "already handled by the agent" means
  // an agent action already references this inbound email.
  const [prior] = await db
    .select({ id: agentActions.id })
    .from(agentActions)
    .where(and(eq(agentActions.agent, "reply"), sql`${agentActions.input}->>'inboundEmailId' = ${ctx.inboundEmailId}`))
    .limit(1);
  if (prior) return { skipped: true, reason: "already_processed" };

  const [thread] = await db.select().from(threads).where(eq(threads.id, ctx.threadId));
  if (thread?.agentPaused) return { skipped: true, reason: "thread_agent_paused" };
  if (thread && thread.status !== "active") return { skipped: true, reason: "thread_closed" };

  if (lead.status === "not_interested") return { skipped: true, reason: "lead_not_interested" };
  const [suppressed] = await db
    .select({ id: suppressions.id })
    .from(suppressions)
    .where(eq(suppressions.email, lead.email.toLowerCase()))
    .limit(1);
  if (lead.status === "suppressed" || suppressed) return { skipped: true, reason: "lead_suppressed" };

  const history = await loadHistory(db, ctx.threadId, ctx.inboundEmailId);
  const cleanBody = stripQuotedHistory(ctx.body);

  const llm = createReplyLlm(options.llm);
  const classified = await llm.classify(
    ctx.subject,
    cleanBody,
    {
      businessName: lead.businessName,
      ownerFirstName: lead.ownerFirstName,
      city: lead.city,
      category: lead.category,
      websiteUrl: lead.websiteUrl,
      status: lead.status,
    },
    history,
  );

  const parsedInput = parseToolInput(classified.tool, classified.input);

  const agentActionId = await logAgentAction(db, {
    agent: "reply",
    action: "run_reply_agent",
    intent: classified.intent,
    detail: classified.tool,
    status: draftOnly ? "draft" : "ok",
    leadId: ctx.leadId,
    threadId: ctx.threadId,
    input: { inboundEmailId: ctx.inboundEmailId, subject: ctx.subject, body: cleanBody },
    output: { tool: classified.tool, input: parsedInput },
    tokensIn: classified.tokensIn,
    tokensOut: classified.tokensOut,
    costMicroUsd: classified.costMicroUsd,
    durationMs: Date.now() - started,
  });

  const executed = await executeReplyTool(classified.tool, parsedInput, {
    db,
    leadId: ctx.leadId,
    threadId: ctx.threadId,
    inboundEmailId: ctx.inboundEmailId,
    agentActionId,
    draftOnly,
    emailClient: options.emailClient,
  }, { maxRepliesPerLeadPerDay: limits.maxRepliesPerLeadPerDay });

  await db
    .update(inboundEmails)
    .set({ processedAt: new Date() })
    .where(eq(inboundEmails.id, ctx.inboundEmailId));

  return {
    skipped: false,
    tool: classified.tool,
    intent: classified.intent,
    draft: draftOnly,
    agentActionId,
    messageId: executed.messageId,
  };
}

/** Prior turns in the thread (oldest first), excluding the inbound being answered. */
async function loadHistory(db: Db, threadId: string, currentInboundId: string): Promise<ThreadTurn[]> {
  const outbound = await db
    .select({ body: outreachMessages.bodyText, at: outreachMessages.createdAt, status: outreachMessages.status })
    .from(outreachMessages)
    .where(eq(outreachMessages.threadId, threadId))
    .orderBy(asc(outreachMessages.createdAt));
  const inbound = await db
    .select({ id: inboundEmails.id, body: inboundEmails.bodyText, at: inboundEmails.createdAt })
    .from(inboundEmails)
    .where(eq(inboundEmails.matchedThreadId, threadId))
    .orderBy(asc(inboundEmails.createdAt));

  const turns: (ThreadTurn & { at: Date })[] = [
    ...outbound
      .filter((m) => m.status !== "draft" && m.body)
      .map((m) => ({ direction: "outbound" as const, body: m.body!, at: m.at })),
    ...inbound
      .filter((m) => m.id !== currentInboundId && m.body)
      .map((m) => ({ direction: "inbound" as const, body: stripQuotedHistory(m.body!), at: m.at })),
  ];
  return turns
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(-10)
    .map(({ direction, body }) => ({ direction, body: body.slice(0, 2000) }));
}

export { matchInbound, type InboundMatchResult, type InboundMatchMethod } from "./match-inbound";
export { stripQuotedHistory, parseMessageIds, normalizeMessageId } from "./strip-quotes";
export { createReplyLlm, LiveReplyLlm } from "./live-llm";
export type { ReplyLlm, ThreadTurn } from "./fake-llm";
export { REPLY_MODEL } from "./live-llm";
export { FakeReplyLlm, classifyInboundFake } from "./fake-llm";
export { getReplyLimits, POLICY_RULES, PRICING } from "./policy";
export { replyToolNames, type ReplyToolName } from "./tools";
