import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { daysPastDue, dealStatusVariant, stripeCustomerUrl, type ClientRow } from "@/lib/clients";
import { ClientRowActions } from "./client-row-actions";

function deployVariant(status: string | null) {
  switch (status) {
    case "live":
      return "success" as const;
    case "building":
    case "deploying":
      return "warning" as const;
    case "failed":
    case "suspended":
      return "destructive" as const;
    default:
      return "muted" as const;
  }
}

export function ClientsTable({ rows }: { rows: ClientRow[] }) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>Business</TH>
          <TH>City</TH>
          <TH>Deal</TH>
          <TH>Site</TH>
          <TH>Deploy</TH>
          <TH>Paid</TH>
          <TH>Past due</TH>
          <TH>Stripe</TH>
          <TH></TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((r) => {
          const days = daysPastDue(r.failedSince);
          return (
            <TR key={r.dealId} data-testid={`client-row-${r.dealId}`}>
              <TD className="font-medium">
                <Link href={`/leads/${r.leadId}`} className="hover:underline">
                  {r.businessName}
                </Link>
              </TD>
              <TD className="text-xs">
                {r.marketSlug ? (
                  <Link href={`/cities/${r.marketSlug}?tab=clients`} className="text-primary hover:underline">
                    {r.city}
                  </Link>
                ) : (
                  (r.city ?? "—")
                )}
              </TD>
              <TD>
                <Badge variant={dealStatusVariant(r.dealStatus)}>{r.dealStatus}</Badge>
              </TD>
              <TD className="text-xs">
                <div className="flex flex-col gap-0.5">
                  {r.liveUrl ? (
                    <a href={r.liveUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                      live
                    </a>
                  ) : (
                    <span className="text-muted-foreground">no live url</span>
                  )}
                  {r.previewUrl && (
                    <a href={r.previewUrl} target="_blank" rel="noreferrer" className="text-muted-foreground hover:underline">
                      preview
                    </a>
                  )}
                </div>
              </TD>
              <TD>
                <Badge variant={deployVariant(r.deployStatus)} title={r.deployError ?? undefined}>
                  {r.deployStatus ?? "none"}
                </Badge>
              </TD>
              <TD className="text-xs text-muted-foreground">
                {r.paidAt ? new Date(r.paidAt).toLocaleDateString() : "—"}
              </TD>
              <TD className="text-xs">
                {days === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span className="text-warning">{days}d</span>
                )}
              </TD>
              <TD className="text-xs">
                {r.stripeCustomerId ? (
                  <a
                    href={stripeCustomerUrl(r.stripeCustomerId)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-primary hover:underline"
                  >
                    {r.stripeCustomerId}
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TD>
              <TD>
                <ClientRowActions
                  leadId={r.leadId}
                  dealId={r.dealId}
                  dealStatus={r.dealStatus}
                  deployStatus={r.deployStatus}
                />
              </TD>
            </TR>
          );
        })}
        {rows.length === 0 && (
          <TR>
            <TD colSpan={9} className="py-8 text-center text-muted-foreground">
              No customers yet.
            </TD>
          </TR>
        )}
      </TBody>
    </Table>
  );
}
