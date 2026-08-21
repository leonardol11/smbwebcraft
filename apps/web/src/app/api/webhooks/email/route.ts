import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@outreach/db";
import { verifyResendWebhook } from "@outreach/email";
import { enqueueInboundProcessing, persistInboundEmail } from "./persist";

export const dynamic = "force-dynamic";

function signatureFrom(req: NextRequest): string {
  return req.headers.get("svix-signature") ?? req.headers.get("x-resend-signature") ?? "";
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const ok = await verifyResendWebhook(raw, signatureFrom(req));
  if (!ok && process.env.PROVIDER_MODE === "live") {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const db = await getDb();
  const row = await persistInboundEmail(db, payload);

  // Ack immediately — never await matcher / reply agent / LLM work.
  enqueueInboundProcessing(row.id);

  return NextResponse.json({ ok: true, id: row.id });
}
