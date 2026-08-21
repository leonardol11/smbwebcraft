import { desc } from "@outreach/db";
import { getDb, suppressions } from "@outreach/db";
import { addSuppression, removeSuppression } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export async function SuppressionList() {
  const db = await getDb();
  const rows = await db.select().from(suppressions).orderBy(desc(suppressions.createdAt)).limit(200);

  return (
    <div className="flex flex-col gap-3">
      <form action={addSuppression} className="flex items-center gap-2">
        <Input name="email" type="email" required placeholder="email@example.com" className="max-w-xs" />
        <Button type="submit" size="sm" variant="outline">
          Suppress
        </Button>
      </form>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No suppressed addresses.</p>
      ) : (
        <Table data-testid="suppression-table">
          <THead>
            <TR>
              <TH>Email</TH>
              <TH>Reason</TH>
              <TH>Added</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="font-mono text-xs">{r.email}</TD>
                <TD>
                  <Badge variant="muted">{r.reason}</Badge>
                </TD>
                <TD className="text-xs text-muted-foreground">{r.createdAt.toISOString().slice(0, 10)}</TD>
                <TD className="text-right">
                  <form action={removeSuppression}>
                    <input type="hidden" name="email" value={r.email} />
                    <Button type="submit" size="sm" variant="ghost">
                      Remove
                    </Button>
                  </form>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <p className="text-xs text-muted-foreground">
        Suppressed addresses are never emailed by the sequence or the reply agent. Showing latest {rows.length}.
      </p>
    </div>
  );
}
