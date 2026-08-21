import { describe, expect, it } from "vitest";
import {
  isHardBouncePayload,
  mapResendEventToDeliveryType,
  parseResendWebhookEvent,
  shouldSuppressForEvent,
} from "./events";
import {
  HARD_GLOBAL_DAILY_CAP,
  clampCampaignDailyCap,
  clampGlobalDailyCap,
  decideSequenceSend,
  idempotencyKeyForSend,
  nextDueStep,
  nextStep,
  recipientDomain,
  shouldStopSequence,
  startOfUtcDay,
  type SequenceDecisionInput,
} from "./sequence";
import type { SequenceLead } from "./types";

describe("parseResendWebhookEvent", () => {
  it("parses delivery events", () => {
    const parsed = parseResendWebhookEvent({
      type: "email.delivered",
      created_at: "2026-01-01T00:00:00Z",
      data: {
        email_id: "msg_123",
        to: ["lead@biz.com"],
      },
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.deliveryType).toBe("delivered");
    expect(parsed?.providerMessageId).toBe("msg_123");
    expect(parsed?.email).toBe("lead@biz.com");
    expect(mapResendEventToDeliveryType("email.bounced")).toBe("bounced");
  });

  it("ignores unknown event types", () => {
    expect(parseResendWebhookEvent({ type: "email.clicked" })).toBeNull();
  });

  it("flags bounce and complaint for suppression", () => {
    const bounce = parseResendWebhookEvent({
      type: "email.bounced",
      data: { email_id: "x", to: ["a@b.com"] },
    });
    const complaint = parseResendWebhookEvent({
      type: "email.complained",
      data: { email_id: "y", to: ["a@b.com"] },
    });
    expect(bounce && shouldSuppressForEvent(bounce)).toBe(true);
    expect(complaint && shouldSuppressForEvent(complaint)).toBe(true);
  });

  it("detects hard bounces", () => {
    expect(
      isHardBouncePayload({
        type: "email.bounced",
        data: { bounce: { type: "hard" } },
      }),
    ).toBe(true);
  });
});

describe("sequence helpers", () => {
  const lead: SequenceLead = {
    status: "ready",
    email: "a@b.com",
    lastTouchAt: new Date("2026-01-01T00:00:00Z"),
  };

  it("returns step 0 first, then 3 and 7", () => {
    expect(nextStep(lead, [])).toBe(0);
    expect(nextStep(lead, [0])).toBe(3);
    expect(nextStep(lead, [0, 3])).toBe(7);
    expect(nextStep(lead, [0, 3, 7])).toBeNull();
  });

  it("stops on reply or suppression signals", () => {
    expect(shouldStopSequence({ ...lead, status: "replied" })).toBe(true);
    expect(shouldStopSequence({ ...lead, hasBounced: true })).toBe(true);
    expect(shouldStopSequence({ ...lead, suppressed: true })).toBe(true);
  });

  it("respects day offsets before sending follow-ups", () => {
    const afterDay0 = {
      ...lead,
      lastTouchAt: new Date("2026-01-01T00:00:00Z"),
      sequenceStartedAt: new Date("2026-01-01T00:00:00Z"),
    };
    expect(nextDueStep(afterDay0, [0], new Date("2026-01-03T12:00:00Z"))).toBeNull();
    expect(nextDueStep(afterDay0, [0], new Date("2026-01-04T00:00:00Z"))).toBe(3);
  });

  it("schedules the final from Day 0, not from the bump's last touch", () => {
    const afterBump = {
      ...lead,
      sequenceStartedAt: new Date("2026-01-01T00:00:00Z"),
      lastTouchAt: new Date("2026-01-04T00:00:00Z"),
    };
    expect(nextDueStep(afterBump, [0, 3], new Date("2026-01-08T00:00:00Z"))).toBe(7);
    expect(nextDueStep(afterBump, [0, 3], new Date("2026-01-07T23:00:00Z"))).toBeNull();
  });
});

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type ClockSend = { step: 0 | 3 | 7; at: Date };

class SequenceClock {
  now: Date;
  sent: ClockSend[] = [];
  inbound = 0;
  lead: SequenceLead;
  sendingPaused = false;
  campaignStatus: "draft" | "running" | "paused" = "running";
  globalSendsToday = 0;
  campaignSendsToday = 0;
  domainSendsToday = 0;
  globalDailyCap = HARD_GLOBAL_DAILY_CAP;
  campaignDailyCap = 25;
  domainDailyCap = HARD_GLOBAL_DAILY_CAP;
  utcDay = "";

  constructor(start: Date) {
    this.now = start;
    this.utcDay = startOfUtcDay(start).toISOString();
    this.lead = {
      status: "ready",
      email: "owner@bella-nails.example",
    };
  }

  advanceDays(days: number) {
    this.now = new Date(this.now.getTime() + days * MS_PER_DAY);
    this.rollUtcDay();
  }

  injectReply() {
    this.inbound += 1;
    this.lead = { ...this.lead, hasReplied: true, status: "replied" };
  }

  tick() {
    this.rollUtcDay();
    const decision = decideSequenceSend(this.decisionInput());
    if (decision.action !== "send") return decision;
    this.sent.push({ step: decision.step, at: new Date(this.now) });
    this.globalSendsToday += 1;
    this.campaignSendsToday += 1;
    this.domainSendsToday += 1;
    this.lead = {
      ...this.lead,
      status: "sequenced",
      lastTouchAt: new Date(this.now),
      sequenceStartedAt: this.lead.sequenceStartedAt ?? new Date(this.now),
    };
    return decision;
  }

  private rollUtcDay() {
    const day = startOfUtcDay(this.now).toISOString();
    if (day !== this.utcDay) {
      this.utcDay = day;
      this.globalSendsToday = 0;
      this.campaignSendsToday = 0;
      this.domainSendsToday = 0;
    }
  }

  private decisionInput(): SequenceDecisionInput {
    return {
      leadId: "lead_clock",
      lead: this.lead,
      alreadySentSteps: this.sent.map((s) => s.step),
      now: this.now,
      sendingPaused: this.sendingPaused,
      campaignStatus: this.campaignStatus,
      globalSendsToday: this.globalSendsToday,
      campaignSendsToday: this.campaignSendsToday,
      domainSendsToday: this.domainSendsToday,
      globalDailyCap: this.globalDailyCap,
      campaignDailyCap: this.campaignDailyCap,
      domainDailyCap: this.domainDailyCap,
    };
  }
}

describe("sequence engine", () => {
  it("sends exactly three emails on a simulated Day 0 / +3 / +7 clock", () => {
    const clock = new SequenceClock(new Date("2026-01-01T00:00:00Z"));

    for (let day = 0; day <= 7; day++) {
      clock.tick();
      if (day < 7) clock.advanceDays(1);
    }

    expect(clock.sent.map((s) => s.step)).toEqual([0, 3, 7]);
    expect(clock.sent).toHaveLength(3);
    expect(clock.sent[0]?.at.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(clock.sent[1]?.at.toISOString()).toBe("2026-01-04T00:00:00.000Z");
    expect(clock.sent[2]?.at.toISOString()).toBe("2026-01-08T00:00:00.000Z");
  });

  it("cancels the remainder when a reply is injected after step one", () => {
    const clock = new SequenceClock(new Date("2026-01-01T00:00:00Z"));
    clock.tick();
    expect(clock.sent.map((s) => s.step)).toEqual([0]);

    clock.injectReply();
    clock.advanceDays(3);
    clock.tick();
    clock.advanceDays(4);
    clock.tick();

    expect(clock.sent).toHaveLength(1);
    expect(clock.sent[0]?.step).toBe(0);
  });

  it("refuses a send that would exceed the hard 450 UTC-day cap", () => {
    const base: SequenceDecisionInput = {
      leadId: "lead_cap",
      lead: { status: "ready", email: "a@b.com" },
      campaignStatus: "running",
      now: new Date("2026-06-01T15:00:00Z"),
      globalSendsToday: HARD_GLOBAL_DAILY_CAP,
      campaignSendsToday: 0,
      domainSendsToday: 0,
      globalDailyCap: HARD_GLOBAL_DAILY_CAP,
      campaignDailyCap: 25,
    };

    expect(decideSequenceSend(base)).toEqual({ action: "skip", reason: "global_cap" });
    expect(
      decideSequenceSend({
        ...base,
        globalSendsToday: HARD_GLOBAL_DAILY_CAP - 1,
      }).action,
    ).toBe("send");
    expect(
      decideSequenceSend({
        ...base,
        globalSendsToday: HARD_GLOBAL_DAILY_CAP,
        globalDailyCap: 10_000,
      }),
    ).toEqual({ action: "skip", reason: "global_cap" });
  });

  it("clamps per-campaign caps to the effective global cap and never above 450", () => {
    expect(clampGlobalDailyCap(10_000)).toBe(HARD_GLOBAL_DAILY_CAP);
    expect(clampGlobalDailyCap(50)).toBe(50);
    expect(clampCampaignDailyCap(25, 50)).toBe(25);
    expect(clampCampaignDailyCap(500, 50)).toBe(50);
    expect(clampCampaignDailyCap(500, 10_000)).toBe(HARD_GLOBAL_DAILY_CAP);

    const blocked = decideSequenceSend({
      leadId: "lead_campaign_cap",
      lead: { status: "ready", email: "a@b.com" },
      campaignStatus: "running",
      globalSendsToday: 0,
      campaignSendsToday: 25,
      domainSendsToday: 0,
      globalDailyCap: HARD_GLOBAL_DAILY_CAP,
      campaignDailyCap: 25,
    });
    expect(blocked).toEqual({ action: "skip", reason: "campaign_cap" });
  });

  it("throttles per recipient domain and stops on pause, bounce, or unsubscribe", () => {
    expect(recipientDomain("Owner@Biz.Example")).toBe("biz.example");

    const domainBlocked = decideSequenceSend({
      leadId: "lead_domain",
      lead: { status: "ready", email: "a@biz.example" },
      campaignStatus: "running",
      globalSendsToday: 0,
      campaignSendsToday: 0,
      domainSendsToday: 1,
      globalDailyCap: HARD_GLOBAL_DAILY_CAP,
      campaignDailyCap: 25,
      domainDailyCap: 1,
    });
    expect(domainBlocked).toEqual({ action: "skip", reason: "domain_throttle" });

    expect(
      decideSequenceSend({
        leadId: "lead_pause",
        lead: { status: "ready", email: "a@b.com" },
        sendingPaused: true,
        campaignStatus: "running",
        globalSendsToday: 0,
        campaignSendsToday: 0,
        domainSendsToday: 0,
        globalDailyCap: HARD_GLOBAL_DAILY_CAP,
        campaignDailyCap: 25,
      }),
    ).toEqual({ action: "skip", reason: "paused" });

    expect(
      decideSequenceSend({
        leadId: "lead_campaign_pause",
        lead: { status: "sequenced", email: "a@b.com" },
        campaignStatus: "paused",
        alreadySentSteps: [0],
        globalSendsToday: 0,
        campaignSendsToday: 0,
        domainSendsToday: 0,
        globalDailyCap: HARD_GLOBAL_DAILY_CAP,
        campaignDailyCap: 25,
      }),
    ).toEqual({ action: "skip", reason: "campaign_paused" });

    expect(
      decideSequenceSend({
        leadId: "lead_bounce",
        lead: { status: "sequenced", email: "a@b.com", hasBounced: true },
        campaignStatus: "running",
        alreadySentSteps: [0],
        globalSendsToday: 0,
        campaignSendsToday: 0,
        domainSendsToday: 0,
        globalDailyCap: HARD_GLOBAL_DAILY_CAP,
        campaignDailyCap: 25,
      }),
    ).toEqual({ action: "skip", reason: "bounced" });

    expect(
      decideSequenceSend({
        leadId: "lead_unsub",
        lead: { status: "ready", email: "a@b.com", suppressed: true },
        campaignStatus: "running",
        globalSendsToday: 0,
        campaignSendsToday: 0,
        domainSendsToday: 0,
        globalDailyCap: HARD_GLOBAL_DAILY_CAP,
        campaignDailyCap: 25,
      }),
    ).toEqual({ action: "skip", reason: "suppressed" });
  });

  it("is idempotent per (lead, step)", () => {
    expect(idempotencyKeyForSend("abc", 0)).toBe("lead:abc:step:0");
    expect(idempotencyKeyForSend("abc", 3)).toBe("lead:abc:step:3");

    const second = decideSequenceSend({
      leadId: "abc",
      lead: {
        status: "sequenced",
        email: "a@b.com",
        sequenceStartedAt: new Date("2026-01-01T00:00:00Z"),
      },
      alreadySentSteps: [0],
      now: new Date("2026-01-01T01:00:00Z"),
      campaignStatus: "running",
      globalSendsToday: 1,
      campaignSendsToday: 1,
      domainSendsToday: 1,
      globalDailyCap: HARD_GLOBAL_DAILY_CAP,
      campaignDailyCap: 25,
    });
    expect(second).toEqual({ action: "skip", reason: "not_due" });
  });

  it("uses UTC day boundaries for the global cap", () => {
    const justBeforeUtcMidnight = new Date("2026-06-02T00:00:00Z");
    const stillMondayUtc = new Date("2026-06-01T23:59:59Z");
    expect(startOfUtcDay(stillMondayUtc).toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(startOfUtcDay(justBeforeUtcMidnight).toISOString()).toBe("2026-06-02T00:00:00.000Z");
  });
});
