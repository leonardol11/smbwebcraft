"use server";

import { revalidatePath } from "next/cache";
import { inArray } from "drizzle-orm";
import { getDb, leads, suppressions } from "@outreach/db";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function bulkSuppressLeads(leadIds: string[], slug: string): Promise<void> {
  if (leadIds.length === 0) return;
  const db = await getDb();
  const rows = await db.select().from(leads).where(inArray(leads.id, leadIds));
  if (rows.length === 0) return;

  await db
    .update(leads)
    .set({ status: "suppressed", updatedAt: new Date() })
    .where(
      inArray(
        leads.id,
        rows.map((r) => r.id),
      ),
    );

  const byEmail = new Map<string, string>();
  for (const row of rows) {
    if (!row.email) continue;
    const email = normalizeEmail(row.email);
    if (email && !byEmail.has(email)) byEmail.set(email, row.id);
  }
  if (byEmail.size) {
    await db
      .insert(suppressions)
      .values(
        [...byEmail.entries()].map(([email, leadId]) => ({
          email,
          reason: "manual" as const,
          leadId,
        })),
      )
      .onConflictDoNothing();
  }
  revalidatePath(`/cities/${slug}`);
}
