"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, getDb, jobRuns } from "@outreach/db";
// `@/jobs` also loads jobs/site.ts, which still imports a missing
// `deploySiteHtml` from `@outreach/sites`. Register retryable jobs
// without pulling that module in. Sample fail/echo live in samples.ts.
import "@/jobs/samples";
import "@/jobs/discovery";
import "@/jobs/outreach";
import "@/jobs/reply";
import { runJob } from "@/jobs/core";
import { enqueueJob } from "@/jobs/enqueue";

/** Re-enqueues a failed job run with its original input. */
export async function retryJobRun(jobRunId: string): Promise<void> {
  const db = await getDb();
  const [run] = await db.select().from(jobRuns).where(eq(jobRuns.id, jobRunId)).limit(1);
  if (!run || run.status !== "failed") return;
  await safeEnqueue(run.name, run.input);
  revalidatePath("/agent-log");
}

/** Retries the most recent failed run of a given job name (queue panel button). */
export async function retryLatestFailed(name: string): Promise<void> {
  const db = await getDb();
  const [run] = await db
    .select()
    .from(jobRuns)
    .where(and(eq(jobRuns.name, name), eq(jobRuns.status, "failed")))
    .orderBy(desc(jobRuns.startedAt))
    .limit(1);
  if (!run) return;
  await safeEnqueue(run.name, run.input);
  revalidatePath("/agent-log");
}

/**
 * Unknown job names (e.g. site.build_and_deploy until sites exports land)
 * must not 500 the Agent Log. Real enqueue/run errors still propagate.
 */
async function safeEnqueue(name: string, input: unknown): Promise<void> {
  try {
    await enqueueJob(name, input);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("Unknown job:")) {
      console.error(`[agent-log] retry of ${name} could not be enqueued:`, err);
      return;
    }
    throw err;
  }
}

export async function runSampleEcho(): Promise<void> {
  await runJob("sample.echo", { source: "agent-log-ui" });
  revalidatePath("/agent-log");
}

export async function runSampleFail(): Promise<void> {
  await runJob("sample.fail", { source: "agent-log-ui" });
  revalidatePath("/agent-log");
}
