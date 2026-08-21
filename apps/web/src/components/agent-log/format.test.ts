import { describe, expect, it } from "vitest";
import { formatCost, formatDuration, formatTokens, redactValue, toPrettyJson } from "./format";

describe("redactValue", () => {
  it("redacts secret-looking keys", () => {
    const out = redactValue({
      apiKey: "sk-live-12345",
      RESEND_API_KEY: "re_abc",
      password: "hunter2",
      stripeToken: "tok_123",
      leadId: "lead_1",
    }) as Record<string, unknown>;
    expect(out.apiKey).toBe("[redacted]");
    expect(out.RESEND_API_KEY).toBe("[redacted]");
    expect(out.password).toBe("[redacted]");
    expect(out.stripeToken).toBe("[redacted]");
    expect(out.leadId).toBe("lead_1");
  });

  it("hides email bodies and transcripts", () => {
    const out = redactValue({
      subject: "Quick website idea",
      bodyText: "full email body here",
      bodyHtml: "<p>full email body</p>",
      body_html: "<p>another body</p>",
      transcript: [{ role: "prospect", text: "hello" }],
    }) as Record<string, unknown>;
    expect(out.subject).toBe("Quick website idea");
    expect(out.bodyText).toBe("[content hidden]");
    expect(out.bodyHtml).toBe("[content hidden]");
    expect(out.body_html).toBe("[content hidden]");
    expect(out.transcript).toBe("[content hidden]");
  });

  it("truncates long strings", () => {
    const out = redactValue({ note: "x".repeat(1000) }) as { note: string };
    expect(out.note.length).toBeLessThan(400);
    expect(out.note.endsWith("… [truncated]")).toBe(true);
  });

  it("recurses into nested objects and arrays", () => {
    const out = redactValue({
      steps: [{ apiKey: "secret", ok: true }],
      nested: { inner: { token: "abc" } },
    }) as { steps: Array<Record<string, unknown>>; nested: { inner: { token: string } } };
    expect(out.steps[0]!.apiKey).toBe("[redacted]");
    expect(out.steps[0]!.ok).toBe(true);
    expect(out.nested.inner.token).toBe("[redacted]");
  });
});

describe("toPrettyJson", () => {
  it("returns null for empty payloads", () => {
    expect(toPrettyJson(null)).toBeNull();
    expect(toPrettyJson(undefined)).toBeNull();
  });

  it("pretty-prints with redaction applied", () => {
    const json = toPrettyJson({ apiKey: "secret", count: 2 });
    expect(json).toContain('"[redacted]"');
    expect(json).toContain('"count": 2');
    expect(json).not.toContain("secret");
  });
});

describe("formatters", () => {
  it("formats durations", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(250)).toBe("250ms");
    expect(formatDuration(2500)).toBe("2.5s");
    expect(formatDuration(125_000)).toBe("2m 5s");
  });

  it("formats micro-USD costs", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(0)).toBe("$0.00");
    expect(formatCost(1234)).toBe("$0.0012");
    expect(formatCost(2_500_000)).toBe("$2.50");
  });

  it("formats token pairs", () => {
    expect(formatTokens(null, null)).toBeNull();
    expect(formatTokens(1200, 340)).toBe("1200/340");
  });
});
