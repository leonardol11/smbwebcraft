import {
  agentActions,
  and,
  emailEvents,
  eq,
  getSettings,
  gte,
  inArray,
  inboundEmails,
  jobRuns,
  outreachMessages,
  settings,
  sql,
  threads,
  type Db,
} from "@outreach/db";
import { checkSendingDomainDns } from "@outreach/email";
import { env } from "@outreach/env";

export type HealthStatus = "green" | "amber" | "red";

export type HealthCheck = {
  name: string;
  status: HealthStatus;
  detail: string;
};

export type Health = {
  status: HealthStatus;
  reasons: string[];
  checks: HealthCheck[];
  /** True when the bounce/complaint check alone is red (drives auto-pause). */
  bounceRed: boolean;
  computedAt: string;
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const BOUNCE_RED_THRESHOLD = 0.05;
export const BOUNCE_AMBER_THRESHOLD = 0.02;
export const COMPLAINT_RED_THRESHOLD = 0.001;
export const MIN_SENDS_FOR_RATE = 20;
export const JOB_FAILURES_RED = 3;
export const INBOUND_SILENCE_MIN_SENDS = 50;

/** Live-mode keys that must be set; mirrors LIVE_REQUIRED in @outreach/env. */
export const LIVE_REQUIRED_KEYS = [
  "GOOGLE_PLACES_API_KEY",
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SECRET",
  "ANTHROPIC_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PAYMENT_LINK_URL",
  "HUNTER_API_KEY",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_ZONE_ID",
] as const;

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function worst(a: HealthStatus, b: HealthStatus): HealthStatus {
  const rank: Record<HealthStatus, number> = { green: 0, amber: 1, red: 2 };
  return rank[a] >= rank[b] ? a : b;
}

export type DeliveryWindow = {
  sent: number;
  bounced: number;
  complained: number;
  bounceRate: number;
  complaintRate: number;
};

/** Bounce / complaint rates over the trailing window (default 24h). */
export async function computeDeliveryWindow(db: Db, since: Date): Promise<DeliveryWindow> {
  const [msgRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(outreachMessages)
    .where(
      and(
        eq(outreachMessages.direction, "outbound"),
        gte(outreachMessages.createdAt, since),
        inArray(outreachMessages.status, ["sent", "delivered", "opened", "bounced", "complained"]),
      ),
    );
  const events = await db
    .select({ type: emailEvents.type, providerMessageId: emailEvents.providerMessageId })
    .from(emailEvents)
    .where(gte(emailEvents.createdAt, since));

  const eventIds = new Set<string>();
  const bouncedIds = new Set<string>();
  const complainedIds = new Set<string>();
  let bouncedNoId = 0;
  let complainedNoId = 0;
  for (const e of events) {
    if (e.providerMessageId) eventIds.add(e.providerMessageId);
    if (e.type === "bounced") {
      if (e.providerMessageId) bouncedIds.add(e.providerMessageId);
      else bouncedNoId += 1;
    } else if (e.type === "complained") {
      if (e.providerMessageId) complainedIds.add(e.providerMessageId);
      else complainedNoId += 1;
    }
  }

  const sent = Math.max(Number(msgRow?.n ?? 0), eventIds.size);
  const bounced = bouncedIds.size + bouncedNoId;
  const complained = complainedIds.size + complainedNoId;
  return {
    sent,
    bounced,
    complained,
    bounceRate: sent > 0 ? bounced / sent : 0,
    complaintRate: sent > 0 ? complained / sent : 0,
  };
}

export async function computeHealth(db: Db, now: Date = new Date()): Promise<Health> {
  const checks: HealthCheck[] = [];
  const e = env();
  const live = e.PROVIDER_MODE === "live";
  let bounceRed = false;

  // --- Deliverability (24h) -----------------------------------------------
  const win = await computeDeliveryWindow(db, new Date(now.getTime() - DAY));
  if (win.sent >= MIN_SENDS_FOR_RATE) {
    if (win.bounceRate > BOUNCE_RED_THRESHOLD) {
      bounceRed = true;
      checks.push({
        name: "Bounce rate",
        status: "red",
        detail: `Bounce rate ${pct(win.bounceRate)} over last 24h (${win.bounced}/${win.sent})`,
      });
    } else if (win.bounceRate >= BOUNCE_AMBER_THRESHOLD) {
      checks.push({
        name: "Bounce rate",
        status: "amber",
        detail: `Bounce rate ${pct(win.bounceRate)} over last 24h (${win.bounced}/${win.sent})`,
      });
    } else {
      checks.push({
        name: "Bounce rate",
        status: "green",
        detail: `Bounce rate ${pct(win.bounceRate)} (${win.sent} sends, 24h)`,
      });
    }
    if (win.complaintRate > COMPLAINT_RED_THRESHOLD) {
      bounceRed = true;
      checks.push({
        name: "Complaint rate",
        status: "red",
        detail: `Complaint rate ${pct(win.complaintRate)} over last 24h (${win.complained}/${win.sent})`,
      });
    } else {
      checks.push({
        name: "Complaint rate",
        status: "green",
        detail: `Complaint rate ${pct(win.complaintRate)} (24h)`,
      });
    }
  } else {
    checks.push({
      name: "Deliverability",
      status: "green",
      detail: `${win.sent} sends in last 24h (need ${MIN_SENDS_FOR_RATE} to rate)`,
    });
  }

  // --- Failing jobs (1h) ---------------------------------------------------
  const failed = await db
    .select({ name: jobRuns.name, n: sql<number>`count(*)` })
    .from(jobRuns)
    .where(and(eq(jobRuns.status, "failed"), gte(jobRuns.createdAt, new Date(now.getTime() - HOUR))))
    .groupBy(jobRuns.name);
  const hot = failed.filter((f) => Number(f.n) >= JOB_FAILURES_RED);
  if (hot.length > 0) {
    checks.push({
      name: "Jobs",
      status: "red",
      detail: `Job failing repeatedly: ${hot.map((f) => `${f.name} (${f.n}x in 1h)`).join(", ")}`,
    });
  } else {
    checks.push({ name: "Jobs", status: "green", detail: "No repeated job failures in last hour" });
  }

  // --- Live-mode config ----------------------------------------------------
  if (live) {
    const missing = LIVE_REQUIRED_KEYS.filter((k) => !process.env[k]);
    checks.push(
      missing.length > 0
        ? { name: "Config", status: "red", detail: `Missing live keys: ${missing.join(", ")}` }
        : { name: "Config", status: "green", detail: "All live provider keys set" },
    );
  } else {
    checks.push({ name: "Config", status: "green", detail: "PROVIDER_MODE=fake (offline)" });
  }

  // --- Sending domain DNS --------------------------------------------------
  if (live) {
    try {
      const dns = await checkSendingDomainDns();
      const failing = (["spf", "dkim", "dmarc"] as const).filter((k) => !dns[k].ok);
      checks.push(
        failing.length > 0
          ? {
              name: "DNS",
              status: "red",
              detail: `Sending domain ${dns.domain} DNS failing: ${failing.map((k) => k.toUpperCase()).join(", ")}`,
            }
          : { name: "DNS", status: "green", detail: `SPF/DKIM/DMARC OK for ${dns.domain}` },
      );
    } catch (err) {
      checks.push({
        name: "DNS",
        status: "red",
        detail: `DNS check failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  } else {
    checks.push({ name: "DNS", status: "green", detail: "DNS check skipped (fake mode)" });
  }

  // --- Inbound webhook silence (live only) ---------------------------------
  if (live) {
    const [out7] = await db
      .select({ n: sql<number>`count(*)` })
      .from(outreachMessages)
      .where(
        and(
          eq(outreachMessages.direction, "outbound"),
          gte(outreachMessages.createdAt, new Date(now.getTime() - 7 * DAY)),
        ),
      );
    const [in72] = await db
      .select({ n: sql<number>`count(*)` })
      .from(inboundEmails)
      .where(gte(inboundEmails.createdAt, new Date(now.getTime() - 3 * DAY)));
    const sends7 = Number(out7?.n ?? 0);
    const inbound72 = Number(in72?.n ?? 0);
    if (sends7 > INBOUND_SILENCE_MIN_SENDS && inbound72 === 0) {
      checks.push({
        name: "Inbound webhook",
        status: "amber",
        detail: `No inbound email in 72h despite ${sends7} sends in 7d — check the Resend inbound webhook`,
      });
    } else {
      checks.push({ name: "Inbound webhook", status: "green", detail: `${inbound72} inbound in 72h` });
    }
  }

  // --- Unmatched threads ---------------------------------------------------
  const [unmatched] = await db
    .select({ n: sql<number>`count(*)` })
    .from(threads)
    .where(eq(threads.status, "unmatched"));
  const unmatchedN = Number(unmatched?.n ?? 0);
  checks.push(
    unmatchedN > 0
      ? { name: "Triage", status: "amber", detail: `${unmatchedN} unmatched thread${unmatchedN === 1 ? "" : "s"} awaiting triage` }
      : { name: "Triage", status: "green", detail: "No unmatched threads" },
  );

  // --- Unhandled escalations (24h, thread still agentPaused) ---------------
  const escalations = await db
    .select({ threadId: agentActions.threadId })
    .from(agentActions)
    .where(
      and(eq(agentActions.status, "escalated"), gte(agentActions.createdAt, new Date(now.getTime() - DAY))),
    );
  const escThreadIds = [...new Set(escalations.map((r) => r.threadId).filter((x): x is string => !!x))];
  let unhandled = 0;
  if (escThreadIds.length > 0) {
    const paused = await db
      .select({ id: threads.id })
      .from(threads)
      .where(and(inArray(threads.id, escThreadIds), eq(threads.agentPaused, true)));
    unhandled = paused.length;
  }
  checks.push(
    unhandled > 0
      ? { name: "Escalations", status: "amber", detail: `${unhandled} agent escalation${unhandled === 1 ? "" : "s"} awaiting a human reply` }
      : { name: "Escalations", status: "green", detail: "No unhandled escalations (24h)" },
  );

  // --- Kill switches -------------------------------------------------------
  const s = await getSettings(db);
  const paused: string[] = [];
  if (s.sending_paused) paused.push("sending");
  if (s.reply_agent_paused) paused.push("reply agent");
  if (s.discovery_paused) paused.push("discovery");
  checks.push(
    paused.length > 0
      ? { name: "Kill switches", status: "amber", detail: `Paused: ${paused.join(", ")}` }
      : { name: "Kill switches", status: "green", detail: "Nothing paused" },
  );

  const status = checks.reduce<HealthStatus>((acc, c) => worst(acc, c.status), "green");
  const reasons = checks
    .filter((c) => c.status !== "green")
    .sort((a, b) => (a.status === "red" ? -1 : 0) - (b.status === "red" ? -1 : 0))
    .map((c) => c.detail);

  return { status, reasons, checks, bounceRed, computedAt: now.toISOString() };
}

// ---------------------------------------------------------------------------
// Alert bookkeeping (persisted in the settings table under a raw key)
// ---------------------------------------------------------------------------

export const LAST_HEALTH_ALERT_KEY = "last_health_alert";
export const ALERT_COOLDOWN_MS = 6 * HOUR;

export type LastHealthAlert = { reasonsKey: string; sentAt: string };

export async function readLastHealthAlert(db: Db): Promise<LastHealthAlert | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, LAST_HEALTH_ALERT_KEY));
  const v = row?.value as Partial<LastHealthAlert> | undefined;
  if (!v || typeof v.reasonsKey !== "string" || typeof v.sentAt !== "string") return null;
  return { reasonsKey: v.reasonsKey, sentAt: v.sentAt };
}

export async function writeLastHealthAlert(db: Db, value: LastHealthAlert): Promise<void> {
  const now = new Date();
  await db
    .insert(settings)
    .values({ key: LAST_HEALTH_ALERT_KEY, value, updatedAt: now })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now } });
}

/** Stable identity for a set of red reasons (check names, order-independent). */
export function reasonsKeyFor(health: Health): string {
  return health.checks
    .filter((c) => c.status === "red")
    .map((c) => c.name)
    .sort()
    .join("|");
}

export function shouldSendAlert(
  last: LastHealthAlert | null,
  reasonsKey: string,
  now: Date = new Date(),
): boolean {
  if (!last) return true;
  if (last.reasonsKey !== reasonsKey) return true;
  return now.getTime() - new Date(last.sentAt).getTime() >= ALERT_COOLDOWN_MS;
}
