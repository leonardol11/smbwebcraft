import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { settings } from "./schema";

export type AppSettings = {
  sending_paused: boolean;
  reply_agent_paused: boolean;
  discovery_paused: boolean;
  global_daily_send_cap: number;
  max_agent_replies_per_lead_per_day: number;
  setup_price_cents: number;
  monthly_price_cents: number;
  reply_delay_seconds: number;
  suspend_after_days_past_due: number;
};

export const DEFAULT_SETTINGS: AppSettings = {
  sending_paused: false,
  reply_agent_paused: false,
  discovery_paused: false,
  global_daily_send_cap: 50,
  max_agent_replies_per_lead_per_day: 4,
  setup_price_cents: 10000,
  monthly_price_cents: 2500,
  reply_delay_seconds: 60,
  suspend_after_days_past_due: 10,
};

export async function getSettings(db: Db): Promise<AppSettings> {
  const rows = await db.select().from(settings);
  const merged: AppSettings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (row.key in merged) {
      (merged as Record<string, unknown>)[row.key] = row.value;
    }
  }
  return merged;
}

export async function getSetting<K extends keyof AppSettings>(
  db: Db,
  key: K,
): Promise<AppSettings[K]> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  if (!row) return DEFAULT_SETTINGS[key];
  return row.value as AppSettings[K];
}

export async function setSetting<K extends keyof AppSettings>(
  db: Db,
  key: K,
  value: AppSettings[K],
): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}

/** Thrown by assertNotPaused when a kill switch is on. */
export class PausedError extends Error {
  constructor(flag: string) {
    super(`Operation aborted: kill switch "${flag}" is on`);
    this.name = "PausedError";
  }
}

/**
 * Guard used by every worker before doing side effects.
 * Throws PausedError when the given kill switch is enabled.
 */
export async function assertNotPaused(
  db: Db,
  flag: "sending_paused" | "reply_agent_paused" | "discovery_paused",
): Promise<void> {
  const paused = await getSetting(db, flag);
  if (paused) throw new PausedError(flag);
}
