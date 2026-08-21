import { beforeAll, describe, expect, it, vi } from "vitest";
import { desc, eq, createTestDb, jobRuns, setDbForTests, type Db } from "@outreach/db";
import { retryJobRun, retryLatestFailed, runSampleFail } from "./actions";
import { getLogEntries, getQueueStats } from "./data";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let db: Db;

beforeAll(async () => {
  db = await createTestDb();
  setDbForTests(db);
});

describe("sample.fail + retry (T26 Done-when)", () => {
  it("records a stack trace and can be retried", async () => {
    await runSampleFail();

    const afterFail = await db
      .select()
      .from(jobRuns)
      .where(eq(jobRuns.name, "sample.fail"))
      .orderBy(desc(jobRuns.startedAt));
    expect(afterFail.length).toBeGreaterThanOrEqual(1);
    const original = afterFail[0]!;
    expect(original.status).toBe("failed");
    expect(original.error).toContain("Intentional sample failure");
    expect(original.error).toMatch(/\n\s+at /);

    const entries = await getLogEntries({ errorsOnly: true, kind: "jobs" });
    const logged = entries.find((e) => e.id === original.id);
    expect(logged).toMatchObject({ kind: "job", isError: true, canRetry: true });
    expect(logged?.errorStack).toContain("Intentional sample failure");
    expect(logged?.errorStack).toMatch(/\n\s+at /);

    await retryJobRun(original.id);

    const afterRetry = await db
      .select()
      .from(jobRuns)
      .where(eq(jobRuns.name, "sample.fail"))
      .orderBy(desc(jobRuns.startedAt));
    expect(afterRetry.length).toBe(afterFail.length + 1);
    const retried = afterRetry[0]!;
    expect(retried.id).not.toBe(original.id);
    expect(retried.status).toBe("failed");
    expect(retried.error).toContain("Intentional sample failure");
    expect(retried.error).toMatch(/\n\s+at /);
  });

  it("queue panel retry re-runs the latest failed job of that name", async () => {
    const before = await db.select().from(jobRuns).where(eq(jobRuns.name, "sample.fail"));
    await retryLatestFailed("sample.fail");
    const after = await db.select().from(jobRuns).where(eq(jobRuns.name, "sample.fail"));
    expect(after.length).toBe(before.length + 1);

    const queue = await getQueueStats();
    const sample = queue.find((s) => s.name === "sample.fail");
    expect(sample?.failed).toBeGreaterThanOrEqual(2);
    expect(sample?.running).toBe(0);
  });
});
