import { setSetting } from "@outreach/db";
import { createEmailClient, fromAddress } from "@outreach/email";
import { env } from "@outreach/env";
import {
  computeHealth,
  readLastHealthAlert,
  reasonsKeyFor,
  shouldSendAlert,
  writeLastHealthAlert,
  type Health,
} from "@/lib/health";
import { defineJob } from "./core";

export type HealthCheckResult = {
  status: Health["status"];
  reasons: string[];
  alerted: boolean;
  autoPausedSending: boolean;
  skippedReason?: string;
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * health.check — recompute health; when red, auto-pause sending on a
 * deliverability red and email ALERT_EMAIL (once per distinct reason-set / 6h).
 */
export const healthCheck = defineJob("health.check", async (_input, { db }): Promise<HealthCheckResult> => {
  const health = await computeHealth(db);
  const out: HealthCheckResult = {
    status: health.status,
    reasons: health.reasons,
    alerted: false,
    autoPausedSending: false,
  };
  if (health.status !== "red") return out;

  if (health.bounceRed) {
    const { getSetting } = await import("@outreach/db");
    const already = await getSetting(db, "sending_paused");
    if (!already) {
      await setSetting(db, "sending_paused", true);
      out.autoPausedSending = true;
    }
  }

  const alertEmail = env().ALERT_EMAIL;
  if (!alertEmail) {
    out.skippedReason = "ALERT_EMAIL not set";
    return out;
  }

  const reasonsKey = reasonsKeyFor(health);
  const last = await readLastHealthAlert(db);
  if (!shouldSendAlert(last, reasonsKey)) {
    out.skippedReason = "rate-limited";
    return out;
  }

  const lines = [...health.reasons];
  if (out.autoPausedSending) lines.push("Outbound sending was AUTOMATICALLY PAUSED (bounce/complaint rate red).");
  const appUrl = env().APP_URL;
  const text = [
    "Outreach health is RED.",
    "",
    ...lines.map((l) => `- ${l}`),
    "",
    `Dashboard: ${appUrl}/settings`,
  ].join("\n");
  const html = `<p><strong>Outreach health is RED.</strong></p><ul>${lines
    .map((l) => `<li>${escapeHtml(l)}</li>`)
    .join("")}</ul><p><a href="${appUrl}/settings">Open settings</a></p>`;

  await createEmailClient().send({
    to: alertEmail,
    from: fromAddress(),
    subject: `[Outreach] RED health alert: ${health.reasons[0] ?? "see details"}`,
    text,
    html,
  });
  await writeLastHealthAlert(db, { reasonsKey, sentAt: new Date().toISOString() });
  out.alerted = true;
  return out;
});
