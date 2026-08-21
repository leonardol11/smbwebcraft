import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { timeAgo } from "@/lib/utils";
import type { LeadTimelineItem } from "./query";

type LeadSummary = {
  businessName: string;
  status: string;
  city: string | null;
  state: string | null;
  zip: string;
  email: string | null;
  phone: string | null;
  websiteUrl: string | null;
  qualificationReason: string | null;
};

type ThreadSummary = {
  id: string;
  subject: string | null;
};

export function LeadTimeline({
  lead,
  timeline,
  threads = [],
}: {
  lead: LeadSummary;
  timeline: LeadTimelineItem[];
  threads?: ThreadSummary[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="muted">{lead.status}</Badge>
          <span>
            {[lead.city, lead.state].filter(Boolean).join(", ")} {lead.zip}
          </span>
          {lead.email && <span>{lead.email}</span>}
          {lead.phone && <span>{lead.phone}</span>}
          {lead.websiteUrl && <span className="truncate">{lead.websiteUrl}</span>}
        </div>
        {lead.qualificationReason && (
          <p className="mt-2 text-xs text-muted-foreground">
            Qualification: {lead.qualificationReason}
          </p>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Timeline</h3>
        <div className="flex flex-col gap-2">
          {timeline.map((item) => (
            <div key={`${item.kind}-${item.id}`} className="rounded border p-2 text-xs">
              <div className="flex justify-between gap-2">
                <span className="font-medium">{item.label}</span>
                <span className="shrink-0 text-muted-foreground">{timeAgo(item.at)}</span>
              </div>
              {item.detail && <p className="mt-1 text-muted-foreground">{item.detail}</p>}
            </div>
          ))}
          {timeline.length === 0 && (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          )}
        </div>
      </div>

      {threads.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Threads</h3>
          {threads.map((t) => (
            <Link
              key={t.id}
              href={`/inbox?thread=${t.id}`}
              className="block text-sm text-primary hover:underline"
            >
              {t.subject ?? t.id}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
