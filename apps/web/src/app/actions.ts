"use server";

import { revalidatePath } from "next/cache";
import { getDb, getSettings, setSetting, type AppSettings } from "@outreach/db";
import { runJob } from "@/jobs";

export async function togglePauseAll(): Promise<void> {
  const db = await getDb();
  const s = await getSettings(db);
  const anyRunning = !s.sending_paused || !s.reply_agent_paused || !s.discovery_paused;
  const next = anyRunning; // if anything is running, pause everything; else resume all
  await setSetting(db, "sending_paused", next);
  await setSetting(db, "reply_agent_paused", next);
  await setSetting(db, "discovery_paused", next);
  revalidatePath("/", "layout");
}

export async function toggleSettingFlag(
  key: "sending_paused" | "reply_agent_paused" | "discovery_paused",
): Promise<void> {
  const db = await getDb();
  const s = await getSettings(db);
  await setSetting(db, key, !s[key]);
  revalidatePath("/", "layout");
}

export async function updateNumericSetting(formData: FormData): Promise<void> {
  const key = String(formData.get("key")) as keyof AppSettings;
  const value = Number(formData.get("value"));
  const allowed: (keyof AppSettings)[] = [
    "global_daily_send_cap",
    "max_agent_replies_per_lead_per_day",
    "setup_price_cents",
    "monthly_price_cents",
    "reply_delay_seconds",
    "suspend_after_days_past_due",
  ];
  if (!allowed.includes(key) || !Number.isFinite(value) || value < 0) return;
  const db = await getDb();
  await setSetting(db, key, value as never);
  revalidatePath("/settings");
}

export async function triggerSampleJob(fail: boolean): Promise<void> {
  await runJob(fail ? "sample.fail" : "sample.echo", { source: "settings-ui" });
  revalidatePath("/agent-log");
}

export async function addSuppression(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;
  const { suppressEmail } = await import("@/lib/suppression");
  await suppressEmail(email, "manual");
  revalidatePath("/settings");
}

export async function removeSuppression(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  const { unsuppressEmail } = await import("@/lib/suppression");
  await unsuppressEmail(email);
  revalidatePath("/settings");
}

// ---------------------------------------------------------------------------
// Inbox (T19)
// ---------------------------------------------------------------------------

export async function toggleThreadTakeover(threadId: string): Promise<void> {
  const { toggleThreadTakeover: toggle } = await import("@/lib/inbox");
  await toggle(await getDb(), threadId);
  revalidatePath("/inbox");
}

export async function closeThread(threadId: string): Promise<void> {
  const { setThreadStatus } = await import("@/lib/inbox");
  await setThreadStatus(await getDb(), threadId, "closed");
  revalidatePath("/inbox");
}

export async function reopenThread(threadId: string): Promise<void> {
  const { setThreadStatus } = await import("@/lib/inbox");
  await setThreadStatus(await getDb(), threadId, "active");
  revalidatePath("/inbox");
}

export type ReplyActionState = { ok: boolean; message: string } | null;

export async function sendManualReply(
  _prev: ReplyActionState,
  formData: FormData,
): Promise<ReplyActionState> {
  const threadId = String(formData.get("threadId") ?? "");
  const body = String(formData.get("body") ?? "");
  if (!threadId || !body.trim()) return { ok: false, message: "Reply body is empty." };
  const { sendThreadReply } = await import("@/lib/inbox");
  const result = await sendThreadReply(await getDb(), { threadId, bodyText: body, source: "manual" });
  revalidatePath("/inbox");
  if (result.outcome === "sent") return { ok: true, message: "Reply sent." };
  if (result.outcome === "draft") {
    return { ok: true, message: "Sending is paused — saved as a draft instead." };
  }
  return { ok: false, message: result.error };
}

export async function sendDraft(messageId: string): Promise<ReplyActionState> {
  const db = await getDb();
  const { outreachMessages, eq } = await import("@outreach/db");
  const [draft] = await db
    .select({ threadId: outreachMessages.threadId })
    .from(outreachMessages)
    .where(eq(outreachMessages.id, messageId));
  if (!draft?.threadId) return { ok: false, message: "Draft not found." };
  const { sendThreadReply } = await import("@/lib/inbox");
  const result = await sendThreadReply(db, { threadId: draft.threadId, draftMessageId: messageId });
  revalidatePath("/inbox");
  if (result.outcome === "sent") return { ok: true, message: "Draft sent." };
  if (result.outcome === "draft") return { ok: false, message: "Sending is paused — draft kept." };
  return { ok: false, message: result.error };
}

export async function discardDraft(messageId: string): Promise<void> {
  const { discardDraft: discard } = await import("@/lib/inbox");
  await discard(await getDb(), messageId);
  revalidatePath("/inbox");
}

export async function markLeadStatus(
  leadId: string,
  status: "interested" | "not_interested",
): Promise<void> {
  const db = await getDb();
  const { leads, eq } = await import("@outreach/db");
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
  if (!lead) return;
  await db.update(leads).set({ status, updatedAt: new Date() }).where(eq(leads.id, leadId));
  if (status === "not_interested" && lead.email) {
    const { suppressEmail } = await import("@/lib/suppression");
    await suppressEmail(lead.email, "not_interested", leadId);
    // suppressEmail flips the lead to "suppressed"; keep the explicit not_interested status.
    await db.update(leads).set({ status }).where(eq(leads.id, leadId));
  }
  revalidatePath("/inbox");
}

export async function assignUnmatchedThread(formData: FormData): Promise<void> {
  const threadId = String(formData.get("threadId") ?? "");
  const leadId = String(formData.get("leadId") ?? "");
  if (!threadId || !leadId) return;
  const { assignThreadToLead } = await import("@/lib/inbox");
  await assignThreadToLead(await getDb(), threadId, leadId);
  revalidatePath("/inbox");
}

// ---------------------------------------------------------------------------
// Clients (T29)
// ---------------------------------------------------------------------------

export async function rebuildAndDeploySite(leadId: string): Promise<void> {
  const { enqueueJob } = await import("@/jobs");
  await enqueueJob("site.build_and_deploy", { leadId, preview: false });
  revalidatePath("/clients");
}

export async function setSiteSuspended(leadId: string, suspended: boolean): Promise<void> {
  const { enqueueJob } = await import("@/jobs");
  await enqueueJob("site.suspend", { leadId, suspended });
  revalidatePath("/clients");
}

export async function markDealCanceled(dealId: string): Promise<void> {
  const db = await getDb();
  const { deals, eq } = await import("@outreach/db");
  await db
    .update(deals)
    .set({ status: "canceled", canceledAt: new Date() })
    .where(eq(deals.id, dealId));
  revalidatePath("/clients");
}
