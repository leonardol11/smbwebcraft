import type { AgentActionStatus, AgentName } from "@outreach/db";
import type { Db } from "@outreach/db";
import { agentActions } from "@outreach/db";

export type LogAgentActionInput = {
  agent: AgentName;
  action: string;
  intent?: string;
  detail?: string;
  status?: AgentActionStatus;
  leadId?: string;
  threadId?: string;
  marketId?: string;
  input?: unknown;
  output?: unknown;
  errorStack?: string;
  tokensIn?: number;
  tokensOut?: number;
  costMicroUsd?: number;
  durationMs?: number;
};

export async function logAgentAction(db: Db, data: LogAgentActionInput): Promise<string> {
  const [row] = await db
    .insert(agentActions)
    .values({
      agent: data.agent,
      action: data.action,
      intent: data.intent ?? null,
      detail: data.detail ?? null,
      status: data.status ?? "ok",
      leadId: data.leadId ?? null,
      threadId: data.threadId ?? null,
      marketId: data.marketId ?? null,
      input: data.input ?? null,
      output: data.output ?? null,
      errorStack: data.errorStack ?? null,
      tokensIn: data.tokensIn ?? null,
      tokensOut: data.tokensOut ?? null,
      costMicroUsd: data.costMicroUsd ?? null,
      durationMs: data.durationMs ?? null,
    })
    .returning({ id: agentActions.id });
  return row!.id;
}
