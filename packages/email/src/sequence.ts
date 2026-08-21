import { SEQUENCE_STEPS, type SequenceLead, type SequenceStep } from "./types";

/** Hard ceiling for outbound emails in a UTC day. Settings and campaign caps may be lower, never higher. */
export const HARD_GLOBAL_DAILY_CAP = 450;

/**
 * Max outbound emails to one recipient domain per UTC day.
 * Defaults to the global hard cap so Gmail/Outlook inboxes are not extra-limited;
 * pass a lower value to tighten reputation protection.
 */
export const DEFAULT_DOMAIN_DAILY_CAP = HARD_GLOBAL_DAILY_CAP;

const STOP_STATUSES = new Set([
  "replied",
  "interested",
  "customer",
  "not_interested",
  "suppressed",
]);

const COUNTED_SEND_STATUSES = new Set([
  "queued",
  "sent",
  "delivered",
  "opened",
  "bounced",
  "complained",
]);

export type CampaignRunStatus = "draft" | "running" | "paused";

export type SequenceSkipReason =
  | "paused"
  | "campaign_not_running"
  | "campaign_paused"
  | "no_email"
  | "suppressed"
  | "replied"
  | "bounced"
  | "complained"
  | "unsubscribed"
  | "complete"
  | "not_due"
  | "already_sent"
  | "global_cap"
  | "campaign_cap"
  | "domain_throttle"
  | `status_${string}`;

export type SequenceSendDecision =
  | { action: "send"; step: SequenceStep; idempotencyKey: string }
  | { action: "skip"; reason: SequenceSkipReason };

export type SequenceDecisionInput = {
  leadId: string;
  lead: SequenceLead;
  alreadySentSteps?: Iterable<number>;
  now?: Date;
  sendingPaused?: boolean;
  campaignStatus?: CampaignRunStatus | null;
  globalSendsToday: number;
  campaignSendsToday: number;
  domainSendsToday: number;
  globalDailyCap: number;
  campaignDailyCap: number;
  domainDailyCap?: number;
};

export function isStopStatus(status: string): boolean {
  return STOP_STATUSES.has(status);
}

export function countsTowardDailyCap(status: string): boolean {
  return COUNTED_SEND_STATUSES.has(status);
}

export function isSequenceStep(value: number): value is SequenceStep {
  return (SEQUENCE_STEPS as readonly number[]).includes(value);
}

export function clampGlobalDailyCap(requested: number): number {
  if (!Number.isFinite(requested)) return 0;
  return Math.min(HARD_GLOBAL_DAILY_CAP, Math.max(0, Math.floor(requested)));
}

export function clampCampaignDailyCap(campaignCap: number, globalCap: number): number {
  return Math.min(clampGlobalDailyCap(campaignCap), clampGlobalDailyCap(globalCap));
}

export function startOfUtcDay(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function recipientDomain(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 0) return "";
  return email.slice(at + 1).trim().toLowerCase();
}

export function shouldStopSequence(lead: SequenceLead): boolean {
  if (lead.suppressed) return true;
  if (lead.hasReplied) return true;
  if (lead.hasBounced) return true;
  if (lead.hasComplained) return true;
  if (isStopStatus(lead.status)) return true;
  if (!lead.email?.trim()) return true;
  return false;
}

export function stopReasonForLead(lead: SequenceLead): SequenceSkipReason | null {
  if (!lead.email?.trim()) return "no_email";
  if (lead.suppressed) return "suppressed";
  if (lead.hasReplied) return "replied";
  if (lead.hasBounced) return "bounced";
  if (lead.hasComplained) return "complained";
  if (isStopStatus(lead.status)) {
    if (lead.status === "replied") return "replied";
    if (lead.status === "suppressed") return "unsubscribed";
    return `status_${lead.status}`;
  }
  return null;
}

export function sentStepsFromHistory(steps: Iterable<number>): Set<SequenceStep> {
  const sent = new Set<SequenceStep>();
  for (const step of steps) {
    if (isSequenceStep(step)) sent.add(step);
  }
  return sent;
}

/** Return the next sequence step to send, or null if the sequence is complete or should stop. */
export function nextStep(
  lead: SequenceLead,
  alreadySent: Iterable<number> = [],
): SequenceStep | null {
  if (shouldStopSequence(lead)) return null;

  const sent = sentStepsFromHistory(alreadySent);
  for (const step of SEQUENCE_STEPS) {
    if (!sent.has(step)) return step;
  }
  return null;
}

export function isSequenceComplete(alreadySent: Iterable<number>): boolean {
  const sent = sentStepsFromHistory(alreadySent);
  return SEQUENCE_STEPS.every((step) => sent.has(step));
}

/** Days after Day 0 (sequence start) before a given step may send. Step 0 sends immediately. */
export function daysAfterLastTouchForStep(step: SequenceStep): number {
  return step;
}

export function daysAfterSequenceStartForStep(step: SequenceStep): number {
  return step;
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

export function isDueForStep(
  step: SequenceStep,
  sequenceStartedAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (step === 0) return true;
  const start = asDate(sequenceStartedAt);
  if (!start) return false;

  const msPerDay = 24 * 60 * 60 * 1000;
  const elapsedDays = (now.getTime() - start.getTime()) / msPerDay;
  return elapsedDays >= daysAfterSequenceStartForStep(step);
}

/** Given sent steps and sequence start, return the next step if it is due now. */
export function nextDueStep(
  lead: SequenceLead,
  alreadySent: Iterable<number> = [],
  now: Date = new Date(),
): SequenceStep | null {
  const candidate = nextStep(lead, alreadySent);
  if (candidate === null) return null;
  const start = lead.sequenceStartedAt ?? lead.lastTouchAt;
  if (!isDueForStep(candidate, start, now)) return null;
  return candidate;
}

export function idempotencyKeyForSend(leadId: string, step: SequenceStep): string {
  return `lead:${leadId}:step:${step}`;
}

/**
 * Decide whether this lead may send a sequence email right now.
 * The send path must call this (or equivalent cap checks) before every send:
 * a job that would push the UTC-day total above 450 is refused.
 */
export function decideSequenceSend(input: SequenceDecisionInput): SequenceSendDecision {
  const now = input.now ?? new Date();
  const alreadySent = sentStepsFromHistory(input.alreadySentSteps ?? []);

  if (input.sendingPaused) return { action: "skip", reason: "paused" };

  if (input.campaignStatus === "paused") {
    return { action: "skip", reason: "campaign_paused" };
  }
  if (input.campaignStatus !== "running") {
    return { action: "skip", reason: "campaign_not_running" };
  }

  const stop = stopReasonForLead(input.lead);
  if (stop) return { action: "skip", reason: stop };

  const candidate = nextStep(input.lead, alreadySent);
  if (candidate === null) {
    return { action: "skip", reason: "complete" };
  }

  const start = input.lead.sequenceStartedAt ?? input.lead.lastTouchAt;
  if (!isDueForStep(candidate, start, now)) {
    return { action: "skip", reason: "not_due" };
  }

  const effectiveGlobal = clampGlobalDailyCap(input.globalDailyCap);
  if (
    input.globalSendsToday >= HARD_GLOBAL_DAILY_CAP ||
    input.globalSendsToday >= effectiveGlobal
  ) {
    return { action: "skip", reason: "global_cap" };
  }

  const effectiveCampaign = clampCampaignDailyCap(input.campaignDailyCap, effectiveGlobal);
  if (input.campaignSendsToday >= effectiveCampaign) {
    return { action: "skip", reason: "campaign_cap" };
  }

  const domainCap = clampGlobalDailyCap(input.domainDailyCap ?? DEFAULT_DOMAIN_DAILY_CAP);
  if (input.domainSendsToday >= domainCap) {
    return { action: "skip", reason: "domain_throttle" };
  }

  return {
    action: "send",
    step: candidate,
    idempotencyKey: idempotencyKeyForSend(input.leadId, candidate),
  };
}
