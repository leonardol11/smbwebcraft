import Link from "next/link";
import { getDb } from "@outreach/db";
import { LeadFilters } from "./lead-filters";
import { LeadsTable } from "./leads-table";
import { LeadDrawer } from "./lead-drawer";
import { LeadTimeline } from "./lead-timeline";
import {
  listLeads,
  loadLeadDetail,
  parseLeadFilters,
  parsePage,
  leadsHref,
} from "./query";

export async function LeadsTab({
  market,
  searchParams,
}: {
  market: { id: string; slug: string };
  searchParams: Record<string, string | undefined>;
}) {
  const db = await getDb();
  const filters = parseLeadFilters(searchParams);
  const page = parsePage(searchParams);
  const { rows, total, totalPages } = await listLeads(db, {
    marketId: market.id,
    filters,
    page,
  });

  const selectedLeadId = searchParams.lead;
  const detail =
    selectedLeadId && selectedLeadId.length > 0
      ? await loadLeadDetail(db, selectedLeadId)
      : null;
  const drawerLead = detail?.lead.marketId === market.id ? detail : null;

  const tableRows = rows.map((r) => ({
    id: r.id,
    businessName: r.businessName,
    zip: r.zip,
    email: r.email,
    status: r.status,
    category: r.category,
    lastTouchAt: r.lastTouchAt ? r.lastTouchAt.toISOString() : null,
  }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <LeadFilters slug={market.slug} searchParams={searchParams} />
        <span className="text-xs text-muted-foreground">
          {total.toLocaleString()} leads · page {page}/{totalPages}
        </span>
      </div>
      <LeadsTable rows={tableRows} slug={market.slug} searchParams={searchParams} />
      {totalPages > 1 && (
        <div className="flex gap-2">
          {page > 1 && (
            <Link
              href={leadsHref(market.slug, searchParams, { page: String(page - 1) })}
              className="text-xs text-primary"
            >
              ← Prev
            </Link>
          )}
          {page < totalPages && (
            <Link
              href={leadsHref(market.slug, searchParams, { page: String(page + 1) })}
              className="text-xs text-primary"
            >
              Next →
            </Link>
          )}
        </div>
      )}
      {drawerLead && (
        <LeadDrawer
          title={drawerLead.lead.businessName}
          closeHref={leadsHref(market.slug, searchParams, { lead: null })}
        >
          <LeadTimeline
            lead={drawerLead.lead}
            timeline={drawerLead.timeline}
            threads={drawerLead.threads}
          />
        </LeadDrawer>
      )}
    </div>
  );
}
