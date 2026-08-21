import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, inArray, sql } from "drizzle-orm";
import { campaigns, campaignZips, getDb, leads, markets } from "@outreach/db";
import { cn } from "@/lib/utils";
import { labelForCategory } from "@/lib/categories";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CampaignForm } from "@/components/cities/campaign-form";
import { CampaignCreateModal } from "@/components/cities/campaign-create-modal";
import { CampaignStatusButton } from "@/components/cities/campaign-status-button";
import { LeadsTab } from "@/components/leads/leads-tab";
import { CityThreadsTab } from "@/components/inbox/city-threads-tab";
import { CityClientsTab } from "@/components/clients/city-clients-tab";
import { DiscoveryButton } from "@/components/cities/discovery-button";

export const dynamic = "force-dynamic";

const TABS = ["campaigns", "leads", "threads", "clients"] as const;
type Tab = (typeof TABS)[number];

export default async function CityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "campaigns";

  const db = await getDb();
  const [market] = await db.select().from(markets).where(eq(markets.slug, slug));
  if (!market) notFound();

  const cityCampaigns = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.marketId, market.id));
  const zips = cityCampaigns.length
    ? await db
        .select()
        .from(campaignZips)
        .where(
          inArray(
            campaignZips.campaignId,
            cityCampaigns.map((c) => c.id),
          ),
        )
    : [];
  const zipLeadCounts = await db
    .select({ zip: leads.zip, count: sql<number>`count(*)::int` })
    .from(leads)
    .where(eq(leads.marketId, market.id))
    .groupBy(leads.zip);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Link href="/cities" className="text-sm text-muted-foreground hover:text-foreground">
          Cities
        </Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-lg font-semibold">
          {market.city}, {market.state}
        </h1>
      </div>

      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/cities/${slug}?tab=${t}`}
            className={cn(
              "border-b-2 px-3 py-2 text-sm capitalize",
              tab === t
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
          </Link>
        ))}
      </div>

      {tab === "campaigns" && (
        <div className="flex flex-col gap-4">
          {cityCampaigns.map((c) => {
            const cZips = zips.filter((z) => z.campaignId === c.id);
            return (
              <Card key={c.id}>
                <CardHeader className="flex-row items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{c.name}</CardTitle>
                    <Badge
                      variant={
                        c.status === "running"
                          ? "success"
                          : c.status === "paused"
                            ? "warning"
                            : "muted"
                      }
                    >
                      {c.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      cap {c.dailyCap}/day ·{" "}
                      {(c.categories ?? []).map(labelForCategory).join(", ") || "all categories"}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <DiscoveryButton campaignId={c.id} slug={slug} />
                    <CampaignStatusButton campaignId={c.id} status={c.status} slug={slug} />
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <THead>
                      <TR>
                        <TH>ZIP</TH>
                        <TH>Leads discovered</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {cZips.map((z) => (
                        <TR key={z.id}>
                          <TD className="font-mono">{z.zip}</TD>
                          <TD>{zipLeadCounts.find((r) => r.zip === z.zip)?.count ?? 0}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })}
          <CampaignCreateModal>
            <CampaignForm marketId={market.id} slug={slug} />
          </CampaignCreateModal>
        </div>
      )}

      {tab === "leads" && <LeadsTab market={market} searchParams={sp} />}
      {tab === "threads" && <CityThreadsTab marketId={market.id} slug={slug} />}
      {tab === "clients" && <CityClientsTab marketId={market.id} slug={slug} />}
    </div>
  );
}
