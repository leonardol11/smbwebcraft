import Link from "next/link";
import { eq } from "drizzle-orm";
import { clientSites, deals, getDb, leads } from "@outreach/db";
import { formatMoney } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export async function CityClientsTab({ marketId, slug }: { marketId: string; slug?: string }) {
  const db = await getDb();
  const rows = await db
    .select({
      deal: deals,
      lead: leads,
      site: clientSites,
    })
    .from(deals)
    .innerJoin(leads, eq(deals.leadId, leads.id))
    .leftJoin(clientSites, eq(clientSites.dealId, deals.id))
    .where(eq(leads.marketId, marketId));

  const paid = rows.filter((r) =>
    (["paid", "past_due", "suspended"] as const).includes(r.deal.status as never),
  );

  return (
    <Table>
      <THead>
        <TR>
          <TH>Business</TH>
          <TH>Status</TH>
          <TH>MRR</TH>
          <TH>Site</TH>
          <TH>Deploy</TH>
        </TR>
      </THead>
      <TBody>
        {paid.map((r) => (
          <TR key={r.deal.id}>
            <TD className="font-medium">{r.lead.businessName}</TD>
            <TD>
              <Badge variant={r.deal.status === "paid" ? "success" : "warning"}>
                {r.deal.status}
              </Badge>
            </TD>
            <TD>{formatMoney(r.deal.mrrCents)}</TD>
            <TD className="text-xs">
              {r.site?.liveUrl ? (
                <a href={r.site.liveUrl} target="_blank" rel="noreferrer" className="text-primary">
                  {r.site.liveUrl}
                </a>
              ) : (
                "—"
              )}
            </TD>
            <TD>
              <Badge variant="muted">{r.site?.deployStatus ?? "none"}</Badge>
            </TD>
          </TR>
        ))}
        {paid.length === 0 && (
          <TR>
            <TD colSpan={5} className="py-8 text-center text-muted-foreground">
              No paid clients in this city yet.{" "}
              <Link href={slug ? `/clients?market=${encodeURIComponent(slug)}` : "/clients"} className="text-primary">
                View all
              </Link>
            </TD>
          </TR>
        )}
      </TBody>
    </Table>
  );
}
