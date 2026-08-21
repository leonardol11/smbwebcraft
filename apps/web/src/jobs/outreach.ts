import { and, eq, gte, inArray, isNotNull } from "drizzle-orm";
import {
  assertNotPaused,
  campaigns,
  getSettings,
  leads,
  outreachMessages,
  suppressions,
  threads,
  type Db,
} from "@outreach/db";
import {
  HARD_GLOBAL_DAILY_CAP,
  buildThreadingHeaders,
  clampCampaignDailyCap,
  clampGlobalDailyCap,
  countsTowardDailyCap,
  createEmailClient,
  createUnsubscribeToken,
  decideSequenceSend,
  fromAddress,
  personalizeLead,
  plusAddress,
  recipientDomain,
  renderSequenceEmail,
  startOfUtcDay,
  type SequenceLead,
  type SequenceStep,
} from "@outreach/email";
import { env } from "@outreach/env";
import { defineJob } from "./core";

const READY_STATUSES = ["qualified", "ready", "sequenced"] as const;

const COUNTED_STATUSES = ["queued", "sent", "delivered", "opened", "bounced", "complained"] as const;

export type OutreachTickInput = {
  now?: string | Date;
  domainDailyCap?: number;
};

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "23505"
  );
}

async function loadSuppressedEmails(db: Db, emails: string[]): Promise<Set<string>> {
  if (emails.length === 0) return new Set();
  const rows = await db
    .select({ email: suppressions.email })
    .from(suppressions)
    .where(inArray(suppressions.email, emails.map((e) => e.toLowerCase())));
  return new Set(rows.map((r) => r.email.toLowerCase()));
}

async function loadInboundLeadIds(db: Db, leadIds: string[]): Promise<Set<string>> {
  if (leadIds.length === 0) return new Set();
  const rows = await db
    .select({ leadId: outreachMessages.leadId })
    .from(outreachMessages)
    .where(
      and(inArray(outreachMessages.leadId, leadIds), eq(outreachMessages.direction, "inbound")),
    );
  return new Set(rows.map((r) => r.leadId));
}

async function loadStopEventLeadIds(db: Db, leadIds: string[]): Promise<{
  bounced: Set<string>;
  complained: Set<string>;
}> {
  const bounced = new Set<string>();
  const complained = new Set<string>();
  if (leadIds.length === 0) return { bounced, complained };

  const rows = await db
    .select({
      leadId: outreachMessages.leadId,
      status: outreachMessages.status,
    })
    .from(outreachMessages)
    .where(
      and(
        inArray(outreachMessages.leadId, leadIds),
        inArray(outreachMessages.status, ["bounced", "complained"]),
      ),
    );
  for (const row of rows) {
    if (row.status === "bounced") bounced.add(row.leadId);
    if (row.status === "complained") complained.add(row.leadId);
  }
  return { bounced, complained };
}

export async function runOutreachTick(db: Db, input: OutreachTickInput = {}) {
  await assertNotPaused(db, "sending_paused");

  const now = input.now instanceof Date ? input.now : input.now ? new Date(input.now) : new Date();
  const dayStart = startOfUtcDay(now);
  const settings = await getSettings(db);
  const globalCap = clampGlobalDailyCap(settings.global_daily_send_cap);
  const domainCap = clampGlobalDailyCap(input.domainDailyCap ?? HARD_GLOBAL_DAILY_CAP);

  const running = await db.select().from(campaigns).where(eq(campaigns.status, "running"));
  const campaignById = new Map(running.map((c) => [c.id, c]));
  const runningIds = [...campaignById.keys()];

  const todaysOutbound = await db
    .select({
      leadId: outreachMessages.leadId,
      status: outreachMessages.status,
      campaignId: leads.campaignId,
      email: leads.email,
    })
    .from(outreachMessages)
    .innerJoin(leads, eq(leads.id, outreachMessages.leadId))
    .where(
      and(
        eq(outreachMessages.direction, "outbound"),
        inArray(outreachMessages.status, [...COUNTED_STATUSES]),
        gte(outreachMessages.createdAt, dayStart),
      ),
    );

  let sentToday = 0;
  const campaignSends = new Map<string, number>();
  const domainSends = new Map<string, number>();
  for (const row of todaysOutbound) {
    if (!countsTowardDailyCap(row.status)) continue;
    sentToday += 1;
    if (row.campaignId) {
      campaignSends.set(row.campaignId, (campaignSends.get(row.campaignId) ?? 0) + 1);
    }
    if (row.email) {
      const domain = recipientDomain(row.email);
      if (domain) domainSends.set(domain, (domainSends.get(domain) ?? 0) + 1);
    }
  }

  if (sentToday >= HARD_GLOBAL_DAILY_CAP || sentToday >= globalCap) {
    return { sent: 0, reason: "global_cap" as const };
  }
  if (runningIds.length === 0) {
    return { sent: 0, reason: "no_running_campaign" as const };
  }

  const remaining = Math.min(HARD_GLOBAL_DAILY_CAP, globalCap) - sentToday;
  const candidates = await db
    .select()
    .from(leads)
    .where(
      and(
        inArray(leads.status, [...READY_STATUSES]),
        isNotNull(leads.email),
        inArray(leads.campaignId, runningIds),
      ),
    )
    .limit(Math.max(0, Math.min(200, remaining)));

  const leadIds = candidates.map((l) => l.id);
  const emails = candidates.map((l) => l.email).filter((e): e is string => !!e);
  const [suppressed, inboundIds, stopEvents, sentHistory] = await Promise.all([
    loadSuppressedEmails(db, emails),
    loadInboundLeadIds(db, leadIds),
    loadStopEventLeadIds(db, leadIds),
    leadIds.length === 0
      ? Promise.resolve([])
      : db
          .select()
          .from(outreachMessages)
          .where(
            and(
              inArray(outreachMessages.leadId, leadIds),
              eq(outreachMessages.direction, "outbound"),
              isNotNull(outreachMessages.sequenceStep),
            ),
          ),
  ]);

  const sentByLead = new Map<string, typeof sentHistory>();
  for (const msg of sentHistory) {
    const list = sentByLead.get(msg.leadId) ?? [];
    list.push(msg);
    sentByLead.set(msg.leadId, list);
  }

  const client = createEmailClient();
  const secret = env().SESSION_SECRET;
  let sent = 0;

  for (const lead of candidates) {
    if (sentToday >= HARD_GLOBAL_DAILY_CAP || sentToday >= globalCap) {
      break;
    }

    const campaign = lead.campaignId ? campaignById.get(lead.campaignId) : undefined;
    if (!campaign) continue;

    const history = sentByLead.get(lead.id) ?? [];
    const firstSend = history.find((m) => m.sequenceStep === 0);
    const sequenceLead: SequenceLead = {
      status: lead.status,
      email: lead.email,
      lastTouchAt: lead.lastTouchAt,
      sequenceStartedAt: firstSend?.createdAt ?? lead.lastTouchAt,
      suppressed: !!(lead.email && suppressed.has(lead.email.toLowerCase())),
      hasReplied: inboundIds.has(lead.id),
      hasBounced: stopEvents.bounced.has(lead.id),
      hasComplained: stopEvents.complained.has(lead.id),
    };

    const domain = lead.email ? recipientDomain(lead.email) : "";
    const decision = decideSequenceSend({
      leadId: lead.id,
      lead: sequenceLead,
      alreadySentSteps: history.map((m) => m.sequenceStep).filter((s): s is number => s != null),
      now,
      sendingPaused: false,
      campaignStatus: campaign.status,
      globalSendsToday: sentToday,
      campaignSendsToday: campaignSends.get(campaign.id) ?? 0,
      domainSendsToday: domain ? (domainSends.get(domain) ?? 0) : 0,
      globalDailyCap: globalCap,
      campaignDailyCap: clampCampaignDailyCap(campaign.dailyCap, globalCap),
      domainDailyCap: domainCap,
    });

    if (decision.action !== "send") continue;

    // Hard refuse: never enqueue a send that would push the UTC day over 450.
    if (sentToday + 1 > HARD_GLOBAL_DAILY_CAP) {
      return { sent, reason: "global_cap" as const };
    }

    const step: SequenceStep = decision.step;
    const token = createUnsubscribeToken(lead.email!, secret);
    const slots = await personalizeLead({
      businessName: lead.businessName,
      ownerFirstName: lead.ownerFirstName,
      city: lead.city,
      category: lead.category,
      websiteUrl: lead.websiteUrl,
    });
    const rendered = renderSequenceEmail(step, {
      businessName: slots.businessName,
      ownerFirstName: slots.ownerFirstName,
      ownerFirstNameVerified: true,
      observationAboutWebPresence: slots.observationAboutWebPresence,
      unsubscribeToken: token,
    });

    let [thread] = await db.select().from(threads).where(eq(threads.leadId, lead.id)).limit(1);
    if (!thread) {
      [thread] = await db
        .insert(threads)
        .values({ leadId: lead.id, subject: rendered.subject, status: "active" })
        .returning();
    }

    const priorIds = history
      .filter((m) => m.providerMessageId)
      .sort((a, b) => (a.sequenceStep ?? 0) - (b.sequenceStep ?? 0))
      .map((m) => m.providerMessageId!);
    const latestId = priorIds.at(-1);

    const result = await client.send({
      to: lead.email!,
      from: fromAddress(),
      replyTo: plusAddress(lead.id),
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      headers: {
        ...rendered.headers,
        ...buildThreadingHeaders({
          inReplyTo: latestId,
          references: priorIds,
        }),
      },
      idempotencyKey: decision.idempotencyKey,
    });

    try {
      await db.insert(outreachMessages).values({
        threadId: thread!.id,
        leadId: lead.id,
        direction: "outbound",
        source: "sequence",
        sequenceStep: step,
        providerMessageId: result.messageId,
        inReplyTo: latestId ?? null,
        subject: rendered.subject,
        bodyText: rendered.text,
        bodyHtml: rendered.html,
        status: "sent",
        createdAt: now,
      });
    } catch (err) {
      if (isUniqueViolation(err)) continue;
      throw err;
    }

    await db
      .update(leads)
      .set({
        status: "sequenced",
        lastTouchAt: now,
        updatedAt: now,
      })
      .where(eq(leads.id, lead.id));

    await db
      .update(threads)
      .set({ lastMessageAt: now, subject: rendered.subject })
      .where(eq(threads.id, thread!.id));

    sent += 1;
    sentToday += 1;
    campaignSends.set(campaign.id, (campaignSends.get(campaign.id) ?? 0) + 1);
    if (domain) domainSends.set(domain, (domainSends.get(domain) ?? 0) + 1);
  }

  return { sent };
}

defineJob("outreach.tick", async (input: OutreachTickInput | undefined, { db }) => {
  return runOutreachTick(db, input ?? {});
});
