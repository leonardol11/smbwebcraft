import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AttentionItem, AttentionKind, NeedsAttention } from "@/app/(dashboard)/overview/data";

const KIND_LABEL: Record<AttentionKind, string> = {
  escalation: "Escalations",
  bounce_spike: "Bounce spike",
  unmatched_inbound: "Unmatched inbound",
  failed_deploy: "Failed deploys",
  failed_charge: "Failed charges",
};

const KIND_ORDER: AttentionKind[] = [
  "escalation",
  "bounce_spike",
  "unmatched_inbound",
  "failed_deploy",
  "failed_charge",
];

function kindVariant(kind: AttentionKind): "destructive" | "warning" {
  if (kind === "bounce_spike" || kind === "failed_charge" || kind === "failed_deploy") {
    return "destructive";
  }
  return "warning";
}

function Group({
  kind,
  count,
  items,
}: {
  kind: AttentionKind;
  count: number;
  items: AttentionItem[];
}) {
  if (count === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground">{KIND_LABEL[kind]}</span>
        <Badge variant={kindVariant(kind)}>{count}</Badge>
      </div>
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className="rounded-md border px-2 py-1.5 hover:bg-muted/40"
        >
          <div className="truncate text-xs font-medium">{item.title}</div>
          {item.subtitle && (
            <div className="truncate text-[11px] text-muted-foreground">{item.subtitle}</div>
          )}
        </Link>
      ))}
    </div>
  );
}

export function NeedsAttentionPanel({ data }: { data: NeedsAttention }) {
  const total = KIND_ORDER.reduce((sum, kind) => sum + data.counts[kind], 0);
  return (
    <Card className="flex h-full max-h-[24rem] min-h-0 flex-col lg:max-h-none">
      <CardHeader className="flex-row items-center justify-between p-3">
        <CardTitle>Needs attention</CardTitle>
        {total > 0 && <Badge variant="destructive">{total}</Badge>}
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto pt-0">
        {total === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">All clear.</p>
        ) : (
          KIND_ORDER.map((kind) => (
            <Group
              key={kind}
              kind={kind}
              count={data.counts[kind]}
              items={data.items.filter((i) => i.kind === kind)}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}
