import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@outreach/db";
import { verifyResendWebhook } from "@outreach/email";
import { processDeliveryEvent } from "@/lib/delivery-events";

export const dynamic = "force-dynamic";

/**
 * Public Resend delivery-event webhook (no admin auth).
 * PROVIDER_MODE=fake: verifyResendWebhook always returns true.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const signature =
    req.headers.get("svix-signature") ?? req.headers.get("x-resend-signature") ?? "";

  const ok = await verifyResendWebhook(raw, signature);
  if (!ok) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const db = await getDb();
  const result = await processDeliveryEvent(db, payload);
  return NextResponse.json({
    ok: true,
    ignored: result.ignored,
    suppressed: result.suppressed,
  });
}
