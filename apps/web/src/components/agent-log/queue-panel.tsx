"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { retryLatestFailed } from "@/app/(dashboard)/agent-log/actions";
import type { QueueStat } from "@/app/(dashboard)/agent-log/data";

function RetryFailedButton({ name }: { name: string }) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await retryLatestFailed(name);
          router.refresh();
        })
      }
    >
      {isPending ? "Retrying…" : "Retry failed"}
    </Button>
  );
}

export function QueuePanel({ stats }: { stats: QueueStat[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Job queue</CardTitle>
      </CardHeader>
      <CardContent>
        {stats.length === 0 ? (
          <p className="text-sm text-muted-foreground">No jobs have run yet.</p>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Worker</TH>
                <TH className="text-right">Pending</TH>
                <TH className="text-right">Running</TH>
                <TH className="text-right">Failed</TH>
                <TH className="text-right">Completed</TH>
                <TH className="w-28" />
              </tr>
            </THead>
            <TBody>
              {stats.map((s) => (
                <TR key={s.name}>
                  <TD className="text-xs font-medium">{s.name}</TD>
                  <TD className="text-right text-xs tabular-nums">{s.pending}</TD>
                  <TD className="text-right text-xs tabular-nums">
                    {s.running > 0 ? <Badge variant="warning">{s.running}</Badge> : 0}
                  </TD>
                  <TD className="text-right text-xs tabular-nums">
                    {s.failed > 0 ? <Badge variant="destructive">{s.failed}</Badge> : 0}
                  </TD>
                  <TD className="text-right text-xs tabular-nums">{s.completed}</TD>
                  <TD className="text-right">
                    {s.failed > 0 && <RetryFailedButton name={s.name} />}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          Queue depth is held by the job provider; a run appears here once it starts executing.
        </p>
      </CardContent>
    </Card>
  );
}
