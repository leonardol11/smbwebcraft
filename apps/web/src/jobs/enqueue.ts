import { env } from "@outreach/env";
import { inngest } from "@/inngest/client";
import { runJob, type JobResult } from "./core";

/**
 * Dispatches a job. In live mode it goes through Inngest (durable retries);
 * in fake/dev mode it executes inline so everything works offline.
 *
 * `delaySeconds` defers delivery in live mode (Inngest honours a future `ts`);
 * in fake mode the job still runs inline so tests stay synchronous.
 */
export async function enqueueJob(
  name: string,
  input: unknown,
  options: { delaySeconds?: number } = {},
): Promise<{ queued: true } | JobResult> {
  if (env().PROVIDER_MODE === "live") {
    const delay = Math.max(0, options.delaySeconds ?? 0);
    await inngest.send({
      name: `app/${name}`,
      data: input ?? {},
      ...(delay > 0 ? { ts: Date.now() + delay * 1000 } : {}),
    });
    return { queued: true };
  }
  return runJob(name, input);
}
