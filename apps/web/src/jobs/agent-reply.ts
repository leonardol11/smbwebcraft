import { runReplyAgent } from "@outreach/agents/reply";
import { defineJob } from "./core";

/**
 * Runs the Claude reply agent for one matched inbound email. All gating
 * (kill switches → draft, thread Take-over, suppression, one-reply-per-inbound,
 * per-lead daily cap) lives in runReplyAgent.
 */
defineJob("agent.reply", async (input: { inboundEmailId: string }, { db }) => {
  const result = await runReplyAgent(db, { inboundEmailId: input.inboundEmailId });
  return result;
});
