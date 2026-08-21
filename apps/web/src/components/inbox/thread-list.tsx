import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn, timeAgo } from "@/lib/utils";
import { inboxHref, type ThreadListRow } from "@/lib/inbox";

function leadStatusVariant(status: string | null) {
  switch (status) {
    case "interested":
    case "customer":
      return "success" as const;
    case "replied":
      return "default" as const;
    case "not_interested":
    case "suppressed":
      return "destructive" as const;
    default:
      return "muted" as const;
  }
}

export function ThreadList({
  rows,
  searchParams,
  selectedId,
}: {
  rows: ThreadListRow[];
  searchParams: Record<string, string | undefined>;
  selectedId?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">No threads match.</div>
    );
  }
  return (
    <ul className="divide-y" data-testid="thread-list">
      {rows.map((r) => {
        const active = r.id === selectedId;
        return (
          <li key={r.id}>
            <Link
              href={inboxHref(searchParams, { thread: r.id, q: null })}
              className={cn(
                "flex flex-col gap-1 px-3 py-2.5 text-sm transition-colors hover:bg-muted/40",
                active && "bg-muted/60",
              )}
              data-testid={`thread-row-${r.id}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">
                  {r.businessName ?? r.fromEmail ?? "Unknown sender"}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {r.lastMessageAt ? timeAgo(r.lastMessageAt) : "—"}
                </span>
              </div>
              <div className="truncate text-xs text-muted-foreground">{r.subject ?? "(no subject)"}</div>
              <div className="flex flex-wrap items-center gap-1">
                {r.status === "unmatched" ? (
                  <Badge variant="warning">unmatched</Badge>
                ) : (
                  r.leadStatus && <Badge variant={leadStatusVariant(r.leadStatus)}>{r.leadStatus}</Badge>
                )}
                {r.status === "closed" && <Badge variant="outline">closed</Badge>}
                {r.agentPaused && <Badge variant="warning">Human</Badge>}
                {r.escalated && !r.agentPaused && <Badge variant="warning">Escalated</Badge>}
                {r.draftCount > 0 && <Badge variant="default">Draft{r.draftCount > 1 ? ` ×${r.draftCount}` : ""}</Badge>}
                {r.city && <span className="text-[11px] text-muted-foreground">{r.city}</span>}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
