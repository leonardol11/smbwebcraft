import { env } from "@outreach/env";
import { eq, inArray, sql } from "drizzle-orm";
import { deals, getSettings, leads, type Db } from "@outreach/db";
import { createEmailClient, fromAddress } from "@outreach/email";
import { enqueueJob } from "@/jobs/enqueue";
import { buildCustomerPortalLink } from "@/lib/stripe";

/** Days after `failedSince` at which a dunning email goes out. */
export const DUNNING_DAYS = [1, 3, 7] as const;

export function daysSince(date: Date, now = new Date()): number {
  return Math.floor((now.getTime() - date.getTime()) / 86_400_000);
}

/**
 * Dunning tick: for every past_due deal, send the day-1/3/7 reminder that is
 * due and not yet sent (tracked in deals.dunningStage, so reruns are no-ops),
 * and suspend the site once `suspend_after_days_past_due` is reached.
 */
export async function processDunning(db: Db, now = new Date()) {
  const settings = await getSettings(db);
  const pastDue = await db.select().from(deals).where(eq(deals.status, "past_due"));
  const client = createEmailClient();
  let emailed = 0;
  let suspended = 0;

  for (const deal of pastDue) {
    if (!deal.failedSince) continue;
    const days = daysSince(new Date(deal.failedSince), now);

    if (days >= settings.suspend_after_days_past_due) {
      await db
        .update(deals)
        .set({ status: "suspended" })
        .where(eq(deals.id, deal.id));
      await enqueueJob("site.suspend", { leadId: deal.leadId, suspended: true });
      suspended++;
      continue;
    }

    // The latest stage that is due; skip if already sent (idempotent).
    const due = [...DUNNING_DAYS].reverse().find((d) => days >= d);
    if (!due || deal.dunningStage >= due) continue;

    const [lead] = await db.select().from(leads).where(eq(leads.id, deal.leadId));
    if (!lead?.email) continue;

    const portal = buildCustomerPortalLink(lead.email);
    const daysLeft = Math.max(0, settings.suspend_after_days_past_due - days);
    const price = `$${(deal.mrrCents / 100).toFixed(0)}/month`;
    const greeting = `Hi${lead.ownerFirstName ? ` ${lead.ownerFirstName}` : ""},`;
    await client.send({
      to: lead.email,
      from: fromAddress(),
      subject: `Payment update for ${lead.businessName}`,
      text: `${greeting}\n\nWe couldn't process the ${price} payment for ${lead.businessName}'s website. Please update your card here:\n${portal}\n\nIf nothing changes, the site will be paused in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. Reply to this email if you'd rather cancel.\n\n${env().SENDER_FIRST_NAME}`,
      html: `<p>${greeting}</p><p>We couldn't process the ${price} payment for ${lead.businessName}'s website. Please <a href="${portal}">update your card here</a>.</p><p>If nothing changes, the site will be paused in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. Reply to this email if you'd rather cancel.</p><p>${env().SENDER_FIRST_NAME}</p>`,
    });
    await db.update(deals).set({ dunningStage: due }).where(eq(deals.id, deal.id));
    emailed++;
  }

  return { emailed, suspended, checked: pastDue.length };
}

/** Monthly recurring revenue in cents: active paid deals x their monthly price. */
export async function computeMrr(db: Db): Promise<number> {
  const [row] = await db
    .select({ mrr: sql<number>`coalesce(sum(${deals.mrrCents}), 0)::int` })
    .from(deals)
    .where(inArray(deals.status, ["paid", "past_due"]));
  return Number(row?.mrr ?? 0);
}

/** @deprecated use computeMrr */
export const calculateMrr = computeMrr;
