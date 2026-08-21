import Link from "next/link";
import { getDb } from "@outreach/db";
import { formatMoney } from "@/lib/utils";
import { getMarketStats } from "@/lib/market-stats";
import { createMarket } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Sparkline } from "@/components/cities/sparkline";

export const dynamic = "force-dynamic";

function campaignBadge(status: string) {
  if (status === "running") return <Badge variant="success">running</Badge>;
  if (status === "paused") return <Badge variant="warning">paused</Badge>;
  return <Badge variant="muted">draft</Badge>;
}

export default async function CitiesPage() {
  const db = await getDb();
  const stats = await getMarketStats(db);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Cities</h1>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {stats.map((s) => (
          <Link key={s.market.id} href={`/cities/${s.market.slug}`}>
            <Card className="transition-colors hover:border-primary/50">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-base">
                  {s.market.city}, {s.market.state}
                </CardTitle>
                <div className="flex gap-1">
                  {s.campaigns.length === 0 ? (
                    <Badge variant="muted">no campaigns</Badge>
                  ) : (
                    campaignBadge(
                      s.campaigns.some((c) => c.status === "running")
                        ? "running"
                        : s.campaigns.some((c) => c.status === "paused")
                          ? "paused"
                          : "draft",
                    )
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <div className="text-base font-semibold">{s.zipCount}</div>
                    <div className="text-muted-foreground">ZIPs</div>
                  </div>
                  <div>
                    <div className="text-base font-semibold">{s.leadCount}</div>
                    <div className="text-muted-foreground">Leads</div>
                  </div>
                  <div>
                    <div className="text-base font-semibold">{s.repliedCount}</div>
                    <div className="text-muted-foreground">Replies</div>
                  </div>
                  <div>
                    <div className="text-base font-semibold">{s.emailedCount}</div>
                    <div className="text-muted-foreground">Emailed</div>
                  </div>
                  <div>
                    <div className="text-base font-semibold">{s.paidCount}</div>
                    <div className="text-muted-foreground">Paid</div>
                  </div>
                  <div>
                    <div className="text-base font-semibold">{formatMoney(s.mrrCents)}</div>
                    <div className="text-muted-foreground">MRR</div>
                  </div>
                </div>
                <div className="mt-3">
                  <Sparkline data={s.sendsByDay} />
                  <div className="mt-1 text-center text-[10px] text-muted-foreground">
                    sends, last 14 days
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Add a city</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createMarket} className="flex items-end gap-2">
            <div className="flex-1">
              <Label>City</Label>
              <Input name="city" placeholder="Austin" required className="mt-1" />
            </div>
            <div className="w-20">
              <Label>State</Label>
              <Input name="state" placeholder="TX" maxLength={2} required className="mt-1" />
            </div>
            <Button type="submit">Add</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
