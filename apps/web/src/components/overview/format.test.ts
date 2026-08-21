import { describe, expect, it } from "vitest";
import {
  formatActivitySummary,
  formatCityTag,
  formatFeedTime,
  formatPercent,
} from "./format";
import { OVERVIEW_POLL_MS } from "./constants";

describe("formatActivitySummary", () => {
  it("matches the plan example: city-tagged reply with checkout", () => {
    expect(
      formatActivitySummary({
        agent: "reply",
        action: "run_reply_agent",
        detail: "send_payment_link",
        businessName: "Bella Nails",
      }),
    ).toBe("replied to Bella Nails — sent checkout link");
  });

  it("falls back to agent verb + business name", () => {
    expect(
      formatActivitySummary({
        agent: "outreach",
        action: "send_day_0",
        businessName: "Tony's Plumbing",
      }),
    ).toBe("emailed Tony's Plumbing");
  });

  it("omits redundant 'sent reply' suffix", () => {
    expect(
      formatActivitySummary({
        agent: "reply",
        action: "run_reply_agent",
        detail: "send_reply",
        businessName: "Bella Nails",
      }),
    ).toBe("replied to Bella Nails");
  });
});

describe("formatCityTag + formatFeedTime", () => {
  it("joins city and ZIP", () => {
    expect(formatCityTag("Austin", "78704")).toBe("Austin 78704");
    expect(formatCityTag("Austin", null)).toBe("Austin");
    expect(formatCityTag(null, "78704")).toBe("78704");
    expect(formatCityTag(null, null)).toBeNull();
  });

  it("renders 24h HH:MM", () => {
    expect(formatFeedTime(new Date("2026-08-20T18:42:00"))).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("formatPercent", () => {
  it("shows one decimal", () => {
    expect(formatPercent(0.124)).toBe("12.4%");
    expect(formatPercent(0)).toBe("0.0%");
  });
});

describe("live refresh", () => {
  it("polls every 5 seconds", () => {
    expect(OVERVIEW_POLL_MS).toBe(5_000);
  });
});
