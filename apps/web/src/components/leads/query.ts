import { and, asc, eq, gte, isNotNull, isNull, lt, sql } from "drizzle-orm";
import {
  agentActions,
  leads,
  outreachMessages,
  threads,
  type Db,
} from "@outreach/db";
import { PAGE_SIZE, type LeadListFilters } from "./params";

export {
  PAGE_SIZE,
  LEAD_STATUSES,
  LAST_TOUCH_OPTIONS,
  parseLeadFilters,
  parsePage,
  leadsHref,
  type LastTouchFilter,
  type LeadListFilters,
} from "./params";

const MS_DAY = 24 * 60 * 60 * 1000;

export function leadWhere(
  marketId: string,
  filters: LeadListFilters,
  now: Date = new Date(),
) {
  const conditions = [eq(leads.marketId, marketId)];
  if (filters.status) conditions.push(eq(leads.status, filters.status));
  if (filters.hasEmail === "1") conditions.push(isNotNull(leads.email));
  if (filters.hasEmail === "0") conditions.push(isNull(leads.email));
  if (filters.noWebsite === "1") conditions.push(isNull(leads.websiteUrl));
  if (filters.lastTouch === "never") conditions.push(isNull(leads.lastTouchAt));
  if (filters.lastTouch === "7d") {
    conditions.push(gte(leads.lastTouchAt, new Date(now.getTime() - 7 * MS_DAY)));
  }
  if (filters.lastTouch === "30d") {
    conditions.push(gte(leads.lastTouchAt, new Date(now.getTime() - 30 * MS_DAY)));
  }
  if (filters.lastTouch === "older") {
    conditions.push(lt(leads.lastTouchAt, new Date(now.getTime() - 30 * MS_DAY)));
  }
  return and(...conditions);
}

export async function listLeads(
  db: Db,
  opts: {
    marketId: string;
    filters?: LeadListFilters;
    page?: number;
    pageSize?: number;
    now?: Date;
  },
) {
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const page = Math.max(1, opts.page ?? 1);
  const where = leadWhere(opts.marketId, opts.filters ?? {}, opts.now);
  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leads)
    .where(where);
  const total = countRow?.count ?? 0;
  const rows = await db
    .select()
    .from(leads)
    .where(where)
    .orderBy(asc(leads.createdAt), asc(leads.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return { rows, total, page, pageSize, totalPages };
}

export type LeadTimelineItem = {
  id: string;
  kind: "message" | "action";
  at: Date;
  label: string;
  detail: string | null;
};

export async function loadLeadDetail(db: Db, leadId: string) {
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
  if (!lead) return null;

  const messages = await db
    .select()
    .from(outreachMessages)
    .where(eq(outreachMessages.leadId, leadId))
    .orderBy(asc(outreachMessages.createdAt))
    .limit(50);
  const actions = await db
    .select()
    .from(agentActions)
    .where(eq(agentActions.leadId, leadId))
    .orderBy(asc(agentActions.createdAt))
    .limit(30);
  const leadThreads = await db.select().from(threads).where(eq(threads.leadId, leadId));

  const timeline: LeadTimelineItem[] = [
    ...messages.map((m) => ({
      id: m.id,
      kind: "message" as const,
      at: m.createdAt,
      label: `${m.direction} · ${m.source} · ${m.status}`,
      detail: m.subject ?? m.bodyText?.slice(0, 120) ?? null,
    })),
    ...actions.map((a) => ({
      id: a.id,
      kind: "action" as const,
      at: a.createdAt,
      label: `${a.agent} · ${a.action} · ${a.status}`,
      detail: a.detail ?? a.intent ?? null,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return { lead, timeline, threads: leadThreads };
}
