import { beforeEach, describe, expect, it } from "vitest";
import { loadEnv, resetEnvForTests } from "@outreach/env";
import {
  buildListUnsubscribeHeaders,
  buildThreadingHeaders,
  clearFakeSentEmails,
  createEmailClient,
  fromAddress,
  getEmailClient,
  getFakeSentEmails,
  plusAddress,
  resetEmailClientForTests,
} from "./client";

beforeEach(() => {
  resetEnvForTests();
  resetEmailClientForTests();
  process.env.PROVIDER_MODE = "fake";
  process.env.SENDING_DOMAIN = "mail.example.com";
  process.env.SENDER_LOCAL_PART = "hello";
  process.env.SENDER_NAME = "Sam";
  loadEnv(process.env);
});

describe("address helpers", () => {
  it("builds plus-address Reply-To for a lead", () => {
    expect(plusAddress("abc-123")).toBe("hello+lead_abc-123@mail.example.com");
  });

  it("builds From header with sender name", () => {
    expect(fromAddress()).toBe("Sam <hello@mail.example.com>");
  });
});

describe("header builders", () => {
  it("builds In-Reply-To and References threading headers", () => {
    const headers = buildThreadingHeaders({
      inReplyTo: "<msg-1@mail.example.com>",
      references: ["<msg-0@mail.example.com>", "<msg-1@mail.example.com>"],
    });
    expect(headers["In-Reply-To"]).toBe("<msg-1@mail.example.com>");
    expect(headers.References).toBe("<msg-0@mail.example.com> <msg-1@mail.example.com>");
  });

  it("omits threading headers for a first touch", () => {
    expect(buildThreadingHeaders({})).toEqual({});
  });

  it("builds RFC 8058 one-click unsubscribe headers", () => {
    const headers = buildListUnsubscribeHeaders("https://app.example.com/u/tok123");
    expect(headers["List-Unsubscribe"]).toBe("<https://app.example.com/u/tok123>");
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
});

describe("fake email client", () => {
  it("stores sent emails in memory", async () => {
    clearFakeSentEmails();
    const client = getEmailClient();

    await client.send({
      to: "owner@biz.com",
      from: fromAddress(),
      subject: "Test",
      html: "<p>Hi</p>",
      text: "Hi",
      idempotencyKey: "lead:1:step:0",
    });

    const sent = getFakeSentEmails();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("owner@biz.com");
    expect(sent[0]?.idempotencyKey).toBe("lead:1:step:0");
    expect(sent[0]?.messageId).toMatch(/^fake-/);
  });

  it("is injectable independently of env via createEmailClient('fake')", async () => {
    const client = createEmailClient("fake");
    await client.send({
      to: "owner@biz.com",
      from: fromAddress(),
      subject: "Injected fake",
      html: "<p>Hi</p>",
      text: "Hi",
    });
    expect(getFakeSentEmails()).toHaveLength(1);
  });

  it("sends with threading headers, idempotency key, and plus-address Reply-To", async () => {
    const client = getEmailClient();
    const leadId = "8fa32";

    await client.send({
      to: "owner@biz.com",
      from: fromAddress(),
      replyTo: plusAddress(leadId),
      subject: "Re: Quick website idea",
      html: "<p>Following up</p>",
      text: "Following up",
      headers: {
        ...buildThreadingHeaders({
          inReplyTo: "<day0@mail.example.com>",
          references: ["<day0@mail.example.com>"],
        }),
        ...buildListUnsubscribeHeaders("https://app.example.com/u/tok123"),
      },
      idempotencyKey: `lead:${leadId}:step:3`,
    });

    const sent = getFakeSentEmails().at(-1);
    expect(sent?.replyTo).toBe("hello+lead_8fa32@mail.example.com");
    expect(sent?.idempotencyKey).toBe("lead:8fa32:step:3");
    expect(sent?.headers?.["In-Reply-To"]).toBe("<day0@mail.example.com>");
    expect(sent?.headers?.References).toBe("<day0@mail.example.com>");
    expect(sent?.headers?.["List-Unsubscribe"]).toBe("<https://app.example.com/u/tok123>");
    expect(sent?.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(sent?.messageId).toBeTruthy();
  });
});
