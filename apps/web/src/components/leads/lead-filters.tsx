"use client";

import { useRouter } from "next/navigation";
import { LAST_TOUCH_OPTIONS, LEAD_STATUSES, leadsHref } from "./params";

export function LeadFilters({
  slug,
  searchParams,
}: {
  slug: string;
  searchParams: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const update = (key: string, value: string) => {
    router.push(leadsHref(slug, searchParams, { [key]: value || null, page: null }));
  };

  return (
    <div className="flex flex-wrap gap-2" data-testid="lead-filters">
      <select
        className="h-8 rounded-md border bg-card px-2 text-xs"
        value={searchParams.status ?? ""}
        onChange={(e) => update("status", e.target.value)}
        aria-label="Status"
      >
        <option value="">All statuses</option>
        {LEAD_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select
        className="h-8 rounded-md border bg-card px-2 text-xs"
        value={searchParams.has_email ?? ""}
        onChange={(e) => update("has_email", e.target.value)}
        aria-label="Email"
      >
        <option value="">Email: any</option>
        <option value="1">Has email</option>
        <option value="0">No email</option>
      </select>
      <select
        className="h-8 rounded-md border bg-card px-2 text-xs"
        value={searchParams.no_website ?? ""}
        onChange={(e) => update("no_website", e.target.value)}
        aria-label="Website"
      >
        <option value="">Website: any</option>
        <option value="1">No website</option>
      </select>
      <select
        className="h-8 rounded-md border bg-card px-2 text-xs"
        value={searchParams.last_touch ?? ""}
        onChange={(e) => update("last_touch", e.target.value)}
        aria-label="Last touch"
      >
        <option value="">Last touch: any</option>
        {LAST_TOUCH_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s === "never"
              ? "Never touched"
              : s === "7d"
                ? "Last 7 days"
                : s === "30d"
                  ? "Last 30 days"
                  : "Older than 30 days"}
          </option>
        ))}
      </select>
    </div>
  );
}
