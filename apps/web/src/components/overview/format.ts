/**
 * Pure display helpers for the Overview live feed. Kept dependency-free so
 * they can be unit-tested without the Next.js runtime.
 */

const TOOL_LABELS: Record<string, string> = {
  send_reply: "sent reply",
  send_preview: "sent preview",
  send_payment_link: "sent checkout link",
  mark_not_interested: "marked not interested",
  escalate_to_human: "escalated",
};

const AGENT_VERBS: Record<string, string> = {
  reply: "replied to",
  outreach: "emailed",
  discovery: "discovered",
  qualify: "qualified",
  enrich: "enriched",
  sitegen: "generated a site for",
  deploy: "deployed a site for",
  billing: "billed",
  system: "ran",
};

export function formatFeedTime(at: Date | string): string {
  return new Date(at).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatCityTag(city: string | null | undefined, zip: string | null | undefined): string | null {
  const c = city?.trim() || null;
  const z = zip?.trim() || null;
  if (c && z) return `${c} ${z}`;
  return c ?? z;
}

function humanize(value: string): string {
  return value.replace(/_/g, " ");
}

function extraLabel(detail: string | null | undefined, intent: string | null | undefined): string | null {
  const raw = detail || intent;
  if (!raw) return null;
  return TOOL_LABELS[raw] ?? humanize(raw);
}

export function formatActivitySummary(input: {
  agent: string;
  action: string;
  detail?: string | null;
  intent?: string | null;
  businessName?: string | null;
}): string {
  const name = input.businessName?.trim() || null;
  const verb = AGENT_VERBS[input.agent] ?? humanize(input.action);
  const extra = extraLabel(input.detail, input.intent);
  const skipExtra = extra === "sent reply";

  if (name && extra && !skipExtra && extra !== input.action && extra !== humanize(input.action)) {
    return `${verb} ${name} — ${extra}`;
  }
  if (name) return `${verb} ${name}`;
  if (extra) return `${verb} — ${extra}`;
  return verb;
}

export function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}
