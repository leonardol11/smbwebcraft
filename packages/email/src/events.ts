import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@outreach/env";
import type { DeliveryEventType, ResendDeliveryEventType } from "./types";

function extractV1Signature(signature: string): string {
  const parts = signature.trim().split(/\s+/);
  for (const part of parts) {
    if (part.startsWith("v1,")) return part.slice(3);
    if (part.startsWith("v1=")) return part.slice(3);
  }
  return signature;
}

/** HMAC compare used by live webhook verification. Exported for tests. */
export function verifyResendWebhookSignature(
  raw: string,
  signature: string,
  secret: string | undefined,
): boolean {
  if (!secret || !signature) return false;

  const expectedHex = createHmac("sha256", secret).update(raw).digest("hex");
  const providedHex = extractV1Signature(signature);

  try {
    const a = Buffer.from(expectedHex, "hex");
    const b = Buffer.from(providedHex, "hex");
    if (a.length === 0 || a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Verify a Resend/Svix webhook signature.
 * Fake mode always accepts. Live mode HMAC-SHA256s the raw body with
 * RESEND_WEBHOOK_SECRET and compares against `v1,<hex>` or `v1=<hex>`.
 */
export async function verifyResendWebhook(raw: string, signature: string): Promise<boolean> {
  if (env().PROVIDER_MODE === "fake") return true;
  return verifyResendWebhookSignature(raw, signature, env().RESEND_WEBHOOK_SECRET);
}

const DELIVERY_EVENT_TYPES: ResendDeliveryEventType[] = [
  "email.delivered",
  "email.bounced",
  "email.complained",
  "email.opened",
];

export function isResendDeliveryEventType(type: string): type is ResendDeliveryEventType {
  return (DELIVERY_EVENT_TYPES as string[]).includes(type);
}

export function mapResendEventToDeliveryType(type: ResendDeliveryEventType): DeliveryEventType {
  switch (type) {
    case "email.delivered":
      return "delivered";
    case "email.bounced":
      return "bounced";
    case "email.complained":
      return "complained";
    case "email.opened":
      return "opened";
  }
}

export interface ParsedResendWebhookEvent {
  type: ResendDeliveryEventType;
  deliveryType: DeliveryEventType;
  providerMessageId: string;
  email: string | null;
  createdAt: string;
  raw: unknown;
}

export interface ResendWebhookPayload {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    message_id?: string;
    to?: string[];
    created_at?: string;
    bounce?: { type?: string; message?: string };
  };
}

export function parseResendWebhookEvent(body: unknown): ParsedResendWebhookEvent | null {
  if (!body || typeof body !== "object") return null;

  const payload = body as ResendWebhookPayload;
  if (!isResendDeliveryEventType(payload.type)) return null;

  const data = payload.data;
  const providerMessageId = data?.email_id ?? data?.message_id ?? "";
  if (!providerMessageId) return null;

  const email = data?.to?.[0] ?? null;
  const createdAt = payload.created_at ?? data?.created_at ?? new Date().toISOString();

  return {
    type: payload.type,
    deliveryType: mapResendEventToDeliveryType(payload.type),
    providerMessageId,
    email,
    createdAt,
    raw: body,
  };
}

export function shouldSuppressForEvent(event: ParsedResendWebhookEvent): boolean {
  return event.type === "email.bounced" || event.type === "email.complained";
}

export function isHardBouncePayload(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const payload = body as ResendWebhookPayload;
  if (payload.type !== "email.bounced") return false;
  const bounceType = payload.data?.bounce?.type?.toLowerCase();
  return bounceType === "hard" || bounceType === "permanent";
}

export function extractLeadIdFromPlusAddress(toEmail: string | null | undefined): string | null {
  if (!toEmail) return null;
  const match = /\+lead_([a-zA-Z0-9_-]+)@/.exec(toEmail);
  return match?.[1] ?? null;
}
