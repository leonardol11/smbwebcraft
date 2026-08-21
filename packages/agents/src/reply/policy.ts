import { getSetting, type Db } from "@outreach/db";

export const PRICING = {
  setupCents: 10_000,
  monthlyCents: 2_500,
  setupDisplay: "$100",
  monthlyDisplay: "$25/month",
} as const;

export const POLICY_RULES = `
- Fixed pricing: $100 one-time setup + $25/month. Never offer discounts.
- Never invent facts about the business; only use provided lead data.
- Max one reply per inbound email.
- Respect daily reply cap per lead from settings.
`.trim();

export async function getReplyLimits(db: Db): Promise<{
  maxRepliesPerLeadPerDay: number;
  replyAgentPaused: boolean;
}> {
  const maxRepliesPerLeadPerDay = await getSetting(db, "max_agent_replies_per_lead_per_day");
  const replyAgentPaused = await getSetting(db, "reply_agent_paused");
  return { maxRepliesPerLeadPerDay, replyAgentPaused };
}
