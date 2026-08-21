import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActivityFeedItem } from "@/app/(dashboard)/overview/data";

function statusVariant(status: string): "success" | "destructive" | "warning" | "muted" {
  if (status === "error") return "destructive";
  if (status === "escalated") return "warning";
  if (status === "draft") return "muted";
  return "success";
}

function FeedRow({ item }: { item: ActivityFeedItem }) {
  const inner = (
    <div className="flex items-baseline gap-2 py-1.5 text-xs">
      <span className="w-10 shrink-0 font-mono tabular-nums text-muted-foreground">{item.time}</span>
      {item.cityTag && (
        <Badge variant="outline" className="shrink-0">
          {item.cityTag}
        </Badge>
      )}
      <span className="min-w-0 flex-1 truncate">{item.summary}</span>
      {item.status !== "ok" && (
        <Badge variant={statusVariant(item.status)} className="shrink-0">
          {item.status}
        </Badge>
      )}
    </div>
  );

  if (!item.href) {
    return <div className="border-b last:border-0">{inner}</div>;
  }

  return (
    <Link
      href={item.href}
      className="block border-b last:border-0 hover:bg-muted/40"
    >
      {inner}
    </Link>
  );
}

export function ActivityFeed({ items }: { items: ActivityFeedItem[] }) {
  return (
    <Card className="flex h-full max-h-[24rem] min-h-0 flex-col lg:max-h-none">
      <CardHeader className="flex-row items-center justify-between p-3">
        <CardTitle>Live agent activity</CardTitle>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
          polling 5s
        </span>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-auto pt-0">
        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No agent actions yet. Activity shows up here within about 5 seconds.
          </p>
        ) : (
          <div>
            {items.map((item) => (
              <FeedRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
