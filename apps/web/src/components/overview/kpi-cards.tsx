import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/utils";
import type { OverviewKpis } from "@/lib/stats";
import { formatPercent } from "./format";

const CARDS: {
  label: string;
  value: (k: OverviewKpis) => string;
  hint: (k: OverviewKpis) => string;
}[] = [
  {
    label: "Emails sent today",
    value: (k) => String(k.emailsSentToday),
    hint: () => "outbound, this local day",
  },
  {
    label: "Reply rate (7d)",
    value: (k) => formatPercent(k.replyRate.rate),
    hint: (k) => `${k.replyRate.replied} / ${k.replyRate.emailed} unique leads`,
  },
  {
    label: "Deals closed (MTD)",
    value: (k) => String(k.dealsClosedMtd),
    hint: () => "paid this month",
  },
  {
    label: "MRR",
    value: (k) => formatMoney(k.mrrCents),
    hint: () => "paid + past due",
  },
];

export function KpiCards({ kpis }: { kpis: OverviewKpis }) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {CARDS.map((card) => (
        <Card key={card.label}>
          <CardContent className="p-3">
            <div className="text-[11px] font-medium text-muted-foreground">{card.label}</div>
            <div className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
              {card.value(kpis)}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{card.hint(kpis)}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
