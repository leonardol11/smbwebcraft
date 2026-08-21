import { NextRequest, NextResponse } from "next/server";
import { eq, getDb, leads } from "@outreach/db";
import { buildPaymentLink } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/** Public: stable short link in emails -> Stripe Payment Link for the lead. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await ctx.params;
  const db = await getDb();
  const [lead] = await db
    .select({ id: leads.id, email: leads.email })
    .from(leads)
    .where(eq(leads.id, leadId));
  if (!lead) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(buildPaymentLink(lead.id, lead.email), 302);
}
