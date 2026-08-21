import { defineJob } from "./core";

/** Diagnostic jobs used to verify queue plumbing from the UI. */
export const sampleEcho = defineJob("sample.echo", async (input) => {
  return { echoed: input ?? null, at: new Date().toISOString() };
});

export const sampleFail = defineJob("sample.fail", async () => {
  throw new Error("Intentional sample failure (for testing the Agent Log)");
});
