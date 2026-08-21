import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FUNNEL_STAGES, type FunnelStats } from "@/lib/stats";

const LABELS: Record<(typeof FUNNEL_STAGES)[number], string> = {
  discovered: "Discovered",
  qualified: "Qualified",
  emailed: "Emailed",
  replied: "Replied",
  paid: "Paid",
  live: "Live",
};

const BAR_COLORS = [
  "bg-primary/30",
  "bg-primary/45",
  "bg-primary/60",
  "bg-primary/75",
  "bg-success/70",
  "bg-success",
];

export function FunnelBar({ funnel }: { funnel: FunnelStats }) {
  const max = Math.max(...FUNNEL_STAGES.map((k) => funnel[k]), 1);
  return (
    <Card>
      <CardHeader className="p-3">
        <CardTitle>Funnel</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex h-2 overflow-hidden rounded-full bg-muted">
          {FUNNEL_STAGES.map((key, i) => (
            <div
              key={key}
              className={BAR_COLORS[i]}
              style={{ flexGrow: funnel[key] || 0.0001, flexBasis: 0 }}
              title={`${LABELS[key]}: ${funnel[key]}`}
            />
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {FUNNEL_STAGES.map((key, i) => {
            const count = funnel[key];
            const pct = Math.round((count / max) * 100);
            return (
              <div key={key} className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${BAR_COLORS[i]}`} />
                  <span className="truncate text-[11px] text-muted-foreground">{LABELS[key]}</span>
                </div>
                <div className="mt-0.5 text-sm font-semibold tabular-nums">{count}</div>
                <div className="text-[10px] text-muted-foreground">{pct}% of max</div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
