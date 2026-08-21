import { eq, leads, type Db } from "@outreach/db";
import { logAgentAction } from "../shared/log-action";
import { qualifyWebsite, type QualificationReason } from "./rules";

export type QualifyLeadResult = {
  leadId: string;
  status: "qualified" | "skipped";
  reason: QualificationReason;
};

export async function qualifyLead(
  db: Db,
  leadId: string,
  fetchImpl?: typeof fetch,
): Promise<QualifyLeadResult> {
  const started = Date.now();
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
  if (!lead) throw new Error(`Lead not found: ${leadId}`);

  const { qualifies, reason } = await qualifyWebsite(lead.websiteUrl, fetchImpl);
  const status = qualifies ? "qualified" : "skipped";

  await db
    .update(leads)
    .set({
      status,
      qualificationReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(leads.id, leadId));

  await logAgentAction(db, {
    agent: "qualify",
    action: "qualify_lead",
    leadId,
    marketId: lead.marketId,
    input: { websiteUrl: lead.websiteUrl },
    output: { status, reason },
    durationMs: Date.now() - started,
  });

  return { leadId, status, reason };
}

export { qualifyWebsite, SOCIAL_HOSTS, isSocialOnlyHost } from "./rules";
export type { QualifyResult, QualificationReason } from "./rules";
