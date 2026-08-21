import { NextRequest, NextResponse } from "next/server";
import { and, eq, clientSites, getDb, leads } from "@outreach/db";
import { buildPreviewHtml, getOrBuildPreview } from "@/lib/preview";

export const dynamic = "force-dynamic";

/** Public preview-before-pay page: the lead's generated site + a "go live" banner. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await ctx.params;
  const db = await getDb();
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
  if (!lead) return new NextResponse("Not found", { status: 404 });

  const [cached] = await db
    .select({ html: clientSites.html })
    .from(clientSites)
    .where(and(eq(clientSites.leadId, leadId), eq(clientSites.isPreview, true)))
    .limit(1);

  const html = cached?.html ?? (await getOrBuildPreview(db, leadId));
  return new NextResponse(buildPreviewHtml(html, lead), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
}
