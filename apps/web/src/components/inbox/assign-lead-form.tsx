import { assignUnmatchedThread } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AssignLeadForm({
  threadId,
  searchParams,
  results,
}: {
  threadId: string;
  searchParams: Record<string, string | undefined>;
  results: { id: string; businessName: string; email: string | null; city: string | null }[];
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-warning/40 bg-warning/5 p-3">
      <div className="text-sm font-medium">Unmatched thread — assign to a lead</div>
      <form method="get" action="/inbox" className="flex gap-2">
        {Object.entries(searchParams)
          .filter(([k, v]) => v && k !== "q")
          .map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        <Input
          name="q"
          defaultValue={searchParams.q ?? ""}
          placeholder="Search by business name or email"
          className="h-8 max-w-sm text-xs"
        />
        <Button type="submit" size="sm" variant="outline">
          Search
        </Button>
      </form>
      {searchParams.q && results.length === 0 && (
        <div className="text-xs text-muted-foreground">No leads found.</div>
      )}
      {results.length > 0 && (
        <ul className="flex flex-col divide-y rounded-md border bg-card">
          {results.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
              <span>
                <span className="font-medium">{r.businessName}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {r.email ?? "no email"}
                  {r.city ? ` · ${r.city}` : ""}
                </span>
              </span>
              <form action={assignUnmatchedThread}>
                <input type="hidden" name="threadId" value={threadId} />
                <input type="hidden" name="leadId" value={r.id} />
                <Button type="submit" size="sm">
                  Assign
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
