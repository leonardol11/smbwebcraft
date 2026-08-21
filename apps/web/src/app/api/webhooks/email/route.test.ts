import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createTestDb, inboundEmails, setDbForTests, type Db } from "@outreach/db";

vi.mock("@/jobs/enqueue", () => ({
  enqueueJob: vi.fn(async () => ({ queued: true as const })),
}));

import { enqueueJob } from "@/jobs/enqueue";
import { POST } from "./route";
import { POST as replay } from "./replay/route";
import { parseInboundFields } from "./persist";

const enqueueMock = vi.mocked(enqueueJob);
const dir = dirname(fileURLToPath(import.meta.url));

let db: Db;

function postInbound(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return POST(
    new NextRequest("http://localhost/api/webhooks/email", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: raw,
    }),
  );
}

function inboundPayload(i: number) {
  return {
    type: "email.received",
    data: {
      from: `Owner ${i} <owner${i}@biz.test>`,
      to: [`hello+lead_${i}@mail.example.com`],
      subject: `Re: website idea ${i}`,
      message_id: `<msg-${i}@biz.test>`,
      text: `Hello from lead ${i}`,
      html: `<p>Hello from lead ${i}</p>`,
      headers: {
        "in-reply-to": `<orig-${i}@mail.example.com>`,
        references: `<orig-${i}@mail.example.com>`,
      },
    },
  };
}

beforeAll(async () => {
  db = await createTestDb();
  setDbForTests(db);
});

beforeEach(() => {
  enqueueMock.mockReset();
  enqueueMock.mockResolvedValue({ queued: true });
});

describe("parseInboundFields", () => {
  it("extracts bare emails from Resend-style from/to fields", () => {
    expect(
      parseInboundFields({
        data: {
          from: "Acme <owner@acme.test>",
          to: ["hello+lead_abc@mail.example.com"],
          subject: "Hi",
          text: "body",
        },
      }),
    ).toMatchObject({
      fromEmail: "owner@acme.test",
      toEmail: "hello+lead_abc@mail.example.com",
      subject: "Hi",
      bodyText: "body",
    });
  });
});

describe("POST /api/webhooks/email", () => {
  it("does not import the reply agent or jobs barrel", () => {
    const routeSrc = readFileSync(join(dir, "route.ts"), "utf8");
    const persistSrc = readFileSync(join(dir, "persist.ts"), "utf8");
    const replaySrc = readFileSync(join(dir, "replay/route.ts"), "utf8");
    for (const src of [routeSrc, persistSrc, replaySrc]) {
      expect(src).not.toMatch(/@outreach\/agents/);
      expect(src).not.toMatch(/runReplyAgent|matchInbound/);
      expect(src).not.toMatch(/anthropic/i);
      expect(src).not.toMatch(/from ["']@\/jobs["']/);
    }
    expect(persistSrc).toContain("@/jobs/enqueue");
    expect(persistSrc).toContain("email.process_inbound");
  });

  it("returns 200 without waiting for enqueue (no LLM in the request)", async () => {
    let release: (value: { queued: true }) => void = () => undefined;
    enqueueMock.mockImplementation(
      () =>
        new Promise<{ queued: true }>((resolve) => {
          release = resolve;
        }),
    );
    const started = Date.now();
    const res = await postInbound(inboundPayload(0));
    expect(res.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(1000);
    const json = (await res.json()) as { ok: boolean; id: string };
    expect(json.ok).toBe(true);
    const rows = await db.select().from(inboundEmails);
    expect(rows.some((r) => r.id === json.id)).toBe(true);
    expect(enqueueMock).toHaveBeenCalledWith("email.process_inbound", { inboundEmailId: json.id });
    release({ queued: true });
  });

  it("stores 50 concurrent posts and enqueues process_inbound only", async () => {
    const before = await db.select().from(inboundEmails);
    const beforeIds = new Set(before.map((r) => r.id));

    const responses = await Promise.all(
      Array.from({ length: 50 }, (_, i) => postInbound(inboundPayload(i + 1))),
    );

    expect(responses.map((r) => r.status)).toEqual(Array(50).fill(200));
    const bodies = (await Promise.all(responses.map((r) => r.json()))) as { id: string }[];
    const ids = bodies.map((b) => b.id);
    expect(new Set(ids).size).toBe(50);

    const rows = await db.select().from(inboundEmails);
    const created = rows.filter((r) => !beforeIds.has(r.id));
    expect(created).toHaveLength(50);
    expect(created.every((r) => r.raw != null && r.matchStatus === "pending")).toBe(true);

    expect(enqueueMock).toHaveBeenCalledTimes(50);
    for (const call of enqueueMock.mock.calls) {
      expect(call[0]).toBe("email.process_inbound");
      expect(call[1]).toEqual({ inboundEmailId: expect.any(String) });
    }
  });

  it("rejects invalid json", async () => {
    const res = await postInbound("{not-json");
    expect(res.status).toBe(400);
    expect(enqueueMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/email/replay", () => {
  it("re-enqueues a stored payload without inserting a duplicate", async () => {
    const create = await postInbound(inboundPayload(99));
    const { id } = (await create.json()) as { id: string };
    enqueueMock.mockClear();

    const res = await replay(
      new NextRequest("http://localhost/api/webhooks/email/replay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id });
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock).toHaveBeenCalledWith("email.process_inbound", { inboundEmailId: id });

    const rows = await db.select().from(inboundEmails);
    expect(rows.filter((r) => r.id === id)).toHaveLength(1);
  });

  it("returns 404 for an unknown id", async () => {
    const res = await replay(
      new NextRequest("http://localhost/api/webhooks/email/replay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "does-not-exist" }),
      }),
    );
    expect(res.status).toBe(404);
    expect(enqueueMock).not.toHaveBeenCalled();
  });
});
