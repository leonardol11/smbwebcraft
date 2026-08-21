import { agentActions, desc, eq, getDb, gte, jobRuns, sql } from "@outreach/db";
import { formatTokens, toPrettyJson } from "@/components/agent-log/format";

export type LogKind = "all" | "actions" | "jobs";

export type LogEntry = {
  id: string;
  kind: "action" | "job";
  at: string;
  agent: string;
  name: string;
  detail: string | null;
  leadId: string | null;
  status: string;
  isError: boolean;
  durationMs: number | null;
  costMicroUsd: number | null;
  tokens: string | null;
  input: string | null;
  output: string | null;
  errorStack: string | null;
  canRetry: boolean;
};

const PAGE_SIZE = 200;

export async function getLogEntries(opts: {
  errorsOnly: boolean;
  kind: LogKind;
}): Promise<LogEntry[]> {
  const db = await getDb();
  const entries: LogEntry[] = [];

  if (opts.kind !== "jobs") {
    const rows = await db
      .select()
      .from(agentActions)
      .where(opts.errorsOnly ? eq(agentActions.status, "error") : undefined)
      .orderBy(desc(agentActions.createdAt))
      .limit(PAGE_SIZE);
    for (const row of rows) {
      entries.push({
        id: row.id,
        kind: "action",
        at: row.createdAt.toISOString(),
        agent: row.agent,
        name: row.action,
        detail: row.detail ?? row.intent,
        leadId: row.leadId,
        status: row.status,
        isError: row.status === "error",
        durationMs: row.durationMs,
        costMicroUsd: row.costMicroUsd,
        tokens: formatTokens(row.tokensIn, row.tokensOut),
        input: toPrettyJson(row.input),
        output: toPrettyJson(row.output),
        errorStack: row.errorStack,
        canRetry: false,
      });
    }
  }

  if (opts.kind !== "actions") {
    const rows = await db
      .select()
      .from(jobRuns)
      .where(opts.errorsOnly ? eq(jobRuns.status, "failed") : undefined)
      .orderBy(desc(jobRuns.startedAt))
      .limit(PAGE_SIZE);
    for (const row of rows) {
      entries.push({
        id: row.id,
        kind: "job",
        at: row.startedAt.toISOString(),
        agent: row.name.includes(".") ? row.name.split(".")[0]! : "system",
        name: row.name,
        detail: null,
        leadId: null,
        status: row.status,
        isError: row.status === "failed",
        durationMs: row.durationMs,
        costMicroUsd: null,
        tokens: null,
        input: toPrettyJson(row.input),
        output: null,
        errorStack: row.error,
        canRetry: row.status === "failed",
      });
    }
  }

  entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return entries.slice(0, PAGE_SIZE);
}

export type AgentStat = {
  agent: string;
  runs: number;
  errors: number;
  totalCostMicroUsd: number;
  avgDurationMs: number;
};

/** Per-agent totals over the last 24 hours. */
export async function getAgentStats(): Promise<AgentStat[]> {
  const db = await getDb();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      agent: agentActions.agent,
      runs: sql<number>`count(*)::int`,
      errors: sql<number>`count(*) filter (where ${agentActions.status} = 'error')::int`,
      totalCostMicroUsd: sql<number>`coalesce(sum(${agentActions.costMicroUsd}), 0)::int`,
      avgDurationMs: sql<number>`coalesce(avg(${agentActions.durationMs}), 0)::int`,
    })
    .from(agentActions)
    .where(gte(agentActions.createdAt, since))
    .groupBy(agentActions.agent)
    .orderBy(agentActions.agent);
  return rows;
}

export type QueueStat = {
  name: string;
  pending: number;
  running: number;
  failed: number;
  completed: number;
};

export async function getQueueStats(): Promise<QueueStat[]> {
  const db = await getDb();
  const rows = await db
    .select({
      name: jobRuns.name,
      status: jobRuns.status,
      count: sql<number>`count(*)::int`,
    })
    .from(jobRuns)
    .groupBy(jobRuns.name, jobRuns.status);

  const byName = new Map<string, QueueStat>();
  for (const row of rows) {
    const stat = byName.get(row.name) ?? {
      name: row.name,
      // Queue depth lives in the job provider (Inngest); a run only gets a
      // job_runs row once it starts executing, so pending is always 0 here.
      pending: 0,
      running: 0,
      failed: 0,
      completed: 0,
    };
    if (row.status === "running") stat.running += row.count;
    else if (row.status === "failed") stat.failed += row.count;
    else stat.completed += row.count;
    byName.set(row.name, stat);
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}
