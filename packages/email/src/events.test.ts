import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { loadEnv, resetEnvForTests } from "@outreach/env";
import { verifyResendWebhook, verifyResendWebhookSignature } from "./events";

const RAW = JSON.stringify({ type: "email.delivered", data: { email_id: "msg_1" } });
const SECRET = "test-webhook-secret";

beforeEach(() => {
  resetEnvForTests();
  process.env.PROVIDER_MODE = "fake";
  process.env.RESEND_WEBHOOK_SECRET = SECRET;
  loadEnv(process.env);
});

describe("verifyResendWebhook", () => {
  it("accepts any payload in fake mode", async () => {
    expect(await verifyResendWebhook(RAW, "")).toBe(true);
  });
});

describe("verifyResendWebhookSignature", () => {
  it("rejects missing signature or secret", () => {
    expect(verifyResendWebhookSignature(RAW, "", SECRET)).toBe(false);
    expect(verifyResendWebhookSignature(RAW, "v1,abcd", undefined)).toBe(false);
  });

  it("accepts a matching v1 hex HMAC", () => {
    const hex = createHmac("sha256", SECRET).update(RAW).digest("hex");
    expect(verifyResendWebhookSignature(RAW, `v1,${hex}`, SECRET)).toBe(true);
    expect(verifyResendWebhookSignature(RAW, `v1=${hex}`, SECRET)).toBe(true);
    expect(verifyResendWebhookSignature(RAW, "v1," + "aa".repeat(32), SECRET)).toBe(false);
  });
});
