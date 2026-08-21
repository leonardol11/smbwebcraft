import { getDb, getSetting, markets } from "@outreach/db";
import { Card } from "@/components/ui/card";
import { InboxFilters } from "@/components/inbox/inbox-filters";
import { ThreadList } from "@/components/inbox/thread-list";
import { ThreadView } from "@/components/inbox/thread-view";
import {
  listInboxThreads,
  loadThreadDetail,
  parseInboxFilters,
  searchLeads,
} from "@/lib/inbox";

export const dynamic = "force-dynamic";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const filters = parseInboxFilters(sp);
  const db = await getDb();

  const [rows, allMarkets, sendingPaused, detail] = await Promise.all([
    listInboxThreads(db, filters),
    db.select({ slug: markets.slug, city: markets.city, state: markets.state }).from(markets),
    getSetting(db, "sending_paused"),
    sp.thread ? loadThreadDetail(db, sp.thread) : Promise.resolve(null),
  ]);

  const leadSearchResults =
    detail?.thread.status === "unmatched" && sp.q
      ? await searchLeads(db, sp.q, filters.market)
      : [];

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">
          Inbox
          <span className="ml-2 text-sm font-normal text-muted-foreground">{rows.length} threads</span>
        </h1>
        <InboxFilters searchParams={sp} markets={allMarkets} />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="min-h-0 overflow-y-auto">
          <ThreadList rows={rows} searchParams={sp} selectedId={sp.thread} />
        </Card>
        <Card className="min-h-0 overflow-hidden p-4">
          {detail ? (
            <ThreadView
              detail={detail}
              sendingPaused={sendingPaused}
              searchParams={sp}
              leadSearchResults={leadSearchResults}
            />
          ) : sp.thread ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Thread not found.</div>
          ) : (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Select a thread to read the transcript.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
