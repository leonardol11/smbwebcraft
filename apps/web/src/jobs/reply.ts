import { eq } from "drizzle-orm";
import { getSetting, inboundEmails } from "@outreach/db";
import { matchInbound } from "@outreach/agents/reply";
import { defineJob } from "./core";
import { enqueueJob } from "./enqueue";

export const AGENT_REPLY_JOB = "agent.reply";

/**
 * Matcher + quote-strip. When the inbound matches a lead thread, the reply
 * agent is queued as a separate job (agent-reply.ts) after the configured
 * delay so a human can take over the thread first.
 */
defineJob("email.process_inbound", async (input: { inboundEmailId: string }, { db }) => {
  const [row] = await db
    .select()
    .from(inboundEmails)
    .where(eq(inboundEmails.id, input.inboundEmailId));
  if (!row) return { ok: false, reason: "not_found" };

  const match = await matchInbound(db, row);

  let agentQueued = false;
  if (match.matched && match.leadId && match.threadId) {
    const delaySeconds = await getSetting(db, "reply_delay_seconds");
    // Inline (fake mode) runs synchronously and records its own job_run;
    // live mode only hands the event to Inngest, so awaiting is cheap.
    await enqueueJob(AGENT_REPLY_JOB, { inboundEmailId: row.id }, { delaySeconds });
    agentQueued = true;
  }

  return {
    ok: true,
    matched: match.matched,
    leadId: match.leadId ?? null,
    threadId: match.threadId ?? null,
    matchMethod: match.matchMethod,
    agentQueued,
  };
});
