import { eq } from "drizzle-orm";
import { getDb, jobRuns, PausedError, type Db } from "@outreach/db";

export type JobContext = { db: Db };
export type JobHandler = (input: any, ctx: JobContext) => Promise<unknown>;

const registry = new Map<string, JobHandler>();

export function defineJob(name: string, handler: JobHandler): { name: string } {
  registry.set(name, handler);
  return { name };
}

export function listJobs(): string[] {
  return [...registry.keys()];
}

export type JobResult =
  | { ok: true; jobRunId: string; result: unknown }
  | { ok: false; jobRunId: string; error: string; paused?: boolean };

/**
 * Executes a registered job with full job_runs bookkeeping:
 * a row at start, then status/duration/error (with stack) at the end.
 */
export async function runJob(name: string, input: unknown): Promise<JobResult> {
  const handler = registry.get(name);
  if (!handler) throw new Error(`Unknown job: ${name}`);
  const db = await getDb();
  const started = Date.now();
  const [row] = await db
    .insert(jobRuns)
    .values({ name, status: "running", input: input ?? null })
    .returning();
  const jobRunId = row!.id;
  try {
    const result = await handler(input, { db });
    await db
      .update(jobRuns)
      .set({ status: "completed", finishedAt: new Date(), durationMs: Date.now() - started })
      .where(eq(jobRuns.id, jobRunId));
    return { ok: true, jobRunId, result };
  } catch (err) {
    const error = err instanceof Error ? (err.stack ?? err.message) : String(err);
    await db
      .update(jobRuns)
      .set({
        status: "failed",
        error,
        finishedAt: new Date(),
        durationMs: Date.now() - started,
      })
      .where(eq(jobRuns.id, jobRunId));
    return {
      ok: false,
      jobRunId,
      error: err instanceof Error ? err.message : String(err),
      paused: err instanceof PausedError,
    };
  }
}
