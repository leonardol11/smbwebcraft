"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { retryJobRun } from "@/app/(dashboard)/agent-log/actions";
import type { LogEntry } from "@/app/(dashboard)/agent-log/data";
import { formatCost, formatDuration } from "./format";

function statusBadge(entry: LogEntry) {
  if (entry.isError) return <Badge variant="destructive">{entry.status}</Badge>;
  if (entry.status === "running") return <Badge variant="warning">running</Badge>;
  if (entry.status === "escalated") return <Badge variant="warning">escalated</Badge>;
  if (entry.status === "draft") return <Badge variant="muted">draft</Badge>;
  return <Badge variant="success">{entry.status}</Badge>;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function Payload({ label, value, error }: { label: string; value: string; error?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
      <pre
        className={`max-h-64 overflow-auto rounded-md border bg-muted/30 p-2 text-xs whitespace-pre-wrap ${
          error ? "text-destructive" : ""
        }`}
      >
        {value}
      </pre>
    </div>
  );
}

function ExpandedRow({ entry }: { entry: LogEntry }) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  return (
    <TD colSpan={8} className="bg-muted/20">
      <div className="flex flex-col gap-3 py-1">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {entry.input && <Payload label="Input" value={entry.input} />}
          {entry.output && <Payload label="Output" value={entry.output} />}
          {entry.errorStack && (
            <Payload label="Stack trace" value={entry.errorStack} error />
          )}
          {!entry.input && !entry.output && !entry.errorStack && (
            <div className="text-xs text-muted-foreground">No payload recorded.</div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {entry.canRetry && (
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={(e) => {
                e.stopPropagation();
                startTransition(async () => {
                  await retryJobRun(entry.id);
                  router.refresh();
                });
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {isPending ? "Retrying…" : "Retry job"}
            </Button>
          )}
          <span className="text-[11px] text-muted-foreground">
            id: {entry.id}
            {entry.leadId ? ` · lead: ${entry.leadId}` : ""}
          </span>
        </div>
      </div>
    </TD>
  );
}

export function LogTable({ entries }: { entries: LogEntry[] }) {
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
        No log entries match the current filter.
      </div>
    );
  }

  return (
    <Table>
      <THead>
        <tr>
          <TH className="w-6" />
          <TH>Time</TH>
          <TH>Type</TH>
          <TH>Agent</TH>
          <TH>Action / job</TH>
          <TH>Status</TH>
          <TH className="text-right">Duration</TH>
          <TH className="text-right">Tokens · cost</TH>
        </tr>
      </THead>
      <TBody>
        {entries.map((entry) => {
          const expanded = expandedId === entry.id;
          return (
            <React.Fragment key={`${entry.kind}-${entry.id}`}>
              <TR
                className="cursor-pointer"
                onClick={() => setExpandedId(expanded ? null : entry.id)}
              >
                <TD className="text-muted-foreground">
                  {expanded ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </TD>
                <TD
                  className="whitespace-nowrap text-xs text-muted-foreground"
                  suppressHydrationWarning
                >
                  {formatTime(entry.at)}
                </TD>
                <TD>
                  <Badge variant={entry.kind === "job" ? "outline" : "default"}>
                    {entry.kind}
                  </Badge>
                </TD>
                <TD className="text-xs">{entry.agent}</TD>
                <TD className="max-w-[28rem]">
                  <div className="truncate text-xs font-medium">{entry.name}</div>
                  {entry.detail && (
                    <div className="truncate text-[11px] text-muted-foreground">
                      {entry.detail}
                    </div>
                  )}
                </TD>
                <TD>{statusBadge(entry)}</TD>
                <TD className="text-right text-xs tabular-nums">
                  {formatDuration(entry.durationMs)}
                </TD>
                <TD className="text-right text-xs tabular-nums whitespace-nowrap">
                  {entry.tokens ?? "—"} · {formatCost(entry.costMicroUsd)}
                </TD>
              </TR>
              {expanded && (
                <TR>
                  <ExpandedRow entry={entry} />
                </TR>
              )}
            </React.Fragment>
          );
        })}
      </TBody>
    </Table>
  );
}
