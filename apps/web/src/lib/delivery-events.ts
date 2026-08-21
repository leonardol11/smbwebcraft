import { and, eq, inArray, emailEvents, leads, outreachMessages, settings, suppressions, type Db } from "@outreach/db";
import {
  isHardBouncePayload,
  parseResendWebhookEvent,
  shouldSuppressForEvent,
  type ParsedResendWebhookEvent,
  type ResendWebhookPayload,
} from "@outreach/email";

export type DeliveryRates = {
  delivered: number;
  bounced: number;
  complained: number;
  opened: number;
  /** Distinct provider message ids seen in delivery events. */
  sent: number;
  /** Unique bounced messages / unique sent messages. */
  bounceRate: number;
  /** Unique complained messages / unique sent messages. */
  complaintRate: number;
};

const SOFT_BOUNCE_TYPES = new Set(["soft", "transient", "temporary"]);

export function isSoftBouncePayload(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const payload = body as ResendWebhookPayload;
  if (payload.type !== "email.bounced") return false;
  const bounceType = payload.data?.bounce?.type?.toLowerCase();
  return bounceType != null && SOFT_BOUNCE_TYPES.has(bounceType);
}

/**
 * Hard bounces and complaints are auto-suppressed. Soft/transient bounces
 * are recorded but do not suppress. Bounces with no type (typical of
 * simulated/fake payloads) are treated as hard.
 */
export function shouldAutoSuppress(event: ParsedResendWebhookEvent, body: unknown): boolean {
  if (!shouldSuppressForEvent(event)) return false;
  if (event.deliveryType === "complained") return true;
  if (event.deliveryType !== "bounced") return false;
  if (isSoftBouncePayload(body)) return false;
  // Hard/permanent, or unspecified type (simulated/fake payloads).
  const bounceType = (body as ResendWebhookPayload).data?.bounce?.type;
  return isHardBouncePayload(body) || bounceType == null || bounceType === "";
}

export async function computeDeliveryRates(db: Db): Promise<DeliveryRates> {
  const rows = await db
    .select({
      type: emailEvents.type,
      providerMessageId: emailEvents.providerMessageId,
    })
    .from(emailEvents);

  let delivered = 0;
  let bounced = 0;
  let complained = 0;
  let opened = 0;
  const sentIds = new Set<string>();
  const bouncedIds = new Set<string>();
  const complainedIds = new Set<string>();

  for (const row of rows) {
    if (row.providerMessageId) sentIds.add(row.providerMessageId);
    if (row.type === "delivered") delivered += 1;
    else if (row.type === "bounced") {
      bounced += 1;
      if (row.providerMessageId) bouncedIds.add(row.providerMessageId);
    } else if (row.type === "complained") {
      complained += 1;
      if (row.providerMessageId) complainedIds.add(row.providerMessageId);
    } else if (row.type === "opened") opened += 1;
  }

  const sent = sentIds.size;
  return {
    delivered,
    bounced,
    complained,
    opened,
    sent,
    bounceRate: sent > 0 ? bouncedIds.size / sent : 0,
    complaintRate: sent > 0 ? complainedIds.size / sent : 0,
  };
}

/** Persist bounce/complaint rates so T28 health can read the rolled-up metric. */
export async function rollupDeliveryRates(db: Db): Promise<DeliveryRates> {
  const rates = await computeDeliveryRates(db);
  const now = new Date();
  for (const [key, value] of [
    ["bounce_rate", rates.bounceRate],
    ["complaint_rate", rates.complaintRate],
  ] as const) {
    await db
      .insert(settings)
      .values({ key, value, updatedAt: now })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value, updatedAt: now },
      });
  }
  return rates;
}

export async function readRolledUpRates(
  db: Db,
): Promise<{ bounceRate: number; complaintRate: number }> {
  const rows = await db
    .select()
    .from(settings)
    .where(inArray(settings.key, ["bounce_rate", "complaint_rate"]));
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  return {
    bounceRate: typeof byKey.get("bounce_rate") === "number" ? (byKey.get("bounce_rate") as number) : 0,
    complaintRate:
      typeof byKey.get("complaint_rate") === "number" ? (byKey.get("complaint_rate") as number) : 0,
  };
}

export type ProcessDeliveryEventResult = {
  ignored: boolean;
  suppressed: boolean;
  rates: DeliveryRates;
};

export async function processDeliveryEvent(
  db: Db,
  payload: unknown,
): Promise<ProcessDeliveryEventResult> {
  const parsed = parseResendWebhookEvent(payload);
  if (!parsed) {
    return { ignored: true, suppressed: false, rates: await computeDeliveryRates(db) };
  }

  const email = parsed.email?.toLowerCase() ?? null;

  const [existing] = await db
    .select({ id: emailEvents.id })
    .from(emailEvents)
    .where(
      and(
        eq(emailEvents.type, parsed.deliveryType),
        eq(emailEvents.providerMessageId, parsed.providerMessageId),
      ),
    )
    .limit(1);

  if (existing) {
    return { ignored: false, suppressed: false, rates: await computeDeliveryRates(db) };
  }

  const [msg] = await db
    .select()
    .from(outreachMessages)
    .where(eq(outreachMessages.providerMessageId, parsed.providerMessageId))
    .limit(1);

  if (msg) {
    await db
      .update(outreachMessages)
      .set({ status: parsed.deliveryType })
      .where(eq(outreachMessages.id, msg.id));
  }

  await db.insert(emailEvents).values({
    type: parsed.deliveryType,
    email,
    providerMessageId: parsed.providerMessageId,
    outreachMessageId: msg?.id ?? null,
    payload,
  });

  let suppressed = false;
  if (shouldAutoSuppress(parsed, payload)) {
    suppressed = await suppressForDeliveryEvent(db, {
      email,
      leadId: msg?.leadId ?? null,
      reason: parsed.deliveryType === "complained" ? "complained" : "bounced",
    });
  }

  const rates = await rollupDeliveryRates(db);
  return { ignored: false, suppressed, rates };
}

async function suppressForDeliveryEvent(
  db: Db,
  args: { email: string | null; leadId: string | null; reason: "bounced" | "complained" },
): Promise<boolean> {
  let { email, leadId } = args;

  if (leadId && !email) {
    const [lead] = await db.select({ email: leads.email }).from(leads).where(eq(leads.id, leadId));
    email = lead?.email?.toLowerCase() ?? null;
  }
  if (!leadId && email) {
    const [lead] = await db.select({ id: leads.id }).from(leads).where(eq(leads.email, email));
    leadId = lead?.id ?? null;
  }

  if (email) {
    await db
      .insert(suppressions)
      .values({ email, reason: args.reason, leadId })
      .onConflictDoNothing();
  }

  if (leadId) {
    await db
      .update(leads)
      .set({ status: "suppressed", updatedAt: new Date() })
      .where(eq(leads.id, leadId));
    return true;
  }
  if (email) {
    const updated = await db
      .update(leads)
      .set({ status: "suppressed", updatedAt: new Date() })
      .where(eq(leads.email, email))
      .returning({ id: leads.id });
    return updated.length > 0;
  }
  return false;
}
