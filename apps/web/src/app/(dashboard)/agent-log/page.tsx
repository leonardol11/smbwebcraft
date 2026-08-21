import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LogTable } from "@/components/agent-log/log-table";
import { QueuePanel } from "@/components/agent-log/queue-panel";
import { formatCost, formatDuration } from "@/components/agent-log/format";
import { runSampleEcho, runSampleFail } from "./actions";
import { getAgentStats, getLogEntries, getQueueStats, type LogKind } from "./data";

export const dynamic = "force-dynamic";

function buildHref(kind: LogKind, errorsOnly: boolean): string {
  const params = new URLSearchParams();
  if (kind !== "all") params.set("kind", kind);
  if (errorsOnly) params.set("errors", "1");
  const qs = params.toString();
  return qs ? `/agent-log?${qs}` : "/agent-log";
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? "bg-primary text-primary-foreground" : "border hover:bg-muted"
      }`}
    >
      {children}
    </Link>
  );
}

export default async function AgentLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const errorsOnly = sp.errors === "1";
  const kind: LogKind = sp.kind === "actions" || sp.kind === "jobs" ? sp.kind : "all";

  const [entries, agentStats, queueStats] = await Promise.all([
    getLogEntries({ errorsOnly, kind }),
    getAgentStats(),
    getQueueStats(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Agent Log</h1>
        <div className="flex items-center gap-2">
          <form action={runSampleEcho}>
            <Button size="sm" variant="outline" type="submit">
              Run sample job
            </Button>
          </form>
          <form action={runSampleFail}>
            <Button size="sm" variant="outline" type="submit">
              Run failing job
            </Button>
          </form>
        </div>
      </div>

      <QueuePanel stats={queueStats} />

      {agentStats.length > 0 && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
          {agentStats.map((s) => (
            <Card key={s.agent}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">{s.agent}</span>
                  <span className="text-[11px] text-muted-foreground">{s.runs} runs</span>
                </div>
                <div className="mt-1 flex items-baseline justify-between text-xs tabular-nums">
                  <span>{formatCost(s.totalCostMicroUsd)}</span>
                  <span className="text-muted-foreground">
                    avg {formatDuration(s.avgDurationMs)}
                  </span>
                </div>
                <div
                  className={`mt-0.5 text-[11px] ${
                    s.errors > 0 ? "text-destructive" : "text-muted-foreground"
                  }`}
                >
                  {s.errors} error{s.errors === 1 ? "" : "s"} · 24h
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <FilterLink href={buildHref("all", errorsOnly)} active={kind === "all"}>
          All
        </FilterLink>
        <FilterLink href={buildHref("actions", errorsOnly)} active={kind === "actions"}>
          Agent actions
        </FilterLink>
        <FilterLink href={buildHref("jobs", errorsOnly)} active={kind === "jobs"}>
          Job runs
        </FilterLink>
        <div className="mx-1 h-4 w-px bg-border" />
        <FilterLink href={buildHref(kind, !errorsOnly)} active={errorsOnly}>
          Errors only
        </FilterLink>
        <span className="ml-auto text-xs text-muted-foreground">
          {entries.length} entr{entries.length === 1 ? "y" : "ies"}
        </span>
      </div>

      <LogTable entries={entries} />
    </div>
  );
}
