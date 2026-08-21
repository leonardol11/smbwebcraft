import Stripe from "stripe";
import { env } from "@outreach/env";

let cached: Stripe | undefined;

/** Live-mode Stripe client (throws if STRIPE_SECRET_KEY is missing). */
export function getStripe(): Stripe {
  if (cached) return cached;
  const key = env().STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  cached = new Stripe(key);
  return cached;
}

/**
 * Payment Link URL for a lead. `client_reference_id` is echoed back on the
 * checkout.session.completed event so the webhook can match the lead.
 */
export function buildPaymentLink(leadId: string, email?: string | null): string {
  const base = env().STRIPE_PAYMENT_LINK_URL ?? "https://buy.stripe.com/test_fake";
  const url = new URL(base);
  url.searchParams.set("client_reference_id", leadId);
  if (email) url.searchParams.set("prefilled_email", email);
  return url.toString();
}

/** Stable short link carried in emails; redirects to buildPaymentLink. */
export function payUrl(leadId: string): string {
  return `${env().APP_URL}/pay/${leadId}`;
}

export function previewUrl(leadId: string): string {
  return `${env().APP_URL}/preview/${leadId}`;
}

/** Customer portal link (update card / cancel), prefilled with the email. */
export function buildCustomerPortalLink(email?: string | null): string {
  const base = env().STRIPE_CUSTOMER_PORTAL_URL ?? "https://billing.stripe.com/p/login/test_fake";
  const url = new URL(base);
  if (email) url.searchParams.set("prefilled_email", email);
  return url.toString();
}

/**
 * Parses + verifies a webhook payload. Live mode verifies the signature with
 * STRIPE_WEBHOOK_SECRET; fake mode just JSON.parses the body.
 */
export function constructStripeEvent(raw: string, signature: string): Stripe.Event {
  if (env().PROVIDER_MODE === "fake") {
    return JSON.parse(raw) as Stripe.Event;
  }
  const secret = env().STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  return getStripe().webhooks.constructEvent(raw, signature, secret);
}
