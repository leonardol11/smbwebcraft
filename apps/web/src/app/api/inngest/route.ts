import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { listJobs, runJob } from "@/jobs";

// One Inngest function per registered job, each with durable retries.
// The handler delegates to runJob so job_runs bookkeeping is identical
// whether a job runs inline (fake mode) or through Inngest (live mode).
const functions = listJobs().map((name) =>
  inngest.createFunction(
    { id: name.replaceAll(".", "-"), retries: 3, triggers: [{ event: `app/${name}` }] },
    async ({ event }: { event: { data: unknown } }) => {
      const result = await runJob(name, event.data);
      if (!result.ok && !result.paused) {
        throw new Error(result.error);
      }
      return result;
    },
  ),
);

export const { GET, POST, PUT } = serve({ client: inngest, functions });
