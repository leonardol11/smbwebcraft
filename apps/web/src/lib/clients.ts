import {
  and,
  clientSites,
  deals,
  desc,
  eq,
  leads,
  markets,
  or,
  sql,
  type DealStatus,
  type Db,
  type DeployStatus,
} from "@outreach/db";

export type ClientRow = {
  dealId: string;
  leadId: string;
  businessName: string;
  city: string | null;
  marketSlug: string | null;
  dealStatus: DealStatus;
  mrrCents: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  paidAt: Date | null;
  failedSince: Date | null;
  canceledAt: Date | null;
  siteSlug: string | null;
  previewUrl: string | null;
  liveUrl: string | null;
  deployStatus: DeployStatus | null;
  deployError: string | null;
  lastDeployedAt: Date | null;
};

/** Deal statuses that count as a customer relationship (shown on the Clients screen). */
export const CUSTOMER_DEAL_STATUSES: readonly DealStatus[] = [
  "paid",
  "past_due",
  "suspended",
  "canceled",
];

export async function listClients(db: Db, market?: string): Promise<ClientRow[]> {
  const conds = [
    sql`${deals.status} in ('paid', 'past_due', 'suspended', 'canceled')`,
  ];
  if (market) {
    conds.push(or(eq(markets.slug, market), sql`lower(${markets.city}) = lower(${market})`)!);
  }
  const rows = await db
    .select({
      dealId: deals.id,
      leadId: deals.leadId,
      businessName: leads.businessName,
      city: markets.city,
      marketSlug: markets.slug,
      dealStatus: deals.status,
      mrrCents: deals.mrrCents,
      stripeCustomerId: deals.stripeCustomerId,
      stripeSubscriptionId: deals.stripeSubscriptionId,
      paidAt: deals.paidAt,
      failedSince: deals.failedSince,
      canceledAt: deals.canceledAt,
      siteSlug: clientSites.slug,
      previewUrl: clientSites.previewUrl,
      liveUrl: clientSites.liveUrl,
      deployStatus: clientSites.deployStatus,
      deployError: clientSites.deployError,
      lastDeployedAt: clientSites.lastDeployedAt,
    })
    .from(deals)
    .innerJoin(leads, eq(deals.leadId, leads.id))
    .leftJoin(markets, eq(leads.marketId, markets.id))
    .leftJoin(clientSites, and(eq(clientSites.leadId, deals.leadId), eq(clientSites.isPreview, false)))
    .where(and(...conds))
    .orderBy(desc(deals.paidAt), desc(deals.createdAt));
  return rows;
}

export type ClientStats = {
  activeCustomers: number;
  mrrCents: number;
  pastDue: number;
  suspended: number;
};

/**
 * Pure stat computation. MRR = active (paid) deals × monthly price setting;
 * past-due deals are still billed so they count toward MRR too.
 */
export function computeClientStats(
  rows: Pick<ClientRow, "dealStatus">[],
  monthlyPriceCents: number,
): ClientStats {
  let active = 0;
  let pastDue = 0;
  let suspended = 0;
  for (const r of rows) {
    if (r.dealStatus === "paid") active++;
    else if (r.dealStatus === "past_due") pastDue++;
    else if (r.dealStatus === "suspended") suspended++;
  }
  return {
    activeCustomers: active,
    mrrCents: (active + pastDue) * monthlyPriceCents,
    pastDue,
    suspended,
  };
}

export function daysPastDue(failedSince: Date | string | null, now = new Date()): number | null {
  if (!failedSince) return null;
  const ms = now.getTime() - new Date(failedSince).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function dealStatusVariant(
  status: DealStatus,
): "success" | "warning" | "destructive" | "muted" {
  switch (status) {
    case "paid":
      return "success";
    case "past_due":
      return "warning";
    case "suspended":
    case "canceled":
      return "destructive";
    default:
      return "muted";
  }
}

export function stripeCustomerUrl(id: string): string {
  return `https://dashboard.stripe.com/customers/${encodeURIComponent(id)}`;
}
