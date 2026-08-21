export const PAGE_SIZE = 50;

export const LEAD_STATUSES = [
  "discovered",
  "qualified",
  "ready",
  "sequenced",
  "replied",
  "interested",
  "customer",
  "skipped",
  "not_interested",
  "suppressed",
] as const;

export type LeadStatusFilter = (typeof LEAD_STATUSES)[number];

export const LAST_TOUCH_OPTIONS = ["never", "7d", "30d", "older"] as const;
export type LastTouchFilter = (typeof LAST_TOUCH_OPTIONS)[number];

export type LeadListFilters = {
  status?: LeadStatusFilter;
  hasEmail?: "0" | "1";
  noWebsite?: "1";
  lastTouch?: LastTouchFilter;
};

function isLeadStatus(value: string | undefined): value is LeadStatusFilter {
  return !!value && (LEAD_STATUSES as readonly string[]).includes(value);
}

function isLastTouch(value: string | undefined): value is LastTouchFilter {
  return !!value && (LAST_TOUCH_OPTIONS as readonly string[]).includes(value);
}

/** Parse composable list filters from city Leads-tab search params. */
export function parseLeadFilters(
  searchParams: Record<string, string | undefined>,
): LeadListFilters {
  const status = isLeadStatus(searchParams.status) ? searchParams.status : undefined;
  const hasEmail =
    searchParams.has_email === "1" || searchParams.has_email === "0"
      ? searchParams.has_email
      : undefined;
  const noWebsite = searchParams.no_website === "1" ? "1" : undefined;
  const lastTouch = isLastTouch(searchParams.last_touch) ? searchParams.last_touch : undefined;
  return { status, hasEmail, noWebsite, lastTouch };
}

export function parsePage(searchParams: Record<string, string | undefined>): number {
  const n = Number(searchParams.page || 1);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/**
 * Build a Leads-tab href, preserving filters. Pass `null` in `updates` to drop a key
 * (used to reset page when a filter changes, and to close the detail drawer).
 */
export function leadsHref(
  slug: string,
  searchParams: Record<string, string | undefined>,
  updates: Record<string, string | null | undefined> = {},
): string {
  const p = new URLSearchParams();
  p.set("tab", "leads");
  const merged: Record<string, string | undefined> = { ...searchParams };
  for (const [k, v] of Object.entries(updates)) {
    if (v === null || v === "") delete merged[k];
    else if (v !== undefined) merged[k] = v;
  }
  for (const [k, v] of Object.entries(merged)) {
    if (v && k !== "tab") p.set(k, v);
  }
  return `/cities/${slug}?${p.toString()}`;
}
