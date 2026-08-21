import { eq, getDb, leads, suppressions, type SuppressionReason } from "@outreach/db";

/** Add an email to the suppression list and mark matching leads suppressed. Idempotent. */
export async function suppressEmail(
  rawEmail: string,
  reason: SuppressionReason,
  leadId?: string | null,
): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  if (!email) return;
  const db = await getDb();
  await db
    .insert(suppressions)
    .values({ email, reason, leadId: leadId ?? null })
    .onConflictDoNothing();
  await db
    .update(leads)
    .set({ status: "suppressed", updatedAt: new Date() })
    .where(eq(leads.email, email));
}

/** Remove an email from the suppression list. Lead status is left untouched. */
export async function unsuppressEmail(rawEmail: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  if (!email) return;
  const db = await getDb();
  await db.delete(suppressions).where(eq(suppressions.email, email));
}
