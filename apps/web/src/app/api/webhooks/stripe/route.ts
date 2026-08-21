import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { agentActions, deals, getDb, leads, stripeEvents, type Db } from "@outreach/db";
import { env } from "@outreach/env";
import { createEmailClient, fromAddress } from "@outreach/email";
import { enqueueJob } from "@/jobs";
import { constructStripeEvent } from "@/lib/stripe";

export const dynamic = "force-dynamic";

type AnyObj = Record<string, any>;

function str(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && typeof (v as AnyObj).id === "string") return (v as AnyObj).id;
  return null;
}

async function handleCheckoutCompleted(db: Db, obj: AnyObj) {
  const leadId = str(obj.client_reference_id);
  if (!leadId) {
    console.warn("[stripe] checkout.session.completed without client_reference_id", obj.id);
    return;
  }
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
  if (!lead) {
    console.warn("[stripe] checkout for unknown lead", leadId);
    return;
  }
  const now = new Date();
  const stripeFields = {
    stripeCustomerId: str(obj.customer),
    stripeSubscriptionId: str(obj.subscription),
    stripeCheckoutSessionId: str(obj.id),
  };
  await db
    .insert(deals)
    .values({ leadId, status: "paid", paidAt: now, ...stripeFields })
    .onConflictDoUpdate({
      target: deals.leadId,
      set: { status: "paid", paidAt: now, failedSince: null, dunningStage: 0, ...stripeFields },
    });
  await db
    .update(leads)
    .set({ status: "customer", updatedAt: now })
    .where(eq(leads.id, leadId));

  const email = obj.customer_details?.email ?? obj.customer_email ?? lead.email;
  if (email) {
    await createEmailClient().send({
      to: email,
      from: fromAddress(),
      subject: `Payment received — building ${lead.businessName}'s site`,
      text: `Hi${lead.ownerFirstName ? ` ${lead.ownerFirstName}` : ""},\n\nThanks! We received your $100 setup + $25/month. Your site is being built now and you'll get another email with the live link shortly.\n\nCancel anytime by replying to this email.\n\n${env().SENDER_FIRST_NAME}`,
      html: `<p>Thanks! We received your $100 setup + $25/month. Your site is being built now and you'll get another email with the live link shortly.</p><p>Cancel anytime by replying to this email.</p><p>${env().SENDER_FIRST_NAME}</p>`,
    });
  }
  await enqueueJob("site.build_and_deploy", { leadId, preview: false });
}

async function dealBySubscription(db: Db, obj: AnyObj) {
  const subId = str(obj.subscription) ?? (obj.object === "subscription" ? str(obj.id) : null);
  if (subId) {
    const [deal] = await db.select().from(deals).where(eq(deals.stripeSubscriptionId, subId));
    if (deal) return deal;
  }
  const customerId = str(obj.customer);
  if (customerId) {
    const [deal] = await db.select().from(deals).where(eq(deals.stripeCustomerId, customerId));
    if (deal) return deal;
  }
  return undefined;
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";

  let event: AnyObj;
  try {
    event = constructStripeEvent(raw, sig) as AnyObj;
  } catch (err) {
    if (env().PROVIDER_MODE === "live") {
      return NextResponse.json({ error: "invalid signature" }, { status: 400 });
    }
    try {
      event = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "invalid payload" }, { status: 400 });
    }
    void err;
  }

  const db = await getDb();
  const type = String(event.type ?? "");
  const obj: AnyObj = event.data?.object ?? {};

  // Idempotency: Stripe retries deliveries; record each event id once.
  const eventId = typeof event.id === "string" ? event.id : null;
  if (eventId) {
    const inserted = await db
      .insert(stripeEvents)
      .values({ id: eventId, type })
      .onConflictDoNothing()
      .returning({ id: stripeEvents.id });
    if (inserted.length === 0) {
      return NextResponse.json({ received: true, duplicate: true });
    }
  }

  switch (type) {
    case "checkout.session.completed": {
      await handleCheckoutCompleted(db, obj);
      break;
    }
    case "invoice.payment_failed": {
      const deal = await dealBySubscription(db, obj);
      if (deal && deal.status !== "canceled") {
        await db
          .update(deals)
          .set({
            status: deal.status === "suspended" ? "suspended" : "past_due",
            failedSince: deal.failedSince ?? new Date(),
          })
          .where(eq(deals.id, deal.id));
      }
      break;
    }
    case "invoice.paid": {
      const deal = await dealBySubscription(db, obj);
      if (deal && deal.status !== "canceled") {
        const wasSuspended = deal.status === "suspended";
        await db
          .update(deals)
          .set({ status: "paid", failedSince: null, dunningStage: 0 })
          .where(eq(deals.id, deal.id));
        if (wasSuspended) {
          await enqueueJob("site.suspend", { leadId: deal.leadId, suspended: false });
        }
      }
      break;
    }
    case "customer.subscription.deleted": {
      const deal = await dealBySubscription(db, obj);
      if (deal) {
        await db
          .update(deals)
          .set({ status: "canceled", canceledAt: new Date() })
          .where(
            and(eq(deals.id, deal.id), inArray(deals.status, ["paid", "past_due", "suspended", "checkout_sent", "pending"])),
          );
        await enqueueJob("site.suspend", { leadId: deal.leadId, suspended: true });
      }
      break;
    }
    case "charge.dispute.created": {
      const customerId = str(obj.customer);
      let leadId: string | null = null;
      if (customerId) {
        const [deal] = await db.select().from(deals).where(eq(deals.stripeCustomerId, customerId));
        leadId = deal?.leadId ?? null;
      }
      console.warn("[stripe] dispute created", obj.id, { leadId, amount: obj.amount, reason: obj.reason });
      await db.insert(agentActions).values({
        agent: "billing",
        action: "dispute_created",
        status: "escalated",
        detail: `Stripe dispute ${str(obj.id) ?? ""} (${obj.reason ?? "unknown reason"}) for ${obj.amount ?? "?"} ${obj.currency ?? ""}`.trim(),
        leadId,
        input: { disputeId: str(obj.id), chargeId: str(obj.charge), customerId },
      });
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
