import { desc, eq } from "drizzle-orm";
import { getDb, leads, threads } from "@outreach/db";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export async function CityThreadsTab({ marketId, slug }: { marketId: string; slug?: string }) {
  const db = await getDb();
  const rows = await db
    .select({
      thread: threads,
      businessName: leads.businessName,
      email: leads.email,
    })
    .from(threads)
    .innerJoin(leads, eq(threads.leadId, leads.id))
    .where(eq(leads.marketId, marketId))
    .orderBy(desc(threads.lastMessageAt))
    .limit(50);

  const inboxHref = slug ? `/inbox?market=${encodeURIComponent(slug)}` : "/inbox";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <Link href={inboxHref} className="text-xs text-primary hover:underline">
          Open in Inbox →
        </Link>
      </div>
      <Table>
        <THead>
          <TR>
            <TH>Business</TH>
            <TH>Subject</TH>
            <TH>Status</TH>
            <TH>Last message</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.thread.id}>
              <TD>
                <Link href={`${inboxHref}${slug ? "&" : "?"}thread=${r.thread.id}`} className="text-primary hover:underline">
                  {r.businessName}
                </Link>
              </TD>
              <TD className="text-xs">{r.thread.subject ?? "—"}</TD>
              <TD>
                <Badge variant="muted">{r.thread.status}</Badge>
              </TD>
              <TD className="text-xs text-muted-foreground">
                {r.thread.lastMessageAt
                  ? new Date(r.thread.lastMessageAt).toLocaleString()
                  : "—"}
              </TD>
            </TR>
          ))}
          {rows.length === 0 && (
            <TR>
              <TD colSpan={4} className="py-8 text-center text-muted-foreground">
                No threads yet for this city.
              </TD>
            </TR>
          )}
        </TBody>
      </Table>
    </div>
  );
}
