"use client";

import { useRouter } from "next/navigation";
import { inboxHref, THREAD_STATUS_FILTERS } from "@/lib/inbox-filters";

export function InboxFilters({
  searchParams,
  markets,
}: {
  searchParams: Record<string, string | undefined>;
  markets: { slug: string; city: string; state: string }[];
}) {
  const router = useRouter();
  const update = (key: string, value: string) => {
    router.push(inboxHref(searchParams, { [key]: value || null, thread: null, q: null }));
  };
  const needsHuman = searchParams.needs_human === "1";

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="inbox-filters">
      <select
        className="h-8 rounded-md border bg-card px-2 text-xs"
        value={searchParams.market ?? ""}
        onChange={(e) => update("market", e.target.value)}
        aria-label="Market"
      >
        <option value="">All cities</option>
        {markets.map((m) => (
          <option key={m.slug} value={m.slug}>
            {m.city}, {m.state}
          </option>
        ))}
      </select>
      <select
        className="h-8 rounded-md border bg-card px-2 text-xs"
        value={searchParams.status ?? "active"}
        onChange={(e) => update("status", e.target.value)}
        aria-label="Thread status"
      >
        {THREAD_STATUS_FILTERS.map((s) => (
          <option key={s} value={s}>
            {s === "all" ? "All statuses" : s}
          </option>
        ))}
      </select>
      <label className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-xs">
        <input
          type="checkbox"
          checked={needsHuman}
          onChange={(e) => update("needs_human", e.target.checked ? "1" : "")}
        />
        Needs human
      </label>
    </div>
  );
}
