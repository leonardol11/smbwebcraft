// Pure, browser-safe helpers (no db imports) shared by client components.

export const THREAD_STATUS_FILTERS = ["active", "closed", "unmatched", "all"] as const;
export type ThreadStatusFilter = (typeof THREAD_STATUS_FILTERS)[number];

export type InboxFilters = {
  /** Market slug or city name. */
  market?: string;
  status: ThreadStatusFilter;
  needsHuman: boolean;
};

export function parseInboxFilters(
  sp: Record<string, string | undefined>,
): InboxFilters {
  const status = (THREAD_STATUS_FILTERS as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as ThreadStatusFilter)
    : "active";
  return {
    market: sp.market?.trim() || undefined,
    status,
    needsHuman: sp.needs_human === "1",
  };
}

export function inboxHref(
  sp: Record<string, string | undefined>,
  updates: Record<string, string | null | undefined> = {},
): string {
  const merged: Record<string, string | undefined> = { ...sp };
  for (const [k, v] of Object.entries(updates)) {
    if (v === null || v === "") delete merged[k];
    else if (v !== undefined) merged[k] = v;
  }
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
  const qs = p.toString();
  return qs ? `/inbox?${qs}` : "/inbox";
}
