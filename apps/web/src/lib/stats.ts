import { and, eq, gte, inArray, notInArray, sql } from "drizzle-orm";
import {
  clientSites,
  deals,
  leads,
  outreachMessages,
  type Db,
} from "@outreach/db";

const SENT_STATUSES = ["sent", "delivered", "opened"] as const;
const QUALIFIED_EXCLUDED = ["discovered", "skipped"] as const;
const REPLIED_STATUSES = ["replied", "interested", "customer"] as const;
const PAID_STATUSES = ["paid", "past_due"] as const;

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfMonth(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

/** Outbound emails actually sent today (any source). */
export async function sendsToday(db: Db): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(outreachMessages)
    .where(
      and(
        eq(outreachMessages.direction, "outbound"),
        inArray(outreachMessages.status, [...SENT_STATUSES]),
        gte(outreachMessages.createdAt, startOfToday()),
      ),
    );
  return row?.count ?? 0;
}

export type ReplyRate = {
  emailed: number;
  replied: number;
  /** Unique leads with inbound / unique leads emailed in the last 7 days. */
  rate: number;
};

/** Unique-lead reply rate over the trailing 7 days. */
export async function replyRate7d(db: Db): Promise<ReplyRate> {
  const since = daysAgo(7);
  const [emailedRow] = await db
    .select({ count: sql<number>`count(distinct ${outreachMessages.leadId})::int` })
    .from(outreachMessages)
    .where(
      and(
        eq(outreachMessages.direction, "outbound"),
        inArray(outreachMessages.status, [...SENT_STATUSES]),
        gte(outreachMessages.createdAt, since),
      ),
    );
  const [repliedRow] = await db
    .select({ count: sql<number>`count(distinct ${outreachMessages.leadId})::int` })
    .from(outreachMessages)
    .where(
      and(eq(outreachMessages.direction, "inbound"), gte(outreachMessages.createdAt, since)),
    );
  const emailed = emailedRow?.count ?? 0;
  const replied = repliedRow?.count ?? 0;
  return { emailed, replied, rate: emailed > 0 ? replied / emailed : 0 };
}

/** Deals that reached paid this calendar month (by `paidAt`). */
export async function dealsClosedMtd(db: Db): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(deals)
    .where(gte(deals.paidAt, startOfMonth()));
  return row?.count ?? 0;
}

/** Recurring revenue from active (paid + past_due) deals. */
export async function currentMrrCents(db: Db): Promise<number> {
  const [row] = await db
    .select({ mrr: sql<number>`coalesce(sum(${deals.mrrCents}), 0)::int` })
    .from(deals)
    .where(inArray(deals.status, [...PAID_STATUSES]));
  return row?.mrr ?? 0;
}

export type OverviewKpis = {
  emailsSentToday: number;
  replyRate: ReplyRate;
  dealsClosedMtd: number;
  mrrCents: number;
};

export async function getOverviewKpis(db: Db): Promise<OverviewKpis> {
  const [emailsSentToday, replyRate, closed, mrrCents] = await Promise.all([
    sendsToday(db),
    replyRate7d(db),
    dealsClosedMtd(db),
    currentMrrCents(db),
  ]);
  return { emailsSentToday, replyRate, dealsClosedMtd: closed, mrrCents };
}

export const FUNNEL_STAGES = [
  "discovered",
  "qualified",
  "emailed",
  "replied",
  "paid",
  "live",
] as const;

export type FunnelStageKey = (typeof FUNNEL_STAGES)[number];

export type FunnelStats = Record<FunnelStageKey, number>;

export async function getFunnelStats(db: Db): Promise<FunnelStats> {
  const [discoveredRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leads);
  const [qualifiedRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leads)
    .where(notInArray(leads.status, [...QUALIFIED_EXCLUDED]));
  const [emailedRow] = await db
    .select({ count: sql<number>`count(distinct ${leads.id})::int` })
    .from(leads)
    .innerJoin(outreachMessages, eq(outreachMessages.leadId, leads.id))
    .where(eq(outreachMessages.direction, "outbound"));
  const [repliedRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leads)
    .where(inArray(leads.status, [...REPLIED_STATUSES]));
  const [paidRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(deals)
    .where(inArray(deals.status, [...PAID_STATUSES]));
  const [liveRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(clientSites)
    .where(eq(clientSites.deployStatus, "live"));

  return {
    discovered: discoveredRow?.count ?? 0,
    qualified: qualifiedRow?.count ?? 0,
    emailed: emailedRow?.count ?? 0,
    replied: repliedRow?.count ?? 0,
    paid: paidRow?.count ?? 0,
    live: liveRow?.count ?? 0,
  };
}
