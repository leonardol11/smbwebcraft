import { beforeAll, describe, expect, it } from "vitest";
import { agentActions, createTestDb, jobRuns, setDbForTests, type Db } from "@outreach/db";
import { getAgentStats, getLogEntries, getQueueStats } from "./data";

let db: Db;

beforeAll(async () => {
  db = await createTestDb();
  setDbForTests(db);

  await db.insert(agentActions).values([
    {
      agent: "reply",
      action: "send_reply",
      status: "ok",
      input: { apiKey: "sk-secret", subject: "hi" },
      output: { sent: true },
      tokensIn: 10,
      tokensOut: 20,
      costMicroUsd: 1_500,
      durationMs: 40,
    },
    {
      agent: "reply",
      action: "send_reply",
      status: "error",
      errorStack: "Error: policy\n    at guard (policy.ts:1:1)",
      durationMs: 12,
    },
  ]);
  await db.insert(jobRuns).values([
    {
      name: "sample.echo",
      status: "completed",
      input: { source: "test" },
      durationMs: 5,
    },
    {
      name: "sample.fail",
      status: "failed",
      input: { password: "hunter2", source: "test" },
      error: "Error: Intentional sample failure\n    at sampleFail (samples.ts:8:9)",
      durationMs: 9,
    },
  ]);
});

describe("getLogEntries", () => {
  it("merges actions and jobs, newest first", async () => {
    const entries = await getLogEntries({ errorsOnly: false, kind: "all" });
    expect(entries.some((e) => e.kind === "action")).toBe(true);
    expect(entries.some((e) => e.kind === "job")).toBe(true);
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i - 1]!.at >= entries[i]!.at).toBe(true);
    }
  });

  it("errors-only filter keeps failed jobs and error actions, with stacks", async () => {
    const entries = await getLogEntries({ errorsOnly: true, kind: "all" });
    expect(entries.length).toBe(2);
    expect(entries.every((e) => e.isError)).toBe(true);

    const job = entries.find((e) => e.kind === "job");
    expect(job?.name).toBe("sample.fail");
    expect(job?.canRetry).toBe(true);
    expect(job?.errorStack).toContain("Intentional sample failure");
    expect(job?.errorStack).toMatch(/\n\s+at /);
    expect(job?.input).toContain("[redacted]");
    expect(job?.input).not.toContain("hunter2");

    const action = entries.find((e) => e.kind === "action");
    expect(action?.errorStack).toContain("policy");
    expect(action?.canRetry).toBe(false);
  });

  it("redacts secrets on successful action payloads", async () => {
    const entries = await getLogEntries({ errorsOnly: false, kind: "actions" });
    const ok = entries.find((e) => e.status === "ok");
    expect(ok?.input).toContain("[redacted]");
    expect(ok?.input).not.toContain("sk-secret");
    expect(ok?.output).toContain('"sent": true');
  });
});

describe("getAgentStats + getQueueStats", () => {
  it("rolls up per-agent cost and duration over 24h", async () => {
    const stats = await getAgentStats();
    const reply = stats.find((s) => s.agent === "reply");
    expect(reply).toMatchObject({ runs: 2, errors: 1, totalCostMicroUsd: 1_500 });
    expect(reply?.avgDurationMs).toBeGreaterThan(0);
  });

  it("counts running/failed/completed per job name", async () => {
    const queue = await getQueueStats();
    expect(queue.find((s) => s.name === "sample.fail")).toMatchObject({
      pending: 0,
      running: 0,
      failed: 1,
      completed: 0,
    });
    expect(queue.find((s) => s.name === "sample.echo")).toMatchObject({
      completed: 1,
      failed: 0,
    });
  });
});
