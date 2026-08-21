import { notFound } from "next/navigation";
import Link from "next/link";
import { getDb } from "@outreach/db";
import { loadLeadDetail } from "@/components/leads/query";
import { LeadTimeline } from "@/components/leads/lead-timeline";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = await getDb();
  const detail = await loadLeadDetail(db, id);
  if (!detail) notFound();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <Link href="/cities" className="text-xs text-muted-foreground hover:text-foreground">
        ← Back
      </Link>
      <h1 className="text-lg font-semibold">{detail.lead.businessName}</h1>
      <LeadTimeline lead={detail.lead} timeline={detail.timeline} threads={detail.threads} />
    </div>
  );
}
