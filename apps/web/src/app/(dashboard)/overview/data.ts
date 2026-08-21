import { desc, eq, sql } from "drizzle-orm";
import {
  agentActions,
  clientSites,
  deals,
  getDb,
  inboundEmails,
  leads,
  markets,
} from "@outreach/db";
import { computeDeliveryRates } from "@/lib/delivery-events";
import { formatActivitySummary, formatCityTag, formatFeedTime } from "@/components/overview/format";

export const FEED_LIMIT = 50;

/** Same 5% bounce ceiling the health pill will use in T28; this panel only surfaces it. */
export const BOUNCE_SPIKE_RATE = 0.05;

export type ActivityFeedItem = {
  id: string;
  at: string;
  time: string;
  cityTag: string | null;
  summary: string;
  href: string | null;
  agent: string;
  status: string;
};

export async function getActivityFeed(): Promise<ActivityFeedItem[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: agentActions.id,
      createdAt: agentActions.createdAt,
      agent: agentActions.agent,
      action: agentActions.action,
      intent: agentActions.intent,
      detail: agentActions.detail,
      status: agentActions.status,
      leadId: agentActions.leadId,
      threadId: agentActions.threadId,
      businessName: leads.businessName,
      zip: leads.zip,
      leadCity: leads.city,
      marketCity: markets.city,
    })
    .from(agentActions)
    .leftJoin(leads, eq(agentActions.leadId, leads.id))
    .leftJoin(markets, eq(leads.marketId, markets.id))
    .orderBy(desc(agentActions.createdAt))
    .limit(FEED_LIMIT);

  return rows.map((row) => {
    const city = row.leadCity ?? row.marketCity;
    return {
      id: row.id,
      at: row.createdAt.toISOString(),
      time: formatFeedTime(row.createdAt),
      cityTag: formatCityTag(city, row.zip),
      summary: formatActivitySummary({
        agent: row.agent,
        action: row.action,
        detail: row.detail,
        intent: row.intent,
        businessName: row.businessName,
      }),
      href: row.threadId
        ? `/inbox?thread=${row.threadId}`
        : row.leadId
          ? `/leads/${row.leadId}`
          : null,
      agent: row.agent,
      status: row.status,
    };
  });
}

export type AttentionKind =
  | "escalation"
  | "bounce_spike"
  | "unmatched_inbound"
  | "failed_deploy"
  | "failed_charge";

export type AttentionItem = {
  id: string;
  kind: AttentionKind;
  title: string;
  subtitle: string | null;
  href: string;
};

export type NeedsAttention = {
  items: AttentionItem[];
  counts: Record<AttentionKind, number>;
};

const EMPTY_COUNTS: Record<AttentionKind, number> = {
  escalation: 0,
  bounce_spike: 0,
  unmatched_inbound: 0,
  failed_deploy: 0,
  failed_charge: 0,
};

export async function getNeedsAttention(): Promise<NeedsAttention> {
  const db = await getDb();
  const items: AttentionItem[] = [];
  const counts = { ...EMPTY_COUNTS };

  const [escalations, unmatched, failedSites, failedCharges, rates] = await Promise.all([
    db
      .select({
        id: agentActions.id,
        createdAt: agentActions.createdAt,
        detail: agentActions.detail,
        intent: agentActions.intent,
        threadId: agentActions.threadId,
        leadId: agentActions.leadId,
        businessName: leads.businessName,
        city: leads.city,
      })
      .from(agentActions)
      .leftJoin(leads, eq(agentActions.leadId, leads.id))
      .where(eq(agentActions.status, "escalated"))
      .orderBy(desc(agentActions.createdAt))
      .limit(20),
    db
      .select({
        id: inboundEmails.id,
        fromEmail: inboundEmails.fromEmail,
        subject: inboundEmails.subject,
        createdAt: inboundEmails.createdAt,
      })
      .from(inboundEmails)
      .where(eq(inboundEmails.matchStatus, "unmatched"))
      .orderBy(desc(inboundEmails.createdAt))
      .limit(20),
    db
      .select({
        id: clientSites.id,
        slug: clientSites.slug,
        deployError: clientSites.deployError,
        businessName: leads.businessName,
        leadId: leads.id,
      })
      .from(clientSites)
      .leftJoin(leads, eq(clientSites.leadId, leads.id))
      .where(eq(clientSites.deployStatus, "failed"))
      .orderBy(desc(clientSites.updatedAt))
      .limit(20),
    db
      .select({
        id: deals.id,
        leadId: deals.leadId,
        failedSince: deals.failedSince,
        businessName: leads.businessName,
      })
      .from(deals)
      .leftJoin(leads, eq(deals.leadId, leads.id))
      .where(eq(deals.status, "past_due"))
      .orderBy(desc(deals.failedSince))
      .limit(20),
    computeDeliveryRates(db),
  ]);

  const [escalationTotal] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agentActions)
    .where(eq(agentActions.status, "escalated"));
  const [unmatchedTotal] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inboundEmails)
    .where(eq(inboundEmails.matchStatus, "unmatched"));
  const [failedDeployTotal] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(clientSites)
    .where(eq(clientSites.deployStatus, "failed"));
  const [failedChargeTotal] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(deals)
    .where(eq(deals.status, "past_due"));

  counts.escalation = escalationTotal?.count ?? escalations.length;
  counts.unmatched_inbound = unmatchedTotal?.count ?? unmatched.length;
  counts.failed_deploy = failedDeployTotal?.count ?? failedSites.length;
  counts.failed_charge = failedChargeTotal?.count ?? failedCharges.length;

  for (const row of escalations) {
    items.push({
      id: `esc-${row.id}`,
      kind: "escalation",
      title: row.businessName ?? "Unknown lead",
      subtitle: [row.city, row.intent ?? row.detail].filter(Boolean).join(" · ") || null,
      href: row.threadId ? `/inbox?thread=${row.threadId}` : row.leadId ? `/leads/${row.leadId}` : "/agent-log",
    });
  }

  if (rates.bounceRate > BOUNCE_SPIKE_RATE && rates.bounced > 0) {
    counts.bounce_spike = 1;
    items.push({
      id: "bounce-spike",
      kind: "bounce_spike",
      title: "Bounce rate spike",
      subtitle: `${(rates.bounceRate * 100).toFixed(1)}% bounce rate (${rates.bounced} bounced / ${rates.sent} sent)`,
      href: "/agent-log",
    });
  }

  for (const row of unmatched) {
    items.push({
      id: `unm-${row.id}`,
      kind: "unmatched_inbound",
      title: row.subject ?? "(no subject)",
      subtitle: row.fromEmail,
      href: "/inbox",
    });
  }

  for (const row of failedSites) {
    items.push({
      id: `dep-${row.id}`,
      kind: "failed_deploy",
      title: row.businessName ?? row.slug,
      subtitle: row.deployError,
      href: row.leadId ? `/leads/${row.leadId}` : "/clients",
    });
  }

  for (const row of failedCharges) {
    items.push({
      id: `chg-${row.id}`,
      kind: "failed_charge",
      title: row.businessName ?? "Unknown client",
      subtitle: row.failedSince ? `Past due since ${row.failedSince.toISOString().slice(0, 10)}` : "Payment failed",
      href: `/leads/${row.leadId}`,
    });
  }

  return { items, counts };
}
