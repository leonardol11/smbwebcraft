import { NextRequest, NextResponse } from "next/server";
import { eq, getDb, inboundEmails } from "@outreach/db";
import { enqueueInboundProcessing } from "../persist";

export const dynamic = "force-dynamic";

/**
 * Re-queue processing for an inbound email already stored in `inbound_emails`.
 * Does not re-insert the payload and does not run the reply agent inline.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const id = rec.id ?? rec.inboundEmailId;
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  const db = await getDb();
  const [row] = await db.select({ id: inboundEmails.id }).from(inboundEmails).where(eq(inboundEmails.id, id));
  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  await db
    .update(inboundEmails)
    .set({
      matchStatus: "pending",
      processedAt: null,
    })
    .where(eq(inboundEmails.id, id));

  enqueueInboundProcessing(id);

  return NextResponse.json({ ok: true, id });
}
