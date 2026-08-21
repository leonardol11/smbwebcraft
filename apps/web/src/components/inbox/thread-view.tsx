import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ThreadDetail, TranscriptItem } from "@/lib/inbox";
import { AssignLeadForm } from "./assign-lead-form";
import { DraftActions } from "./draft-actions";
import { ReplyComposer } from "./reply-composer";
import { ThreadActions } from "./thread-actions";

function statusVariant(item: TranscriptItem) {
  if (item.kind === "inbound") return "muted" as const;
  switch (item.status) {
    case "draft":
      return "warning" as const;
    case "bounced":
    case "complained":
      return "destructive" as const;
    case "delivered":
    case "opened":
      return "success" as const;
    default:
      return "muted" as const;
  }
}

function Message({ item }: { item: TranscriptItem }) {
  const isDraft = item.kind === "outbound" && item.status === "draft";
  const inbound = item.kind === "inbound";
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-lg border p-3 text-sm",
        inbound ? "mr-8 bg-card" : "ml-8 bg-muted/30",
        isDraft && "border-dashed border-warning/60 bg-warning/5",
      )}
      data-testid={`message-${item.id}`}
    >
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">{inbound ? "Inbound" : "Outbound"}</span>
        <span>·</span>
        <span>{inbound ? (item.fromEmail ?? "unknown sender") : item.source}</span>
        <Badge variant={statusVariant(item)}>{isDraft ? "draft" : item.status}</Badge>
        <span className="ml-auto">{item.createdAt.toLocaleString()}</span>
      </div>
      {item.subject && <div className="text-xs font-medium">{item.subject}</div>}
      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
        {item.bodyText ?? <span className="italic text-muted-foreground">(no text body)</span>}
      </pre>
      {isDraft && <DraftActions messageId={item.id} />}
    </div>
  );
}

export function ThreadView({
  detail,
  sendingPaused,
  searchParams,
  leadSearchResults,
}: {
  detail: ThreadDetail;
  sendingPaused: boolean;
  searchParams: Record<string, string | undefined>;
  leadSearchResults: { id: string; businessName: string; email: string | null; city: string | null }[];
}) {
  const { thread, lead, transcript } = detail;
  return (
    <div className="flex h-full flex-col gap-4" data-testid="thread-view">
      <div className="flex flex-col gap-2 border-b pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">
              {lead ? (
                <Link href={`/leads/${lead.id}`} className="hover:underline">
                  {lead.businessName}
                </Link>
              ) : (
                "Unmatched thread"
              )}
            </h2>
            <div className="truncate text-xs text-muted-foreground">
              {thread.subject ?? "(no subject)"}
              {lead?.email ? ` · ${lead.email}` : ""}
              {lead?.city ? ` · ${lead.city}` : ""}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {lead && <Badge variant="outline">{lead.status}</Badge>}
            <Badge variant={thread.status === "active" ? "success" : "muted"}>{thread.status}</Badge>
            {thread.agentPaused && <Badge variant="warning">Human</Badge>}
          </div>
        </div>
        <ThreadActions
          threadId={thread.id}
          leadId={lead?.id ?? null}
          agentPaused={thread.agentPaused}
          status={thread.status}
          leadStatus={lead?.status ?? null}
        />
      </div>

      {thread.status === "unmatched" && (
        <AssignLeadForm threadId={thread.id} searchParams={searchParams} results={leadSearchResults} />
      )}

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
        {transcript.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">No messages yet.</div>
        )}
        {transcript.map((item) => (
          <Message key={`${item.kind}-${item.id}`} item={item} />
        ))}
      </div>

      <div className="border-t pt-3">
        <ReplyComposer threadId={thread.id} sendingPaused={sendingPaused} disabled={!lead?.email} />
      </div>
    </div>
  );
}
