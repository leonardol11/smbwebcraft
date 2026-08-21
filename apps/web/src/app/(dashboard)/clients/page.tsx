import Link from "next/link";
import { getDb, getSetting, markets } from "@outreach/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClientsTable } from "@/components/clients/clients-table";
import { computeClientStats, listClients } from "@/lib/clients";
import { cn, formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const market = sp.market?.trim() || undefined;
  const db = await getDb();
  const [rows, monthlyPriceCents, allMarkets] = await Promise.all([
    listClients(db, market),
    getSetting(db, "monthly_price_cents"),
    db.select({ slug: markets.slug, city: markets.city, state: markets.state }).from(markets),
  ]);
  const stats = computeClientStats(rows, monthlyPriceCents);

  const tiles = [
    { label: "Active customers", value: String(stats.activeCustomers) },
    { label: "MRR", value: formatMoney(stats.mrrCents) },
    { label: "Past due", value: String(stats.pastDue), warn: stats.pastDue > 0 },
    { label: "Suspended", value: String(stats.suspended), warn: stats.suspended > 0 },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Clients</h1>
        <div className="flex flex-wrap gap-1 text-xs">
          <Link
            href="/clients"
            className={cn("rounded-md border px-2 py-1", !market ? "bg-muted font-medium" : "hover:bg-muted/50")}
          >
            All cities
          </Link>
          {allMarkets.map((m) => (
            <Link
              key={m.slug}
              href={`/clients?market=${encodeURIComponent(m.slug)}`}
              className={cn(
                "rounded-md border px-2 py-1",
                market === m.slug ? "bg-muted font-medium" : "hover:bg-muted/50",
              )}
            >
              {m.city}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="client-stats">
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground">{t.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={cn("text-2xl font-semibold", t.warn && "text-warning")}>{t.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <ClientsTable rows={rows} />
    </div>
  );
}
