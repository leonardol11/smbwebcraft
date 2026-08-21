import { and, eq, gte, inboundEmails, leads, outreachMessages, suppressions, threads, type Db, type MessageStatus } from "@outreach/db";
import { env } from "@outreach/env";
import {
  buildThreadingHeaders,
  createEmailClient,
  fromAddress,
  plusAddress,
  type EmailClient,
} from "@outreach/email";
import type { ReplyToolName } from "./tools";

export type ExecuteToolContext = {
  db: Db;
  leadId: string;
  threadId: string;
  inboundEmailId: string;
  agentActionId?: string;
  draftOnly: boolean;
  emailClient?: EmailClient;
};

export type ExecuteToolResult = {
  tool: ReplyToolName;
  messageId?: string;
  providerMessageId?: string;
  status: MessageStatus | "escalated" | "marked_not_interested";
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function textToHtml(text: string): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5">${paragraphs}</div>`;
}

async function countRepliesToday(db: Db, leadId: string): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const rows = await db
    .select({ id: outreachMessages.id })
    .from(outreachMessages)
    .where(
      and(
        eq(outreachMessages.leadId, leadId),
        eq(outreachMessages.source, "reply_agent"),
        eq(outreachMessages.direction, "outbound"),
        gte(outreachMessages.createdAt, start),
      ),
    );
  return rows.length;
}

async function alreadyRepliedToInbound(db: Db, inboundEmailId: string): Promise<boolean> {
  const [inbound] = await db
    .select()
    .from(inboundEmails)
    .where(eq(inboundEmails.id, inboundEmailId));
  if (!inbound) return false;
  const rows = await db
    .select({ id: outreachMessages.id })
    .from(outreachMessages)
    .where(
      and(
        eq(outreachMessages.threadId, inbound.matchedThreadId ?? ""),
        eq(outreachMessages.source, "reply_agent"),
        eq(outreachMessages.direction, "outbound"),
        gte(outreachMessages.createdAt, inbound.createdAt),
      ),
    );
  return rows.length > 0;
}

export async function executeReplyTool(
  tool: ReplyToolName,
  input: Record<string, unknown>,
  ctx: ExecuteToolContext,
  limits: { maxRepliesPerLeadPerDay: number },
): Promise<ExecuteToolResult> {
  if (await alreadyRepliedToInbound(ctx.db, ctx.inboundEmailId)) {
    throw new Error("Already replied to this inbound email");
  }

  const todayCount = await countRepliesToday(ctx.db, ctx.leadId);
  if (todayCount >= limits.maxRepliesPerLeadPerDay && tool !== "mark_not_interested" && tool !== "escalate_to_human") {
    throw new Error("Daily reply cap reached for lead");
  }

  const [lead] = await ctx.db.select().from(leads).where(eq(leads.id, ctx.leadId));
  if (!lead?.email) throw new Error("Lead has no email");

  const [inbound] = await ctx.db
    .select()
    .from(inboundEmails)
    .where(eq(inboundEmails.id, ctx.inboundEmailId));
  const [thread] = await ctx.db.select().from(threads).where(eq(threads.id, ctx.threadId));
  const threadSubject = thread?.subject ?? "Your website";
  // Keep the mail client's thread intact: reuse the inbound subject, then the
  // thread subject; the model's suggested subject is only a last resort.
  const baseSubject = inbound?.subject?.trim() || threadSubject;
  const subject = baseSubject
    ? /^re:/i.test(baseSubject) ? baseSubject : `Re: ${baseSubject}`
    : ((input.subject as string | undefined) ?? "Re: Your website");
  const body = input.body as string | undefined;
  const status: MessageStatus = ctx.draftOnly ? "draft" : "sent";

  switch (tool) {
    case "send_reply":
    case "send_preview":
    case "send_payment_link": {
      if (!body) throw new Error("body is required");
      let finalBody = body;
      if (tool === "send_payment_link") {
        const link = env().STRIPE_PAYMENT_LINK_URL ?? `${env().APP_URL}/pay/${ctx.leadId}`;
        finalBody = `${body}\n\nPay here: ${link}`;
      } else if (tool === "send_preview") {
        finalBody = `${body}\n\nPreview: ${env().APP_URL}/preview/${ctx.leadId}`;
      }
      const html = textToHtml(finalBody);

      let providerMessageId: string | undefined;
      if (!ctx.draftOnly) {
        const client = ctx.emailClient ?? createEmailClient();
        const priorIds = (
          await ctx.db
            .select({ id: outreachMessages.providerMessageId })
            .from(outreachMessages)
            .where(and(eq(outreachMessages.threadId, ctx.threadId), eq(outreachMessages.direction, "outbound")))
        )
          .map((r) => r.id)
          .filter((x): x is string => !!x);
        const inReplyTo = inbound?.messageId ?? undefined;
        const references = inReplyTo ? [...priorIds, inReplyTo] : priorIds;
        const sent = await client.send({
          to: lead.email,
          from: fromAddress(),
          replyTo: plusAddress(ctx.leadId),
          subject,
          text: finalBody,
          html,
          headers: buildThreadingHeaders({ inReplyTo, references }),
          idempotencyKey: `reply:${ctx.inboundEmailId}`,
        });
        providerMessageId = sent.messageId;
      }

      const [msg] = await ctx.db
        .insert(outreachMessages)
        .values({
          threadId: ctx.threadId,
          leadId: ctx.leadId,
          direction: "outbound",
          source: "reply_agent",
          subject,
          bodyText: finalBody,
          bodyHtml: html,
          providerMessageId: providerMessageId ?? null,
          status,
          agentActionId: ctx.agentActionId ?? null,
          inReplyTo: ctx.inboundEmailId,
        })
        .returning();

      if (!ctx.draftOnly) {
        await ctx.db
          .update(threads)
          .set({ lastMessageAt: new Date() })
          .where(eq(threads.id, ctx.threadId));
        await ctx.db
          .update(leads)
          .set({ status: tool === "send_payment_link" ? "interested" : "replied", lastTouchAt: new Date() })
          .where(eq(leads.id, ctx.leadId));
      }

      return { tool, messageId: msg!.id, providerMessageId, status };
    }
    case "mark_not_interested": {
      await ctx.db
        .update(leads)
        .set({ status: "not_interested", lastTouchAt: new Date() })
        .where(eq(leads.id, ctx.leadId));
      if (lead.email) {
        await ctx.db
          .insert(suppressions)
          .values({ email: lead.email, reason: "not_interested", leadId: ctx.leadId })
          .onConflictDoNothing();
      }
      return { tool, status: "marked_not_interested" };
    }
    case "escalate_to_human": {
      await ctx.db
        .update(threads)
        .set({ agentPaused: true })
        .where(eq(threads.id, ctx.threadId));
      return { tool, status: "escalated" };
    }
    default:
      throw new Error(`Unknown tool: ${tool satisfies never}`);
  }
}
